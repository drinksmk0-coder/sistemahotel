import { useQuery } from "@tanstack/react-query";
import brazil from "@svg-maps/brazil";
import {
  BedDouble,
  Bookmark,
  CalendarDays,
  CircleDollarSign,
  Filter,
  Maximize2,
  Minimize2,
  RefreshCw,
  RotateCcw,
  TrendingUp,
  UserRoundX,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
type DashboardFilters = {
  payment: string;
  state: string;
  room: string;
  weekday: string;
  channel: string;
  category: string;
};
type FilterOptions = {
  payments: string[];
  states: string[];
  rooms: string[];
  channels: string[];
  categories: string[];
};
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
type DashboardSource = {
  reservations: ReservationRow[];
  sales: SaleRow[];
  rooms: RoomRow[];
  clients: ClientRow[];
};
type DailyRow = {
  iso: string;
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

const BLUE = "#2563eb";
const GREEN = "#16a34a";
const RED = "#ef4444";
const PURPLE = "#7c3aed";
const TEAL = "#14b8a6";
const ORANGE = "#f59e0b";
const DONUT_COLORS = [BLUE, GREEN, PURPLE, ORANGE, TEAL, "#64748b"];
const EMPTY_FILTERS: DashboardFilters = {
  payment: "all",
  state: "all",
  room: "all",
  weekday: "all",
  channel: "all",
  category: "all",
};
const WEEKDAYS: Array<[string, string]> = [
  ["1", "Segunda-feira"],
  ["2", "Terça-feira"],
  ["3", "Quarta-feira"],
  ["4", "Quinta-feira"],
  ["5", "Sexta-feira"],
  ["6", "Sábado"],
  ["0", "Domingo"],
];
const EMPTY_DASHBOARD: DashboardData = {
  revenue: 0,
  occupancy: 0,
  adr: 0,
  revpar: 0,
  reservations: 0,
  cancellations: 0,
  noShow: 0,
  daily: [],
  payments: [],
  channels: [],
  categoryOccupancy: [],
  roomOccupancy: [],
  states: [],
};

export function ExecutiveDashboardReference() {
  const company = useCurrentCompany();
  const dashboardRef = useRef<HTMLDivElement>(null);
  const today = todayISO();
  const monthStart = `${today.slice(0, 7)}-01`;
  const [start, setStart] = useState(monthStart);
  const [end, setEnd] = useState(today);
  const [filters, setFilters] = useState<DashboardFilters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const range = useMemo(() => normalizeRange(start, end), [start, end]);
  const previousRange = useMemo(() => previousSameLength(range), [range]);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(document.fullscreenElement === dashboardRef.current);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const query = useQuery({
    queryKey: ["executive-reference-dashboard-source", company.data?.id, range.start, range.end],
    enabled: Boolean(company.data?.id),
    staleTime: 60_000,
    placeholderData: (previousData) => previousData,
    queryFn: async () => {
      const [current, previous] = await Promise.all([
        loadSource(company.data!.id, range),
        loadSource(company.data!.id, previousRange),
      ]);
      return { current, previous };
    },
  });

  const options = useMemo<FilterOptions>(() => query.data ? buildFilterOptions(query.data.current) : {
    payments: [], states: [], rooms: [], channels: [], categories: [],
  }, [query.data]);
  const current = useMemo(() => query.data ? buildDashboard(query.data.current, range, filters) : EMPTY_DASHBOARD, [query.data, range, filters]);
  const previous = useMemo(() => query.data ? buildDashboard(query.data.previous, previousRange, filters) : EMPTY_DASHBOARD, [query.data, previousRange, filters]);
  const activeFilterCount = Object.values(filters).filter((value) => value !== "all").length;

  function setFilter<K extends keyof DashboardFilters>(key: K, value: DashboardFilters[K]) {
    setFilters((currentFilters) => ({ ...currentFilters, [key]: value }));
  }

  function applyPreset(preset: "today" | "7" | "30" | "month" | "year") {
    const now = new Date();
    const presetEnd = localISO(now);
    if (preset === "today") {
      setStart(presetEnd);
      setEnd(presetEnd);
      return;
    }
    if (preset === "7") setStart(localISO(addDaysDate(now, -6)));
    if (preset === "30") setStart(localISO(addDaysDate(now, -29)));
    if (preset === "month") setStart(`${presetEnd.slice(0, 7)}-01`);
    if (preset === "year") setStart(`${presetEnd.slice(0, 4)}-01-01`);
    setEnd(presetEnd);
  }

  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await dashboardRef.current?.requestFullscreen();
  }

  if (company.isLoading || query.isLoading) return <State text="Carregando o painel executivo…" />;
  if (company.error || query.error || !query.data) return <State text="Não foi possível carregar o painel." danger />;

  return (
    <div ref={dashboardRef} data-fullscreen={isFullscreen || undefined} aria-busy={query.isFetching} className="executive-dashboard-shell min-h-0 space-y-2 bg-background pb-5">
      <header data-executive-header className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600">
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
              <input type="date" value={start} onChange={(event) => setStart(event.target.value)} className="h-9 w-[118px] bg-transparent text-xs font-semibold outline-none" />
              <span className="text-muted-foreground">—</span>
              <input type="date" value={end} onChange={(event) => setEnd(event.target.value)} className="h-9 w-[118px] bg-transparent text-xs font-semibold outline-none" />
            </div>
          </label>
          <div className="flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-xs text-muted-foreground">
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Atualizado em<br /><strong className="text-foreground">{formatDateTime()}</strong></span>
          </div>
          <button type="button" data-executive-control className="relative flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground hover:border-blue-300 hover:bg-blue-50" onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen}>
            <Filter className="h-3.5 w-3.5" /> Filtros
            {activeFilterCount > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-blue-600 px-1 text-[10px] text-white">{activeFilterCount}</span>}
          </button>
          <button type="button" data-executive-control className="flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground hover:border-blue-300 hover:bg-blue-50" onClick={toggleFullscreen} aria-label={isFullscreen ? "Sair da tela inteira" : "Abrir em tela inteira"}>
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            <span className="hidden xl:inline">{isFullscreen ? "Sair da tela inteira" : "Tela inteira"}</span>
          </button>
        </div>
      </header>

      {filtersOpen && (
        <FilterPanel
          filters={filters}
          options={options}
          onChange={setFilter}
          onClear={() => setFilters(EMPTY_FILTERS)}
          onPreset={applyPreset}
        />
      )}

      <section data-executive-kpi-grid className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
        <Kpi icon={<CircleDollarSign />} label="Receita total" value={fmtBRL(current.revenue)} delta={variation(current.revenue, previous.revenue)} tone="green" />
        <Kpi icon={<TrendingUp />} label="Taxa de ocupação" value={`${current.occupancy.toFixed(1)}%`} delta={current.occupancy - previous.occupancy} suffix=" p.p." tone="green" />
        <Kpi icon={<CalendarDays />} label="Diária média (ADR)" value={fmtBRL(current.adr)} delta={variation(current.adr, previous.adr)} tone="blue" />
        <Kpi icon={<TrendingUp />} label="RevPAR" value={fmtBRL(current.revpar)} delta={variation(current.revpar, previous.revpar)} tone="purple" />
        <Kpi icon={<Bookmark />} label="Reservas" value={String(current.reservations)} delta={current.reservations - previous.reservations} absolute tone="blue" />
        <Kpi icon={<XCircle />} label="Cancelamentos" value={String(current.cancellations)} delta={current.cancellations - previous.cancellations} absolute negative tone="red" />
        <Kpi icon={<UserRoundX />} label="No-show" value={String(current.noShow)} delta={current.noShow - previous.noShow} absolute negative tone="purple" />
      </section>

      <Panel title={`1. Ocupação, reservas, cancelamentos e no-show por ${chartGranularity(current.daily.length)}`} className="p-3">
        <MainPerformanceChart rows={current.daily} />
      </Panel>

      <section data-executive-detail-grid="financial" className="grid grid-cols-1 gap-2 lg:grid-cols-3">
        <Panel title="2. Receitas por dia (R$)"><RevenueChart rows={current.daily} /></Panel>
        <Panel title="3. Receitas por forma de pagamento"><DonutChart rows={current.payments} currency /></Panel>
        <Panel title="4. Reservas por canal"><DonutChart rows={current.channels} /></Panel>
      </section>

      <section data-executive-detail-grid="operations" className="grid grid-cols-1 gap-2 lg:grid-cols-3">
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

function FilterPanel({ filters, options, onChange, onClear, onPreset }: {
  filters: DashboardFilters;
  options: FilterOptions;
  onChange: <K extends keyof DashboardFilters>(key: K, value: DashboardFilters[K]) => void;
  onClear: () => void;
  onPreset: (preset: "today" | "7" | "30" | "month" | "year") => void;
}) {
  return (
    <section className="rounded-2xl border border-blue-200 bg-card p-3 shadow-sm" data-executive-control>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-black text-blue-700">Filtros cruzados</h2>
          <p className="text-[10px] font-medium text-muted-foreground">Todos os indicadores e gráficos respondem aos filtros abaixo.</p>
        </div>
        <button type="button" className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2 text-xs font-bold hover:border-blue-300 hover:bg-blue-50" onClick={onClear}>
          <RotateCcw className="h-3.5 w-3.5" /> Limpar filtros
        </button>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        <QuickPeriod label="Hoje" onClick={() => onPreset("today")} />
        <QuickPeriod label="7 dias" onClick={() => onPreset("7")} />
        <QuickPeriod label="30 dias" onClick={() => onPreset("30")} />
        <QuickPeriod label="Mês atual" onClick={() => onPreset("month")} />
        <QuickPeriod label="Ano atual" onClick={() => onPreset("year")} />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <FilterSelect label="Forma de pagamento" value={filters.payment} onChange={(value) => onChange("payment", value)} options={options.payments.map((value) => [value, value])} />
        <FilterSelect label="Estado" value={filters.state} onChange={(value) => onChange("state", value)} options={options.states.map((value) => [value, value])} />
        <FilterSelect label="Quarto" value={filters.room} onChange={(value) => onChange("room", value)} options={options.rooms.map((value) => [value, `Quarto ${value}`])} />
        <FilterSelect label="Dia da semana" value={filters.weekday} onChange={(value) => onChange("weekday", value)} options={WEEKDAYS} />
        <FilterSelect label="Canal" value={filters.channel} onChange={(value) => onChange("channel", value)} options={options.channels.map((value) => [value, value])} />
        <FilterSelect label="Categoria do quarto" value={filters.category} onChange={(value) => onChange("category", value)} options={options.categories.map((value) => [value, value])} />
      </div>
    </section>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return (
    <label className="min-w-0 text-[9px] font-extrabold uppercase text-muted-foreground">
      <span className="mb-1 block">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 w-full min-w-0 rounded-lg border border-border bg-background px-2 text-xs font-semibold normal-case text-foreground outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
        <option value="all">Todos</option>
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
    </label>
  );
}

function QuickPeriod({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-[10px] font-bold hover:border-blue-300 hover:bg-blue-50" onClick={onClick}>{label}</button>;
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
    <article data-executive-panel className={`min-w-0 overflow-visible rounded-2xl border border-border bg-card p-3 shadow-sm ${className}`}>
      <h2 className="mb-2 text-sm font-black text-blue-600">{title}</h2>
      {children}
    </article>
  );
}

function MainPerformanceChart({ rows }: { rows: DailyRow[] }) {
  const data = aggregateChartRows(rows);
  if (!data.length) return <Empty />;
  return (
    <div data-executive-chart="main" className="h-[300px] min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ left: 0, right: 12, top: 24, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 5" vertical={false} />
          <XAxis dataKey="date" minTickGap={20} />
          <YAxis yAxisId="count" allowDecimals={false} width={34} />
          <YAxis yAxisId="occupancy" orientation="right" domain={[0, 100]} tickFormatter={(value) => `${value}%`} width={42} />
          <Tooltip formatter={(value: number, name: string) => name === "Taxa de ocupação" ? `${value.toFixed(1)}%` : `${value}`} />
          <Legend verticalAlign="top" align="center" wrapperStyle={{ fontSize: 10, fontWeight: 700 }} />
          <Bar yAxisId="count" dataKey="reservations" name="Reservas" fill={BLUE} radius={[4, 4, 0, 0]} maxBarSize={18} />
          <Bar yAxisId="count" dataKey="cancelled" name="Canceladas" fill={RED} radius={[4, 4, 0, 0]} maxBarSize={18} />
          <Bar yAxisId="count" dataKey="noShow" name="No-show" fill={PURPLE} radius={[4, 4, 0, 0]} maxBarSize={18} />
          <Line yAxisId="occupancy" type="monotone" dataKey="occupancy" name="Taxa de ocupação" stroke={GREEN} strokeWidth={3} dot={{ r: 3, fill: GREEN }} activeDot={{ r: 5 }}>
            <LabelList dataKey="occupancy" position="top" fill={GREEN} fontSize={9} fontWeight={800} formatter={(value: number) => `${value.toFixed(0)}%`} />
          </Line>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function RevenueChart({ rows }: { rows: DailyRow[] }) {
  const data = aggregateChartRows(rows).filter((row) => row.revenue > 0);
  if (!data.length) return <Empty />;
  return (
    <div data-executive-chart="detail" className="h-52 min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 5" vertical={false} />
          <XAxis dataKey="date" minTickGap={20} />
          <YAxis width={46} tickFormatter={compactCurrency} />
          <Tooltip formatter={(value: number) => fmtBRL(value)} />
          <Bar dataKey="revenue" fill={BLUE} radius={[5, 5, 0, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DonutChart({ rows, currency = false }: { rows: NamedValue[]; currency?: boolean }) {
  const data = compactDonutRows(rows);
  const total = data.reduce((sum, row) => sum + row.value, 0);
  if (!data.length) return <Empty />;
  const singleSlice = data.length === 1;
  return (
    <div className="grid min-h-[220px] min-w-0 grid-cols-1 items-center gap-3 overflow-visible sm:grid-cols-[minmax(145px,0.85fr)_minmax(0,1.15fr)]">
      <div className="h-[190px] min-w-0 overflow-visible sm:h-[210px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart style={{ overflow: "visible" }}>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={44}
              outerRadius={72}
              paddingAngle={singleSlice ? 0 : 2}
              startAngle={90}
              endAngle={-270}
              stroke={singleSlice ? "none" : "var(--card)"}
              strokeWidth={singleSlice ? 0 : 2}
              isAnimationActive={false}
            >
              {data.map((row, index) => <Cell key={row.name} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(value: number) => currency ? fmtBRL(value) : value.toLocaleString("pt-BR")} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex min-w-0 flex-col justify-center gap-2 text-xs">
        {data.map((row, index) => (
          <div key={row.name} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <span className="flex min-w-0 items-start gap-2 leading-4">
              <i className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: DONUT_COLORS[index % DONUT_COLORS.length] }} />
              <span className="min-w-0 break-words">{row.name}</span>
            </span>
            <strong className="whitespace-nowrap text-right tabular-nums">{((row.value / total) * 100).toFixed(1)}%{currency ? ` · ${compactCurrency(row.value)}` : ""}</strong>
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
          <div className="h-3 rounded-full bg-blue-50"><div className="h-3 rounded-full bg-blue-500" style={{ width: `${Math.max(3, Math.min(100, row.value))}%` }} /></div>
          <strong>{row.value.toFixed(1)}%</strong>
        </div>
      ))}
      <p className="pt-2 text-center text-xs font-extrabold text-blue-600">{footer}</p>
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
          {brazil.locations.map((location: { id: string; path: string; name: string }) => {
            const row = values.get(stateCode(location.id));
            const opacity = row?.revenue ? 0.2 + (row.revenue / maxRevenue) * 0.8 : 0.08;
            return <path key={location.id} d={location.path} fill={BLUE} fillOpacity={opacity} stroke="white" strokeWidth="1.2"><title>{location.name}: {row?.guests ?? 0} hóspedes · {fmtBRL(row?.revenue ?? 0)}</title></path>;
          })}
        </svg>
        <div className="mt-1 flex items-center gap-2 text-[9px] text-muted-foreground"><span>Menor receita</span><div className="h-2 flex-1 rounded-full bg-gradient-to-r from-blue-100 to-blue-600" /><span>Maior receita</span></div>
      </div>
      <div>
        <div className="mb-2 grid grid-cols-[1fr_auto_auto] gap-2 text-[9px] font-bold uppercase text-muted-foreground"><span>Estado</span><span>Hóspedes</span><span>Receita</span></div>
        <div className="space-y-2">
          {top.map((row) => (
            <div key={row.code} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 text-xs">
              <strong>{row.code}</strong><span>{row.guests}</span><span className="flex items-center gap-2"><strong>{fmtBRL(row.revenue)}</strong><i className="h-2 w-10 rounded-full bg-blue-100"><b className="block h-2 rounded-full bg-blue-500" style={{ width: `${Math.max(4, (row.revenue / maxRevenue) * 100)}%` }} /></i></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

async function loadSource(companyId: string, range: Range): Promise<DashboardSource> {
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
  return {
    reservations: (reservationsResult.data ?? []) as ReservationRow[],
    sales: (salesResult.data ?? []) as SaleRow[],
    rooms: (roomsResult.data ?? []) as RoomRow[],
    clients: (clientsResult.data ?? []) as ClientRow[],
  };
}

function buildFilterOptions(source: DashboardSource): FilterOptions {
  const clientMap = new Map(source.clients.map((client) => [client.id, client]));
  return {
    payments: unique([...source.reservations.map((row) => normalizePayment(row.pagamento)), ...source.sales.map((row) => normalizePayment(row.pagamento))]),
    states: unique(source.reservations.map((row) => stateCode(clientMap.get(row.cliente_id ?? "")?.estado || "")).filter(Boolean)),
    rooms: [...new Set(source.rooms.map((room) => String(room.numero)))].sort((a, b) => Number(a) - Number(b)),
    channels: unique(source.reservations.map((row) => normalizeChannel(row.canal))),
    categories: unique(source.rooms.map((room) => room.configuracao?.trim() || "Não informado")),
  };
}

function buildDashboard(source: DashboardSource, range: Range, filters: DashboardFilters): DashboardData {
  const clientMap = new Map(source.clients.map((client) => [client.id, client]));
  const roomMap = new Map(source.rooms.map((room) => [room.numero, room]));
  const selectedRooms = source.rooms.filter((room) => {
    if (filters.room !== "all" && String(room.numero) !== filters.room) return false;
    if (filters.category !== "all" && (room.configuracao?.trim() || "Não informado") !== filters.category) return false;
    return true;
  });
  const selectedRoomNumbers = new Set(selectedRooms.map((room) => room.numero));
  const baseReservations = source.reservations.filter((row) => matchesReservationFilters(row, filters, clientMap, roomMap));
  const arrivalReservations = baseReservations.filter((row) => matchesWeekday(row.checkin, filters.weekday));
  const activeBase = baseReservations.filter((row) => !isCancelled(row.status) && !isNoShow(row.status) && !isMaintenance(row.status));
  const activeArrivals = arrivalReservations.filter((row) => !isCancelled(row.status) && !isNoShow(row.status) && !isMaintenance(row.status));
  const sales = source.sales.filter((row) => matchesSaleFilters(row, filters));
  const validDates = datesInRange(range).filter((day) => matchesWeekday(day, filters.weekday));
  const roomNights = validDates.reduce((sum, day) => {
    const occupied = new Set(activeBase.filter((row) => row.quarto != null && selectedRoomNumbers.has(row.quarto) && row.checkin <= day && row.checkout > day).map((row) => row.quarto));
    return sum + occupied.size;
  }, 0);
  const availableNights = selectedRooms.length * validDates.length;
  const lodgingRevenue = activeArrivals.reduce((sum, row) => sum + number(row.valor_total), 0);
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
    reservations: arrivalReservations.length,
    cancellations: arrivalReservations.filter((row) => isCancelled(row.status)).length,
    noShow: arrivalReservations.filter((row) => isNoShow(row.status)).length,
    daily: buildDaily(baseReservations, sales, selectedRooms.length, range, filters.weekday),
    payments: aggregatePayments(activeArrivals, sales),
    channels: aggregateChannels(arrivalReservations),
    categoryOccupancy: aggregateCategoryOccupancy(activeBase, selectedRooms, range, filters.weekday),
    roomOccupancy: aggregateRoomOccupancy(activeBase, selectedRooms, range, filters.weekday),
    states: aggregateStates(activeArrivals, clientMap),
  };
}

function matchesReservationFilters(row: ReservationRow, filters: DashboardFilters, clientMap: Map<string, ClientRow>, roomMap: Map<number, RoomRow>) {
  if (filters.payment !== "all" && normalizePayment(row.pagamento) !== filters.payment) return false;
  if (filters.state !== "all" && stateCode(clientMap.get(row.cliente_id ?? "")?.estado || "") !== filters.state) return false;
  if (filters.room !== "all" && String(row.quarto ?? "") !== filters.room) return false;
  if (filters.channel !== "all" && normalizeChannel(row.canal) !== filters.channel) return false;
  if (filters.category !== "all" && (roomMap.get(row.quarto ?? -1)?.configuracao?.trim() || "Não informado") !== filters.category) return false;
  return true;
}

function matchesSaleFilters(row: SaleRow, filters: DashboardFilters) {
  if (filters.payment !== "all" && normalizePayment(row.pagamento) !== filters.payment) return false;
  if (!matchesWeekday(row.data, filters.weekday)) return false;
  if (filters.state !== "all" || filters.room !== "all" || filters.channel !== "all" || filters.category !== "all") return false;
  return true;
}

function buildDaily(reservations: ReservationRow[], sales: SaleRow[], roomCount: number, range: Range, weekday: string) {
  const rows: DailyRow[] = [];
  datesInRange(range).forEach((day) => {
    if (!matchesWeekday(day, weekday)) return;
    const arrivals = reservations.filter((row) => row.checkin === day);
    const occupied = new Set(reservations.filter((row) => !isCancelled(row.status) && !isNoShow(row.status) && !isMaintenance(row.status) && row.checkin <= day && row.checkout > day && row.quarto != null).map((row) => row.quarto)).size;
    const dayRevenue = arrivals.filter((row) => !isCancelled(row.status) && !isNoShow(row.status)).reduce((sum, row) => sum + number(row.valor_total), 0) + sales.filter((sale) => sale.data === day).reduce((sum, sale) => sum + number(sale.total), 0);
    rows.push({
      iso: day,
      date: formatDay(day),
      reservations: arrivals.length,
      cancelled: arrivals.filter((row) => isCancelled(row.status)).length,
      noShow: arrivals.filter((row) => isNoShow(row.status)).length,
      occupancy: roomCount > 0 ? (occupied / roomCount) * 100 : 0,
      revenue: dayRevenue,
    });
  });
  return rows;
}

function aggregateChartRows(rows: DailyRow[]): DailyRow[] {
  if (rows.length <= 45) return rows;
  const monthly = rows.length > 120;
  const groups = new Map<string, DailyRow[]>();
  rows.forEach((row, index) => {
    const key = monthly ? row.iso.slice(0, 7) : `week-${Math.floor(index / 7)}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  });
  return [...groups.values()].map((group) => {
    const first = group[0];
    const date = monthly
      ? new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" }).format(parseDate(`${first.iso.slice(0, 7)}-01`)).replace(" de ", "/")
      : first.date;
    return {
      iso: first.iso,
      date,
      reservations: group.reduce((sum, row) => sum + row.reservations, 0),
      cancelled: group.reduce((sum, row) => sum + row.cancelled, 0),
      noShow: group.reduce((sum, row) => sum + row.noShow, 0),
      occupancy: group.reduce((sum, row) => sum + row.occupancy, 0) / group.length,
      revenue: group.reduce((sum, row) => sum + row.revenue, 0),
    };
  });
}

function chartGranularity(dayCount: number) {
  if (dayCount > 120) return "mês";
  if (dayCount > 45) return "semana";
  return "dia";
}

function compactDonutRows(rows: NamedValue[]) {
  const sorted = rows.filter((row) => row.value > 0).sort((a, b) => b.value - a.value);
  if (sorted.length <= 6) return sorted;
  const top = sorted.slice(0, 5);
  const otherValue = sorted.slice(5).reduce((sum, row) => sum + row.value, 0);
  return [...top, { name: "Outros", value: otherValue }];
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
function aggregateCategoryOccupancy(reservations: ReservationRow[], rooms: RoomRow[], range: Range, weekday: string) {
  const validDates = datesInRange(range).filter((day) => matchesWeekday(day, weekday));
  const roomByNumber = new Map(rooms.map((room) => [room.numero, room]));
  const categoryRoomCount = new Map<string, number>();
  rooms.forEach((room) => add(categoryRoomCount, room.configuracao || "Não informado", 1));
  const occupied = new Map<string, number>();
  validDates.forEach((day) => {
    const occupiedRooms = new Set(reservations.filter((row) => row.quarto != null && row.checkin <= day && row.checkout > day).map((row) => row.quarto));
    occupiedRooms.forEach((roomNumber) => {
      const category = roomByNumber.get(roomNumber ?? -1)?.configuracao || "Não informado";
      add(occupied, category, 1);
    });
  });
  return [...categoryRoomCount.entries()].map(([name, count]) => ({ name, value: count * validDates.length > 0 ? ((occupied.get(name) ?? 0) / (count * validDates.length)) * 100 : 0 })).sort((a, b) => b.value - a.value);
}
function aggregateRoomOccupancy(reservations: ReservationRow[], rooms: RoomRow[], range: Range, weekday: string) {
  const validDates = datesInRange(range).filter((day) => matchesWeekday(day, weekday));
  return rooms.map((room) => {
    const occupiedDays = validDates.filter((day) => reservations.some((row) => row.quarto === room.numero && row.checkin <= day && row.checkout > day)).length;
    return { name: `${room.numero} · ${room.configuracao || "Quarto"}`, value: validDates.length > 0 ? (occupiedDays / validDates.length) * 100 : 0 };
  }).filter((row) => row.value > 0).sort((a, b) => b.value - a.value);
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
  if (text.includes("pendente") || text.includes("fiado")) return "Pendente/Fiado";
  return value?.trim() || "Outros";
}
function normalizeChannel(value: string | null) {
  const text = normalize(value);
  if (text.includes("booking")) return "Booking.com";
  if (text.includes("google")) return "Google";
  if (text.includes("instagram")) return "Instagram";
  if (text.includes("formulario")) return "Formulário";
  if (text.includes("whats") || text.includes("direto") || text.includes("balcao")) return "Direto (Site/WhatsApp)";
  return value?.trim() || "Outros";
}
function matchesWeekday(value: string, weekday: string) { return weekday === "all" || String(parseDate(value).getUTCDay()) === weekday; }
function isCancelled(value: string | null) { return normalize(value).includes("cancel"); }
function isNoShow(value: string | null) { const text = normalize(value).replace(/[\s_-]+/g, ""); return text.includes("noshow") || text.includes("naocompareceu") || text.includes("naocomparecimento"); }
function isMaintenance(value: string | null) { return normalize(value).includes("manut"); }
function normalize(value: string | null | undefined) { return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); }
function add(map: Map<string, number>, name: string, value: number) { map.set(name, (map.get(name) ?? 0) + value); }
function unique(values: string[]) { return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")); }
function toRows(map: Map<string, number>) { return [...map.entries()].map(([name, value]) => ({ name, value })).filter((row) => row.value > 0).sort((a, b) => b.value - a.value); }
function number(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function datesInRange(range: Range) { const values: string[] = []; let cursor = parseDate(range.start); const endDate = parseDate(range.end); while (cursor <= endDate) { values.push(iso(cursor)); cursor = addDaysDate(cursor, 1); } return values; }
function daysBetween(startValue: string, endValue: string) { return Math.max(0, Math.round((parseDate(endValue).getTime() - parseDate(startValue).getTime()) / 86_400_000)); }
function previousSameLength(range: Range) { const days = daysBetween(range.start, range.end) + 1; const previousEnd = addDaysDate(parseDate(range.start), -1); const previousStart = addDaysDate(previousEnd, -days + 1); return { start: iso(previousStart), end: iso(previousEnd) }; }
function normalizeRange(startValue: string, endValue: string) { return startValue <= endValue ? { start: startValue, end: endValue } : { start: endValue, end: startValue }; }
function variation(currentValue: number, previousValue: number) { if (previousValue === 0) return currentValue === 0 ? 0 : 100; return ((currentValue - previousValue) / Math.abs(previousValue)) * 100; }
function parseDate(value: string) { return new Date(`${value}T00:00:00Z`); }
function addDaysDate(date: Date, amount: number) { const copy = new Date(date); copy.setUTCDate(copy.getUTCDate() + amount); return copy; }
function iso(date: Date) { return date.toISOString().slice(0, 10); }
function localISO(date: Date) { const year = date.getFullYear(); const month = String(date.getMonth() + 1).padStart(2, "0"); const day = String(date.getDate()).padStart(2, "0"); return `${year}-${month}-${day}`; }
function formatDay(value: string) { return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(parseDate(value)); }
function formatDateTime() { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date()); }
function compactCurrency(value: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 }).format(value); }
function stateCode(value: string) { const clean = normalize(value).toUpperCase(); const aliases: Record<string, string> = { ACRE:"AC",ALAGOAS:"AL",AMAPA:"AP",AMAZONAS:"AM",BAHIA:"BA",CEARA:"CE","DISTRITO FEDERAL":"DF","ESPIRITO SANTO":"ES",GOIAS:"GO",MARANHAO:"MA","MATO GROSSO":"MT","MATO GROSSO DO SUL":"MS","MINAS GERAIS":"MG",PARA:"PA",PARAIBA:"PB",PARANA:"PR",PERNAMBUCO:"PE",PIAUI:"PI","RIO DE JANEIRO":"RJ","RIO GRANDE DO NORTE":"RN","RIO GRANDE DO SUL":"RS",RONDONIA:"RO",RORAIMA:"RR","SANTA CATARINA":"SC","SAO PAULO":"SP",SERGIPE:"SE",TOCANTINS:"TO" }; return aliases[clean] ?? (clean.length === 2 ? clean : clean.toLowerCase().replace("br-", "").toUpperCase()); }
function Empty() {
  return (
    <div data-executive-empty className="grid h-48 place-items-center px-4 text-center text-xs font-semibold text-muted-foreground">
      Sem dados suficientes no período e filtros selecionados.
    </div>
  );
}
function State({ text, danger = false }: { text: string; danger?: boolean }) { return <div className={`rounded-2xl border p-6 text-sm ${danger ? "border-red-200 bg-red-50 text-red-700" : "border-border bg-card"}`}>{text}</div>; }
