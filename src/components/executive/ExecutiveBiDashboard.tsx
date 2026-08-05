import { useQuery } from "@tanstack/react-query";
import brazil from "@svg-maps/brazil";
import {
  CalendarDays,
  Lightbulb,
  Maximize2,
  Minimize2,
  ReceiptText,
  Users,
} from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
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
type NamedValue = { name: string; value: number };
type PaymentRow = {
  name: string;
  revenue: number;
  count: number;
  lodgingRevenue: number;
  extrasRevenue: number;
};
type ProductRow = { name: string; quantity: number; revenue: number };
type StateRow = { name: string; guests: number; revenue: number };
type OccupancyRow = { date: string; occupancy: number; occupiedRooms: number };
type Summary = {
  availableRoomNights: number;
  occupancyRate: number;
  revenue: number;
  expenses: number;
  gop: number;
  margin: number;
  adr: number;
  revpar: number;
};
type StrategicData = {
  summary: Summary;
  channelRows: NamedValue[];
  expenseRows: NamedValue[];
  roomTypeRows: NamedValue[];
  productRows: ProductRow[];
};
type ReservationRow = {
  cliente_id: string | null;
  pagamento: string | null;
  motivo_estadia: string | null;
  valor_total: number | string | null;
  pessoas: number | string | null;
  status: string | null;
  quarto: number | string | null;
  checkin: string;
  checkout: string;
};
type SaleRow = {
  pagamento: string | null;
  total: number | string | null;
  qtd: number | string | null;
  item: string | null;
  categoria: string | null;
  quarto: number | string | null;
};
type ClientRow = {
  id: string;
  sexo: string | null;
  estado_civil: string | null;
  estado: string | null;
  data_nascimento: string | null;
};
type VisualData = {
  strategic: StrategicData;
  paymentRows: PaymentRow[];
  genderRows: NamedValue[];
  ageRows: NamedValue[];
  civilRows: NamedValue[];
  stateRows: StateRow[];
  motiveRows: NamedValue[];
  productRows: ProductRow[];
  roomRevenueRows: NamedValue[];
  occupancyRows: OccupancyRow[];
  reservationCount: number;
  guestCount: number;
  averageTicket: number;
};

const SERIES = [
  "var(--executive-series-1)",
  "var(--executive-series-2)",
  "var(--executive-series-3)",
  "var(--executive-series-4)",
  "var(--executive-series-5)",
  "var(--executive-series-6)",
];

