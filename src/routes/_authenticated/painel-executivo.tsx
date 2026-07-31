import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  BadgeDollarSign,
  BedDouble,
  CalendarDays,
  CircleDollarSign,
  Maximize2,
  Minimize2,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
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

export const Route = createFileRoute("/_authenticated/painel-executivo")({
  component: ExecutiveDashboard,
});

type Range = { start: string; end: string };
type NamedValue = { name: string; value: number };
type PaymentRow = { name: string; revenue: number; count: number };
type ProductRow = { name: string; quantity: number; revenue: number };
type Summary = {
  soldRoomNights: number;
  availableRoomNights: number;
  occupancyRate: number;
  lodgingRevenue: number;
  salesRevenue: number;
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
  status: string | null;
};
type SaleRow = {
  pagamento: string | null;
  total: number | string | null;
  qtd: number | string | null;
  cliente_id: string | null;
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
};

const CHART_COLORS = [
  "var(--primary)",
  "var(--accent)",
  "var(--sage)",
  "var(--brass)",
  "var(--brick)",
  "var(--muted-foreground)",
];

function ExecutiveDashboard() {
  const company = useCurrentCompany();
  const dashboardRef = useRef<HTMLDivElement>(null);
  const today = todayISO();
  const monthStart = `${today.slice(0, 7)}-01`;
  const [start, setStart] = useState(monthStart);
  const [end, setEnd] = useState(today);
  const [fullscreen, setFullscreen] = useState(false);
  const currentRange = useMemo(() => normalizeRange(start, end), [start, end]);
  const previousRange = useMemo(() => previousSameLength(currentRange), [currentRange]);

  const query = useQuery({
    queryKey: ["executive-visual-dashboard", company.data?.id, currentRange.start, currentRange.end],
    enabled: Boolean(company.data?.id),
    staleTime: 60_000,
    queryFn: async () => {
      const [current, previous] = await Promise.all([
        loadVisualData(company.data!.id, currentRange),
        loadVisualData(company.data!.id, previousRange),
      ]);
      return { current, previous };
    },
  });

  async function toggleFullscreen() {
    if (!document.fullscreenElement) {
      await dashboardRef.current?.requestFullscreen();
      setFullscreen(true);
    } else {
      await document.exitFullscreen();
      setFullscreen(false);
    }
  }

  if (company.isLoading || query.isLoading) {
    return <StateCard title="Preparando o painel…" text="Carregando gráficos e comparações." />;
  }
  if (company.error || query.error || !query.data) {
    return <StateCard title="Não foi possível carregar o painel" text="Confira a conexão e tente novamente." danger />;
  }

  const current = query.data.current;
  const previous = query.data.previous;
  const now = current.strategic.summary;
  const before = previous.strategic.summary;
  const trevpar = ratio(now.revenue, now.availableRoomNights);
  const previousTrevpar = ratio(before.revenue, before.availableRoomNights);
  const goppar = ratio(now.gop, now.availableRoomNights);
  const previousGoppar = ratio(before.gop, before.availableRoomNights);
  const resultRows = [
    { period: "Anterior", receita: before.revenue, despesas: before.expenses, gop: before.gop },
    { period: "Atual", receita: now.revenue, despesas: now.expenses, gop: now.gop },
  ];

  return (
    <div ref={dashboardRef} className="space-y-3 bg-background pb-10 fullscreen:overflow-auto fullscreen:p-4">
      <header className="rounded-xl border border-border bg-card p-3 shadow-sm">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-primary">Inteligência de gestão</p>
            <h1 className="mt-0.5 text-lg font-bold text-foreground">Painel Executivo</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">Gráficos, percentuais, volumes e comparação automática do período.</p>
          </div>
          <div className="flex flex-wrap items-end gap-1">
            <label className="text-[8px] font-bold uppercase text-muted-foreground">
              <span className="mb-0.5 flex items-center gap-1"><CalendarDays className="h-3 w-3" />De</span>
              <input type="date" className="field h-7 w-[124px] px-1.5 text-[10px]" value={start} onChange={(event) => setStart(event.target.value)} />
            </label>
            <label className="text-[8px] font-bold uppercase text-muted-foreground">
              <span className="mb-0.5 block">Até</span>
              <input type="date" className="field h-7 w-[124px] px-1.5 text-[10px]" value={end} onChange={(event) => setEnd(event.target.value)} />
            </label>
            <QuickButton onClick={() => setDates(today, today, setStart, setEnd)}>Hoje</QuickButton>
            <QuickButton onClick={() => setDates(addDays(today, -6), today, setStart, setEnd)}>7 dias</QuickButton>
            <QuickButton onClick={() => setDates(monthStart, today, setStart, setEnd)}>Mês</QuickButton>
            <QuickButton onClick={() => setDates(`${today.slice(0, 4)}-01-01`, today, setStart, setEnd)}>Ano</QuickButton>
            <button type="button" className="btn-ghost grid h-7 w-8 place-items-center p-0" onClick={() => void toggleFullscreen()} title="Tela cheia">
              {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
        <ComparativeKpi icon={<CircleDollarSign />} label="Receita" value={fmtBRL(now.revenue)} current={now.revenue} previous={before.revenue} />
        <ComparativeKpi icon={<WalletCards />} label="Despesas" value={fmtBRL(now.expenses)} current={now.expenses} previous={before.expenses} inverse />
        <ComparativeKpi icon={<BadgeDollarSign />} label="GOP" value={fmtBRL(now.gop)} current={now.gop} previous={before.gop} />
        <ComparativeKpi icon={<TrendingUp />} label="Margem" value={`${now.margin.toFixed(1)}%`} current={now.margin} previous={before.margin} suffix=" p.p." />
        <ComparativeKpi icon={<BedDouble />} label="Ocupação" value={`${now.occupancyRate.toFixed(1)}%`} current={now.occupancyRate} previous={before.occupancyRate} suffix=" p.p." />
        <ComparativeKpi icon={<CircleDollarSign />} label="RevPAR" value={fmtBRL(now.revpar)} current={now.revpar} previous={before.revpar} />
        <ComparativeKpi icon={<CircleDollarSign />} label="TRevPAR" value={fmtBRL(trevpar)} current={trevpar} previous={previousTrevpar} />
        <ComparativeKpi icon={<WalletCards />} label="GOPPAR" value={fmtBRL(goppar)} current={goppar} previous={previousGoppar} />
      </section>

      <ChartCard title="Receita, despesas e GOP" insight={financialInsight(now, before)} wide>
        <ResponsiveContainer width="100%" height={315}>
          <ComposedChart data={resultRows} margin={{ left: 6, right: 20, top: 14, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="period" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 9 }} width={68} tickFormatter={compactCurrency} />
            <Tooltip formatter={(value: number) => fmtBRL(value)} />
            <Bar dataKey="receita" name="Receita" fill="var(--primary)" radius={[5, 5, 0, 0]} />
            <Bar dataKey="despesas" name="Despesas" fill="var(--brick)" radius={[5, 5, 0, 0]} />
            <Line type="monotone" dataKey="gop" name="GOP" stroke="var(--accent)" strokeWidth={3} dot={{ r: 4 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <section className="grid gap-3 xl:grid-cols-2">
        <ChartCard title="Meios de pagamento" insight={paymentInsight(current.paymentRows)}>
          <PaymentDonut rows={current.paymentRows} />
        </ChartCard>

        <ChartCard title="Quartos e tarifas" insight={topInsight(current.strategic.roomTypeRows, "Maior receita")}>
          <DonutWithLabels rows={current.strategic.roomTypeRows} currency />
        </ChartCard>

        <ChartCard title="Produtos vendidos e serviços" insight={productInsight(current.strategic.productRows)}>
          <ProductCharts rows={current.strategic.productRows} />
        </ChartCard>

        <ChartCard title="Sexo dos hóspedes" insight={topInsight(current.genderRows, "Maior público")}>
          <DonutWithLabels rows={current.genderRows} />
        </ChartCard>

        <ChartCard title="Faixa etária" insight={topInsight(current.ageRows, "Faixa principal")}>
          <VerticalCountChart rows={current.ageRows} />
        </ChartCard>

        <ChartCard title="Estado civil" insight={topInsight(current.civilRows, "Perfil predominante")}>
          <DonutWithLabels rows={current.civilRows} />
        </ChartCard>

        <ChartCard title="Motivo da estadia" insight={topInsight(current.motiveRows, "Principal motivo")}>
          <DonutWithLabels rows={current.motiveRows} />
        </ChartCard>

        <ChartCard title="Origem dos hóspedes por estado" insight={topInsight(current.stateRows, "Maior origem")}>
          <HorizontalValueChart rows={current.stateRows} valueLabel="hóspedes" />
        </ChartCard>

        <ChartCard title="Canais de venda" insight={topInsight(current.strategic.channelRows, "Canal líder")}>
          <HorizontalValueChart rows={current.strategic.channelRows} currency valueLabel="receita" />
        </ChartCard>

        <ChartCard title="Despesas por categoria" insight={topInsight(current.strategic.expenseRows, "Maior custo")}>
          <HorizontalValueChart rows={current.strategic.expenseRows} currency valueLabel="despesas" />
        </ChartCard>
      </section>
    </div>
  );
}

async function loadVisualData(companyId: string, range: Range): Promise<VisualData> {
  const [strategicResult, reservationsResult, salesResult, clientsResult] = await Promise.all([
    (supabase as any).rpc("dashboard_strategic_aggregates", { p_company_id: companyId, p_start: range.start, p_end: range.end }),
    (supabase as any).from("reservations").select("cliente_id,pagamento,motivo_estadia,valor_total,status").eq("company_id", companyId).gte("checkin", range.start).lte("checkin", range.end),
    (supabase as any).from("sales").select("pagamento,total,qtd,cliente_id,item,categoria").eq("company_id", companyId).gte("data", range.start).lte("data", range.end),
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
  const guestClients = validReservations
    .map((row) => row.cliente_id && clientsById.get(row.cliente_id))
    .filter((client): client is ClientRow => Boolean(client));
  const strategic = strategicResult.data as StrategicData;
  strategic.productRows = aggregateProducts(sales);

  return {
    strategic,
    paymentRows,
    genderRows: aggregateCount(guestClients.map((client) => normalizeLabel(client.sexo, "Não informado"))),
    ageRows: aggregateCount(guestClients.map((client) => ageBand(client.data_nascimento))),
    civilRows: aggregateCount(guestClients.map((client) => normalizeLabel(client.estado_civil, "Não informado"))),
    stateRows: aggregateCount(guestClients.map((client) => normalizeLabel(client.estado, "Não informado"))),
    motiveRows: aggregateCount(validReservations.map((row) => normalizeLabel(row.motivo_estadia, "Não informado"))),
  };
}

function ChartCard({ title, insight, children, wide = false }: { title: string; insight: string; children: ReactNode; wide?: boolean }) {
  return (
    <article className={`rounded-xl border border-border bg-card p-3 shadow-sm ${wide ? "w-full" : ""}`}>
      <div className="mb-1.5 flex min-h-7 flex-wrap items-start justify-between gap-1.5">
        <h2 className="text-sm font-bold text-foreground">{title}</h2>
        <span className="max-w-[64%] rounded-full bg-muted px-2 py-0.5 text-right text-[9px] font-semibold leading-4 text-muted-foreground">{insight}</span>
      </div>
      {children}
    </article>
  );
}

function DonutWithLabels({ rows, currency = false }: { rows: NamedValue[]; currency?: boolean }) {
  const data = rows.filter((row) => row.value > 0).slice(0, 6);
  if (!data.length) return <EmptyChart />;
  const total = data.reduce((sum, row) => sum + row.value, 0);
  return (
    <div className="grid min-h-[285px] items-center gap-2 sm:grid-cols-[1fr_1.05fr]">
      <ResponsiveContainer width="100%" height={245}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={86} paddingAngle={data.length > 1 ? 2 : 0}>
            {data.map((row, index) => <Cell key={row.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(value: number) => currency ? fmtBRL(value) : value.toLocaleString("pt-BR")} />
        </PieChart>
      </ResponsiveContainer>
      <div className="space-y-1.5">
        {data.map((row, index) => (
          <div key={row.name} className="grid grid-cols-[10px_1fr_auto] items-center gap-2 text-[10px]">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART_COLORS[index % CHART_COLORS.length] }} />
            <span className="truncate font-semibold text-foreground" title={row.name}>{row.name}</span>
            <span className="text-right text-muted-foreground">
              <strong className="text-foreground">{((row.value / total) * 100).toFixed(1)}%</strong>
              <span className="ml-1">{currency ? fmtBRL(row.value) : row.value.toLocaleString("pt-BR")}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PaymentDonut({ rows }: { rows: PaymentRow[] }) {
  const data = rows.filter((row) => row.revenue > 0).slice(0, 6);
  if (!data.length) return <EmptyChart />;
  const totalRevenue = data.reduce((sum, row) => sum + row.revenue, 0);
  return (
    <div className="grid min-h-[285px] items-center gap-2 sm:grid-cols-[1fr_1.2fr]">
      <ResponsiveContainer width="100%" height={245}>
        <PieChart>
          <Pie data={data} dataKey="revenue" nameKey="name" innerRadius={50} outerRadius={86} paddingAngle={data.length > 1 ? 2 : 0}>
            {data.map((row, index) => <Cell key={row.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(value: number) => fmtBRL(value)} />
        </PieChart>
      </ResponsiveContainer>
      <div className="space-y-1.5">
        {data.map((row, index) => (
          <div key={row.name} className="grid grid-cols-[10px_1fr_auto] items-center gap-2 text-[10px]">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART_COLORS[index % CHART_COLORS.length] }} />
            <span className="truncate font-semibold text-foreground">{row.name}</span>
            <span className="text-right text-muted-foreground">
              <strong className="text-foreground">{((row.revenue / totalRevenue) * 100).toFixed(1)}%</strong>
              <span className="ml-1">{fmtBRL(row.revenue)} · {row.count} pgto(s)</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HorizontalValueChart({ rows, valueLabel, currency = false }: { rows: NamedValue[]; valueLabel: string; currency?: boolean }) {
  const data = rows.filter((row) => row.value > 0).slice(0, 8);
  if (!data.length) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={285}>
      <BarChart data={data} layout="vertical" margin={{ left: 6, right: 20, top: 6, bottom: 6 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis type="number" tick={{ fontSize: 8 }} tickFormatter={currency ? compactCurrency : compactNumber} />
        <YAxis type="category" dataKey="name" width={88} tick={{ fontSize: 8 }} />
        <Tooltip formatter={(value: number) => currency ? fmtBRL(value) : `${value.toLocaleString("pt-BR")} ${valueLabel}`} />
        <Bar dataKey="value" name={valueLabel} fill="var(--primary)" radius={[0, 5, 5, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function VerticalCountChart({ rows }: { rows: NamedValue[] }) {
  const data = rows.filter((row) => row.value > 0);
  if (!data.length) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={285}>
      <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="name" tick={{ fontSize: 8 }} interval={0} />
        <YAxis tick={{ fontSize: 8 }} width={32} allowDecimals={false} />
        <Tooltip formatter={(value: number) => `${value.toLocaleString("pt-BR")} hóspedes`} />
        <Bar dataKey="value" name="Hóspedes" fill="var(--primary)" radius={[5, 5, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function ProductCharts({ rows }: { rows: ProductRow[] }) {
  const byRevenue = [...rows].filter((row) => row.revenue > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 6);
  const byQuantity = [...rows].filter((row) => row.quantity > 0).sort((a, b) => b.quantity - a.quantity).slice(0, 6);
  if (!byRevenue.length && !byQuantity.length) return <EmptyChart />;
  return (
    <div className="grid gap-2 lg:grid-cols-2">
      <MiniProductChart title="Receita" rows={byRevenue.map((row) => ({ name: row.name, value: row.revenue }))} currency />
      <MiniProductChart title="Quantidade" rows={byQuantity.map((row) => ({ name: row.name, value: row.quantity }))} />
    </div>
  );
}

function MiniProductChart({ title, rows, currency = false }: { title: string; rows: NamedValue[]; currency?: boolean }) {
  return (
    <div>
      <p className="mb-1 text-[9px] font-bold uppercase text-muted-foreground">{title}</p>
      <ResponsiveContainer width="100%" height={255}>
        <BarChart data={rows} layout="vertical" margin={{ left: 2, right: 14, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis type="number" tick={{ fontSize: 7 }} tickFormatter={currency ? compactCurrency : compactNumber} />
          <YAxis type="category" dataKey="name" width={78} tick={{ fontSize: 7 }} />
          <Tooltip formatter={(value: number) => currency ? fmtBRL(value) : `${value.toLocaleString("pt-BR")} unidades`} />
          <Bar dataKey="value" fill="var(--primary)" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ComparativeKpi({ icon, label, value, current, previous, inverse = false, suffix }: { icon: ReactNode; label: string; value: string; current: number; previous: number; inverse?: boolean; suffix?: string }) {
  const delta = suffix ? current - previous : variation(current, previous);
  const good = inverse ? delta <= 0 : delta >= 0;
  return (
    <article className="rounded-xl border border-border bg-card p-2.5 shadow-sm">
      <div className="flex items-center justify-between gap-2 text-muted-foreground">
        <span className="text-[8px] font-bold uppercase">{label}</span>
        <span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
      </div>
      <strong className="mt-1 block text-sm text-foreground">{value}</strong>
      <span className={`mt-1 block text-[9px] font-bold ${good ? "text-emerald-700" : "text-brick"}`}>{signed(delta)}{suffix ?? "%"} vs. anterior</span>
    </article>
  );
}

function QuickButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return <button type="button" className="btn-ghost h-7 px-1.5 text-[9px]" onClick={onClick}>{children}</button>;
}
function EmptyChart() { return <div className="grid h-[285px] place-items-center text-xs text-muted-foreground">Sem dados no período escolhido.</div>; }
function StateCard({ title, text, danger = false }: { title: string; text: string; danger?: boolean }) {
  return <div className={`rounded-xl border p-6 ${danger ? "border-destructive/30 bg-destructive/5" : "border-border bg-card"}`}><h1 className="font-bold">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{text}</p></div>;
}
function aggregatePayments(rows: { name: string; revenue: number }[]) {
  const map = new Map<string, PaymentRow>();
  rows.forEach((row) => {
    const current = map.get(row.name) ?? { name: row.name, revenue: 0, count: 0 };
    current.revenue += row.revenue;
    current.count += 1;
    map.set(row.name, current);
  });
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}
function aggregateProducts(rows: SaleRow[]): ProductRow[] {
  const map = new Map<string, ProductRow>();
  rows.forEach((row) => {
    const name = normalizeLabel(row.item || row.categoria, "Não informado");
    const current = map.get(name) ?? { name, quantity: 0, revenue: 0 };
    current.quantity += Math.max(0, Number(row.qtd) || 0);
    current.revenue += Math.max(0, Number(row.total) || 0);
    map.set(name, current);
  });
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}
function aggregateCount(values: string[]) {
  const map = new Map<string, number>();
  values.forEach((value) => map.set(value, (map.get(value) ?? 0) + 1));
  return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}
function normalizeLabel(value: string | null | undefined, fallback: string) {
  const clean = String(value ?? "").trim();
  if (!clean) return fallback;
  return clean.replaceAll("_", " ").replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}
function ageBand(birthDate: string | null) {
  if (!birthDate) return "Não informado";
  const birth = new Date(`${birthDate}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return "Não informado";
  const age = Math.floor((Date.now() - birth.getTime()) / 31_557_600_000);
  if (age < 18) return "Até 17";
  if (age <= 24) return "18–24";
  if (age <= 34) return "25–34";
  if (age <= 44) return "35–44";
  if (age <= 54) return "45–54";
  if (age <= 64) return "55–64";
  return "65+";
}
function normalizeRange(start: string, end: string): Range { return start <= end ? { start, end } : { start: end, end: start }; }
function previousSameLength(range: Range): Range {
  const start = parseDate(range.start);
  const end = parseDate(range.end);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
  const previousEnd = new Date(start); previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
  const previousStart = new Date(previousEnd); previousStart.setUTCDate(previousStart.getUTCDate() - days + 1);
  return { start: iso(previousStart), end: iso(previousEnd) };
}
function setDates(start: string, end: string, setStart: (value: string) => void, setEnd: (value: string) => void) { setStart(start); setEnd(end); }
function addDays(value: string, amount: number) { const date = parseDate(value); date.setUTCDate(date.getUTCDate() + amount); return iso(date); }
function parseDate(value: string) { return new Date(`${value}T00:00:00Z`); }
function iso(date: Date) { return date.toISOString().slice(0, 10); }
function ratio(value: number, denominator: number) { return denominator > 0 ? value / denominator : 0; }
function variation(current: number, previous: number) { if (previous === 0) return current === 0 ? 0 : 100; return ((current - previous) / Math.abs(previous)) * 100; }
function signed(value: number) { return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`; }
function compactCurrency(value: number) { return new Intl.NumberFormat("pt-BR", { notation: "compact", style: "currency", currency: "BRL", maximumFractionDigits: 1 }).format(value); }
function compactNumber(value: number) { return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value); }
function topInsight(rows: NamedValue[], label: string) { const top = rows[0]; return top ? `${label}: ${top.name} (${top.value.toLocaleString("pt-BR")})` : "Sem dados no período"; }
function paymentInsight(rows: PaymentRow[]) { const top = rows[0]; return top ? `${top.name}: ${fmtBRL(top.revenue)} em ${top.count} pagamento(s)` : "Sem pagamentos no período"; }
function productInsight(rows: ProductRow[]) {
  const topRevenue = [...rows].sort((a, b) => b.revenue - a.revenue)[0];
  const topVolume = [...rows].sort((a, b) => b.quantity - a.quantity)[0];
  return topRevenue ? `Receita: ${topRevenue.name} · Volume: ${topVolume?.name ?? topRevenue.name}` : "Sem produtos vendidos no período";
}
function financialInsight(now: Summary, before: Summary) { return `Receita ${signed(variation(now.revenue, before.revenue))}% · GOP ${signed(variation(now.gop, before.gop))}%`; }
