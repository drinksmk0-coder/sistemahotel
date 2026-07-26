import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useProducts, useSales } from "@/lib/data";
import { fmtBRL, todayISO } from "@/lib/format";
import {
  inRange,
  lastMonths,
  normalizeLabel,
  percent,
  periodRange,
  saleReceived,
  saleRevenue,
  type DashboardPeriod,
} from "@/lib/dashboard-utils";
import {
  AlertBanner,
  ChartPanel,
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
const COLORS = ["var(--pine)", "var(--sage)", "var(--brass)", "var(--brick)", "#6f8f7a"];

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
    const map = new Map<string, { name: string; receita: number; quantidade: number }>();
    periodSales.forEach((sale) => {
      const key = normalizeLabel(sale.item);
      const row = map.get(key) ?? { name: key, receita: 0, quantidade: 0 };
      row.receita += saleRevenue(sale);
      row.quantidade += Number(sale.qtd ?? 0);
      map.set(key, row);
    });
    return [...map.values()].sort((a, b) => b.receita - a.receita).slice(0, 8);
  }, [periodSales]);

  const monthly = useMemo(
    () =>
      lastMonths(today).map((month) => {
        const rows = sales.filter((sale) => sale.data.startsWith(month.key));
        return {
          ...month,
          receita: rows.reduce((sum, sale) => sum + saleRevenue(sale), 0),
          quantidade: rows.reduce((sum, sale) => sum + Number(sale.qtd ?? 0), 0),
        };
      }),
    [sales, today],
  );

  const paymentRows = useMemo(
    () => groupSales(periodSales, (sale) => normalizeLabel(sale.pagamento)),
    [periodSales],
  );
  const employeeRows = useMemo(
    () => groupSales(periodSales, (sale) => shortEmployee(sale.created_by)),
    [periodSales],
  );

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

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <ChartPanel title={`Composição por ${tabLabel(tab)}`} span={6}>
          <ResponsiveContainer width="100%" height={210}>
            <PieChart>
              <Pie data={composition} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={2}>
                {composition.map((row, index) => <Cell key={row.name} fill={COLORS[index % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(value: number) => fmtBRL(value)} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Receita e quantidade por produto" span={6}>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={productComparison} layout="vertical" margin={{ left: 28, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis type="number" tick={{ fontSize: 9 }} />
              <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 9 }} />
              <Tooltip
                formatter={(value: number, name: string) =>
                  name === "Receita" ? fmtBRL(value) : value
                }
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="receita" name="Receita" fill="var(--pine)" radius={[0, 3, 3, 0]} />
              <Bar dataKey="quantidade" name="Quantidade" fill="var(--sage)" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Receita de produtos — 12 meses" span={6}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 9 }} />
              <Tooltip formatter={(value: number) => fmtBRL(value)} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="receita" name="Receita de produtos" fill="var(--pine)" />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Vendas por forma de pagamento" span={6}>
          <DistributionChart rows={paymentRows} />
        </ChartPanel>

        <ChartPanel title="Vendas lançadas por funcionário" span={6}>
          <DistributionChart rows={employeeRows} />
        </ChartPanel>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <ShortList
          title="Produtos com maior receita"
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
      </div>
    </div>
  );
}

function DistributionChart({ rows }: { rows: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={rows} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} label>
          {rows.map((row, index) => (
            <Cell key={row.name} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value: number) => fmtBRL(value)} />
        <Legend wrapperStyle={{ fontSize: 10 }} />
      </PieChart>
    </ResponsiveContainer>
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
