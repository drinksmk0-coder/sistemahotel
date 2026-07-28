import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  useClients,
  useCurrentCompany,
  useExpenses,
  useReservations,
  useSales,
  type Reservation,
} from "@/lib/data";
import { fmtBRL, todayISO } from "@/lib/format";
import { semanticChartColor } from "@/lib/chart-colors";
import {
  expensesTotal,
  inRange,
  isOtaChannel,
  lastMonths,
  normalizeChannel,
  normalizeLabel,
  otaCommissionRate,
  percent,
  periodRange,
  reservationReceived,
  reservationRevenue,
  saleReceived,
  saleRevenue,
  type DashboardPeriod,
} from "@/lib/dashboard-utils";
import {
  AlertBanner,
  ChartHtmlLegend,
  DashboardHeader,
  DashboardTabs,
  FunnelStage,
} from "@/components/DashboardKit";
import { ReceivablesPanel } from "@/components/ReceivablesPanel";
import {
  DashboardDesigner,
  type DashboardWidget,
  type DashboardWidgetSettings,
} from "@/components/DashboardDesigner";

export const Route = createFileRoute("/_authenticated/financeiro")({
  component: Financeiro,
});

type FinancialTab = "pagamento" | "despesa" | "canal";

function Financeiro() {
  const today = todayISO();
  const [period, setPeriod] = useState<DashboardPeriod>("mes");
  const [tab, setTab] = useState<FinancialTab>("pagamento");
  const { data: reservations = [] } = useReservations();
  const { data: sales = [] } = useSales();
  const { data: expenses = [] } = useExpenses();
  const { data: clients = [] } = useClients();
  const currentCompany = useCurrentCompany();
  const range = periodRange(period, today);

  const periodReservations = reservations.filter((reservation) =>
    inRange(reservation.checkin, range),
  );
  const periodSales = sales.filter((sale) => inRange(sale.data, range));
  const periodExpenses = expenses.filter((expense) => inRange(expense.data, range));

  const gross =
    periodReservations.reduce((sum, reservation) => sum + reservationRevenue(reservation), 0) +
    periodSales.reduce((sum, sale) => sum + saleRevenue(sale), 0);
  const received =
    periodReservations.reduce((sum, reservation) => sum + reservationReceived(reservation), 0) +
    periodSales.reduce((sum, sale) => sum + saleReceived(sale), 0);
  const pending = Math.max(0, gross - received);
  const expenseTotal = expensesTotal(periodExpenses);
  const profit = received - expenseTotal;
  const overdueReservations = reservations.filter(
    (reservation) =>
      reservation.status !== "cancelado" &&
      reservation.checkout < today &&
      reservationRevenue(reservation) > reservationReceived(reservation),
  );
  const overdue = overdueReservations.reduce(
    (sum, reservation) => sum + reservationRevenue(reservation) - reservationReceived(reservation),
    0,
  );

  const composition = useMemo(() => {
    if (tab === "despesa")
      return groupValues(
        periodExpenses,
        (expense) => normalizeLabel(expense.categoria),
        (expense) => Number(expense.valor),
      );
    if (tab === "canal")
      return groupValues(
        periodReservations,
        (reservation) => normalizeChannel(reservation.canal),
        reservationRevenue,
      );
    const reservationPayments = groupValues(
      periodReservations,
      (reservation) => normalizeLabel(reservation.pagamento),
      reservationReceived,
    );
    const salePayments = groupValues(
      periodSales,
      (sale) => normalizeLabel(sale.pagamento),
      saleReceived,
    );
    return mergeGroups(reservationPayments, salePayments);
  }, [periodExpenses, periodReservations, periodSales, tab]);

  const channelRows = useMemo(
    () =>
      groupReservations(periodReservations, (reservation) =>
        normalizeChannel(reservation.canal),
      ).map((row) => ({
        name: row.name,
        pago: row.rows.reduce((sum, reservation) => sum + reservationReceived(reservation), 0),
        pendente: row.rows.reduce(
          (sum, reservation) =>
            sum + Math.max(0, reservationRevenue(reservation) - reservationReceived(reservation)),
          0,
        ),
      })),
    [periodReservations],
  );

  const monthly = useMemo(
    () =>
      lastMonths(today).map((month) => {
        const monthReservations = reservations.filter((reservation) =>
          reservation.checkin.startsWith(month.key),
        );
        const monthSales = sales.filter((sale) => sale.data.startsWith(month.key));
        const monthExpenses = expenses.filter((expense) => expense.data.startsWith(month.key));
        const receita =
          monthReservations.reduce(
            (sum, reservation) => sum + reservationReceived(reservation),
            0,
          ) + monthSales.reduce((sum, sale) => sum + saleReceived(sale), 0);
        const despesas = expensesTotal(monthExpenses);
        return { ...month, receita, despesas, lucro: receita - despesas };
      }),
    [expenses, reservations, sales, today],
  );

  const ota = useMemo(() => {
    const otaRevenue = periodReservations
      .filter((reservation) => isOtaChannel(reservation.canal))
      .reduce((sum, reservation) => sum + reservationRevenue(reservation), 0);
    const reservationTotal = periodReservations.reduce(
      (sum, reservation) => sum + reservationRevenue(reservation),
      0,
    );
    const commission = periodReservations.reduce(
      (sum, reservation) =>
        sum + reservationRevenue(reservation) * otaCommissionRate(reservation.canal),
      0,
    );
    return { revenue: otaRevenue, share: percent(otaRevenue, reservationTotal), commission };
  }, [periodReservations]);

  const otaTrend = useMemo(
    () =>
      lastMonths(today).map((month) => {
        const rows = reservations.filter((reservation) =>
          reservation.checkin.startsWith(month.key),
        );
        const total = rows.reduce((sum, reservation) => sum + reservationRevenue(reservation), 0);
        const otaValue = rows
          .filter((reservation) => isOtaChannel(reservation.canal))
          .reduce((sum, reservation) => sum + reservationRevenue(reservation), 0);
        return { ...month, ota: percent(otaValue, total), direto: 100 - percent(otaValue, total) };
      }),
    [reservations, today],
  );

  const recentOta = otaTrend.slice(-3);
  const otaDirection =
    recentOta.length > 1 ? recentOta[recentOta.length - 1].ota - recentOta[0].ota : 0;
  const kpiWidgets: DashboardWidget[] = [
    {
      id: "receita-bruta",
      title: "Receita bruta",
      kind: "kpi",
      render: (settings) => (
        <FunnelStage label={settings.title} value={fmtBRL(gross)} hint="hospedagem + produtos" />
      ),
    },
    {
      id: "recebido",
      title: "Recebido",
      kind: "kpi",
      render: (settings) => (
        <FunnelStage
          label={settings.title}
          value={fmtBRL(received)}
          percentValue={percent(received, gross)}
          tone="sage"
        />
      ),
    },
    {
      id: "a-receber",
      title: "A receber",
      kind: "kpi",
      render: (settings) => (
        <FunnelStage
          label={settings.title}
          value={fmtBRL(pending)}
          percentValue={percent(pending, gross)}
          tone="brass"
        />
      ),
    },
    {
      id: "despesas",
      title: "Despesas",
      kind: "kpi",
      render: (settings) => (
        <FunnelStage
          label={settings.title}
          value={fmtBRL(expenseTotal)}
          percentValue={percent(expenseTotal, received)}
          tone="brick"
        />
      ),
    },
    {
      id: "lucro-liquido",
      title: "Lucro líquido",
      kind: "kpi",
      render: (settings) => (
        <FunnelStage
          label={settings.title}
          value={fmtBRL(profit)}
          percentValue={percent(profit, received)}
          tone={profit >= 0 ? "sage" : "brick"}
        />
      ),
    },
    {
      id: "vencidos",
      title: "Vencidos",
      kind: "kpi",
      render: (settings) => (
        <FunnelStage
          label={settings.title}
          value={fmtBRL(overdue)}
          hint={`${overdueReservations.length} reserva(s)`}
          tone="brick"
        />
      ),
    },
  ];
  const analysisWidgets: DashboardWidget[] = [
    {
      id: "composicao",
      title: `Composição — ${tabLabel(tab)}`,
      kind: "chart",
      defaultColumns: 5,
      defaultHeight: 300,
      defaultColor: "var(--chart-1)",
      chartTypes: ["doughnut", "pie", "bar", "horizontalBar", "line", "area"],
      dataRole: "distribution",
      render: (settings) => <FinancialCompositionChart rows={composition} settings={settings} />,
    },
    {
      id: "canais-pago-pendente",
      title: "Pago x pendente por canal",
      kind: "chart",
      defaultColumns: 7,
      defaultHeight: 300,
      defaultColor: "var(--chart-1)",
      chartTypes: ["horizontalBar", "bar", "line", "area"],
      dataRole: "ranking",
      render: (settings) => (
        <FinancialSeriesChart
          rows={channelRows}
          categoryKey="name"
          series={[
            { key: "pago", label: "Pago", color: settings.color },
            { key: "pendente", label: "Pendente", color: "var(--chart-4)" },
          ]}
          settings={settings}
        />
      ),
    },
    {
      id: "historico-financeiro",
      title: "Receita, despesa e lucro — 12 meses",
      kind: "chart",
      defaultColumns: 12,
      defaultHeight: 340,
      defaultColor: "var(--chart-1)",
      chartTypes: ["line", "area", "bar"],
      render: (settings) => (
        <FinancialSeriesChart
          rows={monthly}
          categoryKey="label"
          series={[
            { key: "receita", label: "Receita", color: settings.color },
            { key: "despesas", label: "Despesas", color: "var(--chart-4)" },
            { key: "lucro", label: "Lucro", color: "var(--chart-3)" },
          ]}
          settings={settings}
        />
      ),
    },
    ...(tab === "canal"
      ? [
          {
            id: "ota-direto",
            title: "% OTA x canais diretos — 12 meses",
            kind: "chart" as const,
            defaultColumns: 7,
            defaultHeight: 300,
            defaultColor: "var(--chart-4)",
            chartTypes: ["line", "area", "bar"] as DashboardWidget["chartTypes"],
            dataRole: "temporal" as const,
            render: (settings: DashboardWidgetSettings) => (
              <FinancialSeriesChart
                rows={otaTrend}
                categoryKey="label"
                series={[
                  { key: "ota", label: "OTAs", color: settings.color },
                  { key: "direto", label: "Diretos", color: "var(--chart-1)" },
                ]}
                settings={settings}
                percentAxis
              />
            ),
          },
          {
            id: "custo-ota",
            title: "Custo da dependência de OTA",
            kind: "content" as const,
            defaultColumns: 5,
            defaultHeight: 300,
            render: (settings: DashboardWidgetSettings) => (
              <section className="card-surface h-full p-4">
                <h2 className="text-xs font-bold uppercase text-pine-dark">{settings.title}</h2>
                <div className="grid h-[calc(100%-2rem)] place-content-center gap-4 text-center">
                  <div>
                    <p className="text-[10px] font-bold uppercase text-muted-foreground">
                      Receita via OTA
                    </p>
                    <p className="font-serif text-2xl font-bold text-pine-dark">
                      {fmtBRL(ota.revenue)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase text-muted-foreground">
                      Comissão perdida
                    </p>
                    <p className="font-serif text-2xl font-bold text-brick">
                      {fmtBRL(ota.commission)}
                    </p>
                  </div>
                </div>
              </section>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-3 pb-6">
      <DashboardHeader
        title="Financeiro"
        subtitle="Recebimentos, custos, lucro e decisões de canal em uma tela."
        period={period}
        onPeriodChange={setPeriod}
      />

      {overdue > 0 && (
        <AlertBanner title={`${fmtBRL(overdue)} vencidos aguardando cobrança`}>
          Existem {overdueReservations.length} checkout(s) com saldo. Use os botões de WhatsApp na
          lista abaixo.
        </AlertBanner>
      )}

      <DashboardDesigner
        companyId={currentCompany.data?.id}
        dashboardId="financeiro-kpis"
        widgets={kpiWidgets}
        title="Personalizar indicadores financeiros"
        description="Mova, redimensione, altere fundo, transparência e destaque de cada cartão"
      />

      <DashboardTabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "pagamento", label: "Por forma de pagamento" },
          { value: "despesa", label: "Por categoria de despesa" },
          { value: "canal", label: "Por canal" },
        ]}
      />

      <DashboardDesigner
        companyId={currentCompany.data?.id}
        dashboardId={`financeiro-analises-${tab}`}
        widgets={analysisWidgets}
        title="Personalizar análises financeiras"
        description="Escolha tipo de gráfico, tamanho, posição, cores, fundo e transparência"
      />

      {tab === "canal" && (
        <>
          <AlertBanner
            title={`${ota.share.toFixed(1)}% da receita de hospedagem vem de OTAs`}
            tone="brass"
          >
            A dependência {otaDirection > 0 ? "subiu" : otaDirection < 0 ? "caiu" : "ficou estável"}{" "}
            {Math.abs(otaDirection).toFixed(1)} ponto(s) nos últimos 3 meses. A comissão estimada no
            período é {fmtBRL(ota.commission)}. Reforce WhatsApp, Instagram e site para hóspedes
            recorrentes.
          </AlertBanner>
        </>
      )}

      <ReceivablesPanel reservations={reservations} clients={clients} sales={sales} />
    </div>
  );
}

function FinancialCompositionChart({
  rows,
  settings,
}: {
  rows: { name: string; value: number }[];
  settings: DashboardWidgetSettings;
}) {
  if (settings.chartType !== "pie" && settings.chartType !== "doughnut") {
    return (
      <FinancialSeriesChart
        rows={rows}
        categoryKey="name"
        series={[{ key: "value", label: "Valor", color: settings.color }]}
        settings={settings}
      />
    );
  }
  const visibleRows = rows.slice(0, 10);
  return (
    <FinancialChartFrame
      settings={settings}
      legendItems={visibleRows.map((row, index) => ({
        label: row.name,
        color: semanticChartColor(row.name, index, settings.color),
      }))}
    >
      <PieChart>
        <Pie
          data={visibleRows}
          dataKey="value"
          nameKey="name"
          innerRadius="52%"
          outerRadius="72%"
          paddingAngle={2}
        >
          {visibleRows.map((row, index) => (
            <Cell
              key={row.name}
              fill={semanticChartColor(row.name, index, settings.color)}
            />
          ))}
        </Pie>
        <Tooltip formatter={(value: number) => fmtBRL(value)} />
      </PieChart>
    </FinancialChartFrame>
  );
}

function FinancialSeriesChart({
  rows,
  categoryKey,
  series,
  settings,
  percentAxis = false,
}: {
  rows: Record<string, string | number>[];
  categoryKey: string;
  series: { key: string; label: string; color: string }[];
  settings: DashboardWidgetSettings;
  percentAxis?: boolean;
}) {
  const tooltipFormatter = (value: number) =>
    percentAxis ? `${Number(value).toFixed(1)}%` : fmtBRL(value);
  const categoryAxisWidth = Math.min(
    180,
    Math.max(
      88,
      rows.reduce(
        (width, row) => Math.max(width, String(row[categoryKey] ?? "").length * 6.2),
        0,
      ),
    ),
  );
  let chart: React.ReactNode;
  if (settings.chartType === "line") {
    chart = (
      <LineChart data={rows} margin={{ left: 8, right: 20, top: 12, bottom: 12 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey={categoryKey} tick={{ fontSize: 9, fill: "var(--foreground)" }} />
        <YAxis domain={percentAxis ? [0, 100] : undefined} tick={{ fontSize: 9, fill: "var(--foreground)" }} />
        <Tooltip formatter={tooltipFormatter} />
        {series.map((item) => (
          <Line
            key={item.key}
            type="monotone"
            dataKey={item.key}
            name={item.label}
            stroke={item.color}
            strokeWidth={2.5}
          />
        ))}
      </LineChart>
    );
  } else if (settings.chartType === "area") {
    chart = (
      <AreaChart data={rows} margin={{ left: 8, right: 20, top: 12, bottom: 12 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey={categoryKey} tick={{ fontSize: 9, fill: "var(--foreground)" }} />
        <YAxis domain={percentAxis ? [0, 100] : undefined} tick={{ fontSize: 9, fill: "var(--foreground)" }} />
        <Tooltip formatter={tooltipFormatter} />
        {series.map((item) => (
          <Area
            key={item.key}
            type="monotone"
            dataKey={item.key}
            name={item.label}
            stroke={item.color}
            fill={item.color}
            fillOpacity={0.16}
          />
        ))}
      </AreaChart>
    );
  } else {
    const horizontal = settings.chartType === "horizontalBar";
    chart = (
      <BarChart
        data={rows}
        layout={horizontal ? "vertical" : "horizontal"}
        margin={horizontal ? { left: 8, right: 24, top: 12, bottom: 12 } : { left: 8, right: 20, top: 12, bottom: 24 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        {horizontal ? (
          <>
            <XAxis
              type="number"
              domain={percentAxis ? [0, 100] : undefined}
              tick={{ fontSize: 9, fill: "var(--foreground)" }}
            />
            <YAxis
              type="category"
              dataKey={categoryKey}
              width={categoryAxisWidth}
              interval={0}
              tick={{ fontSize: 9, fill: "var(--foreground)" }}
            />
          </>
        ) : (
          <>
            <XAxis
              dataKey={categoryKey}
              interval={0}
              tick={{ fontSize: 9, fill: "var(--foreground)" }}
            />
            <YAxis domain={percentAxis ? [0, 100] : undefined} tick={{ fontSize: 9, fill: "var(--foreground)" }} />
          </>
        )}
        <Tooltip formatter={tooltipFormatter} />
        {series.map((item) => (
          <Bar
            key={item.key}
            dataKey={item.key}
            name={item.label}
            fill={item.color}
            radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
          />
        ))}
      </BarChart>
    );
  }
  return (
    <FinancialChartFrame
      settings={settings}
      legendItems={series.map((item) => ({ label: item.label, color: item.color }))}
    >
      {chart}
    </FinancialChartFrame>
  );
}

function FinancialChartFrame({
  settings,
  children,
  legendItems,
}: {
  settings: DashboardWidgetSettings;
  children: React.ReactElement;
  legendItems: { label: string; color: string }[];
}) {
  return (
    <section className="chart-surface flex h-full min-w-0 flex-col overflow-hidden p-3 shadow-sm">
      <div className="mb-1 flex min-w-0 flex-wrap items-start justify-between gap-2">
        <h2 className="min-w-0 truncate text-xs font-bold uppercase text-pine-dark" title={settings.title}>
          {settings.title}
        </h2>
        <ChartHtmlLegend items={legendItems} />
      </div>
      <ResponsiveContainer width="100%" height={Math.max(120, settings.height - 82)}>
        {children}
      </ResponsiveContainer>
    </section>
  );
}

function groupValues<T>(rows: T[], label: (row: T) => string, value: (row: T) => number) {
  const map = new Map<string, number>();
  rows.forEach((row) => {
    const key = label(row);
    map.set(key, (map.get(key) ?? 0) + value(row));
  });
  return [...map].map(([name, amount]) => ({ name, value: amount })).filter((row) => row.value > 0);
}

function mergeGroups(...groups: { name: string; value: number }[][]) {
  const map = new Map<string, number>();
  groups.flat().forEach((row) => map.set(row.name, (map.get(row.name) ?? 0) + row.value));
  return [...map].map(([name, value]) => ({ name, value })).filter((row) => row.value > 0);
}

function groupReservations(rows: Reservation[], group: (reservation: Reservation) => string) {
  const map = new Map<string, Reservation[]>();
  rows.forEach((reservation) => {
    const key = group(reservation);
    map.set(key, [...(map.get(key) ?? []), reservation]);
  });
  return [...map].map(([name, groupedRows]) => ({ name, rows: groupedRows }));
}

function tabLabel(tab: FinancialTab) {
  if (tab === "despesa") return "categorias de despesa";
  if (tab === "canal") return "canais";
  return "formas de pagamento";
}
