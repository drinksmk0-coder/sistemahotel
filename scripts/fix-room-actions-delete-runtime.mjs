import fs from "node:fs";

const mapPath = "src/components/MapaQuartos.tsx";
let map = fs.readFileSync(mapPath, "utf8");

const duplicateSaleStart = `            {stay && (\n              <a\n                className="btn-ghost inline-flex items-center gap-1"\n                href={\`/vendas?quarto=\${room.numero}\`}`;
const duplicateEdit = `            {stay && (\n              <a className="btn-ghost" href={\`/reservas?editar=\${stay.id}\`}>Editar hospedagem</a>\n            )}`;

const saleStart = map.indexOf(duplicateSaleStart);
if (saleStart < 0) throw new Error("Ação antiga de venda não encontrada");
const saleEnd = map.indexOf("            )}", saleStart) + "            )}".length;
map = map.slice(0, saleStart) + map.slice(saleEnd);

const editStart = map.indexOf(duplicateEdit);
if (editStart < 0) throw new Error("Ação duplicada de edição não encontrada");
map = map.slice(0, editStart) + map.slice(editStart + duplicateEdit.length);

const linkedSaleCount = (map.match(/href=\{`\/vendas\?quarto=\$\{room\.numero\}&reserva=\$\{stay\.id\}`\}/g) ?? []).length;
const editCount = (map.match(/href=\{`\/reservas\?editar=\$\{stay\.id\}`\}/g) ?? []).length;
const oldSaleCount = (map.match(/href=\{`\/vendas\?quarto=\$\{room\.numero\}`\}/g) ?? []).length;
if (linkedSaleCount !== 1 || editCount !== 1 || oldSaleCount !== 0) {
  throw new Error(`Validação falhou: venda=${linkedSaleCount}, editar=${editCount}, venda_antiga=${oldSaleCount}`);
}
fs.writeFileSync(mapPath, map);

const salesPath = "src/routes/_authenticated/vendas.tsx";
let sales = fs.readFileSync(salesPath, "utf8");
const start = sales.indexOf("  async function cancelSaleGroup(");
const end = sales.indexOf("\n  async function saveProduct", start);
if (start < 0 || end < 0) throw new Error("Função cancelSaleGroup não encontrada");
const replacement = `  async function cancelSaleGroup(group: { id: string; itens: Sale[]; comprador: string; total: number }) {
    if (!companyId) throw new Error("Empresa não encontrada.");
    const confirmed = window.confirm(
      \`Excluir a comanda de \${group.comprador} no valor de \${fmtBRL(group.total)}? O estoque será devolvido e o histórico ficará preservado como cancelado.\`,
    );
    if (!confirmed) return;

    const { error } = await (supabase as any).rpc("cancel_sale_group", {
      _company_id: companyId,
      _sale_ids: group.itens.map((item) => item.id),
    });
    if (error) throw error;

    await refresh();
    toast.success("Comanda excluída, estoque devolvido e histórico preservado.");
  }
`;
sales = sales.slice(0, start) + replacement + sales.slice(end);
const oldButton = `onClick={() => void cancelSaleGroup(g)}`;
const safeButton = `onClick={() => { void cancelSaleGroup(g).catch((error) => toast.error(error instanceof Error ? error.message : "Não foi possível excluir a comanda.")); }}`;
if (sales.includes(oldButton)) sales = sales.replace(oldButton, safeButton);
if (!sales.includes(safeButton)) throw new Error("Tratamento de erro do botão excluir não encontrado");
fs.writeFileSync(salesPath, sales);

console.log("Ações únicas confirmadas e cancelamento atômico aplicado.");
