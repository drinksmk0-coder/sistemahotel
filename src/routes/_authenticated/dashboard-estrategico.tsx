import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { NaturalEarth } from "@visx/geo";
import Brazil from "@svg-maps/brazil";
import { feature } from "topojson-client";
import worldAtlas from "world-atlas/countries-110m.json";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type {
  GeometryCollection as TopologyGeometryCollection,
  Topology,
} from "topojson-specification";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  BedDouble,
  ChevronDown,
  DollarSign,
  Filter,
  Info,
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
  LabelList,
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
  useComplaints,
  useExpenses,
  useFeedbacks,
  useReservations,
  useRooms,
  useSales,
  useCurrentCompany,
  type Client,
  type Complaint,
  type Expense,
  type Feedback,
  type Reservation,
  type Room,
  type Sale,
} from "@/lib/data";
import { fmtBRL, todayISO } from "@/lib/format";
import { semanticChartColor } from "@/lib/chart-colors";
import { ReceivablesPanel } from "@/components/ReceivablesPanel";
import { DashboardHeader } from "@/components/DashboardKit";
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

export const Route = createFileRoute("/_authenticated/dashboard-estrategico")({
  component: DashboardEstrategico,
});

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

type IndicatorView =
  | "geral"
  | "ocupacao"
  | "receita"
  | "financeiro"
  | "hospedes"
  | "experiencia"
  | "canais"
  | "contas";

const INDICATOR_VIEWS: { id: IndicatorView; label: string }[] = [
  { id: "geral", label: "Visão geral" },
  { id: "ocupacao", label: "Ocupação" },
  { id: "receita", label: "Receita e preços" },
  { id: "financeiro", label: "Financeiro" },
  { id: "hospedes", label: "Hóspedes" },
  { id: "experiencia", label: "Experiência" },
  { id: "canais", label: "Canais" },
  { id: "contas", label: "Contas" },
];

