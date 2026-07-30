import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeDollarSign,
  BedDouble,
  Building2,
  CalendarDays,
  CircleDollarSign,
  Globe2,
  MessageSquareWarning,
  Percent,
  Star,
  TrendingUp,
  Users,
  WalletCards,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
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
  type Client,
  type Reservation,
  type Room,
} from "@/lib/data";
import { fmtBRL, todayISO } from "@/lib/format";
import {
  calculateHotelKpis,
  expensesTotal,
  inRange,
  periodRange,
  reservationReceived,
  saleReceived,
  type DashboardPeriod,
} from "@/lib/dashboard-utils";
import { semanticChartColor } from "@/lib/chart-colors";

export const Route = createFileRoute("/_authenticated/central-estrategica")({
  component: CentralEstrategica,
});

type ExtendedReservation = Reservation & {
  canal?: string | null;
  origem?: string | null;
  motivo_viagem?: string | null;
  no_show?: boolean | null;
  tarifa?: string | null;
};

type ExtendedClient = Client & {
  cidade?: string | null;
  estado?: string | null;
  pais?: string | null;
  data_nascimento?: string | null;
};

type ExtendedRoom = Room & {
  tipo?: string | null;
  categoria?: string | null;
};

function CentralEstrategica() {
  const [period, setPeriod] = useState<DashboardPeriod>("mes");
  const today = todayISO();
  const range = periodRange(period, today);
  const { data: rooms = [] } = useRooms();
  const { data: reservations = [] } = useReservations();
  const { data: sales = [] } = useSales();
  const { data: clients = [] } = useClients();
  const { data: expenses = [] } = useExpenses();
  const { data: complaints = [] } = useComplaints();
  const { data: feedbacks = [] } = useFeedbacks();

  const periodReservations = reservations.filter(
    (reservation) =>
      reservation.status !== "cancelado" &&
      reservation.status !== "manutencao" &&
      inRange(reservation.checkin, range),
  );
  const periodSales = sales.filter((sale) => inRange(sale.data, range));
  const periodExpenses = expenses.filter((expense) => inRange(expense.data, range));
  const revenue =
    periodReservations.reduce((sum, item) => sum + reservationReceived(item), 0) +
    periodSales.reduce((sum, item) => sum + saleReceived(item), 0);
  const cost = expensesTotal(periodExpenses);
  const gop = revenue - cost;
  const margin = revenue > 0 ? (gop / revenue) * 100 : 0;
  const hotelKpis = calculateHotelKpis({ rooms, reservations, sales, expenses, range });

  const cancelled = reservations.filter(
    (reservation) => reservation.status === "cancelado" && inRange(reservation.checkin, range),
  ).length;
  const noShows = reservations.filter((reservation) => {
    const item = reservation as ExtendedReservation;
    return Boolean(item.no_show) && inRange(reservation.checkin, range);
  }).length;
  const activeToday = reservations.filter(
    (reservation) =>
      reservation.status !== "cancelado" &&
      reservation.status !== "finalizado" &&
      reservation.status !== "manutencao" &&
      reservation.checkin <= today &&
      reservation.checkout >= today,
  );
  const occupiedRooms = new Set(activeToday.map((reservation) => reservation.quarto)).size;
  const availableRooms = Math.max(0, rooms.length - occupiedRooms);
  const occupancyNow = rooms.length ? (occupiedRooms / rooms.length) * 100 : 0;
  const averageRating = feedbacks.length
    ? feedbacks.reduce((sum, feedback) => sum + Number(feedback.nota_geral ?? 0), 0) /
      feedbacks.filter((feedback) => feedback.nota_geral != null).length
    : 0;

  const financialSeries = useMemo(
    () => buildFinancialSeries(range.start, range.end, reservations, sales, expenses),
    [range.start, range.end, reservations, sales, expenses],
  );
  const channelRows = useMemo(() => groupRevenueByChannel(periodReservations), [periodReservations]);
  const roomTypeRows = useMemo(
    () => groupRevenueByRoomType(periodReservations, rooms as ExtendedRoom[]),
    [periodReservations, rooms],
  );
  const expenseRows = useMemo(() => groupExpenses(periodExpenses), [periodExpenses]);
  const originRows = useMemo(() => groupOrigins(clients as ExtendedClient[]), [clients]);
  const complaintRows = useMemo(() => groupComplaints(complaints), [complaints]);

  const actions = buildRecommendedActions({
    occupancy: hotelKpis.occupancyRate,
    margin,
    cancelled,
    noShows,
    complaintsOpen: complaints.filter((item) => item.status !== "resolvido").length,
    directShare: channelRows.find((row) => row.name === "Direto")?.share ?? 0,
  });

  return (
    <div className="space-y-3 pb-8">
      <header className="flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
            Painel estratégico
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
            Central Estratégica do Hotel
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Ocupação, receita, preços, finanças, hóspedes e reputação em uma visão única.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[10px] font-semibold uppercase text-muted-foreground">
            Período
            <select
              className="field mt-1 h-8 min-w-32 py-1 text-xs"
              value={period}
              onChange={(event) => setPeriod(event.target.value as DashboardPeriod)}
            >
              <option value="dia">Hoje</option>
              <option value="mes">Mês</option>
              <option value="ano">Ano</option>
            </select>
          </label>
          <div className="rounded-lg bg-primary px-4 py-2 text-primary-foreground shadow-sm">
            <p className="text-[9px] font-bold uppercase opacity-80">Resultado do período</p>
            <p className="text-lg font-bold tabular-nums">{fmtBRL(gop)}</p>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
        <MiniKpi icon={<BedDouble />} label="Ocupação" value={`${hotelKpis.occupancyRate.toFixed(1)}%`} hint={`${occupancyNow.toFixed(0)}% agora`} />
        <MiniKpi icon={<CalendarDays />} label="Disponíveis" value={String(availableRooms)} hint={`${occupiedRooms} ocupados`} />
        <MiniKpi icon={<BadgeDollarSign />} label="ADR" value={fmtBRL(hotelKpis.adr)} hint={`${hotelKpis.soldRoomNights} UH vendidas`} />
        <MiniKpi icon={<TrendingUp />} label="RevPAR" value={fmtBRL(hotelKpis.revpar)} hint="por UH disponível" />
        <MiniKpi icon={<CircleDollarSign />} label="Receita" value={fmtBRL(revenue)} hint="hospedagem + extras" />
        <MiniKpi icon={<WalletCards />} label="GOP" value={fmtBRL(gop)} hint={`${margin.toFixed(1)}% de margem`} />
        <MiniKpi icon={<AlertTriangle />} label="Cancelamentos" value={String(cancelled)} hint={`${noShows} no-show`} danger={cancelled > 0} />
        <MiniKpi icon={<Star />} label="Avaliação" value={averageRating ? averageRating.toFixed(1) : "—"} hint={`${feedbacks.length} respostas`} />
      </section>

      <section className="grid gap-3 xl:grid-cols-12">
        <ChartCard className="xl:col-span-8" title="Receita, despesas e GOP" subtitle="Evolução do resultado no período">
          <ResponsiveContainer width="100%" height={250}>
            <ComposedChart data={financialSeries} margin={{ left: 4, right: 12, top: 12, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10 }} width={62} tickFormatter={compactCurrency} />
              <Tooltip formatter={(value: number) => fmtBRL(value)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="receita" name="Receita" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="despesas" name="Despesas" fill="var(--chart-4)" radius={[4, 4, 0, 0]} />
              <Line type="monotone" dataKey="gop" name="GOP" stroke="var(--primary)" strokeWidth={2.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard className="xl:col-span-4" title="Custos operacionais" subtitle="Participação por categoria">
          {expenseRows.length ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={expenseRows} dataKey="value" nameKey="name" innerRadius="48%" outerRadius="76%">
                  {expenseRows.map((row, index) => (
                    <Cell key={row.name} fill={semanticChartColor(row.name, index)} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => fmtBRL(value)} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState text="Nenhuma despesa lançada no período." />
          )}
        </ChartCard>

        <ChartCard className="xl:col-span-4" title="Receita por canal" subtitle="Origem das reservas recebidas">
          <HorizontalBars rows={channelRows} />
        </ChartCard>
        <ChartCard className="xl:col-span-4" title="Receita por tipo de quarto" subtitle="Categorias com melhor resultado">
          <HorizontalBars rows={roomTypeRows} />
        </ChartCard>
        <ChartCard className="xl:col-span-4" title="Tarifa e concorrência" subtitle="Base pronta para integração tarifária">
          <div className="grid h-[220px] place-items-center rounded-lg border border-dashed border-border bg-muted/20 p-5 text-center">
            <div>
              <Building2 className="mx-auto h-7 w-7 text-primary" />
              <p className="mt-2 text-sm font-semibold text-foreground">ADR atual: {fmtBRL(hotelKpis.adr)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Cadastre ou integre tarifas dos concorrentes para comparar preço, ocupação e oportunidade de reajuste.
              </p>
            </div>
          </div>
        </ChartCard>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <InsightCard icon={<Users />} title="Perfil dos hóspedes">
          <StatLine label="Origem principal" value={originRows[0]?.name ?? "Não informada"} />
          <StatLine label="Hóspedes cadastrados" value={String(clients.length)} />
          <StatLine label="Permanência média" value={`${averageStay(periodReservations).toFixed(1)} noites`} />
          <StatLine label="Motivo da viagem" value="Pendente de cadastro estruturado" muted />
        </InsightCard>

        <InsightCard icon={<MessageSquareWarning />} title="Avaliações e reclamações">
          <StatLine label="Avaliação interna" value={averageRating ? averageRating.toFixed(1) : "—"} />
          <StatLine label="Reclamações abertas" value={String(complaints.filter((item) => item.status !== "resolvido").length)} />
          <StatLine label="Principal tema" value={complaintRows[0]?.name ?? "Sem ocorrências"} />
          <StatLine label="Booking / Google" value="Pendente de integração" muted />
        </InsightCard>

        <InsightCard icon={<Globe2 />} title="Ações recomendadas">
          <ul className="space-y-2">
            {actions.map((action) => (
              <li key={action} className="flex gap-2 text-xs text-foreground">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </InsightCard>
      </section>
    </div>
  );
}

function MiniKpi({
  icon,
  label,
  value,
  hint,
  danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  danger?: boolean;
}) {
  return (
    <article className="min-h-[86px] rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className={danger ? "text-destructive" : "text-primary"}>{icon}</span>
        <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
      </div>
      <p className={danger ? "mt-1 text-lg font-bold tabular-nums text-destructive" : "mt-1 text-lg font-bold tabular-nums text-foreground"}>{value}</p>
      <p className="truncate text-[10px] text-muted-foreground">{hint}</p>
    </article>
  );
}

function ChartCard({
  title,
  subtitle,
  className = "",
  children,
}: {
  title: string;
  subtitle: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <article className={`rounded-xl border border-border bg-card p-3 shadow-sm ${className}`}>
      <h2 className="text-sm font-bold text-foreground">{title}</h2>
      <p className="mb-2 text-[10px] text-muted-foreground">{subtitle}</p>
      {children}
    </article>
  );
}

function InsightCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <article className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-primary">
        {icon}
        <h2 className="text-sm font-bold text-foreground">{title}</h2>
      </div>
      {children}
    </article>
  );
}

function StatLine({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/70 py-2 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <strong className={muted ? "text-right text-xs font-medium text-muted-foreground" : "text-right text-xs text-foreground"}>{value}</strong>
    </div>
  );
}

function HorizontalBars({ rows }: { rows: { name: string; value: number }[] }) {
  if (!rows.length) return <EmptyState text="Ainda não há dados suficientes para este gráfico." />;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={rows.slice(0, 6)} layout="vertical" margin={{ left: 8, right: 14, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={compactCurrency} />
        <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 10 }} />
        <Tooltip formatter={(value: number) => fmtBRL(value)} />
        <Bar dataKey="value" name="Receita" fill="var(--primary)" radius={[0, 5, 5, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="grid h-[220px] place-items-center text-center text-xs text-muted-foreground">{text}</div>;
}

function buildFinancialSeries(
  start: string,
  end: string,
  reservations: Reservation[],
  sales: { data: string; total: number | string }[],
  expenses: { data: string; valor: number | string }[],
) {
  const rows = new Map<string, { key: string; label: string; receita: number; despesas: number; gop: number }>();
  const cursor = new Date(`${start}T12:00:00`);
  const finish = new Date(`${end}T12:00:00`);
  while (cursor <= finish) {
    const key = cursor.toISOString().slice(0, 10);
    rows.set(key, { key, label: key.slice(8, 10) + "/" + key.slice(5, 7), receita: 0, despesas: 0, gop: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  reservations.forEach((item) => {
    const row = rows.get(item.checkin);
    if (row && item.status !== "cancelado" && item.status !== "manutencao") row.receita += reservationReceived(item);
  });
  sales.forEach((item) => {
    const row = rows.get(item.data);
    if (row) row.receita += Number(item.total);
  });
  expenses.forEach((item) => {
    const row = rows.get(item.data);
    if (row) row.despesas += Number(item.valor);
  });
  return [...rows.values()].map((row) => ({ ...row, gop: row.receita - row.despesas }));
}

function groupRevenueByChannel(reservations: Reservation[]) {
  const map = new Map<string, number>();
  reservations.forEach((reservation) => {
    const item = reservation as ExtendedReservation;
    const raw = item.canal?.trim().toLowerCase();
    const name = !raw ? "Direto" : raw.includes("booking") ? "Booking" : raw.includes("agenc") ? "Agências" : raw.includes("whats") ? "WhatsApp" : item.canal!.trim();
    map.set(name, (map.get(name) ?? 0) + reservationReceived(reservation));
  });
  const total = [...map.values()].reduce((sum, value) => sum + value, 0);
  return [...map]
    .map(([name, value]) => ({ name, value, share: total ? (value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}

function groupRevenueByRoomType(reservations: Reservation[], rooms: ExtendedRoom[]) {
  const roomMap = new Map(rooms.map((room) => [room.numero, room.tipo || room.categoria || room.configuracao || `Quarto ${room.numero}`]));
  const map = new Map<string, number>();
  reservations.forEach((reservation) => {
    const name = roomMap.get(reservation.quarto) || `Quarto ${reservation.quarto}`;
    map.set(name, (map.get(name) ?? 0) + reservationReceived(reservation));
  });
  return [...map].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

function groupExpenses(expenses: { categoria?: string | null; valor: number | string }[]) {
  const map = new Map<string, number>();
  expenses.forEach((expense) => {
    const name = expense.categoria || "Sem categoria";
    map.set(name, (map.get(name) ?? 0) + Number(expense.valor));
  });
  return [...map].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
}

function groupOrigins(clients: ExtendedClient[]) {
  const map = new Map<string, number>();
  clients.forEach((client) => {
    const name = client.cidade || client.estado || client.pais || "Não informada";
    map.set(name, (map.get(name) ?? 0) + 1);
  });
  return [...map].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

function groupComplaints(complaints: { categoria?: string | null }[]) {
  const map = new Map<string, number>();
  complaints.forEach((complaint) => {
    const name = complaint.categoria || "Outros";
    map.set(name, (map.get(name) ?? 0) + 1);
  });
  return [...map].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

function averageStay(reservations: Reservation[]) {
  if (!reservations.length) return 0;
  return reservations.reduce((sum, item) => {
    const start = new Date(`${item.checkin}T12:00:00`).getTime();
    const end = new Date(`${item.checkout}T12:00:00`).getTime();
    return sum + Math.max(1, Math.round((end - start) / 86_400_000));
  }, 0) / reservations.length;
}

function buildRecommendedActions({
  occupancy,
  margin,
  cancelled,
  noShows,
  complaintsOpen,
  directShare,
}: {
  occupancy: number;
  margin: number;
  cancelled: number;
  noShows: number;
  complaintsOpen: number;
  directShare: number;
}) {
  const actions: string[] = [];
  if (occupancy < 50) actions.push("Ocupação abaixo de 50%: concentre promoções nos dias fracos e canais com melhor receita líquida.");
  if (margin < 25) actions.push("Margem operacional abaixo de 25%: revise categorias de custo e comissões antes de aumentar descontos.");
  if (cancelled + noShows > 5) actions.push("Cancelamentos e no-shows elevados: reforce confirmação, política de sinal e lembretes automáticos.");
  if (directShare < 35) actions.push("Baixa participação de vendas diretas: incentive reservas pelo site e WhatsApp para reduzir comissões.");
  if (complaintsOpen > 3) actions.push("Há reclamações abertas suficientes para afetar reputação: priorize os temas mais recorrentes.");
  if (!actions.length) actions.push("Os indicadores estão equilibrados. Mantenha preços, custos e reputação sob acompanhamento diário.");
  return actions.slice(0, 4);
}

function compactCurrency(value: number) {
  const absolute = Math.abs(Number(value));
  if (absolute >= 1_000_000) return `R$ ${(Number(value) / 1_000_000).toFixed(1)} mi`;
  if (absolute >= 1_000) return `R$ ${(Number(value) / 1_000).toFixed(1)} mil`;
  return `R$ ${Number(value).toFixed(0)}`;
}