export function ExecutiveBiDashboard() {
  const company = useCurrentCompany();
  const panelRef = useRef<HTMLDivElement>(null);
  const today = todayISO();
  const monthStart = `${today.slice(0, 7)}-01`;
  const [start, setStart] = useState(monthStart);
  const [end, setEnd] = useState(today);
  const [fullscreen, setFullscreen] = useState(false);
  const currentRange = useMemo(() => normalizeRange(start, end), [start, end]);
  const previousRange = useMemo(() => previousSameLength(currentRange), [currentRange]);

  const query = useQuery({
    queryKey: ["executive-bi-focused", company.data?.id, currentRange.start, currentRange.end],
    enabled: Boolean(company.data?.id),
    staleTime: 60_000,
    queryFn: async () => {
      const [current, previous] = await Promise.all([
        loadData(company.data!.id, currentRange),
        loadData(company.data!.id, previousRange),
      ]);
      return { current, previous };
    },
  });

  async function toggleFullscreen() {
    if (!document.fullscreenElement) {
      await panelRef.current?.requestFullscreen();
      setFullscreen(true);
    } else {
      await document.exitFullscreen();
      setFullscreen(false);
    }
  }

  if (company.isLoading || query.isLoading) return <State text="Carregando o painel executivo…" />;
  if (company.error || query.error || !query.data) return <State text="Não foi possível carregar o painel." danger />;

  const current = query.data.current;
  const previous = query.data.previous;
  const now = current.strategic.summary;
  const before = previous.strategic.summary;
  const trevpar = ratio(now.revenue, now.availableRoomNights);
  const previousTrevpar = ratio(before.revenue, before.availableRoomNights);
  const goppar = ratio(now.gop, now.availableRoomNights);
  const previousGoppar = ratio(before.gop, before.availableRoomNights);
  const dataWarning = now.revenue > 0 && now.expenses === 0;
  const alerts = buildAlerts(current, previous, dataWarning);

  return (
    <div ref={panelRef} className="executive-dashboard-grid min-h-0 space-y-2 bg-background pb-6 fullscreen:overflow-auto fullscreen:p-2">
      <header className="rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-primary">Inteligência de gestão</p>
            <h1 className="text-lg font-black leading-tight text-pine-dark">Pulso do Hotel</h1>
            <p className="text-[11px] font-medium text-muted-foreground">Ocupação, receita por origem, comportamento do hóspede e oportunidades.</p>
          </div>
          <div className="flex flex-wrap items-end gap-1">
            <DateField label="De" icon value={start} onChange={setStart} />
            <DateField label="Até" value={end} onChange={setEnd} />
            <Quick onClick={() => setRange(today, today, setStart, setEnd)}>Hoje</Quick>
            <Quick onClick={() => setRange(addDays(today, -6), today, setStart, setEnd)}>7 dias</Quick>
            <Quick onClick={() => setRange(monthStart, today, setStart, setEnd)}>Mês</Quick>
            <Quick onClick={() => setRange(`${today.slice(0, 4)}-01-01`, today, setStart, setEnd)}>Ano</Quick>
            <button className="btn-ghost grid h-8 w-8 place-items-center p-0" onClick={() => void toggleFullscreen()} title="Tela cheia">
              {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </header>

      {dataWarning && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
          Qualidade dos dados: há receita, mas nenhuma despesa registrada. Margem, GOP e GOPPAR podem estar superestimados.
        </div>
      )}

      <section className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6 2xl:grid-cols-12">
        <Kpi label="Receita" value={fmtBRL(now.revenue)} current={now.revenue} previous={before.revenue} />
        <Kpi label="Despesas" value={fmtBRL(now.expenses)} current={now.expenses} previous={before.expenses} inverse />
        <Kpi label="GOP" value={fmtBRL(now.gop)} current={now.gop} previous={before.gop} unreliable={dataWarning} />
        <Kpi label="Margem" value={`${now.margin.toFixed(1)}%`} current={now.margin} previous={before.margin} points unreliable={dataWarning} />
        <Kpi label="Ocupação" value={`${now.occupancyRate.toFixed(1)}%`} current={now.occupancyRate} previous={before.occupancyRate} points />
        <Kpi label="ADR" value={fmtBRL(now.adr)} current={now.adr} previous={before.adr} />
        <Kpi label="RevPAR" value={fmtBRL(now.revpar)} current={now.revpar} previous={before.revpar} />
        <Kpi label="TRevPAR" value={fmtBRL(trevpar)} current={trevpar} previous={previousTrevpar} />
        <Kpi label="GOPPAR" value={fmtBRL(goppar)} current={goppar} previous={previousGoppar} unreliable={dataWarning} />
        <Kpi label="Ticket médio" value={fmtBRL(current.averageTicket)} current={current.averageTicket} previous={previous.averageTicket} icon={<ReceiptText />} />
        <Kpi label="Reservas" value={String(current.reservationCount)} current={current.reservationCount} previous={previous.reservationCount} icon={<CalendarDays />} />
        <Kpi label="Hóspedes" value={String(current.guestCount)} current={current.guestCount} previous={previous.guestCount} icon={<Users />} />
      </section>

      <section className="grid grid-cols-1 gap-2 md:grid-cols-12">
        <Panel className="md:col-span-8" title="1. Taxa de ocupação por dia" insight={occupancyInsight(current.occupancyRows)}>
          <OccupancyTimeline rows={current.occupancyRows} />
        </Panel>

        <Panel className="md:col-span-4" title="2. Pagamentos: valor e frequência" insight={paymentInsight(current.paymentRows)}>
          <PaymentAnalysis rows={current.paymentRows} />
        </Panel>

        <Panel className="md:col-span-5" title="3. Receita por número de quarto" insight={topInsight(current.roomRevenueRows, "Quarto líder")}>
          <RankedBars rows={current.roomRevenueRows} currency />
        </Panel>

        <Panel className="md:col-span-3" title="4. Perfil etário" insight={topInsight(current.ageRows, "Faixa principal")}>
          <VerticalDistribution rows={current.ageRows} />
        </Panel>

        <Panel className="md:col-span-4" title="5. Motivo da hospedagem" insight={topInsight(current.motiveRows, "Principal motivo")}>
          <MotiveRanking rows={current.motiveRows} />
        </Panel>

        <Panel className="md:col-span-7" title="6. Produtos: receita x volume" insight={productInsight(current.productRows)}>
          <ProductsRevenueVolume rows={current.productRows} />
        </Panel>

        <Panel className="md:col-span-5" title="7. Origem: hóspedes x receita por estado" insight={stateInsight(current.stateRows)}>
          <BrazilStateMap rows={current.stateRows} />
        </Panel>

        <Panel className="md:col-span-4" title="8. Perfil dos hóspedes" insight={topInsight(current.genderRows, "Maior público")}>
          <ProfileComposition gender={current.genderRows} civil={current.civilRows} />
        </Panel>

        <Panel className="md:col-span-4" title="9. Receita por canal" insight={topInsight(current.strategic.channelRows, "Canal líder")}>
          <RankedBars rows={current.strategic.channelRows} currency />
        </Panel>

        <Panel className="md:col-span-4" title="10. Estrutura de custos" insight={dataWarning ? "Despesas não registradas" : topInsight(current.strategic.expenseRows, "Maior custo")}>
          {dataWarning ? <DataQualityEmpty /> : <RankedBars rows={current.strategic.expenseRows} currency danger />}
        </Panel>
      </section>

      <FloatingInsights alerts={alerts} />
    </div>
  );
}