function DashboardEstrategico() {
  const today = todayISO();
  const { data: rooms = [] } = useRooms();
  const { data: reservations = [] } = useReservations();
  const { data: sales = [] } = useSales();
  const { data: expenses = [] } = useExpenses();
  const { data: clients = [] } = useClients();
  const { data: feedbacks = [] } = useFeedbacks();
  const { data: complaints = [] } = useComplaints();
  const currentCompany = useCurrentCompany();
  const [period, setPeriod] = useState<DashboardPeriod>("mes");
  const [activeView, setActiveView] = useState<IndicatorView>("geral");
  const [accommodationFilter, setAccommodationFilter] = useState("todos");
  const [reservationStatusFilter, setReservationStatusFilter] = useState("todos");
  const [channelFilter, setChannelFilter] = useState("todos");
  const range = periodRange(period, today);
  const previousRange = periodRange(period, today, -1);
  const previousYearToday = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`;
  const previousYearRange = periodRange(period, previousYearToday);
  const clientById = useMemo(
    () => new Map(clients.map((client) => [client.id, client])),
    [clients],
  );
  const roomByNumber = useMemo(
    () => new Map(rooms.map((room) => [room.numero, room])),
    [rooms],
  );

  const filteredReservations = useMemo(
    () =>
      reservations.filter(
        (reservation) =>
          reservation.status !== "manutencao" &&
          reservationOverlapsRange(reservation, range) &&
          matchesAccommodationFilter(
            reservation,
            roomByNumber.get(reservation.quarto),
            accommodationFilter,
          ) &&
          matchesReservationStatus(reservation, reservationStatusFilter) &&
          matchesChannelFilter(reservation, channelFilter),
      ),
    [
      accommodationFilter,
      channelFilter,
      range,
      reservationStatusFilter,
      reservations,
      roomByNumber,
    ],
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
  const pendingReservations = filteredReservations.filter(
    (reservation) => Number(reservation.valor_pago) < Number(reservation.valor_total),
  ).length;
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
  const stateRows = buildStateRows(filteredReservations, clients, clientById);
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
  const ageRows = buildAgeDistribution(filteredReservations, clients, clientById, today);
  const profileRevenueRows = buildProfileRevenue(filteredReservations, clientById);
  const occupancyWeekdayRows = buildWeekdayOccupancy(
    filteredReservations,
    rooms.length,
    range.start,
    range.end,
  );
  const paymentRows = buildPaymentRows(filteredReservations, filteredSales);
  const roomTypeRows = buildRoomTypePerformance(
    filteredReservations,
    rooms,
    range.start,
    range.end,
  );
  const feedbackRows = buildFeedbackCriteria(feedbacks);
  const complaintRows = buildComplaintRows(complaints);
  const dashboardWidgets: DashboardWidget[] = [
    {
      id: "reservas",
      title: "Reservas",
      kind: "kpi",
      defaultColumns: 2,
      defaultHeight: 100,
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
      defaultColumns: 2,
      defaultHeight: 100,
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
      defaultColumns: 2,
      defaultHeight: 100,
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
      defaultColumns: 2,
      defaultHeight: 100,
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
      defaultColumns: 2,
      defaultHeight: 100,
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
      defaultColumns: 2,
      defaultHeight: 100,
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
      {
        id: "margem-operacional",
        title: "Margem operacional",
        value: `${margem}%`,
        formula: `${fmtBRL(lucro)} / ${fmtBRL(receita)}`,
        meaning: "Percentual da receita que permanece após as despesas operacionais.",
        strategy:
          lucro >= 0
            ? "Margem positiva. Compare com a meta e investigue custos que crescem acima da receita."
            : "Margem negativa. Priorize cobrança, precificação e redução dos maiores custos.",
        tone: lucro >= 0 ? ("sage" as const) : ("brick" as const),
        previousDelta: percentChange(
          Number(margem),
          safeDivide(
            previousHotelKpis.grossOperatingProfit * 100,
            previousHotelKpis.totalRevenue,
          ),
        ),
        yearDelta: percentChange(
          Number(margem),
          safeDivide(
            previousYearHotelKpis.grossOperatingProfit * 100,
            previousYearHotelKpis.totalRevenue,
          ),
        ),
      },
    ].map((metric): DashboardWidget => ({
      id: metric.id,
      title: metric.title,
      kind: "kpi",
      defaultColumns: 2,
      defaultHeight: 112,
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
      defaultHeight: 400,
      defaultColor: "var(--chart-1)",
      chartTypes: ["area", "line"],
      dataRole: "temporal",
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
      dataRole: "distribution",
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
      dataRole: "ranking",
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
  const occupancyWidgets: DashboardWidget[] = [
    {
      id: "ocupacao-semana",
      title: "Ocupação por dia da semana",
      kind: "chart",
      defaultColumns: 6,
      defaultHeight: 250,
      defaultColor: "var(--chart-1)",
      chartTypes: ["bar", "line", "area", "radar"],
      dataRole: "weekday",
      render: (settings) => (
        <EditableStrategicChart
          rows={occupancyWeekdayRows}
          categoryKey="dia"
          series={[{ key: "ocupacao", label: "Ocupação %", color: settings.color }]}
          settings={settings}
        />
      ),
    },
    {
      id: "demanda-30-dias",
      title: "Demanda e receita dos próximos 30 dias",
      kind: "chart",
      defaultColumns: 5,
      defaultHeight: 270,
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
  ];
  const pricingWidgets: DashboardWidget[] = [
    {
      id: "desempenho-tipo-quarto",
      title: "ADR e ocupação por tipo de quarto",
      kind: "chart",
      defaultColumns: 7,
      defaultHeight: 290,
      defaultColor: "var(--chart-1)",
      chartTypes: ["composed", "bar", "horizontalBar", "radar"],
      render: (settings) => (
        <EditableStrategicChart
          rows={roomTypeRows}
          categoryKey="tipo"
          series={[
            { key: "adr", label: "ADR", color: settings.color, currency: true },
            { key: "ocupacao", label: "Ocupação %", color: "var(--chart-2)" },
          ]}
          settings={settings}
        />
      ),
    },
    {
      id: "receita-tipo-quarto",
      title: "Receita por tipo de quarto",
      kind: "chart",
      defaultColumns: 5,
      defaultHeight: 290,
      defaultColor: "var(--chart-2)",
      chartTypes: ["horizontalBar", "bar", "doughnut", "pie", "radar"],
      render: (settings) => (
        <EditableStrategicChart
          rows={roomTypeRows}
          categoryKey="tipo"
          series={[
            { key: "receita", label: "Receita", color: settings.color, currency: true },
          ]}
          settings={settings}
        />
      ),
    },
  ];
  const financialWidgets: DashboardWidget[] = [
    {
      id: "formas-pagamento",
      title: "Formas de pagamento",
      kind: "chart",
      defaultColumns: 5,
      defaultHeight: 280,
      defaultColor: "var(--chart-2)",
      chartTypes: ["doughnut", "pie", "horizontalBar", "bar", "radar"],
      dataRole: "distribution",
      render: (settings) => (
        <EditableStrategicChart
          rows={paymentRows}
          categoryKey="name"
          series={[{ key: "value", label: "Recebido", color: settings.color, currency: true }]}
          settings={settings}
        />
      ),
    },
  ];
  const evaluationWidgets: DashboardWidget[] = [
    {
      id: "avaliacoes-criterios",
      title: "Avaliações por critério",
      kind: "chart",
      defaultColumns: 6,
      defaultHeight: 290,
      defaultColor: "var(--chart-2)",
      chartTypes: ["radar", "bar", "horizontalBar", "line"],
      render: (settings) => (
        <EditableStrategicChart
          rows={feedbackRows}
          categoryKey="name"
          series={[{ key: "value", label: "Nota média", color: settings.color }]}
          settings={settings}
        />
      ),
    },
    {
      id: "reclamacoes-categoria",
      title: "Reclamações por categoria",
      kind: "chart",
      defaultColumns: 6,
      defaultHeight: 290,
      defaultColor: "var(--chart-4)",
      chartTypes: ["horizontalBar", "bar", "doughnut", "pie", "radar"],
      render: (settings) => (
        <EditableStrategicChart
          rows={complaintRows}
          categoryKey="name"
          series={[{ key: "value", label: "Reclamações", color: settings.color }]}
          settings={settings}
        />
      ),
    },
  ];
  const clientWidgets: DashboardWidget[] = [
    {
      id: "mapa-perfil-hospedes",
      title: "Origem e perfil dos hóspedes",
      kind: "content",
      defaultColumns: 12,
      defaultHeight: 560,
      defaultColor: "var(--chart-1)",
      render: (settings) => (
        <GuestProfileOverview
          settings={settings}
          states={stateRows}
          countries={countryRows}
          revenue={profileRevenueRows}
          civil={civilRows}
          gender={genderRows}
          profession={professionRows}
          age={ageRows}
        />
      ),
    },
  ];
  const profileDistributionWidgets: DashboardWidget[] = [
    {
      id: "origem-hospedes",
      title: "Origem dos hóspedes",
      kind: "chart",
      defaultColumns: 4,
      defaultHeight: 250,
      defaultColor: "var(--chart-1)",
      chartTypes: ["doughnut", "pie"],
      dataRole: "distribution",
      render: (settings) => (
        <EditableStrategicChart
          rows={stateRows.slice(0, 6).map((row) => ({ name: row.label, value: row.value }))}
          categoryKey="name"
          series={[{ key: "value", label: "Hóspedes", color: settings.color }]}
          settings={settings}
        />
      ),
    },
    {
      id: "sexo-hospedes",
      title: "Sexo dos hóspedes",
      kind: "chart",
      defaultColumns: 4,
      defaultHeight: 250,
      defaultColor: "var(--chart-2)",
      chartTypes: ["doughnut", "pie"],
      dataRole: "distribution",
      render: (settings) => (
        <EditableStrategicChart
          rows={genderRows}
          categoryKey="name"
          series={[{ key: "value", label: "Hóspedes", color: settings.color }]}
          settings={settings}
        />
      ),
    },
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
      dataRole: "ranking",
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
      dataRole: "ranking",
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
      dataRole: "ranking",
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
  const compactWidget = (
    widget: DashboardWidget,
    id: string,
    columns = 4,
    height = 195,
  ): DashboardWidget => ({
    ...widget,
    id,
    defaultColumns: columns,
    defaultHeight: height,
  });
  const executiveRoomTypeRows = buildRoomTypeDistribution(filteredReservations, rooms);
  const overviewWidgets: DashboardWidget[] = [
    {
      id: "geral-tipos-quarto",
      title: "Distribuição por tipo de quarto",
      kind: "chart",
      defaultColumns: 3,
      defaultHeight: 260,
      defaultColor: "#00D2FF",
      chartTypes: ["doughnut"],
      dataRole: "distribution",
      render: (settings) => (
        <EditableStrategicChart
          rows={executiveRoomTypeRows}
          categoryKey="name"
          series={[{ key: "value", label: "Reservas", color: settings.color }]}
          settings={settings}
        />
      ),
    },
    {
      id: "geral-receita-canal",
      title: "Receita por canal de venda",
      kind: "chart",
      defaultColumns: 3,
      defaultHeight: 260,
      defaultColor: "#00D2FF",
      chartTypes: ["horizontalBar"],
      dataRole: "ranking",
      render: (settings) => (
        <EditableStrategicChart
          rows={channelRows.slice(0, 6)}
          categoryKey="name"
          series={[{ key: "receita", label: "Receita", color: settings.color, currency: true }]}
          settings={settings}
        />
      ),
    },
    {
      id: "geral-origem-estado",
      title: "Origem dos hóspedes por estado",
      kind: "chart",
      defaultColumns: 3,
      defaultHeight: 260,
      defaultColor: "#38BDF8",
      chartTypes: ["horizontalBar"],
      dataRole: "ranking",
      render: (settings) => (
        <EditableStrategicChart
          rows={stateRows.slice(0, 6)}
          categoryKey="label"
          series={[{ key: "value", label: "Hóspedes", color: settings.color }]}
          settings={settings}
        />
      ),
    },
    {
      id: "geral-hospedes-frequentes",
      title: "Hóspedes frequentes",
      kind: "content",
      defaultColumns: 3,
      defaultHeight: 260,
      render: (settings) => (
        <ExecutiveRanking title={settings.title} rows={recurring.slice(0, 5)} />
      ),
    },
    {
      id: "geral-receita-despesa-anual",
      title: "Evolução de receita vs despesas ao longo do ano",
      kind: "chart",
      defaultColumns: 8,
      defaultHeight: 400,
      defaultColor: "#00D2FF",
      chartTypes: ["area"],
      dataRole: "temporal",
      render: (settings) => (
        <EditableStrategicChart
          rows={trends}
          categoryKey="mes"
          series={[
            { key: "receita", label: "Receita", color: settings.color, currency: true },
            { key: "despesa", label: "Despesas", color: "#8B5CF6", currency: true },
          ]}
          settings={settings}
        />
      ),
    },
    {
      id: "geral-satisfacao",
      title: "Nota média das experiências",
      kind: "content",
      defaultColumns: 4,
      defaultHeight: 400,
      render: () => <SatisfactionCard feedbacks={feedbacks} />,
    },
    compactWidget(clientWidgets[0], "geral-perfil-hospedes", 12, 560),
  ];
  const overviewKpis = dashboardWidgets
    .filter((widget) => ["reservas", "receita", "ocupacao"].includes(widget.id))
    .map((widget) => compactWidget(widget, `geral-${widget.id}`, 3, 92));
  overviewKpis.push({
    id: "geral-pendencias",
    title: "Pendências / cobrança Pix",
    kind: "kpi",
    defaultColumns: 3,
    defaultHeight: 92,
    render: (settings) => (
      <StoryKpi
        icon={<DollarSign />}
        label={settings.title}
        value={fmtBRL(aReceber)}
        hint={`${pendingReservations} reserva(s) aguardando quitação`}
        tone="brass"
      />
    ),
  });
  const companyId = currentCompany.data?.id;

  return (
    <div className="hotel-command-dark space-y-3 rounded-xl p-3 pb-6">
      <DashboardHeader
        title="HOTEL REAL COMMAND"
        subtitle="Inteligência executiva do Hotel Real Cruzília."
        period={period}
        onPeriodChange={setPeriod}
      >
        <IndicatorViewFilter active={activeView} onChange={setActiveView} />
      </DashboardHeader>

      <main className="min-w-0 space-y-3">
        {activeView === "geral" && (
          <section className="min-w-0 space-y-3">
            <ExecutiveFilterPanel
              period={period}
              accommodation={accommodationFilter}
              status={reservationStatusFilter}
              channel={channelFilter}
              onPeriodChange={setPeriod}
              onAccommodationChange={setAccommodationFilter}
              onStatusChange={setReservationStatusFilter}
              onChannelChange={setChannelFilter}
              onReset={() => {
                setPeriod("mes");
                setAccommodationFilter("todos");
                setReservationStatusFilter("todos");
                setChannelFilter("todos");
              }}
            />
            <DashboardDesigner
              key="indicadores-geral-kpis-v13"
              companyId={companyId}
              dashboardId="indicadores-geral-kpis-v13"
              widgets={overviewKpis}
              fixed
            />
            <DashboardDesigner
              key="indicadores-geral-graficos-v13"
              companyId={companyId}
              dashboardId="indicadores-geral-graficos-v13"
              widgets={overviewWidgets}
              fixed
            />
          </section>
        )}

        {activeView === "ocupacao" && (
          <IndicatorTopic
            number={2}
            title="Ocupação e demanda"
            description="Comportamento semanal, disponibilidade e previsão dos próximos 30 dias."
            companyId={companyId}
            dashboardId="indicadores-ocupacao-v2"
            widgets={[...occupancyWidgets, ...generalWidgets.slice(3)]}
          />
        )}

        {activeView === "receita" && (
          <IndicatorTopic
            number={3}
            title="Receita, preços e quartos"
            description="Evolução, origem, ADR, ocupação e rentabilidade por UH e categoria."
            companyId={companyId}
            dashboardId="indicadores-receita-v2"
            widgets={[
              ...generalWidgets.filter((widget) =>
                ["evolucao-financeira", "origem-receita"].includes(widget.id),
              ),
              ...pricingWidgets,
              ...roomWidgets,
            ]}
          />
        )}

        {activeView === "financeiro" && (
          <IndicatorTopic
            number={4}
            title="Indicadores financeiros"
            description="Receita, despesas, lucro, formas de pagamento e custos operacionais."
            companyId={companyId}
            dashboardId="indicadores-financeiro-v2"
            widgets={[
              ...generalWidgets.filter((widget) => widget.id === "despesas-categoria"),
              ...trendWidgets,
              ...financialWidgets,
            ]}
          />
        )}

        {activeView === "hospedes" && (
          <IndicatorTopic
            number={5}
            title="Perfil dos hóspedes"
            description="Mapa, receita, idade, sexo, estado civil e profissão lado a lado."
            companyId={companyId}
            dashboardId="indicadores-hospedes-v2"
            widgets={[...clientWidgets, ...profileDistributionWidgets]}
          />
        )}

        {activeView === "experiencia" && (
          <IndicatorTopic
            number={6}
            title="Avaliações e reclamações"
            description="Notas por critério e temas que mais afetam a experiência."
            companyId={companyId}
            dashboardId="indicadores-experiencia-v2"
            widgets={evaluationWidgets}
          />
        )}

        {activeView === "canais" && (
          <IndicatorTopic
            number={7}
            title="Canais e oportunidades"
            description="Receita líquida, custos, recorrência e recomendações de ação."
            companyId={companyId}
            dashboardId="indicadores-canais-v2"
            widgets={[...channelWidgets, ...insightWidgets]}
          />
        )}

        {activeView === "contas" && (
          <IndicatorTopic
            number={8}
            title="Contas e relacionamento"
            description="Saldos pendentes, cobranças e hóspedes recorrentes."
            companyId={companyId}
            dashboardId="indicadores-contas-v2"
            widgets={clientDetailWidgets}
          />
        )}
      </main>
    </div>
  );
}

function ExecutiveFilterPanel({
  period,
  accommodation,
  status,
  channel,
  onPeriodChange,
  onAccommodationChange,
  onStatusChange,
  onChannelChange,
  onReset,
}: {
  period: DashboardPeriod;
  accommodation: string;
  status: string;
  channel: string;
  onPeriodChange: (value: DashboardPeriod) => void;
  onAccommodationChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onChannelChange: (value: string) => void;
  onReset: () => void;
}) {
  const activeFilters = [
    period !== "mes",
    accommodation !== "todos",
    status !== "todos",
    channel !== "todos",
  ].filter(Boolean).length;
  return (
    <details className="group relative z-40 w-fit">
      <summary className="executive-filter-panel flex h-9 cursor-pointer list-none items-center gap-2 rounded-lg border px-3 text-[11px] font-extrabold text-pine-dark shadow-lg">
        <Filter className="h-4 w-4 text-primary" />
        Filtros
        {activeFilters > 0 ? (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[9px] text-primary-foreground">
            {activeFilters}
          </span>
        ) : null}
        <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />
      </summary>
      <div className="executive-filter-panel absolute left-0 top-11 z-50 w-[min(42rem,calc(100vw-3rem))] rounded-lg border p-3 shadow-2xl">
        <div className="mb-3">
          <h2 className="text-xs font-extrabold text-pine-dark">Filtros do painel</h2>
          <p className="text-[10px] text-muted-foreground">
            Os gráficos e indicadores são atualizados juntos.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ExecutiveSelect
            label="Período"
            value={period}
            onChange={(value) => onPeriodChange(value as DashboardPeriod)}
            options={[
              ["dia", "Hoje"],
              ["mes", "Mês atual"],
              ["ano", "Ano atual"],
            ]}
          />
          <ExecutiveSelect
            label="Tipo de acomodação"
            value={accommodation}
            onChange={onAccommodationChange}
            options={[
              ["todos", "Todos os quartos"],
              ["padrao", "Padrão — R$ 90"],
              ["superior", "Superior — R$ 110"],
            ]}
          />
          <ExecutiveSelect
            label="Status da reserva"
            value={status}
            onChange={onStatusChange}
            options={[
              ["todos", "Todos os status"],
              ["confirmada", "Confirmada"],
              ["sinal", "Pendente sinal 50%"],
              ["checkin", "Check-in feito"],
              ["cancelada", "Cancelada"],
            ]}
          />
          <ExecutiveSelect
            label="Canal de origem"
            value={channel}
            onChange={onChannelChange}
            options={[
              ["todos", "Todos os canais"],
              ["whatsapp", "WhatsApp AI"],
              ["balcao", "Balcão / direto"],
              ["ota", "OTA"],
            ]}
          />
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            className="rounded-md bg-primary px-3 py-2 text-[11px] font-extrabold text-primary-foreground"
            onClick={onReset}
          >
            Resetar filtros
          </button>
        </div>
      </div>
    </details>
  );
}

function ExecutiveSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold text-muted-foreground">{label}</span>
      <select
        className="field h-9 text-[11px]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function ExecutiveRanking({
  title,
  rows,
}: {
  title: string;
  rows: Array<{
    Cliente: string;
    Reservas: number;
    Receita: string;
    Última: string;
    Status: string;
  }>;
}) {
  return (
    <section className="h-full min-w-0 p-1">
      <h3 className="mb-3 truncate text-xs font-extrabold text-pine-dark">{title}</h3>
      <ol className="space-y-2">
        {rows.length ? (
          rows.map((row, index) => (
            <li
              key={`${row.Cliente}-${index}`}
              className="flex min-w-0 items-center gap-2 rounded-md bg-muted/70 px-2 py-1.5"
            >
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/15 text-[9px] font-black text-primary">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-[10px] font-bold" title={row.Cliente}>
                {row.Cliente}
              </span>
              <span className="shrink-0 text-[9px] text-muted-foreground">
                {row.Reservas} estadias
              </span>
            </li>
          ))
        ) : (
          <li className="rounded-md bg-muted/70 p-3 text-[10px] text-muted-foreground">
            Ainda não há hóspedes recorrentes no período.
          </li>
        )}
      </ol>
    </section>
  );
}

function SatisfactionCard({ feedbacks }: { feedbacks: Feedback[] }) {
  const ratings = feedbacks
    .map((feedback) => Number(feedback.nota_geral ?? 0))
    .filter((rating) => rating > 0);
  const averageRating = ratings.length ? average(ratings) : 0;
  const rows = [5, 4, 3, 2, 1].map((stars) => {
    const count = ratings.filter((rating) => Math.round(rating) === stars).length;
    return {
      stars,
      percentage: ratings.length ? Math.round((count / ratings.length) * 100) : 0,
    };
  });
  return (
    <section className="flex h-full min-w-0 flex-col p-1">
      <div className="mb-4">
        <span className="text-[10px] font-bold uppercase text-muted-foreground">
          Média geral
        </span>
        <div className="mt-1 text-3xl font-black text-pine-dark">
          {averageRating.toLocaleString("pt-BR", {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          })}{" "}
          <span className="text-xl text-[#22C55E]">★</span>
        </div>
        <p className="text-[10px] text-muted-foreground">{ratings.length} avaliações</p>
      </div>
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.stars} className="grid grid-cols-[2.5rem_1fr_2.5rem] items-center gap-2">
            <span className="text-[10px] text-muted-foreground">{row.stars} ★</span>
            <span className="h-2 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-primary"
                style={{ width: `${row.percentage}%` }}
              />
            </span>
            <strong className="text-right text-[10px] text-pine-dark">{row.percentage}%</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function IndicatorViewFilter({
  active,
  onChange,
}: {
  active: IndicatorView;
  onChange: (view: IndicatorView) => void;
}) {
  return (
    <details className="group relative">
      <summary className="flex h-8 max-w-40 cursor-pointer list-none items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-[10px] font-bold text-pine-dark shadow-sm">
        <Filter className="h-3.5 w-3.5 text-primary" />
        <span className="truncate">
          {INDICATOR_VIEWS.find((view) => view.id === active)?.label}
        </span>
        <ChevronDown className="h-3 w-3 shrink-0 transition group-open:rotate-180" />
      </summary>
      <nav
        className="absolute right-0 z-50 mt-1 min-w-48 rounded-lg border border-border bg-card p-1.5 shadow-xl"
        aria-label="Tema dos indicadores"
      >
        {INDICATOR_VIEWS.map((view) => (
          <button
            key={view.id}
            type="button"
            onClick={(event) => {
              onChange(view.id);
              event.currentTarget.closest("details")?.removeAttribute("open");
            }}
            className={`block w-full rounded-md px-3 py-2 text-left text-[11px] font-bold transition ${
              active === view.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-pine-dark"
            }`}
          >
            {view.label}
          </button>
        ))}
      </nav>
    </details>
  );
}

function IndicatorTopic({
  number,
  title,
  description,
  companyId,
  dashboardId,
  widgets,
}: {
  number: number;
  title: string;
  description: string;
  companyId?: string;
  dashboardId: string;
  widgets: DashboardWidget[];
}) {
  return (
    <>
      <IndicatorSectionTitle number={number} title={title} description={description} compact />
      <DashboardDesigner
        key={dashboardId}
        companyId={companyId}
        dashboardId={dashboardId}
        widgets={widgets}
        fixed
      />
    </>
  );
}

function IndicatorSectionTitle({
  number,
  title,
  description,
  compact = false,
}: {
  number: number;
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex items-start gap-2 border-border/70 ${
        compact ? "border-b pb-2" : "border-t pt-4 first:border-t-0"
      }`}
    >
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-[10px] font-extrabold text-primary">
        {number}
      </span>
      <div>
        <h2 className="text-sm font-extrabold text-pine-dark">{title}</h2>
        <p className="text-[11px] text-muted-foreground">{description}</p>
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
  const sparklineEnd =
    previousDelta == null ? 12 : Math.max(3, Math.min(21, 12 - previousDelta / 4));
  return (
    <div
      className={`relative min-w-0 overflow-hidden rounded-md border border-border border-t-4 p-2 shadow-sm ${toneClass}`}
    >
      {previousDelta != null && (
        <svg
          viewBox="0 0 72 24"
          className="pointer-events-none absolute bottom-2 right-2 h-7 w-20 opacity-70"
          aria-hidden="true"
        >
          <path
            d={`M2 18 C18 16, 24 10, 38 13 S56 12, 70 ${sparklineEnd}`}
            fill="none"
            stroke="var(--primary)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      )}
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
  const [showHelp, setShowHelp] = useState(false);
  const toneClass = {
    pine: "border-pine/35 bg-pine/5",
    sage: "border-sage/45 bg-sage-bg/55",
    brass: "border-brass/50 bg-brass/10",
    brick: "border-brick/45 bg-brick/10",
  }[tone];

  return (
    <article
      className={`group relative min-w-0 rounded-lg border px-3 py-2 shadow-sm ${toneClass}`}
      onMouseLeave={() => setShowHelp(false)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-[10px] font-bold uppercase text-pine-dark">{label}</h2>
          <p className="font-serif text-lg font-bold leading-tight text-pine-dark">{value}</p>
        </div>
        <button
          type="button"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-border bg-card/90 text-primary shadow-sm"
          onClick={() => setShowHelp((value) => !value)}
          onMouseEnter={() => setShowHelp(true)}
          aria-label={`Como interpretar ${label}`}
          aria-expanded={showHelp}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="mt-0.5 truncate text-[10px] text-muted-foreground" title={formula}>
        {formula}
      </p>
      <div className="mt-1 flex flex-wrap gap-1">
        <DeltaPill label="mês ant." value={previousDelta} />
        <DeltaPill label="ano ant." value={yearDelta} />
      </div>
      {showHelp && (
        <div
          role="tooltip"
          className="absolute inset-x-2 top-8 z-30 rounded-lg border border-primary/25 bg-card/95 p-2.5 text-[10px] shadow-xl backdrop-blur"
        >
          <strong className="text-pine-dark">Como interpretar</strong>
          <p className="mt-1 leading-relaxed text-muted-foreground">{meaning}</p>
          <p className="mt-1.5 rounded-md bg-primary/8 px-2 py-1.5 leading-relaxed text-pine-dark">
            {strategy}
          </p>
        </div>
      )}
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
  const height = Math.max(180, settings.height - 78);
  const normalizedTitle = normalizeText(settings.title);
  const isMonthlyHero =
    normalizedTitle.includes("receita, despesas e lucro") ||
    normalizedTitle.includes("receita vs despesas ao longo do ano");
  const isWeekdayOccupancy = normalizedTitle.includes("ocupacao por dia da semana");
  const isExpenseRanking = normalizedTitle.includes("despesas por categoria");
  const isCircular = settings.chartType === "pie" || settings.chartType === "doughnut";
  const canShowLabels =
    !isCircular &&
    (isWeekdayOccupancy ||
      isExpenseRanking ||
      (settings.showLabels && rows.length * Math.max(1, series.length) <= 12));
  const formatter = (value: number, name: string) =>
    series.find((item) => item.label === name)?.currency ? fmtBRL(value) : value;
  const labelFormatter = (value: number, currency = false) =>
    isExpenseRanking && currency ? fmtBRL(value) : formatStrategicValue(value, currency);
  const primaryCurrency = Boolean(series[0]?.currency);
  const circularTotal = isCircular
    ? rows.reduce((sum, item) => sum + Number(item[series[0].key] ?? 0), 0)
    : 0;
  const categoryAxisWidth = Math.min(
    isExpenseRanking ? 240 : 180,
    Math.max(
      88,
      rows.reduce(
        (width, row) => Math.max(width, String(row[categoryKey] ?? "").length * 6.2),
        0,
      ),
    ),
  );
  const common = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
      <Tooltip formatter={formatter} />
    </>
  );
  let chart: React.ReactNode;

  if (isCircular) {
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
              fill={strategicSliceColor(index, first.color, row[categoryKey])}
            />
          ))}
        </Pie>
        <Tooltip formatter={formatter} />
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
      <LineChart data={rows} margin={{ left: 8, right: 20, top: 12, bottom: 8 }}>
        {common}
        <XAxis
          dataKey={categoryKey}
          tick={{ fontSize: 10, fill: "var(--foreground)" }}
          interval={isMonthlyHero ? 0 : "preserveStartEnd"}
        />
        <YAxis
          tick={{ fontSize: 9 }}
          tickFormatter={(value) =>
            isMonthlyHero && primaryCurrency
              ? formatCurrencyAxis(Number(value))
              : formatStrategicValue(Number(value), primaryCurrency)
          }
          tickCount={isMonthlyHero ? 4 : undefined}
          width={primaryCurrency ? 68 : 42}
        />
        {series.map((item) => (
          <Line
            key={item.key}
            type="monotone"
            dataKey={item.key}
            name={item.label}
            stroke={item.color}
            strokeWidth={2.5}
            dot={false}
          >
            {canShowLabels && (
              <LabelList
                dataKey={item.key}
                position="top"
                formatter={(value: number) => labelFormatter(value, item.currency)}
              />
            )}
          </Line>
        ))}
      </LineChart>
    );
  } else if (settings.chartType === "area") {
    chart = (
      <AreaChart data={rows} margin={{ left: 8, right: 20, top: 12, bottom: 8 }}>
        {common}
        <XAxis
          dataKey={categoryKey}
          tick={{ fontSize: 10, fill: "var(--foreground)" }}
          interval={isMonthlyHero ? 0 : "preserveStartEnd"}
        />
        <YAxis
          tick={{ fontSize: 9 }}
          tickFormatter={(value) =>
            isMonthlyHero && primaryCurrency
              ? formatCurrencyAxis(Number(value))
              : formatStrategicValue(Number(value), primaryCurrency)
          }
          tickCount={isMonthlyHero ? 4 : undefined}
          width={primaryCurrency ? 68 : 42}
        />
        {series.map((item, index) => (
          <Area
            key={item.key}
            type="monotone"
            dataKey={item.key}
            name={item.label}
            stroke={item.color}
            fill={item.color}
            fillOpacity={index ? 0.12 : 0.24}
          >
            {canShowLabels && (
              <LabelList
                dataKey={item.key}
                position="top"
                formatter={(value: number) => labelFormatter(value, item.currency)}
              />
            )}
          </Area>
        ))}
      </AreaChart>
    );
  } else if (settings.chartType === "composed") {
    chart = (
      <ComposedChart data={rows} margin={{ left: 8, right: 20, top: 12, bottom: 8 }}>
        {common}
        <XAxis
          dataKey={categoryKey}
          tick={{ fontSize: 10, fill: "var(--foreground)" }}
          interval={isMonthlyHero ? 0 : "preserveStartEnd"}
        />
        <YAxis
          tick={{ fontSize: 9 }}
          tickFormatter={(value) =>
            isMonthlyHero && primaryCurrency
              ? formatCurrencyAxis(Number(value))
              : formatStrategicValue(Number(value), primaryCurrency)
          }
          tickCount={isMonthlyHero ? 4 : undefined}
          width={primaryCurrency ? 68 : 42}
        />
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
            >
              {canShowLabels && (
                <LabelList
                  dataKey={item.key}
                  position="top"
                  formatter={(value: number) => labelFormatter(value, item.currency)}
                />
              )}
            </Area>
          ) : (
            <Line
              key={item.key}
              type="monotone"
              dataKey={item.key}
              name={item.label}
              stroke={item.color}
              strokeWidth={2.5}
              dot={false}
            >
              {canShowLabels && (
                <LabelList
                  dataKey={item.key}
                  position="top"
                  formatter={(value: number) => labelFormatter(value, item.currency)}
                />
              )}
            </Line>
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
        margin={
          horizontal
            ? { left: 8, right: 88, top: 12, bottom: 14 }
            : { left: 8, right: 20, top: 24, bottom: 24 }
        }
      >
        {common}
        {horizontal ? (
          <>
            <XAxis
              type="number"
              tick={{ fontSize: 9 }}
              tickFormatter={(value) =>
                formatStrategicValue(Number(value), primaryCurrency)
              }
            />
            <YAxis
              type="category"
              dataKey={categoryKey}
              width={categoryAxisWidth}
              interval={0}
              tick={{ fontSize: 9, fill: "var(--foreground)" }}
              tickFormatter={(value) =>
                isExpenseRanking ? String(value) : truncateChartLabel(String(value))
              }
            />
          </>
        ) : (
          <>
            <XAxis
              dataKey={categoryKey}
              tick={{ fontSize: 10, fill: "var(--foreground)" }}
              interval={0}
              minTickGap={4}
            />
            <YAxis
              tick={{ fontSize: 9 }}
              domain={isWeekdayOccupancy ? [0, 100] : undefined}
              tickFormatter={(value) =>
                isWeekdayOccupancy
                  ? `${Number(value)}%`
                  : formatStrategicValue(Number(value), primaryCurrency)
              }
              width={primaryCurrency ? 68 : 42}
            />
          </>
        )}
        {series.map((item) => (
          <Bar
            key={item.key}
            dataKey={item.key}
            name={item.label}
            fill={item.color}
            radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
          >
            {canShowLabels && (
              <LabelList
                dataKey={item.key}
                position={horizontal ? "right" : "top"}
                formatter={(value: number) => labelFormatter(value, item.currency)}
              />
            )}
          </Bar>
        ))}
      </BarChart>
    );
  }

  return (
    <section className="h-full min-w-0 rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="mb-1.5 flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 className="min-w-0 truncate text-xs font-bold uppercase text-pine-dark">
          {settings.title}
        </h2>
        {!isCircular && (
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[9px] font-semibold text-muted-foreground">
            {series.map((item) => (
              <span key={item.key} className="inline-flex items-center gap-1 whitespace-nowrap">
                <span
                  className="h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: item.color }}
                />
                {item.label}
              </span>
            ))}
          </div>
        )}
      </div>
      {rows.length ? (
        isCircular ? (
          <div className="grid min-h-0 grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(180px,0.9fr)_minmax(170px,1.1fr)]">
            <div className="min-w-0">
              <ResponsiveContainer width="100%" height={Math.max(180, Math.min(height, 250))}>
                {chart}
              </ResponsiveContainer>
            </div>
            <div
              className="max-h-[220px] space-y-1.5 overflow-auto rounded-md bg-muted/35 p-2 pr-1 text-[10px]"
              aria-label={`Legenda de ${settings.title}`}
            >
              {rows.map((row, index) => {
                const rawValue = Number(row[series[0].key] ?? 0);
                const percentage = circularTotal > 0 ? (rawValue / circularTotal) * 100 : 0;
                return (
                  <div
                    key={`${String(row[categoryKey])}-${index}`}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-sm"
                        style={{
                          backgroundColor: strategicSliceColor(
                            index,
                            series[0].color,
                            row[categoryKey],
                          ),
                        }}
                      />
                      <span className="truncate font-semibold text-pine-dark">
                        {String(row[categoryKey])}
                      </span>
                    </span>
                    <strong className="whitespace-nowrap text-muted-foreground">
                      {percentage.toLocaleString("pt-BR", {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })}
                      %
                      {series[0].currency
                        ? ` · ${formatStrategicValue(rawValue, true)}`
                        : ""}
                    </strong>
                  </div>
                );
              })}
            </div>
          </div>
        ) : settings.chartType === "horizontalBar" ? (
          <StrategicHorizontalBars
            rows={rows}
            categoryKey={categoryKey}
            series={series}
            height={height}
          />
        ) : (
          <div className="min-w-0 overflow-hidden">
            <ResponsiveContainer width="100%" height={height}>
              {chart}
            </ResponsiveContainer>
          </div>
        )
      ) : (
        <div className="flex h-[150px] items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
          Os dados aparecerão após a importação.
        </div>
      )}
    </section>
  );
}

