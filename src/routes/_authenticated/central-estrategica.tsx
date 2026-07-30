import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BadgeDollarSign,
  BedDouble,
  Building2,
  CalendarDays,
  CircleDollarSign,
  Globe2,
  MessageSquareWarning,
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
import { useCurrentCompany } from "@/lib/data";
import { periodRange, type DashboardPeriod } from "@/lib/dashboard-utils";
import { semanticChartColor } from "@/lib/chart-colors";
import { fmtBRL, todayISO } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/central-estrategica")({
  component: CentralEstrategica,
});

type NumericRow = { name: string; value: number; share?: number };
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
};
type StrategicData = {
  summary: StrategicSummary;
  financialSeries: FinancialRow[];
  channelRows: NumericRow[];
  roomTypeRows: NumericRow[];
  expenseRows: NumericRow[];
  originRows: NumericRow[];
  complaintRows: NumericRow[];
};

function CentralEstrategica() {
  const [period, setPeriod] = useState<DashboardPeriod>("mes");
  const company = useCurrentCompany();
  const today = todayISO();
  const range = periodRange(period, today);
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
    return <StateCard title="Carregando Central Estratégica…" text="O banco está consolidando os indicadores do período." />;
  }
  if (company.error || query.error || !query.data) {
    return <StateCard title="Não foi possível carregar os indicadores" text="Confira sua conexão e tente novamente." danger />;
  }

  const data = query.data;
  const summary = data.summary;
  const directShare = data.channelRows.find((row) => row.name.toLowerCase().includes("diret"))?.share ?? 0;
  const actions = buildRecommendedActions({
    occupancy: summary.occupancyRate,
    margin: summary.margin,
    cancelled: summary.cancellations,
    noShows: summary.noShows,
    complaintsOpen: summary.openComplaints,
    directShare,
  });

  return (
    <div className="space-y-3 pb-8">
      <header className="flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Painel estratégico</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">Central Estratégica do Hotel</h1>
          <p className="mt-1 text-xs text-muted-foreground">Indicadores consolidados no banco, sem baixar o histórico completo para o navegador.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[10px] font-semibold uppercase text-muted-foreground">
            Período
            <select className="field mt-1 h-8 min-w-32 py-1 text-xs" value={period} onChange={(event) => setPeriod(event.target.value as DashboardPeriod)}>
              <option value="dia">Hoje</option>
              <option value="mes">Mês</option>
              <option value="ano">Ano</option>
            </select>
          </label>
          <div className="rounded-lg bg-primary px-4 py-2 text-primary-foreground shadow-sm">
            <p className="text-[9px] font-bold uppercase opacity-80">Resultado do período</p>
            <p className="text-lg font-bold tabular-nums">{fmtBRL(summary.gop)}</p>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
        <MiniKpi icon={<BedDouble />} label="Ocupação" value={`${summary.occupancyRate.toFixed(1)}%`} hint={`${summary.occupancyNow.toFixed(0)}% agora`} />
        <MiniKpi icon={<CalendarDays />} label="Disponíveis" value={String(summary.availableRooms)} hint={`${summary.occupiedNow} ocupados`} />
        <MiniKpi icon={<BadgeDollarSign />} label="ADR" value={fmtBRL(summary.adr)} hint={`${summary.soldRoomNights} UH vendidas`} />
        <MiniKpi icon={<TrendingUp />} label="RevPAR" value={fmtBRL(summary.revpar)} hint="por UH disponível" />
        <MiniKpi icon={<CircleDollarSign />} label="Receita" value={fmtBRL(summary.revenue)} hint="hospedagem + extras" />
        <MiniKpi icon={<WalletCards />} label="GOP" value={fmtBRL(summary.gop)} hint={`${summary.margin.toFixed(1)}% de margem`} />
        <MiniKpi icon={<AlertTriangle />} label="Cancelamentos" value={String(summary.cancellations)} hint={`${summary.noShows} no-show`} danger={summary.cancellations > 0} />
        <MiniKpi icon={<Star />} label="Avaliação" value={summary.averageRating ? summary.averageRating.toFixed(1) : "—"} hint={`${summary.feedbackCount} respostas`} />
      </section>

      <section className="grid gap-3 xl:grid-cols-12">
        <ChartCard className="xl:col-span-8" title="Receita, despesas e GOP" subtitle="Evolução do resultado no período">
          <ResponsiveContainer width="100%" height={250}>
            <ComposedChart data={data.financialSeries} margin={{ left: 4, right: 12, top: 12, bottom: 4 }}>
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
          {data.expenseRows.length ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={data.expenseRows} dataKey="value" nameKey="name" innerRadius="48%" outerRadius="76%">
                  {data.expenseRows.map((row, index) => <Cell key={row.name} fill={semanticChartColor(row.name, index)} />)}
                </Pie>
                <Tooltip formatter={(value: number) => fmtBRL(value)} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyState text="Nenhuma despesa lançada no período." />}
        </ChartCard>

        <ChartCard className="xl:col-span-4" title="Receita por canal" subtitle="Origem das reservas recebidas"><HorizontalBars rows={data.channelRows} /></ChartCard>
        <ChartCard className="xl:col-span-4" title="Receita por tipo de quarto" subtitle="Categorias com melhor resultado"><HorizontalBars rows={data.roomTypeRows} /></ChartCard>
        <ChartCard className="xl:col-span-4" title="Tarifa e concorrência" subtitle="Base pronta para integração tarifária">
          <div className="grid h-[220px] place-items-center rounded-lg border border-dashed border-border bg-muted/20 p-5 text-center">
            <div><Building2 className="mx-auto h-7 w-7 text-primary" /><p className="mt-2 text-sm font-semibold text-foreground">ADR atual: {fmtBRL(summary.adr)}</p><p className="mt-1 text-xs text-muted-foreground">Integre tarifas dos concorrentes para comparar preço, ocupação e oportunidade de reajuste.</p></div>
          </div>
        </ChartCard>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <InsightCard icon={<Users />} title="Perfil dos hóspedes">
          <StatLine label="Origem principal" value={data.originRows[0]?.name ?? "Não informada"} />
          <StatLine label="Hóspedes cadastrados" value={String(summary.clientCount)} />
          <StatLine label="Permanência média" value={`${summary.averageStay.toFixed(1)} noites`} />
          <StatLine label="Motivo da viagem" value="Pendente de cadastro estruturado" muted />
        </InsightCard>
        <InsightCard icon={<MessageSquareWarning />} title="Avaliações e reclamações">
          <StatLine label="Avaliação interna" value={summary.averageRating ? summary.averageRating.toFixed(1) : "—"} />
          <StatLine label="Reclamações abertas" value={String(summary.openComplaints)} />
          <StatLine label="Principal tema" value={data.complaintRows[0]?.name ?? "Sem ocorrências"} />
          <StatLine label="Booking / Google" value="Pendente de integração" muted />
        </InsightCard>
        <InsightCard icon={<Globe2 />} title="Ações recomendadas">
          <ul className="space-y-2">{actions.map((action) => <li key={action} className="flex gap-2 text-xs text-foreground"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" /><span>{action}</span></li>)}</ul>
        </InsightCard>
      </section>
    </div>
  );
}

function MiniKpi({ icon, label, value, hint, danger = false }: { icon: ReactNode; label: string; value: string; hint: string; danger?: boolean }) {
  return <article className="min-h-[84px] rounded-xl border border-border bg-card px-3 py-2 shadow-sm"><div className={danger ? "text-destructive" : "text-primary"}>{icon}</div><p className="mt-1 text-[10px] font-semibold uppercase text-muted-foreground">{label}</p><p className="text-lg font-bold tabular-nums text-foreground">{value}</p><p className="truncate text-[10px] text-muted-foreground">{hint}</p></article>;
}
function ChartCard({ title, subtitle, className = "", children }: { title: string; subtitle: string; className?: string; children: ReactNode }) {
  return <article className={`rounded-xl border border-border bg-card p-3 shadow-sm ${className}`}><h2 className="text-sm font-bold text-foreground">{title}</h2><p className="mb-2 text-[11px] text-muted-foreground">{subtitle}</p>{children}</article>;
}
function InsightCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return <article className="rounded-xl border border-border bg-card p-3 shadow-sm"><div className="mb-3 flex items-center gap-2 text-primary">{icon}<h2 className="text-sm font-bold text-foreground">{title}</h2></div><div className="space-y-2">{children}</div></article>;
}
function StatLine({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return <div className="flex items-start justify-between gap-3 border-b border-border/70 pb-2 text-xs last:border-0 last:pb-0"><span className="text-muted-foreground">{label}</span><span className={muted ? "text-right text-muted-foreground" : "text-right font-semibold text-foreground"}>{value}</span></div>;
}
function HorizontalBars({ rows }: { rows: NumericRow[] }) {
  if (!rows.length) return <EmptyState text="Sem dados suficientes no período." />;
  return <ResponsiveContainer width="100%" height={220}><BarChart data={rows.slice(0, 8)} layout="vertical" margin={{ left: 16, right: 18 }}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={compactCurrency} /><YAxis dataKey="name" type="category" width={92} tick={{ fontSize: 10 }} /><Tooltip formatter={(value: number) => fmtBRL(value)} /><Bar dataKey="value" name="Receita" fill="var(--primary)" radius={[0, 5, 5, 0]} /></BarChart></ResponsiveContainer>;
}
function EmptyState({ text }: { text: string }) { return <div className="grid h-[220px] place-items-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">{text}</div>; }
function StateCard({ title, text, danger = false }: { title: string; text: string; danger?: boolean }) { return <section className="rounded-xl border border-border bg-card p-6"><h1 className={danger ? "font-bold text-destructive" : "font-bold text-foreground"}>{title}</h1><p className="mt-1 text-sm text-muted-foreground">{text}</p></section>; }
function compactCurrency(value: number) { return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value); }
function buildRecommendedActions(input: { occupancy: number; margin: number; cancelled: number; noShows: number; complaintsOpen: number; directShare: number }) {
  const rows: string[] = [];
  if (input.occupancy < 45) rows.push("Ocupação baixa: reforçar venda direta e campanhas para as datas com maior disponibilidade.");
  if (input.cancelled > 0 || input.noShows > 0) rows.push("Revisar confirmação, política de cancelamento e lembretes antes do check-in.");
  if (input.margin < 25) rows.push("Margem pressionada: revisar despesas operacionais e comissões por canal.");
  if (input.directShare < 35) rows.push("Aumentar reservas diretas para reduzir dependência de canais com comissão.");
  if (input.complaintsOpen > 0) rows.push("Priorizar as reclamações abertas antes que afetem reputação e recorrência.");
  if (!rows.length) rows.push("Indicadores estáveis: acompanhar preço, ocupação futura e oportunidades de aumento de tarifa.");
  return rows.slice(0, 4);
}
