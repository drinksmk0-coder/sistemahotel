import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useProducts, useSales } from "@/lib/data";
import { fmtBRL, todayISO } from "@/lib/format";
import {
  inRange,
  normalizeLabel,
  percent,
  periodRange,
  saleReceived,
  saleRevenue,
  type DashboardPeriod,
} from "@/lib/dashboard-utils";
import {
  AlertBanner,
  DashboardHeader,
  DashboardTabs,
  FunnelRow,
  FunnelStage,
  ShortList,
} from "@/components/DashboardKit";

export const Route = createFileRoute("/_authenticated/vendas-produtos")({
  component: VendasProdutos,
});

type SalesTab = "produto" | "funcionario" | "pagamento";
function VendasProdutos() {
  const today = todayISO();
  const [period, setPeriod] = useState<DashboardPeriod>("mes");
  const [tab, setTab] = useState<SalesTab>("produto");
  const { data: sales = [] } = useSales();
  const { data: products = [] } = useProducts();
  const range = periodRange(period, today);
  const periodSales = sales.filter((sale) => inRange(sale.data, range));
  const launched = periodSales.reduce((sum, sale) => sum + saleRevenue(sale), 0);
  const received = periodSales.reduce((sum, sale) => sum + saleReceived(sale), 0);
  const pending = Math.max(0, launched - received);
  const ticket = periodSales.length ? launched / periodSales.length : 0;
  const lowStock = products.filter((product) => product.ativo && product.estoque_atual <= product.estoque_minimo);

  const composition = useMemo(() => {
    if (tab === "funcionario") {
      return groupSales(periodSales, (sale) => shortEmployee(sale.created_by));
    }
    if (tab === "pagamento") {
      return groupSales(periodSales, (sale) => normalizeLabel(sale.pagamento));
    }
    return groupSales(periodSales, (sale) => normalizeLabel(sale.item));
  }, [periodSales, tab]);

  const productComparison = useMemo(() => {
    const map = new Map<string, { name: string; quarto: number; avulsa: number }>();
    periodSales.forEach((sale) => {
      const key = normalizeLabel(sale.item);
      const row = map.get(key) ?? { name: key, quarto: 0, avulsa: 0 };
      if (sale.reserva_id || sale.quarto > 0) row.quarto += saleRevenue(sale);
      else row.avulsa += saleRevenue(sale);
      map.set(key, row);
    });
    return [...map.values()].sort((a, b) => b.quarto + b.avulsa - (a.quarto + a.avulsa)).slice(0, 8);
  }, [periodSales]);

  const rooms = useMemo(() => {
    const map = new Map<number, number>();
    periodSales.forEach((sale) => {
      if (sale.quarto > 0) map.set(sale.quarto, (map.get(sale.quarto) ?? 0) + saleRevenue(sale));
    });
    return [...map].map(([room, value]) => ({ room, value })).sort((a, b) => b.value - a.value);
  }, [periodSales]);

  return (
    <div className="space-y-3 pb-6">
      <DashboardHeader
        title="Vendas de Produtos"
        subtitle="Consumo além da diária, pagamentos e estoque que exige ação."
        period={period}
        onPeriodChange={setPeriod}
      />

      {lowStock.length > 0 && (
        <AlertBanner title={`${lowStock.length} produto(s) abaixo do estoque mínimo`} tone="brass">
          Reponha primeiro: {lowStock.slice(0, 4).map((product) => product.nome).join(", ")}.
        </AlertBanner>
      )}

      <FunnelRow>
        <FunnelStage label="Vendas lançadas" value={String(periodSales.length)} hint={fmtBRL(launched)} />
        <FunnelStage label="Vendas pagas" value={fmtBRL(received)} percentValue={percent(received, launched)} tone="sage" />
        <FunnelStage label="Pendente / fiado" value={fmtBRL(pending)} percentValue={percent(pending, launched)} tone="brass" />
        <FunnelStage label="Ticket médio" value={fmtBRL(ticket)} hint="por lançamento" />
        <FunnelStage label="Receita total" value={fmtBRL(launched)} tone="sage" />
        <FunnelStage label="Estoque baixo" value={String(lowStock.length)} hint="itens para repor" tone={lowStock.length ? "brick" : "sage"} />
      </FunnelRow>

      <DashboardTabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "produto", label: "Por produto" },
          { value: "funcionario", label: "Por funcionário" },
          { value: "pagamento", label: "Por forma de pagamento" },
        ]}
      />

      <section className="card-surface overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-bold text-pine-dark">Resumo operacional por produto</h2>
            <p className="text-xs text-muted-foreground">
              Lista objetiva para conferência; análises gráficas ficam no Financeiro e Estratégico.
            </p>
          </div>
          <span className="rounded-full bg-sage-bg px-2.5 py-1 text-[10px] font-bold text-pine">
            {productComparison.length} item(ns)
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/35 text-left text-[10px] uppercase text-muted-foreground">
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3 text-right">Vinculado a quarto</th>
                <th className="px-4 py-3 text-right">Venda avulsa</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {productComparison.length ? (
                productComparison.map((row) => (
                  <tr key={row.name} className="border-b border-border/60 hover:bg-sage-bg/35">
                    <td className="px-4 py-3 font-semibold text-pine-dark">{row.name}</td>
                    <td className="px-4 py-3 text-right">{fmtBRL(row.quarto)}</td>
                    <td className="px-4 py-3 text-right">{fmtBRL(row.avulsa)}</td>
                    <td className="px-4 py-3 text-right font-bold text-pine-dark">
                      {fmtBRL(row.quarto + row.avulsa)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                    Nenhuma venda encontrada no período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-3 xl:grid-cols-3">
        <ShortList
          title={`Destaques por ${tabLabel(tab)}`}
          rows={composition
            .slice()
            .sort((a, b) => b.value - a.value)
            .map((row) => ({ label: row.name, value: fmtBRL(row.value) }))}
        />
        <ShortList
          title="Reposição prioritária"
          rows={lowStock.map((product) => ({
            label: product.nome,
            value: `${product.estoque_atual} un.`,
            hint: `mínimo: ${product.estoque_minimo}`,
            highlight: true,
          }))}
        />
        <ShortList
          title="Quartos com maior consumo"
          rows={rooms.map((row) => ({
            label: `Quarto ${row.room}`,
            value: fmtBRL(row.value),
          }))}
        />
      </div>
    </div>
  );
}

function groupSales(rows: ReturnType<typeof useSales>["data"] extends (infer T)[] | undefined ? T[] : never[], label: (sale: NonNullable<ReturnType<typeof useSales>["data"]>[number]) => string) {
  const map = new Map<string, number>();
  rows.forEach((sale) => {
    const key = label(sale);
    map.set(key, (map.get(key) ?? 0) + saleRevenue(sale));
  });
  return [...map].map(([name, value]) => ({ name, value })).filter((row) => row.value > 0);
}

function shortEmployee(createdBy: string | null) {
  return createdBy ? `Usuário ${createdBy.slice(0, 6)}` : "Não informado";
}

function tabLabel(tab: SalesTab) {
  if (tab === "funcionario") return "funcionário";
  if (tab === "pagamento") return "pagamento";
  return "produto";
}