function StrategicHorizontalBars({
  rows,
  categoryKey,
  series,
  height,
}: {
  rows: Record<string, unknown>[];
  categoryKey: string;
  series: StrategicSeries[];
  height: number;
}) {
  const maximumBySeries = new Map(
    series.map((item) => [
      item.key,
      Math.max(1, ...rows.map((row) => Math.abs(Number(row[item.key] ?? 0)))),
    ]),
  );

  return (
    <div
      className="space-y-3 overflow-auto rounded-md bg-muted/20 p-2"
      style={{ maxHeight: Math.max(180, height) }}
    >
      {rows.map((row, rowIndex) => (
        <div key={`${String(row[categoryKey])}-${rowIndex}`} className="min-w-0">
          <div className="mb-1 truncate text-[10px] font-bold text-foreground" title={String(row[categoryKey])}>
            {String(row[categoryKey])}
          </div>
          <div className="space-y-1.5">
            {series.map((item) => {
              const value = Number(row[item.key] ?? 0);
              const maximum = maximumBySeries.get(item.key) ?? 1;
              return (
                <div key={item.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <div className="h-2.5 overflow-hidden rounded-full bg-border/45">
                    <div
                      className="h-full min-w-0 rounded-full"
                      style={{
                        width: `${Math.max(value > 0 ? 2 : 0, (Math.abs(value) / maximum) * 100)}%`,
                        backgroundColor: item.color,
                      }}
                    />
                  </div>
                  <span className="min-w-16 whitespace-nowrap text-right text-[10px] font-semibold tabular-nums text-foreground">
                    {formatStrategicValue(value, item.currency)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function strategicSliceColor(index: number, primary: string, label?: unknown) {
  return semanticChartColor(label, index, primary);
}

function formatStrategicValue(value: number, currency = false) {
  const absolute = Math.abs(value);
  const divisor = absolute >= 1_000_000 ? 1_000_000 : absolute >= 1_000 ? 1_000 : 1;
  const suffix = divisor === 1_000_000 ? " mi" : divisor === 1_000 ? " mil" : "";
  const number = (value / divisor).toLocaleString("pt-BR", {
    minimumFractionDigits: divisor === 1 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${currency ? "R$ " : ""}${number}${suffix}`;
}

function formatCurrencyAxis(value: number) {
  if (value === 0) return "R$ 0";
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) {
    return `R$ ${(value / 1_000_000).toLocaleString("pt-BR", {
      maximumFractionDigits: 1,
    })} mi`;
  }
  if (absolute >= 1_000) {
    return `R$ ${(value / 1_000).toLocaleString("pt-BR", {
      maximumFractionDigits: 0,
    })} mil`;
  }
  return `R$ ${value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}

function truncateChartLabel(value: string, limit = 19) {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
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

function GuestProfileOverview({
  settings,
  states,
  countries,
  revenue,
  civil,
  gender,
  profession,
  age,
}: {
  settings: DashboardWidgetSettings;
  states: { uf: string; label: string; value: number; receita: number }[];
  countries: { code: string; name: string; value: number; receita: number }[];
  revenue: { name: string; value: number }[];
  civil: { name: string; value: number }[];
  gender: { name: string; value: number }[];
  profession: { name: string; value: number }[];
  age: { name: string; value: number }[];
}) {
  const [mapMode, setMapMode] = useState<"brasil" | "mundo">("brasil");
  return (
    <section className="guest-profile-overview h-full min-w-0 overflow-hidden rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xs font-bold uppercase text-pine-dark">{settings.title}</h2>
          <p className="text-[10px] text-muted-foreground">
            Cor = receita · intensidade/tamanho = frequência · detalhes ao passar o mouse
          </p>
        </div>
        <div className="flex rounded-lg border border-border bg-muted p-1">
          {(["brasil", "mundo"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setMapMode(mode)}
              className={`rounded px-3 py-1 text-[10px] font-bold capitalize ${
                mapMode === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>
      <div className="grid min-h-0 gap-3 xl:h-[calc(100%-44px)] xl:grid-cols-[minmax(0,1.25fr)_minmax(420px,0.9fr)]">
        <div className="min-h-[380px] overflow-hidden rounded-lg border border-border/70 bg-muted/30">
          {mapMode === "brasil" ? (
            <BrazilGuestMap rows={states} color={settings.color} />
          ) : (
            <WorldGuestBubbleMap
              rows={countries}
              settings={{ ...settings, title: "Origem mundial", height: 405 }}
              embedded
            />
          )}
        </div>
        <div className="grid min-h-0 grid-cols-1 gap-2 sm:grid-cols-2">
          <ProfileDonut title="Receita" rows={revenue} currency />
          <ProfileDonut title="Sexo" rows={gender} />
          <ProfileDonut title="Estado civil" rows={civil} />
          <ProfileDonut title="Profissão" rows={profession} />
          <ProfileDonut title="Idade" rows={age} />
          <ProfileSummary
            total={gender.reduce((sum, row) => sum + row.value, 0)}
            states={states.length}
            countries={countries.length}
          />
        </div>
      </div>
    </section>
  );
}

function ProfileSummary({
  total,
  states,
  countries,
}: {
  total: number;
  states: number;
  countries: number;
}) {
  return (
    <article className="grid min-h-[150px] place-content-center rounded-lg border border-border/70 bg-[linear-gradient(145deg,var(--primary)_8%,var(--card))] p-3 text-center">
      <strong className="font-serif text-2xl text-pine-dark">{total}</strong>
      <span className="text-[9px] font-bold uppercase text-muted-foreground">hóspedes no perfil</span>
      <div className="mt-2 flex justify-center gap-3 text-[9px] text-muted-foreground">
        <span>{states} estados</span>
        <span>{countries} países</span>
      </div>
    </article>
  );
}

function BrazilGuestMap({
  rows,
  color,
}: {
  rows: { uf: string; label: string; value: number; receita: number }[];
  color: string;
}) {
  const map = Brazil as {
    viewBox: string;
    locations: { id: string; name: string; path: string }[];
  };
  const rowByUf = new Map(rows.map((row) => [row.uf.toLowerCase(), row]));
  const maxRevenue = Math.max(1, ...rows.map((row) => row.receita));
  return (
    <div className="grid h-full min-h-[380px] grid-cols-1 sm:grid-cols-[minmax(0,1fr)_160px]">
      <svg
        viewBox={map.viewBox}
        className="h-full max-h-[410px] w-full p-3"
        role="img"
        aria-label="Mapa coroplético do Brasil por origem e receita dos hóspedes"
      >
        {map.locations.map((location) => {
          const row = rowByUf.get(location.id);
          const intensity = row ? 0.22 + (row.receita / maxRevenue) * 0.78 : 0.06;
          return (
            <path
              key={location.id}
              d={location.path}
              fill={row ? color : "var(--pine-dark)"}
              fillOpacity={intensity}
              stroke="var(--card-solid)"
              strokeWidth="1.8"
              className="transition hover:fill-opacity-100"
            >
              <title>
                {row
                  ? `${row.label}: ${row.value} hóspede(s) · ${fmtBRL(row.receita)}`
                  : `${location.name}: sem dados`}
              </title>
            </path>
          );
        })}
      </svg>
      <div className="border-t border-border/70 p-3 sm:border-l sm:border-t-0">
        <strong className="text-[10px] uppercase text-pine-dark">Estados líderes</strong>
        <div className="mt-2 space-y-2">
          {rows.slice(0, 7).map((row, index) => (
            <div key={row.uf} className="min-w-0">
              <div className="flex items-center justify-between gap-1 text-[9px]">
                <span className="truncate font-bold text-pine-dark">
                  {index + 1}. {row.uf}
                </span>
                <span className="whitespace-nowrap text-muted-foreground">{row.value} hóspedes</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(4, (row.receita / maxRevenue) * 100)}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
              <p className="mt-0.5 text-right text-[9px] font-semibold text-primary">
                {fmtBRL(row.receita)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProfileDonut({
  title,
  rows,
  currency = false,
}: {
  title: string;
  rows: { name: string; value: number }[];
  currency?: boolean;
}) {
  const visible = rows.slice(0, 5);
  const total = visible.reduce((sum, row) => sum + row.value, 0);
  return (
    <article className="min-h-0 overflow-hidden rounded-lg border border-border/70 bg-muted/20 p-2">
      <h3 className="text-[10px] font-bold uppercase text-pine-dark">{title}</h3>
      <div className="grid h-[calc(100%-18px)] min-h-[150px] grid-cols-[46%_54%] items-center">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={visible}
              dataKey="value"
              nameKey="name"
              innerRadius="50%"
              outerRadius="78%"
              paddingAngle={2}
            >
              {visible.map((row, index) => (
                <Cell
                  key={row.name}
                  fill={semanticChartColor(row.name, index, "var(--pine)")}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => (currency ? fmtBRL(Number(value)) : Number(value))}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="min-w-0 space-y-1.5">
          {visible.map((row, index) => (
            <div key={row.name} className="grid min-w-0 grid-cols-[8px_1fr_auto] items-center gap-1">
              <span
                className="h-2 w-2 rounded-full"
                style={{
                  backgroundColor: semanticChartColor(row.name, index, "var(--pine)"),
                }}
              />
              <span className="truncate text-[9px] text-pine-dark" title={row.name}>
                {row.name}
              </span>
              <strong className="whitespace-nowrap text-[8px] text-muted-foreground">
                {currency
                  ? fmtBRL(row.value)
                  : `${row.value} · ${total ? ((row.value / total) * 100).toFixed(0) : 0}%`}
              </strong>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

function WorldGuestBubbleMap({
  rows,
  settings,
  embedded = false,
}: {
  rows: { code: string; name: string; value: number; receita: number }[];
  settings: DashboardWidgetSettings;
  embedded?: boolean;
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  const height = Math.max(70, settings.height - 66);
  const rowByNumericId = new Map(
    rows.flatMap((row) => {
      const id = WORLD_COUNTRY_NUMERIC_ID[row.code];
      return id ? [[id, row] as const] : [];
    }),
  );
  const topOrigins = rows.slice(0, 4);
  return (
    <section
      className={`h-full overflow-hidden ${
        embedded ? "bg-transparent" : "rounded-xl border border-border bg-card shadow-sm"
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="px-3 pt-3">
          <h2 className="text-xs font-bold uppercase text-pine-dark">{settings.title}</h2>
          <p className="text-[10px] text-muted-foreground">
            Cor = presença · bolha = frequência · passe o mouse para ver a receita
          </p>
        </div>
        <div className="mr-3 mt-3 rounded-full bg-primary/10 px-2.5 py-1 text-[9px] font-bold text-primary">
          {rows.reduce((sum, row) => sum + row.value, 0)} hóspedes
        </div>
      </div>
      <svg
        viewBox="0 0 800 360"
        className="w-full bg-[radial-gradient(circle_at_48%_46%,color-mix(in_srgb,var(--chart-2)_13%,var(--card)),var(--card)_66%)]"
        style={{ height }}
        role="img"
        aria-label="Mapa mundial da origem dos hóspedes"
      >
        <defs>
          <filter id="guest-bubble-shadow" x="-60%" y="-60%" width="220%" height="220%">
            <feDropShadow dx="0" dy="3" stdDeviation="4" floodOpacity="0.25" />
          </filter>
        </defs>
        <NaturalEarth
          data={WORLD_FEATURES}
          scale={128}
          translate={[400, 184]}
        >
          {({ features, projection }) => (
            <>
              {features.map(({ feature: country, path }) => {
                const row = rowByNumericId.get(String(country.id ?? "").padStart(3, "0"));
                const intensity = row ? 0.28 + (row.value / max) * 0.56 : 0.08;
                return (
                  <path
                    key={String(country.id ?? path)}
                    d={path ?? ""}
                    fill={row ? settings.color : "var(--pine-dark)"}
                    fillOpacity={intensity}
                    stroke="var(--card)"
                    strokeWidth="0.8"
                  >
                    <title>
                      {row
                        ? `${row.name}: ${row.value} hóspede(s) · ${fmtBRL(row.receita)}`
                        : country.properties?.name ?? "Sem hóspedes registrados"}
                    </title>
                  </path>
                );
              })}
              {rows.map((row) => {
                const coordinates =
                  WORLD_COUNTRY_COORDINATES[row.code] ?? WORLD_COUNTRY_COORDINATES.OTHER;
                const point = projection(coordinates);
                if (!point) return null;
                const radius = 5 + Math.sqrt(row.value / max) * 15;
                return (
                  <g key={row.code} filter="url(#guest-bubble-shadow)">
                    <circle
                      cx={point[0]}
                      cy={point[1]}
                      r={radius + 4}
                      fill={settings.color}
                      fillOpacity="0.16"
                    />
                    <circle
                      cx={point[0]}
                      cy={point[1]}
                      r={radius}
                      fill={settings.color}
                      fillOpacity="0.88"
                      stroke="var(--card)"
                      strokeWidth="2.5"
                    >
                      <title>{`${row.name}: ${row.value} hóspede(s) · ${fmtBRL(row.receita)}`}</title>
                    </circle>
                    <text
                      x={point[0]}
                      y={point[1] + 3}
                      textAnchor="middle"
                      fill="white"
                      fontSize="8"
                      fontWeight="800"
                    >
                      {row.code}
                    </text>
                  </g>
                );
              })}
            </>
          )}
        </NaturalEarth>
      </svg>
      <div className="grid grid-cols-2 gap-px border-t border-border bg-border sm:grid-cols-4">
        {topOrigins.length ? (
          topOrigins.map((row) => (
            <div key={row.code} className="min-w-0 bg-card px-3 py-2">
              <div className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: settings.color }}
                />
                <strong className="truncate text-[10px] text-pine-dark">{row.name}</strong>
              </div>
              <p className="truncate text-[9px] text-muted-foreground">
                {row.value} hóspede(s) · {fmtBRL(row.receita)}
              </p>
            </div>
          ))
        ) : (
          <p className="col-span-full bg-card px-3 py-3 text-xs text-muted-foreground">
            Cadastre cidade, estado ou país do hóspede para preencher o mapa.
          </p>
        )}
      </div>
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

function buildAgeDistribution(
  reservations: Reservation[],
  clients: Client[],
  clientById: Map<string, Client>,
  referenceDate: string,
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
  const order = ["Até 17", "18–24", "25–34", "35–44", "45–59", "60+", "Não informado"];
  const counts = new Map(order.map((name) => [name, 0]));
  const reference = new Date(`${referenceDate}T12:00:00`);

  source.forEach((client) => {
    const birthValue = String(client.data_nascimento ?? "").slice(0, 10);
    const birth = birthValue ? new Date(`${birthValue}T12:00:00`) : null;
    if (!birth || Number.isNaN(birth.getTime()) || birth > reference) {
      counts.set("Não informado", (counts.get("Não informado") ?? 0) + 1);
      return;
    }
    let age = reference.getFullYear() - birth.getFullYear();
    const beforeBirthday =
      reference.getMonth() < birth.getMonth() ||
      (reference.getMonth() === birth.getMonth() && reference.getDate() < birth.getDate());
    if (beforeBirthday) age -= 1;
    const range =
      age <= 17
        ? "Até 17"
        : age <= 24
          ? "18–24"
          : age <= 34
            ? "25–34"
            : age <= 44
              ? "35–44"
              : age <= 59
                ? "45–59"
                : "60+";
    counts.set(range, (counts.get(range) ?? 0) + 1);
  });

  return order
    .map((name) => ({ name, value: counts.get(name) ?? 0 }))
    .filter((row) => row.value > 0);
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

function buildWeekdayOccupancy(
  reservations: Reservation[],
  roomCount: number,
  start: string,
  end: string,
) {
  const labels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const totals = labels.map(() => ({ occupied: 0, available: 0 }));
  const cursor = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  while (cursor <= last) {
    const date = cursor.toISOString().slice(0, 10);
    const weekday = cursor.getDay();
    totals[weekday].available += roomCount;
    totals[weekday].occupied += reservations.filter(
      (reservation) =>
        reservation.status !== "cancelado" &&
        reservation.status !== "manutencao" &&
        reservation.checkin <= date &&
        reservation.checkout > date,
    ).length;
    cursor.setDate(cursor.getDate() + 1);
  }
  return labels.map((dia, index) => ({
    dia,
    ocupacao: totals[index].available
      ? Number(((totals[index].occupied / totals[index].available) * 100).toFixed(2))
      : 0,
  }));
}

function buildPaymentRows(reservations: Reservation[], sales: Sale[]) {
  const rows = new Map<string, number>();
  reservations.forEach((reservation) => {
    const name = String(reservation.pagamento || "Não informado");
    rows.set(name, (rows.get(name) ?? 0) + Number(reservation.valor_pago ?? 0));
  });
  sales.forEach((sale) => {
    const name = String(sale.pagamento || "Não informado");
    rows.set(name, (rows.get(name) ?? 0) + Number(sale.valor_pago ?? 0));
  });
  return [...rows]
    .map(([name, value]) => ({ name: labelize(name), value }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);
}

function matchesAccommodationFilter(
  reservation: Reservation,
  room: Room | undefined,
  filter: string,
) {
  if (filter === "todos") return true;
  const label = normalizeText(room ? roomLabel(room) : "");
  const price = Number(room?.preco ?? reservation.valor_diaria ?? 0);
  if (filter === "padrao") return label.includes("padrao") || price === 90;
  if (filter === "superior") return label.includes("superior") || price === 110;
  return true;
}

function matchesReservationStatus(reservation: Reservation, filter: string) {
  if (filter === "todos") return true;
  const status = normalizeText(String(reservation.status ?? ""));
  if (filter === "confirmada") return status.includes("confirm");
  if (filter === "checkin") return status.includes("checkin") || status.includes("hosped");
  if (filter === "cancelada") return status.includes("cancel");
  if (filter === "sinal") {
    const total = Number(reservation.valor_total ?? 0);
    const paid = Number(reservation.valor_pago ?? 0);
    return total > 0 && paid < total * 0.5;
  }
  return true;
}

function matchesChannelFilter(reservation: Reservation, filter: string) {
  if (filter === "todos") return true;
  const channel = normalizeText(readChannel(reservation));
  if (filter === "whatsapp") return channel.includes("whatsapp") || channel === "wh";
  if (filter === "balcao") {
    return ["balcao", "direto", "telefone", "hospedin", "fo"].some((value) =>
      channel.includes(value),
    );
  }
  if (filter === "ota") {
    return ["booking", "expedia", "airbnb", "decolar", "ota", "bo"].some((value) =>
      channel.includes(value),
    );
  }
  return true;
}

function buildRoomTypeDistribution(reservations: Reservation[], rooms: Room[]) {
  const roomByNumber = new Map(rooms.map((room) => [room.numero, room]));
  const counts = new Map<string, number>();
  reservations.forEach((reservation) => {
    if (reservation.status === "cancelado" || reservation.status === "manutencao") return;
    const room = roomByNumber.get(reservation.quarto);
    const label = room ? roomLabel(room) : "Não informado";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });
  return [...counts]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

function buildRoomTypePerformance(
  reservations: Reservation[],
  rooms: Room[],
  start: string,
  end: string,
) {
  const roomByNumber = new Map(rooms.map((room) => [room.numero, room]));
  const roomCountByType = new Map<string, number>();
  rooms.forEach((room) => {
    const type = roomLabel(room);
    roomCountByType.set(type, (roomCountByType.get(type) ?? 0) + 1);
  });
  const rows = new Map<string, { receita: number; noites: number }>();
  reservations.forEach((reservation) => {
    if (reservation.status === "cancelado" || reservation.status === "manutencao") return;
    const room = roomByNumber.get(reservation.quarto);
    const type = room ? roomLabel(room) : "Não informado";
    const current = rows.get(type) ?? { receita: 0, noites: 0 };
    current.receita += reservationRevenue(reservation);
    current.noites += Math.max(0, Number(reservation.diarias ?? 0));
    rows.set(type, current);
  });
  const days = Math.max(
    1,
    Math.round(
      (new Date(`${end}T12:00:00`).getTime() -
        new Date(`${start}T12:00:00`).getTime()) /
        86_400_000,
    ) + 1,
  );
  return [...rows]
    .map(([tipo, row]) => {
      const available = (roomCountByType.get(tipo) ?? 1) * days;
      return {
        tipo,
        receita: row.receita,
        adr: safeDivide(row.receita, row.noites),
        ocupacao: Number(((row.noites / Math.max(1, available)) * 100).toFixed(2)),
      };
    })
    .sort((a, b) => b.receita - a.receita);
}

function buildFeedbackCriteria(feedbacks: Feedback[]) {
  const criteria = [
    ["Geral", "nota_geral"],
    ["Atendimento", "nota_atendimento"],
    ["Limpeza", "nota_limpeza"],
    ["Conforto", "nota_conforto"],
    ["Wi-Fi", "nota_wifi"],
    ["Comodidades", "nota_chuveiro"],
  ] as const;
  return criteria.map(([name, key]) => {
    const values = feedbacks
      .map((feedback) => Number(feedback[key] ?? 0))
      .filter((value) => value > 0);
    return { name, value: values.length ? Number(average(values).toFixed(2)) : 0 };
  });
}

function buildComplaintRows(complaints: Complaint[]) {
  const rows = new Map<string, number>();
  complaints.forEach((complaint) => {
    const name = labelize(String(complaint.categoria || "Geral"));
    rows.set(name, (rows.get(name) ?? 0) + 1);
  });
  return [...rows]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
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

type WorldCountryProperties = { name?: string };
type WorldTopology = Topology<{
  countries: TopologyGeometryCollection<WorldCountryProperties>;
}>;

const typedWorldAtlas = worldAtlas as unknown as WorldTopology;
const WORLD_FEATURES = (
  feature(typedWorldAtlas, typedWorldAtlas.objects.countries) as FeatureCollection<
    Geometry,
    WorldCountryProperties
  >
).features as Feature<Geometry, WorldCountryProperties>[];

const WORLD_COUNTRY_COORDINATES: Record<string, [number, number]> = {
  BR: [-51.9, -14.2],
  AR: [-63.6, -38.4],
  CL: [-71.5, -35.7],
  US: [-100.4, 39.8],
  CA: [-106.3, 56.1],
  MX: [-102.5, 23.6],
  PT: [-8.2, 39.4],
  ES: [-3.7, 40.4],
  FR: [2.2, 46.2],
  DE: [10.5, 51.2],
  IT: [12.6, 41.9],
  GB: [-3.4, 55.4],
  AO: [17.9, -11.2],
  ZA: [22.9, -30.6],
  CN: [104.2, 35.9],
  JP: [138.3, 36.2],
  IN: [78.9, 20.6],
  AU: [133.8, -25.3],
  OTHER: [0, 0],
};

const WORLD_COUNTRY_NUMERIC_ID: Record<string, string> = {
  BR: "076",
  AR: "032",
  CL: "152",
  US: "840",
  CA: "124",
  MX: "484",
  PT: "620",
  ES: "724",
  FR: "250",
  DE: "276",
  IT: "380",
  GB: "826",
  AO: "024",
  ZA: "710",
  CN: "156",
  JP: "392",
  IN: "356",
  AU: "036",
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
