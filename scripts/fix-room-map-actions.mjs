import fs from "node:fs";

const path = "src/components/MapaQuartos.tsx";
let source = fs.readFileSync(path, "utf8");

const anchor = `          <div className="flex flex-wrap gap-2">\n            {whatsapp && (`;
const replacement = `          <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap">\n            {stay && (\n              <a\n                className="btn-primary inline-flex min-h-11 items-center justify-center px-4 text-center"\n                href={\`/vendas?quarto=\${room.numero}\`}\n              >\n                Lançar venda\n              </a>\n            )}\n            {stay && (\n              <a\n                className="btn-ghost inline-flex min-h-11 items-center justify-center px-4 text-center"\n                href={\`/reservas?editar=\${stay.id}\`}\n              >\n                Editar hospedagem\n              </a>\n            )}\n            {whatsapp && (`;

if (!source.includes('href={`/vendas?quarto=${room.numero}`}') && source.includes(anchor)) {
  source = source.replace(anchor, replacement);
}

fs.writeFileSync(path, source);
console.log("Ações do quadro de quartos restauradas para desktop e celular.");
