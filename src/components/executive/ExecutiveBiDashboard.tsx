import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
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
  Line,
  LineChart,
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
type PaymentRow = { name: string; revenue: number; count: number };
type ProductRow = { name: string; quantity: number; revenue: number };
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
};
type SaleRow = {
  pagamento: string | null;
  total: number | string | null;
  qtd: number | string | null;
  item: string | null;
  categoria: string | null;
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
  stateRows: NamedValue[];
  motiveRows: NamedValue[];
  reservationCount: number;
  guestCount: number;
  averageTicket: number;
};

const SERIES_COLORS = {
  revenue: "#2563EB",
  expenses: "#E11D48",
  gop: "#059669",
};

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
    queryKey: ["executive-bi-readable", company.data?.id, currentRange.start, currentRange.end],
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
  const financialRows = [
    { period: "Anterior", receita: before.revenue, despesas: before.expenses, gop: before.gop },
    { period: "Atual", receita: now.revenue, despesas: now.expenses, gop: now.gop },
  ];

  return (
    <div ref={panelRef} className="executive-dashboard-grid h-full min-h-0 gap-1.5 bg-background fullscreen:p-2">
      <header className="rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-primary">Inteligência de gestão</p>
            <h1 className="text-lg font-black leading-tight text-pine-dark">Pulso do Hotel</h1>
            <p className="text-[11px] font-medium text-muted-foreground">Resultado → origem → perfil → oportunidades.</p>
          </div>
          <div className="flex flex-wrap items-end gap-1">
            <DateField label="De" icon value={start} onChange={setStart} />
            <DateField label="Até" value={end} onChange={setEnd} />
            <Quick onClick={() => setRange(today, today, setStart, setEnd)}>Hoje</Quick>
            <Quick onClick={() => setRange(addDays(today, -6), today, setStart, setEnd)}>7 dias</Quick>
            <Quick onClick={() => setRange(monthStart, today, setStart, setEnd)}>Mês</Quick>
            <Quick onClick={() => setRange(`${today.slice(0, 4)}-01-01`, today, setStart, setEnd)}>Ano</Quick>
            <button className="btn-ghost grid h-7 w-8 place-items-center p-0" onClick={() => void toggleFullscreen()} title="Tela cheia">
              {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6 2xl:grid-cols-12">
        <Kpi label="Receita" value={fmtBRL(now.revenue)} current={now.revenue} previous={before.revenue} />
        <Kpi label="Despesas" value={fmtBRL(now.expenses)} current={now.expenses} previous={before.expenses} inverse />
        <Kpi label="GOP" value={fmtBRL(now.gop)} current={now.gop} previous={before.gop} />
        <Kpi label="Margem" value={`${now.margin.toFixed(1)}%`} current={now.margin} previous={before.margin} points />
        <Kpi label="Ocupação" value={`${now.occupancyRate.toFixed(1)}%`} current={now.occupancyRate} previous={before.occupancyRate} points />
        <Kpi label="ADR" value={fmtBRL(now.adr)} current={now.adr} previous={before.adr} />
        <Kpi label="RevPAR" value={fmtBRL(now.revpar)} current={now.revpar} previous={before.revpar} />
        <Kpi label="TRevPAR" value={fmtBRL(trevpar)} current={trevpar} previous={previousTrevpar} />
        <Kpi label="GOPPAR" value={fmtBRL(goppar)} current={goppar} previous={previousGoppar} />
        <Kpi label="Ticket médio" value={fmtBRL(current.averageTicket)} current={current.averageTicket} previous={previous.averageTicket} icon={<ReceiptText />} />
        <Kpi label="Reservas" value={String(current.reservationCount)} current={current.reservationCount} previous={previous.reservationCount} icon={<CalendarDays />} />
        <Kpi label="Hóspedes" value={String(current.guestCount)} current={current.guestCount} previous={previous.guestCount} icon={<Users />} />
      </section>

      <section className="grid grid-cols-1 gap-2 md:grid-cols-12">
        <Panel className="md:col-span-8" title="1. O resultado melhorou ou piorou?" insight={financialInsight(now, before)}>
          <div className="mb-1 flex flex-wrap gap-3 px-1 text-[8px] font-semibold">
            <LegendDot color={SERIES_COLORS.revenue} label="Receita" />
            <LegendDot color={SERIES_COLORS.expenses} label="Despesas" />
            <LegendDot color={SERIES_COLORS.gop} label="GOP" />
          </div>
          <div className="executive-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={financialRows} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="period" tick={{ fontSize: 9 }} />
                <YAxis width={62} tick={{ fontSize: 8 }} tickFormatter={compactCurrency} />
                <Tooltip formatter={(value: number) => fmtBRL(value)} />
                <Line type="monotone" dataKey="receita" name="Receita" stroke={SERIES_COLORS.revenue} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="despesas" name="Despesas" stroke={SERIES_COLORS.expenses} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="gop" name="GOP" stroke={SERIES_COLORS.gop} strokeWidth={3} strokeDasharray="7 4" dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <StoryStrip now={now} before={before} topChannel={current.strategic.channelRows[0]?.name} />
        </Panel>

        <Panel className="md:col-span-4" title="2. Como o dinheiro entrou?" insight={paymentInsight(current.paymentRows)}>
          <HorizontalBars rows={current.paymentRows.map((row) => ({ name: row.name, value: row.revenue }))} currency />
        </Panel>

        <Panel className="md:col-span-4" title="3. Quais quartos geraram receita?" insight={topInsight(current.strategic.roomTypeRows, "Líder")}>
          <HorizontalBars rows={current.strategic.roomTypeRows} currency />
        </Panel>

        <Panel className="md:col-span-4" title="4. Quem são os hóspedes?" insight={topInsight(current.genderRows, "Maior público")}>
          <div className="grid grid-cols-1 items-center gap-1 min-[1100px]:grid-cols-2">
            <HorizontalBars rows={current.genderRows} />
            <HorizontalBars rows={current.ageRows} />
          </div>
        </Panel>

        <Panel className="md:col-span-4" title="5. Por que se hospedaram?" insight={topInsight(current.motiveRows, "Principal motivo")}>
          <HorizontalBars rows={current.motiveRows} />
        </Panel>

        <Panel className="md:col-span-7" title="6. O que foi vendido além da hospedagem?" insight={productInsight(current.strategic.productRows)}>
          <ProductCharts rows={current.strategic.productRows} />
        </Panel>

        <Panel className="md:col-span-5" title="7. De onde vêm os hóspedes?" insight={topInsight(current.stateRows, "Maior origem")}>
          <HorizontalBars rows={current.stateRows} />
        </Panel>

        <Panel className="md:col-span-4" title="8. Qual o perfil familiar?" insight={topInsight(current.civilRows, "Predominante")}>
          <HorizontalBars rows={current.civilRows} />
        </Panel>

        <Panel className="md:col-span-4" title="9. Qual canal traz receita?" insight={topInsight(current.strategic.channelRows, "Canal líder")}>
          <HorizontalBars rows={current.strategic.channelRows} currency />
        </Panel>

        <Panel className="md:col-span-4" title="10. Onde estão os custos?" insight={topInsight(current.strategic.expenseRows, "Maior custo")}>
          <HorizontalBars rows={current.strategic.expenseRows} currency />
        </Panel>
      </section>
    </div>
  );
}

