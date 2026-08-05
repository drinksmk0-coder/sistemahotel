import fs from 'node:fs';

const reservasPath = 'src/routes/_authenticated/reservas.tsx';
const layoutPath = 'src/components/AppLayout.tsx';
const duplicateDashboardPath = 'src/routes/_authenticated/dashboard-estrategico.tsx';

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`Arquivo não encontrado: ${path}`);
  return fs.readFileSync(path, 'utf8');
}

function write(path, content) {
  fs.writeFileSync(path, content, 'utf8');
}

// 1) Normaliza Reservas: uma declaração, um filtro lógico e um controle visual de data.
let reservas = read(reservasPath);

const declaration = '  const [dateFilter, setDateFilter] = useState("");';
reservas = reservas
  .split('\n')
  .filter((line) => !line.includes('const [dateFilter, setDateFilter]'))
  .join('\n');

const searchAnchor = '  const [search, setSearch] = useState("");';
if (!reservas.includes(searchAnchor)) throw new Error('Âncora de busca não encontrada em Reservas.');
reservas = reservas.replace(searchAnchor, `${searchAnchor}\n${declaration}`);

const duplicatedDateFilter = /\n\s*if \(dateFilter\) \{\n\s*filteredRows = filteredRows\.filter\([\s\S]*?\n\s*\);\n\s*\}\n/g;
reservas = reservas.replace(duplicatedDateFilter, '\n');

const termAnchor = '    const term = search.trim().toLocaleLowerCase("pt-BR");';
const singleFilter = `    if (dateFilter) {\n      filteredRows = filteredRows.filter(\n        (reservation) =>\n          reservation.checkin <= dateFilter && reservation.checkout >= dateFilter,\n      );\n    }\n\n`;
if (!reservas.includes(termAnchor)) throw new Error('Âncora do termo de busca não encontrada.');
reservas = reservas.replace(termAnchor, `${singleFilter}${termAnchor}`);

// Remove controles visuais repetidos e insere apenas um antes dos chips de status.
reservas = reservas.replace(/\n\s*<label className="flex min-w-\[170px\][\s\S]*?<\/label>/g, '');
reservas = reservas.replace(/\n\s*<label className="flex items-center gap-1 rounded-lg[\s\S]*?<\/label>/g, '');
reservas = reservas.replace(/\n\s*\{dateFilter && \([\s\S]*?Limpar data[\s\S]*?\)\}/g, '');

const chipsAnchor = '        <div className="flex flex-wrap gap-1 text-xs">';
const dateControl = `        <label className="flex min-w-[170px] items-center gap-2 rounded-lg border border-border bg-background px-2 text-xs font-semibold text-muted-foreground">\n          <span>Data</span>\n          <input\n            type="date"\n            value={dateFilter}\n            onChange={(event) => setDateFilter(event.target.value)}\n            className="h-8 min-w-0 flex-1 bg-transparent text-foreground outline-none"\n          />\n          {dateFilter && (\n            <button\n              type="button"\n              onClick={() => setDateFilter("")}\n              className="rounded px-1 text-muted-foreground hover:text-foreground"\n              title="Limpar data"\n            >\n              ×\n            </button>\n          )}\n        </label>\n`;
if (reservas.includes(chipsAnchor)) {
  reservas = reservas.replace(chipsAnchor, `${dateControl}${chipsAnchor}`);
}

write(reservasPath, reservas);

// 2) Remove o dashboard estratégico duplicado do menu.
let layout = read(layoutPath);
layout = layout.replace(/\n\s*\{\n\s*to: "\/dashboard-estrategico",[\s\S]*?group: "Inteligência",\n\s*\},/m, '');
layout = layout.replace(/\n\s*TrendingUp,/, '');
write(layoutPath, layout);

// 3) Remove a rota duplicada; o painel oficial permanece em /central-estrategica.
if (fs.existsSync(duplicateDashboardPath)) fs.unlinkSync(duplicateDashboardPath);

console.log('Versão atual consolidada: Reservas normalizadas e dashboard duplicado removido.');
