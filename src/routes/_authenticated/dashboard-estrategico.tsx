import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  BedDouble,
  DollarSign,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  useClients,
  useExpenses,
  useFeedbacks,
  useReservations,
  useRooms,
  useSales,
  useCurrentCompany,
  type Client,
  type Expense,
  type Feedback,
  type Reservation,
  type Room,
  type Sale,
} from "@/lib/data";
import { fmtBRL, todayISO } from "@/lib/format";
import { ReceivablesPanel } from "@/components/ReceivablesPanel";
import { PeriodSelector } from "@/components/DashboardKit";
import {
  DashboardDesigner,
  type DashboardWidget,
  type DashboardWidgetSettings,
} from "@/components/DashboardDesigner";
import {
  calculateHotelKpis,
  inRange,
  percentChange,
  periodRange,
  reservationOverlapsRange,
  type DashboardPeriod,
} from "@/lib/dashboard-utils";
import { getSystemSettings } from "@/lib/system-settings";

export const Route = createFileRoute("/_authenticated/dashboard-estrategico")({
  component: DashboardEstrategico,
});

type DashboardSection = "geral" | "canais" | "quartos" | "clientes" | "tendencias";

const COLORS = {
  pine: "var(--pine)",
  sage: "var(--sage)",
  brass: "var(--brass)",
  brick: "var(--brick)",
  ink: "var(--pine-dark)",
  teal: "#2f8a72",
};

const CHANNEL_COST: Record<string, number> = {
  booking: 0.13,
  airbnb: 0.03,
  instagram: 0,
  whatsapp: 0,
  direto: 0,
  site: 0,
};

