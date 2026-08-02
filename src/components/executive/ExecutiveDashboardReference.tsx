import { useQuery } from "@tanstack/react-query";
import brazil from "@svg-maps/brazil";
import {
  BedDouble,
  Bookmark,
  CalendarDays,
  CircleDollarSign,
  Filter,
  RefreshCw,
  TrendingUp,
  UserRoundX,
  Users,
  XCircle,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany } from "@/lib/data";
import { fmtBRL, todayISO } from "@/lib/format";

type Range = { start: string; end: string };
type ReservationRow = {
  id: string;
  status: string | null;
  checkin: string;
  checkout: string;
  quarto: number | null;
  valor_total: number | string | null;
  pagamento: string | null;
  pessoas: number | string | null;
  canal: string | null;
  cliente_id: string | null;
};
type SaleRow = {
  data: string;
  total: number | string | null;
  pagamento: string | null;
};
type RoomRow = {
  numero: number;
  configuracao: string | null;
};
type ClientRow = {
  id: string;
  estado: string | null;
};
type DailyRow = {
  date: string;
  reservations: number;
  cancelled: number;
  noShow: number;
  occupancy: number;
  revenue: number;
};
type NamedValue = { name: string; value: number };
type StateValue = { code: string; guests: number; revenue: number };
type DashboardData = {
  revenue: number;
  occupancy: number;
  adr: number;
  revpar: number;
  reservations: number;
  cancellations: number;
  noShow: number;
  daily: DailyRow[];
  payments: NamedValue[];
  channels: NamedValue[];
  categoryOccupancy: NamedValue[];
  roomOccupancy: NamedValue[];
  states: StateValue[];
};

const BLUE = "var(--primary)";
const GREEN = "#16a34a";
const RED = "#ef4444";
const PURPLE = "#7c3aed";
const TEAL = "#14b8a6";
const ORANGE = "#f59e0b";
const DONUT_COLORS = [BLUE, GREEN, PURPLE, ORANGE, TEAL, "#64748b"];

