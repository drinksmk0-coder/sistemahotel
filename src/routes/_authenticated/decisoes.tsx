import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  BedDouble,
  DollarSign,
  Expand,
  Goal,
  Lightbulb,
  Settings2,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Legend,
  Line,
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
  useRooms,
  useSales,
  type Client,
  type Expense,
  type Reservation,
  type Sale,
} from "@/lib/data";
import { buildGuestAccount } from "@/lib/guest-account";
import {
  calculateHotelKpis,
  expensesTotal,
  inRange,
  lastMonths,
  normalizeChannel,
  otaCommissionRate,
  percentChange,
  periodRange,
  reservationRevenue,
  saleRevenue,
  type DashboardPeriod,
} from "@/lib/dashboard-utils";
import { fmtBRL, todayISO } from "@/lib/format";
import { DashboardHeader } from "@/components/DashboardKit";
import {
  DashboardDesigner,
  type DashboardWidget,
  type DashboardWidgetSettings,
} from "@/components/DashboardDesigner";

export const Route = createFileRoute("/_authenticated/decisoes")({
  component: Decisoes,
});

type ExecutiveGoals = {
  revenue: number;
  occupancy: number;
  margin: number;
  marketingBudget: number;
};

type RankingRow = {
  name: string;
  value: number;
  secondary?: number;
  hint?: string;
};

const defaultGoals: ExecutiveGoals = {
  revenue: 0,
  occupancy: 0,
  margin: 0,
  marketingBudget: 0,
};

