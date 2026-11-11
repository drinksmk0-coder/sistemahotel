import { november2026Sales as report } from "@/lib/november-sales-2026";

export function NovemberSalesSnapshot() {
  return <section className="my-5 rounded-2xl border border-amber-300 bg-amber-50/60 p-5 text-slate-900">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-bold">Vendas de novembro/2026 · planilha histórica</h2>
      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">01 a 11 de novembro</span>
    </div>
    <p className="mt-1 text-sm text-slate-600">Resumo importado para consulta e conferência, separado das vendas lançadas no PMS. Não é faturamento conciliado nem modifica estoque ou caixa.</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl bg-white p-4"><div className="text-xs text-slate-600">Registros de venda</div><strong className="text-3xl">{report.rows}</strong></div>
      <div className="rounded-xl bg-white p-4"><div className="text-xs text-slate-600">Unidades registradas</div><strong className="text-3xl">{report.units}</strong></div>
      <div className="rounded-xl bg-white p-4"><div className="text-xs text-slate-600">Faturamento validado</div><strong className="text-lg">Não disponível</strong><div className="text-xs text-red-700">49 totais não calculados com confiança na leitura</div></div>
    </div>
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl bg-white p-4"><h3 className="mb-2 font-semibold">Movimento por dia</h3>
        <div className="max-h-60 overflow-auto"><table className="w-full text-sm"><thead><tr className="text-left text-slate-500"><th>Data</th><th>Registros</th><th>Unidades</th></tr></thead>
          <tbody>{report.byDay.map(([day, rows, qty]) => <tr key={day} className="border-t border-slate-100"><td className="py-1.5">{day}</td><td>{rows}</td><td>{qty}</td></tr>)}</tbody></table></div>
      </div>
      <div className="rounded-xl bg-white p-4"><h3 className="mb-2 font-semibold">Produtos vendidos</h3>
        <div className="max-h-60 overflow-auto"><table className="w-full text-sm"><thead><tr className="text-left text-slate-500"><th>Produto</th><th>Unidades</th></tr></thead>
          <tbody>{report.byProduct.map(([name, qty]) => <tr key={name} className="border-t border-slate-100"><td className="py-1.5">{name}</td><td>{qty}</td></tr>)}</tbody></table></div>
      </div>
    </div>
    <div className="mt-3 text-xs text-slate-600">Formas de pagamento (registros): {report.paymentEntries.map(([label, count]) => `${label}: ${count}`).join(" · ")}. Fonte: {report.source}. Valores monetários não exibidos até corrigir e conferir a origem.</div>
  </section>;
}
