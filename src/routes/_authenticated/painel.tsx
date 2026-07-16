import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  BedDouble,
  CalendarClock,
  ClipboardCheck,
  Coffee,
  DollarSign,
  DoorOpen,
  MessageSquareWarning,
  Star,
  Wifi,
  AlertTriangle,
  FileText,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  Cell,
} from "recharts";
import {
  useRooms,
  useReservations,
  useSales,
  useClients,
  useKitchenItems,
  useKitchenProductions,
  useComplaints,
  useFeedbacks,
  useExpenses,
  useInsert,
  useUpdate,
  roomStatusToday,
  type Room,
  type Reservation,
  type Sale,
  type Client,
  type KitchenItem,
  type KitchenProduction,
  type Expense,
  type Feedback,
} from "@/lib/data";
import { fmtBRL, todayISO } from "@/lib/format";
import { complaintLabel } from "@/lib/constants";
import { PageHeader } from "@/components/AppLayout";
import { Badge } from "@/components/ui-kit";
import { useRole, useSession } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/painel")({
  component: Painel,
});

function Painel() {
  const { user } = useSession();
  const { data: role } = useRole(user);
  const [period, setPeriod] = useState<"dia" | "mes" | "ano">("mes");
  const today = todayISO();
  const month = today.slice(0, 7);
  const previousMonth = addMonths(month, -1);
  const previousYearMonth = addYears(month, -1);
  const { data: rooms = [] } = useRooms();
  const { data: reservations = [] } = useReservations();
  const { data: sales = [] } = useSales();
  const { data: clients = [] } = useClients();
  const { data: kitchenItems = [] } = useKitchenItems();
  const { data: kitchenProductions = [] } = useKitchenProductions();
  const { data: complaints = [] } = useComplaints();
  const { data: feedbacks = [] } = useFeedbacks();
  const { data: expenses = [] } = useExpenses();
  const updateRoom = useUpdate("rooms", ["rooms"]);
  const insertComplaint = useInsert("complaints", ["complaints"]);
  const updateComplaint = useUpdate("complaints", ["complaints"]);
  const insertKitchenItem = useInsert("kitchen_items", ["kitchen_items"]);
  const updateKitchenItem = useUpdate("kitchen_items", ["kitchen_items"]);
  const insertKitchenProduction = useInsert("kitchen_productions", ["kitchen_productions"]);

  const statuses = rooms.map((r) => roomStatusToday(reservations, r.numero, today));
  const ocupados = statuses.filter((s) => s === "ocupado").length;
  const reservados = statuses.filter((s) => s === "reservado").length;
  const livres = statuses.filter((s) => s === "livre").length;
  const ocupacao = rooms.length ? Math.round((ocupados / rooms.length) * 100) : 0;

  const receitaMes =
    reservations
      .filter((r) => (r.checkin || "").slice(0, 7) === month)
      .reduce((s, r) => s + Number(r.valor_pago), 0) +
    sales.filter((s) => (s.data || "").slice(0, 7) === month).reduce((s, v) => s + Number(v.total), 0);

  const aReceber = reservations
    .filter((r) => !r.pago && r.status !== "cancelado" && r.status !== "finalizado")
    .reduce((s, r) => s + (Number(r.valor_total) - Number(r.valor_pago)), 0);

  const despesasMes = expenses
    .filter((e) => (e.data || "").slice(0, 7) === month)
    .reduce((s, e) => s + Number(e.valor), 0);
  const margemMes = receitaMes - despesasMes;
  const activeToday = reservations.filter(
    (r) =>
      r.status !== "cancelado" &&
      r.status !== "finalizado" &&
      r.status !== "manutencao" &&
      r.checkin <= today &&
      r.checkout >= today,
  );
  const ocupantesHoje = activeToday.reduce((sum, r) => sum + Number(r.pessoas ?? 1), 0);
  const capacidadeTotal = rooms.reduce((sum, room) => sum + roomCapacity(room.configuracao), 0);
  const diariaMedia = reservations.length
    ? reservations.reduce((sum, r) => sum + Number(r.valor_diaria), 0) / reservations.length
    : rooms.length
      ? rooms.reduce((sum, r) => sum + Number(r.preco), 0) / rooms.length
      : 0;

  const abertas = complaints.filter((c) => c.status !== "resolvido");
  const notas = feedbacks.map((f) => f.nota_geral).filter((n): n is number => n != null);
  const media = notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : 0;

  const currentMetrics = useMemo(
    () => buildMonthMetrics(month, reservations, sales, expenses, feedbacks, rooms.length),
    [month, reservations, sales, expenses, feedbacks, rooms.length],
  );
  const previousMonthMetrics = useMemo(
    () => buildMonthMetrics(previousMonth, reservations, sales, expenses, feedbacks, rooms.length),
    [previousMonth, reservations, sales, expenses, feedbacks, rooms.length],
  );
  const previousYearMetrics = useMemo(
    () => buildMonthMetrics(previousYearMonth, reservations, sales, expenses, feedbacks, rooms.length),
    [previousYearMonth, reservations, sales, expenses, feedbacks, rooms.length],
  );

  const byRoom = new Map<number, number>();
  complaints
    .filter((c) => c.status !== "resolvido")
    .forEach((c) => {
      if (c.quarto != null) byRoom.set(c.quarto, (byRoom.get(c.quarto) ?? 0) + 1);
    });
  const recorrentes = [...byRoom.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]);

  const wifiCount = complaints.filter((c) => c.categoria === "wifi").length;

  // --- Temporal series (last 30 days) ---
  const series = useMemo(() => buildSeries(reservations, sales, today), [reservations, sales, today]);
  const totals = useMemo(
    () =>
      series.reduce(
        (acc, d) => {
          acc.receita += d.receita;
          acc.cancelamentos += d.cancelamentos;
          acc.comparecimento += d.comparecimento;
          return acc;
        },
        { receita: 0, cancelamentos: 0, comparecimento: 0 },
      ),
    [series],
  );
  const alerta = totals.cancelamentos > totals.comparecimento && totals.cancelamentos > 0;
  const dailyAverage = series.length ? series.reduce((sum, day) => sum + day.receita, 0) / series.length : 0;
  const monthlySeries = useMemo(
    () => buildMonthlySeries(month, reservations, sales, expenses),
    [month, reservations, sales, expenses],
  );
  const monthlyAverage = monthlySeries.length
    ? monthlySeries.reduce((sum, item) => sum + item.receita, 0) / monthlySeries.length
    : 0;
  const decisionSeries = useMemo(
    () => buildDecisionSeries(period, today, month, reservations, sales, expenses),
    [period, today, month, reservations, sales, expenses],
  );
  const decisionAverage = decisionSeries.length
    ? decisionSeries.reduce((sum, item) => sum + item.receita, 0) / decisionSeries.length
    : 0;
  const forecastSeries = useMemo(() => buildForecastSeries(reservations, rooms.length, today), [reservations, rooms.length, today]);
  const expenseLaunchAlert = useMemo(
    () => shouldWarnMissingExpenses(expenses, reservations, today),
    [expenses, reservations, today],
  );
  const currentRevpar = revparForMonth(month, currentMetrics.receita, rooms.length);
  const previousMonthRevpar = revparForMonth(previousMonth, previousMonthMetrics.receita, rooms.length);
  const previousYearRevpar = revparForMonth(previousYearMonth, previousYearMetrics.receita, rooms.length);
  const reportHref = `/imprimir?tipo=relatorio&data=${encodeURIComponent(today)}&periodo=${encodeURIComponent(period)}&quartos=${rooms.length}&livres=${livres}&ocupados=${ocupados}&reservados=${reservados}&ocupacao=${ocupacao}&ocupantes=${ocupantesHoje}&capacidade=${capacidadeTotal}&receita=${Math.round(currentMetrics.receita)}&despesas=${Math.round(currentMetrics.despesas)}&areceber=${Math.round(aReceber)}&revpar=${Math.round(currentRevpar)}&avaliacao=${encodeURIComponent(currentMetrics.avaliacao ? currentMetrics.avaliacao.toFixed(1) : "-")}&reclamacoes=${abertas.length}&cancelamentos=${totals.cancelamentos}&comparecimento=${totals.comparecimento}`;

  const receitaPorQuarto = useMemo(() => {
    const m = new Map<number, number>();
    reservations.forEach((r) => m.set(r.quarto, (m.get(r.quarto) ?? 0) + Number(r.valor_pago)));
    sales.forEach((s) => m.set(s.quarto, (m.get(s.quarto) ?? 0) + Number(s.total)));
    return [...m.entries()]
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([quarto, receita]) => ({ quarto: `Q${quarto}`, receita }));
  }, [reservations, sales]);

  const arrivalsToday = reservations.filter((r) => r.status !== "cancelado" && r.checkin === today);
  const departuresToday = reservations.filter((r) => r.status !== "cancelado" && r.checkout === today);

  if (role === "limpeza") {
    return (
      <LimpezaPainel
        rooms={rooms}
        reservations={reservations}
        complaints={complaints}
        today={today}
        departuresToday={departuresToday}
        kitchenItems={kitchenItems}
        insertKitchenItem={insertKitchenItem}
        updateKitchenItem={updateKitchenItem}
        updateRoom={updateRoom}
        insertComplaint={insertComplaint}
        updateComplaint={updateComplaint}
      />
    );
  }

  if (role === "cafe") {
    return (
      <CafePainel
        activeToday={activeToday}
        ocupantesHoje={ocupantesHoje}
        capacidadeTotal={capacidadeTotal}
        today={today}
        kitchenItems={kitchenItems}
        kitchenProductions={kitchenProductions}
        insertKitchenItem={insertKitchenItem}
        updateKitchenItem={updateKitchenItem}
        insertKitchenProduction={insertKitchenProduction}
      />
    );
  }

  if (role === "recepcao") {
    return (
      <RecepcaoPainel
        ocupacao={ocupacao}
        ocupados={ocupados}
        reservados={reservados}
        livres={livres}
        arrivalsToday={arrivalsToday}
        departuresToday={departuresToday}
        aReceber={aReceber}
        abertas={abertas.length}
        ocupantesHoje={ocupantesHoje}
        kitchenItems={kitchenItems}
        insertKitchenItem={insertKitchenItem}
        updateKitchenItem={updateKitchenItem}
      />
    );
  }

  return (
    <div>
      <OwnerDashboardHero period={period} setPeriod={setPeriod} today={today} reportHref={reportHref} />

      {alerta && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-brick/40 bg-brick-bg px-4 py-3 text-sm text-brick">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Atenção: cancelamentos acima do comparecimento</p>
            <p>
              Nos últimos 30 dias houve {totals.cancelamentos} cancelamento(s) contra {totals.comparecimento}{" "}
              comparecimento(s), com receita de {fmtBRL(totals.receita)}. Vale investigar o motivo dos cancelamentos.
            </p>
          </div>
        </div>
      )}

      {expenseLaunchAlert && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-brass/50 bg-brass/15 px-4 py-3 text-sm text-pine-dark">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-brass" />
          <div>
            <p className="font-semibold">Atenção: hotel ocupado sem lançamento de despesas</p>
            <p>
              Há hóspedes ativos e nenhum custo registrado nos últimos dias. Confira café, limpeza, reposição e compras para a margem não ficar artificialmente alta.
            </p>
          </div>
        </div>
      )}

      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <PipelineCard tone="brass" title="Disponibilidade" value={`${livres}`} label="quartos livres" hint={`${ocupados} ocupados · ${reservados} reservados`} />
        <PipelineCard tone="pine" title="Hospedagem" value={`${ocupacao}%`} label="ocupação hoje" hint={`${ocupantesHoje} ocupantes · capacidade ${capacidadeTotal}`} />
        <PipelineCard tone="sage" title="Receita" value={fmtBRL(receitaMes)} label="receita do mês" hint={`A receber: ${fmtBRL(aReceber)}`} />
        <PipelineCard tone="brick" title="Operação" value={String(abertas.length)} label="reclamações abertas" hint={`${wifiCount} sobre Wi-Fi`} />
        <PipelineCard tone="pine" title="Experiência" value={media ? media.toFixed(1) : "—"} label="avaliação média" hint={`${feedbacks.length} avaliações`} />
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <ComparisonStat
          icon={<DollarSign />}
          label="Receitas totais"
          value={fmtBRL(currentMetrics.receita)}
          monthDelta={delta(currentMetrics.receita, previousMonthMetrics.receita)}
          yearDelta={delta(currentMetrics.receita, previousYearMetrics.receita)}
        />
        <ComparisonStat
          icon={<DollarSign />}
          label="Despesas"
          value={fmtBRL(currentMetrics.despesas)}
          monthDelta={delta(currentMetrics.despesas, previousMonthMetrics.despesas)}
          yearDelta={delta(currentMetrics.despesas, previousYearMetrics.despesas)}
          lowerIsBetter
        />
        <ComparisonStat
          icon={<TrendingUp />}
          label="RevPAR"
          value={fmtBRL(currentRevpar)}
          monthDelta={delta(currentRevpar, previousMonthRevpar)}
          yearDelta={delta(currentRevpar, previousYearRevpar)}
        />
        <ComparisonStat
          icon={<BedDouble />}
          label="Ocupação mensal"
          value={`${currentMetrics.ocupacao}%`}
          monthDelta={delta(currentMetrics.ocupacao, previousMonthMetrics.ocupacao)}
          yearDelta={delta(currentMetrics.ocupacao, previousYearMetrics.ocupacao)}
        />
        <ComparisonStat
          icon={<Star />}
          label="Avaliação"
          value={currentMetrics.avaliacao ? currentMetrics.avaliacao.toFixed(1) : "—"}
          monthDelta={delta(currentMetrics.avaliacao, previousMonthMetrics.avaliacao)}
          yearDelta={delta(currentMetrics.avaliacao, previousYearMetrics.avaliacao)}
        />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-4">
        <div className="card-surface border-t-4 border-t-pine bg-[linear-gradient(180deg,rgba(35,77,56,0.08),var(--card)_42%)] p-3">
          <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
            <h3 className="section-title text-sm">Receita por {period === "dia" ? "hora" : period === "mes" ? "dia do mês" : "mês"}</h3>
            <PerformanceLegend />
          </div>
          <ResponsiveContainer width="100%" height={176}>
            <BarChart data={decisionSeries} margin={{ left: -10, right: 8, top: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => fmtBRL(v)} />
              <Bar dataKey="receita" name="Receita" radius={[4, 4, 0, 0]}>
                {decisionSeries.map((entry) => (
                  <Cell key={entry.key} fill={performanceColor(entry.receita, decisionAverage)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card-surface border-t-4 border-t-sage bg-[linear-gradient(180deg,rgba(88,139,105,0.12),var(--card)_44%)] p-3">
          <h3 className="section-title mb-2 text-sm">Previsão 30 dias</h3>
          <ResponsiveContainer width="100%" height={176}>
            <LineChart data={forecastSeries} margin={{ left: -16, right: 8, top: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number, name: string) => (name === "Receita" ? fmtBRL(v) : `${v}%`)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="ocupacao" name="Ocupação" stroke="var(--sage)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="receita" name="Receita" stroke="var(--brass)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card-surface border-t-4 border-t-brass bg-[linear-gradient(180deg,rgba(208,178,91,0.14),var(--card)_44%)] p-3">
          <h3 className="section-title mb-2 text-sm">Receita mensal x despesas</h3>
          <ResponsiveContainer width="100%" height={176}>
            <BarChart data={monthlySeries} margin={{ left: -10, right: 8, top: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => fmtBRL(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="receita" name="Receita" radius={[4, 4, 0, 0]}>
                {monthlySeries.map((entry) => (
                  <Cell key={`receita-${entry.key}`} fill={performanceColor(entry.receita, monthlyAverage)} />
                ))}
              </Bar>
              <Bar dataKey="despesas" name="Despesas" fill="var(--brick)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card-surface border-t-4 border-t-brick bg-[linear-gradient(180deg,rgba(162,70,45,0.11),var(--card)_44%)] p-3">
          <h3 className="section-title mb-2 text-sm">Comparecimento x cancelamentos</h3>
          <ResponsiveContainer width="100%" height={176}>
            <LineChart data={series} margin={{ left: -20, right: 8, top: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="comparecimento" name="Comparecimento" stroke="var(--sage)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="cancelamentos" name="Cancelamentos" stroke="var(--brick)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
        <ChannelStrategy reservations={reservations} sales={sales} />
        <PricingSuggestion reservations={reservations} rooms={rooms} today={today} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
        <StaffSalesSummary sales={sales} />
        <EmployeeConsumptionSummary sales={sales} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
        <GuestDemographics clients={clients} />
        <ClientStateMap clients={clients} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3">
        <CustomerRetention clients={clients} reservations={reservations} today={today} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[1.15fr_0.85fr]">
        <RevenueExpenseHighlights reservations={reservations} sales={sales} expenses={expenses} />
        <OperationalReports
          kitchenItems={kitchenItems}
          kitchenProductions={kitchenProductions}
          cleaningRooms={rooms.filter((room) => roomStatusToday(reservations, room.numero, today, (room as { situacao?: string | null }).situacao) === "limpeza").length}
          maintenanceRooms={rooms.filter((room) => roomStatusToday(reservations, room.numero, today, (room as { situacao?: string | null }).situacao) === "manutencao").length}
          today={today}
        />
      </div>

      <div className="mt-3 card-surface border-t-4 border-t-sage bg-[linear-gradient(180deg,rgba(88,139,105,0.1),var(--card)_42%)] p-3">
        <h3 className="section-title mb-2 text-sm">Receita por quarto</h3>
        {receitaPorQuarto.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem receita registrada ainda.</p>
        ) : (
            <ResponsiveContainer width="100%" height={188}>
            <BarChart data={receitaPorQuarto} margin={{ left: -10, right: 8, top: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="quarto" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => fmtBRL(v)} />
              <Bar dataKey="receita" name="Receita" fill="var(--pine)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 2xl:grid-cols-2">
        <div className="card-surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="section-title text-lg">Quartos com problema recorrente</h3>
            <Link to="/reclamacoes" className="text-xs font-semibold text-pine hover:underline">
              ver todas
            </Link>
          </div>
          {recorrentes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum quarto com reclamações repetidas. Bom sinal! 🎉
            </p>
          ) : (
            <ul className="space-y-2">
              {recorrentes.map(([q, n]) => {
                const cats = complaints.filter((c) => c.quarto === q);
                const topCat = mostCommon(cats.map((c) => c.categoria));
                return (
                  <li key={q} className="flex items-center justify-between rounded-lg bg-brick-bg/50 px-3 py-2">
                    <div>
                      <span className="font-semibold">Quarto {q}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        principalmente: {complaintLabel(topCat)}
                      </span>
                    </div>
                    <Badge tone="brick">{n} reclamações</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="card-surface p-5">
          <div className="mb-3 flex items-center gap-2">
            <Wifi className="h-5 w-5 text-pine" />
            <h3 className="section-title text-lg">Wi-Fi: quarto x aparelho</h3>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Ajuda a saber se o problema é do quarto ou do aparelho do hóspede.
          </p>
          <WifiInsight complaints={complaints} feedbacks={feedbacks} />
        </div>
      </div>
    </div>
  );
}

function RecepcaoPainel({
  ocupacao,
  ocupados,
  reservados,
  livres,
  arrivalsToday,
  departuresToday,
  aReceber,
  abertas,
  ocupantesHoje,
  kitchenItems,
  insertKitchenItem,
  updateKitchenItem,
}: {
  ocupacao: number;
  ocupados: number;
  reservados: number;
  livres: number;
  arrivalsToday: Reservation[];
  departuresToday: Reservation[];
  aReceber: number;
  abertas: number;
  ocupantesHoje: number;
  kitchenItems: KitchenItem[];
  insertKitchenItem: ReturnType<typeof useInsert>;
  updateKitchenItem: ReturnType<typeof useUpdate>;
}) {
  const receptionStock = kitchenItems.filter((item) => item.ativo && sectorMatch(item, "recepcao"));
  const lowReception = receptionStock.filter(isLowStock);

  return (
    <div>
      <PageHeader
        title="Recepcao"
        subtitle="Entradas, saidas, quartos e cobrancas de hoje."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        <Stat icon={<BedDouble />} label="Ocupacao" value={`${ocupacao}%`} hint={`${ocupados} ocupados · ${reservados} reservados · ${livres} livres`} />
        <Stat icon={<CalendarClock />} label="Entradas hoje" value={String(arrivalsToday.length)} hint="Reservas com check-in hoje" />
        <Stat icon={<DoorOpen />} label="Saidas hoje" value={String(departuresToday.length)} hint="Reservas com check-out hoje" />
        <Stat icon={<DollarSign />} label="A receber" value={fmtBRL(aReceber)} hint="Reservas em aberto" />
        <Stat icon={<MessageSquareWarning />} label="Alertas" value={String(abertas)} hint={`${ocupantesHoje} ocupantes no hotel`} />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <TodayList title="Check-ins de hoje" empty="Nenhuma entrada prevista." reservations={arrivalsToday} />
        <TodayList title="Check-outs de hoje" empty="Nenhuma saida prevista." reservations={departuresToday} />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <QuickLink to="/mapa" icon={<BedDouble />} label="Abrir mapa de quartos" />
        <QuickLink to="/reservas" icon={<CalendarClock />} label="Cadastrar reserva" />
        <QuickLink to="/clientes" icon={<ClipboardCheck />} label="Consultar clientes" />
        <QuickLink to="/vendas" icon={<DollarSign />} label="Lancar venda" />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1.2fr]">
        <section className="card-surface p-4">
          <h3 className="section-title mb-3 text-base">Alertas da recepção</h3>
          <AlertList
            items={[
              aReceber > 0 ? `Cobrar ${fmtBRL(aReceber)} em reservas com saldo pendente.` : "",
              arrivalsToday.length > 0 ? `${arrivalsToday.length} entrada(s) para conferir documento e pagamento.` : "",
              departuresToday.length > 0 ? `${departuresToday.length} saída(s) para confirmar consumo e liberar limpeza.` : "",
              lowReception.length > 0 ? `${lowReception.length} item(ns) administrativo(s) abaixo do mínimo.` : "",
            ]}
          />
        </section>
        <SectorStockPanel
          title="Estoque administrativo"
          subtitle="Folhas sulfite, canetas, bobinas, itens de internet e material de recepção."
          sector="recepcao"
          defaultCategory="Recepção"
          items={receptionStock}
          insertKitchenItem={insertKitchenItem}
          updateKitchenItem={updateKitchenItem}
        />
      </div>
    </div>
  );
}

function OwnerDashboardHero({
  period,
  setPeriod,
  today,
  reportHref,
}: {
  period: "dia" | "mes" | "ano";
  setPeriod: (period: "dia" | "mes" | "ano") => void;
  today: string;
  reportHref: string;
}) {
  return (
    <section className="mb-3 overflow-hidden rounded-md border border-pine/20 bg-[linear-gradient(120deg,var(--pine-dark),var(--pine),var(--brass))] text-white shadow-sm">
      <div className="flex flex-col gap-2 px-3 py-2.5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70">Hotel Real Cruzilia</p>
          <h1 className="font-serif text-lg font-bold md:text-xl">Dashboard de operação</h1>
          <p className="mt-0.5 max-w-2xl text-[11px] text-white/80 md:text-xs">
            Ocupação, receita, clientes, canais e operação em uma visão de decisão.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={reportHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-xs font-bold text-pine-dark shadow-sm transition hover:bg-white/90"
          >
            <FileText className="h-4 w-4" /> Relatorio PDF
          </a>
          <div className="rounded-md bg-white/12 px-2.5 py-1 text-[11px] font-semibold text-white/85">
            Referência: {new Date(`${today}T00:00:00`).toLocaleDateString("pt-BR")}
          </div>
          <div className="flex rounded-md bg-black/15 p-1">
            {[
              ["dia", "Dia"],
              ["mes", "Mês"],
              ["ano", "Ano"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`rounded px-3 py-1.5 text-xs font-semibold transition ${
                  period === value ? "bg-white text-pine-dark" : "text-white/75 hover:bg-white/10"
                }`}
                onClick={() => setPeriod(value as "dia" | "mes" | "ano")}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PerformanceLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        <span className="h-2 w-2 rounded-sm bg-pine" />
        bom
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="h-2 w-2 rounded-sm bg-brass" />
        atenção
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="h-2 w-2 rounded-sm bg-brick" />
        baixo
      </span>
    </div>
  );
}

function PipelineCard({
  tone,
  title,
  value,
  label,
  hint,
}: {
  tone: "pine" | "brass" | "sage" | "brick";
  title: string;
  value: string;
  label: string;
  hint: string;
}) {
  const toneClass = {
    pine: "from-pine to-pine-dark border-pine/25",
    brass: "from-brass to-[oklch(0.58_0.09_74)] border-brass/35",
    sage: "from-sage to-pine border-sage/35",
    brick: "from-brick to-[oklch(0.43_0.1_38)] border-brick/30",
  }[tone];

  return (
    <section className="relative min-w-0 overflow-hidden rounded-md border border-border bg-card shadow-sm">
      <div className={`bg-gradient-to-r ${toneClass} px-2.5 py-1 text-center text-[10px] font-bold uppercase text-white`}>
        {title}
      </div>
      <div className="min-h-[44px] px-2 py-1.5">
        <div className="min-w-0">
          <p className="break-words font-serif text-[clamp(0.82rem,1vw,1.02rem)] font-bold leading-tight text-pine-dark">{value}</p>
          <p className="mt-0.5 truncate text-[10px] font-semibold leading-tight text-foreground">{label}</p>
          <p className="mt-0.5 truncate text-[9px] leading-tight text-muted-foreground">{hint}</p>
        </div>
      </div>
    </section>
  );
}

function MiniSpark({ tone }: { tone: "pine" | "brass" | "sage" | "brick" }) {
  const stroke = {
    pine: "var(--pine)",
    brass: "var(--brass)",
    sage: "var(--sage)",
    brick: "var(--brick)",
  }[tone];
  return (
    <svg viewBox="0 0 90 54" className="h-7 w-full" aria-hidden="true">
      <path d="M4 48 L4 24 L16 34 L28 14 L42 22 L54 18 L68 38 L84 12 L84 48 Z" fill={stroke} opacity="0.16" />
      <path d="M4 24 L16 34 L28 14 L42 22 L54 18 L68 38 L84 12" fill="none" stroke={stroke} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LimpezaPainel({
  rooms,
  reservations,
  complaints,
  today,
  departuresToday,
  kitchenItems,
  insertKitchenItem,
  updateKitchenItem,
  updateRoom,
  insertComplaint,
  updateComplaint,
}: {
  rooms: Room[];
  reservations: Reservation[];
  complaints: ReturnType<typeof useComplaints>["data"];
  today: string;
  departuresToday: Reservation[];
  kitchenItems: KitchenItem[];
  insertKitchenItem: ReturnType<typeof useInsert>;
  updateKitchenItem: ReturnType<typeof useUpdate>;
  updateRoom: ReturnType<typeof useUpdate>;
  insertComplaint: ReturnType<typeof useInsert>;
  updateComplaint: ReturnType<typeof useUpdate>;
}) {
  const checkoutRooms = new Set(departuresToday.map((r) => r.quarto));
  const cleaningRooms = rooms
    .filter((room) => {
      const situacao = String((room as { situacao?: string | null }).situacao ?? "");
      return situacao !== "limpo" && (situacao === "limpeza" || checkoutRooms.has(room.numero));
    })
    .sort((a, b) => a.numero - b.numero);
  const maintenanceRooms = rooms
    .filter((room) => roomStatusToday(reservations, room.numero, today, (room as { situacao?: string | null }).situacao) === "manutencao")
    .sort((a, b) => a.numero - b.numero);
  const cleaningStock = kitchenItems.filter((item) => item.ativo && sectorMatch(item, "limpeza"));
  const lowCleaning = cleaningStock.filter(isLowStock);
  const openCleaningRequests = (complaints ?? [])
    .filter(
      (complaint) =>
        complaint.status !== "resolvido" &&
        (complaint.origem === "limpeza" ||
          ["papel_higienico", "sabonete", "toalha", "manutencao", "reposicao_quarto"].includes(complaint.categoria)),
    )
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const [tab, setTab] = useState<"quartos" | "estoque" | "solicitacoes">("quartos");

  return (
    <div>
      <PageHeader
        title="Limpeza"
        subtitle="Quartos para limpar, reposições e solicitações abertas."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={<ClipboardCheck />} label="Para limpar" value={String(cleaningRooms.length)} hint="Inclui check-outs de hoje" />
        <Stat icon={<DoorOpen />} label="Saídas hoje" value={String(departuresToday.length)} hint="Quartos liberando" />
        <Stat icon={<AlertTriangle />} label="Manutenção" value={String(maintenanceRooms.length)} hint="Não liberar para hóspede" />
        <Stat icon={<MessageSquareWarning />} label="Solicitações" value={String(openCleaningRequests.length)} hint="Reposição ou problema aberto" />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {[
          ["quartos", "Quartos"],
          ["estoque", "Produtos e estoque"],
          ["solicitacoes", "Solicitações"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value as typeof tab)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${tab === value ? "bg-pine text-white" : "bg-muted text-muted-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "quartos" && (
        <section className="mt-5 card-surface p-5">
          <h3 className="section-title mb-3 text-lg">Quartos para limpeza</h3>
          {cleaningRooms.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum quarto pendente agora.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-8 2xl:grid-cols-10">
              {cleaningRooms.map((room) => (
                <div key={room.numero} className="rounded-md border border-brass/45 bg-brass/10 px-3 py-4 text-center">
                  <div className="font-serif text-2xl font-bold text-pine-dark">{room.numero}</div>
                  <div className="mt-1 text-[11px] uppercase text-muted-foreground">Quarto</div>
                  <div className="mt-3 grid gap-1">
                    <button
                      className="rounded-md bg-pine px-2 py-1 text-[11px] font-semibold text-white"
                      onClick={() =>
                        updateRoom.mutate(
                          { id: room.numero, patch: { situacao: "limpo" } },
                          { onSuccess: () => undefined },
                        )
                      }
                    >
                      Liberar quarto
                    </button>
                    <QuickCleaningRequest room={room.numero} insertComplaint={insertComplaint} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === "estoque" && (
        <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1.4fr]">
          <section className="card-surface p-4">
            <h3 className="section-title mb-3 text-base">Alertas da limpeza</h3>
            <AlertList
              items={[
                cleaningRooms.length > 0 ? `${cleaningRooms.length} quarto(s) precisam ser liberados para a recepção.` : "",
                maintenanceRooms.length > 0 ? `${maintenanceRooms.length} quarto(s) em manutenção não devem ser liberados.` : "",
                lowCleaning.length > 0 ? `${lowCleaning.length} item(ns) precisam de reposição.` : "",
                lowCleaning.some((item) => normalizeText(item.nome).includes("papel")) ? "Verificar papel higiênico nos quartos antes de liberar." : "",
              ]}
            />
          </section>
          <SectorStockPanel
            title="Estoque da limpeza"
            subtitle="Papel higiênico, sabonete, toalhas, produtos de limpeza, sacos e reposições de quarto."
            sector="limpeza"
            defaultCategory="Limpeza"
            items={cleaningStock}
            insertKitchenItem={insertKitchenItem}
            updateKitchenItem={updateKitchenItem}
          />
        </div>
      )}

      {tab === "solicitacoes" && (
        <section className="mt-5 card-surface p-5">
          <h3 className="section-title mb-3 text-lg">Solicitações abertas</h3>
          <p className="mb-3 rounded-lg bg-sage-bg px-3 py-2 text-xs text-pine-dark">
            Sem WAHA o sistema abre o WhatsApp com a mensagem pronta. Com WAHA, dá para enviar automaticamente para o grupo do hotel ou para a pessoa responsável.
          </p>
          {openCleaningRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma solicitação aberta agora.</p>
          ) : (
            <div className="space-y-2">
              {openCleaningRequests.map((request) => (
                <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
                  <div>
                    <p className="font-semibold">Quarto {request.quarto ?? "-"} · {complaintLabel(request.categoria)}</p>
                    <p className="text-muted-foreground">{request.descricao ?? "Sem descrição."}</p>
                  </div>
                  <div className="flex gap-2">
                    <a
                      className="rounded-md bg-brass-bg px-3 py-1.5 text-xs font-semibold text-[oklch(0.4_0.06_74)]"
                      href={cleaningWhatsAppUrl(request)}
                      target="_blank"
                      rel="noopener"
                    >
                      Avisar WhatsApp
                    </a>
                    <button
                      type="button"
                      className="rounded-md bg-pine px-3 py-1.5 text-xs font-semibold text-white"
                      onClick={() => updateComplaint.mutate({ id: request.id, patch: { status: "resolvido", resolved_at: new Date().toISOString() } })}
                    >
                      Resolver
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {maintenanceRooms.length > 0 && (
        <section className="mt-4 card-surface p-5">
          <h3 className="section-title mb-3 text-lg">Quartos em manutenção</h3>
          <div className="flex flex-wrap gap-2">
            {maintenanceRooms.map((room) => (
              <Badge key={room.numero} tone="brick">Quarto {room.numero}</Badge>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function QuickCleaningRequest({ room, insertComplaint }: { room: number; insertComplaint: ReturnType<typeof useInsert> }) {
  const options = [
    ["papel_higienico", "Papel"],
    ["sabonete", "Sabonete"],
    ["toalha", "Toalha"],
    ["manutencao", "Manutenção"],
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-1">
      {options.map(([categoria, label]) => (
        <button
          key={categoria}
          className="rounded-md bg-brass-bg px-2 py-1 text-[10px] font-semibold text-[oklch(0.4_0.06_74)]"
          onClick={() =>
            insertComplaint.mutate({
              quarto: room,
              categoria,
              gravidade: categoria === "manutencao" ? "alta" : "media",
              descricao: `${label} solicitado pela limpeza no quarto ${room}.`,
              origem: "limpeza",
              status: "aberto",
            } as never)
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function CafePainel({
  activeToday,
  ocupantesHoje,
  capacidadeTotal,
  today,
  kitchenItems,
  kitchenProductions,
  insertKitchenItem,
  updateKitchenItem,
  insertKitchenProduction,
}: {
  activeToday: Reservation[];
  ocupantesHoje: number;
  capacidadeTotal: number;
  today: string;
  kitchenItems: KitchenItem[];
  kitchenProductions: KitchenProduction[];
  insertKitchenItem: ReturnType<typeof useInsert>;
  updateKitchenItem: ReturnType<typeof useUpdate>;
  insertKitchenProduction: ReturnType<typeof useInsert>;
}) {
  const [showItemForm, setShowItemForm] = useState(false);
  const [tab, setTab] = useState<"visao" | "produtos" | "servido">("visao");
  const rooms = activeToday
    .map((reservation) => ({
      quarto: reservation.quarto,
      pessoas: Number(reservation.pessoas ?? 1),
      hospede: reservationGuestName(reservation),
    }))
    .sort((a, b) => a.quarto - b.quarto);

  const activeItems = kitchenItems.filter((item) => item.ativo && sectorMatch(item, "cafe"));
  const todayProductions = kitchenProductions.filter((row) => row.data === today);
  const lowItems = activeItems.filter((item) => Number(item.estoque_atual ?? 0) <= Number(item.estoque_minimo ?? 0));
  const todayLeftover = todayProductions.reduce((sum, row) => sum + Number(row.sobra ?? 0), 0);
  const todayLoss = todayProductions.reduce((sum, row) => sum + Number(row.perda ?? 0), 0);
  const latestProductions = kitchenProductions.slice(0, 12);
  const kitchenChart = buildKitchenChart(activeItems, todayProductions, ocupantesHoje);
  const topConsumed = [...kitchenChart].sort((a, b) => b.servido - a.servido).slice(0, 5);
  const overPrepared = kitchenChart.filter((row) => row.produzido > 0 && row.sobra + row.perda > row.produzido * 0.25);
  const underPrepared = kitchenChart.filter((row) => row.esperado > 0 && row.produzido > 0 && row.produzido < row.esperado * 0.85);
  const shoppingText = lowItems
    .map((item) => `- ${item.nome}: estoque ${formatQty(item.estoque_atual)} ${item.unidade}, mínimo ${formatQty(item.estoque_minimo)} ${item.unidade}`)
    .join("\n");

  return (
    <div>
      <PageHeader
        title="Café da manhã"
        subtitle="Visão de hóspedes, produtos comprados, servido e sobras."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {[
          ["visao", "Visão"],
          ["produtos", "Produtos e estoque"],
          ["servido", "Servido e sobras"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value as typeof tab)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${tab === value ? "bg-pine text-white" : "bg-muted text-muted-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={<Coffee />} label="Pessoas hoje" value={String(ocupantesHoje)} hint="Base para compra" />
        <Stat icon={<BedDouble />} label="Quartos ocupados" value={String(activeToday.length)} hint={`Capacidade total: ${capacidadeTotal}`} />
        <Stat icon={<ClipboardCheck />} label="Itens ativos" value={String(activeItems.length)} hint="Cadastrados na cozinha" />
        <Stat icon={<AlertTriangle />} label="Reposição" value={String(lowItems.length)} hint="Estoque abaixo do mínimo" />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Stat icon={<Coffee />} label="Sobra hoje" value={formatQty(todayLeftover)} hint="Registrado pela equipe" />
        <Stat icon={<AlertTriangle />} label="Perda hoje" value={formatQty(todayLoss)} hint="Quebrou, venceu ou não aproveitou" />
      </div>

      {tab === "visao" && <div className="mt-5 grid grid-cols-1 gap-4 2xl:grid-cols-[1.35fr_1fr]">
        <section className="card-surface p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="section-title text-base">Relatório inteligente do café</h3>
              <p className="text-xs text-muted-foreground">Compara previsto, disponível/comprado, servido, sobra e perda.</p>
            </div>
            <Badge tone={overPrepared.length || underPrepared.length ? "brass" : "pine"}>
              {overPrepared.length + underPrepared.length} alerta(s)
            </Badge>
          </div>
          {kitchenChart.length === 0 ? (
            <p className="text-sm text-muted-foreground">Lance o que ficou disponível e o que foi servido para gerar os gráficos.</p>
          ) : (
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={kitchenChart} margin={{ left: -18, right: 8, top: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="nome" tick={{ fontSize: 11 }} interval={0} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="esperado" name="Previsto" fill="var(--brass)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="produzido" name="Disponível/comprado" fill="var(--pine)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="servido" name="Consumido" fill="var(--sage)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="sobra" name="Sobra" fill="var(--slate)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>
        <section className="card-surface p-4">
          <h3 className="section-title mb-3 text-base">Alertas da cozinha</h3>
          <AlertList
            items={[
              lowItems.length > 0 ? `${lowItems.length} item(ns) abaixo do estoque mínimo.` : "",
              overPrepared.length > 0 ? `${overPrepared.length} item(ns) com sobra/perda acima de 25%. Comprar menos na próxima vez.` : "",
              underPrepared.length > 0 ? `${underPrepared.length} item(ns) abaixo do previsto. Atenção para faltar.` : "",
              topConsumed[0] ? `Mais consumido hoje: ${topConsumed[0].nome} (${formatQty(topConsumed[0].servido)}).` : "",
            ]}
          />
          {topConsumed.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Mais consumidos</p>
              <div className="space-y-2">
                {topConsumed.map((row) => (
                  <div key={row.id} className="flex items-center justify-between rounded-md bg-sage-bg/45 px-3 py-2 text-sm">
                    <span className="font-semibold">{row.nome}</span>
                    <span>{formatQty(row.servido)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>}

      {tab === "servido" && <section className="mt-5 card-surface p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="section-title text-lg">Lançar servido e sobras</h3>
            <p className="text-sm text-muted-foreground">Registre o que ficou disponível, o que foi servido, o que sobrou e o que perdeu.</p>
          </div>
          {lowItems.length > 0 && (
            <a
              className="rounded-md bg-brick px-3 py-2 text-xs font-semibold text-white"
              href={`https://wa.me/553588001372?text=${encodeURIComponent(`Itens da cozinha para repor:\n${shoppingText}`)}`}
              target="_blank"
              rel="noopener"
            >
              Avisar dono
            </a>
          )}
        </div>
        {activeItems.length === 0 ? (
          <p className="rounded-lg border border-border/70 p-3 text-sm text-muted-foreground">
            Cadastre os produtos do café primeiro. Exemplos: pão, café, leite, suco, molho, frutas, ovos.
          </p>
        ) : (
          <form
            className="grid gap-3 md:grid-cols-6"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const data = new FormData(form);
              const itemId = String(data.get("item_id") || activeItems[0]?.id || "");
              if (!itemId) return;
              insertKitchenProduction.mutate(
                {
                  item_id: itemId,
                  data: String(data.get("data") || today),
                  turno: String(data.get("turno") || "cafe"),
                  produzido: Number(data.get("produzido") || 0),
                  servido: Number(data.get("servido") || 0),
                  sobra: Number(data.get("sobra") || 0),
                  perda: Number(data.get("perda") || 0),
                  pessoas_servidas: Number(data.get("pessoas_servidas") || ocupantesHoje || 0),
                  observacoes: String(data.get("observacoes") || "") || null,
                },
                { onSuccess: () => form.reset() },
              );
            }}
          >
            <label className="md:col-span-2 text-sm">
              <span className="mb-1 block font-semibold text-muted-foreground">Item</span>
              <select name="item_id" className="w-full rounded-md border border-border bg-background px-3 py-2">
                {activeItems.map((item) => (
                  <option key={item.id} value={item.id}>{item.nome}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold text-muted-foreground">Data</span>
              <input name="data" type="date" defaultValue={today} className="w-full rounded-md border border-border bg-background px-3 py-2" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold text-muted-foreground">Turno</span>
              <select name="turno" className="w-full rounded-md border border-border bg-background px-3 py-2">
                <option value="cafe">Café</option>
                <option value="almoco">Almoço</option>
                <option value="jantar">Jantar</option>
                <option value="outro">Outro</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold text-muted-foreground">Pessoas</span>
              <input name="pessoas_servidas" type="number" min="0" defaultValue={ocupantesHoje} className="w-full rounded-md border border-border bg-background px-3 py-2" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold text-muted-foreground">Disponível/comprado</span>
              <input name="produzido" type="number" min="0" step="0.01" inputMode="decimal" className="w-full rounded-md border border-border bg-background px-3 py-2" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold text-muted-foreground">Servido</span>
              <input name="servido" type="number" min="0" step="0.01" inputMode="decimal" className="w-full rounded-md border border-border bg-background px-3 py-2" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold text-muted-foreground">Sobra</span>
              <input name="sobra" type="number" min="0" step="0.01" inputMode="decimal" className="w-full rounded-md border border-border bg-background px-3 py-2" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold text-muted-foreground">Perda</span>
              <input name="perda" type="number" min="0" step="0.01" inputMode="decimal" className="w-full rounded-md border border-border bg-background px-3 py-2" />
            </label>
            <label className="md:col-span-4 text-sm">
              <span className="mb-1 block font-semibold text-muted-foreground">Observação</span>
              <input name="observacoes" placeholder="Ex.: sobrou meia jarra de suco" className="w-full rounded-md border border-border bg-background px-3 py-2" />
            </label>
            <div className="md:col-span-2 flex items-end">
              <button type="submit" className="w-full rounded-md bg-pine px-4 py-2 font-semibold text-white" disabled={insertKitchenProduction.isPending}>
                Salvar consumo
              </button>
            </div>
          </form>
        )}
      </section>}

      {tab === "produtos" && <section className="mt-5 card-surface p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="section-title text-lg">Produtos do café</h3>
            <p className="text-sm text-muted-foreground">Estoque, consumo por pessoa e alerta de reposição.</p>
          </div>
          <button type="button" className="rounded-md bg-brass px-3 py-2 text-xs font-semibold text-pine-dark" onClick={() => setShowItemForm((v) => !v)}>
            {showItemForm ? "Fechar" : "Novo item"}
          </button>
        </div>

        {showItemForm && (
          <form
            className="mb-4 grid gap-3 rounded-lg border border-border/70 bg-sage-bg/40 p-3 md:grid-cols-6"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const data = new FormData(form);
              insertKitchenItem.mutate(
                {
                  nome: String(data.get("nome") || "").trim(),
                  categoria: String(data.get("categoria") || "Café da manhã"),
                  unidade: String(data.get("unidade") || "un"),
                  estoque_atual: Number(data.get("estoque_atual") || 0),
                  estoque_minimo: Number(data.get("estoque_minimo") || 0),
                  consumo_por_pessoa: Number(data.get("consumo_por_pessoa") || 0),
                  observacoes: String(data.get("observacoes") || "") || null,
                  ativo: true,
                },
                { onSuccess: () => form.reset() },
              );
            }}
          >
            <label className="md:col-span-2 text-sm">
              <span className="mb-1 block font-semibold text-muted-foreground">Nome</span>
              <input name="nome" required placeholder="Pão, leite, café..." className="w-full rounded-md border border-border bg-background px-3 py-2" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold text-muted-foreground">Categoria</span>
              <input name="categoria" defaultValue="Café da manhã" className="w-full rounded-md border border-border bg-background px-3 py-2" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold text-muted-foreground">Unidade</span>
              <select name="unidade" className="w-full rounded-md border border-border bg-background px-3 py-2">
                <option value="un">un</option>
                <option value="L">L</option>
                <option value="ml">ml</option>
                <option value="kg">kg</option>
                <option value="g">g</option>
                <option value="pct">pct</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold text-muted-foreground">Estoque</span>
              <input name="estoque_atual" type="number" min="0" step="0.01" inputMode="decimal" className="w-full rounded-md border border-border bg-background px-3 py-2" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold text-muted-foreground">Mínimo</span>
              <input name="estoque_minimo" type="number" min="0" step="0.01" inputMode="decimal" className="w-full rounded-md border border-border bg-background px-3 py-2" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold text-muted-foreground">Por pessoa</span>
              <input name="consumo_por_pessoa" type="number" min="0" step="0.01" inputMode="decimal" className="w-full rounded-md border border-border bg-background px-3 py-2" />
            </label>
            <label className="md:col-span-4 text-sm">
              <span className="mb-1 block font-semibold text-muted-foreground">Observação</span>
              <input name="observacoes" placeholder="Ex.: usar no café; comprar toda segunda" className="w-full rounded-md border border-border bg-background px-3 py-2" />
            </label>
            <div className="md:col-span-2 flex items-end">
              <button type="submit" className="w-full rounded-md bg-pine px-4 py-2 font-semibold text-white" disabled={insertKitchenItem.isPending}>
                Cadastrar item
              </button>
            </div>
          </form>
        )}

        {activeItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum item cadastrado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="p-3">Item</th>
                  <th className="p-3">Esperado hoje</th>
                  <th className="p-3">Disponível hoje</th>
                  <th className="p-3">Estoque</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {activeItems.map((item) => {
                  const rows = todayProductions.filter((row) => row.item_id === item.id);
                  const totals = sumKitchenRows(rows);
                  const expected = Number(item.consumo_por_pessoa ?? 0) * ocupantesHoje;
                  const status = kitchenStatus(item, totals, expected);
                  return (
                    <tr key={item.id} className="border-b border-border/50 align-top">
                      <td className="p-3">
                        <p className="font-semibold">{item.nome}</p>
                        <p className="text-xs text-muted-foreground">{item.categoria} · {formatQty(item.consumo_por_pessoa)} {item.unidade}/pessoa</p>
                      </td>
                      <td className="p-3">{formatQty(expected)} {item.unidade}</td>
                      <td className="p-3 text-xs text-muted-foreground">
                        <p>Disponível: <span className="font-semibold text-foreground">{formatQty(totals.produzido)} {item.unidade}</span></p>
                        <p>Servido: <span className="font-semibold text-foreground">{formatQty(totals.servido)} {item.unidade}</span></p>
                        <p>Sobra: <span className="font-semibold text-foreground">{formatQty(totals.sobra)} {item.unidade}</span></p>
                        <p>Perda: <span className="font-semibold text-foreground">{formatQty(totals.perda)} {item.unidade}</span></p>
                      </td>
                      <td className="p-3">
                        <form
                          className="flex min-w-[150px] gap-2"
                          onSubmit={(event) => {
                            event.preventDefault();
                            const data = new FormData(event.currentTarget);
                            updateKitchenItem.mutate({
                              id: item.id,
                              patch: { estoque_atual: Number(data.get("estoque_atual") || 0) },
                            });
                          }}
                        >
                          <input
                            name="estoque_atual"
                            type="number"
                            min="0"
                            step="0.01"
                            defaultValue={Number(item.estoque_atual ?? 0)}
                            className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm"
                          />
                          <button type="submit" className="rounded-md border border-border px-2 py-1 text-xs font-semibold text-pine">
                            Salvar
                          </button>
                        </form>
                        <p className="mt-1 text-xs text-muted-foreground">Mín: {formatQty(item.estoque_minimo)} {item.unidade}</p>
                      </td>
                      <td className="p-3">
                        <Badge tone={status.tone}>{status.label}</Badge>
                        <p className="mt-1 max-w-[220px] text-xs text-muted-foreground">{status.hint}</p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>}

      {tab === "servido" && <section className="mt-5 card-surface p-5">
        <h3 className="section-title mb-3 text-lg">Histórico recente do café</h3>
        {latestProductions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum consumo lançado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="p-3">Data</th>
                  <th className="p-3">Item</th>
                  <th className="p-3">Pessoas</th>
                  <th className="p-3">Disponível</th>
                  <th className="p-3">Servido</th>
                  <th className="p-3">Sobra</th>
                  <th className="p-3">Perda</th>
                </tr>
              </thead>
              <tbody>
                {latestProductions.map((row) => {
                  const item = kitchenItems.find((i) => i.id === row.item_id);
                  return (
                    <tr key={row.id} className="border-b border-border/50">
                      <td className="p-3">{row.data}</td>
                      <td className="p-3 font-semibold">{item?.nome ?? "Item"}</td>
                      <td className="p-3">{row.pessoas_servidas}</td>
                      <td className="p-3">{formatQty(row.produzido)} {item?.unidade ?? ""}</td>
                      <td className="p-3">{formatQty(row.servido)} {item?.unidade ?? ""}</td>
                      <td className="p-3">{formatQty(row.sobra)} {item?.unidade ?? ""}</td>
                      <td className="p-3">{formatQty(row.perda)} {item?.unidade ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>}

      {tab === "visao" && <section className="mt-5 card-surface p-5">
        <h3 className="section-title mb-3 text-lg">Quartos com hóspedes</h3>
        {rooms.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum hospede ativo agora.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="p-3">Quarto</th>
                  <th className="p-3">Pessoas</th>
                  <th className="p-3">Hospede</th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((row) => (
                  <tr key={row.quarto} className="border-b border-border/50">
                    <td className="p-3 font-semibold">Quarto {row.quarto}</td>
                    <td className="p-3">{row.pessoas}</td>
                    <td className="p-3 text-muted-foreground">{row.hospede}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>}
    </div>
  );
}

function SectorStockPanel({
  title,
  subtitle,
  sector,
  defaultCategory,
  items,
  insertKitchenItem,
  updateKitchenItem,
}: {
  title: string;
  subtitle: string;
  sector: "cafe" | "limpeza" | "recepcao";
  defaultCategory: string;
  items: KitchenItem[];
  insertKitchenItem: ReturnType<typeof useInsert>;
  updateKitchenItem: ReturnType<typeof useUpdate>;
}) {
  const [open, setOpen] = useState(false);
  const lowItems = items.filter(isLowStock);
  const stockText = lowItems
    .map((item) => `- ${item.nome}: ${formatQty(item.estoque_atual)} ${item.unidade} (mínimo ${formatQty(item.estoque_minimo)})`)
    .join("\n");

  return (
    <section className="card-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="section-title text-base">{title}</h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex gap-2">
          {lowItems.length > 0 && (
            <a
              className="rounded-md bg-brick px-3 py-2 text-xs font-semibold text-white"
              href={`https://wa.me/553588001372?text=${encodeURIComponent(`Reposição - ${title}:\n${stockText}`)}`}
              target="_blank"
              rel="noopener"
            >
              Avisar dono
            </a>
          )}
          <button type="button" className="rounded-md bg-brass px-3 py-2 text-xs font-semibold text-pine-dark" onClick={() => setOpen((value) => !value)}>
            {open ? "Fechar" : "Novo item"}
          </button>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <Stat icon={<ClipboardCheck />} label="Itens" value={String(items.length)} hint="Ativos no setor" />
        <Stat icon={<AlertTriangle />} label="Reposição" value={String(lowItems.length)} hint="Abaixo do mínimo" />
        <Stat icon={<TrendingDown />} label="Críticos" value={String(lowItems.filter((item) => Number(item.estoque_atual ?? 0) === 0).length)} hint="Estoque zerado" />
      </div>

      {open && (
        <form
          className="mb-4 grid gap-3 rounded-lg border border-border/70 bg-sage-bg/40 p-3 md:grid-cols-5"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const data = new FormData(form);
            insertKitchenItem.mutate(
              {
                nome: String(data.get("nome") || "").trim(),
                categoria: `${defaultCategory} - ${String(data.get("categoria") || "Geral")}`,
                unidade: String(data.get("unidade") || "un"),
                estoque_atual: Number(data.get("estoque_atual") || 0),
                estoque_minimo: Number(data.get("estoque_minimo") || 0),
                consumo_por_pessoa: Number(data.get("consumo_por_pessoa") || 0),
                observacoes: String(data.get("observacoes") || `${sector}`) || null,
                ativo: true,
              },
              { onSuccess: () => form.reset() },
            );
          }}
        >
          <label className="md:col-span-2 text-sm">
            <span className="mb-1 block font-semibold text-muted-foreground">Item</span>
            <input name="nome" required placeholder="Ex.: papel higiênico" className="field" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold text-muted-foreground">Grupo</span>
            <input name="categoria" defaultValue="Geral" className="field" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold text-muted-foreground">Unidade</span>
            <select name="unidade" className="field">
              <option value="un">un</option>
              <option value="pct">pct</option>
              <option value="cx">cx</option>
              <option value="L">L</option>
              <option value="kg">kg</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold text-muted-foreground">Estoque</span>
            <input name="estoque_atual" type="number" min="0" step="0.01" className="field" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold text-muted-foreground">Mínimo</span>
            <input name="estoque_minimo" type="number" min="0" step="0.01" className="field" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold text-muted-foreground">Uso por quarto/pessoa</span>
            <input name="consumo_por_pessoa" type="number" min="0" step="0.01" className="field" />
          </label>
          <label className="md:col-span-2 text-sm">
            <span className="mb-1 block font-semibold text-muted-foreground">Observação</span>
            <input name="observacoes" placeholder="Ex.: repor toda sexta" className="field" />
          </label>
          <div className="flex items-end">
            <button type="submit" className="btn-primary w-full" disabled={insertKitchenItem.isPending}>
              Cadastrar
            </button>
          </div>
        </form>
      )}

      {items.length === 0 ? (
        <p className="rounded-md border border-border/70 p-3 text-sm text-muted-foreground">Nenhum item cadastrado para este setor.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="p-2">Item</th>
                <th className="p-2">Estoque</th>
                <th className="p-2">Mínimo</th>
                <th className="p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-border/50">
                  <td className="p-2">
                    <p className="font-semibold">{item.nome}</p>
                    <p className="text-xs text-muted-foreground">{item.categoria}</p>
                  </td>
                  <td className="p-2">
                    <form
                      className="flex min-w-[140px] gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const data = new FormData(event.currentTarget);
                        updateKitchenItem.mutate({
                          id: item.id,
                          patch: { estoque_atual: Number(data.get("estoque_atual") || 0) },
                        });
                      }}
                    >
                      <input name="estoque_atual" type="number" min="0" step="0.01" defaultValue={Number(item.estoque_atual ?? 0)} className="w-20 rounded-md border border-border bg-background px-2 py-1" />
                      <button className="rounded-md border border-border px-2 py-1 text-xs font-semibold text-pine">Salvar</button>
                    </form>
                  </td>
                  <td className="p-2">{formatQty(item.estoque_minimo)} {item.unidade}</td>
                  <td className="p-2">
                    <Badge tone={isLowStock(item) ? "brick" : "pine"}>{isLowStock(item) ? "Repor" : "Ok"}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function AlertList({ items }: { items: string[] }) {
  const visible = items.filter(Boolean);
  if (visible.length === 0) {
    return <p className="rounded-md bg-sage-bg/60 px-3 py-2 text-sm text-pine-dark">Sem alertas críticos agora.</p>;
  }
  return (
    <ul className="space-y-2 text-sm">
      {visible.map((item) => (
        <li key={item} className="flex gap-2 rounded-md bg-brass-bg/55 px-3 py-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-brass" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function cleaningWhatsAppUrl(request: { quarto?: number | null; categoria: string; descricao?: string | null }) {
  const message = [
    "Hotel Real - solicitacao para a limpeza",
    `Quarto: ${request.quarto ?? "-"}`,
    `Tipo: ${complaintLabel(request.categoria)}`,
    `Detalhe: ${request.descricao ?? "Sem detalhe informado."}`,
    "",
    "Por favor, verificar e avisar quando resolver.",
  ].join("\n");

  return `https://wa.me/553588001372?text=${encodeURIComponent(message)}`;
}

function StaffSalesSummary({ sales }: { sales: Sale[] }) {
  const rows = groupMoney(
    sales,
    (sale) => sale.created_by ? `Funcionário ${sale.created_by.slice(0, 8)}` : "Sem funcionário informado",
    (sale) => Number(sale.total ?? 0),
  )
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 6);

  return (
    <section className="card-surface border-t-4 border-t-pine p-4">
      <h3 className="section-title mb-2 text-sm">Vendas lançadas por funcionário</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma venda lançada ainda.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.nome} className="flex items-center justify-between rounded-md bg-sage-bg/45 px-3 py-2 text-sm">
              <span className="font-semibold">{row.nome}</span>
              <span>{fmtBRL(row.valor)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function EmployeeConsumptionSummary({ sales }: { sales: Sale[] }) {
  const internalSales = sales.filter((sale) => {
    const text = `${sale.categoria ?? ""} ${sale.item ?? ""} ${sale.observacoes ?? ""}`.toLocaleLowerCase("pt-BR");
    return text.includes("funcionario") || text.includes("funcionário") || text.includes("interno") || text.includes("agua") || text.includes("água");
  });
  const waterQty = internalSales
    .filter((sale) => `${sale.item} ${sale.categoria ?? ""}`.toLocaleLowerCase("pt-BR").includes("gua"))
    .reduce((sum, sale) => sum + Number(sale.qtd ?? 0), 0);
  const limitHint = waterQty > 0 ? `${formatQty(waterQty)} unidade(s) lançadas. Regra: 2 litros por funcionário/dia.` : "Regra sugerida: 2 litros por funcionário/dia.";

  return (
    <section className="card-surface border-t-4 border-t-brass p-4">
      <h3 className="section-title mb-2 text-sm">Consumo interno e água</h3>
      <div className="grid grid-cols-2 gap-2">
        <MiniMetric label="Lançamentos internos" value={String(internalSales.length)} />
        <MiniMetric label="Água funcionários" value={formatQty(waterQty)} />
      </div>
      <p className="mt-3 rounded-md bg-brass-bg/55 px-3 py-2 text-xs text-[oklch(0.36_0.05_74)]">{limitHint}</p>
    </section>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <p className="text-[11px] font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="font-serif text-xl font-bold text-pine-dark">{value}</p>
    </div>
  );
}

function RevenueExpenseHighlights({
  reservations,
  sales,
  expenses,
}: {
  reservations: Reservation[];
  sales: Sale[];
  expenses: Expense[];
}) {
  const revenueRows = [
    ...groupMoney(
      reservations.filter((reservation) => reservation.status !== "cancelado"),
      (reservation) => `Hospedagem - ${reservation.canal || "Direto"}`,
      (reservation) => Number(reservation.valor_pago ?? 0),
    ),
    ...groupMoney(
      sales,
      (sale) => sale.categoria || "Vendas avulsas",
      (sale) => Number(sale.total ?? 0),
    ),
  ]
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 6);
  const expenseRows = groupMoney(
    expenses,
    (expense) => expense.categoria || expense.descricao || "Despesa",
    (expense) => Number(expense.valor ?? 0),
  )
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 6);
  const chartRows = [
    { nome: "Receitas", valor: revenueRows.reduce((sum, row) => sum + row.valor, 0), fill: "var(--pine)" },
    { nome: "Despesas", valor: expenseRows.reduce((sum, row) => sum + row.valor, 0), fill: "var(--brick)" },
  ];

  return (
    <section className="card-surface p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="section-title text-base">Receitas x despesas</h3>
          <p className="text-xs text-muted-foreground">Mostra o que mais gera dinheiro e o que mais pesa no caixa.</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <ResponsiveContainer width="100%" height={190}>
          <BarChart data={chartRows} margin={{ left: -20, right: 8, top: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="nome" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={(value: number) => fmtBRL(value)} />
            <Bar dataKey="valor" radius={[4, 4, 0, 0]}>
              {chartRows.map((row) => (
                <Cell key={row.nome} fill={row.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
          <TopMoneyTable title="Maiores receitas" rows={revenueRows} empty="Sem receita." />
          <TopMoneyTable title="Maiores despesas" rows={expenseRows} empty="Sem despesa." />
        </div>
      </div>
    </section>
  );
}

function OperationalReports({
  kitchenItems,
  kitchenProductions,
  cleaningRooms,
  maintenanceRooms,
  today,
}: {
  kitchenItems: KitchenItem[];
  kitchenProductions: KitchenProduction[];
  cleaningRooms: number;
  maintenanceRooms: number;
  today: string;
}) {
  const cafeItems = kitchenItems.filter((item) => item.ativo && sectorMatch(item, "cafe"));
  const cleaningItems = kitchenItems.filter((item) => item.ativo && sectorMatch(item, "limpeza"));
  const receptionItems = kitchenItems.filter((item) => item.ativo && sectorMatch(item, "recepcao"));
  const todayKitchen = kitchenProductions.filter((row) => row.data === today);
  const served = todayKitchen.reduce((sum, row) => sum + Number(row.servido ?? 0), 0);
  const waste = todayKitchen.reduce((sum, row) => sum + Number(row.sobra ?? 0) + Number(row.perda ?? 0), 0);
  const reports = [
    { area: "Café", principal: `${formatQty(served)} consumido`, alerta: `${cafeItems.filter(isLowStock).length} reposição`, fill: "var(--brass)" },
    { area: "Limpeza", principal: `${cleaningRooms} quarto(s)`, alerta: `${cleaningItems.filter(isLowStock).length} reposição`, fill: "var(--sage)" },
    { area: "Recepção", principal: `${receptionItems.length} item(ns)`, alerta: `${receptionItems.filter(isLowStock).length} reposição`, fill: "var(--pine)" },
    { area: "Manutenção", principal: `${maintenanceRooms} quarto(s)`, alerta: `${formatQty(waste)} sobra/perda`, fill: "var(--brick)" },
  ];

  return (
    <section className="card-surface p-4">
      <h3 className="section-title mb-3 text-base">Relatórios por área</h3>
      <div className="grid grid-cols-2 gap-2">
        {reports.map((row) => (
          <div key={row.area} className="rounded-md border border-border/70 bg-background px-3 py-2">
            <div className="mb-1 h-1 rounded-full" style={{ background: row.fill }} />
            <p className="text-xs font-semibold uppercase text-muted-foreground">{row.area}</p>
            <p className="font-serif text-lg font-bold leading-tight">{row.principal}</p>
            <p className="text-xs text-muted-foreground">{row.alerta}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-md bg-sage-bg/55 px-3 py-2 text-xs text-pine-dark">
        Use esta leitura para comprar só o necessário: estoque baixo vira alerta, sobra/perda indica preparo acima da demanda.
      </div>
    </section>
  );
}

function TopMoneyTable({ title, rows, empty }: { title: string; rows: { nome: string; valor: number }[]; empty: string }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((row) => (
            <div key={row.nome} className="flex items-center justify-between gap-3 rounded-md bg-background px-3 py-2 text-sm">
              <span className="min-w-0 truncate">{row.nome}</span>
              <span className="shrink-0 font-semibold">{fmtBRL(row.valor)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function groupMoney<T>(items: T[], label: (item: T) => string, value: (item: T) => number) {
  const map = new Map<string, number>();
  items.forEach((item) => {
    const key = label(item);
    map.set(key, (map.get(key) ?? 0) + value(item));
  });
  return [...map.entries()].map(([nome, valor]) => ({ nome, valor }));
}

function sumKitchenRows(rows: KitchenProduction[]) {
  return rows.reduce(
    (acc, row) => {
      acc.produzido += Number(row.produzido ?? 0);
      acc.servido += Number(row.servido ?? 0);
      acc.sobra += Number(row.sobra ?? 0);
      acc.perda += Number(row.perda ?? 0);
      return acc;
    },
    { produzido: 0, servido: 0, sobra: 0, perda: 0 },
  );
}

function buildKitchenChart(items: KitchenItem[], rows: KitchenProduction[], people: number) {
  return items
    .map((item) => {
      const totals = sumKitchenRows(rows.filter((row) => row.item_id === item.id));
      return {
        id: item.id,
        nome: item.nome.length > 14 ? `${item.nome.slice(0, 13)}...` : item.nome,
        esperado: Number(item.consumo_por_pessoa ?? 0) * people,
        produzido: totals.produzido,
        servido: totals.servido,
        sobra: totals.sobra,
        perda: totals.perda,
      };
    })
    .filter((row) => row.esperado > 0 || row.produzido > 0 || row.servido > 0 || row.sobra > 0 || row.perda > 0);
}

function isLowStock(item: KitchenItem) {
  return Number(item.estoque_atual ?? 0) <= Number(item.estoque_minimo ?? 0);
}

function sectorMatch(item: KitchenItem, sector: "cafe" | "limpeza" | "recepcao") {
  const text = normalizeText(`${item.categoria} ${item.observacoes ?? ""}`);
  if (sector === "cafe") {
    return text.includes("cafe") || text.includes("cozinha") || text.includes("alimento") || text.includes("bebida");
  }
  if (sector === "limpeza") {
    return text.includes("limpeza") || text.includes("quarto") || text.includes("papel") || text.includes("toalha");
  }
  return text.includes("recepc") || text.includes("administr") || text.includes("sulfite") || text.includes("internet") || text.includes("caneta");
}

function kitchenStatus(item: KitchenItem, totals: ReturnType<typeof sumKitchenRows>, expected: number): { label: string; hint: string; tone: "pine" | "brass" | "brick" | "muted" } {
  const stock = Number(item.estoque_atual ?? 0);
  const minimum = Number(item.estoque_minimo ?? 0);
  if (stock <= minimum) return { label: "Repor", hint: "Estoque no mínimo ou abaixo do mínimo.", tone: "brick" };
  if (totals.produzido > 0 && totals.sobra > totals.produzido * 0.25) {
    return { label: "Sobra alta", hint: "Sobrou mais de 25% do preparado. Pode reduzir na próxima vez.", tone: "brass" };
  }
  if (expected > 0 && totals.servido > expected * 1.2) {
    return { label: "Consumo alto", hint: "Consumo acima do esperado por pessoa.", tone: "brass" };
  }
  return { label: "Ok", hint: "Sem alerta para hoje.", tone: "pine" };
}

function formatQty(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0";
  return Number.isInteger(n) ? String(n) : n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function compactBRL(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `R$ ${(value / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (abs >= 10_000) return `R$ ${(value / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return fmtBRL(value);
}

function normalizeText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

const CHART_COLORS = ["var(--pine)", "var(--brass)", "var(--sage)", "var(--brick)", "oklch(0.48 0.08 190)", "oklch(0.55 0.11 300)"];

function ChannelStrategy({ reservations, sales }: { reservations: Reservation[]; sales: Sale[] }) {
  const rows = channelMetrics(reservations, sales);
  return (
    <section className="card-surface border-l-4 border-l-brass bg-[linear-gradient(90deg,rgba(208,178,91,0.12),var(--card)_26%)] p-3">
      <h3 className="section-title mb-2 text-sm">Canais de venda</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem canais registrados ainda.</p>
      ) : (
        <div className="grid gap-2 xl:grid-cols-[160px_1fr]">
          <ResponsiveContainer width="100%" height={150}>
            <PieChart>
              <Pie data={rows} dataKey="liquido" nameKey="canal" innerRadius={34} outerRadius={62} paddingAngle={2}>
                {rows.map((row, index) => (
                  <Cell key={row.canal} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => fmtBRL(v)} />
            </PieChart>
          </ResponsiveContainer>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="p-2">Canal</th>
                  <th className="p-2">Bruto</th>
                  <th className="p-2">Comissão</th>
                  <th className="p-2">Líquido</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.canal} className="border-b border-border/50">
                    <td className="p-2 font-semibold">{row.canal}</td>
                    <td className="p-2">{fmtBRL(row.bruto)}</td>
                    <td className="p-2 text-brick">{fmtBRL(row.comissao)}</td>
                    <td className="p-2 font-semibold text-pine">{fmtBRL(row.liquido)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function channelMetrics(reservations: Reservation[], sales: Sale[]) {
  const byReservation = new Map<string, number>();
  sales.forEach((sale) => sale.reserva_id && byReservation.set(sale.reserva_id, (byReservation.get(sale.reserva_id) ?? 0) + Number(sale.total)));
  const map = new Map<string, { canal: string; bruto: number; comissao: number; liquido: number }>();
  reservations
    .filter((r) => r.status !== "cancelado")
    .forEach((reservation) => {
      const canal = reservation.canal || "Direto";
      const bruto = Number(reservation.valor_total) + (byReservation.get(reservation.id) ?? 0);
      const taxa = normalizeText(canal).includes("booking") ? 0.15 : normalizeText(canal).includes("airbnb") ? 0.12 : 0;
      const comissao = bruto * taxa;
      const current = map.get(canal) ?? { canal, bruto: 0, comissao: 0, liquido: 0 };
      current.bruto += bruto;
      current.comissao += comissao;
      current.liquido += bruto - comissao;
      map.set(canal, current);
    });
  return [...map.values()].sort((a, b) => b.liquido - a.liquido);
}

function GuestDemographics({ clients }: { clients: Client[] }) {
  const genderRows = pieRows(clients, "sexo", "Não informado");
  const civilRows = pieRows(clients, "estado_civil", "Não informado");
  const ages = clients.map((client) => ageFromBirthdate(client.data_nascimento)).filter((age): age is number => age != null);
  const avgAge = ages.length ? Math.round(ages.reduce((sum, age) => sum + age, 0) / ages.length) : 0;

  return (
    <section className="card-surface border-l-4 border-l-sage bg-[linear-gradient(90deg,rgba(88,139,105,0.12),var(--card)_28%)] p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="section-title text-sm">Perfil dos hóspedes</h3>
        <div className="text-right text-xs text-muted-foreground">
          <span className="block font-semibold text-pine-dark">{clients.length} clientes</span>
          {avgAge ? `idade média ${avgAge} anos` : "idade média sem dados"}
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <MiniPie title="Gênero" rows={genderRows} />
        <MiniPie title="Estado civil" rows={civilRows} />
      </div>
    </section>
  );
}

function MiniPie({ title, rows }: { title: string; rows: { name: string; value: number }[] }) {
  return (
    <div className="rounded-md border border-border/70 p-2">
      <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem dados.</p>
      ) : (
        <div className="grid grid-cols-[100px_1fr] items-center gap-2">
          <ResponsiveContainer width="100%" height={100}>
            <PieChart>
              <Pie data={rows} dataKey="value" nameKey="name" innerRadius={24} outerRadius={42} paddingAngle={2}>
                {rows.map((row, index) => (
                  <Cell key={row.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1 text-xs">
            {rows.slice(0, 5).map((row, index) => (
              <div key={row.name} className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1">
                  <span className="h-2 w-2 rounded-full" style={{ background: CHART_COLORS[index % CHART_COLORS.length] }} />
                  <span className="truncate">{row.name}</span>
                </span>
                <span className="font-semibold">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ClientStateMap({ clients }: { clients: Client[] }) {
  const rows = clientStateRows(clients);
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const max = Math.max(1, ...rows.map((row) => row.value));
  const mapped = rows.filter((row) => BRAZIL_STATE_POINTS[row.uf]);
  const unknown = clients.length - total;

  return (
    <section className="card-surface border-l-4 border-l-pine bg-[linear-gradient(90deg,rgba(35,77,56,0.1),var(--card)_28%)] p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="section-title text-sm">Mapa de clientes por estado</h3>
          <p className="text-xs text-muted-foreground">Origem dos hóspedes cadastrados no hotel.</p>
        </div>
        <Badge tone="pine">{total} com estado</Badge>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-border/70 p-3 text-sm text-muted-foreground">
          Nenhum cliente com estado preenchido ainda.
        </p>
      ) : (
        <div className="grid gap-3 xl:grid-cols-[1.25fr_0.9fr]">
          <div className="relative min-h-[230px] overflow-hidden rounded-lg border border-border bg-[radial-gradient(circle_at_35%_30%,rgba(208,178,91,0.18),transparent_28%),linear-gradient(135deg,rgba(35,77,56,0.08),rgba(35,77,56,0.02))]">
            <div className="absolute inset-5 rounded-[45%_55%_52%_48%] border border-pine/20 bg-white/45" />
            <div className="absolute left-[36%] top-[18%] h-[58%] w-[42%] rounded-[50%_35%_45%_55%] border border-pine/25 bg-sage-bg/60" />
            <div className="absolute left-[24%] top-[22%] h-[38%] w-[34%] rounded-[42%_58%_45%_55%] border border-pine/15 bg-white/40" />
            <div className="absolute left-[48%] top-[58%] h-[28%] w-[20%] rotate-[-18deg] rounded-[40%_60%_55%_45%] border border-pine/20 bg-white/55" />
            {mapped.map((row) => {
              const point = BRAZIL_STATE_POINTS[row.uf];
              const size = 34 + (row.value / max) * 46;
              return (
                <div
                  key={row.uf}
                  className="absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 border-white/85 bg-pine text-center text-white shadow-lg"
                  style={{ left: `${point.x}%`, top: `${point.y}%`, width: size, height: size }}
                  title={`${row.label}: ${row.value} cliente(s)`}
                >
                  <span className="text-[11px] font-bold leading-none">{row.uf}</span>
                  <span className="text-[10px] leading-none">{row.value}</span>
                </div>
              );
            })}
            <div className="absolute bottom-3 left-3 rounded-md bg-white/85 px-2 py-1 text-[10px] font-semibold text-muted-foreground">
              Bolha maior = mais clientes
            </div>
          </div>

          <div className="space-y-2">
            {rows.slice(0, 8).map((row) => {
              const pct = total ? Math.round((row.value / total) * 100) : 0;
              return (
                <div key={row.uf} className="rounded-md border border-border/70 px-3 py-2">
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                    <span className="font-semibold text-pine-dark">{row.label}</span>
                    <span className="font-bold">{row.value}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-sage-bg">
                    <div className="h-full rounded-full bg-brass" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">{pct}% dos clientes com estado</p>
                </div>
              );
            })}
            {unknown > 0 && (
              <p className="rounded-md bg-brick-bg px-3 py-2 text-xs text-brick">
                {unknown} cliente(s) ainda sem estado preenchido no cadastro.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function CustomerRetention({ clients, reservations, today }: { clients: Client[]; reservations: Reservation[]; today: string }) {
  const rows = retentionRows(clients, reservations, today);
  const fixedClients = rows.filter((row) => normalizeText(row.tipo).includes("fixo")).slice(0, 7);
  const companies = rows.filter((row) => normalizeText(row.tipo).includes("empresa")).slice(0, 7);
  return (
    <section className="card-surface p-4">
      <h3 className="section-title mb-3 text-base">Retenção e recorrência</h3>
      <div className="grid gap-4 xl:grid-cols-2">
        <RetentionTable title="Clientes fixos" rows={fixedClients} empty="Marque clientes como fixos no cadastro." />
        <RetentionTable title="Empresas" rows={companies} empty="Cadastre empresas/clientes empresa para acompanhar receita." />
      </div>
    </section>
  );
}

function RetentionTable({ title, rows, empty }: { title: string; rows: RetentionRow[]; empty: string }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{title}</p>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-border/70 p-3 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left uppercase text-muted-foreground">
                <th className="p-2">Nome</th>
                <th className="p-2">Receita</th>
                <th className="p-2">Volta a cada</th>
                <th className="p-2">Ação</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border/50">
                  <td className="p-2 font-semibold">{row.nome}</td>
                  <td className="p-2">{fmtBRL(row.receita)}</td>
                  <td className="p-2">{row.intervaloMedio ? `${row.intervaloMedio} dias` : "novo"}</td>
                  <td className="p-2">
                    {row.whatsappUrl ? (
                      <a className={row.atrasado ? "font-semibold text-brick hover:underline" : "text-pine hover:underline"} href={row.whatsappUrl} target="_blank" rel="noopener">
                        {row.atrasado ? "Chamar" : "WhatsApp"}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">sem telefone</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PricingSuggestion({ reservations, rooms, today }: { reservations: Reservation[]; rooms: Room[]; today: string }) {
  const next7 = futureOccupancy(reservations, rooms.length, today, 7);
  const next14 = futureOccupancy(reservations, rooms.length, today, 14);
  const weekend = [0, 5, 6].includes(new Date(`${today}T00:00:00`).getDay());
  const suggestion =
    next7 >= 80
      ? "Alta procura nos próximos 7 dias: sugerir aumento de 10% a 15% nas novas reservas."
      : next7 <= 15
        ? "Procura abaixo de 15%: criar promoção direta no WhatsApp/Instagram e tentar reativar clientes fixos."
        : next14 >= 65
          ? "Procura boa nos próximos 14 dias: segurar descontos e priorizar reserva direta."
          : weekend
            ? "Fim de semana: manter preço base, vender primeiro quartos com banheiro/ar e evitar desconto antecipado."
            : "Procura normal: manter preço base e divulgar reserva direta.";
  return (
    <section className="card-surface border-l-4 border-l-brass bg-[linear-gradient(90deg,rgba(208,178,91,0.14),var(--card)_30%)] p-3">
      <h3 className="section-title mb-2 text-sm">Preço dinâmico simples</h3>
      <div className="grid grid-cols-2 gap-2">
        <Stat icon={<BedDouble />} label="Ocup. 7 dias" value={`${next7}%`} hint="Reservas futuras" />
        <Stat icon={<CalendarClock />} label="Ocup. 14 dias" value={`${next14}%`} hint="Tendência próxima" />
      </div>
      <p className="mt-2 rounded-md bg-sage-bg/60 px-3 py-2 text-xs font-semibold text-pine-dark">{suggestion}</p>
    </section>
  );
}

function futureOccupancy(reservations: Reservation[], roomCount: number, today: string, days: number) {
  if (!roomCount) return 0;
  const start = new Date(`${today}T00:00:00`);
  const end = new Date(start);
  end.setDate(start.getDate() + days - 1);
  const occupied = reservations
    .filter((r) => r.status !== "cancelado" && r.status !== "manutencao")
    .reduce((sum, r) => sum + overlappingNights(r.checkin, r.checkout, start, end), 0);
  return Math.round((occupied / (roomCount * days)) * 100);
}

function buildForecastSeries(reservations: Reservation[], roomCount: number, today: string) {
  const base = new Date(`${today}T00:00:00`);
  return Array.from({ length: 30 }, (_, index) => {
    const date = new Date(base);
    date.setDate(base.getDate() + index);
    const key = date.toISOString().slice(0, 10);
    const active = reservations.filter(
      (reservation) =>
        reservation.status !== "cancelado" &&
        reservation.status !== "manutencao" &&
        reservation.checkin <= key &&
        reservation.checkout > key,
    );
    return {
      key,
      label: `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`,
      ocupacao: roomCount ? Math.round((active.length / roomCount) * 100) : 0,
      receita: active.reduce((sum, reservation) => sum + Number(reservation.valor_diaria ?? reservation.valor_total ?? 0), 0),
    };
  });
}

function shouldWarnMissingExpenses(expenses: Expense[], reservations: Reservation[], today: string) {
  const base = new Date(`${today}T00:00:00`);
  const days = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(base);
    date.setDate(base.getDate() - index);
    return date.toISOString().slice(0, 10);
  });
  const hasExpenses = days.some((day) => expenses.some((expense) => expense.data === day && Number(expense.valor ?? 0) > 0));
  const hadOccupancy = days.some((day) =>
    reservations.some(
      (reservation) =>
        reservation.status !== "cancelado" &&
        reservation.status !== "manutencao" &&
        reservation.checkin <= day &&
        reservation.checkout > day,
    ),
  );
  return hadOccupancy && !hasExpenses;
}

function revparForMonth(month: string, revenue: number, roomCount: number) {
  if (!roomCount) return 0;
  const [year, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  return revenue / Math.max(1, roomCount * daysInMonth);
}

function TodayList({
  title,
  empty,
  reservations,
}: {
  title: string;
  empty: string;
  reservations: Reservation[];
}) {
  return (
    <section className="card-surface p-5">
      <h3 className="section-title mb-3 text-lg">{title}</h3>
      {reservations.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="space-y-2">
          {reservations.slice(0, 8).map((reservation) => (
            <div key={reservation.id} className="flex items-center justify-between rounded-md border border-border/70 px-3 py-2">
              <div>
                <p className="font-semibold">Quarto {reservation.quarto}</p>
                <p className="text-xs text-muted-foreground">{reservationGuestName(reservation)}</p>
              </div>
              <Badge tone={reservation.pago ? "pine" : "brass"}>{reservation.pago ? "Pago" : "Pendente"}</Badge>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function QuickLink({ to, icon, label }: { to: "/mapa" | "/reservas" | "/clientes" | "/vendas"; icon: React.ReactNode; label: string }) {
  return (
    <Link to={to} className="card-surface flex items-center gap-3 p-4 text-sm font-semibold text-pine-dark transition hover:border-pine/40 hover:bg-sage-bg/50">
      <span className="rounded-md bg-sage-bg p-2 text-pine [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
      {label}
    </Link>
  );
}

function reservationGuestName(reservation: Reservation) {
  return String(
    (reservation as { hospede?: string | null; hospede_nome?: string | null; nome?: string | null }).hospede ??
      (reservation as { hospede_nome?: string | null }).hospede_nome ??
      (reservation as { nome?: string | null }).nome ??
      "Hospede",
  );
}

type RetentionRow = {
  id: string;
  nome: string;
  tipo: string;
  receita: number;
  intervaloMedio: number;
  atrasado: boolean;
  whatsappUrl: string | null;
};

function pieRows<T extends Record<string, unknown>>(items: T[], key: keyof T, emptyLabel: string) {
  const map = new Map<string, number>();
  items.forEach((item) => {
    const raw = String(item[key] ?? "").trim();
    const label = raw ? labelize(raw) : emptyLabel;
    map.set(label, (map.get(label) ?? 0) + 1);
  });
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

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

const BRAZIL_STATE_POINTS: Record<string, { x: number; y: number }> = {
  AC: { x: 20, y: 54 },
  AM: { x: 32, y: 32 },
  RR: { x: 41, y: 13 },
  RO: { x: 34, y: 56 },
  PA: { x: 51, y: 28 },
  AP: { x: 58, y: 16 },
  TO: { x: 56, y: 48 },
  MA: { x: 67, y: 34 },
  PI: { x: 70, y: 43 },
  CE: { x: 78, y: 39 },
  RN: { x: 84, y: 42 },
  PB: { x: 83, y: 47 },
  PE: { x: 80, y: 51 },
  AL: { x: 79, y: 56 },
  SE: { x: 76, y: 60 },
  BA: { x: 69, y: 62 },
  MT: { x: 48, y: 58 },
  MS: { x: 50, y: 73 },
  GO: { x: 59, y: 62 },
  DF: { x: 62, y: 59 },
  MG: { x: 65, y: 72 },
  ES: { x: 76, y: 73 },
  RJ: { x: 72, y: 79 },
  SP: { x: 61, y: 80 },
  PR: { x: 57, y: 87 },
  SC: { x: 59, y: 92 },
  RS: { x: 55, y: 97 },
};

function clientStateRows(clients: Client[]) {
  const map = new Map<string, number>();
  clients.forEach((client) => {
    const uf = normalizeState(String(client.estado ?? ""));
    if (!uf) return;
    map.set(uf, (map.get(uf) ?? 0) + 1);
  });
  return [...map.entries()]
    .map(([uf, value]) => ({ uf, label: BRAZIL_STATE_NAMES[uf] ?? uf, value }))
    .sort((a, b) => b.value - a.value);
}

function normalizeState(value: string) {
  const text = normalizeText(value).replace(/[^a-z]/g, "");
  if (!text) return "";
  const raw = value.trim().toUpperCase();
  if (BRAZIL_STATE_NAMES[raw]) return raw;
  const found = Object.entries(BRAZIL_STATE_NAMES).find(([, name]) => normalizeText(name).replace(/[^a-z]/g, "") === text);
  if (found) return found[0];
  if (text === "minas" || text === "minasgeraismg") return "MG";
  if (text === "saopaulo" || text === "sp") return "SP";
  if (text === "riodejaneiro" || text === "rj") return "RJ";
  return "";
}

function retentionRows(clients: Client[], reservations: Reservation[], today: string): RetentionRow[] {
  const reservationByClient = new Map<string, Reservation[]>();
  reservations
    .filter((reservation) => reservation.status !== "cancelado" && reservation.status !== "manutencao")
    .forEach((reservation) => {
      const clientId = (reservation as { cliente_id?: string | null }).cliente_id;
      if (!clientId) return;
      const list = reservationByClient.get(clientId) ?? [];
      list.push(reservation);
      reservationByClient.set(clientId, list);
    });

  return clients
    .map((client) => {
      const list = (reservationByClient.get(client.id) ?? []).sort((a, b) => a.checkin.localeCompare(b.checkin));
      const receita = list.reduce((sum, reservation) => sum + Number(reservation.valor_total ?? reservation.valor_pago ?? 0), 0);
      const intervaloMedio = averageIntervalDays(list);
      const last = list.at(-1)?.checkout || list.at(-1)?.checkin || null;
      const daysSinceLast = last ? diffDays(last, today) : 0;
      const atrasado = !!last && daysSinceLast > Math.max(30, Math.round(intervaloMedio * 1.5 || 30));
      return {
        id: client.id,
        nome: client.nome,
        tipo: client.tipo ?? "",
        receita,
        intervaloMedio,
        atrasado,
        whatsappUrl: whatsappRetentionUrl(client, atrasado),
      };
    })
    .filter((row) => row.receita > 0 || normalizeText(row.tipo).includes("fixo") || normalizeText(row.tipo).includes("empresa"))
    .sort((a, b) => b.receita - a.receita);
}

function whatsappRetentionUrl(client: Client, atrasado: boolean) {
  const phone = onlyDigits(String(client.telefone ?? ""));
  if (!phone) return null;
  const message = atrasado
    ? `Olá, ${client.nome}! Aqui é do Hotel Real Cruzília. Lembramos de você e sentimos sua falta por aqui. Quando voltar a Cruzília, será um prazer te receber de novo. Posso consultar uma condição especial para sua próxima estadia?`
    : `Olá, ${client.nome}! Aqui é do Hotel Real Cruzília. Estamos à disposição quando precisar se hospedar em Cruzília novamente.`;
  return `https://wa.me/55${phone.startsWith("55") ? phone.slice(2) : phone}?text=${encodeURIComponent(message)}`;
}

function averageIntervalDays(reservations: Reservation[]) {
  if (reservations.length < 2) return 0;
  const intervals: number[] = [];
  for (let i = 1; i < reservations.length; i++) {
    intervals.push(diffDays(reservations[i - 1].checkout || reservations[i - 1].checkin, reservations[i].checkin));
  }
  return Math.round(intervals.reduce((sum, days) => sum + days, 0) / intervals.length);
}

function ageFromBirthdate(value: string | null) {
  if (!value) return null;
  const birth = new Date(`${value}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const hadBirthday =
    now.getMonth() > birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
  if (!hadBirthday) age -= 1;
  return age >= 0 && age < 120 ? age : null;
}

function diffDays(from: string, to: string) {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function labelize(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildSeries(reservations: Reservation[], sales: Sale[], today: string) {
  const days: { key: string; label: string; receita: number; cancelamentos: number; comparecimento: number }[] = [];
  const base = new Date(today + "T00:00:00");
  for (let i = 29; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({
      key,
      label: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`,
      receita: 0,
      cancelamentos: 0,
      comparecimento: 0,
    });
  }
  const idx = new Map(days.map((d) => [d.key, d]));
  reservations.forEach((r) => {
    const day = idx.get((r.checkin || "").slice(0, 10));
    if (!day) return;
    day.receita += Number(r.valor_pago);
    if (r.status === "cancelado") day.cancelamentos += 1;
    if (r.status === "ocupado" || r.status === "finalizado") day.comparecimento += 1;
  });
  sales.forEach((s) => {
    const day = idx.get((s.data || "").slice(0, 10));
    if (day) day.receita += Number(s.total);
  });
  return days;
}

function buildDecisionSeries(
  period: "dia" | "mes" | "ano",
  today: string,
  anchorMonth: string,
  reservations: Reservation[],
  sales: Sale[],
  expenses: Expense[],
) {
  if (period === "ano") return buildMonthlySeries(anchorMonth, reservations, sales, expenses);

  if (period === "dia") {
    const hours = Array.from({ length: 24 }, (_, hour) => ({
      key: String(hour).padStart(2, "0"),
      label: `${String(hour).padStart(2, "0")}h`,
      receita: 0,
      despesas: 0,
    }));
    reservations
      .filter((reservation) => String(reservation.created_at ?? reservation.checkin).slice(0, 10) === today)
      .forEach((reservation) => {
        const hour = new Date(String(reservation.created_at ?? `${today}T12:00:00`)).getHours();
        hours[hour].receita += Number(reservation.valor_pago ?? 0);
      });
    sales
      .filter((sale) => String((sale as { created_at?: string | null }).created_at ?? sale.data).slice(0, 10) === today)
      .forEach((sale) => {
        const hour = new Date(String((sale as { created_at?: string | null }).created_at ?? `${today}T12:00:00`)).getHours();
        hours[hour].receita += Number(sale.total ?? 0);
      });
    expenses
      .filter((expense) => expense.data === today)
      .forEach((expense) => {
        hours[12].despesas += Number(expense.valor ?? 0);
      });
    return hours;
  }

  const [year, monthNumber] = anchorMonth.split("-").map(Number);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, index) => {
    const day = String(index + 1).padStart(2, "0");
    return { key: `${anchorMonth}-${day}`, label: day, receita: 0, despesas: 0 };
  });
  const idx = new Map(days.map((day) => [day.key, day]));
  reservations.forEach((reservation) => {
    const day = idx.get((reservation.checkin || "").slice(0, 10));
    if (day) day.receita += Number(reservation.valor_pago ?? 0);
  });
  sales.forEach((sale) => {
    const day = idx.get((sale.data || "").slice(0, 10));
    if (day) day.receita += Number(sale.total ?? 0);
  });
  expenses.forEach((expense) => {
    const day = idx.get((expense.data || "").slice(0, 10));
    if (day) day.despesas += Number(expense.valor ?? 0);
  });
  return days;
}

function buildMonthlySeries(anchorMonth: string, reservations: Reservation[], sales: Sale[], expenses: Expense[]) {
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const key = addMonths(anchorMonth, -i);
    months.push({
      key,
      label: monthLabel(key),
      receita: revenueForMonth(key, reservations, sales),
      despesas: expensesForMonth(key, expenses),
    });
  }
  return months;
}

function buildMonthMetrics(
  month: string,
  reservations: Reservation[],
  sales: Sale[],
  expenses: Expense[],
  feedbacks: Feedback[],
  roomCount: number,
) {
  const reviews = feedbacks.filter((f) => (f.created_at || "").slice(0, 7) === month && f.nota_geral != null);
  const avaliacao = reviews.length
    ? reviews.reduce((sum, f) => sum + Number(f.nota_geral), 0) / reviews.length
    : 0;
  return {
    receita: revenueForMonth(month, reservations, sales),
    despesas: expensesForMonth(month, expenses),
    ocupacao: occupancyForMonth(month, reservations, roomCount),
    avaliacao,
  };
}

function revenueForMonth(month: string, reservations: Reservation[], sales: Sale[]) {
  return (
    reservations
      .filter((r) => (r.checkin || "").slice(0, 7) === month)
      .reduce((sum, r) => sum + Number(r.valor_pago), 0) +
    sales.filter((s) => (s.data || "").slice(0, 7) === month).reduce((sum, s) => sum + Number(s.total), 0)
  );
}

function expensesForMonth(month: string, expenses: Expense[]) {
  return expenses.filter((e) => (e.data || "").slice(0, 7) === month).reduce((sum, e) => sum + Number(e.valor), 0);
}

function occupancyForMonth(month: string, reservations: Reservation[], roomCount: number) {
  if (!roomCount) return 0;
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(year, monthNumber - 1, 1);
  const last = new Date(year, monthNumber, 0);
  const daysInMonth = last.getDate();
  const occupiedNights = reservations
    .filter((r) => r.status !== "cancelado" && r.status !== "manutencao")
    .reduce((sum, r) => sum + overlappingNights(r.checkin, r.checkout, first, last), 0);
  return Math.round((occupiedNights / (roomCount * daysInMonth)) * 100);
}

function overlappingNights(checkin: string, checkout: string, first: Date, last: Date) {
  if (!checkin || !checkout) return 0;
  const start = new Date(`${checkin}T00:00:00`);
  const end = new Date(`${checkout}T00:00:00`);
  const monthEndExclusive = new Date(last);
  monthEndExclusive.setDate(last.getDate() + 1);
  const overlapStart = new Date(Math.max(start.getTime(), first.getTime()));
  const overlapEnd = new Date(Math.min(end.getTime(), monthEndExclusive.getTime()));
  return Math.max(0, Math.round((overlapEnd.getTime() - overlapStart.getTime()) / 86400000));
}

function addMonths(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function addYears(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  return `${year + offset}-${String(monthNumber).padStart(2, "0")}`;
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber - 1, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
}

function delta(current: number, previous: number) {
  if (!previous && !current) return 0;
  if (!previous) return 100;
  return ((current - previous) / previous) * 100;
}

function performanceColor(value: number, average: number) {
  if (average <= 0) return "var(--pine)";
  if (value < average * 0.55) return "var(--brick)";
  if (value < average * 0.85) return "var(--brass)";
  return "var(--pine)";
}

function Stat({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="stat-card min-w-0">
      <div className="mb-1.5 flex min-w-0 items-center gap-2 text-pine">
        <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        <span className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      </div>
      <div className="min-w-0 break-words font-serif text-[clamp(0.98rem,1.15vw,1.18rem)] font-bold leading-tight">{value}</div>
      {hint && <div className="mt-1 line-clamp-2 text-[10px] leading-snug text-muted-foreground">{hint}</div>}
    </div>
  );
}

function ComparisonStat({
  icon,
  label,
  value,
  monthDelta,
  yearDelta,
  lowerIsBetter = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  monthDelta: number;
  yearDelta: number;
  lowerIsBetter?: boolean;
}) {
  return (
    <div className="relative min-w-0 overflow-hidden rounded-md border border-brass/35 bg-[linear-gradient(135deg,rgba(208,178,91,0.16),var(--card)_48%)] px-2 py-1.5 shadow-sm">
      <div className="mb-1 flex min-w-0 items-center gap-1.5 text-pine">
        <span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
        <span className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      </div>
      <div className="min-w-0 break-words font-serif text-[clamp(0.86rem,1.05vw,1.02rem)] font-bold leading-tight">{value}</div>
      <div className="mt-1 space-y-0.5 text-[9px]">
        <DeltaLine label="vs mês anterior" value={monthDelta} lowerIsBetter={lowerIsBetter} />
        <DeltaLine label="vs ano anterior" value={yearDelta} lowerIsBetter={lowerIsBetter} />
      </div>
    </div>
  );
}

function DeltaLine({ label, value, lowerIsBetter }: { label: string; value: number; lowerIsBetter: boolean }) {
  const positive = value >= 0;
  const good = lowerIsBetter ? !positive : positive;
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <div className={`flex items-center justify-between gap-2 ${good ? "text-pine" : "text-brick"}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1 font-semibold">
        <Icon className="h-3 w-3" />
        {value > 0 ? "+" : ""}
        {value.toFixed(1)}%
      </span>
    </div>
  );
}

function WifiInsight({
  complaints,
  feedbacks,
}: {
  complaints: { categoria: string; quarto: number | null; dispositivo: string | null }[];
  feedbacks: { quarto: number | null; wifi_problema: boolean; wifi_dispositivo: string | null }[];
}) {
  const wifiComplaints = complaints.filter((c) => c.categoria === "wifi");
  const wifiFeedbacks = feedbacks.filter((f) => f.wifi_problema);

  const rooms = new Map<number, number>();
  wifiComplaints.forEach((c) => c.quarto != null && rooms.set(c.quarto, (rooms.get(c.quarto) ?? 0) + 1));
  wifiFeedbacks.forEach((f) => f.quarto != null && rooms.set(f.quarto, (rooms.get(f.quarto) ?? 0) + 1));

  const devices = new Map<string, number>();
  wifiComplaints.forEach((c) => c.dispositivo && devices.set(c.dispositivo, (devices.get(c.dispositivo) ?? 0) + 1));
  wifiFeedbacks.forEach((f) => f.wifi_dispositivo && devices.set(f.wifi_dispositivo, (devices.get(f.wifi_dispositivo) ?? 0) + 1));

  const topRooms = [...rooms.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const topDevices = [...devices.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);

  if (topRooms.length === 0 && topDevices.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem registros de Wi-Fi ainda.</p>;
  }

  const repeatingRoom = topRooms.find(([, n]) => n >= 2);

  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="mb-1 text-xs font-semibold text-muted-foreground">Por quarto</p>
          {topRooms.length ? (
            topRooms.map(([q, n]) => (
              <div key={q} className="flex justify-between border-b border-border/60 py-1">
                <span>Quarto {q}</span>
                <span className="font-semibold">{n}</span>
              </div>
            ))
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold text-muted-foreground">Por aparelho</p>
          {topDevices.length ? (
            topDevices.map(([d, n]) => (
              <div key={d} className="flex justify-between border-b border-border/60 py-1">
                <span>{d}</span>
                <span className="font-semibold">{n}</span>
              </div>
            ))
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </div>
      </div>
      <p className="rounded-lg bg-sage-bg/60 px-3 py-2 text-xs text-pine-dark">
        {repeatingRoom
          ? `O quarto ${repeatingRoom[0]} repete queixas de Wi-Fi — provável problema de sinal no quarto.`
          : "As queixas estão espalhadas por vários quartos/aparelhos — provavelmente ligadas ao aparelho do hóspede, não a um quarto específico."}
      </p>
    </div>
  );
}

function mostCommon(arr: string[]): string {
  const m = new Map<string, number>();
  arr.forEach((x) => m.set(x, (m.get(x) ?? 0) + 1));
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

function roomCapacity(config: string): number {
  const numbers = config.match(/\d+/g)?.map(Number) ?? [];
  if (numbers.length) return Math.max(...numbers);
  const text = config.toLowerCase();
  if (text.includes("triplo")) return 3;
  if (text.includes("quad")) return 4;
  if (text.includes("famil")) return 5;
  if (text.includes("duplo") || text.includes("casal")) return 2;
  return 1;
}