async function loadData(companyId: string, range: Range): Promise<VisualData> {
  const [strategicResult, reservationsResult, salesResult, clientsResult] = await Promise.all([
    (supabase as any).rpc("dashboard_strategic_aggregates", { p_company_id: companyId, p_start: range.start, p_end: range.end }),
    (supabase as any).from("reservations").select("cliente_id,pagamento,motivo_estadia,valor_total,pessoas,status").eq("company_id", companyId).gte("checkin", range.start).lte("checkin", range.end),
    (supabase as any).from("sales").select("pagamento,total,qtd,item,categoria").eq("company_id", companyId).gte("data", range.start).lte("data", range.end),
    (supabase as any).from("clients").select("id,sexo,estado_civil,estado,data_nascimento").eq("company_id", companyId),
  ]);
  if (strategicResult.error) throw strategicResult.error;
  if (reservationsResult.error) throw reservationsResult.error;
  if (salesResult.error) throw salesResult.error;
  if (clientsResult.error) throw clientsResult.error;

  const reservations = (reservationsResult.data ?? []) as ReservationRow[];
  const sales = (salesResult.data ?? []) as SaleRow[];
  const clients = (clientsResult.data ?? []) as ClientRow[];
  const clientsById = new Map(clients.map((client) => [client.id, client]));
  const validReservations = reservations.filter((row) => !["cancelado", "manutencao"].includes(String(row.status ?? "")));
  const paymentRows = aggregatePayments([
    ...validReservations.map((row) => ({ name: row.pagamento || "Não informado", revenue: Number(row.valor_total) || 0 })),
    ...sales.map((row) => ({ name: row.pagamento || "Não informado", revenue: Number(row.total) || 0 })),
  ]);
  const guests = validReservations
    .map((row) => row.cliente_id && clientsById.get(row.cliente_id))
    .filter((row): row is ClientRow => Boolean(row));
  const strategic = strategicResult.data as StrategicData;
  strategic.productRows = aggregateProducts(sales);
  strategic.channelRows = normalizeChannelRows(strategic.channelRows ?? []);
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
    stateRows: aggregateCount(guests.map((client) => normalizeLabel(client.estado, "Não informado"))),
    motiveRows: aggregateCount(validReservations.map((row) => normalizeLabel(row.motivo_estadia, "Não informado"))),
    reservationCount: validReservations.length,
    guestCount,
    averageTicket,
  };
}

