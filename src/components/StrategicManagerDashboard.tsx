import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BadgeDollarSign,
  BedDouble,
  BrainCircuit,
  CalendarDays,
  CircleDollarSign,
  Gauge,
  Lightbulb,
  LineChart as LineChartIcon,
  MessageSquareText,
  ShieldAlert,
  Target,
  TrendingDown,
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
import { DashboardTvButton } from "@/components/DashboardKit";
import { useCurrentCompany } from "@/lib/data";
import { periodRange, type DashboardPeriod } from "@/lib/dashboard-utils";
import { fmtBRL, todayISO } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";

type ViewId = "estrategico" | "financeiro" | "clientes";
type NumericRow = { name: string; value: number; share?: number; revenue?: number };
type ProductRow = {
  name: string;
  quantity: number;
  revenue: number;
  averagePrice: number;
  share?: number;
};
type FinancialRow = {
  label: string;
  date: string;
  receita: number;
  despesas: number;
  gop: number;
};
type StrategicSummary = {
  roomCount: number;
  occupiedNow: number;
  availableRooms: number;
  occupancyNow: number;
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
  averageStay: number;
  averageRating: number;
  feedbackCount: number;
  openComplaints: number;
  clientCount: number;
  guestCount: number;
  recurringGuests: number;
  newGuests: number;
  retentionRate: number;
  recurringRevenue: number;
  newGuestRevenue: number;
  averageGuestRevenue: number;
  productTicket: number;
  reservationCount: number;
};
type StrategicData = {
  summary: StrategicSummary;
  financialSeries: FinancialRow[];
  channelRows: NumericRow[];
  roomTypeRows: NumericRow[];
  expenseRows: NumericRow[];
  productRows: ProductRow[];
  productCategoryRows: NumericRow[];
  paymentRows: NumericRow[];
  revenueMixRows: NumericRow[];
  stateRows: Array<{ code: string; name: string; value: number; revenue: number }>;
  originRows: NumericRow[];
  ageRows: NumericRow[];
  reasonRows: NumericRow[];
  complaintRows: NumericRow[];
};
type Story = {
  title: string;
  severity: "good" | "attention" | "critical" | "neutral";
  what: string;
  evidence: string;
  why: string;
  impact: string;
  action: string;
  review: string;
  confidence: "alta" | "média" | "baixa";
};

const VIEWS: Array<{ id: ViewId; label: string }> = [
  { id: "estrategico", label: "BI estratégico" },
  { id: "financeiro", label: "Financeiro e DRE" },
  { id: "clientes", label: "Clientes e mercado" },
];

const DONUT_COLORS = ["#2563eb", "#0f766e", "#f59e0b", "#7c3aed", "#dc2626"];