async function loadData(companyId: string, range: Range): Promise<VisualData> {
  const [strategicResult, reservationsResult, salesResult, clientsResult, roomsResult] = await Promise.all([
    (supabase as any).rpc("dashboard_strategic_aggregates", { p_company_id: companyId, p_start: range.start, p_end: range.end }),
    (supabase as any).from("reservations").select("cliente_id,pagamento,motivo_estadia,valor_total,pessoas,status,quarto,checkin,checkout").eq("company_id", companyId).lte("checkin", range.end).gte("checkout", range.start),
    (supabase as any).from("sales").select("pagamento,total,qtd,item,categoria,quarto").eq("company_id", companyId).gte("data", range.start).lte("data", range.end),
    (supabase as any).from("clients").select("id,sexo,estado_civil,estado,data_nascimento").eq("company_id", companyId),
    (supabase as any).from("rooms").select("id").eq("company_id", companyId),
  ]);
  if (strategicResult.error) throw strategicResult.error;
  if (reservationsResult.error) throw reservationsResult.error;
  if (salesResult.error) throw salesResult.error;
  if (clientsResult.error) throw clientsResult.error;
  if (roomsResult.error) throw roomsResult.error;

  const reservations = (reservationsResult.data ?? []) as ReservationRow[];
  const sales = (salesResult.data ?? []) as SaleRow[];
  const clients = (clientsResult.data ?? []) as ClientRow[];
  const roomCount = (roomsResult.data ?? []).length;
  const clientsById = new Map(clients.map((client) => [client.id, client]));
  const validReservations = reservations.filter((row) => !["cancelado", "manutencao"].includes(String(row.status ?? "").toLowerCase()));
  const strategic = strategicResult.data as StrategicData;
  const productRows = aggregateProducts(sales);
  strategic.productRows = productRows;
  strategic.channelRows = normalizeChannelRows(strategic.channelRows ?? []);

  const paymentRows = aggregatePayments(validReservations, sales);
  const guests = validReservations
    .map((row) => row.cliente_id && clientsById.get(row.cliente_id))
    .filter((row): row is ClientRow => Boolean(row));
  const guestCount = validReservations.reduce((sum, row) => sum + Math.max(1, Number(row.pessoas) || 1), 0);
  const averageTicket = validReservations.length
    ? validReservations.reduce((sum, row) => sum + (Number(row.valor_total) || 0), 0) / validReservations.length
    : 0;

  return {
    strategic,
    paymentRows,
    genderRows: aggregateCount(guests.map((client) => normalizeLabel(client.sexo, "Não informado"))),
    ageRows: aggregateCount(guests.map((client) => ageBand(client.data_nascimento))),
    civilRows: aggregateCount(guests.map((client) => normalizeLabel(client.estado_civil, "Não informado"))),
    stateRows: aggregateStates(validReservations, clientsById),
    motiveRows: aggregateCount(validReservations.map((row) => normalizeLabel(row.motivo_estadia, "Não informado"))),
    productRows,
    roomRevenueRows: aggregateRoomRevenue(validReservations, sales),
    occupancyRows: buildOccupancyRows(validReservations, roomCount, range),
    reservationCount: validReservations.length,
    guestCount,
    averageTicket,
  };
}

