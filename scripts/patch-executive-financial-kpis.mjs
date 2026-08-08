import fs from "node:fs";

function patch(path, changes) {
  let source = fs.readFileSync(path, "utf8");
  for (const { before, after, label } of changes) {
    if (source.includes(after)) continue;
    if (!source.includes(before)) {
      console.warn(`[financial-kpis] ${label}: padrão não encontrado; seguindo sem duplicar.`);
      continue;
    }
    source = source.replace(before, after);
  }
  fs.writeFileSync(path, source);
}

patch("src/components/executive/ExecutiveDashboardReference.tsx", [
  {
    label: "grade principal com seis KPIs",
    before: 'className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7"',
    after: 'className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6"',
  },
  {
    label: "RevPAR removido da grade principal para análise conjunta",
    before: '        <Kpi icon={<TrendingUp />} label="RevPAR" value={fmtBRL(current.revpar)} delta={variation(current.revpar, previous.revpar)} tone="purple" />\n',
    after: "",
  },
]);

patch("src/components/executive/ExecutiveRevenueExpenseGopChart.tsx", [
  {
    label: "cards redundantes acima do gráfico financeiro",
    before: `      <div className="mb-2 grid grid-cols-2 gap-1.5 xl:grid-cols-4">\n        <SummaryValue label="Hospedagem" value={summary.lodgingRevenue} tone="blue" />\n        <SummaryValue label="Produtos/serviços" value={summary.productRevenue} tone="teal" />\n        <SummaryValue label="Despesas" value={summary.expenses} tone="red" />\n        <SummaryValue label="GOP" value={summary.gop} tone={summary.gop >= 0 ? "green" : "red"} />\n      </div>\n`,
    after: "",
  },
  {
    label: "despesas operacionais sem retiradas",
    before: `  const filteredExpenses = data.expenses.filter((row) => {\n    if (filters.weekday !== "all" && weekday(row.data) !== filters.weekday) return false;\n    if (filters.payment !== "all" && normalizePayment(row.pagamento) !== filters.payment) return false;\n    return true;\n  });`,
    after: `  const filteredExpenses = data.expenses\n    .filter(isOperatingExpense)\n    .filter((row) => {\n      if (filters.weekday !== "all" && weekday(row.data) !== filters.weekday) return false;\n      if (filters.payment !== "all" && normalizePayment(row.pagamento) !== filters.payment) return false;\n      return true;\n    });`,
  },
  {
    label: "helper de despesa operacional",
    before: `function isMaintenance(value: string | null) { return normalize(value).includes("manut"); }\nfunction normalize(value: string | null | undefined) {`,
    after: `function isMaintenance(value: string | null) { return normalize(value).includes("manut"); }\nfunction isOperatingExpense(row: ExpenseRow) {\n  const text = normalize(\`${'${row.categoria ?? ""} ${row.descricao ?? ""}'}\`);\n  return !text.includes("retirada") && !text.includes("movimentacao financeira");\n}\nfunction normalize(value: string | null | undefined) {`,
  },
]);

console.log("Painel executivo: objetivos removidos, KPIs financeiros agrupados e gráfico sem cards redundantes.");