function Decisoes() {
  const today = todayISO();
  const [period, setPeriod] = useState<DashboardPeriod>("mes");
  const [showGoals, setShowGoals] = useState(false);
  const [tvMode, setTvMode] = useState(false);
  const { data: rooms = [] } = useRooms();
  const { data: reservations = [] } = useReservations();
  const { data: sales = [] } = useSales();
  const { data: expenses = [] } = useExpenses();
  const { data: clients = [] } = useClients();
  const currentCompany = useCurrentCompany();
  const [goals, setGoals] = useState<ExecutiveGoals>(() =>
    loadGoals(currentCompany.data?.id),
  );

  const range = periodRange(period, today);
  const previousRange = periodRange(period, today, -1);
  const previousYearRange = periodRange(
    period,
    `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`,
  );
  const kpis = useMemo(
    () => calculateHotelKpis({ rooms, reservations, sales, expenses, range }),
    [expenses, range, reservations, rooms, sales],
  );
  const previousKpis = useMemo(
    () => calculateHotelKpis({ rooms, reservations, sales, expenses, range: previousRange }),
    [expenses, previousRange, reservations, rooms, sales],
  );
  const yearKpis = useMemo(
    () => calculateHotelKpis({ rooms, reservations, sales, expenses, range: previousYearRange }),
    [expenses, previousYearRange, reservations, rooms, sales],
  );
  const periodReservations = reservations.filter(
    (reservation) =>
      reservation.status !== "cancelado" &&
      reservation.checkin <= range.end &&
      reservation.checkout > range.start,
  );
  const periodExpenses = expenses.filter((expense) => inRange(expense.data, range));
  const commission = periodReservations.reduce(
    (sum, reservation) =>
      sum + reservationRevenue(reservation) * otaCommissionRate(reservation.canal),
    0,
  );
  const marketingSpend = periodExpenses
    .filter(isMarketingExpense)
    .reduce((sum, expense) => sum + Number(expense.valor), 0);
  const netRevenue = kpis.totalRevenue - commission - marketingSpend;
  const margin = kpis.totalRevenue
    ? (kpis.grossOperatingProfit / kpis.totalRevenue) * 100
    : 0;
  const totalPending = reservations
    .filter((reservation) => reservation.status !== "cancelado")
    .reduce((sum, reservation) => sum + buildGuestAccount(reservation, sales).balance, 0);
  const overdue = reservations.filter(
    (reservation) =>
      reservation.status !== "cancelado" &&
      reservation.checkout < today &&
      buildGuestAccount(reservation, sales).balance > 0,
  );
  const monthly = useMemo(
    () =>
      lastMonths(today).map((month) => {
        const monthRange = {
          start: `${month.key}-01`,
          end: monthEnd(month.key),
        };
        const monthKpis = calculateHotelKpis({
          rooms,
          reservations,
          sales,
          expenses,
          range: monthRange,
        });
        return {
          name: month.label,
          receita: monthKpis.totalRevenue,
          despesas: monthKpis.operatingExpenses,
          lucro: monthKpis.grossOperatingProfit,
          meta: goals.revenue || undefined,
        };
      }),
    [expenses, goals.revenue, reservations, rooms, sales, today],
  );
  const channelRows = useMemo(
    () => buildChannelRanking(periodReservations, marketingSpend),
    [marketingSpend, periodReservations],
  );
  const roomRows = useMemo(
    () => buildRoomRanking(periodReservations, sales, periodExpenses, rooms),
    [periodExpenses, periodReservations, rooms, sales],
  );
  const cityRows = useMemo(
    () => buildCityRanking(periodReservations, clients),
    [clients, periodReservations],
  );
  const expenseRows = useMemo(
    () => buildExpensePareto(periodExpenses),
    [periodExpenses],
  );
  const heatmap = useMemo(
    () => buildOccupancyHeatmap(reservations, rooms.length, today),
    [reservations, rooms.length, today],
  );
  const marketingReservations = periodReservations.filter((reservation) =>
    isMarketingChannel(reservation.canal),
  );
  const marketingRevenue = marketingReservations.reduce(
    (sum, reservation) => sum + reservationRevenue(reservation),
    0,
  );
  const roas = marketingSpend > 0 ? marketingRevenue / marketingSpend : null;
  const recommendations = buildRecommendations({
    current: kpis,
    previous: previousKpis,
    commission,
    marketingSpend,
    overdue,
    channelRows,
    expenseRows,
  });

  useEffect(() => {
    document.documentElement.dataset.dashboardMode = tvMode ? "tv" : "normal";
    return () => {
      document.documentElement.dataset.dashboardMode = "normal";
    };
  }, [tvMode]);

  function saveGoals(next: ExecutiveGoals) {
    setGoals(next);
    window.localStorage.setItem(goalsKey(currentCompany.data?.id), JSON.stringify(next));
  }

  async function toggleTv() {
    if (!tvMode) {
      await document.documentElement.requestFullscreen?.().catch(() => undefined);
      setTvMode(true);
      return;
    }
    await document.exitFullscreen?.().catch(() => undefined);
    setTvMode(false);
  }

  const widgets: DashboardWidget[] = [
    {
      id: "receita",
      title: "Receita total",
      kind: "kpi",
      defaultColumns: 2,
      render: (settings) => (
        <DecisionKpi
          icon={<DollarSign />}
          title={settings.title}
          value={fmtBRL(kpis.totalRevenue)}
          previous={percentChange(kpis.totalRevenue, previousKpis.totalRevenue)}
          year={percentChange(kpis.totalRevenue, yearKpis.totalRevenue)}
          target={goals.revenue}
          current={kpis.totalRevenue}
        />
      ),
    },
    {
      id: "lucro",
      title: "Lucro operacional",
      kind: "kpi",
      defaultColumns: 2,
      render: (settings) => (
        <DecisionKpi
          icon={<TrendingUp />}
          title={settings.title}
          value={fmtBRL(kpis.grossOperatingProfit)}
          previous={percentChange(
            kpis.grossOperatingProfit,
            previousKpis.grossOperatingProfit,
          )}
          year={percentChange(kpis.grossOperatingProfit, yearKpis.grossOperatingProfit)}
        />
      ),
    },
    {
      id: "margem",
      title: "Margem de lucro",
      kind: "kpi",
      defaultColumns: 2,
      render: (settings) => (
        <DecisionKpi
          icon={<BarChart3 />}
          title={settings.title}
          value={`${margin.toFixed(1)}%`}
          target={goals.margin}
          current={margin}
        />
      ),
    },
    {
      id: "ocupacao",
      title: "Taxa de ocupação",
      kind: "kpi",
      defaultColumns: 2,
      render: (settings) => (
        <DecisionKpi
          icon={<BedDouble />}
          title={settings.title}
          value={`${kpis.occupancyRate.toFixed(1)}%`}
          previous={percentChange(kpis.occupancyRate, previousKpis.occupancyRate)}
          year={percentChange(kpis.occupancyRate, yearKpis.occupancyRate)}
          target={goals.occupancy}
          current={kpis.occupancyRate}
        />
      ),
    },
    {
      id: "receita-liquida",
      title: "Receita líquida",
      kind: "kpi",
      defaultColumns: 2,
      render: (settings) => (
        <DecisionKpi
          icon={<Goal />}
          title={settings.title}
          value={fmtBRL(netRevenue)}
          detail={`${fmtBRL(commission)} comissão · ${fmtBRL(marketingSpend)} marketing`}
        />
      ),
    },
    {
      id: "a-receber",
      title: "Total a receber",
      kind: "kpi",
      defaultColumns: 2,
      render: (settings) => (
        <DecisionKpi
          icon={<AlertTriangle />}
          title={settings.title}
          value={fmtBRL(totalPending)}
          detail={`${overdue.length} conta(s) vencida(s)`}
          lowerIsBetter
        />
      ),
    },
    {
      id: "historia-financeira",
      title: "Receita, despesas, lucro e meta",
      kind: "chart",
      defaultColumns: 8,
      defaultHeight: 330,
      chartTypes: ["composed", "line", "bar"],
      render: (settings) => <FinancialStoryChart rows={monthly} settings={settings} />,
    },
    {
      id: "heatmap",
      title: "Calendário de calor da ocupação",
      kind: "content",
      defaultColumns: 4,
      defaultHeight: 330,
      render: (settings) => (
        <OccupancyHeatmap title={settings.title} rows={heatmap} target={goals.occupancy} />
      ),
    },
    {
      id: "canais",
      title: "Receita líquida por canal",
      kind: "chart",
      defaultColumns: 6,
      defaultHeight: 310,
      chartTypes: ["horizontalBar", "bar"],
      render: (settings) => (
        <RankingChart
          rows={channelRows}
          settings={settings}
          valueLabel="Receita líquida"
          currency
        />
      ),
    },
    {
      id: "quartos",
      title: "Rentabilidade por quarto",
      kind: "chart",
      defaultColumns: 6,
      defaultHeight: 310,
      chartTypes: ["horizontalBar", "bar"],
      render: (settings) => (
        <RankingChart rows={roomRows} settings={settings} valueLabel="Margem" currency />
      ),
    },
    {
      id: "cidades",
      title: "Cidades mais rentáveis",
      kind: "chart",
      defaultColumns: 6,
      defaultHeight: 300,
      chartTypes: ["horizontalBar", "bar"],
      render: (settings) => (
        <RankingChart rows={cityRows} settings={settings} valueLabel="Receita" currency />
      ),
    },
    {
      id: "pareto",
      title: "Despesas que concentram 80% dos custos",
      kind: "chart",
      defaultColumns: 6,
      defaultHeight: 300,
      chartTypes: ["horizontalBar", "bar"],
      render: (settings) => (
        <RankingChart rows={expenseRows} settings={settings} valueLabel="Despesa" currency />
      ),
    },
    {
      id: "marketing",
      title: "Desempenho de marketing",
      kind: "content",
      defaultColumns: 5,
      defaultHeight: 235,
      render: (settings) => (
        <MarketingPanel
          title={settings.title}
          investment={marketingSpend}
          revenue={marketingRevenue}
          reservations={marketingReservations.length}
          roas={roas}
          budget={goals.marketingBudget}
        />
      ),
    },
    {
      id: "recomendacoes",
      title: "Ações recomendadas agora",
      kind: "content",
      defaultColumns: 7,
      defaultHeight: 235,
      render: (settings) => (
        <RecommendationPanel title={settings.title} rows={recommendations} />
      ),
    },
  ];

  return (
    <div className="space-y-3 pb-8">
      <DashboardHeader
        title="Decisões e Oportunidades"
        subtitle="Onde agir para aumentar receita, proteger margem e reduzir custos."
        period={period}
        onPeriodChange={setPeriod}
      />

      <div className="flex flex-wrap justify-end gap-2 no-print">
        <button
          type="button"
          className="btn-ghost flex items-center gap-2 text-xs"
          onClick={() => setShowGoals((value) => !value)}
        >
          <Settings2 className="h-4 w-4" /> Metas
        </button>
        <button
          type="button"
          className="btn-primary flex items-center gap-2 text-xs"
          onClick={toggleTv}
        >
          <Expand className="h-4 w-4" /> {tvMode ? "Sair do modo TV" : "Modo gestor/TV"}
        </button>
      </div>

      {showGoals && <GoalEditor value={goals} onChange={saveGoals} />}

      <DashboardDesigner
        companyId={currentCompany.data?.id}
        dashboardId="decisoes-v6"
        widgets={widgets}
        title="Personalizar decisões e oportunidades"
        description="Arraste, redimensione, altere cores, rótulos, legendas e tipos de gráfico"
      />
    </div>
  );
}

