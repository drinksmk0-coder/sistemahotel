import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  BedDouble,
  CalendarDays,
  CircleDollarSign,
  Filter,
  Info,
  RotateCcw,
  TrendingDown,
  TrendingUp,
  Users,
  WalletCards,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany } from "@/lib/data";
import { fmtBRL } from "@/lib/format";

const COLORS = {
  navy: "#173F52",
  blue: "#256A8A",
  sky: "#67A6BF",
  teal: "#0F766E",
  green: "#15803D",
  amber: "#B7791F",
  red: "#C94A4A",
  gray: "#8798A1",
  grid: "#DDE6EA",
};

const n = (value: unknown) => Number(value || 0);
const pct = (value: number) => `${value.toFixed(1).replace(".", ",")}%`;
const norm = (value: unknown) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
const todayISO = () => new Date().toISOString().slice(0, 10);
const addDays = (date: string, amount: number) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
};
const dateRange = (start: string, end: string) => {
  const output: string[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) output.push(date);
  return output;
};
const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
const periodLabel = (start: string, end: string) => {
  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);
  const a = startDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  const b = endDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  return `${a} a ${b}`.replace(/\./g, "");
};
const overlap = (reservation: any, start: string, end: string) =>
  reservation.checkin <= end && reservation.checkout > start;
const stayDays = (reservation: any, start: string, end: string) => {
  const first = reservation.checkin > start ? reservation.checkin : start;
  const exclusiveEnd = reservation.checkout < addDays(end, 1) ? reservation.checkout : addDays(end, 1);
  const output: string[] = [];
  for (let date = first; date < exclusiveEnd; date = addDays(date, 1)) output.push(date);
  return output;
};
const isCanceled = (reservation: any) =>
  n(reservation.cancelado_flag) === 1 || norm(reservation.status).includes("cancel");
const isNoShow = (reservation: any) => n(reservation.no_show_flag) === 1 || norm(reservation.status).includes("no show");
const isValidStay = (reservation: any) => !isCanceled(reservation) && !isNoShow(reservation);
const diffDays = (a: string, b: string) =>
  Math.max(0, Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86400000));
const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const scoreFeedback = (feedback: any) => {
  if (n(feedback.nota_externa_10) > 0) return n(feedback.nota_externa_10);
  if (n(feedback.nota_geral) > 0) return n(feedback.nota_geral) * 2;
  return null;
};

const OPERATIONAL_EXCLUDED = ["retirada", "movimentacao financeira", "movimentação financeira"];
const isOperationalExpense = (expense: any) =>
  !OPERATIONAL_EXCLUDED.some((term) => norm(expense.categoria).includes(norm(term)));

type Source = {
  reservations: any[];
  sales: any[];
  expenses: any[];
  rooms: any[];
  feedbacks: any[];
  forecast: any[];
};

type Filters = {
  channel: string;
  room: string;
  status: string;
  reason: string;
};

type PeriodMetrics = ReturnType<typeof buildPeriodMetrics>;

type TabKey = "executive" | "channels" | "occupancy" | "rooms" | "guests" | "finance";