function DashboardEstrategico() {
  const today = todayISO();
  const { data: rooms = [] } = useRooms();
  const { data: reservations = [] } = useReservations();
  const { data: sales = [] } = useSales();
  const { data: expenses = [] } = useExpenses();
  const { data: clients = [] } = useClients();
  const { data: feedbacks = [] } = useFeedbacks();
  const currentCompany = useCurrentCompany();
  const brandSettings = getSystemSettings(currentCompany.data?.id);
  const [section, setSection] = useState<DashboardSection>("geral");
  const [period, setPeriod] = useState<DashboardPeriod>("mes");
  const range = periodRange(period, today);
  const previousRange = periodRange(period, today, -1);
  const previousYearToday = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`;
  const previousYearRange = periodRange(period, previousYearToday);
  const clientById = useMemo(
    () => new Map(clients.map((client) => [client.id, client])),
    [clients],
  );

  const filteredReservations = useMemo(
    () =>
      reservations.filter(
        (reservation) =>
          reservation.status !== "manutencao" && reservationOverlapsRange(reservation, range),
      ),
    [range, reservations],
  );

  const filteredExpenses = useMemo(
    () => expenses.filter((expense) => inRange(expense.data, range)),
    [expenses, range],
  );
  const filteredSales = useMemo(
    () => sales.filter((sale) => inRange(sale.data, range)),
    [range, sales],
  );

  const channelRows = useMemo(
    () => buildChannelRows(filteredReservations, filteredSales, clients, feedbacks),
    [clients, feedbacks, filteredReservations, filteredSales],
  );
  const roomRows = useMemo(
    () => buildRoomRows(filteredReservations, rooms, filteredSales, filteredExpenses),
    [filteredExpenses, filteredReservations, filteredSales, rooms],
  );
  const trends = useMemo(
    () => buildMonthlyStory(reservations, sales, expenses, today.slice(0, 4)),
    [expenses, reservations, sales, today],
  );

  const hotelKpis = useMemo(
    () => calculateHotelKpis({ rooms, reservations, sales, expenses, range }),
    [expenses, range, reservations, rooms, sales],
  );
  const previousHotelKpis = useMemo(
    () => calculateHotelKpis({ rooms, reservations, sales, expenses, range: previousRange }),
    [expenses, previousRange, reservations, rooms, sales],
  );
  const previousYearHotelKpis = useMemo(
    () => calculateHotelKpis({ rooms, reservations, sales, expenses, range: previousYearRange }),
    [expenses, previousYearRange, reservations, rooms, sales],
  );
  const receitaHospedagem = hotelKpis.lodgingRevenue;
  const receitaExtra = hotelKpis.extraRevenue;
  const receita = hotelKpis.totalRevenue;
  const lucro = hotelKpis.grossOperatingProfit;
  const margem = receita > 0 ? Math.round((lucro / receita) * 100) : 0;
  const totalReservas = filteredReservations.filter(
    (reservation) => reservation.status !== "cancelado",
  ).length;
  const uhsDisponiveis = hotelKpis.availableRoomNights;
  const uhsVendidas = hotelKpis.soldRoomNights;
  const taxaOcupacao = hotelKpis.occupancyRate;
  const diariaMedia = hotelKpis.adr;
  const revpar = hotelKpis.revpar;
  const trevpar = hotelKpis.trevpar;
  const goppar = hotelKpis.goppar;
  const clientesPeriodo = uniqueReservationClients(filteredReservations);
  const mediaPorCliente = safeDivide(receita, clientesPeriodo);
  const ocupacao30 = futureOccupancy(filteredReservations, rooms.length, today, 30);
  const forecast = useMemo(
    () => buildForecast(reservations, rooms.length, today),
    [reservations, rooms.length, today],
  );
  const recurring = useMemo(() => recurringByClient(filteredReservations), [filteredReservations]);
  const aReceber = filteredReservations.reduce(
    (sum, reservation) =>
      sum + Math.max(0, Number(reservation.valor_total) - Number(reservation.valor_pago)),
    0,
  );
  const previousReservations = reservations.filter(
    (reservation) =>
      reservation.status !== "manutencao" && reservationOverlapsRange(reservation, previousRange),
  );
  const previousYearReservations = reservations.filter(
    (reservation) =>
      reservation.status !== "manutencao" &&
      reservationOverlapsRange(reservation, previousYearRange),
  );
  const previousClients = uniqueReservationClients(previousReservations);
  const previousYearClients = uniqueReservationClients(previousYearReservations);
  const previousTicket = safeDivide(previousHotelKpis.totalRevenue, previousClients);
  const previousYearTicket = safeDivide(previousYearHotelKpis.totalRevenue, previousYearClients);
  const countryRows = buildCountryRows(filteredReservations, clients, clientById);
  const civilRows = buildProfileDistribution(
    filteredReservations,
    clients,
    clientById,
    "estado_civil",
  );
  const genderRows = buildProfileDistribution(filteredReservations, clients, clientById, "sexo");
  const professionRows = buildProfileDistribution(
    filteredReservations,
    clients,
    clientById,
    "profissao",
  );
  const profileRevenueRows = buildProfileRevenue(filteredReservations, clientById);
  const dashboardWidgets: DashboardWidget[] = [
    {
      id: "reservas",
      title: "Reservas",
      kind: "kpi",
      render: (settings) => (
        <StoryKpi
          icon={<BedDouble />}
          label={settings.title}
          value={String(totalReservas)}
          hint="período filtrado"
          tone="pine"
          previousDelta={percentChange(totalReservas, previousReservations.length)}
          yearDelta={percentChange(totalReservas, previousYearReservations.length)}
        />
      ),
    },
    {
      id: "receita",
      title: "Receita",
      kind: "kpi",
      defaultColor: "var(--chart-2)",
      render: (settings) => (
        <StoryKpi
          icon={<DollarSign />}
          label={settings.title}
          value={fmtBRL(receita)}
          hint="reservas + vendas"
          tone="sage"
          previousDelta={percentChange(receita, previousHotelKpis.totalRevenue)}
          yearDelta={percentChange(receita, previousYearHotelKpis.totalRevenue)}
        />
      ),
    },
    {
      id: "a-receber",
      title: "A receber",
      kind: "kpi",
      defaultColor: "var(--brass)",
      render: (settings) => (
        <StoryKpi
          icon={<DollarSign />}
          label={settings.title}
          value={fmtBRL(aReceber)}
          hint="saldo das reservas"
          tone="brass"
        />
      ),
    },
    {
      id: "ocupacao",
      title: "Ocupação",
      kind: "kpi",
      render: (settings) => (
        <StoryKpi
          icon={<Activity />}
          label={settings.title}
          value={`${taxaOcupacao.toFixed(1)}%`}
          hint={`${uhsVendidas}/${uhsDisponiveis} UHs`}
          tone="pine"
          previousDelta={percentChange(taxaOcupacao, previousHotelKpis.occupancyRate)}
          yearDelta={percentChange(taxaOcupacao, previousYearHotelKpis.occupancyRate)}
        />
      ),
    },
    {
      id: "lucro",
      title: "Lucro",
      kind: "kpi",
      defaultColor: lucro >= 0 ? "var(--chart-2)" : "var(--brick)",
      render: (settings) => (
        <StoryKpi
          icon={<TrendingUp />}
          label={settings.title}
          value={fmtBRL(lucro)}
          hint={`${margem}% de margem`}
          tone={lucro >= 0 ? "sage" : "brick"}
          previousDelta={percentChange(lucro, previousHotelKpis.grossOperatingProfit)}
          yearDelta={percentChange(lucro, previousYearHotelKpis.grossOperatingProfit)}
        />
      ),
    },
    {
      id: "ticket",
      title: "Ticket médio",
      kind: "kpi",
      defaultColor: "var(--chart-2)",
      render: (settings) => (
        <StoryKpi
          icon={<Users />}
          label={settings.title}
          value={fmtBRL(mediaPorCliente)}
          hint={`${clientesPeriodo} cliente(s)`}
          tone="sage"
          previousDelta={percentChange(mediaPorCliente, previousTicket)}
          yearDelta={percentChange(mediaPorCliente, previousYearTicket)}
        />
      ),
    },
    ...[
      {
        id: "to",
        title: "Taxa de Ocupação",
        value: `${taxaOcupacao.toFixed(1)}%`,
        formula: `${uhsVendidas} UHs vendidas / ${uhsDisponiveis} UHs disponíveis`,
        meaning: "Mostra a proporção da capacidade operacional utilizada no período selecionado.",
        strategy: occupancyStrategy(taxaOcupacao),
        tone: "pine" as const,
        previousDelta: percentChange(taxaOcupacao, previousHotelKpis.occupancyRate),
        yearDelta: percentChange(taxaOcupacao, previousYearHotelKpis.occupancyRate),
      },
      {
        id: "adr",
        title: "Diária Média (ADR)",
        value: fmtBRL(diariaMedia),
        formula: `${fmtBRL(receitaHospedagem)} / ${uhsVendidas} UHs vendidas`,
        meaning: "Mostra o preço médio por UH vendida, sem cortesias, uso interno ou manutenção.",
        strategy: adrStrategy(diariaMedia, revpar),
        tone: "sage" as const,
        previousDelta: percentChange(diariaMedia, previousHotelKpis.adr),
        yearDelta: percentChange(diariaMedia, previousYearHotelKpis.adr),
      },
      {
        id: "revpar",
        title: "RevPAR",
        value: fmtBRL(revpar),
        formula: `${fmtBRL(receitaHospedagem)} / ${uhsDisponiveis} UHs disponíveis`,
        meaning:
          "Mede a eficiência comercial considerando todas as UHs disponíveis, vendidas ou não.",
        strategy: revparStrategy(revpar, diariaMedia, taxaOcupacao),
        tone: "brass" as const,
        previousDelta: percentChange(revpar, previousHotelKpis.revpar),
        yearDelta: percentChange(revpar, previousYearHotelKpis.revpar),
      },
      {
        id: "trevpar",
        title: "TRevPAR",
        value: fmtBRL(trevpar),
        formula: `${fmtBRL(receita)} / ${uhsDisponiveis} UHs disponíveis`,
        meaning: "Inclui hospedagem e receitas extras, como consumo, serviços, eventos e day use.",
        strategy: trevparStrategy(receitaExtra, receita),
        tone: "pine" as const,
        previousDelta: percentChange(trevpar, previousHotelKpis.trevpar),
        yearDelta: percentChange(trevpar, previousYearHotelKpis.trevpar),
      },
      {
        id: "goppar",
        title: "GOPPAR",
        value: fmtBRL(goppar),
        formula: `${fmtBRL(lucro)} / ${uhsDisponiveis} UHs disponíveis`,
        meaning: "Mostra o lucro operacional bruto por UH disponível depois das despesas.",
        strategy: gopparStrategy(goppar),
        tone: goppar < 0 ? ("brick" as const) : ("brass" as const),
        previousDelta: percentChange(goppar, previousHotelKpis.goppar),
        yearDelta: percentChange(goppar, previousYearHotelKpis.goppar),
      },
    ].map((metric): DashboardWidget => ({
      id: metric.id,
      title: metric.title,
      kind: "kpi",
      defaultColumns: 2,
      defaultHeight: 145,
      render: (settings) => (
        <HotelMetricCard
          label={settings.title}
          value={metric.value}
          formula={metric.formula}
          meaning={metric.meaning}
          strategy={metric.strategy}
          tone={metric.tone}
          previousDelta={metric.previousDelta}
          yearDelta={metric.yearDelta}
        />
      ),
    })),
  ];
  const generalWidgets: DashboardWidget[] = [
    {
      id: "evolucao-financeira",
      title: "Evolução: receita, despesas e lucro",
      kind: "chart",
      defaultColumns: 12,
      defaultHeight: 360,
      defaultColor: "var(--chart-1)",
      chartTypes: ["composed", "line", "area", "bar"],
      render: (settings) => (
        <EditableStrategicChart
          rows={trends}
          categoryKey="mes"
          series={[
            { key: "receita", label: "Receita", color: settings.color, currency: true },
            { key: "despesa", label: "Despesas", color: "var(--chart-4)", currency: true },
            { key: "lucro", label: "Lucro", color: "var(--chart-3)", currency: true },
          ]}
          settings={settings}
        />
      ),
    },
    {
      id: "origem-receita",
      title: "De onde vem a maior receita",
      kind: "chart",
      defaultColumns: 6,
      defaultHeight: 320,
      defaultColor: "var(--chart-2)",
      chartTypes: ["doughnut", "pie", "bar", "horizontalBar", "radar"],
      render: (settings) => (
        <EditableStrategicChart
          rows={channelRows}
          categoryKey="name"
          series={[{ key: "receita", label: "Receita", color: settings.color, currency: true }]}
          settings={settings}
        />
      ),
    },
    {
      id: "despesas-categoria",
      title: "Despesas por categoria",
      kind: "chart",
      defaultColumns: 6,
      defaultHeight: 320,
      defaultColor: "var(--chart-4)",
      chartTypes: ["horizontalBar", "bar", "doughnut", "pie", "radar"],
      render: (settings) => (
        <EditableStrategicChart
          rows={buildExpenseCategoryRows(filteredExpenses)}
          categoryKey="name"
          series={[{ key: "value", label: "Despesas", color: settings.color, currency: true }]}
          settings={settings}
        />
      ),
    },
    {
      id: "forecast",
      title: "Previsão 30 dias: ocupação e receita",
      kind: "chart",
      defaultColumns: 8,
      defaultHeight: 330,
      defaultColor: "var(--chart-2)",
      chartTypes: ["composed", "line", "area", "bar"],
      render: (settings) => (
        <EditableStrategicChart
          rows={forecast}
          categoryKey="label"
          series={[
            { key: "ocupacao", label: "Ocupação %", color: settings.color },
            { key: "receita", label: "Receita", color: "var(--chart-3)", currency: true },
          ]}
          settings={settings}
        />
      ),
    },
    {
      id: "ocupacao-futura",
      title: "Ocupação futura",
      kind: "chart",
      defaultColumns: 4,
      defaultHeight: 330,
      defaultColor: "var(--chart-2)",
      render: (settings) => <FutureOccupancyGauge settings={settings} value={ocupacao30} />,
    },
  ];
  const clientWidgets: DashboardWidget[] = [
    {
      id: "mapa-hospedes",
      title: "Origem mundial dos hóspedes",
      kind: "chart",
      defaultColumns: 7,
      defaultHeight: 380,
      defaultColor: "var(--chart-1)",
      render: (settings) => <WorldGuestBubbleMap rows={countryRows} settings={settings} />,
    },
    {
      id: "receita-perfil",
      title: "Receita por origem do cliente",
      kind: "chart",
      defaultColumns: 5,
      defaultHeight: 380,
      defaultColor: "var(--chart-3)",
      chartTypes: ["horizontalBar", "bar", "line", "area", "doughnut"],
      render: (settings) => (
        <EditableStrategicChart
          rows={profileRevenueRows}
          categoryKey="name"
          series={[{ key: "value", label: "Receita", color: settings.color, currency: true }]}
          settings={settings}
        />
      ),
    },
    ...[
      { id: "estado-civil", title: "Estado civil", rows: civilRows, color: "var(--chart-2)" },
      { id: "sexo", title: "Sexo", rows: genderRows, color: "var(--chart-3)" },
      { id: "profissao", title: "Profissão", rows: professionRows, color: "var(--chart-5)" },
    ].map((profile): DashboardWidget => ({
      id: profile.id,
      title: profile.title,
      kind: "chart",
      defaultColumns: 4,
      defaultHeight: 300,
      defaultColor: profile.color,
      chartTypes: ["doughnut", "pie", "horizontalBar", "bar", "radar"],
      render: (settings) => (
        <EditableStrategicChart
          rows={profile.rows}
          categoryKey="name"
          series={[{ key: "value", label: "Hóspedes", color: settings.color }]}
          settings={settings}
        />
      ),
    })),
  ];
  const channelWidgets: DashboardWidget[] = [
    {
      id: "receita-custo-canal",
      title: "Receita x custo por canal",
      kind: "chart",
      defaultColumns: 6,
      defaultHeight: 300,
      defaultColor: "var(--chart-1)",
      chartTypes: ["bar", "horizontalBar", "line", "area", "composed"],
      render: (settings) => (
        <EditableStrategicChart
          rows={channelRows}
          categoryKey="name"
          series={[
            { key: "receita", label: "Receita", color: settings.color, currency: true },
            { key: "custo", label: "Comissão/custo", color: "var(--chart-4)", currency: true },
          ]}
          settings={settings}
        />
      ),
    },
    {
      id: "canal-recorrencia",
      title: "Canal x recorrência",
      kind: "chart",
      defaultColumns: 6,
      defaultHeight: 300,
      defaultColor: "var(--chart-2)",
      chartTypes: ["bar", "horizontalBar", "line", "area", "composed", "radar"],
      render: (settings) => (
        <EditableStrategicChart
          rows={channelRows}
          categoryKey="name"
          series={[
            { key: "recorrentes", label: "Recorrentes", color: settings.color },
            { key: "novos", label: "Novos", color: "var(--chart-3)" },
          ]}
          settings={settings}
        />
      ),
    },
  ];
  const trendWidgets: DashboardWidget[] = [
    {
      id: "previsao-30-dias",
      title: "Previsão 30 dias: ocupação e receita",
      kind: "chart",
      defaultColumns: 6,
      defaultHeight: 300,
      defaultColor: "var(--chart-2)",
      chartTypes: ["composed", "line", "area", "bar"],
      render: (settings) => (
        <EditableStrategicChart
          rows={forecast}
          categoryKey="label"
          series={[
            { key: "ocupacao", label: "Ocupação", color: settings.color },
            { key: "receita", label: "Receita", color: "var(--chart-3)", currency: true },
          ]}
          settings={settings}
        />
      ),
    },
    {
      id: "historico-financeiro",
      title: "Receita, despesa e lucro por mês",
      kind: "chart",
      defaultColumns: 6,
      defaultHeight: 300,
      defaultColor: "var(--chart-1)",
      chartTypes: ["line", "area", "bar", "composed"],
      render: (settings) => (
        <EditableStrategicChart
          rows={trends}
          categoryKey="mes"
          series={[
            { key: "receita", label: "Receita", color: settings.color, currency: true },
            { key: "despesa", label: "Despesas", color: "var(--chart-4)", currency: true },
            { key: "lucro", label: "Lucro", color: "var(--chart-3)", currency: true },
          ]}
          settings={settings}
        />
      ),
    },
  ];
  const roomWidgets: DashboardWidget[] = [
    {
      id: "receita-quarto",
      title: "Receita por quarto",
      kind: "chart",
      defaultColumns: 7,
      defaultHeight: 300,
      defaultColor: "var(--chart-1)",
      chartTypes: ["bar", "horizontalBar", "line", "area", "doughnut", "pie", "radar"],
      render: (settings) => (
        <EditableStrategicChart
          rows={roomRows.slice(0, 8)}
          categoryKey="Quarto"
          series={[{ key: "receitaRaw", label: "Receita", color: settings.color, currency: true }]}
          settings={settings}
        />
      ),
    },
    {
      id: "margem-quartos",
      title: "Melhores quartos por margem",
      kind: "content",
      defaultColumns: 5,
      defaultHeight: 300,
      render: (settings) => (
        <TableCard
          title={settings.title}
          rows={roomRows.slice(0, 5)}
          columns={["Quarto", "Tipo", "Receita", "Custo", "Margem"]}
        />
      ),
    },
  ];
  const clientDetailWidgets: DashboardWidget[] = [
    {
      id: "cobrancas-clientes",
      title: "Clientes e cobranças",
      kind: "content",
      defaultColumns: 12,
      defaultHeight: 330,
      render: () => (
        <ReceivablesPanel
          reservations={filteredReservations}
          clients={clients}
          sales={sales}
          compact
        />
      ),
    },
    {
      id: "clientes-recorrentes",
      title: "Clientes recorrentes e empresas",
      kind: "content",
      defaultColumns: 12,
      defaultHeight: 300,
      render: (settings) => (
        <TableCard
          title={settings.title}
          rows={recurring.slice(0, 6)}
          columns={["Cliente", "Reservas", "Receita", "Última", "Status"]}
        />
      ),
    },
  ];
  const insightWidgets: DashboardWidget[] = [
    {
      id: "insight-preco",
      title: "Preço dinâmico",
      kind: "content",
      defaultColumns: 4,
      defaultHeight: 150,
      render: (settings) => (
        <InsightCard title={settings.title} text={pricingInsight(ocupacao30, today)} tone="brass" />
      ),
    },
    {
      id: "insight-custos",
      title: "Custos por quarto",
      kind: "content",
      defaultColumns: 4,
      defaultHeight: 150,
      render: (settings) => (
        <InsightCard title={settings.title} text={costInsight(roomRows)} tone="pine" />
      ),
    },
    {
      id: "insight-pos-estadia",
      title: "Pós-estadia",
      kind: "content",
      defaultColumns: 4,
      defaultHeight: 150,
      render: (settings) => (
        <InsightCard
          title={settings.title}
          text="Após checkout, use o botão de WhatsApp/recibo na reserva para pedir avaliação e oferecer desconto de retorno."
          tone="sage"
        />
      ),
    },
  ];

  return (
    <div className="space-y-3 pb-6">
      <header className="overflow-hidden rounded-lg border border-pine/25 bg-[linear-gradient(120deg,var(--pine-dark),var(--pine)_58%,var(--brass))] px-4 py-3 text-white shadow-sm sm:px-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <img
              src={brandSettings.logo}
              alt={currentCompany.data?.nome ?? "Hotel"}
              className="h-12 w-12 rounded-md bg-white object-contain p-1"
            />
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-brass">
                {currentCompany.data?.nome ?? "Gestão hoteleira"}
              </p>
              <h1 className="truncate font-serif text-xl font-bold sm:text-2xl">
                Dashboard Estratégico
              </h1>
              <p className="mt-0.5 text-xs text-white/80">
                Receita, canais, clientes e operação em uma narrativa de decisão.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PeriodSelector value={period} onChange={setPeriod} />
            <a
              href="/painel"
              className="rounded-md bg-white/12 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20"
            >
              Voltar ao painel
            </a>
          </div>
        </div>
      </header>

      <div className="grid gap-3 xl:grid-cols-[11rem_1fr]">
        <nav className="flex flex-col gap-2">
          {[
            ["geral", "Visão geral"],
            ["canais", "Canais"],
            ["quartos", "Quartos"],
            ["clientes", "Clientes"],
            ["tendencias", "Tendências"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSection(key as DashboardSection)}
              className={`rounded-md border px-3 py-2 text-left text-xs font-bold transition ${
                section === key
                  ? "border-brass bg-brass text-pine-dark"
                  : "border-border bg-card text-pine-dark hover:bg-sage-bg"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        <main className="min-w-0 space-y-3">
          <DashboardDesigner
            companyId={currentCompany.data?.id}
            dashboardId="estrategico-kpis"
            widgets={dashboardWidgets}
            title="Personalizar KPIs estratégicos"
            description="Mova, oculte e escolha o tamanho exato de cada indicador"
          />

          {section === "geral" && (
            <DashboardDesigner
              companyId={currentCompany.data?.id}
              dashboardId="estrategico-geral"
              widgets={generalWidgets}
              title="Personalizar gráficos gerais"
            />
          )}

          {section === "canais" && (
            <DashboardDesigner
              companyId={currentCompany.data?.id}
              dashboardId="estrategico-canais"
              widgets={channelWidgets}
              title="Personalizar análise de canais"
            />
          )}

          {section === "clientes" && (
            <DashboardDesigner
              companyId={currentCompany.data?.id}
              dashboardId="estrategico-clientes"
              widgets={clientWidgets}
              title="Personalizar perfil dos hóspedes"
            />
          )}

          {section === "tendencias" && (
            <DashboardDesigner
              companyId={currentCompany.data?.id}
              dashboardId="estrategico-tendencias"
              widgets={trendWidgets}
              title="Personalizar tendências e previsões"
            />
          )}

          {section === "quartos" && (
            <DashboardDesigner
              companyId={currentCompany.data?.id}
              dashboardId="estrategico-quartos"
              widgets={roomWidgets}
              title="Personalizar desempenho dos quartos"
            />
          )}

          {section === "clientes" && (
            <DashboardDesigner
              companyId={currentCompany.data?.id}
              dashboardId="estrategico-clientes-detalhes"
              widgets={clientDetailWidgets}
              title="Personalizar relacionamento e cobranças"
            />
          )}

          {section === "geral" && (
            <DashboardDesigner
              companyId={currentCompany.data?.id}
              dashboardId="estrategico-insights"
              widgets={insightWidgets}
              title="Personalizar recomendações estratégicas"
            />
          )}

          {section !== "geral" && (
            <div className="rounded-lg border border-brass/35 bg-brass/10 px-3 py-2 text-xs text-pine-dark">
              Foco ativo: <strong>{sectionLabel(section)}</strong>. O seletor Dia/Mês/Ano recalcula
              esta tela.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function StoryKpi({
  icon,
  label,
  value,
  hint,
  tone,
  previousDelta,
  yearDelta,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  tone: "pine" | "sage" | "brass" | "brick";
  previousDelta?: number | null;
  yearDelta?: number | null;
}) {
  const toneClass = {
    pine: "border-t-pine bg-[linear-gradient(180deg,rgba(35,77,56,.10),var(--card)_55%)]",
    sage: "border-t-sage bg-[linear-gradient(180deg,rgba(88,139,105,.12),var(--card)_55%)]",
    brass: "border-t-brass bg-[linear-gradient(180deg,rgba(208,178,91,.18),var(--card)_55%)]",
    brick: "border-t-brick bg-[linear-gradient(180deg,rgba(162,70,45,.12),var(--card)_55%)]",
  }[tone];
  return (
    <div
      className={`min-w-0 rounded-md border border-border border-t-4 p-2 shadow-sm ${toneClass}`}
    >
      <div className="mb-1 flex items-center gap-1.5 text-pine [&>svg]:h-3.5 [&>svg]:w-3.5">
        {icon}
        <span className="truncate text-[10px] font-bold uppercase text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="truncate font-serif text-[clamp(1rem,1.25vw,1.28rem)] font-bold leading-tight text-pine-dark">
        {value}
      </div>
      <p className="truncate text-[10px] text-muted-foreground">{hint}</p>
      {(previousDelta != null || yearDelta != null) && (
        <div className="mt-1 flex flex-wrap gap-1">
          <DeltaPill label="mês ant." value={previousDelta} />
          <DeltaPill label="ano ant." value={yearDelta} />
        </div>
      )}
    </div>
  );
}

function HotelMetricCard({
  label,
  value,
  formula,
  meaning,
  strategy,
  tone,
  previousDelta,
  yearDelta,
}: {
  label: string;
  value: string;
  formula: string;
  meaning: string;
  strategy: string;
  tone: "pine" | "sage" | "brass" | "brick";
  previousDelta?: number | null;
  yearDelta?: number | null;
}) {
  const toneClass = {
    pine: "border-pine/35 bg-pine/5",
    sage: "border-sage/45 bg-sage-bg/55",
    brass: "border-brass/50 bg-brass/10",
    brick: "border-brick/45 bg-brick/10",
  }[tone];

  return (
    <article className={`min-w-0 rounded-lg border px-3 py-2 shadow-sm ${toneClass}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-[10px] font-bold uppercase text-pine-dark">{label}</h2>
          <p className="font-serif text-lg font-bold leading-tight text-pine-dark">{value}</p>
        </div>
        <Activity className="h-4 w-4 shrink-0 text-brass" aria-hidden="true" />
      </div>
      <p className="mt-0.5 truncate text-[10px] text-muted-foreground" title={formula}>
        {formula}
      </p>
      <div className="mt-1 flex flex-wrap gap-1">
        <DeltaPill label="mês ant." value={previousDelta} />
        <DeltaPill label="ano ant." value={yearDelta} />
      </div>
      <details className="mt-1 text-[10px]">
        <summary className="cursor-pointer font-semibold text-pine">Como interpretar</summary>
        <p className="mt-1 leading-relaxed text-muted-foreground">{meaning}</p>
        <p className="mt-1 rounded-md bg-white/65 px-2 py-1.5 leading-relaxed text-pine-dark">
          {strategy}
        </p>
      </details>
    </article>
  );
}

function DeltaPill({ label, value }: { label: string; value?: number | null }) {
  if (value == null || !Number.isFinite(value)) {
    return (
      <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">
        {label}: sem base
      </span>
    );
  }
  const improved = value >= 0;
  const Icon = improved ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-bold ${
        improved ? "bg-sage-bg text-pine" : "bg-brick-bg text-brick"
      }`}
    >
      <Icon className="h-2.5 w-2.5" />
      {Math.abs(value).toFixed(1)}% {label}
    </span>
  );
}

function ChartCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-lg border border-border bg-card p-3 shadow-sm lg:col-span-6">
      <h2 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase text-pine-dark [&>svg]:h-4 [&>svg]:w-4 [&>svg]:text-brass">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function InsightCard({
  title,
  text,
  tone,
}: {
  title: string;
  text: string;
  tone: "pine" | "sage" | "brass";
}) {
  const color =
    tone === "brass"
      ? "border-brass bg-brass/10"
      : tone === "sage"
        ? "border-sage bg-sage-bg/60"
        : "border-pine bg-pine/5";
  return (
    <article className={`rounded-lg border px-3 py-2 ${color}`}>
      <h3 className="text-xs font-bold uppercase text-pine-dark">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</p>
    </article>
  );
}

function TableCard({
  title,
  rows,
  columns,
}: {
  title: string;
  rows: Record<string, unknown>[];
  columns: string[];
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-3 shadow-sm lg:col-span-6">
      <h2 className="mb-2 text-xs font-bold uppercase text-pine-dark">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-xs">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              {columns.map((column) => (
                <th key={column} className="py-2 pr-3 font-semibold">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row, index) => (
                <tr key={index} className="border-b border-border/60">
                  {columns.map((column) => (
                    <td key={column} className="py-2 pr-3">
                      {String(row[column] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="py-3 text-muted-foreground">
                  Sem dados suficientes no filtro atual.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type StrategicSeries = {
  key: string;
  label: string;
  color: string;
  currency?: boolean;
};

function EditableStrategicChart({
  rows,
  categoryKey,
  series,
  settings,
}: {
  rows: Record<string, unknown>[];
  categoryKey: string;
  series: StrategicSeries[];
  settings: DashboardWidgetSettings;
}) {
  const height = Math.max(56, settings.height - 54);
  const formatter = (value: number, name: string) =>
    series.find((item) => item.label === name)?.currency ? fmtBRL(value) : value;
  const common = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
      <Tooltip formatter={formatter} />
      <Legend wrapperStyle={{ fontSize: 10 }} />
    </>
  );
  let chart: React.ReactNode;

  if (settings.chartType === "pie" || settings.chartType === "doughnut") {
    const first = series[0];
    chart = (
      <PieChart>
        <Pie
          data={rows}
          dataKey={first.key}
          nameKey={categoryKey}
          innerRadius={settings.chartType === "doughnut" ? "48%" : 0}
          outerRadius="76%"
        >
          {rows.map((row, index) => (
            <Cell
              key={`${String(row[categoryKey])}-${index}`}
              fill={index === 0 ? first.color : `var(--chart-${(index % 6) + 1})`}
            />
          ))}
        </Pie>
        <Tooltip formatter={formatter} />
        <Legend wrapperStyle={{ fontSize: 10 }} />
      </PieChart>
    );
  } else if (settings.chartType === "radar") {
    chart = (
      <RadarChart data={rows} outerRadius="70%">
        <PolarGrid stroke="var(--border)" />
        <PolarAngleAxis dataKey={categoryKey} tick={{ fontSize: 10 }} />
        <PolarRadiusAxis tick={{ fontSize: 9 }} />
        <Tooltip formatter={formatter} />
        {series.map((item, index) => (
          <Radar
            key={item.key}
            dataKey={item.key}
            name={item.label}
            stroke={item.color}
            fill={item.color}
            fillOpacity={index ? 0.12 : 0.28}
          />
        ))}
      </RadarChart>
    );
  } else if (settings.chartType === "line") {
    chart = (
      <LineChart data={rows} margin={{ left: -4, right: 14 }}>
        {common}
        <XAxis dataKey={categoryKey} tick={{ fontSize: 10 }} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 9 }} />
        {series.map((item) => (
          <Line
            key={item.key}
            type="monotone"
            dataKey={item.key}
            name={item.label}
            stroke={item.color}
            strokeWidth={2.5}
            dot={false}
          />
        ))}
      </LineChart>
    );
  } else if (settings.chartType === "area") {
    chart = (
      <AreaChart data={rows} margin={{ left: -4, right: 14 }}>
        {common}
        <XAxis dataKey={categoryKey} tick={{ fontSize: 10 }} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 9 }} />
        {series.map((item, index) => (
          <Area
            key={item.key}
            type="monotone"
            dataKey={item.key}
            name={item.label}
            stroke={item.color}
            fill={item.color}
            fillOpacity={index ? 0.12 : 0.24}
          />
        ))}
      </AreaChart>
    );
  } else if (settings.chartType === "composed") {
    chart = (
      <ComposedChart data={rows} margin={{ left: -4, right: 14 }}>
        {common}
        <XAxis dataKey={categoryKey} tick={{ fontSize: 10 }} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 9 }} />
        {series.map((item, index) =>
          index === 0 ? (
            <Area
              key={item.key}
              type="monotone"
              dataKey={item.key}
              name={item.label}
              stroke={item.color}
              fill={item.color}
              fillOpacity={0.18}
            />
          ) : (
            <Line
              key={item.key}
              type="monotone"
              dataKey={item.key}
              name={item.label}
              stroke={item.color}
              strokeWidth={2.5}
              dot={false}
            />
          ),
        )}
      </ComposedChart>
    );
  } else {
    const horizontal = settings.chartType === "horizontalBar";
    chart = (
      <BarChart
        data={rows}
        layout={horizontal ? "vertical" : "horizontal"}
        margin={horizontal ? { left: 86, right: 14 } : { left: -4, right: 14 }}
      >
        {common}
        {horizontal ? (
          <>
            <XAxis type="number" tick={{ fontSize: 9 }} />
            <YAxis type="category" dataKey={categoryKey} width={84} tick={{ fontSize: 9 }} />
          </>
        ) : (
          <>
            <XAxis dataKey={categoryKey} tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 9 }} />
          </>
        )}
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
    <section className="h-full min-w-0 rounded-lg border border-border bg-card p-3 shadow-sm">
      <h2 className="mb-2 text-xs font-bold uppercase text-pine-dark">{settings.title}</h2>
      {rows.length ? (
        <ResponsiveContainer width="100%" height={height}>
          {chart}
        </ResponsiveContainer>
      ) : (
        <div className="flex h-[150px] items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
          Os dados aparecerão após a importação.
        </div>
      )}
    </section>
  );
}

function FutureOccupancyGauge({
  settings,
  value,
}: {
  settings: DashboardWidgetSettings;
  value: number;
}) {
  return (
    <section className="h-full rounded-lg border border-border bg-card p-3 shadow-sm">
      <h2 className="text-xs font-bold uppercase text-pine-dark">{settings.title}</h2>
      <ResponsiveContainer width="100%" height={Math.max(56, settings.height - 54)}>
        <RadialBarChart
          innerRadius="68%"
          outerRadius="96%"
          data={[{ name: "Ocupação", value, fill: settings.color }]}
          startAngle={180}
          endAngle={0}
        >
          <RadialBar dataKey="value" cornerRadius={10} background />
          <text
            x="50%"
            y="54%"
            textAnchor="middle"
            className="fill-pine-dark font-serif text-3xl font-bold"
          >
            {value}%
          </text>
          <text x="50%" y="68%" textAnchor="middle" className="fill-muted-foreground text-xs">
            próximos 30 dias
          </text>
        </RadialBarChart>
      </ResponsiveContainer>
    </section>
  );
}

function WorldGuestBubbleMap({
  rows,
  settings,
}: {
  rows: { code: string; name: string; value: number; receita: number }[];
  settings: DashboardWidgetSettings;
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  const height = Math.max(70, settings.height - 66);
  return (
    <section className="h-full rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase text-pine-dark">{settings.title}</h2>
        <span className="text-[10px] text-muted-foreground">Bolha maior = mais hóspedes</span>
      </div>
      <svg
        viewBox="0 0 800 360"
        className="w-full rounded-lg border border-border bg-[linear-gradient(180deg,color-mix(in_srgb,var(--chart-2)_10%,var(--card)),var(--card))]"
        style={{ height }}
        role="img"
        aria-label="Mapa mundial da origem dos hóspedes"
      >
        <g
          fill="color-mix(in srgb, var(--pine) 18%, var(--card))"
          stroke="var(--border)"
          strokeWidth="2"
        >
          <path d="M42 94 L95 55 177 61 222 98 190 132 153 142 131 195 92 174 73 130 Z" />
          <path d="M185 196 L224 206 249 252 236 321 202 286 184 237 Z" />
          <path d="M332 78 L377 54 423 73 449 112 420 132 391 121 367 142 335 121 Z" />
          <path d="M377 143 L430 143 465 185 446 264 408 310 370 246 350 181 Z" />
          <path d="M446 76 L541 49 650 67 724 111 693 149 618 142 581 177 526 153 482 133 Z" />
          <path d="M645 242 L699 225 746 252 724 298 664 303 635 270 Z" />
          <path d="M748 300 L770 307 760 326 741 321 Z" />
        </g>
        {rows.map((row) => {
          const point = WORLD_COUNTRY_POINTS[row.code] ?? WORLD_COUNTRY_POINTS.OTHER;
          const radius = 9 + Math.sqrt(row.value / max) * 23;
          return (
            <g key={row.code}>
              <circle
                cx={point.x}
                cy={point.y}
                r={radius}
                fill={settings.color}
                fillOpacity="0.76"
                stroke="var(--card)"
                strokeWidth="4"
              >
                <title>{`${row.name}: ${row.value} hóspede(s) · ${fmtBRL(row.receita)}`}</title>
              </circle>
              <text
                x={point.x}
                y={point.y + 4}
                textAnchor="middle"
                fill="white"
                fontSize="10"
                fontWeight="700"
              >
                {row.code}
              </text>
            </g>
          );
        })}
      </svg>
    </section>
  );
}

function buildChannelRows(
  reservations: Reservation[],
  sales: Sale[],
  clients: Client[],
  feedbacks: Feedback[],
) {
  const byClient = new Map<string, number>();
  reservations.forEach((reservation) => {
    const clientId = readClientId(reservation);
    if (clientId) byClient.set(clientId, (byClient.get(clientId) ?? 0) + 1);
  });
  const clientType = new Map(
    clients.map((client) => [client.id, normalizeText(String(client.tipo ?? ""))]),
  );
  const map = new Map<
    string,
    {
      name: string;
      receita: number;
      custo: number;
      recorrentes: number;
      novos: number;
      avaliacoes: number[];
    }
  >();
  reservations.forEach((reservation) => {
    if (reservation.status === "cancelado" || reservation.status === "manutencao") return;
    const key = normalizeChannel(readChannel(reservation));
    const row = map.get(key) ?? {
      name: labelize(key),
      receita: 0,
      custo: 0,
      recorrentes: 0,
      novos: 0,
      avaliacoes: [],
    };
    const receita = reservationRevenue(reservation);
    row.receita += receita;
    row.custo += receita * (CHANNEL_COST[key] ?? 0);
    const clientId = readClientId(reservation);
    const fixed = clientId
      ? clientType.get(clientId)?.includes("fix") || clientType.get(clientId)?.includes("empresa")
      : false;
    if (fixed || (clientId && (byClient.get(clientId) ?? 0) > 1)) row.recorrentes += 1;
    else row.novos += 1;
    map.set(key, row);
  });
  sales.forEach((sale) => {
    const key = normalizeChannel(String((sale as { canal?: string | null }).canal ?? "recepcao"));
    const row = map.get(key) ?? {
      name: labelize(key),
      receita: 0,
      custo: 0,
      recorrentes: 0,
      novos: 0,
      avaliacoes: [],
    };
    row.receita += Number(sale.total ?? 0);
    map.set(key, row);
  });
  const ratings = feedbacks.map((feedback) => Number(feedback.nota_geral ?? 0)).filter(Boolean);
  return [...map.values()]
    .map((row) => ({
      ...row,
      avaliacao: row.avaliacoes.length
        ? average(row.avaliacoes)
        : ratings.length
          ? average(ratings)
          : 4.6,
    }))
    .sort((a, b) => b.receita - a.receita);
}

function buildStateRows(
  reservations: Reservation[],
  clients: Client[],
  clientById: Map<string, Client>,
) {
  const map = new Map<string, { uf: string; label: string; value: number; receita: number }>();
  clients.forEach((client) => {
    const uf = normalizeState(String(client.estado ?? ""));
    if (!uf) return;
    const row = map.get(uf) ?? { uf, label: BRAZIL_STATE_NAMES[uf] ?? uf, value: 0, receita: 0 };
    row.value += 1;
    map.set(uf, row);
  });
  reservations.forEach((reservation) => {
    const client = clientById.get(readClientId(reservation) ?? "");
    const uf = normalizeState(String(client?.estado ?? ""));
    if (!uf) return;
    const row = map.get(uf) ?? { uf, label: BRAZIL_STATE_NAMES[uf] ?? uf, value: 0, receita: 0 };
    row.receita += reservationRevenue(reservation);
    map.set(uf, row);
  });
  return [...map.values()]
    .filter((row) => row.value || row.receita)
    .sort((a, b) => b.receita - a.receita);
}

type ProfileField = "estado_civil" | "sexo" | "profissao";

function buildProfileDistribution(
  reservations: Reservation[],
  clients: Client[],
  clientById: Map<string, Client>,
  field: ProfileField,
) {
  const referenced = new Set(
    reservations
      .map((reservation) => readClientId(reservation))
      .filter((id): id is string => Boolean(id)),
  );
  const source = referenced.size
    ? [...referenced]
        .map((id) => clientById.get(id))
        .filter((client): client is Client => Boolean(client))
    : clients;
  const counts = new Map<string, number>();
  source.forEach((client) => {
    const raw = String(client[field] ?? "").trim();
    const label = raw ? labelize(raw) : "Não informado";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });
  return [...counts]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, field === "profissao" ? 8 : 6);
}

function buildCountryRows(
  reservations: Reservation[],
  clients: Client[],
  clientById: Map<string, Client>,
) {
  const rows = new Map<string, { code: string; name: string; value: number; receita: number }>();
  clients.forEach((client) => {
    const country = countryIdentity(client);
    const row = rows.get(country.code) ?? { ...country, value: 0, receita: 0 };
    row.value += 1;
    rows.set(country.code, row);
  });
  reservations.forEach((reservation) => {
    const client = clientById.get(readClientId(reservation) ?? "");
    const country = countryIdentity(client);
    const row = rows.get(country.code) ?? { ...country, value: 0, receita: 0 };
    row.receita += reservationRevenue(reservation);
    if (!client) row.value += 1;
    rows.set(country.code, row);
  });
  return [...rows.values()]
    .filter((row) => row.value || row.receita)
    .sort((a, b) => b.value - a.value);
}

function countryIdentity(client?: Client) {
  const raw = normalizeText(
    String((client as (Client & { pais?: string | null }) | undefined)?.pais ?? ""),
  );
  if (!raw && client?.estado) return { code: "BR", name: "Brasil" };
  const found = COUNTRY_ALIASES.find((country) =>
    country.aliases.some((alias) => raw === alias || raw.includes(alias)),
  );
  if (found) return { code: found.code, name: found.name };
  if (raw) return { code: "OTHER", name: labelize(raw) };
  return { code: "OTHER", name: "Não informado" };
}

function buildProfileRevenue(reservations: Reservation[], clientById: Map<string, Client>) {
  const rows = new Map<string, number>();
  reservations.forEach((reservation) => {
    const client = clientById.get(readClientId(reservation) ?? "");
    const country = countryIdentity(client);
    const label =
      country.code === "BR" && client?.estado
        ? (BRAZIL_STATE_NAMES[normalizeState(client.estado)] ?? client.estado)
        : country.name;
    rows.set(label, (rows.get(label) ?? 0) + reservationRevenue(reservation));
  });
  return [...rows]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
}

function buildExpenseCategoryRows(expenses: Expense[]) {
  const rows = new Map<string, number>();
  expenses.forEach((expense) => {
    const name = String(expense.categoria || "Geral");
    rows.set(name, (rows.get(name) ?? 0) + Number(expense.valor ?? 0));
  });
  return [...rows]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
}

function buildRoomRows(
  reservations: Reservation[],
  rooms: Room[],
  sales: Sale[],
  expenses: Expense[],
) {
  const roomMap = new Map(rooms.map((room) => [room.numero, room]));
  const totalExpenses = expenses.reduce((sum, expense) => sum + Number(expense.valor ?? 0), 0);
  const costPerRoom = rooms.length ? totalExpenses / rooms.length : 0;
  const map = new Map<number, { quarto: number; tipo: string; receita: number; custo: number }>();
  reservations.forEach((reservation) => {
    const room = roomMap.get(reservation.quarto);
    const row = map.get(reservation.quarto) ?? {
      quarto: reservation.quarto,
      tipo: room ? roomLabel(room) : "Quarto",
      receita: 0,
      custo: costPerRoom,
    };
    row.receita += reservationRevenue(reservation);
    map.set(reservation.quarto, row);
  });
  sales.forEach((sale) => {
    if (!sale.quarto) return;
    const room = roomMap.get(sale.quarto);
    const row = map.get(sale.quarto) ?? {
      quarto: sale.quarto,
      tipo: room ? roomLabel(room) : "Quarto",
      receita: 0,
      custo: costPerRoom,
    };
    row.receita += Number(sale.total ?? 0);
    map.set(sale.quarto, row);
  });
  return [...map.values()]
    .map((row) => ({
      Quarto: `Q${row.quarto}`,
      Tipo: row.tipo,
      Receita: fmtBRL(row.receita),
      Custo: fmtBRL(row.custo),
      Margem: fmtBRL(row.receita - row.custo),
      receitaRaw: row.receita,
      custoRaw: row.custo,
      raw: row.receita - row.custo,
    }))
    .sort((a, b) => Number(b.raw) - Number(a.raw));
}

function buildMonthlyStory(
  reservations: Reservation[],
  sales: Sale[],
  expenses: Expense[],
  selectedYear: string,
) {
  const year = selectedYear === "todos" ? todayISO().slice(0, 4) : selectedYear;
  return MONTHS.map((month) => {
    const key = `${year}-${month.value}`;
    const receita =
      reservations
        .filter((reservation) => (reservation.checkin || "").startsWith(key))
        .reduce((sum, reservation) => sum + reservationRevenue(reservation), 0) +
      sales
        .filter((sale) => (sale.data || "").startsWith(key))
        .reduce((sum, sale) => sum + Number(sale.total ?? 0), 0);
    const despesa = expenses
      .filter((expense) => (expense.data || "").startsWith(key))
      .reduce((sum, expense) => sum + Number(expense.valor ?? 0), 0);
    return { mes: month.label.slice(0, 3), receita, despesa, lucro: receita - despesa };
  });
}

function buildForecast(reservations: Reservation[], roomCount: number, today: string) {
  const base = new Date(`${today}T00:00:00`);
  return Array.from({ length: 30 }, (_, index) => {
    const date = new Date(base);
    date.setDate(base.getDate() + index);
    const key = date.toISOString().slice(0, 10);
    const active = reservations.filter(
      (reservation) =>
        reservation.status !== "cancelado" &&
        reservation.checkin <= key &&
        reservation.checkout > key,
    );
    const receita = active.reduce(
      (sum, reservation) => sum + Number(reservation.valor_diaria ?? reservation.valor_total ?? 0),
      0,
    );
    return {
      key,
      label: `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`,
      ocupacao: roomCount ? Math.round((active.length / roomCount) * 100) : 0,
      receita,
    };
  });
}

function recurringByClient(reservations: Reservation[]) {
  const map = new Map<
    string,
    { Cliente: string; Reservas: number; Receita: number; Ultima: string; Status: string }
  >();
  reservations.forEach((reservation) => {
    const clientId = readClientId(reservation) ?? reservationGuestName(reservation);
    const row = map.get(clientId) ?? {
      Cliente: reservationGuestName(reservation),
      Reservas: 0,
      Receita: 0,
      Ultima: "",
      Status: "Novo",
    };
    row.Reservas += 1;
    row.Receita += reservationRevenue(reservation);
    row.Ultima = row.Ultima > reservation.checkout ? row.Ultima : reservation.checkout;
    row.Status = row.Reservas > 1 ? "Recorrente" : "Novo";
    map.set(clientId, row);
  });
  return [...map.values()]
    .filter((row) => row.Reservas > 1)
    .map((row) => ({
      Cliente: row.Cliente,
      Reservas: row.Reservas,
      Receita: fmtBRL(row.Receita),
      Última: formatShortDate(row.Ultima),
      Status: row.Status,
    }))
    .sort((a, b) => Number(b.Reservas) - Number(a.Reservas));
}

function futureOccupancy(
  reservations: Reservation[],
  roomCount: number,
  today: string,
  days: number,
) {
  if (!roomCount) return 0;
  const base = new Date(`${today}T00:00:00`);
  let occupied = 0;
  for (let index = 0; index < days; index++) {
    const date = new Date(base);
    date.setDate(base.getDate() + index);
    const key = date.toISOString().slice(0, 10);
    occupied += reservations.filter(
      (reservation) =>
        reservation.status !== "cancelado" &&
        reservation.checkin <= key &&
        reservation.checkout > key,
    ).length;
  }
  return Math.round((occupied / (roomCount * days)) * 100);
}

function pricingInsight(occupancy: number, today: string) {
  const weekday = new Date(`${today}T00:00:00`).getDay();
  const weekend = weekday === 5 || weekday === 6 || weekday === 0;
  if (occupancy >= 80)
    return "Ocupação futura acima de 80%: segure descontos e teste aumento de 10% a 15% nas novas reservas.";
  if (occupancy <= 15)
    return "Ocupação futura baixa: criar promoção direta no WhatsApp/Instagram e reforçar retorno de clientes fixos.";
  if (weekend)
    return "Fim de semana: priorizar reserva direta e quartos com melhor margem antes de liberar desconto.";
  return "Demanda normal: manter preço base e acompanhar canal com menor comissão.";
}

function costInsight(rows: Record<string, unknown>[]) {
  if (!rows.length)
    return "Sem dados suficientes. Quando houver despesas por categoria e vendas por quarto, este card mostra margem real por quarto.";
  const best = rows[0];
  return `${best.Quarto} está com melhor margem no filtro atual. Use isso para decidir prioridade de venda e ajuste de diária.`;
}

function reservationRevenue(reservation: Reservation) {
  return Number(reservation.valor_pago ?? 0) || Number(reservation.valor_total ?? 0);
}

function uniqueReservationClients(reservations: Reservation[]) {
  const clients = new Set<string>();
  reservations.forEach((reservation) => {
    if (!isPaidSoldReservation(reservation)) return;
    clients.add(readClientId(reservation) ?? reservationGuestName(reservation));
  });
  return clients.size;
}

function isPaidSoldReservation(reservation: Reservation) {
  const status = normalizeText(String(reservation.status ?? ""));
  const revenue = reservationRevenue(reservation);
  if (
    status.includes("cancel") ||
    status.includes("manutencao") ||
    status.includes("cortesia") ||
    status.includes("interno")
  )
    return false;
  return revenue > 0;
}

function safeDivide(value: number, divider: number) {
  return divider > 0 ? value / divider : 0;
}

function occupancyStrategy(value: number) {
  if (value >= 80)
    return "Alta ocupação: reduzir descontos e priorizar canais diretos ou quartos com melhor margem.";
  if (value <= 35)
    return "Ocupação baixa: ativar campanha no WhatsApp, Booking e clientes recorrentes para preencher quartos vazios.";
  return "Ocupação saudável: acompanhar diária média para não vender volume sacrificando preço.";
}

function adrStrategy(adr: number, revpar: number) {
  if (!adr)
    return "Sem diária média ainda: confirme valores de reservas pagas para alimentar a análise.";
  if (revpar < adr * 0.45)
    return "Boa diária, mas baixa ocupação: melhorar distribuição e ofertas sem derrubar demais o preço.";
  return "Preço médio consistente: teste aumento gradual em datas de maior procura.";
}

function revparStrategy(revpar: number, adr: number, occupancy: number) {
  if (!revpar) return "RevPAR zerado: ainda faltam reservas pagas no período selecionado.";
  if (occupancy < 45)
    return "RevPAR pressionado por ocupação: foque em volume e canais com menor comissão.";
  if (adr && revpar > adr * 0.7)
    return "RevPAR forte: preservar tarifa e controlar overbooking/cancelamentos.";
  return "Use o RevPAR para comparar meses: ele mostra se preço e ocupação estão trabalhando juntos.";
}

function trevparStrategy(extraRevenue: number, totalRevenue: number) {
  if (!totalRevenue)
    return "Sem receita no período: cadastre hospedagens e consumos para medir o indicador.";
  if (extraRevenue / totalRevenue < 0.12)
    return "Extras baixos: oferecer café, frigobar, day use ou serviços no check-in e pós-venda.";
  return "Receitas extras participam bem do faturamento: manter ofertas de consumo e serviços anexos.";
}

function clientAverageStrategy(value: number) {
  if (!value) return "Sem média por cliente: depende de reservas/vendas associadas ao período.";
  if (value < 150)
    return "Ticket médio baixo: criar combos de hospedagem + consumo e ofertas para clientes recorrentes.";
  return "Bom ticket por cliente: proteger qualidade do atendimento e estimular retorno direto.";
}

function gopparStrategy(value: number) {
  if (value < 0)
    return "GOPPAR negativo: despesas superaram receitas. Revise custos operacionais e canais com comissão alta.";
  if (value < 50)
    return "Lucro por quarto disponível apertado: priorizar margem, reduzir desperdícios e elevar receita extra.";
  return "GOPPAR positivo: operação gera lucro por quarto disponível; acompanhe para sustentar o ganho.";
}

function readChannel(reservation: Reservation) {
  return String(
    (reservation as { canal?: string | null; origem?: string | null }).canal ??
      (reservation as { origem?: string | null }).origem ??
      "direto",
  );
}

function readClientId(reservation: Reservation) {
  return (reservation as { cliente_id?: string | null }).cliente_id ?? null;
}

function reservationGuestName(reservation: Reservation) {
  return String(
    (reservation as { hospede?: string | null; hospede_nome?: string | null; nome?: string | null })
      .hospede ??
      (reservation as { hospede_nome?: string | null }).hospede_nome ??
      (reservation as { nome?: string | null }).nome ??
      "Hospede",
  );
}

function roomLabel(room: Room) {
  const config = normalizeText(String(room.configuracao ?? ""));
  if (config.includes("casal") && config.includes("solteiro")) return "Casal + solteiro";
  if (config.includes("casal")) return "Casal";
  if (config.includes("solteiro") && (config.includes("2") || config.includes("duplo")))
    return "Duplo solteiro";
  if (config.includes("solteiro")) return "Solteiro";
  return "Quarto";
}

function normalizeChannel(value: string) {
  const text = normalizeText(value);
  if (text.includes("book")) return "booking";
  if (text.includes("air")) return "airbnb";
  if (text.includes("insta")) return "instagram";
  if (text.includes("whats")) return "whatsapp";
  if (text.includes("site")) return "site";
  if (text.includes("recep")) return "direto";
  return text || "direto";
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function labelize(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function availableYears(reservations: Reservation[], expenses: Expense[], today: string) {
  const years = new Set<string>([today.slice(0, 4)]);
  reservations.forEach((reservation) => years.add((reservation.checkin || "").slice(0, 4)));
  expenses.forEach((expense) => years.add((expense.data || "").slice(0, 4)));
  return [...years].filter((item) => /^\d{4}$/.test(item)).sort((a, b) => b.localeCompare(a));
}

function formatShortDate(value: string) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function sectionLabel(section: DashboardSection) {
  return {
    geral: "Visão geral",
    canais: "Análise por canal",
    quartos: "Análise por quarto",
    clientes: "Análise de clientes",
    tendencias: "Tendências mensais",
  }[section];
}

function normalizeState(value: string) {
  const text = normalizeText(value).replace(/[^a-z]/g, "");
  if (!text) return "";
  const raw = value.trim().toUpperCase();
  if (BRAZIL_STATE_NAMES[raw]) return raw;
  const found = Object.entries(BRAZIL_STATE_NAMES).find(
    ([, name]) => normalizeText(name).replace(/[^a-z]/g, "") === text,
  );
  if (found) return found[0];
  if (text.includes("minas")) return "MG";
  if (text.includes("saopaulo")) return "SP";
  if (text.includes("riodejaneiro")) return "RJ";
  return "";
}

const MONTHS = [
  { value: "01", label: "Janeiro" },
  { value: "02", label: "Fevereiro" },
  { value: "03", label: "Março" },
  { value: "04", label: "Abril" },
  { value: "05", label: "Maio" },
  { value: "06", label: "Junho" },
  { value: "07", label: "Julho" },
  { value: "08", label: "Agosto" },
  { value: "09", label: "Setembro" },
  { value: "10", label: "Outubro" },
  { value: "11", label: "Novembro" },
  { value: "12", label: "Dezembro" },
];

const BRAZIL_STATE_NAMES: Record<string, string> = {
  AC: "Acre",
  AL: "Alagoas",
  AP: "Amapá",
  AM: "Amazonas",
  BA: "Bahia",
  CE: "Ceará",
  DF: "Distrito Federal",
  ES: "Espírito Santo",
  GO: "Goiás",
  MA: "Maranhão",
  MT: "Mato Grosso",
  MS: "Mato Grosso do Sul",
  MG: "Minas Gerais",
  PA: "Pará",
  PB: "Paraíba",
  PR: "Paraná",
  PE: "Pernambuco",
  PI: "Piauí",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul",
  RO: "Rondônia",
  RR: "Roraima",
  SC: "Santa Catarina",
  SP: "São Paulo",
  SE: "Sergipe",
  TO: "Tocantins",
};

const WORLD_COUNTRY_POINTS: Record<string, { x: number; y: number }> = {
  BR: { x: 218, y: 258 },
  AR: { x: 213, y: 300 },
  CL: { x: 192, y: 286 },
  US: { x: 142, y: 120 },
  CA: { x: 142, y: 78 },
  MX: { x: 151, y: 162 },
  PT: { x: 360, y: 118 },
  ES: { x: 375, y: 121 },
  FR: { x: 390, y: 105 },
  DE: { x: 409, y: 96 },
  IT: { x: 410, y: 123 },
  GB: { x: 381, y: 87 },
  AO: { x: 418, y: 224 },
  ZA: { x: 425, y: 286 },
  CN: { x: 612, y: 131 },
  JP: { x: 699, y: 129 },
  IN: { x: 568, y: 173 },
  AU: { x: 691, y: 271 },
  OTHER: { x: 510, y: 190 },
};

const COUNTRY_ALIASES = [
  { code: "BR", name: "Brasil", aliases: ["brasil", "brazil", "br"] },
  { code: "AR", name: "Argentina", aliases: ["argentina", "ar"] },
  { code: "CL", name: "Chile", aliases: ["chile", "cl"] },
  {
    code: "US",
    name: "Estados Unidos",
    aliases: ["estados unidos", "eua", "usa", "united states"],
  },
  { code: "CA", name: "Canadá", aliases: ["canada", "ca"] },
  { code: "MX", name: "México", aliases: ["mexico", "mx"] },
  { code: "PT", name: "Portugal", aliases: ["portugal", "pt"] },
  { code: "ES", name: "Espanha", aliases: ["espanha", "spain", "es"] },
  { code: "FR", name: "França", aliases: ["franca", "france", "fr"] },
  { code: "DE", name: "Alemanha", aliases: ["alemanha", "germany", "de"] },
  { code: "IT", name: "Itália", aliases: ["italia", "italy", "it"] },
  {
    code: "GB",
    name: "Reino Unido",
    aliases: ["reino unido", "inglaterra", "united kingdom", "gb"],
  },
  { code: "AO", name: "Angola", aliases: ["angola", "ao"] },
  { code: "ZA", name: "África do Sul", aliases: ["africa do sul", "south africa", "za"] },
  { code: "CN", name: "China", aliases: ["china", "cn"] },
  { code: "JP", name: "Japão", aliases: ["japao", "japan", "jp"] },
  { code: "IN", name: "Índia", aliases: ["india", "in"] },
  { code: "AU", name: "Austrália", aliases: ["australia", "au"] },
] as const;