export function StrategicManagerDashboard() {
  const [period, setPeriod] = useState<DashboardPeriod>("mes");
  const [view, setView] = useState<ViewId>("estrategico");
  const company = useCurrentCompany();
  const range = periodRange(period, todayISO());
  const query = useQuery({
    queryKey: ["dashboard-strategic-aggregates", company.data?.id, range.start, range.end],
    enabled: Boolean(company.data?.id),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("dashboard_strategic_aggregates", {
        p_company_id: company.data!.id,
        p_start: range.start,
        p_end: range.end,
      });
      if (error) throw error;
      return data as StrategicData;
    },
  });

  if (company.isLoading || query.isLoading) {
    return <StateCard title="Carregando o BI do hotel…" text="Consolidando indicadores gerenciais." />;
  }
  if (company.error || query.error || !query.data) {
    return (
      <StateCard
        title="Não foi possível carregar o BI"
        text="Confira a conexão e tente novamente."
        danger
      />
    );
  }

  const data = query.data;
  const summary = data.summary;
  const availableRoomNights = Math.max(0, summary.availableRoomNights);
  const trevpar = availableRoomNights > 0 ? summary.revenue / availableRoomNights : 0;
  const goppar = availableRoomNights > 0 ? summary.gop / availableRoomNights : 0;
  const expenseRate = percentage(summary.expenses, summary.revenue);
  const directShare =
    data.channelRows.find((row) => /diret|balcão|whats/i.test(row.name))?.share ?? 0;
  const cancellationRate = percentage(summary.cancellations, summary.reservationCount);
  const lodgingShare = percentage(summary.lodgingRevenue, summary.revenue);
  const accessoryShare = percentage(summary.salesRevenue, summary.revenue);
  const revenueMix = buildRevenueMix(data, summary);
  const stories = buildStories({
    summary,
    expenseRate,
    directShare,
    cancellationRate,
    lodgingShare,
    accessoryShare,
  });

  return (
    <div className="space-y-3 pb-8">
      <header className="flex flex-col gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Business Intelligence · desempenho, causa, impacto e ação
          </p>
          <nav className="flex flex-wrap gap-1" aria-label="Visões do BI do hotel">
            {VIEWS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setView(item.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${
                  view === item.id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "border border-border bg-card text-muted-foreground hover:bg-muted"
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-[10px] font-semibold uppercase text-muted-foreground">
            Competência
            <select
              className="field h-8 min-w-28 py-1 text-xs"
              value={period}
              onChange={(event) => setPeriod(event.target.value as DashboardPeriod)}
            >
              <option value="dia">Hoje</option>
              <option value="mes">Mês</option>
              <option value="ano">Ano</option>
            </select>
          </label>
          <DashboardTvButton />
          <div
            className={`rounded-lg px-3 py-1.5 shadow-sm ${
              summary.gop < 0
                ? "bg-destructive text-destructive-foreground"
                : "bg-primary text-primary-foreground"
            }`}
          >
            <p className="text-[8px] font-bold uppercase opacity-80">Resultado operacional · GOP</p>
            <p className="font-mono text-base font-bold tabular-nums">{fmtBRL(summary.gop)}</p>
            <p className="text-[8px] opacity-80">Margem {summary.margin.toFixed(1)}%</p>
          </div>
        </div>
      </header>

      {view === "estrategico" && (
        <>
          <KpiStrip
            summary={summary}
            expenseRate={expenseRate}
            trevpar={trevpar}
            goppar={goppar}
            cancellationRate={cancellationRate}
          />

          <section className="grid gap-3 xl:grid-cols-12">
            <ChartCard
              className="xl:col-span-8"
              title="Evolução da receita, despesas e resultado"
              subtitle="Azul: receita · vermelho: despesas · roxo: GOP"
              explain="Explique a evolução da receita, despesas e GOP, identificando dias de mudança, causas prováveis, impacto e ação."
            >
              <FinancialChart rows={data.financialSeries} />
            </ChartCard>
            <ChartCard
              className="xl:col-span-4"
              title="Origem da receita"
              subtitle="Participação percentual das fontes de faturamento"
              explain="Explique a composição da receita entre hospedagem, produtos e serviços e indique riscos de concentração."
            >
              <ModernDonut rows={revenueMix} />
            </ChartCard>
          </section>

          <section className="grid gap-3 xl:grid-cols-12">
            <ChartCard
              className="xl:col-span-4"
              title="Receita por canal"
              subtitle="Onde o faturamento está sendo gerado"
              explain="Analise os canais, a dependência de intermediários e as oportunidades de venda direta."
            >
              <HorizontalBars rows={data.channelRows} currency compact />
            </ChartCard>
            <ChartCard
              className="xl:col-span-4"
              title="Receita por tipo de quarto"
              subtitle="Categorias de UH com maior contribuição"
              explain="Explique quais tipos de quarto geram mais receita e onde preço, divulgação ou ocupação devem ser revistos."
            >
              <HorizontalBars rows={data.roomTypeRows} currency compact />
            </ChartCard>
            <ChartCard
              className="xl:col-span-4"
              title="Pressão das despesas"
              subtitle="Categorias que reduzem o resultado"
              explain="Explique quais despesas pressionam o resultado, quando aumentaram e o que deve ser investigado."
            >
              <HorizontalBars rows={data.expenseRows} currency compact />
            </ChartCard>
          </section>

          <section className="grid gap-3 xl:grid-cols-12">
            <div className="xl:col-span-8">
              <StrategicDecisionBoard stories={stories} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:col-span-4 xl:grid-cols-1">
              <CompactPanel title="Saúde das reservas" icon={<ShieldAlert className="h-4 w-4" />}>
                <MetricLine label="Reservas no período" value={String(summary.reservationCount)} />
                <MetricLine label="Cancelamentos" value={String(summary.cancellations)} />
                <MetricLine label="Taxa de cancelamento" value={`${cancellationRate.toFixed(1)}%`} />
                <MetricLine label="No-show" value={String(summary.noShows)} />
              </CompactPanel>
              <CompactPanel title="Eficiência comercial" icon={<Target className="h-4 w-4" />}>
                <MetricLine label="Venda direta" value={`${directShare.toFixed(1)}%`} />
                <MetricLine label="Receita por hóspede" value={fmtBRL(summary.averageGuestRevenue)} />
                <MetricLine label="Permanência média" value={`${summary.averageStay.toFixed(1)} noites`} />
                <MetricLine label="Taxa de retorno" value={`${summary.retentionRate.toFixed(1)}%`} />
              </CompactPanel>
            </div>
          </section>

          <section className="grid gap-3 xl:grid-cols-12">
            <ChartCard
              className="xl:col-span-5"
              title="DRE gerencial simplificada"
              subtitle="Detalhamento contábil de apoio à análise estratégica"
            >
              <ManagerialIncomeStatement summary={summary} />
            </ChartCard>
            <ChartCard
              className="xl:col-span-7"
              title="Leitura contábil e qualidade dos dados"
              subtitle="O painel separa desempenho real de ausência de lançamentos"
            >
              <DataQualityPanel
                summary={summary}
                expenseRate={expenseRate}
                lodgingShare={lodgingShare}
                accessoryShare={accessoryShare}
              />
            </ChartCard>
          </section>
        </>
      )}

      {view === "financeiro" && (
        <>
          <KpiStrip
            summary={summary}
            expenseRate={expenseRate}
            trevpar={trevpar}
            goppar={goppar}
            cancellationRate={cancellationRate}
          />
          <section className="grid gap-3 xl:grid-cols-12">
            <ChartCard className="xl:col-span-5" title="Composição da receita" subtitle="Hospedagem, produtos e serviços">
              <ModernDonut rows={revenueMix} />
            </ChartCard>
            <ChartCard className="xl:col-span-7" title="Produtos e serviços com maior receita" subtitle="Receitas acessórias separadas da hospedagem">
              <HorizontalBars
                rows={data.productRows.map((row) => ({ name: row.name, value: row.revenue }))}
                currency
              />
            </ChartCard>
            <ChartCard className="xl:col-span-6" title="Receita por categoria" subtitle="Categorias para ampliar ou reduzir o mix">
              <HorizontalBars rows={data.productCategoryRows} currency />
            </ChartCard>
            <ChartCard className="xl:col-span-6" title="Formas de pagamento" subtitle="Participação percentual dos recebimentos">
              <ModernDonut rows={normalizeShares(data.paymentRows)} />
            </ChartCard>
            <ChartCard className="xl:col-span-5" title="DRE gerencial simplificada" subtitle="Resultado econômico da competência">
              <ManagerialIncomeStatement summary={summary} />
            </ChartCard>
            <ChartCard className="xl:col-span-7" title="Despesas operacionais" subtitle="Categorias que pressionam a margem">
              <HorizontalBars rows={data.expenseRows} currency />
            </ChartCard>
          </section>
        </>
      )}

      {view === "clientes" && (
        <section className="grid gap-3 xl:grid-cols-12">
          <ChartCard className="xl:col-span-4" title="Novos x recorrentes" subtitle="Retenção e valor da base">
            <ModernDonut
              rows={normalizeShares([
                { name: "Novos", value: summary.newGuests },
                { name: "Recorrentes", value: summary.recurringGuests },
              ])}
            />
          </ChartCard>
          <ChartCard className="xl:col-span-4" title="Origem dos hóspedes" subtitle="Mercados de maior presença">
            <HorizontalBars rows={data.originRows} compact />
          </ChartCard>
          <ChartCard className="xl:col-span-4" title="Faixa etária" subtitle="Perfil para produto e comunicação">
            <HorizontalBars rows={data.ageRows} compact />
          </ChartCard>
          <ChartCard className="xl:col-span-4" title="Motivo da viagem" subtitle="Lazer, negócios e outras motivações">
            <HorizontalBars rows={data.reasonRows} compact />
          </ChartCard>
          <ChartCard className="xl:col-span-4" title="Reclamações por tema" subtitle="Assuntos que afetam a experiência">
            <HorizontalBars rows={data.complaintRows} compact />
          </ChartCard>
          <CompactPanel className="xl:col-span-4" title="Retenção e valor do cliente" icon={<Users className="h-4 w-4" />}>
            <MetricLine label="Hóspedes no período" value={String(summary.guestCount)} />
            <MetricLine label="Novos" value={String(summary.newGuests)} />
            <MetricLine label="Recorrentes" value={String(summary.recurringGuests)} />
            <MetricLine label="Taxa de retorno" value={`${summary.retentionRate.toFixed(1)}%`} />
            <MetricLine label="Receita média por hóspede" value={fmtBRL(summary.averageGuestRevenue)} />
          </CompactPanel>
        </section>
      )}

      <p className="rounded-lg border border-dashed border-border bg-muted/35 px-3 py-2 text-[9px] text-muted-foreground">
        Este é um BI gerencial. A DRE apresentada apoia decisões, mas não substitui escrituração contábil, conciliação bancária, apuração tributária ou demonstrações elaboradas pelo contador.
      </p>
    </div>
  );
}

function KpiStrip({
  summary,
  expenseRate,
  trevpar,
  goppar,
  cancellationRate,
}: {
  summary: StrategicSummary;
  expenseRate: number;
  trevpar: number;
  goppar: number;
  cancellationRate: number;
}) {
  return (
    <section className="grid grid-cols-2 gap-2 md:grid-cols-5 xl:grid-cols-10">
      <MiniKpi icon={<CircleDollarSign />} label="Receita" value={fmtBRL(summary.revenue)} hint="operacional total" />
      <MiniKpi icon={<WalletCards />} label="Despesas" value={fmtBRL(summary.expenses)} hint={`${expenseRate.toFixed(1)}% da receita`} danger={expenseRate > 75} />
      <MiniKpi icon={<BadgeDollarSign />} label="GOP" value={fmtBRL(summary.gop)} hint={`${summary.margin.toFixed(1)}% margem`} danger={summary.gop < 0} />
      <MiniKpi icon={<BedDouble />} label="Ocupação" value={`${summary.occupancyRate.toFixed(1)}%`} hint={`${summary.soldRoomNights} UH vendidas`} />
      <MiniKpi icon={<CalendarDays />} label="ADR" value={fmtBRL(summary.adr)} hint="diária média" />
      <MiniKpi icon={<TrendingUp />} label="RevPAR" value={fmtBRL(summary.revpar)} hint="receita de quartos/UH" />
      <MiniKpi icon={<Gauge />} label="TRevPAR" value={fmtBRL(trevpar)} hint="receita total/UH" />
      <MiniKpi icon={<LineChartIcon />} label="GOPPAR" value={fmtBRL(goppar)} hint="resultado/UH" danger={goppar < 0} />
      <MiniKpi icon={<Target />} label="Reservas" value={String(summary.reservationCount)} hint="no período" />
      <MiniKpi icon={<AlertTriangle />} label="Cancelamento" value={`${cancellationRate.toFixed(1)}%`} hint={`${summary.cancellations} reservas`} danger={cancellationRate > 10} />
    </section>
  );
}

function FinancialChart({ rows }: { rows: FinancialRow[] }) {
  if (!rows.length) return <NoData />;
  return (
    <div className="h-[290px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="label" tick={{ fontSize: 9 }} minTickGap={16} />
          <YAxis tick={{ fontSize: 9 }} tickFormatter={compactNumber} width={48} />
          <Tooltip formatter={(value) => fmtBRL(Number(value ?? 0))} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Bar dataKey="receita" name="Receita operacional" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={18} />
          <Bar dataKey="despesas" name="Despesas operacionais" fill="#dc2626" radius={[4, 4, 0, 0]} maxBarSize={14} />
          <Line type="monotone" dataKey="gop" name="Resultado operacional · GOP" stroke="#7c3aed" strokeWidth={3} dot={{ r: 2.5 }} activeDot={{ r: 5 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function ModernDonut({ rows }: { rows: NumericRow[] }) {
  const clean = normalizeShares(rows).filter((row) => row.value > 0);
  if (!clean.length) return <NoData />;
  return (
    <div className="grid min-h-[250px] grid-cols-[minmax(130px,0.9fr)_minmax(150px,1.1fr)] items-center gap-2">
      <div className="h-[220px] min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={clean} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="86%" paddingAngle={2} stroke="var(--card-solid)" strokeWidth={3}>
              {clean.map((row, index) => (
                <Cell key={`${row.name}-${index}`} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value, _name, item) => [`${Number(item.payload.share ?? 0).toFixed(1)}%`, item.payload.name]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-2">
        {clean.slice(0, 5).map((row, index) => (
          <div key={row.name} className="relative rounded-lg border border-border bg-muted/35 px-3 py-2">
            <span className="absolute -left-3 top-1/2 h-px w-3 -translate-y-1/2" style={{ backgroundColor: DONUT_COLORS[index % DONUT_COLORS.length] }} />
            <div className="flex items-start gap-2">
              <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: DONUT_COLORS[index % DONUT_COLORS.length] }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[10px] font-semibold">{row.name}</p>
                <p className="font-mono text-base font-bold tabular-nums">{Number(row.share ?? 0).toFixed(1)}%</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HorizontalBars({ rows, currency = false, compact = false }: { rows: NumericRow[]; currency?: boolean; compact?: boolean }) {
  const clean = rows.filter((row) => Number(row.value) > 0).slice(0, compact ? 6 : 10);
  if (!clean.length) return <NoData />;
  const height = Math.max(compact ? 225 : 280, clean.length * (compact ? 34 : 38));
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={clean} layout="vertical" margin={{ top: 5, right: 18, left: 8, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
          <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={currency ? compactCurrency : compactNumber} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={105} />
          <Tooltip formatter={(value) => (currency ? fmtBRL(Number(value ?? 0)) : Number(value ?? 0).toLocaleString("pt-BR"))} />
          <Bar dataKey="value" fill="var(--chart-1)" radius={[0, 6, 6, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function StrategicDecisionBoard({ stories }: { stories: Story[] }) {
  return (
    <section className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <BrainCircuit className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold">Diagnóstico estratégico do gerente</h2>
          </div>
          <p className="text-[10px] text-muted-foreground">O que aconteceu → evidências → impacto → ação e prazo</p>
        </div>
        <a href="/assistente" className="rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-[10px] font-bold text-primary hover:bg-primary/10">
          Aprofundar no HotelAI
        </a>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {stories.map((story) => (
          <StoryCard key={story.title} story={story} />
        ))}
      </div>
    </section>
  );
}

function StoryCard({ story }: { story: Story }) {
  const tone = {
    good: "border-emerald-500/25 bg-emerald-500/5",
    attention: "border-amber-500/30 bg-amber-500/5",
    critical: "border-red-500/30 bg-red-500/5",
    neutral: "border-border bg-muted/25",
  }[story.severity];
  return (
    <article className={`rounded-xl border p-3 ${tone}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold">{story.title}</h3>
        <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[8px] font-bold uppercase text-muted-foreground">Confiança {story.confidence}</span>
      </div>
      <StoryLine label="O que aconteceu" text={story.what} />
      <StoryLine label="Evidências" text={story.evidence} />
      <StoryLine label="Por que" text={story.why} />
      <StoryLine label="Impacto" text={story.impact} />
      <StoryLine label="O que fazer agora" text={story.action} strong />
      <p className="mt-2 text-[9px] font-semibold text-muted-foreground">Revisar: {story.review}</p>
    </article>
  );
}

function StoryLine({ label, text, strong = false }: { label: string; text: string; strong?: boolean }) {
  return (
    <p className={`mt-1 text-[10px] leading-relaxed ${strong ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
      <span className="font-bold text-foreground">{label}: </span>
      {text}
    </p>
  );
}

function ManagerialIncomeStatement({ summary }: { summary: StrategicSummary }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border text-[11px]">
      <div className="bg-muted px-3 py-2 text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Demonstração do resultado gerencial</div>
      <DreLine label="Receita operacional bruta" value={summary.revenue} strong />
      <DreLine label="Receita de hospedagem" value={summary.lodgingRevenue} indent />
      <DreLine label="Receitas acessórias" value={summary.salesRevenue} indent />
      <DreLine label="(-) Despesas operacionais" value={-summary.expenses} negative />
      <DreLine label="(=) Resultado operacional · GOP" value={summary.gop} strong highlight />
      <div className="flex items-center justify-between border-t border-border px-3 py-2">
        <span>Margem operacional</span>
        <strong className="font-mono tabular-nums">{summary.margin.toFixed(1)}%</strong>
      </div>
    </div>
  );
}

function DreLine({ label, value, strong = false, indent = false, negative = false, highlight = false }: { label: string; value: number; strong?: boolean; indent?: boolean; negative?: boolean; highlight?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 border-t border-border px-3 py-2 ${highlight ? "bg-primary/10" : ""}`}>
      <span className={`${strong ? "font-bold" : ""} ${indent ? "pl-3 text-muted-foreground" : ""}`}>{label}</span>
      <span className={`whitespace-nowrap font-mono tabular-nums ${strong ? "font-bold" : ""} ${negative || value < 0 ? "text-red-600" : ""}`}>{fmtBRL(value)}</span>
    </div>
  );
}

function DataQualityPanel({ summary, expenseRate, lodgingShare, accessoryShare }: { summary: StrategicSummary; expenseRate: number; lodgingShare: number; accessoryShare: number }) {
  const issues: Array<{ title: string; text: string; danger?: boolean }> = [];
  if (summary.revenue > 0 && summary.lodgingRevenue === 0) {
    issues.push({ title: "Receita de hospedagem zerada", text: "Há faturamento, mas ele está classificado integralmente como receita acessória. Revise a origem dos lançamentos antes de interpretar ADR, RevPAR e rentabilidade dos quartos.", danger: true });
  }
  if (summary.expenses === 0 && summary.revenue > 0) {
    issues.push({ title: "Despesas não registradas", text: "Margem de 100% não significa lucro real; indica ausência de despesas lançadas na competência.", danger: true });
  }
  if (summary.reservationCount === 0 && summary.revenue > 0) {
    issues.push({ title: "Receita sem reservas vinculadas", text: "O sistema recebeu vendas, mas não encontrou reservas no período. Isso impede cruzar receita, ocupação e diária média." });
  }
  if (!issues.length) {
    issues.push({ title: "Base coerente para leitura gerencial", text: "Receitas, despesas e reservas possuem lançamentos suficientes para os indicadores básicos do período." });
  }
  return (
    <div className="grid gap-2 md:grid-cols-2">
      <div className="grid grid-cols-2 gap-2">
        <RatioCard label="Despesas / receita" value={`${expenseRate.toFixed(1)}%`} />
        <RatioCard label="Hospedagem na receita" value={`${lodgingShare.toFixed(1)}%`} />
        <RatioCard label="Receita acessória" value={`${accessoryShare.toFixed(1)}%`} />
        <RatioCard label="Avaliação interna" value={summary.averageRating ? summary.averageRating.toFixed(1) : "—"} />
      </div>
      <div className="space-y-2">
        {issues.map((issue) => (
          <div key={issue.title} className={`rounded-lg border p-3 ${issue.danger ? "border-red-500/30 bg-red-500/5" : "border-border bg-muted/25"}`}>
            <p className="text-[10px] font-bold">{issue.title}</p>
            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{issue.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartCard({ title, subtitle, className = "", explain, children }: { title: string; subtitle: string; className?: string; explain?: string; children: ReactNode }) {
  const href = explain ? `/assistente?pergunta=${encodeURIComponent(explain)}` : "/assistente";
  return (
    <section className={`rounded-xl border border-border bg-card p-3 shadow-sm ${className}`}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold">{title}</h2>
          <p className="text-[10px] text-muted-foreground">{subtitle}</p>
        </div>
        {explain && (
          <a href={href} className="shrink-0 rounded-md border border-primary/25 bg-primary/5 px-2 py-1 text-[9px] font-bold text-primary hover:bg-primary/10">
            Explicar com IA
          </a>
        )}
      </div>
      {children}
    </section>
  );
}

function CompactPanel({ title, icon, className = "", children }: { title: string; icon: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`rounded-xl border border-border bg-card p-3 shadow-sm ${className}`}>
      <div className="mb-2 flex items-center gap-2 text-primary">
        {icon}
        <h2 className="text-sm font-bold text-foreground">{title}</h2>
      </div>
      <div className="divide-y divide-border">{children}</div>
    </section>
  );
}

function MetricLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-[10px]">
      <span className="text-muted-foreground">{label}</span>
      <strong className="text-right font-mono tabular-nums">{value}</strong>
    </div>
  );
}

function RatioCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <p className="text-[8px] font-bold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-sm font-bold tabular-nums">{value}</p>
    </div>
  );
}

function MiniKpi({ icon, label, value, hint, danger = false }: { icon: ReactNode; label: string; value: string; hint: string; danger?: boolean }) {
  return (
    <article className={`min-w-0 rounded-xl border bg-card p-2.5 shadow-sm ${danger ? "border-red-500/35" : "border-border"}`}>
      <div className={`mb-1 flex items-center gap-1.5 ${danger ? "text-red-600" : "text-primary"}`}>
        <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        <span className="truncate text-[8px] font-bold uppercase">{label}</span>
      </div>
      <p className="truncate font-mono text-sm font-bold tabular-nums">{value}</p>
      <p className="truncate text-[8px] text-muted-foreground">{hint}</p>
    </article>
  );
}

function StateCard({ title, text, danger = false }: { title: string; text: string; danger?: boolean }) {
  return (
    <div className={`rounded-xl border bg-card p-6 shadow-sm ${danger ? "border-red-500/35" : "border-border"}`}>
      <h1 className="text-lg font-bold">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function NoData() {
  return <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-dashed border-border text-xs text-muted-foreground">Sem dados suficientes no período.</div>;
}

function buildRevenueMix(data: StrategicData, summary: StrategicSummary): NumericRow[] {
  if (data.revenueMixRows?.some((row) => row.value > 0)) return normalizeShares(data.revenueMixRows);
  return normalizeShares([
    { name: "Hospedagem", value: summary.lodgingRevenue },
    { name: "Produtos e serviços", value: summary.salesRevenue },
  ]);
}

function normalizeShares(rows: NumericRow[]): NumericRow[] {
  const total = rows.reduce((sum, row) => sum + Math.max(0, Number(row.value) || 0), 0);
  return rows.map((row) => ({ ...row, value: Math.max(0, Number(row.value) || 0), share: total > 0 ? (Math.max(0, Number(row.value) || 0) / total) * 100 : 0 }));
}

function percentage(value: number, total: number) {
  return total > 0 ? (value / total) * 100 : 0;
}

function compactNumber(value: number) {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} mi`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)} mil`;
  return String(Math.round(value));
}

function compactCurrency(value: number) {
  return `R$ ${compactNumber(value)}`;
}

function buildStories({ summary, expenseRate, directShare, cancellationRate, lodgingShare, accessoryShare }: { summary: StrategicSummary; expenseRate: number; directShare: number; cancellationRate: number; lodgingShare: number; accessoryShare: number }): Story[] {
  const occupancy: Story = summary.occupancyRate >= 70
    ? {
        title: "Demanda e ocupação",
        severity: "good",
        what: `A ocupação do período está em ${summary.occupancyRate.toFixed(1)}%.`,
        evidence: `${summary.soldRoomNights} UH-noite vendidas sobre ${summary.availableRoomNights} disponíveis.`,
        why: "A demanda registrada está absorvendo boa parte da capacidade disponível.",
        impact: "Há espaço para proteger tarifa e evitar vender os últimos quartos cedo demais.",
        action: "Revisar datas de maior ocupação e testar aumento controlado de tarifa para novas reservas.",
        review: "em 48 horas",
        confidence: "alta",
      }
    : {
        title: "Demanda e ocupação",
        severity: summary.occupancyRate < 30 ? "critical" : "attention",
        what: `A ocupação do período está em ${summary.occupancyRate.toFixed(1)}%.`,
        evidence: `${summary.soldRoomNights} UH-noite vendidas sobre ${summary.availableRoomNights} disponíveis.`,
        why: summary.reservationCount === 0 ? "Não há reservas registradas no período; parte do problema pode ser ausência de lançamento." : "O ritmo de reservas está abaixo da capacidade do hotel.",
        impact: "Quartos vazios reduzem RevPAR, TRevPAR e diluem menos os custos fixos.",
        action: "Separar datas fracas, reforçar WhatsApp e venda direta e criar oferta com prazo, sem reduzir toda a tabela.",
        review: "em 7 dias",
        confidence: summary.reservationCount === 0 ? "baixa" : "média",
      };

  const margin: Story = summary.expenses === 0 && summary.revenue > 0
    ? {
        title: "Rentabilidade e custos",
        severity: "critical",
        what: `O painel mostra margem de ${summary.margin.toFixed(1)}%, mas não há despesas registradas.`,
        evidence: `Receita de ${fmtBRL(summary.revenue)} e despesas de ${fmtBRL(summary.expenses)}.`,
        why: "A margem está artificialmente alta por falta de lançamentos, não necessariamente por ganho de eficiência.",
        impact: "Decisões de preço, investimento ou retirada de lucro podem ser tomadas sobre um resultado incompleto.",
        action: "Registrar despesas fixas e variáveis da competência antes de avaliar lucro e GOPPAR.",
        review: "antes do fechamento mensal",
        confidence: "alta",
      }
    : {
        title: "Rentabilidade e custos",
        severity: summary.margin < 20 ? "critical" : summary.margin < 35 ? "attention" : "good",
        what: `A margem operacional está em ${summary.margin.toFixed(1)}%.`,
        evidence: `Despesas representam ${expenseRate.toFixed(1)}% da receita; GOP de ${fmtBRL(summary.gop)}.`,
        why: expenseRate > 75 ? "A estrutura de custos está consumindo a maior parte do faturamento." : "A relação entre receita e despesas está preservando resultado operacional.",
        impact: summary.margin < 20 ? "Pouca folga para cancelamentos, manutenção e variação de demanda." : "Há capacidade maior de reinvestimento e proteção de caixa.",
        action: expenseRate > 75 ? "Abrir as três maiores categorias de despesa, identificar recorrência e definir meta de redução." : "Manter controle por categoria e comparar com o mês anterior.",
        review: "no próximo fechamento",
        confidence: "alta",
      };

  const mix: Story = summary.revenue > 0 && summary.lodgingRevenue === 0
    ? {
        title: "Composição da receita",
        severity: "critical",
        what: "Toda a receita do período aparece como acessória e a hospedagem está zerada.",
        evidence: `Hospedagem ${lodgingShare.toFixed(1)}% · acessórios ${accessoryShare.toFixed(1)}%.`,
        why: "Provável classificação incorreta ou ausência de reservas vinculadas às receitas.",
        impact: "ADR, RevPAR, desempenho por quarto e comparação entre hospedagem e consumo ficam distorcidos.",
        action: "Revisar a origem dos lançamentos e separar diárias, produtos e serviços antes de usar o painel para preço.",
        review: "imediatamente",
        confidence: "alta",
      }
    : {
        title: "Composição da receita",
        severity: accessoryShare < 5 ? "attention" : "good",
        what: `Hospedagem representa ${lodgingShare.toFixed(1)}% e receitas acessórias ${accessoryShare.toFixed(1)}%.`,
        evidence: `Receita total de ${fmtBRL(summary.revenue)}.`,
        why: accessoryShare < 5 ? "O hotel depende quase exclusivamente das diárias." : "Produtos e serviços já complementam a hospedagem.",
        impact: accessoryShare < 5 ? "Menor receita por hóspede e menor capacidade de crescer sem aumentar ocupação." : "Maior TRevPAR e melhor aproveitamento de cada estadia.",
        action: accessoryShare < 5 ? "Criar ofertas simples de consumo e serviços por estadia e acompanhar adesão." : "Identificar os itens com maior margem e oferecer no momento certo da jornada.",
        review: "em 30 dias",
        confidence: "média",
      };

  const commercial: Story = {
    title: "Canais e conversão",
    severity: directShare >= 55 ? "good" : directShare > 0 ? "attention" : "critical",
    what: `A participação identificada como venda direta está em ${directShare.toFixed(1)}%.`,
    evidence: `${summary.reservationCount} reservas e taxa de cancelamento de ${cancellationRate.toFixed(1)}%.`,
    why: directShare === 0 ? "Os canais podem não estar preenchidos ou as vendas estão concentradas em categorias não reconhecidas como diretas." : directShare < 55 ? "Intermediários e outros canais ainda possuem peso elevado." : "A base direta reduz dependência de comissão.",
    impact: directShare < 55 ? "Maior custo comercial e menor controle sobre relacionamento e recompra." : "Mais margem, dados próprios e possibilidade de fidelização.",
    action: "Padronizar os nomes dos canais, registrar WhatsApp/balcão/site e acompanhar receita líquida e cancelamento por origem.",
    review: "semanalmente",
    confidence: dataConfidence(summary.reservationCount),
  };

  return [occupancy, margin, mix, commercial];
}

function dataConfidence(count: number): "alta" | "média" | "baixa" {
  if (count >= 30) return "alta";
  if (count >= 8) return "média";
  return "baixa";
}