export function ExecutiveDecisionDashboard() {
  const company = useCurrentCompany();
  const companyId = company.data?.id;
  const today = todayISO();
  const [start, setStart] = useState(`${today.slice(0, 7)}-01`);
  const [end, setEnd] = useState(today);
  const [filters, setFilters] = useState<Filters>({ channel: "Todos", room: "Todos", status: "Todos", reason: "Todos" });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>("executive");

  const query = useQuery({
    queryKey: ["executive-decision-dashboard-v2", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<Source> => {
      const [reservations, sales, expenses, rooms, feedbacks] = await Promise.all([
        (supabase as any).from("bi_reservas_decisao").select("*").eq("company_id", companyId).limit(10000),
        (supabase as any)
          .from("sales")
          .select("data,total,valor_pago,status,reserva_id,quarto,comprador_tipo,comprador_nome")
          .eq("company_id", companyId)
          .limit(10000),
        (supabase as any).from("expenses").select("data,categoria,descricao,valor").eq("company_id", companyId).limit(10000),
        (supabase as any)
          .from("rooms")
          .select("numero,andar,configuracao,preco,banheiro,situacao,prioridade_venda")
          .eq("company_id", companyId)
          .lt("numero", 900)
          .order("numero"),
        (supabase as any)
          .from("feedbacks")
          .select("quarto,nota_geral,nota_externa_10,nota_limpeza,nota_conforto,nota_chuveiro,nota_banheiro,nota_cama,nota_silencio,fonte_avaliacao,quarto_match_confidence,created_at")
          .eq("company_id", companyId)
          .limit(5000),
      ]);
      for (const result of [reservations, sales, expenses, rooms, feedbacks]) if (result.error) throw result.error;
      let forecast: any[] = [];
      try {
        const result = await supabase.functions.invoke("hotel-random-forest", { body: { company_id: companyId } });
        forecast = result.data?.occupancy?.forecast || [];
      } catch {
        forecast = [];
      }
      return {
        reservations: reservations.data || [],
        sales: sales.data || [],
        expenses: expenses.data || [],
        rooms: rooms.data || [],
        feedbacks: feedbacks.data || [],
        forecast,
      };
    },
  });

  const model = useMemo(() => {
    if (!query.data) return null;
    const days = dateRange(start, end).length;
    const previousEnd = addDays(start, -1);
    const previousStart = addDays(previousEnd, -(days - 1));
    const current = buildPeriodMetrics(query.data, start, end, filters);
    const previous = buildPeriodMetrics(query.data, previousStart, previousEnd, filters);
    const channels = channelMetrics(query.data, start, end, filters, current);
    const roomRows = roomMetrics(query.data, start, end, filters, current);
    const guests = guestMetrics(query.data, start, end, filters);
    const forecast = buildForecast(query.data.forecast, today, 30);
    const alerts = buildAlerts(current, previous, query.data.rooms, guests, forecast);
    return { current, previous, channels, roomRows, guests, forecast, alerts, previousStart, previousEnd };
  }, [query.data, start, end, filters, today]);

  const options = useMemo(() => {
    const reservations = query.data?.reservations || [];
    return {
      channels: ["Todos", ...unique(reservations.map((item) => item.canal_analitico).filter(Boolean))],
      rooms: ["Todos", ...unique((query.data?.rooms || []).map((item) => String(item.numero)))],
      statuses: ["Todos", ...unique(reservations.map((item) => String(item.status || "Não informado")).filter(Boolean))],
      reasons: ["Todos", ...unique(reservations.map((item) => normalizeReason(item.motivo_estadia)).filter(Boolean))],
    };
  }, [query.data]);

  if (query.isLoading || company.isLoading) return <DashboardSkeleton />;
  if (query.error || !model) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Não foi possível carregar o Relatório. Atualize a página e tente novamente.
      </div>
    );
  }

  const { current, previous } = model;
  const resetFilters = () => setFilters({ channel: "Todos", room: "Todos", status: "Todos", reason: "Todos" });
  const activeFilters = Object.entries(filters).filter(([, value]) => value !== "Todos");

  return (
    <main className="space-y-3 px-2 pb-10 sm:px-3">
      <header className="relative rounded-2xl border border-border bg-card p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <TrendingUp className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h1 className="truncate text-xl font-black text-pine-dark">Relatório</h1>
                <p className="text-[11px] font-semibold text-muted-foreground">{periodLabel(start, end)} · realizado, estimado e projetado</p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen((value) => !value)}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-2 text-xs font-bold text-foreground shadow-sm hover:bg-muted"
          >
            <Filter className="h-4 w-4" /> Filtros
          </button>
          {filtersOpen && (
            <div className="absolute right-3 top-16 z-30 grid w-[min(94vw,430px)] grid-cols-2 gap-2 rounded-2xl border border-border bg-card p-3 shadow-2xl">
              <label className="text-[10px] font-bold text-muted-foreground">Início<input className="field mt-1" type="date" value={start} onChange={(event) => setStart(event.target.value)} /></label>
              <label className="text-[10px] font-bold text-muted-foreground">Fim<input className="field mt-1" type="date" value={end} onChange={(event) => setEnd(event.target.value)} /></label>
              <FilterSelect label="Canal" value={filters.channel} options={options.channels} onChange={(value) => setFilters((state) => ({ ...state, channel: value }))} />
              <FilterSelect label="Quarto" value={filters.room} options={options.rooms} onChange={(value) => setFilters((state) => ({ ...state, room: value }))} />
              <FilterSelect label="Status" value={filters.status} options={options.statuses} onChange={(value) => setFilters((state) => ({ ...state, status: value }))} />
              <FilterSelect label="Motivo da viagem" value={filters.reason} options={options.reasons} onChange={(value) => setFilters((state) => ({ ...state, reason: value }))} />
              <button type="button" onClick={resetFilters} className="col-span-2 inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold hover:bg-muted">
                <RotateCcw className="h-3.5 w-3.5" /> Limpar filtros
              </button>
            </div>
          )}
        </div>

        {activeFilters.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2">
            {activeFilters.map(([key, value]) => (
              <button
                type="button"
                key={key}
                onClick={() => setFilters((state) => ({ ...state, [key]: "Todos" }))}
                className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary"
              >
                {filterName(key)}: {value} ×
              </button>
            ))}
          </div>
        )}
      </header>

      <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-border bg-card p-1.5 shadow-sm">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold transition ${tab === item.key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted"}`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === "executive" && (
        <ExecutiveTab current={current} previous={previous} channels={model.channels} forecast={model.forecast} alerts={model.alerts} />
      )}
      {tab === "channels" && <ChannelsTab current={current} channels={model.channels} />}
      {tab === "occupancy" && <OccupancyTab current={current} previous={previous} forecast={model.forecast} />}
      {tab === "rooms" && <RoomsTab current={current} rooms={model.roomRows} />}
      {tab === "guests" && <GuestsTab guests={model.guests} />}
      {tab === "finance" && <FinanceTab current={current} />}
    </main>
  );
}

function ExecutiveTab({ current, previous, channels, forecast, alerts }: { current: PeriodMetrics; previous: PeriodMetrics; channels: any[]; forecast: any[]; alerts: any[] }) {
  const cards = [
    {
      title: "Receita líquida*",
      value: fmtBRL(current.netRevenue),
      delta: compare(current.netRevenue, previous.netRevenue),
      help: "Receita efetivamente paga de hospedagem + receitas extras registradas. Como comissão de canal não está configurada, o valor ainda não desconta comissões.",
    },
    { title: "Ocupação", value: pct(current.occupancy), delta: compare(current.occupancy, previous.occupancy), help: "UHs ocupadas ÷ UHs disponíveis no período. Inventário considera a situação atual dos quartos." },
    { title: "ADR", value: fmtBRL(current.adr), delta: compare(current.adr, previous.adr), help: "Receita de hospedagem efetivamente paga ÷ diárias ocupadas." },
    { title: "RevPAR", value: fmtBRL(current.revpar), delta: compare(current.revpar, previous.revpar), help: "Receita de hospedagem efetivamente paga ÷ UHs disponíveis no período." },
    { title: "GOP projetado", value: fmtBRL(current.gopProjected), delta: compare(current.gopProjected, previous.gopProjected), help: "Receita realizada – despesas operacionais registradas – custos estimados pendentes." },
    { title: "Margem GOP", value: pct(current.gopMarginProjected), delta: compare(current.gopMarginProjected, previous.gopMarginProjected), help: "GOP projetado ÷ receita realizada × 100." },
  ];
  return (
    <div className="space-y-3">
      <section className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {cards.map((card) => <KpiCard key={card.title} {...card} />)}
      </section>

      <AlertPanel alerts={alerts} />

      <section className="grid gap-3 xl:grid-cols-[1.25fr_.75fr]">
        <Panel title="Ocupação realizada e previsão" subtitle="Linha contínua = realizado · tracejada = previsão do modelo">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={[...current.daily.map((row: any) => ({ label: row.label, real: row.occupancy })), ...forecast.map((row: any) => ({ label: row.label, forecast: row.occupancy }))]}>
              <CartesianGrid stroke={COLORS.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(value: any) => pct(n(value))} />
              <Legend />
              <Line type="monotone" dataKey="real" name="Realizado" stroke={COLORS.navy} strokeWidth={3} dot={false} connectNulls={false} />
              <Line type="monotone" dataKey="forecast" name="Previsto" stroke={COLORS.sky} strokeWidth={3} strokeDasharray="8 6" dot={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Receita líquida por canal" subtitle="Comissão não configurada: líquido equivale ao realizado">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={channels.slice(0, 6)} layout="vertical" margin={{ left: 10, right: 10 }}>
              <CartesianGrid stroke={COLORS.grid} horizontal={false} />
              <XAxis type="number" tickFormatter={(value) => `R$ ${Math.round(value / 1000)}k`} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="channel" width={100} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(value: any) => fmtBRL(n(value))} />
              <Bar dataKey="netRevenue" name="Receita realizada" fill={COLORS.blue} radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <DecisionCard icon={<CircleDollarSign className="h-4 w-4" />} title="Resultado operacional" rows={[
          ["GOP realizado", fmtBRL(current.gopRealized)],
          ["Custos estimados pendentes", fmtBRL(current.estimatedPending)],
          ["GOP projetado", fmtBRL(current.gopProjected)],
          ["GOPPAR projetado", fmtBRL(current.gopparProjected)],
        ]} />
        <DecisionCard icon={<CalendarDays className="h-4 w-4" />} title="Reservas e cancelamentos" rows={[
          ["Reservas", String(current.bookingBase)],
          ["Cancelamentos", `${current.canceledCount} · ${pct(current.cancellationRate)}`],
          ["Diárias perdidas", String(current.lostNights)],
          ["Valor perdido", fmtBRL(current.lostRevenue)],
        ]} />
        <DecisionCard icon={<Info className="h-4 w-4" />} title="Revenue management" rows={[
          ["Lead time médio", `${current.leadTime.toFixed(1).replace(".", ",")} dias`],
          ["Permanência média", `${current.averageStay.toFixed(1).replace(".", ",")} diárias`],
          ["Pick-up 1/3/7 dias", "Dados indisponíveis"],
          ["Booking pace", "Exige snapshots históricos"],
        ]} />
      </section>
    </div>
  );
}

function ChannelsTab({ current, channels }: { current: PeriodMetrics; channels: any[] }) {
  return (
    <div className="space-y-3">
      <section className="grid gap-3 xl:grid-cols-2">
        <Panel title="Receita realizada por canal" subtitle="Hospedagem paga no período">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={channels}>
              <CartesianGrid stroke={COLORS.grid} vertical={false} />
              <XAxis dataKey="channel" tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={(value) => `R$ ${Math.round(value / 1000)}k`} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(value: any) => fmtBRL(n(value))} />
              <Bar dataKey="netRevenue" name="Receita realizada" fill={COLORS.blue} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Cancelamento por canal" subtitle="Quantidade e taxa dentro de cada canal">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={channels}>
              <CartesianGrid stroke={COLORS.grid} vertical={false} />
              <XAxis dataKey="channel" tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={(value) => `${value}%`} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(value: any) => pct(n(value))} />
              <Bar dataKey="cancellationRate" name="Taxa de cancelamento" fill={COLORS.red} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </section>
      <Panel title="Rentabilidade por canal" subtitle="Comissão e taxas aparecem como não configuradas; não são inventadas">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-xs">
            <thead className="border-b text-[10px] uppercase tracking-wide text-muted-foreground"><tr>{["Canal","Reservas","Diárias","Receita bruta","Receita realizada","Cancelamentos","ADR","Permanência","Lead time","Comissão","Margem estimada","Part. receita"].map((item) => <th key={item} className="px-2 py-2">{item}</th>)}</tr></thead>
            <tbody>{channels.map((row) => <tr key={row.channel} className="border-b border-border/50"><td className="px-2 py-2 font-bold">{row.channel}</td><td className="px-2 py-2">{row.reservations}</td><td className="px-2 py-2">{row.nights}</td><td className="px-2 py-2">{fmtBRL(row.grossRevenue)}</td><td className="px-2 py-2 font-bold text-primary">{fmtBRL(row.netRevenue)}</td><td className="px-2 py-2">{row.canceled} · {pct(row.cancellationRate)}</td><td className="px-2 py-2">{fmtBRL(row.adr)}</td><td className="px-2 py-2">{row.averageStay.toFixed(1).replace(".",",")}</td><td className="px-2 py-2">{row.leadTime.toFixed(1).replace(".",",")} d</td><td className="px-2 py-2 text-muted-foreground">Não configurada</td><td className="px-2 py-2">{fmtBRL(row.estimatedMargin)}</td><td className="px-2 py-2">{pct(row.revenueShare)}</td></tr>)}</tbody>
          </table>
        </div>
      </Panel>
      <p className="rounded-xl bg-muted/50 px-3 py-2 text-[10px] text-muted-foreground">Receita total realizada no filtro: {fmtBRL(current.netRevenue)}. A margem por canal é uma estimativa com rateio proporcional de despesas compartilhadas; não inclui comissão até ela ser cadastrada.</p>
    </div>
  );
}

function OccupancyTab({ current, previous, forecast }: { current: PeriodMetrics; previous: PeriodMetrics; forecast: any[] }) {
  return (
    <div className="space-y-3">
      <section className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
        <KpiCard title="Ocupação" value={pct(current.occupancy)} delta={compare(current.occupancy, previous.occupancy)} help="Diárias ocupadas ÷ diárias disponíveis." />
        <KpiCard title="Quartos disponíveis" value={String(current.availableRoomNights)} help="Inventário disponível acumulado por dia no período." />
        <KpiCard title="Diárias ocupadas" value={String(current.occupiedRoomNights)} help="Quantidade de quarto-noites ocupadas no filtro." />
        <KpiCard title="ADR" value={fmtBRL(current.adr)} delta={compare(current.adr, previous.adr)} help="Receita paga de hospedagem ÷ diárias ocupadas." />
        <KpiCard title="RevPAR" value={fmtBRL(current.revpar)} delta={compare(current.revpar, previous.revpar)} help="Receita paga de hospedagem ÷ quartos disponíveis." />
        <KpiCard title="No-show" value={`${current.noShowCount} · ${pct(current.noShowRate)}`} help="No-shows ÷ reservas do período." />
      </section>
      <Panel title="Ocupação por dia" subtitle="Realizado no período selecionado e previsão futura do modelo">
        <ResponsiveContainer width="100%" height={330}>
          <ComposedChart data={[...current.daily.map((row: any) => ({ ...row, forecast: null })), ...forecast.map((row: any) => ({ label: row.label, occupancy: null, forecast: row.occupancy }))]}>
            <CartesianGrid stroke={COLORS.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} tick={{ fontSize: 10 }} />
            <Tooltip formatter={(value: any) => pct(n(value))} />
            <Legend />
            <Line type="monotone" dataKey="occupancy" name="Realizado" stroke={COLORS.navy} strokeWidth={3} dot={false} />
            <Line type="monotone" dataKey="forecast" name="Previsto" stroke={COLORS.sky} strokeWidth={3} strokeDasharray="8 6" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </Panel>
      <section className="grid gap-3 lg:grid-cols-2">
        <Panel title="Cancelamentos" subtitle="Apresentação explícita da base utilizada">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Mini label="Reservas" value={String(current.bookingBase)} /><Mini label="Canceladas" value={String(current.canceledCount)} tone="danger" /><Mini label="Taxa" value={pct(current.cancellationRate)} tone="danger" /><Mini label="No-show" value={pct(current.noShowRate)} tone="warn" /></div>
          <div className="mt-3 rounded-xl bg-muted/45 p-3 text-xs"><strong>{current.canceledCount} cancelamento(s) em {current.bookingBase} reserva(s) — {pct(current.cancellationRate)}</strong><p className="mt-1 text-muted-foreground">Valor potencial perdido: {fmtBRL(current.lostRevenue)} · {current.lostNights} diárias perdidas.</p></div>
        </Panel>
        <Panel title="Pick-up e booking pace" subtitle="Governança de dados">
          <EmptyMetric title="Dados indisponíveis" text="O banco atual não mantém snapshots históricos suficientes para reconstruir com segurança o pick-up de 1, 3 e 7 dias ou o booking pace. O painel não simula esses indicadores." />
        </Panel>
      </section>
    </div>
  );
}

function RoomsTab({ current, rooms }: { current: PeriodMetrics; rooms: any[] }) {
  return (
    <div className="space-y-3">
      <section className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Mini label="Inventário atual" value={String(current.roomCount)} />
        <Mini label="Fora de serviço hoje" value={String(current.outOfServiceRooms)} tone={current.outOfServiceRooms ? "warn" : "normal"} />
        <Mini label="Receita hospedagem" value={fmtBRL(current.stayRevenuePaid)} tone="blue" />
        <Mini label="GOPPAR projetado" value={fmtBRL(current.gopparProjected)} />
      </section>
      <Panel title="Desempenho por quarto" subtitle="Receita paga, diárias, ADR, ocupação, avaliação e margem estimada">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-xs"><thead className="border-b text-[10px] uppercase tracking-wide text-muted-foreground"><tr>{["UH","Situação","Hospedagens","Diárias","Receita","ADR","Ocupação","Avaliação","Margem estimada"].map((item) => <th key={item} className="px-2 py-2">{item}</th>)}</tr></thead><tbody>{rooms.map((row) => <tr key={row.room} className="border-b border-border/50"><td className="px-2 py-2 font-black">{row.room}</td><td className="px-2 py-2"><StatusBadge status={row.status} /></td><td className="px-2 py-2">{row.stays}</td><td className="px-2 py-2">{row.nights}</td><td className="px-2 py-2 font-bold text-primary">{fmtBRL(row.revenue)}</td><td className="px-2 py-2">{fmtBRL(row.adr)}</td><td className="px-2 py-2">{pct(row.occupancy)}</td><td className="px-2 py-2">{row.rating == null ? "Sem avaliação" : `${row.rating.toFixed(1).replace(".",",")}/10`}</td><td className="px-2 py-2">{fmtBRL(row.margin)}</td></tr>)}</tbody></table>
        </div>
      </Panel>
    </div>
  );
}

function GuestsTab({ guests }: { guests: ReturnType<typeof guestMetrics> }) {
  return (
    <div className="space-y-3">
      <section className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <KpiCard title="Completude cadastral" value={pct(guests.completeness)} help="Percentual dos campos-chave preenchidos: idade, motivo, perfil familiar e informação de filhos." />
        <Mini label="Hóspedes únicos" value={String(guests.uniqueGuests)} />
        <Mini label="Recorrentes" value={String(guests.returningGuests)} />
        <Mini label="Permanência média" value={`${guests.averageStay.toFixed(1).replace(".",",")} diárias`} />
      </section>
      <section className="grid gap-3 xl:grid-cols-3">
        <Panel title="Motivo da viagem" subtitle="Categorias padronizadas; não informado permanece explícito"><SimpleBars rows={guests.reasons} /></Panel>
        <Panel title="Faixa etária" subtitle="Somente idade informada; não inventamos idade exata"><SimpleBars rows={guests.ages} /></Panel>
        <Panel title="Perfil familiar" subtitle="Leitura agregada sem expor dados pessoais"><SimpleBars rows={guests.profiles} /></Panel>
      </section>
      {guests.completeness < 70 && <div className="rounded-2xl border border-amber-300/60 bg-amber-50/60 p-3 text-xs text-amber-900"><strong>Qualidade dos dados precisa de atenção.</strong> Como há campos de perfil incompletos, o painel prioriza a completude antes de conclusões demográficas. Faixa etária desconhecida não é convertida em uma idade inventada.</div>}
      <Panel title="Filhos" subtitle="Separado de quantidade total de hóspedes"><SimpleBars rows={guests.children} /></Panel>
    </div>
  );
}

function FinanceTab({ current }: { current: PeriodMetrics }) {
  return (
    <div className="space-y-3">
      <section className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <KpiCard title="Receita realizada" value={fmtBRL(current.netRevenue)} help="Hospedagem paga + receitas extras registradas." />
        <KpiCard title="Despesas operacionais" value={fmtBRL(current.operationalExpenses)} help="Despesas efetivamente registradas, excluindo retirada/movimentação financeira do cálculo automático do GOP." />
        <KpiCard title="GOP realizado" value={fmtBRL(current.gopRealized)} help="Receita realizada – despesas operacionais registradas." />
        <KpiCard title="GOP projetado" value={fmtBRL(current.gopProjected)} help="GOP realizado – custos estimados ainda pendentes." />
        <KpiCard title="GOPPAR projetado" value={fmtBRL(current.gopparProjected)} help="GOP projetado ÷ quartos disponíveis acumulados no período." />
      </section>
      <section className="grid gap-3 xl:grid-cols-2">
        <Panel title="Realizado × estimado × projetado" subtitle="Sem dupla contagem entre despesa registrada e complemento estimado">
          <div className="space-y-2">
            <FinanceRow label="Receita hospedagem paga" value={current.stayRevenuePaid} tone="positive" />
            <FinanceRow label="Receitas extras registradas" value={current.extraRevenue} tone="positive" />
            <FinanceRow label="Despesas operacionais registradas" value={-current.operationalExpenses} tone="negative" />
            <FinanceRow label="GOP realizado" value={current.gopRealized} strong />
            <FinanceRow label="Custos estimados ainda pendentes" value={-current.estimatedPending} tone="warning" />
            <FinanceRow label="GOP projetado" value={current.gopProjected} strong />
          </div>
        </Panel>
        <Panel title="Composição dos custos estimados" subtitle="Complemento somente quando o custo esperado supera o já registrado em categoria equivalente">
          <div className="space-y-2">{current.estimatedBreakdown.map((row: any) => <div key={row.name} className="rounded-xl border border-border/70 px-3 py-2"><div className="flex items-center justify-between gap-3"><strong className="text-xs">{row.name}</strong><strong className="text-xs">{fmtBRL(row.pending)}</strong></div><p className="mt-1 text-[10px] text-muted-foreground">Esperado: {fmtBRL(row.expected)} · já registrado compatível: {fmtBRL(row.registered)}</p></div>)}</div>
        </Panel>
      </section>
      {current.nonOperationalMovements > 0 && <div className="rounded-xl bg-muted/50 px-3 py-2 text-[10px] text-muted-foreground">Movimentações/retiradas financeiras registradas no período: {fmtBRL(current.nonOperationalMovements)}. Elas são mostradas separadamente e não entram automaticamente no GOP operacional.</div>}
    </div>
  );
}

function buildPeriodMetrics(data: Source, start: string, end: string, filters: Filters) {
  const days = dateRange(start, end);
  const roomCount = data.rooms.length;
  const outOfServiceRooms = data.rooms.filter((room) => ["manutencao", "bloqueado", "fora de servico"].some((term) => norm(room.situacao).includes(term))).length;
  const availableRoomsPerDay = Math.max(0, roomCount - outOfServiceRooms);
  const availableRoomNights = availableRoomsPerDay * days.length;
  const baseReservations = data.reservations.filter((reservation) => overlap(reservation, start, end) && matchesFilters(reservation, filters));
  const validReservations = baseReservations.filter(isValidStay);
  const validIds = new Set(validReservations.map((reservation) => reservation.reserva_id));
  const sales = data.sales.filter((sale) => sale.data >= start && sale.data <= end && !norm(sale.status).includes("cancel") && (filters.room === "Todos" || String(sale.quarto || "") === filters.room) && (filters.channel === "Todos" || (sale.reserva_id && validIds.has(sale.reserva_id))));

  const dailyMap = new Map<string, { rooms: Set<number>; paidStay: number; grossStay: number; extras: number }>();
  days.forEach((date) => dailyMap.set(date, { rooms: new Set(), paidStay: 0, grossStay: 0, extras: 0 }));

  let stayRevenuePaid = 0;
  let stayRevenueGross = 0;
  let occupiedRoomNights = 0;
  for (const reservation of validReservations) {
    const selectedNights = stayDays(reservation, start, end);
    const fullNights = Math.max(1, n(reservation.diarias) || stayDays(reservation, reservation.checkin, addDays(reservation.checkout, -1)).length || 1);
    const paidPerNight = n(reservation.valor_pago) / fullNights;
    const grossPerNight = n(reservation.valor_total) / fullNights;
    stayRevenuePaid += paidPerNight * selectedNights.length;
    stayRevenueGross += grossPerNight * selectedNights.length;
    occupiedRoomNights += selectedNights.length;
    selectedNights.forEach((date) => {
      const row = dailyMap.get(date);
      if (!row) return;
      if (reservation.quarto != null) row.rooms.add(n(reservation.quarto));
      row.paidStay += paidPerNight;
      row.grossStay += grossPerNight;
    });
  }

  let extraRevenue = 0;
  sales.forEach((sale) => {
    const realized = n(sale.valor_pago) > 0 ? n(sale.valor_pago) : n(sale.total);
    extraRevenue += realized;
    const row = dailyMap.get(sale.data);
    if (row) row.extras += realized;
  });

  const daily = [...dailyMap.entries()].map(([date, row]) => ({
    date,
    label: dateLabel(date),
    occupancy: availableRoomsPerDay ? (row.rooms.size / availableRoomsPerDay) * 100 : 0,
    paidStay: row.paidStay,
    extras: row.extras,
    revenue: row.paidStay + row.extras,
  }));

  const netRevenue = stayRevenuePaid + extraRevenue;
  const occupancy = availableRoomNights ? (occupiedRoomNights / availableRoomNights) * 100 : 0;
  const adr = occupiedRoomNights ? stayRevenuePaid / occupiedRoomNights : 0;
  const revpar = availableRoomNights ? stayRevenuePaid / availableRoomNights : 0;
  const trevpar = availableRoomNights ? netRevenue / availableRoomNights : 0;

  const expenses = data.expenses.filter((expense) => expense.data >= start && expense.data <= end);
  const operationalExpenses = expenses.filter(isOperationalExpense).reduce((sum, expense) => sum + n(expense.valor), 0);
  const nonOperationalMovements = expenses.filter((expense) => !isOperationalExpense(expense)).reduce((sum, expense) => sum + n(expense.valor), 0);
  const estimatedBreakdown = estimatedCosts(days.length, netRevenue, expenses);
  const estimatedPending = estimatedBreakdown.reduce((sum, row) => sum + row.pending, 0);
  const gopRealized = netRevenue - operationalExpenses;
  const gopProjected = gopRealized - estimatedPending;
  const gopMarginProjected = netRevenue ? (gopProjected / netRevenue) * 100 : 0;
  const gopparRealized = availableRoomNights ? gopRealized / availableRoomNights : 0;
  const gopparProjected = availableRoomNights ? gopProjected / availableRoomNights : 0;

  const bookingBase = baseReservations.length;
  const canceledRows = baseReservations.filter(isCanceled);
  const noShowRows = baseReservations.filter(isNoShow);
  const canceledCount = canceledRows.length;
  const cancellationRate = bookingBase ? (canceledCount / bookingBase) * 100 : 0;
  const noShowCount = noShowRows.length;
  const noShowRate = bookingBase ? (noShowCount / bookingBase) * 100 : 0;
  const lostRevenue = canceledRows.reduce((sum, reservation) => sum + n(reservation.valor_total), 0);
  const lostNights = canceledRows.reduce((sum, reservation) => sum + Math.max(0, n(reservation.diarias)), 0);
  const leadTimes = baseReservations.filter((reservation) => reservation.data_reserva && reservation.checkin).map((reservation) => diffDays(reservation.data_reserva, reservation.checkin));
  const leadTime = leadTimes.length ? leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length : 0;
  const stayLengths = validReservations.map((reservation) => Math.max(1, n(reservation.diarias) || diffDays(reservation.checkin, reservation.checkout)));
  const averageStay = stayLengths.length ? stayLengths.reduce((a, b) => a + b, 0) / stayLengths.length : 0;

  return {
    start,
    end,
    roomCount,
    outOfServiceRooms,
    availableRoomNights,
    occupiedRoomNights,
    daily,
    reservations: baseReservations,
    validReservations,
    sales,
    stayRevenuePaid,
    stayRevenueGross,
    extraRevenue,
    netRevenue,
    occupancy,
    adr,
    revpar,
    trevpar,
    operationalExpenses,
    nonOperationalMovements,
    estimatedBreakdown,
    estimatedPending,
    gopRealized,
    gopProjected,
    gopMarginProjected,
    gopparRealized,
    gopparProjected,
    bookingBase,
    canceledCount,
    cancellationRate,
    noShowCount,
    noShowRate,
    lostRevenue,
    lostNights,
    leadTime,
    averageStay,
  };
}

function estimatedCosts(days: number, revenue: number, expenses: any[]) {
  const months = days / 30.44;
  const registered = (terms: string[]) => expenses.filter((expense) => terms.some((term) => norm(expense.categoria).includes(norm(term)))).reduce((sum, expense) => sum + n(expense.valor), 0);
  const rows = [
    { name: "Aluguel estimado", expected: revenue * 0.2, registered: registered(["aluguel"]) },
    { name: "Pessoal e encargos", expected: (4 * 1700 + 1900) * months, registered: registered(["pessoal", "salario", "salário", "encargos", "prestador"]) },
    { name: "Folguistas", expected: (500 * days) / 7, registered: registered(["folguista"]) },
    { name: "Padaria / café", expected: 2050 * months, registered: registered(["alimentos", "cafe da manha", "café da manhã", "padaria"]) },
  ];
  return rows.map((row) => ({ ...row, pending: Math.max(0, row.expected - row.registered) }));
}

function channelMetrics(data: Source, start: string, end: string, filters: Filters, period: PeriodMetrics) {
  const channels = unique(data.reservations.map((reservation) => reservation.canal_analitico).filter(Boolean));
  const totalRealized = period.netRevenue || 0;
  return channels
    .map((channel) => {
      const channelFilters = { ...filters, channel };
      const metric = buildPeriodMetrics(data, start, end, channelFilters);
      const reservations = metric.reservations;
      const nights = metric.validReservations.reduce((sum, reservation) => sum + stayDays(reservation, start, end).length, 0);
      const grossRevenue = metric.stayRevenueGross + metric.extraRevenue;
      const netRevenue = metric.netRevenue;
      const canceled = metric.canceledCount;
      const cancellationRate = metric.cancellationRate;
      const adr = metric.adr;
      const averageStay = metric.averageStay;
      const leadTime = metric.leadTime;
      const revenueShare = totalRealized ? (netRevenue / totalRealized) * 100 : 0;
      const allocatedCosts = (period.operationalExpenses + period.estimatedPending) * (revenueShare / 100);
      const estimatedMargin = netRevenue - allocatedCosts;
      return { channel, reservations: reservations.length, nights, grossRevenue, netRevenue, canceled, cancellationRate, adr, averageStay, leadTime, revenueShare, estimatedMargin };
    })
    .filter((row) => row.reservations > 0 || row.netRevenue > 0)
    .sort((a, b) => b.netRevenue - a.netRevenue);
}

function roomMetrics(data: Source, start: string, end: string, filters: Filters, period: PeriodMetrics) {
  const days = dateRange(start, end).length;
  const sharedCostPerNight = period.availableRoomNights ? (period.operationalExpenses + period.estimatedPending) / period.availableRoomNights : 0;
  return data.rooms.map((room) => {
    const roomFilters = { ...filters, room: String(room.numero) };
    const metric = buildPeriodMetrics(data, start, end, roomFilters);
    const feedbacks = data.feedbacks.filter((feedback) => n(feedback.quarto) === n(room.numero) && String(feedback.created_at).slice(0, 10) >= start && String(feedback.created_at).slice(0, 10) <= end && (feedback.quarto_match_confidence == null || n(feedback.quarto_match_confidence) >= 0.7));
    const scores = feedbacks.map(scoreFeedback).filter((value): value is number => value != null);
    const rating = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    const nights = metric.occupiedRoomNights;
    const occupancy = days ? (nights / days) * 100 : 0;
    const margin = metric.netRevenue - nights * sharedCostPerNight;
    return { room: room.numero, status: room.situacao || "livre", stays: metric.validReservations.length, nights, revenue: metric.stayRevenuePaid, adr: metric.adr, occupancy, rating, margin };
  }).sort((a, b) => b.revenue - a.revenue || b.nights - a.nights);
}

function guestMetrics(data: Source, start: string, end: string, filters: Filters) {
  const rows = data.reservations.filter((reservation) => overlap(reservation, start, end) && matchesFilters(reservation, filters) && isValidStay(reservation));
  const byGuest = new Map<string, any[]>();
  rows.forEach((reservation) => {
    const key = reservation.cliente_id || norm(reservation.cliente_nome) || reservation.reserva_id;
    byGuest.set(key, [...(byGuest.get(key) || []), reservation]);
  });
  const uniqueGuests = byGuest.size;
  const allCounts = new Map<string, number>();
  data.reservations.filter(isValidStay).forEach((reservation) => {
    const key = reservation.cliente_id || norm(reservation.cliente_nome) || reservation.reserva_id;
    allCounts.set(key, (allCounts.get(key) || 0) + 1);
  });
  const returningGuests = [...byGuest.keys()].filter((key) => (allCounts.get(key) || 0) > 1).length;
  const fields = rows.flatMap((reservation) => [reservation.idade, reservation.motivo_estadia, reservation.perfil_familiar, reservation.possui_filhos]);
  const filled = fields.filter((value) => value !== null && value !== undefined && String(value).trim() !== "" && norm(value) !== "nao informado").length;
  const completeness = fields.length ? (filled / fields.length) * 100 : 0;
  const reasons = countRows(rows.map((reservation) => normalizeReason(reservation.motivo_estadia)));
  const ages = countRows(rows.map((reservation) => reservation.faixa_idade || "Não informado"));
  const profiles = countRows(rows.map((reservation) => reservation.perfil_familiar || "Não informado"));
  const children = countRows(rows.map((reservation) => reservation.possui_filhos === true || n(reservation.quantidade_filhos) > 0 ? (n(reservation.quantidade_filhos) > 1 ? "2+ filhos" : "Com filhos") : reservation.possui_filhos === false || n(reservation.criancas) === 0 ? "Sem filhos" : "Não informado"));
  const stayLengths = rows.map((reservation) => Math.max(1, n(reservation.diarias) || diffDays(reservation.checkin, reservation.checkout)));
  const averageStay = stayLengths.length ? stayLengths.reduce((a, b) => a + b, 0) / stayLengths.length : 0;
  return { uniqueGuests, returningGuests, completeness, reasons, ages, profiles, children, averageStay };
}

function buildForecast(forecast: any[], today: string, horizon: number) {
  return forecast.filter((row) => row.date > today && row.date <= addDays(today, horizon)).map((row) => {
    const raw = n(row.expected_occupancy ?? row.occupancy ?? row.predicted_occupancy);
    return { date: row.date, label: dateLabel(row.date), occupancy: raw <= 1 ? raw * 100 : raw };
  });
}

function buildAlerts(current: PeriodMetrics, previous: PeriodMetrics, rooms: any[], guests: ReturnType<typeof guestMetrics>, forecast: any[]) {
  const alerts: any[] = [];
  const next7 = forecast.slice(0, 7);
  const avgForecast = next7.length ? next7.reduce((sum, row) => sum + row.occupancy, 0) / next7.length : null;
  if (avgForecast != null && current.occupancy > 0 && avgForecast < current.occupancy - 10) alerts.push({ severity: "alta", title: "Ocupação prevista abaixo do ritmo atual", observed: pct(avgForecast), reference: pct(current.occupancy), impact: "Menor utilização do inventário nos próximos 7 dias", action: "Revisar tarifas, disponibilidade e canais dos próximos 7 dias." });
  if (current.cancellationRate > previous.cancellationRate + 5 && current.canceledCount >= 2) alerts.push({ severity: "alta", title: "Cancelamentos cresceram", observed: pct(current.cancellationRate), reference: `Período anterior: ${pct(previous.cancellationRate)}`, impact: fmtBRL(current.lostRevenue), action: "Priorizar confirmações das reservas com maior risco e revisar canal/perfil associado." });
  const out = rooms.filter((room) => ["manutencao", "bloqueado", "fora de servico"].some((term) => norm(room.situacao).includes(term))).length;
  if (out > 0) alerts.push({ severity: out >= 3 ? "alta" : "media", title: "Quartos fora de serviço", observed: `${out} UH(s)`, reference: `${rooms.length} no inventário`, impact: "Redução da capacidade vendável", action: "Revisar motivo, prazo de liberação e impacto na receita." });
  if (guests.completeness < 70) alerts.push({ severity: "media", title: "Dados de perfil incompletos", observed: pct(guests.completeness), reference: "Referência operacional: 70%", impact: "Segmentação e análises de perfil ficam menos confiáveis", action: "Priorizar preenchimento de idade, motivo da viagem e perfil familiar no check-in." });
  if (current.gopProjected < 0) alerts.push({ severity: "critica", title: "GOP projetado negativo", observed: fmtBRL(current.gopProjected), reference: `GOP realizado: ${fmtBRL(current.gopRealized)}`, impact: "Custos estimados superam o resultado operacional atual", action: "Validar despesas faltantes, custos fixos e ações de receita antes de concluir o período." });
  return alerts.slice(0, 6);
}

function matchesFilters(reservation: any, filters: Filters) {
  if (filters.channel !== "Todos" && reservation.canal_analitico !== filters.channel) return false;
  if (filters.room !== "Todos" && String(reservation.quarto) !== filters.room) return false;
  if (filters.status !== "Todos" && String(reservation.status || "Não informado") !== filters.status) return false;
  if (filters.reason !== "Todos" && normalizeReason(reservation.motivo_estadia) !== filters.reason) return false;
  return true;
}

function normalizeReason(value: unknown) {
  const raw = norm(value);
  if (!raw || raw === "nao informado") return "Não informado";
  if (raw.includes("trabalho") || raw.includes("negocio") || raw.includes("corpor")) return "Trabalho";
  if (raw.includes("lazer") || raw.includes("turismo") || raw.includes("passeio")) return "Lazer";
  if (raw.includes("casamento")) return "Casamento";
  return String(value).trim().replace(/^./, (char) => char.toUpperCase());
}

function unique(values: string[]) { return [...new Set(values)].sort((a, b) => a.localeCompare(b, "pt-BR")); }
function countRows(values: string[]) { const map = new Map<string, number>(); values.forEach((value) => map.set(value || "Não informado", (map.get(value || "Não informado") || 0) + 1)); return [...map].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value); }
function compare(current: number, previous: number) { if (!previous) return { value: 0, label: "Sem base anterior", direction: "neutral" as const }; const value = ((current - previous) / Math.abs(previous)) * 100; return { value, label: `${value >= 0 ? "+" : ""}${value.toFixed(1).replace(".",",")}% vs anterior`, direction: value > 0.5 ? "up" as const : value < -0.5 ? "down" as const : "neutral" as const }; }

const TABS: { key: TabKey; label: string }[] = [
  { key: "executive", label: "Visão executiva" },
  { key: "channels", label: "Receita e canais" },
  { key: "occupancy", label: "Ocupação e reservas" },
  { key: "rooms", label: "Operação e quartos" },
  { key: "guests", label: "Hóspedes" },
  { key: "finance", label: "Financeiro" },
];

function KpiCard({ title, value, delta, help }: { title: string; value: string; delta?: ReturnType<typeof compare>; help?: string }) {
  const favorable = delta?.direction === "up";
  const unfavorable = delta?.direction === "down";
  return <article className="rounded-2xl border border-border bg-card p-3 shadow-sm"><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{title}</span>{help && <span title={help} className="text-muted-foreground"><Info className="h-3.5 w-3.5" /></span>}</div><strong className="mt-2 block text-xl font-black leading-none text-pine-dark">{value}</strong>{delta && <div className={`mt-2 flex items-center gap-1 text-[10px] font-bold ${favorable ? "text-green-700" : unfavorable ? "text-red-700" : "text-muted-foreground"}`}>{favorable ? <TrendingUp className="h-3 w-3" /> : unfavorable ? <TrendingDown className="h-3 w-3" /> : null}{delta.label}</div>}</article>;
}
function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) { return <section className="rounded-2xl border border-border bg-card p-3 shadow-sm"><div className="mb-3"><h2 className="text-sm font-extrabold text-pine-dark">{title}</h2>{subtitle && <p className="mt-0.5 text-[10px] text-muted-foreground">{subtitle}</p>}</div>{children}</section>; }
function Mini({ label, value, tone = "normal" }: { label: string; value: string; tone?: "normal" | "blue" | "danger" | "warn" }) { const cls = tone === "blue" ? "text-primary" : tone === "danger" ? "text-red-700" : tone === "warn" ? "text-amber-700" : "text-pine-dark"; return <div className="rounded-xl border border-border/70 bg-card px-3 py-2"><span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{label}</span><strong className={`mt-1 block text-base ${cls}`}>{value}</strong></div>; }
function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) { return <label className="text-[10px] font-bold text-muted-foreground">{label}<select className="field mt-1" value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>; }
function filterName(key: string) { return key === "channel" ? "Canal" : key === "room" ? "Quarto" : key === "status" ? "Status" : "Motivo"; }
function AlertPanel({ alerts }: { alerts: any[] }) { return <Panel title="Atenção hoje" subtitle="Regras transparentes; fatos e referências, sem causas inventadas pela IA">{alerts.length === 0 ? <EmptyMetric title="Sem alertas prioritários" text="Nenhuma regra objetiva ultrapassou os limites de atenção neste recorte." /> : <div className="grid gap-2 lg:grid-cols-2">{alerts.map((alert, index) => <article key={`${alert.title}-${index}`} className="rounded-xl border border-border/70 bg-background/50 p-3"><div className="flex items-start gap-2"><span className={`mt-1 h-2.5 w-2.5 rounded-full ${alert.severity === "critica" ? "bg-red-600" : alert.severity === "alta" ? "bg-red-500" : "bg-amber-500"}`} /><div className="min-w-0 flex-1"><div className="flex flex-wrap justify-between gap-2"><strong className="text-xs">{alert.title}</strong><span className="text-[9px] font-black uppercase text-muted-foreground">{alert.severity}</span></div><div className="mt-2 grid grid-cols-2 gap-1 text-[10px]"><span>Observado: <strong>{alert.observed}</strong></span><span>Referência: <strong>{alert.reference}</strong></span></div><p className="mt-1 text-[10px] text-muted-foreground">Impacto: {alert.impact}</p><p className="mt-1.5 text-[10px] font-bold text-primary">Ação: {alert.action}</p></div></div></article>)}</div>}</Panel>; }
function DecisionCard({ icon, title, rows }: { icon: ReactNode; title: string; rows: [string, string][] }) { return <section className="rounded-2xl border border-border bg-card p-3 shadow-sm"><div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">{icon}</span><h3 className="text-xs font-extrabold text-pine-dark">{title}</h3></div><div className="mt-3 space-y-1.5">{rows.map(([label, value]) => <div key={label} className="flex items-center justify-between gap-3 border-b border-border/40 pb-1.5 text-[11px]"><span className="text-muted-foreground">{label}</span><strong className="text-right">{value}</strong></div>)}</div></section>; }
function EmptyMetric({ title, text }: { title: string; text: string }) { return <div className="rounded-xl border border-dashed border-border p-5 text-center"><strong className="text-xs text-foreground">{title}</strong><p className="mx-auto mt-1 max-w-xl text-[10px] text-muted-foreground">{text}</p></div>; }
function SimpleBars({ rows }: { rows: { name: string; value: number }[] }) { const max = Math.max(1, ...rows.map((row) => row.value)); return <div className="space-y-2">{rows.slice(0, 8).map((row) => <div key={row.name}><div className="mb-1 flex justify-between gap-3 text-[10px]"><span className="truncate font-semibold">{row.name}</span><strong>{row.value}</strong></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(row.value / max) * 100}%` }} /></div></div>)}</div>; }
function StatusBadge({ status }: { status: string }) { const value = norm(status); const cls = value.includes("manut") || value.includes("bloq") ? "bg-red-50 text-red-700" : value.includes("limpeza") ? "bg-amber-50 text-amber-700" : value.includes("ocup") ? "bg-blue-50 text-blue-700" : "bg-green-50 text-green-700"; return <span className={`rounded-full px-2 py-1 text-[9px] font-bold ${cls}`}>{status || "Livre"}</span>; }
function FinanceRow({ label, value, tone = "normal", strong = false }: { label: string; value: number; tone?: "normal" | "positive" | "negative" | "warning"; strong?: boolean }) { const cls = tone === "positive" ? "text-green-700" : tone === "negative" ? "text-red-700" : tone === "warning" ? "text-amber-700" : "text-pine-dark"; return <div className={`flex items-center justify-between gap-4 rounded-xl px-3 py-2 ${strong ? "bg-muted/60" : "border border-border/60"}`}><span className={`text-xs ${strong ? "font-extrabold" : "font-semibold"}`}>{label}</span><strong className={`text-sm ${cls}`}>{value < 0 ? `− ${fmtBRL(Math.abs(value))}` : fmtBRL(value)}</strong></div>; }
function DashboardSkeleton() { return <div className="space-y-3 p-3"><div className="h-20 animate-pulse rounded-2xl bg-muted" /><div className="grid grid-cols-2 gap-2 md:grid-cols-6">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-24 animate-pulse rounded-2xl bg-muted" />)}</div><div className="h-80 animate-pulse rounded-2xl bg-muted" /></div>; }
