import fs from 'node:fs';

const path = 'src/routes/_authenticated/reservas.tsx';
let source = fs.readFileSync(path, 'utf8');

// Remove todas as declarações repetidas e reinsere apenas uma após o estado de busca.
source = source.replace(/^\s*const \[dateFilter, setDateFilter\] = useState\(""\);\s*$/gm, '');
source = source.replace(
  '  const [search, setSearch] = useState("");',
  '  const [search, setSearch] = useState("");\n  const [dateFilter, setDateFilter] = useState("");',
);

// Mantém apenas um bloco lógico de filtro por data.
const dateBlocks = /\n\s*if \(dateFilter\) \{\n\s*filteredRows = filteredRows\.filter\(\n\s*\(reservation\) =>\s*reservation\.checkin <= dateFilter && reservation\.checkout >= dateFilter,?\n\s*\);\n\s*\}\n/g;
let first = true;
source = source.replace(dateBlocks, (match) => {
  if (first) {
    first = false;
    return '\n\n    if (dateFilter) {\n      filteredRows = filteredRows.filter(\n        (reservation) =>\n          reservation.checkin <= dateFilter && reservation.checkout >= dateFilter,\n      );\n    }\n';
  }
  return '\n';
});

// Remove o segundo controle visual duplicado, quando presente.
source = source.replace(
  /\n\s*<div className="flex flex-wrap items-center gap-1 text-xs">\n\s*<label className="flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1">[\s\S]*?\{\["ativas", "saidas", "pendencias", "reservado", "ocupado", "finalizado", "todas"\]\.map/g,
  '\n        <div className="flex flex-wrap gap-1 text-xs">\n          {["ativas", "saidas", "pendencias", "reservado", "ocupado", "finalizado", "todas"].map',
);

fs.writeFileSync(path, source);
console.log('reservas.tsx normalizado');