function DecisionKpi({
  icon,
  title,
  value,
  previous,
  year,
  target,
  current,
  detail,
  lowerIsBetter = false,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  previous?: number | null;
  year?: number | null;
  target?: number;
  current?: number;
  detail?: string;
  lowerIsBetter?: boolean;
}) {
  const deltaGood = previous == null ? null : lowerIsBetter ? previous <= 0 : previous >= 0;
  const progress = target ? Math.min(100, Math.max(0, ((current ?? 0) / target) * 100)) : 0;
  return (
    <article className="h-full rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        <span className="text-primary">{icon}</span>
      </div>
      <p className="mt-1 truncate text-xl font-extrabold tracking-tight text-pine-dark">{value}</p>
      {detail && <p className="truncate text-[9px] text-muted-foreground">{detail}</p>}
      {!detail && (
        <div className="mt-1 flex gap-2 text-[9px]">
          {previous != null && (
            <span className={deltaGood ? "text-sage" : "text-brick"}>
              {previous >= 0 ? "▲" : "▼"} {Math.abs(previous).toFixed(1)}% período
            </span>
          )}
          {year != null && (
            <span className="text-muted-foreground">{year >= 0 ? "▲" : "▼"} ano</span>
          )}
        </div>
      )}
      {target ? (
        <div className="mt-2">
          <div className="mb-1 flex justify-between text-[9px] text-muted-foreground">
            <span>Meta {fmtCompact(target)}</span>
            <span>{progress.toFixed(0)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : null}
    </article>
  );
}

function FinancialStoryChart({
  rows,
  settings,
}: {
  rows: Record<string, unknown>[];
  settings: DashboardWidgetSettings;
}) {
  const common = (
    <>
      <CartesianGrid strokeDasharray="3 3" vertical={false} />
      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
      <YAxis tick={{ fontSize: 9 }} tickFormatter={(value) => fmtCompact(Number(value))} />
      <Tooltip formatter={(value) => fmtBRL(Number(value))} />
      {settings.showLegend && <Legend wrapperStyle={{ fontSize: 10 }} />}
    </>
  );
  const labels = (key: string) =>
    settings.showLabels ? (
      <LabelList dataKey={key} position="top" formatter={(value: number) => fmtCompact(value)} />
    ) : null;

  return (
    <section className="h-full rounded-xl border border-border bg-card p-3 shadow-sm">
      <h2 className="text-xs font-bold text-pine-dark">{settings.title}</h2>
      <ResponsiveContainer width="100%" height={Math.max(70, settings.height - 48)}>
        {settings.chartType === "line" ? (
          <ComposedChart data={rows} margin={{ top: 18, right: 12, left: 0 }}>
            {common}
            <Line dataKey="receita" name="Receita" stroke={settings.color} strokeWidth={3}>
              {labels("receita")}
            </Line>
            <Line dataKey="despesas" name="Despesas" stroke="var(--brick)" strokeWidth={2}>
              {labels("despesas")}
            </Line>
            <Line dataKey="lucro" name="Lucro" stroke="var(--sage)" strokeWidth={2}>
              {labels("lucro")}
            </Line>
            <Line dataKey="meta" name="Meta" stroke="var(--chart-3)" strokeDasharray="6 4" />
          </ComposedChart>
        ) : (
          <ComposedChart data={rows} margin={{ top: 18, right: 12, left: 0 }}>
            {common}
            <Bar dataKey="receita" name="Receita" fill={settings.color} radius={[4, 4, 0, 0]}>
              {labels("receita")}
            </Bar>
            <Bar dataKey="despesas" name="Despesas" fill="var(--brick)" radius={[4, 4, 0, 0]}>
              {labels("despesas")}
            </Bar>
            <Line dataKey="lucro" name="Lucro" stroke="var(--sage)" strokeWidth={3}>
              {labels("lucro")}
            </Line>
            <Line dataKey="meta" name="Meta" stroke="var(--chart-3)" strokeDasharray="6 4" />
          </ComposedChart>
        )}
      </ResponsiveContainer>
    </section>
  );
}

function RankingChart({
  rows,
  settings,
  valueLabel,
  currency = false,
}: {
  rows: RankingRow[];
  settings: DashboardWidgetSettings;
  valueLabel: string;
  currency?: boolean;
}) {
  const horizontal = settings.chartType !== "bar";
  return (
    <section className="h-full rounded-xl border border-border bg-card p-3 shadow-sm">
      <h2 className="text-xs font-bold text-pine-dark">{settings.title}</h2>
      <ResponsiveContainer width="100%" height={Math.max(70, settings.height - 48)}>
        <BarChart
          data={rows.slice(0, 8)}
          layout={horizontal ? "vertical" : "horizontal"}
          margin={horizontal ? { left: 88, right: 40, top: 8 } : { left: 0, right: 8, top: 18 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={!horizontal} vertical={horizontal} />
          {horizontal ? (
            <>
              <XAxis type="number" tick={{ fontSize: 9 }} />
              <YAxis type="category" dataKey="name" width={84} tick={{ fontSize: 9 }} />
            </>
          ) : (
            <>
              <XAxis dataKey="name" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 9 }} />
            </>
          )}
          <Tooltip formatter={(value) => (currency ? fmtBRL(Number(value)) : value)} />
          {settings.showLegend && <Legend wrapperStyle={{ fontSize: 10 }} />}
          <Bar dataKey="value" name={valueLabel} fill={settings.color} radius={[4, 4, 4, 4]}>
            {settings.showLabels && (
              <LabelList
                dataKey="value"
                position={horizontal ? "right" : "top"}
                formatter={(value: number) => (currency ? fmtCompact(value) : value)}
              />
            )}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </section>
  );
}

function OccupancyHeatmap({
  title,
  rows,
  target,
}: {
  title: string;
  rows: { date: string; label: string; occupancy: number }[];
  target: number;
}) {
  return (
    <section className="h-full rounded-xl border border-border bg-card p-3 shadow-sm">
      <h2 className="text-xs font-bold text-pine-dark">{title}</h2>
      <p className="text-[10px] text-muted-foreground">Próximos 30 dias · clique visual de demanda</p>
      <div className="mt-3 grid grid-cols-7 gap-1.5">
        {rows.map((row) => (
          <div
            key={row.date}
            className="group relative grid aspect-square place-items-center rounded-md border text-[9px] font-bold"
            style={{
              background: heatColor(row.occupancy),
              color: row.occupancy >= 65 ? "white" : "var(--pine-dark)",
            }}
            title={`${row.date}: ${row.occupancy.toFixed(0)}% ocupado`}
          >
            <span>{row.label}</span>
            <span className="text-[8px] opacity-80">{row.occupancy.toFixed(0)}%</span>
          </div>
        ))}
      </div>
      {target > 0 && (
        <p className="mt-2 text-[10px] text-muted-foreground">Meta configurada: {target}%</p>
      )}
    </section>
  );
}

function MarketingPanel({
  title,
  investment,
  revenue,
  reservations,
  roas,
  budget,
}: {
  title: string;
  investment: number;
  revenue: number;
  reservations: number;
  roas: number | null;
  budget: number;
}) {
  const costPerReservation = reservations ? investment / reservations : 0;
  return (
    <section className="h-full rounded-xl border border-border bg-card p-4 shadow-sm">
      <h2 className="text-xs font-bold text-pine-dark">{title}</h2>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Metric label="Investimento" value={fmtBRL(investment)} />
        <Metric label="Receita atribuída" value={fmtBRL(revenue)} />
        <Metric label="ROAS" value={roas == null ? "Sem base" : `${roas.toFixed(2)}x`} />
        <Metric label="Custo por reserva" value={fmtBRL(costPerReservation)} />
      </div>
      <p className="mt-3 text-[10px] text-muted-foreground">
        Calculado com despesas de marketing/tráfego e reservas de Instagram, Site, Google ou Meta.
        {budget > 0 ? ` Orçamento: ${fmtBRL(budget)}.` : ""}
      </p>
    </section>
  );
}

function RecommendationPanel({ title, rows }: { title: string; rows: string[] }) {
  return (
    <section className="h-full rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Lightbulb className="h-4 w-4 text-primary" />
        <h2 className="text-xs font-bold text-pine-dark">{title}</h2>
      </div>
      <ol className="mt-3 space-y-2">
        {rows.map((row, index) => (
          <li key={row} className="flex gap-2 rounded-lg bg-muted/70 px-3 py-2 text-xs">
            <span className="font-extrabold text-primary">{index + 1}</span>
            <span>{row}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function GoalEditor({
  value,
  onChange,
}: {
  value: ExecutiveGoals;
  onChange: (value: ExecutiveGoals) => void;
}) {
  return (
    <section className="rounded-xl border border-primary/25 bg-primary/5 p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <GoalInput
          label="Meta de receita"
          value={value.revenue}
          onChange={(revenue) => onChange({ ...value, revenue })}
        />
        <GoalInput
          label="Meta de ocupação (%)"
          value={value.occupancy}
          onChange={(occupancy) => onChange({ ...value, occupancy })}
        />
        <GoalInput
          label="Meta de margem (%)"
          value={value.margin}
          onChange={(margin) => onChange({ ...value, margin })}
        />
        <GoalInput
          label="Orçamento de marketing"
          value={value.marketingBudget}
          onChange={(marketingBudget) => onChange({ ...value, marketingBudget })}
        />
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        As metas são salvas para esta empresa. Valor zero significa “meta não definida”.
      </p>
    </section>
  );
}

function GoalInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="text-xs font-bold text-pine-dark">
      {label}
      <input
        type="number"
        min="0"
        step="0.01"
        className="field mt-1"
        value={value}
        onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))}
      />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted p-2">
      <p className="text-[9px] font-bold uppercase text-muted-foreground">{label}</p>
      <p className="text-sm font-extrabold text-pine-dark">{value}</p>
    </div>
  );
}

function buildChannelRanking(reservations: Reservation[], marketingSpend: number): RankingRow[] {
  const grouped = new Map<string, { gross: number; commission: number }>();
  reservations.forEach((reservation) => {
    const name = normalizeChannel(reservation.canal);
    const current = grouped.get(name) ?? { gross: 0, commission: 0 };
    const gross = reservationRevenue(reservation);
    current.gross += gross;
    current.commission += gross * otaCommissionRate(reservation.canal);
    grouped.set(name, current);
  });
  const marketingGross = [...grouped.entries()]
    .filter(([name]) => isMarketingChannel(name))
    .reduce((sum, [, row]) => sum + row.gross, 0);
  return [...grouped.entries()]
    .map(([name, row]) => {
      const allocatedMarketing =
        isMarketingChannel(name) && marketingGross
          ? marketingSpend * (row.gross / marketingGross)
          : 0;
      return {
        name,
        value: row.gross - row.commission - allocatedMarketing,
        secondary: row.gross,
        hint: `Bruta ${fmtBRL(row.gross)} · custos ${fmtBRL(row.commission + allocatedMarketing)}`,
      };
    })
    .sort((a, b) => b.value - a.value);
}

function buildRoomRanking(
  reservations: Reservation[],
  sales: Sale[],
  expenses: Expense[],
  rooms: { numero: number }[],
): RankingRow[] {
  const totalExpense = expensesTotal(expenses);
  const activeRooms = Math.max(1, rooms.length);
  return rooms
    .map((room) => {
      const roomReservations = reservations.filter(
        (reservation) => reservation.quarto === room.numero,
      );
      const lodging = roomReservations.reduce(
        (sum, reservation) => sum + reservationRevenue(reservation),
        0,
      );
      const extras = sales
        .filter(
          (sale) =>
            sale.quarto === room.numero &&
            roomReservations.some((reservation) => reservation.id === sale.reserva_id),
        )
        .reduce((sum, sale) => sum + saleRevenue(sale), 0);
      const estimatedCost = totalExpense / activeRooms;
      return {
        name: `UH ${room.numero}`,
        value: lodging + extras - estimatedCost,
        secondary: lodging + extras,
      };
    })
    .sort((a, b) => b.value - a.value);
}

function buildCityRanking(reservations: Reservation[], clients: Client[]): RankingRow[] {
  const clientById = new Map(clients.map((client) => [client.id, client]));
  const grouped = new Map<string, number>();
  reservations.forEach((reservation) => {
    const client = reservation.cliente_id ? clientById.get(reservation.cliente_id) : undefined;
    const city = [client?.cidade, client?.estado].filter(Boolean).join(" / ") || "Não informado";
    grouped.set(city, (grouped.get(city) ?? 0) + reservationRevenue(reservation));
  });
  return [...grouped.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

function buildExpensePareto(expenses: Expense[]): RankingRow[] {
  const grouped = new Map<string, number>();
  expenses.forEach((expense) =>
    grouped.set(expense.categoria, (grouped.get(expense.categoria) ?? 0) + Number(expense.valor)),
  );
  const sorted = [...grouped.entries()].sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((sum, [, value]) => sum + value, 0);
  let accumulated = 0;
  return sorted.map(([name, value]) => {
    accumulated += value;
    return {
      name,
      value,
      secondary: total ? (accumulated / total) * 100 : 0,
      hint: `${total ? ((accumulated / total) * 100).toFixed(0) : 0}% acumulado`,
    };
  });
}

function buildOccupancyHeatmap(
  reservations: Reservation[],
  roomCount: number,
  today: string,
) {
  return Array.from({ length: 30 }, (_, index) => {
    const date = addDays(today, index);
    const occupied = new Set(
      reservations
        .filter(
          (reservation) =>
            !["cancelado", "manutencao"].includes(reservation.status) &&
            reservation.checkin <= date &&
            reservation.checkout > date,
        )
        .map((reservation) => reservation.quarto),
    ).size;
    return {
      date,
      label: new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", {
        day: "2-digit",
      }),
      occupancy: roomCount ? (occupied / roomCount) * 100 : 0,
    };
  });
}

function buildRecommendations({
  current,
  previous,
  commission,
  marketingSpend,
  overdue,
  channelRows,
  expenseRows,
}: {
  current: ReturnType<typeof calculateHotelKpis>;
  previous: ReturnType<typeof calculateHotelKpis>;
  commission: number;
  marketingSpend: number;
  overdue: Reservation[];
  channelRows: RankingRow[];
  expenseRows: RankingRow[];
}) {
  const rows: string[] = [];
  if (current.occupancyRate >= 80) {
    rows.push("Ocupação acima de 80%: teste aumento de diária entre 8% e 12% nas novas reservas.");
  } else if (current.occupancyRate < 40) {
    rows.push("Ocupação abaixo de 40%: crie oferta direta para os dias mais fracos e clientes recorrentes.");
  }
  if (
    current.totalRevenue > previous.totalRevenue &&
    current.grossOperatingProfit < previous.grossOperatingProfit
  ) {
    rows.push(
      `A receita cresceu, mas o lucro caiu. Investigue ${fmtBRL(commission)} em comissões e ${fmtBRL(marketingSpend)} em marketing.`,
    );
  }
  if (overdue.length) {
    rows.push(`Cobrar imediatamente ${overdue.length} hospedagem(ns) vencida(s) com saldo aberto.`);
  }
  if (channelRows[0]) {
    rows.push(`Priorize ${channelRows[0].name}, canal com melhor receita líquida no período.`);
  }
  if (expenseRows[0]) {
    rows.push(`Revisar ${expenseRows[0].name}, maior concentração de despesas do período.`);
  }
  return rows.slice(0, 5);
}

function isMarketingExpense(expense: Expense) {
  const value = `${expense.categoria} ${expense.descricao}`.toLowerCase();
  return ["marketing", "tráfego", "trafego", "google", "meta", "instagram"].some((term) =>
    value.includes(term),
  );
}

function isMarketingChannel(value?: string | null) {
  const channel = String(value ?? "").toLowerCase();
  return ["instagram", "site", "google", "meta", "facebook"].some((term) =>
    channel.includes(term),
  );
}

function goalsKey(companyId?: string | null) {
  return `hotelreal.executiveGoals.v6.${companyId ?? "default"}`;
}

function loadGoals(companyId?: string | null): ExecutiveGoals {
  if (typeof window === "undefined") return defaultGoals;
  try {
    return { ...defaultGoals, ...JSON.parse(window.localStorage.getItem(goalsKey(companyId)) ?? "{}") };
  } catch {
    return defaultGoals;
  }
}

function monthEnd(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber, 0, 12);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return date.toISOString().slice(0, 10);
}

function fmtCompact(value: number) {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} mi`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)} mil`;
  return value.toFixed(0);
}

function heatColor(value: number) {
  if (value >= 85) return "var(--brick)";
  if (value >= 65) return "var(--chart-3)";
  if (value >= 40) return "var(--primary)";
  if (value > 0) return "var(--sage-bg)";
  return "var(--muted)";
}
