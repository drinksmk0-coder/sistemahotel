import fs from "node:fs";

const mapPath = "src/components/MapaQuartos.tsx";
let map = fs.readFileSync(mapPath, "utf8");
const duplicateBlock = `            {stay && (\n              <a\n                className="btn-ghost inline-flex items-center gap-1"\n                href={\`/vendas?quarto=\${room.numero}\`}\n                title={\`Lançar venda para \${stay.cliente_nome} no quarto \${room.numero}\`}\n              >\n                <ShoppingCart className="h-4 w-4" /> Lançar venda\n              </a>\n            )}\n            {stay && (\n              <a className="btn-ghost" href={\`/reservas?editar=\${stay.id}\`}>Editar hospedagem</a>\n            )}\n`;
if (!map.includes(duplicateBlock)) throw new Error("Bloco duplicado não encontrado no mapa");
map = map.replace(duplicateBlock, "");
if ((map.match(/Editar hospedagem/g) ?? []).length !== 1) throw new Error("Editar hospedagem não ficou único");
if ((map.match(/Lançar venda/g) ?? []).length !== 1) throw new Error("Lançar venda não ficou único");
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
fs.writeFileSync(salesPath, sales);

console.log("Ações únicas e cancelamento atômico aplicados.");
