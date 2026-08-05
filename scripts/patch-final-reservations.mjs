import fs from 'node:fs';

const path = 'src/routes/_authenticated/reservas.tsx';
let source = fs.readFileSync(path, 'utf8');

function replaceOnce(before, after, label) {
  if (!source.includes(before)) {
    if (source.includes(after)) return;
    throw new Error(`Não foi possível aplicar patch: ${label}`);
  }
  source = source.replace(before, after);
}

replaceOnce(
  '  const [filter, setFilter] = useState("ativas");\n  const [search, setSearch] = useState("");',
  '  const [filter, setFilter] = useState("ativas");\n  const [search, setSearch] = useState("");\n  const [dateFilter, setDateFilter] = useState("");',
  'estado do filtro de data',
);

replaceOnce(
  '    const term = search.trim().toLocaleLowerCase("pt-BR");\n    if (!term) return filteredRows;',
  '    if (dateFilter) {\n      filteredRows = filteredRows.filter(\n        (reservation) =>\n          reservation.checkin <= dateFilter && reservation.checkout >= dateFilter,\n      );\n    }\n\n    const term = search.trim().toLocaleLowerCase("pt-BR");\n    if (!term) return filteredRows;',
  'regra do filtro de data',
);

replaceOnce(
  '  }, [reservations, sales, filter, search]);',
  '  }, [reservations, sales, filter, search, dateFilter]);',
  'dependências do filtro',
);

replaceOnce(
  '        <div className="flex flex-wrap gap-1 text-xs">\n          {["ativas", "saidas", "pendencias", "reservado", "ocupado", "finalizado", "todas"].map((f) => (',
  '        <div className="flex flex-wrap items-center gap-1 text-xs">\n          <label className="flex items-center gap-1 rounded-full border border-border bg-muted/45 px-2 py-1">\n            <span className="font-semibold text-muted-foreground">Na data</span>\n            <input\n              type="date"\n              value={dateFilter}\n              onChange={(event) => setDateFilter(event.target.value)}\n              className="bg-transparent text-xs font-semibold text-foreground outline-none"\n            />\n          </label>\n          {dateFilter && (\n            <button\n              type="button"\n              onClick={() => setDateFilter("")}\n              className="rounded-full bg-muted px-2.5 py-1.5 font-semibold text-muted-foreground hover:text-foreground"\n            >\n              Limpar data\n            </button>\n          )}\n          {["ativas", "saidas", "pendencias", "reservado", "ocupado", "finalizado", "todas"].map((f) => (',
  'campo visual do filtro de data',
);

fs.writeFileSync(path, source);
console.log('Filtro por data aplicado em Reservas.');
