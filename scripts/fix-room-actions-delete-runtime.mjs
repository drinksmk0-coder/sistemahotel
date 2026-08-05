import fs from "node:fs";

const mapPath = "src/components/MapaQuartos.tsx";
let map = fs.readFileSync(mapPath, "utf8");

const duplicateSale = `            {stay && (\n              <a\n                className="btn-ghost inline-flex items-center gap-1"\n                href={\`/vendas?quarto=\${room.numero}\`}\n                title={\`Lançar venda para \${stay.cliente_nome} no quarto \${room.numero}\`}\n              >\n                <ShoppingCart className="h-4 w-4" /> Lançar venda\n              </a>\n            )}\n`;
const duplicateEdit = `            {stay && (\n              <a className="btn-ghost" href={\`/reservas?editar=\${stay.id}\`}>Editar hospedagem</a>\n            )}\n`;
map = map.replace(duplicateSale, "").replace(duplicateEdit, "");
fs.writeFileSync(mapPath, map);

const salesPath = "src/routes/_authenticated/vendas.tsx";
let sales = fs.readFileSync(salesPath, "utf8");
const oldButton = `onClick={() => void cancelSaleGroup(g)}`;
const newButton = `onClick={() => { void cancelSaleGroup(g).catch((error) => toast.error(error instanceof Error ? error.message : "Não foi possível excluir a comanda.")); }}`;
if (!sales.includes(oldButton)) throw new Error("Botão de exclusão não encontrado");
sales = sales.replace(oldButton, newButton);
fs.writeFileSync(salesPath, sales);

console.log("Duplicidades removidas e erro de exclusão tratado.");