function Panel({ title, insight, className = "", children }: { title: string; insight: string; className?: string; children: ReactNode }) {
  return (
    <article className={`executive-bi-card min-w-0 overflow-hidden rounded-xl border border-border bg-card p-3 shadow-sm ${className}`}>
      <div className="mb-2 flex min-h-8 items-start justify-between gap-2 border-b border-border/70 pb-2">
        <h2 className="min-w-0 text-sm font-extrabold leading-tight text-pine-dark" title={title}>{title}</h2>
        <span className="max-w-[48%] shrink-0 truncate rounded-full border border-primary/15 bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary" title={insight}>{insight}</span>
      </div>
      {children}
    </article>
  );
}

function OccupancyTimeline({ rows }: { rows: OccupancyRow[] }) {
  if (!rows.length) return <Empty />;
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ left: 2, right: 18, top: 14, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 5" vertical={false} />
          <XAxis dataKey="date" minTickGap={22} />
          <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} width={44} />
          <Tooltip formatter={(value: number, name: string) => name === "occupancy" ? `${value.toFixed(1)}%` : `${value} quartos`} />
          <Line type="monotone" dataKey="occupancy" name="occupancy" stroke="var(--executive-series-1)" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function PaymentAnalysis({ rows }: { rows: PaymentRow[] }) {
  const data = rows.filter((row) => row.revenue > 0).slice(0, 6);
  if (!data.length) return <Empty />;
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 2, right: 34, top: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 5" horizontal={false} />
          <XAxis type="number" tickFormatter={compactCurrency} />
          <YAxis type="category" dataKey="name" width={92} tickFormatter={(value) => shortLabel(String(value), 14)} />
          <Tooltip formatter={(value: number, name: string) => name === "count" ? `${value} pagamentos` : fmtBRL(value)} />
          <Bar dataKey="lodgingRevenue" name="Hospedagem" stackId="payment" fill="var(--executive-series-1)" radius={[0, 0, 0, 0]} />
          <Bar dataKey="extrasRevenue" name="Extras" stackId="payment" fill="var(--executive-series-2)" radius={[0, 7, 7, 0]}>
            <LabelList dataKey="count" position="right" formatter={(value: number) => `${value}x`} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function RankedBars({ rows, currency = false, danger = false }: { rows: NamedValue[]; currency?: boolean; danger?: boolean }) {
  const data = rows.filter((row) => row.value > 0).slice(0, 8);
  if (!data.length) return <Empty />;
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 6, right: 42, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 5" horizontal={false} />
          <XAxis type="number" tickFormatter={currency ? compactCurrency : compactNumber} />
          <YAxis type="category" dataKey="name" width={106} tickFormatter={(value) => shortLabel(String(value), 18)} />
          <Tooltip formatter={(value: number) => currency ? fmtBRL(value) : value.toLocaleString("pt-BR")} />
          <Bar dataKey="value" fill={danger ? "var(--executive-negative)" : "var(--executive-series-1)"} radius={[0, 7, 7, 0]} maxBarSize={22}>
            <LabelList dataKey="value" position="right" formatter={(value: number) => currency ? compactCurrency(value) : compactNumber(value)} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function VerticalDistribution({ rows }: { rows: NamedValue[] }) {
  const data = rows.filter((row) => row.value > 0);
  if (!data.length) return <Empty />;
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: -18, right: 4, top: 18, bottom: 28 }}>
          <CartesianGrid strokeDasharray="3 5" vertical={false} />
          <XAxis dataKey="name" angle={-25} textAnchor="end" interval={0} height={52} />
          <YAxis allowDecimals={false} />
          <Tooltip formatter={(value: number) => `${value} hóspedes`} />
          <Bar dataKey="value" fill="var(--executive-series-3)" radius={[7, 7, 0, 0]} maxBarSize={34}>
            <LabelList dataKey="value" position="top" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function MotiveRanking({ rows }: { rows: NamedValue[] }) {
  const data = rows.filter((row) => row.value > 0).slice(0, 6);
  const total = data.reduce((sum, row) => sum + row.value, 0);
  if (!data.length) return <Empty />;
  return (
    <div className="space-y-3 py-2">
      {data.map((row, index) => (
        <div key={row.name}>
          <div className="mb-1 flex items-center justify-between gap-2 text-xs">
            <span className="truncate font-semibold" title={row.name}>{row.name}</span>
            <strong>{row.value} · {((row.value / total) * 100).toFixed(1)}%</strong>
          </div>
          <div className="h-3 rounded-full bg-muted">
            <div className="h-3 rounded-full" style={{ width: `${Math.max(4, (row.value / data[0].value) * 100)}%`, background: SERIES[index % SERIES.length] }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ProductsRevenueVolume({ rows }: { rows: ProductRow[] }) {
  const data = [...rows].filter((row) => row.revenue > 0 || row.quantity > 0).slice(0, 7);
  if (!data.length) return <Empty />;
  const maxRevenue = Math.max(...data.map((row) => row.revenue), 1);
  const maxQuantity = Math.max(...data.map((row) => row.quantity), 1);
  return (
    <div className="space-y-3 py-2">
      <div className="grid grid-cols-[minmax(120px,1fr)_2fr_2fr] gap-3 text-[10px] font-bold uppercase text-muted-foreground">
        <span>Produto</span><span>Receita</span><span>Volume</span>
      </div>
      {data.map((row) => (
        <div key={row.name} className="grid grid-cols-[minmax(120px,1fr)_2fr_2fr] items-center gap-3 text-xs">
          <span className="truncate font-semibold" title={row.name}>{row.name}</span>
          <div><div className="mb-1 flex justify-between"><span>{fmtBRL(row.revenue)}</span></div><div className="h-2.5 rounded-full bg-muted"><div className="h-2.5 rounded-full bg-primary" style={{ width: `${(row.revenue / maxRevenue) * 100}%` }} /></div></div>
          <div><div className="mb-1 flex justify-between"><span>{row.quantity} un.</span></div><div className="h-2.5 rounded-full bg-muted"><div className="h-2.5 rounded-full" style={{ width: `${(row.quantity / maxQuantity) * 100}%`, background: "var(--executive-series-3)" }} /></div></div>
        </div>
      ))}
    </div>
  );
}

function ProfileComposition({ gender, civil }: { gender: NamedValue[]; civil: NamedValue[] }) {
  const genderData = gender.filter((row) => row.value > 0).slice(0, 4);
  if (!genderData.length && !civil.length) return <Empty />;
  return (
    <div className="grid items-center gap-3 sm:grid-cols-2 md:grid-cols-1 xl:grid-cols-2">
      <div>
        <p className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">Sexo</p>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={genderData} dataKey="value" nameKey="name" innerRadius={34} outerRadius={66} paddingAngle={3}>
                {genderData.map((row, index) => <Cell key={row.name} fill={SERIES[index % SERIES.length]} />)}
              </Pie>
              <Tooltip formatter={(value: number) => `${value} hóspedes`} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-1 text-xs">{genderData.map((row, index) => <div key={row.name} className="flex justify-between"><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: SERIES[index % SERIES.length] }} />{row.name}</span><strong>{row.value}</strong></div>)}</div>
      </div>
      <div>
        <p className="mb-3 text-[10px] font-bold uppercase text-muted-foreground">Estado civil</p>
        <div className="space-y-3">
          {civil.slice(0, 5).map((row) => (
            <div key={row.name}>
              <div className="mb-1 flex justify-between gap-2 text-xs"><span className="truncate">{row.name}</span><strong>{row.value}</strong></div>
              <div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max(5, (row.value / Math.max(1, civil[0]?.value ?? 1)) * 100)}%` }} /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BrazilStateMap({ rows }: { rows: StateRow[] }) {
  const values = new Map(rows.map((row) => [stateCode(row.name), row]));
  const maxRevenue = Math.max(1, ...rows.map((row) => row.revenue));
  const top = rows.filter((row) => row.name !== "Não informado").slice(0, 5);
  if (!top.length) return <Empty />;
  return (
    <div className="grid items-center gap-3 sm:grid-cols-[1.15fr_0.85fr]">
      <svg viewBox={brazil.viewBox} className="mx-auto h-64 w-full" role="img" aria-label="Mapa do Brasil com receita por estado">
        {brazil.locations.map((location: { id: string; path: string; name: string }) => {
          const row = values.get(stateCode(location.id));
          const opacity = row?.revenue ? 0.18 + (row.revenue / maxRevenue) * 0.82 : 0.06;
          return (
            <path key={location.id} d={location.path} fill="var(--executive-series-1)" fillOpacity={opacity} stroke="var(--card)" strokeWidth="1.2">
              <title>{location.name}: {row?.guests ?? 0} hóspede(s) · {fmtBRL(row?.revenue ?? 0)}</title>
            </path>
          );
        })}
      </svg>
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_auto_auto] gap-2 text-[9px] font-bold uppercase text-muted-foreground"><span>Estado</span><span>Hóspedes</span><span>Receita</span></div>
        {top.map((row) => (
          <div key={row.name} className="grid grid-cols-[1fr_auto_auto] gap-2 rounded-md bg-muted/50 px-2 py-1.5 text-xs">
            <strong>{row.name}</strong><span>{row.guests}</span><strong>{compactCurrency(row.revenue)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function FloatingInsights({ alerts }: { alerts: string[] }) {
  return (
    <div className="group fixed bottom-24 right-4 z-40">
      <div className="pointer-events-none absolute bottom-12 right-0 w-80 translate-y-2 rounded-xl border border-border bg-card p-3 opacity-0 shadow-xl transition group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
        <p className="mb-2 text-xs font-extrabold text-foreground">Alertas do Pulso do Hotel</p>
        <div className="space-y-2">{alerts.map((alert) => <p key={alert} className="rounded-md bg-muted/60 px-2 py-1.5 text-xs text-foreground">{alert}</p>)}</div>
      </div>
      <button type="button" className="grid h-11 w-11 place-items-center rounded-full border border-primary/20 bg-primary text-primary-foreground shadow-lg" aria-label="Ver alertas do painel" title="Passe o mouse para ver os alertas">
        <Lightbulb className="h-5 w-5" />
      </button>
    </div>
  );
}

function DataQualityEmpty() {
  return <div className="grid h-56 place-items-center rounded-lg border border-dashed border-amber-300 bg-amber-50 p-5 text-center text-xs text-amber-900"><div><strong className="block text-sm">Custos ainda não cadastrados</strong><span>Cadastre despesas por categoria para calcular margem real, GOP e prioridades de economia.</span></div></div>;
}

function Kpi({ label, value, current, previous, inverse = false, points = false, icon, unreliable = false }: { label: string; value: string; current: number; previous: number; inverse?: boolean; points?: boolean; icon?: ReactNode; unreliable?: boolean }) {
  const delta = points ? current - previous : variation(current, previous);
  const good = inverse ? delta <= 0 : delta >= 0;
  return (
    <article className="min-w-0 rounded-lg border border-border bg-card px-2.5 py-2 shadow-sm">
      <div className="flex items-center justify-between gap-1 text-muted-foreground">
        <span className="truncate text-[9px] font-extrabold uppercase tracking-[0.04em]" title={label}>{label}</span>
        {icon && <span className="text-primary [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>}
      </div>
      <strong className="block truncate text-sm font-black leading-tight text-pine-dark" title={value}>{value}</strong>
      {unreliable ? <span className="block truncate text-[9px] font-bold text-amber-700">Dados incompletos</span> : <span className={`block truncate text-[9px] font-bold ${good ? "text-emerald-700" : "text-brick"}`}>{signed(delta)}{points ? " p.p." : "%"} vs. anterior</span>}
    </article>
  );
}

function DateField({ label, value, onChange, icon = false }: { label: string; value: string; onChange: (value: string) => void; icon?: boolean }) {
  return <label className="text-[9px] font-extrabold uppercase text-muted-foreground"><span className="mb-0.5 flex items-center gap-1">{icon && <CalendarDays className="h-2.5 w-2.5" />}{label}</span><input type="date" className="field h-8 w-[124px] px-2 text-[11px] font-semibold" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}
function Quick({ onClick, children }: { onClick: () => void; children: ReactNode }) { return <button type="button" className="btn-ghost h-8 rounded-md px-2 text-[10px] font-bold" onClick={onClick}>{children}</button>; }
function Empty() { return <div className="grid h-56 place-items-center text-xs font-semibold text-muted-foreground">Sem dados suficientes no período.</div>; }
function State({ text, danger = false }: { text: string; danger?: boolean }) { return <div className={`rounded-xl border p-6 text-sm ${danger ? "border-destructive/30 bg-destructive/5" : "border-border bg-card"}`}>{text}</div>; }

function aggregatePayments(reservations: ReservationRow[], sales: SaleRow[]) {
  const map = new Map<string, PaymentRow>();
  const add = (name: string, value: number, source: "lodging" | "extras") => {
    const current = map.get(name) ?? { name, revenue: 0, count: 0, lodgingRevenue: 0, extrasRevenue: 0 };
    current.revenue += value;
    current.count += 1;
    if (source === "lodging") current.lodgingRevenue += value;
    else current.extrasRevenue += value;
    map.set(name, current);
  };
  reservations.forEach((row) => add(normalizeLabel(row.pagamento, "Não informado"), Number(row.valor_total) || 0, "lodging"));
  sales.forEach((row) => add(normalizeLabel(row.pagamento, "Não informado"), Number(row.total) || 0, "extras"));
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}
function aggregateProducts(rows: SaleRow[]) { const map = new Map<string, ProductRow>(); rows.forEach((row) => { const name = normalizeLabel(row.item || row.categoria, "Não informado"); const current = map.get(name) ?? { name, quantity: 0, revenue: 0 }; current.quantity += Math.max(0, Number(row.qtd) || 0); current.revenue += Math.max(0, Number(row.total) || 0); map.set(name, current); }); return [...map.values()].sort((a, b) => b.revenue - a.revenue); }
function aggregateCount(values: string[]) { const map = new Map<string, number>(); values.forEach((value) => map.set(value, (map.get(value) ?? 0) + 1)); return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value); }
function aggregateRoomRevenue(reservations: ReservationRow[], sales: SaleRow[]) { const map = new Map<string, number>(); reservations.forEach((row) => { const room = row.quarto == null ? "Não informado" : `Quarto ${row.quarto}`; map.set(room, (map.get(room) ?? 0) + (Number(row.valor_total) || 0)); }); sales.forEach((row) => { if (row.quarto == null) return; const room = `Quarto ${row.quarto}`; map.set(room, (map.get(room) ?? 0) + (Number(row.total) || 0)); }); return [...map.entries()].map(([name, value]) => ({ name, value })).filter((row) => row.value > 0).sort((a, b) => b.value - a.value); }
function aggregateStates(reservations: ReservationRow[], clientsById: Map<string, ClientRow>) { const map = new Map<string, StateRow>(); reservations.forEach((row) => { const client = row.cliente_id ? clientsById.get(row.cliente_id) : undefined; const name = normalizeState(client?.estado); const current = map.get(name) ?? { name, guests: 0, revenue: 0 }; current.guests += Math.max(1, Number(row.pessoas) || 1); current.revenue += Number(row.valor_total) || 0; map.set(name, current); }); return [...map.values()].sort((a, b) => b.revenue - a.revenue); }
function buildOccupancyRows(reservations: ReservationRow[], roomCount: number, range: Range) { if (!roomCount) return []; const rows: OccupancyRow[] = []; let cursor = parseDate(range.start); const end = parseDate(range.end); while (cursor <= end) { const isoDate = iso(cursor); const occupied = new Set(reservations.filter((row) => row.checkin <= isoDate && row.checkout >= isoDate && row.quarto != null).map((row) => String(row.quarto))).size; rows.push({ date: formatDay(isoDate), occupancy: (occupied / roomCount) * 100, occupiedRooms: occupied }); cursor.setUTCDate(cursor.getUTCDate() + 1); } return rows; }
function normalizeChannelRows(rows: NamedValue[]) { const totals = new Map<string, number>(); rows.forEach((row) => { const raw = String(row.name ?? "").trim().toLocaleLowerCase("pt-BR"); const channel = raw.includes("whats") || raw.includes("wpp") || raw.includes("zap") ? "WhatsApp" : raw.includes("booking") ? "Booking" : raw.includes("form") || raw.includes("site") || raw.includes("motor") ? "Formulário" : "Hotel Direto"; totals.set(channel, (totals.get(channel) ?? 0) + (Number(row.value) || 0)); }); return [...totals.entries()].map(([name, value]) => ({ name, value })).filter((row) => row.value > 0).sort((a, b) => b.value - a.value); }
function normalizeLabel(value: string | null | undefined, fallback: string) { const clean = String(value ?? "").trim(); if (!clean) return fallback; return clean.replaceAll("_", " ").replace(/(^|\s)\S/g, (letter) => letter.toUpperCase()); }
function normalizeState(value: string | null | undefined) { const clean = String(value ?? "").trim(); if (!clean) return "Não informado"; const code = stateCode(clean); return code || normalizeLabel(clean, "Não informado"); }
function stateCode(value: string) { const clean = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase(); const aliases: Record<string, string> = { ACRE:"AC",ALAGOAS:"AL",AMAPA:"AP",AMAZONAS:"AM",BAHIA:"BA",CEARA:"CE","DISTRITO FEDERAL":"DF","ESPIRITO SANTO":"ES",GOIAS:"GO",MARANHAO:"MA","MATO GROSSO":"MT","MATO GROSSO DO SUL":"MS","MINAS GERAIS":"MG",PARA:"PA",PARAIBA:"PB",PARANA:"PR",PERNAMBUCO:"PE",PIAUI:"PI","RIO DE JANEIRO":"RJ","RIO GRANDE DO NORTE":"RN","RIO GRANDE DO SUL":"RS",RONDONIA:"RO",RORAIMA:"RR","SANTA CATARINA":"SC","SAO PAULO":"SP",SERGIPE:"SE",TOCANTINS:"TO" }; return aliases[clean] ?? (clean.length === 2 ? clean : clean.toLowerCase().replace("br-", "").toUpperCase()); }
function ageBand(value: string | null) { if (!value) return "Não informado"; const birth = new Date(`${value}T00:00:00Z`); if (Number.isNaN(birth.getTime())) return "Não informado"; const age = Math.floor((Date.now() - birth.getTime()) / 31_557_600_000); if (age < 18) return "Até 17"; if (age <= 24) return "18–24"; if (age <= 34) return "25–34"; if (age <= 44) return "35–44"; if (age <= 54) return "45–54"; if (age <= 64) return "55–64"; return "65+"; }
function buildAlerts(current: VisualData, previous: VisualData, dataWarning: boolean) { const alerts: string[] = []; if (dataWarning) alerts.push("Cadastre as despesas do período antes de avaliar lucro e margem."); const occupancyDelta = current.strategic.summary.occupancyRate - previous.strategic.summary.occupancyRate; if (occupancyDelta < -5) alerts.push(`A ocupação caiu ${Math.abs(occupancyDelta).toFixed(1)} p.p.; revise demanda, tarifas e canais.`); if (current.strategic.summary.adr < previous.strategic.summary.adr) alerts.push("A diária média caiu; verifique descontos e quartos vendidos abaixo da tarifa."); const topState = current.stateRows[0]; if (topState) alerts.push(`${topState.name} lidera a receita geográfica com ${fmtBRL(topState.revenue)}.`); return alerts.slice(0, 4).length ? alerts.slice(0, 4) : ["Não há alerta crítico no período selecionado."]; }
function occupancyInsight(rows: OccupancyRow[]) { if (!rows.length) return "Sem dados"; const best = [...rows].sort((a, b) => b.occupancy - a.occupancy)[0]; return `Pico: ${best.date} · ${best.occupancy.toFixed(1)}%`; }
function stateInsight(rows: StateRow[]) { const top = rows.find((row) => row.name !== "Não informado"); return top ? `${top.name}: ${top.guests} hóspedes · ${compactCurrency(top.revenue)}` : "Sem dados"; }
function normalizeRange(start: string, end: string): Range { return start <= end ? { start, end } : { start: end, end: start }; }
function previousSameLength(range: Range): Range { const start = parseDate(range.start); const end = parseDate(range.end); const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1); const previousEnd = new Date(start); previousEnd.setUTCDate(previousEnd.getUTCDate() - 1); const previousStart = new Date(previousEnd); previousStart.setUTCDate(previousStart.getUTCDate() - days + 1); return { start: iso(previousStart), end: iso(previousEnd) }; }
function setRange(start: string, end: string, setStart: (value: string) => void, setEnd: (value: string) => void) { setStart(start); setEnd(end); }
function addDays(value: string, amount: number) { const date = parseDate(value); date.setUTCDate(date.getUTCDate() + amount); return iso(date); }
function parseDate(value: string) { return new Date(`${value}T00:00:00Z`); }
function iso(date: Date) { return date.toISOString().slice(0, 10); }
function formatDay(value: string) { return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(parseDate(value)); }
function ratio(value: number, denominator: number) { return denominator > 0 ? value / denominator : 0; }
function variation(current: number, previous: number) { if (previous === 0) return current === 0 ? 0 : 100; return ((current - previous) / Math.abs(previous)) * 100; }
function signed(value: number) { return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`; }
function compactCurrency(value: number) { return new Intl.NumberFormat("pt-BR", { notation: "compact", style: "currency", currency: "BRL", maximumFractionDigits: 1 }).format(value); }
function compactNumber(value: number) { return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value); }
function shortLabel(value: string, max: number) { return value.length > max ? `${value.slice(0, max - 1)}…` : value; }
function topInsight(rows: NamedValue[], label: string) { const top = rows.find((row) => row.name !== "Não informado"); return top ? `${label}: ${top.name}` : "Sem dados"; }
function paymentInsight(rows: PaymentRow[]) { const top = rows[0]; return top ? `${top.name}: ${fmtBRL(top.revenue)} · ${top.count}x` : "Sem pagamentos"; }
function productInsight(rows: ProductRow[]) { const topRevenue = [...rows].sort((a, b) => b.revenue - a.revenue)[0]; const topVolume = [...rows].sort((a, b) => b.quantity - a.quantity)[0]; return topRevenue ? `Receita: ${topRevenue.name} · Volume: ${topVolume?.name ?? topRevenue.name}` : "Sem produtos"; }
