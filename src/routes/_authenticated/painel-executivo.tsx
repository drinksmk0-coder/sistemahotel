import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  BadgeDollarSign,
  BedDouble,
  CalendarDays,
  CircleDollarSign,
  TrendingUp,
  Users,
  WalletCards,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
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
type NamedValue = { name: string; value: number; revenue?: number; quantity?: number };
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
  cancellations: number;
  noShows: number;
  retentionRate: number;
  recurringGuests: number;
  openComplaints: number;
  averageGuestRevenue: number;
};
type StrategicData = {
  summary: Summary;
  channelRows: NamedValue[];
  expenseRows: NamedValue[];
  roomTypeRows: NamedValue[];
  productRows: { name: string; quantity: number; revenue: number }[];
};
type ReservationRow = {
  id: string;
  cliente_id: string | null;
  pagamento: string | null;
  canal: string | null;
  motivo_estadia: string | null;
  valor_total: number | string | null;
  status: string | null;
};
type SaleRow = {
  pagamento: string | null;
  total: number | string | null;
  qtd: number | string | null;
  cliente_id: string | null;
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
  paymentRows: NamedValue[];
  genderRows: NamedValue[];
  ageRows: NamedValue[];
  civilRows: NamedValue[];
  stateRows: NamedValue[];
  motiveRows: NamedValue[];
  recurringByPayment: NamedValue[];
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
  const today = todayISO();
  const monthStart = `${today.slice(0, 7)}-01`;
  const [start, setStart] = useState(monthStart);
  const [end, setEnd] = useState(today);
  const currentRange = useMemo(() => normalizeRange(start, end), [start, end]);
  const previousRange = useMemo(() => previousSameLength(currentRange), [currentRange]);

  const query = useQuery({
    queryKey: [
      "executive-visual-dashboard",
      company.data?.id,
      currentRange.start,
      currentRange.end,
    ],
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
    { name: "Receita", atual: now.revenue, anterior: before.revenue },
    { name: "Despesas", atual: now.expenses, anterior: before.expenses },
    { name: "GOP", atual: now.gop, anterior: before.gop },
  ];

  return (
    <div className="space-y-4 pb-10">
      <header className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
              Inteligência de gestão
            </p>
            <h1 className="mt-1 text-xl font-bold text-foreground">Painel Executivo</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Gráficos e informações do período escolhido. A comparação com o período anterior aparece nos próprios cards.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-[10px] font-bold uppercase text-muted-foreground">
              <span className="mb-1 flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" /> De
              </span>
              <input type="date" className="field h-9" value={start} onChange={(event) => setStart(event.target.value)} />
            </label>
            <label className="text-[10px] font-bold uppercase text-muted-foreground">
              <span className="mb-1 block">Até</span>
              <input type="date" className="field h-9" value={end} onChange={(event) => setEnd(event.target.value)} />
            </label>
            <QuickButton onClick={() => setDates(today, today, setStart, setEnd)}>Hoje</QuickButton>
            <QuickButton onClick={() => setDates(addDays(today, -6), today, setStart, setEnd)}>7 dias</QuickButton>
            <QuickButton onClick={() => setDates(monthStart, today, setStart, setEnd)}>Mês</QuickButton>
            <QuickButton onClick={() => setDates(`${today.slice(0, 4)}-01-01`, today, setStart, setEnd)}>Ano</QuickButton>
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

      <section className="grid gap-3 xl:grid-cols-2">
        <ChartCard title="Resultado financeiro" insight={financialInsight(now, before)}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={resultRows} margin={{ left: 8, right: 16, top: 12, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} width={72} tickFormatter={compactCurrency} />
              <Tooltip formatter={(value: number) => fmtBRL(value)} />
              <Legend />
              <Bar dataKey="anterior" name="Período anterior" fill="var(--muted-foreground)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="atual" name="Período atual" fill="var(--primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Meios de pagamento" insight={topInsight(current.paymentRows, "Maior receita")}> 
          <HorizontalRevenueChart rows={current.paymentRows} />
        </ChartCard>

        <ChartCard title="Volume e recorrência por pagamento" insight={topInsight(current.recurringByPayment, "Maior recorrência")}> 
          <HorizontalRevenueChart rows={current.recurringByPayment} valueLabel="hóspedes recorrentes" currency={false} />
        </ChartCard>

        <ChartCard title="Canais de venda" insight={topInsight(current.strategic.channelRows, "Canal líder")}> 
          <HorizontalRevenueChart rows={current.strategic.channelRows} />
        </ChartCard>

        <ChartCard title="Quartos e tarifas" insight={topInsight(current.strategic.roomTypeRows, "Maior receita")}> 
          <HorizontalRevenueChart rows={current.strategic.roomTypeRows} />
        </ChartCard>

        <ChartCard title="Produtos e serviços" insight={productInsight(current.strategic.productRows)}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={current.strategic.productRows.slice(0, 8)} margin={{ left: 8, right: 16, top: 12, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" angle={-25} textAnchor="end" height={70} tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} width={68} tickFormatter={compactCurrency} />
              <Tooltip formatter={(value: number, name: string) => name === "revenue" ? fmtBRL(value) : value} />
              <Legend />
              <Bar dataKey="revenue" name="Receita" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="quantity" name="Quantidade" fill="var(--accent)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Sexo dos hóspedes" insight={topInsight(current.genderRows, "Maior público")}> 
          <DonutChart rows={current.genderRows} />
        </ChartCard>

        <ChartCard title="Faixa etária" insight={topInsight(current.ageRows, "Faixa principal")}> 
          <HorizontalCountChart rows={current.ageRows} />
        </ChartCard>

        <ChartCard title="Estado civil" insight={topInsight(current.civilRows, "Perfil predominante")}> 
          <DonutChart rows={current.civilRows} />
        </ChartCard>

        <ChartCard title="Motivo da estadia" insight={topInsight(current.motiveRows, "Principal motivo")}> 
          <HorizontalCountChart rows={current.motiveRows} />
        </ChartCard>

        <ChartCard title="Origem dos hóspedes por estado" insight={topInsight(current.stateRows, "Maior origem")}> 
          <HorizontalCountChart rows={current.stateRows} />
        </ChartCard>

        <ChartCard title="Despesas por categoria" insight={topInsight(current.strategic.expenseRows, "Maior custo")}> 
          <HorizontalRevenueChart rows={current.strategic.expenseRows} />
        </ChartCard>
      </section>
    </div>
  );
}

async function loadVisualData(companyId: string, range: Range): Promise<VisualData> {
  const [strategicResult, reservationsResult, salesResult, clientsResult] = await Promise.all([
    (supabase as any).rpc("dashboard_strategic_aggregates", {
      p_company_id: companyId,
      p_start: range.start,
      p_end: range.end,
    }),
    (supabase as any)
      .from("reservations")
      .select("id,cliente_id,pagamento,canal,motivo_estadia,valor_total,status")
      .eq("company_id", companyId)
      .gte("checkin", range.start)
      .lte("checkin", range.end),
    (supabase as any)
      .from("sales")
      .select("pagamento,total,qtd,cliente_id")
      .eq("company_id", companyId)
      .gte("data", range.start)
      .lte("data", range.end),
    (supabase as any)
      .from("clients")
      .select("id,sexo,estado_civil,estado,data_nascimento")
      .eq("company_id", companyId),
  ]);

  if (strategicResult.error) throw strategicResult.error;
  if (reservationsResult.error) throw reservationsResult.error;
  if (salesResult.error) throw salesResult.error;
  if (clientsResult.error) throw clientsResult.error;

  const reservations = (reservationsResult.data ?? []) as ReservationRow[];
  const sales = (salesResult.data ?? []) as SaleRow[];
  const clients = (clientsResult.data ?? []) as ClientRow[];
  const clientsById = new Map(clients.map((client) => [client.id, client]));

  const validReservations = reservations.filter(
    (row) => !["cancelado", "manutencao"].includes(String(row.status ?? "")),
  );

  const paymentRows = aggregateRevenue([
    ...validReservations.map((row) => ({ name: row.pagamento || "Não informado", value: Number(row.valor_total) || 0 })),
    ...sales.map((row) => ({ name: row.pagamento || "Não informado", value: Number(row.total) || 0 })),
  ]);

  const guestClients = validReservations
    .map((row) => row.cliente_id && clientsById.get(row.cliente_id))
    .filter((client): client is ClientRow => Boolean(client));

  const recurringIds = new Set(
    [...countBy(validReservations.map((row) => row.cliente_id).filter(Boolean) as string[])].filter(([, count]) => count > 1).map(([id]) => id),
  );
  const recurringByPayment = aggregateCount(
    validReservations
      .filter((row) => row.cliente_id && recurringIds.has(row.cliente_id))
      .map((row) => row.pagamento || "Não informado"),
  );

  return {
    strategic: strategicResult.data as StrategicData,
    paymentRows,
    genderRows: aggregateCount(guestClients.map((client) => normalizeLabel(client.sexo, "Não informado"))),
    ageRows: aggregateCount(guestClients.map((client) => ageBand(client.data_nascimento))),
    civilRows: aggregateCount(guestClients.map((client) => normalizeLabel(client.estado_civil, "Não informado"))),
    stateRows: aggregateCount(guestClients.map((client) => normalizeLabel(client.estado, "Não informado"))),
    motiveRows: aggregateCount(validReservations.map((row) => normalizeLabel(row.motivo_estadia, "Não informado"))),
    recurringByPayment,
  };
}

function ChartCard({ title, insight, children }: { title: string; insight: string; children: ReactNode }) {
  return (
    <article className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <h2 className="font-bold text-foreground">{title}</h2>
        <span className="max-w-[70%] rounded-full bg-muted px-2.5 py-1 text-right text-[10px] font-semibold text-muted-foreground">
          {insight}
        </span>
      </div>
      {children}
    </article>
  );
}

function DonutChart({ rows }: { rows: NamedValue[] }) {
  const data = rows.filter((row) => row.value > 0).slice(0, 6);
  if (!data.length) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={58} outerRadius={100} paddingAngle={data.length > 1 ? 2 : 0}>
          {data.map((row, index) => <Cell key={row.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
        </Pie>
        <Tooltip formatter={(value: number) => value.toLocaleString("pt-BR")} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

function HorizontalRevenueChart({ rows, valueLabel = "receita", currency = true }: { rows: NamedValue[]; valueLabel?: string; currency?: boolean }) {
  const data = rows.filter((row) => row.value > 0).slice(0, 8);
  if (!data.length) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} layout="vertical" margin={{ left: 20, right: 24, top: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={currency ? compactCurrency : compactNumber} />
        <YAxis type="category" dataKey="name" width={115} tick={{ fontSize: 10 }} />
        <Tooltip formatter={(value: number) => currency ? fmtBRL(value) : `${value.toLocaleString("pt-BR")} ${valueLabel}`} />
        <Bar dataKey="value" name={valueLabel} fill="var(--primary)" radius={[0, 5, 5, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function HorizontalCountChart({ rows }: { rows: NamedValue[] }) {
  return <HorizontalRevenueChart rows={rows} valueLabel="hóspedes" currency={false} />;
}

function ComparativeKpi({ icon, label, value, current, previous, inverse = false, suffix }: { icon: ReactNode; label: string; value: string; current: number; previous: number; inverse?: boolean; suffix?: string }) {
  const delta = suffix ? current - previous : variation(current, previous);
  const good = inverse ? delta <= 0 : delta >= 0;
  return (
    <article className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2 text-muted-foreground">
        <span className="text-[9px] font-bold uppercase">{label}</span>
        <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      </div>
      <strong className="mt-1 block text-base text-foreground">{value}</strong>
      <span className={`mt-1 block text-[10px] font-bold ${good ? "text-emerald-700" : "text-brick"}`}>
        {signed(delta)}{suffix ?? "%"} vs. período anterior
      </span>
    </article>
  );
}

function QuickButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return <button type="button" className="btn-ghost h-9 text-xs" onClick={onClick}>{children}</button>;
}

function EmptyChart() {
  return <div className="grid h-[300px] place-items-center text-sm text-muted-foreground">Sem dados no período escolhido.</div>;
}

function StateCard({ title, text, danger = false }: { title: string; text: string; danger?: boolean }) {
  return (
    <div className={`rounded-xl border p-6 ${danger ? "border-destructive/30 bg-destructive/5" : "border-border bg-card"}`}>
      <h1 className="font-bold">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function aggregateRevenue(rows: { name: string; value: number }[]) {
  const map = new Map<string, number>();
  rows.forEach((row) => map.set(row.name, (map.get(row.name) ?? 0) + row.value));
  return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

function aggregateCount(values: string[]) {
  return [...countBy(values)].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

function countBy(values: string[]) {
  const map = new Map<string, number>();
  values.forEach((value) => map.set(value, (map.get(value) ?? 0) + 1));
  return map;
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

function normalizeRange(start: string, end: string): Range {
  return start <= end ? { start, end } : { start: end, end: start };
}

function previousSameLength(range: Range): Range {
  const start = parseDate(range.start);
  const end = parseDate(range.end);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
  const previousEnd = new Date(start);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setUTCDate(previousStart.getUTCDate() - days + 1);
  return { start: iso(previousStart), end: iso(previousEnd) };
}

function setDates(start: string, end: string, setStart: (value: string) => void, setEnd: (value: string) => void) {
  setStart(start);
  setEnd(end);
}

function addDays(value: string, amount: number) {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return iso(date);
}

function parseDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function ratio(value: number, denominator: number) {
  return denominator > 0 ? value / denominator : 0;
}

function variation(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function signed(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}

function compactCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { notation: "compact", style: "currency", currency: "BRL", maximumFractionDigits: 1 }).format(value);
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function topInsight(rows: NamedValue[], label: string) {
  const top = rows[0];
  if (!top) return "Sem dados no período";
  return `${label}: ${top.name} (${top.value.toLocaleString("pt-BR")})`;
}

function productInsight(rows: { name: string; quantity: number; revenue: number }[]) {
  const topRevenue = [...rows].sort((a, b) => b.revenue - a.revenue)[0];
  const topVolume = [...rows].sort((a, b) => b.quantity - a.quantity)[0];
  if (!topRevenue) return "Sem dados no período";
  return `Receita: ${topRevenue.name} · Volume: ${topVolume?.name ?? topRevenue.name}`;
}

function financialInsight(now: Summary, before: Summary) {
  return `Receita ${signed(variation(now.revenue, before.revenue))}% · GOP ${signed(variation(now.gop, before.gop))}%`;
}
