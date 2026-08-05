import fs from "node:fs";

const file = "src/routes/_authenticated/reservas.tsx";
let source = fs.readFileSync(file, "utf8");

const duplicateFilterBlock = `\n    if (dateFilter) {\n      filteredRows = filteredRows.filter(\n        (reservation) =>\n          reservation.checkin <= dateFilter && reservation.checkout >= dateFilter,\n      );\n    }\n`;

const firstFilterIndex = source.indexOf(duplicateFilterBlock);
if (firstFilterIndex !== -1) {
  const secondFilterIndex = source.indexOf(duplicateFilterBlock, firstFilterIndex + duplicateFilterBlock.length);
  if (secondFilterIndex !== -1) {
    source = source.slice(0, secondFilterIndex) + source.slice(secondFilterIndex + duplicateFilterBlock.length);
  }
}

const duplicateDateControl = `        <div className="flex flex-wrap items-center gap-1 text-xs">\n          <label className="flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1">\n            <span className="font-semibold text-muted-foreground">Na data</span>\n            <input\n              type="date"\n              value={dateFilter}\n              onChange={(event) => setDateFilter(event.target.value)}\n              className="bg-transparent text-xs outline-none"\n            />\n          </label>\n          {dateFilter && (\n            <button type="button" className="rounded-full bg-muted px-2.5 py-1.5 font-semibold" onClick={() => setDateFilter("")}>\n              Limpar data\n            </button>\n          )}\n`;

if (source.includes(duplicateDateControl)) {
  source = source.replace(duplicateDateControl, `        <div className="flex flex-wrap items-center gap-1 text-xs">\n`);
}

fs.writeFileSync(file, source);
console.log("Reservas deduplicado com sucesso.");