export function ExecutiveDashboardReference() {
  const company = useCurrentCompany();
  const today = todayISO();
  const monthStart = `${today.slice(0, 7)}-01`;
  const [start, setStart] = useState(monthStart);
  const [end, setEnd] = useState(today);
  const range = useMemo(() => normalizeRange(start, end), [start, end]);
  const previousRange = useMemo(() => previousSameLength(range), [range]);

  const query = useQuery({
    queryKey: ["executive-reference-dashboard", company.data?.id, range.start, range.end],
    enabled: Boolean(company.data?.id),
    staleTime: 60_000,
    queryFn: async () => {
      const [current, previous] = await Promise.all([
        loadDashboard(company.data!.id, range),
        loadDashboard(company.data!.id, previousRange),
      ]);
      return { current, previous };
    },
  });

  if (company.isLoading || query.isLoading) return <State text="Carregando o painel executivo…" />;
  if (company.error || query.error || !query.data) return <State text="Não foi possível carregar o painel." danger />;

  const { current, previous } = query.data;

  return (
    <div className="min-h-0 space-y-2 bg-background pb-5">
      <header className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-foreground">Pulso do Hotel</h1>
            <p className="text-xs font-medium text-muted-foreground">Visão geral da performance do Hotel Real Cruzília</p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[10px] font-bold uppercase text-muted-foreground">
            <span className="mb-1 block">Período</span>
            <div className="flex items-center gap-1 rounded-xl border border-border bg-background px-2">
              <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-9 w-[118px] bg-transparent text-xs font-semibold outline-none" />
              <span className="text-muted-foreground">—</span>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="h-9 w-[118px] bg-transparent text-xs font-semibold outline-none" />
            </div>
          </label>
          <div className="flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-xs text-muted-foreground">
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Atualizado em<br /><strong className="text-foreground">{formatDateTime()}</strong></span>
          </div>
          <button type="button" className="flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground">
            <Filter className="h-3.5 w-3.5" /> Filtros
          </button>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
        <Kpi icon={<CircleDollarSign />} label="Receita total" value={fmtBRL(current.revenue)} delta={variation(current.revenue, previous.revenue)} tone="green" />
        <Kpi icon={<TrendingUp />} label="Taxa de ocupação" value={`${current.occupancy.toFixed(1)}%`} delta={current.occupancy - previous.occupancy} suffix=" p.p." tone="green" />
        <Kpi icon={<CalendarDays />} label="Diária média (ADR)" value={fmtBRL(current.adr)} delta={variation(current.adr, previous.adr)} tone="blue" />
        <Kpi icon={<TrendingUp />} label="RevPAR" value={fmtBRL(current.revpar)} delta={variation(current.revpar, previous.revpar)} tone="purple" />
        <Kpi icon={<Bookmark />} label="Reservas" value={String(current.reservations)} delta={current.reservations - previous.reservations} absolute tone="blue" />
        <Kpi icon={<XCircle />} label="Cancelamentos" value={String(current.cancellations)} delta={current.cancellations - previous.cancellations} absolute negative tone="red" />
        <Kpi icon={<UserRoundX />} label="No-show" value={String(current.noShow)} delta={current.noShow - previous.noShow} absolute negative tone="purple" />
      </section>

      <Panel title="1. Ocupação, reservas, cancelamentos e no-show por dia" className="p-3">
        <MainPerformanceChart rows={current.daily} />
      </Panel>

      <section className="grid grid-cols-1 gap-2 lg:grid-cols-3">
        <Panel title="2. Receitas por dia (R$)"><RevenueChart rows={current.daily} /></Panel>
        <Panel title="3. Receitas por forma de pagamento"><DonutChart rows={current.payments} currency /></Panel>
        <Panel title="4. Reservas por canal"><DonutChart rows={current.channels} /></Panel>
      </section>

      <section className="grid grid-cols-1 gap-2 lg:grid-cols-3">
        <Panel title="5. Ocupação por categoria de quarto"><ProgressBars rows={current.categoryOccupancy} footer={`Taxa de ocupação média total: ${current.occupancy.toFixed(1)}%`} /></Panel>
        <Panel title="6. Ranking de quartos por ocupação"><ProgressBars rows={current.roomOccupancy} footer={`Média dos quartos: ${current.occupancy.toFixed(1)}%`} /></Panel>
        <Panel title="7. Origem: hóspedes x receita por estado"><StateRevenueMap rows={current.states} /></Panel>
      </section>

      <footer className="flex items-center gap-2 px-2 text-[10px] font-medium text-muted-foreground">
        <RefreshCw className="h-3 w-3" /> Dados atualizados até {formatDateTime()}
      </footer>
    </div>
  );
}

function Kpi({ icon, label, value, delta, suffix = "%", absolute = false, negative = false, tone }: { icon: ReactNode; label: string; value: string; delta: number; suffix?: string; absolute?: boolean; negative?: boolean; tone: "green" | "blue" | "purple" | "red" }) {
  const palettes = {
    green: "bg-emerald-50 text-emerald-600",
    blue: "bg-blue-50 text-blue-600",
    purple: "bg-violet-50 text-violet-600",
    red: "bg-red-50 text-red-500",
  };
  const favorable = negative ? delta <= 0 : delta >= 0;
  const deltaText = absolute ? `${delta >= 0 ? "+" : ""}${delta}` : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}${suffix}`;
  return (
    <article className="flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-card px-3 py-3 shadow-sm">
      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${palettes[tone]} [&>svg]:h-5 [&>svg]:w-5`}>{icon}</div>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-bold text-muted-foreground">{label}</p>
        <strong className="block truncate text-base font-black text-foreground" title={value}>{value}</strong>
        <span className={`text-[9px] font-bold ${favorable ? "text-emerald-600" : "text-red-500"}`}>vs período anterior {deltaText}</span>
      </div>
    </article>
  );
}

function Panel({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <article className={`min-w-0 rounded-2xl border border-border bg-card p-3 shadow-sm ${className}`}>
      <h2 className="mb-2 text-sm font-black text-primary">{title}</h2>
      {children}
    </article>
  );
}