function Panel({ title, insight, className = "", children }: { title: string; insight: string; className?: string; children: ReactNode }) {
  return (
    <article className={`min-w-0 overflow-hidden rounded-lg border border-border bg-card p-2.5 shadow-sm ${className}`}>
      <div className="mb-1.5 flex min-h-7 items-start justify-between gap-2 border-b border-border/70 pb-1.5">
        <h2 className="min-w-0 text-sm font-extrabold leading-tight text-pine-dark" title={title}>{title}</h2>
        <span className="max-w-[48%] shrink-0 truncate rounded-full border border-primary/15 bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary" title={insight}>{insight}</span>
      </div>
      {children}
    </article>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />{label}</span>;
}

function StoryStrip({ now, before, topChannel }: { now: Summary; before: Summary; topChannel?: string }) {
  const revenueDelta = variation(now.revenue, before.revenue);
  const expenseDelta = variation(now.expenses, before.expenses);
  const gopDelta = variation(now.gop, before.gop);
  return (
    <div className="grid gap-1 border-t border-border pt-1.5 text-[7px] sm:grid-cols-2 min-[1100px]:grid-cols-4">
      <Story label="O que aconteceu" value={`Receita ${signed(revenueDelta)}%`} />
      <Story label="Possível causa" value={topChannel ? `Canal líder: ${topChannel}` : "Sem canal identificado"} />
      <Story label="Impacto" value={`GOP ${signed(gopDelta)}%`} />
      <Story label="Ação" value={expenseDelta > revenueDelta ? "Revisar custos prioritários" : "Preservar margem e testar tarifa"} />
    </div>
  );
}

function Story({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-muted/60 px-2 py-1"><span className="block uppercase text-muted-foreground">{label}</span><strong className="block truncate text-foreground" title={value}>{value}</strong></div>;
}

function HorizontalBars({ rows, currency = false }: { rows: NamedValue[]; currency?: boolean }) {
  const data = rows.filter((row) => row.value > 0).slice(0, 7);
  if (!data.length) return <Empty />;
  return (
    <div className="executive-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 12, top: 2, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={currency ? compactCurrency : compactNumber} />
          <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 9, fontWeight: 700 }} tickFormatter={(value) => shortLabel(String(value), 16)} />
          <Tooltip formatter={(value: number) => currency ? fmtBRL(value) : value.toLocaleString("pt-BR")} />
          <Bar dataKey="value" fill="#2563EB" radius={[0, 4, 4, 0]} maxBarSize={16} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ProductCharts({ rows }: { rows: ProductRow[] }) {
  const revenue = [...rows].filter((row) => row.revenue > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  const quantity = [...rows].filter((row) => row.quantity > 0).sort((a, b) => b.quantity - a.quantity).slice(0, 5);
  if (!revenue.length && !quantity.length) return <Empty />;
  return (
    <div className="grid gap-1 min-[1100px]:grid-cols-2">
      <MiniBars title="Receita" rows={revenue.map((row) => ({ name: row.name, value: row.revenue }))} currency color="#2563EB" />
      <MiniBars title="Quantidade" rows={quantity.map((row) => ({ name: row.name, value: row.quantity }))} color="#059669" />
    </div>
  );
}

function MiniBars({ title, rows, currency = false, color }: { title: string; rows: NamedValue[]; currency?: boolean; color: string }) {
  return (
    <div>
      <p className="mb-0.5 text-[7px] font-bold uppercase text-muted-foreground">{title}</p>
      <div className="executive-chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 8, top: 2, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 8 }} tickFormatter={currency ? compactCurrency : compactNumber} />
            <YAxis type="category" dataKey="name" width={88} tick={{ fontSize: 8, fontWeight: 700 }} tickFormatter={(value) => shortLabel(String(value), 16)} />
            <Tooltip formatter={(value: number) => currency ? fmtBRL(value) : `${value} unidades`} />
            <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} maxBarSize={14} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Kpi({ label, value, current, previous, inverse = false, points = false, icon }: { label: string; value: string; current: number; previous: number; inverse?: boolean; points?: boolean; icon?: ReactNode }) {
  const delta = points ? current - previous : variation(current, previous);
  const good = inverse ? delta <= 0 : delta >= 0;
  return (
    <article className="min-w-0 rounded-lg border border-border bg-card px-2.5 py-2 shadow-sm">
      <div className="flex items-center justify-between gap-1 text-muted-foreground">
        <span className="truncate text-[9px] font-extrabold uppercase tracking-[0.04em]" title={label}>{label}</span>
        {icon && <span className="text-primary [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>}
      </div>
      <strong className="block truncate text-sm font-black leading-tight text-pine-dark" title={value}>{value}</strong>
      <span className={`block truncate text-[9px] font-bold ${good ? "text-emerald-700" : "text-brick"}`}>{signed(delta)}{points ? " p.p." : "%"} vs. anterior</span>
    </article>
  );
}

function DateField({ label, value, onChange, icon = false }: { label: string; value: string; onChange: (value: string) => void; icon?: boolean }) {
  return (
    <label className="text-[9px] font-extrabold uppercase text-muted-foreground">
      <span className="mb-0.5 flex items-center gap-1">{icon && <CalendarDays className="h-2.5 w-2.5" />}{label}</span>
      <input type="date" className="field h-8 w-[124px] px-2 text-[11px] font-semibold" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Quick({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return <button type="button" className="btn-ghost h-8 rounded-md px-2 text-[10px] font-bold" onClick={onClick}>{children}</button>;
}

function Empty() { return <div className="grid h-[145px] place-items-center text-xs font-semibold text-muted-foreground">Sem dados no período.</div>; }
function State({ text, danger = false }: { text: string; danger?: boolean }) { return <div className={`rounded-xl border p-6 text-sm ${danger ? "border-destructive/30 bg-destructive/5" : "border-border bg-card"}`}>{text}</div>; }
function aggregatePayments(rows: { name: string; revenue: number }[]) { const map = new Map<string, PaymentRow>(); rows.forEach((row) => { const current = map.get(row.name) ?? { name: row.name, revenue: 0, count: 0 }; current.revenue += row.revenue; current.count += 1; map.set(row.name, current); }); return [...map.values()].sort((a, b) => b.revenue - a.revenue); }
function aggregateProducts(rows: SaleRow[]) { const map = new Map<string, ProductRow>(); rows.forEach((row) => { const name = normalizeLabel(row.item || row.categoria, "Não informado"); const current = map.get(name) ?? { name, quantity: 0, revenue: 0 }; current.quantity += Math.max(0, Number(row.qtd) || 0); current.revenue += Math.max(0, Number(row.total) || 0); map.set(name, current); }); return [...map.values()].sort((a, b) => b.revenue - a.revenue); }
function aggregateCount(values: string[]) { const map = new Map<string, number>(); values.forEach((value) => map.set(value, (map.get(value) ?? 0) + 1)); return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value); }
function normalizeChannelRows(rows: NamedValue[]) {
  const totals = new Map<string, number>([
    ["Hotel Direto", 0],
    ["WhatsApp", 0],
    ["Booking", 0],
    ["Formulário", 0],
  ]);
  rows.forEach((row) => {
    const raw = String(row.name ?? "").trim().toLocaleLowerCase("pt-BR");
    const channel = raw.includes("whats") || raw.includes("wpp") || raw.includes("zap")
      ? "WhatsApp"
      : raw.includes("booking")
        ? "Booking"
        : raw.includes("form") || raw.includes("site") || raw.includes("motor")
          ? "Formulário"
          : "Hotel Direto";
    totals.set(channel, (totals.get(channel) ?? 0) + (Number(row.value) || 0));
  });
  return [...totals.entries()]
    .map(([name, value]) => ({ name, value }))
    .filter((row) => row.value > 0)
    .sort((left, right) => right.value - left.value);
}
function normalizeLabel(value: string | null | undefined, fallback: string) { const clean = String(value ?? "").trim(); if (!clean) return fallback; return clean.replaceAll("_", " ").replace(/(^|\s)\S/g, (letter) => letter.toUpperCase()); }
function ageBand(value: string | null) { if (!value) return "Não informado"; const birth = new Date(`${value}T00:00:00Z`); if (Number.isNaN(birth.getTime())) return "Não informado"; const age = Math.floor((Date.now() - birth.getTime()) / 31_557_600_000); if (age < 18) return "Até 17"; if (age <= 24) return "18–24"; if (age <= 34) return "25–34"; if (age <= 44) return "35–44"; if (age <= 54) return "45–54"; if (age <= 64) return "55–64"; return "65+"; }
function normalizeRange(start: string, end: string): Range { return start <= end ? { start, end } : { start: end, end: start }; }
function previousSameLength(range: Range): Range { const start = parseDate(range.start); const end = parseDate(range.end); const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1); const previousEnd = new Date(start); previousEnd.setUTCDate(previousEnd.getUTCDate() - 1); const previousStart = new Date(previousEnd); previousStart.setUTCDate(previousStart.getUTCDate() - days + 1); return { start: iso(previousStart), end: iso(previousEnd) }; }
function setRange(start: string, end: string, setStart: (value: string) => void, setEnd: (value: string) => void) { setStart(start); setEnd(end); }
function addDays(value: string, amount: number) { const date = parseDate(value); date.setUTCDate(date.getUTCDate() + amount); return iso(date); }
function parseDate(value: string) { return new Date(`${value}T00:00:00Z`); }
function iso(date: Date) { return date.toISOString().slice(0, 10); }
function ratio(value: number, denominator: number) { return denominator > 0 ? value / denominator : 0; }
function variation(current: number, previous: number) { if (previous === 0) return current === 0 ? 0 : 100; return ((current - previous) / Math.abs(previous)) * 100; }
function signed(value: number) { return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`; }
function compactCurrency(value: number) { return new Intl.NumberFormat("pt-BR", { notation: "compact", style: "currency", currency: "BRL", maximumFractionDigits: 1 }).format(value); }
function compactNumber(value: number) { return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value); }
function shortLabel(value: string, max: number) { return value.length > max ? `${value.slice(0, max - 1)}…` : value; }
function topInsight(rows: NamedValue[], label: string) { const top = rows[0]; return top ? `${label}: ${top.name}` : "Sem dados"; }
function paymentInsight(rows: PaymentRow[]) { const top = rows[0]; return top ? `${top.name}: ${fmtBRL(top.revenue)} · ${top.count}x` : "Sem pagamentos"; }
function productInsight(rows: ProductRow[]) { const topRevenue = [...rows].sort((a, b) => b.revenue - a.revenue)[0]; const topVolume = [...rows].sort((a, b) => b.quantity - a.quantity)[0]; return topRevenue ? `Receita: ${topRevenue.name} · Volume: ${topVolume?.name ?? topRevenue.name}` : "Sem produtos"; }
function financialInsight(now: Summary, before: Summary) { return `Receita ${signed(variation(now.revenue, before.revenue))}% · GOP ${signed(variation(now.gop, before.gop))}%`; }
