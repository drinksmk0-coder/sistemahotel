import fs from 'node:fs';

const path = 'src/routes/_authenticated/reservas.tsx';
let source = fs.readFileSync(path, 'utf8');

// Mantém apenas uma declaração do estado do filtro por data.
let declarationSeen = false;
source = source.replace(/^\s*const \[dateFilter, setDateFilter\] = useState\(""\);\s*$/gm, (line) => {
  if (declarationSeen) return '';
  declarationSeen = true;
  return line;
});

// Remove o segundo bloco idêntico de filtragem por data.
const filterBlock = `    if (dateFilter) {\n      filteredRows = filteredRows.filter(\n        (reservation) => reservation.checkin <= dateFilter && reservation.checkout >= dateFilter,\n      );\n    }\n`;
const firstFilterIndex = source.indexOf(filterBlock);
if (firstFilterIndex >= 0) {
  const secondFilterIndex = source.indexOf(filterBlock, firstFilterIndex + filterBlock.length);
  if (secondFilterIndex >= 0) {
    source = source.slice(0, secondFilterIndex) + source.slice(secondFilterIndex + filterBlock.length);
  }
}

// Remove o segundo controle visual de data, mantendo o controle compacto principal.
const duplicateUi = `        <div className="flex flex-wrap items-center gap-1 text-xs">\n          <label className="flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1">\n            <span className="font-semibold text-muted-foreground">Na data</span>\n            <input\n              type="date"\n              value={dateFilter}\n              onChange={(event) => setDateFilter(event.target.value)}\n              className="bg-transparent text-xs outline-none"\n            />\n          </label>\n          {dateFilter && (\n            <button type="button" className="rounded-full bg-muted px-2.5 py-1.5 font-semibold" onClick={() => setDateFilter("")}>\n              Limpar data\n            </button>\n          )}\n`;
if (source.includes(duplicateUi)) {
  source = source.replace(duplicateUi, '        <div className="flex flex-wrap gap-1 text-xs">\n');
}

fs.writeFileSync(path, source);