function MainPerformanceChart({ rows }: { rows: DailyRow[] }) {
  if (!rows.length) return <Empty />;
  return (
    <div className="h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ left: 0, right: 12, top: 24, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 5" vertical={false} />
          <XAxis dataKey="date" minTickGap={20} />
          <YAxis yAxisId="count" allowDecimals={false} width={34} />
          <YAxis yAxisId="occupancy" orientation="right" domain={[0, 100]} tickFormatter={(v) => `${v}%`} width={42} />
          <Tooltip formatter={(value: number, name: string) => name === "Taxa de ocupação" ? `${value.toFixed(1)}%` : `${value}`} />
          <Legend verticalAlign="top" align="center" wrapperStyle={{ fontSize: 10, fontWeight: 700 }} />
          <Bar yAxisId="count" dataKey="reservations" name="Reservas" fill={BLUE} radius={[4, 4, 0, 0]} maxBarSize={18} />
          <Bar yAxisId="count" dataKey="cancelled" name="Canceladas" fill={RED} radius={[4, 4, 0, 0]} maxBarSize={18} />
          <Bar yAxisId="count" dataKey="noShow" name="No-show" fill={PURPLE} radius={[4, 4, 0, 0]} maxBarSize={18} />
          <Line yAxisId="occupancy" type="monotone" dataKey="occupancy" name="Taxa de ocupação" stroke={GREEN} strokeWidth={3} dot={{ r: 3, fill: GREEN }} activeDot={{ r: 5 }}>
            <LabelList dataKey="occupancy" position="top" fill={GREEN} fontSize={9} fontWeight={800} formatter={(v: number) => `${v.toFixed(0)}%`} />
          </Line>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function RevenueChart({ rows }: { rows: DailyRow[] }) {
  const data = rows.filter((row) => row.revenue > 0);
  if (!data.length) return <Empty />;
  return (
    <div className="h-52">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 5" vertical={false} />
          <XAxis dataKey="date" minTickGap={20} />
          <YAxis width={46} tickFormatter={compactCurrency} />
          <Tooltip formatter={(v: number) => fmtBRL(v)} />
          <Bar dataKey="revenue" fill={BLUE} radius={[5, 5, 0, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DonutChart({ rows, currency = false }: { rows: NamedValue[]; currency?: boolean }) {
  const data = rows.filter((row) => row.value > 0).slice(0, 6);
  const total = data.reduce((sum, row) => sum + row.value, 0);
  if (!data.length) return <Empty />;
  return (
    <div className="grid min-h-52 items-center gap-2 sm:grid-cols-[1fr_1fr] lg:grid-cols-[1.1fr_0.9fr]">
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={44} outerRadius={76} paddingAngle={2}>
              {data.map((row, index) => <Cell key={row.name} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />)}
              <LabelList dataKey="value" position="inside" fill="#fff" fontSize={9} fontWeight={800} formatter={(v: number) => `${((v / total) * 100).toFixed(1)}%`} />
            </Pie>
            <Tooltip formatter={(v: number) => currency ? fmtBRL(v) : v.toLocaleString("pt-BR")} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-2 text-xs">
        {data.map((row, index) => (
          <div key={row.name} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2"><i className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: DONUT_COLORS[index % DONUT_COLORS.length] }} /><span className="truncate">{row.name}</span></span>
            <strong className="shrink-0">{((row.value / total) * 100).toFixed(1)}%{currency ? ` · ${compactCurrency(row.value)}` : ""}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProgressBars({ rows, footer }: { rows: NamedValue[]; footer: string }) {
  const data = rows.slice(0, 6);
  if (!data.length) return <Empty />;
  return (
    <div className="space-y-3 py-2">
      {data.map((row) => (
        <div key={row.name} className="grid grid-cols-[minmax(105px,1fr)_2.2fr_44px] items-center gap-2 text-xs">
          <span className="truncate font-semibold" title={row.name}>{row.name}</span>
          <div className="h-3 rounded-full bg-emerald-50"><div className="h-3 rounded-full bg-emerald-500" style={{ width: `${Math.max(3, Math.min(100, row.value))}%` }} /></div>
          <strong>{row.value.toFixed(1)}%</strong>
        </div>
      ))}
      <p className="pt-2 text-center text-xs font-extrabold text-emerald-600">{footer}</p>
    </div>
  );
}

function StateRevenueMap({ rows }: { rows: StateValue[] }) {
  const top = rows.slice(0, 5);
  const values = new Map(rows.map((row) => [row.code, row]));
  const maxRevenue = Math.max(1, ...rows.map((row) => row.revenue));
  if (!top.length) return <Empty />;
  return (
    <div className="grid min-h-60 items-center gap-3 sm:grid-cols-[1.1fr_0.9fr]">
      <div>
        <svg viewBox={brazil.viewBox} className="mx-auto h-52 w-full" role="img" aria-label="Mapa do Brasil por receita">
          {brazil.locations.map((location) => {
            const row = values.get(stateCode(location.id));
            const opacity = row?.revenue ? 0.2 + (row.revenue / maxRevenue) * 0.8 : 0.08;
            return <path key={location.id} d={location.path} fill={GREEN} fillOpacity={opacity} stroke="white" strokeWidth="1.2"><title>{location.name}: {row?.guests ?? 0} hóspedes · {fmtBRL(row?.revenue ?? 0)}</title></path>;
          })}
        </svg>
        <div className="mt-1 flex items-center gap-2 text-[9px] text-muted-foreground"><span>Menor receita</span><div className="h-2 flex-1 rounded-full bg-gradient-to-r from-emerald-100 to-emerald-600" /><span>Maior receita</span></div>
      </div>
      <div>
        <div className="mb-2 grid grid-cols-[1fr_auto_auto] gap-2 text-[9px] font-bold uppercase text-muted-foreground"><span>Estado</span><span>Hóspedes</span><span>Receita</span></div>
        <div className="space-y-2">
          {top.map((row) => (
            <div key={row.code} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 text-xs">
              <strong>{row.code}</strong><span>{row.guests}</span><span className="flex items-center gap-2"><strong>{fmtBRL(row.revenue)}</strong><i className="h-2 w-10 rounded-full bg-emerald-100"><b className="block h-2 rounded-full bg-emerald-500" style={{ width: `${Math.max(4, (row.revenue / maxRevenue) * 100)}%` }} /></i></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

async function loadDashboard(companyId: string, range: Range): Promise<DashboardData> {
  const [reservationsResult, salesResult, roomsResult, clientsResult] = await Promise.all([
    (supabase as any).from("reservations").select("id,status,checkin,checkout,quarto,valor_total,pagamento,pessoas,canal,cliente_id").eq("company_id", companyId).lte("checkin", range.end).gte("checkout", range.start),
    (supabase as any).from("sales").select("data,total,pagamento").eq("company_id", companyId).gte("data", range.start).lte("data", range.end),
    (supabase as any).from("rooms").select("numero,configuracao").eq("company_id", companyId),
    (supabase as any).from("clients").select("id,estado").eq("company_id", companyId),
  ]);
  if (reservationsResult.error) throw reservationsResult.error;
  if (salesResult.error) throw salesResult.error;
  if (roomsResult.error) throw roomsResult.error;
  if (clientsResult.error) throw clientsResult.error;

  const reservations = (reservationsResult.data ?? []) as ReservationRow[];
  const sales = (salesResult.data ?? []) as SaleRow[];
  const rooms = (roomsResult.data ?? []) as RoomRow[];
  const clients = (clientsResult.data ?? []) as ClientRow[];
  const clientMap = new Map(clients.map((client) => [client.id, client]));
  const active = reservations.filter((row) => !isCancelled(row.status) && !isNoShow(row.status) && !isMaintenance(row.status));
  const days = daysBetween(range.start, range.end) + 1;
  const roomNights = active.reduce((sum, row) => sum + overlapNights(row.checkin, row.checkout, range), 0);
  const roomCount = rooms.length;
  const availableNights = roomCount * days;
  const lodgingRevenue = active.reduce((sum, row) => sum + number(row.valor_total), 0);
  const salesRevenue = sales.reduce((sum, row) => sum + number(row.total), 0);
  const revenue = lodgingRevenue + salesRevenue;
  const occupancy = availableNights > 0 ? (roomNights / availableNights) * 100 : 0;
  const adr = roomNights > 0 ? lodgingRevenue / roomNights : 0;
  const revpar = availableNights > 0 ? lodgingRevenue / availableNights : 0;

  return {
    revenue,
    occupancy,
    adr,
    revpar,
    reservations: reservations.length,
    cancellations: reservations.filter((row) => isCancelled(row.status)).length,
    noShow: reservations.filter((row) => isNoShow(row.status)).length,
    daily: buildDaily(reservations, sales, roomCount, range),
    payments: aggregatePayments(active, sales),
    channels: aggregateChannels(reservations),
    categoryOccupancy: aggregateCategoryOccupancy(active, rooms, range),
    roomOccupancy: aggregateRoomOccupancy(active, rooms, range),
    states: aggregateStates(active, clientMap),
  };
}

function buildDaily(reservations: ReservationRow[], sales: SaleRow[], roomCount: number, range: Range) {
  const rows: DailyRow[] = [];
  let cursor = parseDate(range.start);
  const end = parseDate(range.end);
  while (cursor <= end) {
    const day = iso(cursor);
    const arrivals = reservations.filter((row) => row.checkin === day);
    const occupied = new Set(reservations.filter((row) => !isCancelled(row.status) && !isNoShow(row.status) && !isMaintenance(row.status) && row.checkin <= day && row.checkout > day && row.quarto != null).map((row) => row.quarto)).size;
    const dayRevenue = arrivals.filter((row) => !isCancelled(row.status) && !isNoShow(row.status)).reduce((sum, row) => sum + number(row.valor_total), 0) + sales.filter((sale) => sale.data === day).reduce((sum, sale) => sum + number(sale.total), 0);
    rows.push({
      date: formatDay(day),
      reservations: arrivals.length,
      cancelled: arrivals.filter((row) => isCancelled(row.status)).length,
      noShow: arrivals.filter((row) => isNoShow(row.status)).length,
      occupancy: roomCount > 0 ? (occupied / roomCount) * 100 : 0,
      revenue: dayRevenue,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return rows;
}

function aggregatePayments(reservations: ReservationRow[], sales: SaleRow[]) {
  const map = new Map<string, number>();
  reservations.forEach((row) => add(map, normalizePayment(row.pagamento), number(row.valor_total)));
  sales.forEach((row) => add(map, normalizePayment(row.pagamento), number(row.total)));
  return toRows(map);
}
function aggregateChannels(reservations: ReservationRow[]) {
  const map = new Map<string, number>();
  reservations.forEach((row) => add(map, normalizeChannel(row.canal), 1));
  return toRows(map);
}
function aggregateCategoryOccupancy(reservations: ReservationRow[], rooms: RoomRow[], range: Range) {
  const days = daysBetween(range.start, range.end) + 1;
  const roomByNumber = new Map(rooms.map((room) => [room.numero, room]));
  const categoryRoomCount = new Map<string, number>();
  rooms.forEach((room) => add(categoryRoomCount, room.configuracao || "Não informado", 1));
  const occupied = new Map<string, number>();
  reservations.forEach((row) => {
    const category = roomByNumber.get(row.quarto ?? -1)?.configuracao || "Não informado";
    add(occupied, category, overlapNights(row.checkin, row.checkout, range));
  });
  return [...categoryRoomCount.entries()].map(([name, count]) => ({ name, value: count * days > 0 ? ((occupied.get(name) ?? 0) / (count * days)) * 100 : 0 })).sort((a, b) => b.value - a.value);
}
function aggregateRoomOccupancy(reservations: ReservationRow[], rooms: RoomRow[], range: Range) {
  const days = daysBetween(range.start, range.end) + 1;
  return rooms.map((room) => ({ name: `${room.numero} · ${room.configuracao || "Quarto"}`, value: days > 0 ? (reservations.filter((row) => row.quarto === room.numero).reduce((sum, row) => sum + overlapNights(row.checkin, row.checkout, range), 0) / days) * 100 : 0 })).filter((row) => row.value > 0).sort((a, b) => b.value - a.value);
}
function aggregateStates(reservations: ReservationRow[], clientMap: Map<string, ClientRow>) {
  const map = new Map<string, StateValue>();
  reservations.forEach((row) => {
    const code = stateCode(clientMap.get(row.cliente_id ?? "")?.estado || "");
    if (!code) return;
    const current = map.get(code) ?? { code, guests: 0, revenue: 0 };
    current.guests += Math.max(1, number(row.pessoas));
    current.revenue += number(row.valor_total);
    map.set(code, current);
  });
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}

function normalizePayment(value: string | null) {
  const text = normalize(value);
  if (text.includes("pix")) return "Pix";
  if (text.includes("dinheiro")) return "Dinheiro";
  if (text.includes("debito")) return "Cartão de Débito";
  if (text.includes("credito")) return "Cartão de Crédito";
  if (text.includes("transfer")) return "Transferência";
  return value?.trim() || "Outros";
}
function normalizeChannel(value: string | null) {
  const text = normalize(value);
  if (text.includes("booking")) return "Booking.com";
  if (text.includes("google")) return "Google";
  if (text.includes("instagram")) return "Instagram";
  if (text.includes("whats") || text.includes("direto") || text.includes("balcao")) return "Direto (Site/WhatsApp)";
  return value?.trim() || "Outros";
}
function isCancelled(value: string | null) { return normalize(value).includes("cancel"); }
function isNoShow(value: string | null) { const text = normalize(value).replace(/[\s_-]+/g, ""); return text.includes("noshow") || text.includes("naocompareceu") || text.includes("naocomparecimento"); }
function isMaintenance(value: string | null) { return normalize(value).includes("manut"); }
function normalize(value: string | null | undefined) { return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); }
function add(map: Map<string, number>, name: string, value: number) { map.set(name, (map.get(name) ?? 0) + value); }
function toRows(map: Map<string, number>) { return [...map.entries()].map(([name, value]) => ({ name, value })).filter((row) => row.value > 0).sort((a, b) => b.value - a.value); }
function number(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function overlapNights(checkin: string, checkout: string, range: Range) { const start = Math.max(parseDate(checkin).getTime(), parseDate(range.start).getTime()); const end = Math.min(parseDate(checkout).getTime(), addDaysDate(parseDate(range.end), 1).getTime()); return Math.max(0, Math.round((end - start) / 86_400_000)); }
function daysBetween(start: string, end: string) { return Math.max(0, Math.round((parseDate(end).getTime() - parseDate(start).getTime()) / 86_400_000)); }
function previousSameLength(range: Range) { const days = daysBetween(range.start, range.end) + 1; const previousEnd = addDaysDate(parseDate(range.start), -1); const previousStart = addDaysDate(previousEnd, -days + 1); return { start: iso(previousStart), end: iso(previousEnd) }; }
function normalizeRange(start: string, end: string) { return start <= end ? { start, end } : { start: end, end: start }; }
function variation(current: number, previous: number) { if (previous === 0) return current === 0 ? 0 : 100; return ((current - previous) / Math.abs(previous)) * 100; }
function parseDate(value: string) { return new Date(`${value}T00:00:00Z`); }
function addDaysDate(date: Date, amount: number) { const copy = new Date(date); copy.setUTCDate(copy.getUTCDate() + amount); return copy; }
function iso(date: Date) { return date.toISOString().slice(0, 10); }
function formatDay(value: string) { return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(parseDate(value)); }
function formatDateTime() { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date()); }
function compactCurrency(value: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 }).format(value); }
function stateCode(value: string) { const clean = normalize(value).toUpperCase(); const aliases: Record<string, string> = { ACRE:"AC",ALAGOAS:"AL",AMAPA:"AP",AMAZONAS:"AM",BAHIA:"BA",CEARA:"CE","DISTRITO FEDERAL":"DF","ESPIRITO SANTO":"ES",GOIAS:"GO",MARANHAO:"MA","MATO GROSSO":"MT","MATO GROSSO DO SUL":"MS","MINAS GERAIS":"MG",PARA:"PA",PARAIBA:"PB",PARANA:"PR",PERNAMBUCO:"PE",PIAUI:"PI","RIO DE JANEIRO":"RJ","RIO GRANDE DO NORTE":"RN","RIO GRANDE DO SUL":"RS",RONDONIA:"RO",RORAIMA:"RR","SANTA CATARINA":"SC","SAO PAULO":"SP",SERGIPE:"SE",TOCANTINS:"TO" }; return aliases[clean] ?? (clean.length === 2 ? clean : clean.toLowerCase().replace("br-", "").toUpperCase()); }
function Empty() { return <div className="grid h-48 place-items-center text-xs font-semibold text-muted-foreground">Sem dados suficientes no período.</div>; }
function State({ text, danger = false }: { text: string; danger?: boolean }) { return <div className={`rounded-2xl border p-6 text-sm ${danger ? "border-red-200 bg-red-50 text-red-700" : "border-border bg-card"}`}>{text}</div>; }
