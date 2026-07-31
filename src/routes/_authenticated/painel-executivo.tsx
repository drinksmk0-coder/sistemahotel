import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BadgeDollarSign,
  BedDouble,
  CircleDollarSign,
  Lightbulb,
  Megaphone,
  ShieldAlert,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
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

type Period = "dia" | "mes" | "ano";
type NumericRow = { name: string; value: number; share?: number; revenue?: number };
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
  channelRows: NumericRow[];
  expenseRows: NumericRow[];
  roomTypeRows: NumericRow[];
  productRows: { name: string; quantity: number; revenue: number }[];
};
type Range = { start: string; end: string };

type Decision = {
  priority: "alta" | "media" | "oportunidade";
  title: string;
  reason: string;
  action: string;
  impact: string;
};

function ExecutiveDashboard() {
  const [period, setPeriod] = useState<Period>("mes");
  const company = useCurrentCompany();
  const ranges = useMemo(() => comparisonRanges(period, todayISO()), [period]);

  const query = useQuery({
    queryKey: ["executive-decision-dashboard", company.data?.id, ranges.current.start, ranges.current.end],
    enabled: Boolean(company.data?.id),
    staleTime: 60_000,
    queryFn: async () => {
      const [current, previous] = await Promise.all([
        loadStrategicData(company.data!.id, ranges.current),
        loadStrategicData(company.data!.id, ranges.previous),
      ]);
      return { current, previous };
    },
  });

  if (company.isLoading || query.isLoading) {
    return <StateCard title="Preparando o painel executivo…" text="Comparando o período atual com o anterior." />;
  }
  if (company.error || query.error || !query.data) {
    return <StateCard title="Não foi possível carregar o painel" text="Confira a conexão e tente novamente." danger />;
  }

  const current = query.data.current;
  const previous = query.data.previous;
  const now = current.summary;
  const before = previous.summary;
  const trevpar = perAvailableRoom(now.revenue, now.availableRoomNights);
  const previousTrevpar = perAvailableRoom(before.revenue, before.availableRoomNights);
  const goppar = perAvailableRoom(now.gop, now.availableRoomNights);
  const previousGoppar = perAvailableRoom(before.gop, before.availableRoomNights);
  const directShare = findDirectShare(current.channelRows);
  const previousDirectShare = findDirectShare(previous.channelRows);
  const decisions = buildDecisions(current, previous);
  const topExpense = current.expenseRows[0];
  const topChannel = current.channelRows[0];

  const comparisonRows = [
    { name: "Receita", atual: now.revenue, anterior: before.revenue },
    { name: "Despesas", atual: now.expenses, anterior: before.expenses },
    { name: "GOP", atual: now.gop, anterior: before.gop },
  ];

  return (
    <div className="space-y-4 pb-10">
      <header className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Inteligência de gestão</p>
            <h1 className="mt-1 text-xl font-bold text-foreground">Painel Executivo de Decisão</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Mostra o que mudou, as causas mais prováveis e as ações prioritárias para proteger margem e aumentar lucro.
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            Comparar
            <select className="field h-9 min-w-32" value={period} onChange={(event) => setPeriod(event.target.value as Period)}>
              <option value="dia">Hoje x ontem</option>
              <option value="mes">Mês x mês anterior</option>
              <option value="ano">Ano x ano anterior</option>
            </select>
          </label>
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

      <section className="grid gap-3 xl:grid-cols-12">
        <Card className="xl:col-span-7" title="O que mudou no resultado" subtitle="Período atual comparado ao período imediatamente anterior">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={comparisonRows} margin={{ left: 8, right: 16, top: 12, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} width={68} tickFormatter={compactCurrency} />
              <Tooltip formatter={(value: number) => fmtBRL(value)} />
              <Bar dataKey="anterior" name="Período anterior" fill="var(--muted-foreground)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="atual" name="Período atual" fill="var(--primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="xl:col-span-5" title="Diagnóstico do desempenho" subtitle="Leitura automática dos principais direcionadores">
          <div className="space-y-3">
            <Diagnosis label="Receita" text={revenueDiagnosis(now, before)} />
            <Diagnosis label="Ocupação e preço" text={occupancyPriceDiagnosis(now, before)} />
            <Diagnosis label="Custos e margem" text={costDiagnosis(now, before, topExpense?.name)} />
            <Diagnosis label="Canais" text={channelDiagnosis(directShare, previousDirectShare, topChannel?.name)} />
          </div>
        </Card>
      </section>

      <section>
        <div className="mb-2 flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-primary" />
          <div>
            <h2 className="font-bold text-foreground">O que o dono deve fazer agora</h2>
            <p className="text-xs text-muted-foreground">Prioridades calculadas a partir dos indicadores disponíveis.</p>
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {decisions.map((decision) => <DecisionCard key={`${decision.title}-${decision.action}`} decision={decision} />)}
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <Card title="Dependência comercial" subtitle="Exposição a canais e comissões">
          <MetricLine label="Venda direta" value={`${directShare.toFixed(1)}%`} />
          <MetricLine label="Canal líder" value={topChannel?.name ?? "Sem dados"} />
          <MetricLine label="Variação da venda direta" value={`${signed(directShare - previousDirectShare)} p.p.`} />
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Para calcular receita líquida real por canal, registre comissão, taxa e investimento de marketing de cada origem.
          </p>
        </Card>
        <Card title="Pressão de custos" subtitle="Onde concentrar revisão e economia">
          <MetricLine label="Maior categoria" value={topExpense?.name ?? "Sem dados"} />
          <MetricLine label="Despesas / receita" value={`${percent(now.expenses, now.revenue).toFixed(1)}%`} />
          <MetricLine label="Variação das despesas" value={`${variation(now.expenses, before.expenses).toFixed(1)}%`} />
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Reduza desperdícios sem cortar itens que sustentam avaliação, recorrência e diária média.
          </p>
        </Card>
        <Card title="Riscos de receita" subtitle="Perdas que exigem acompanhamento diário">
          <MetricLine label="Cancelamentos" value={String(now.cancellations)} />
          <MetricLine label="No-show" value={String(now.noShows)} />
          <MetricLine label="Reclamações abertas" value={String(now.openComplaints)} />
          <MetricLine label="Retenção" value={`${now.retentionRate.toFixed(1)}%`} />
        </Card>
      </section>

      <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">
        Os diagnósticos indicam causas prováveis com base nos dados internos. Comissão por canal, custo por produto e investimento em marketing precisam ser registrados para calcular lucro líquido por origem e ROI com precisão.
      </p>
    </div>
  );
}

async function loadStrategicData(companyId: string, range: Range) {
  const { data, error } = await (supabase as any).rpc("dashboard_strategic_aggregates", {
    p_company_id: companyId,
    p_start: range.start,
    p_end: range.end,
  });
  if (error) throw error;
  return data as StrategicData;
}

function comparisonRanges(period: Period, today: string) {
  const currentDate = parseDate(today);
  if (period === "dia") {
    const previous = addDays(currentDate, -1);
    return { current: { start: today, end: today }, previous: { start: iso(previous), end: iso(previous) } };
  }
  if (period === "ano") {
    const year = currentDate.getUTCFullYear();
    return {
      current: { start: `${year}-01-01`, end: today },
      previous: { start: `${year - 1}-01-01`, end: `${year - 1}-${today.slice(5)}` },
    };
  }
  const year = currentDate.getUTCFullYear();
  const month = currentDate.getUTCMonth();
  const currentStart = new Date(Date.UTC(year, month, 1));
  const previousStart = new Date(Date.UTC(year, month - 1, 1));
  const elapsedDay = currentDate.getUTCDate();
  const previousEnd = new Date(Date.UTC(previousStart.getUTCFullYear(), previousStart.getUTCMonth(), elapsedDay));
  const lastPreviousDay = new Date(Date.UTC(year, month, 0));
  return {
    current: { start: iso(currentStart), end: today },
    previous: { start: iso(previousStart), end: iso(previousEnd > lastPreviousDay ? lastPreviousDay : previousEnd) },
  };
}

function buildDecisions(current: StrategicData, previous: StrategicData): Decision[] {
  const now = current.summary;
  const before = previous.summary;
  const rows: Decision[] = [];
  const revenueChange = variation(now.revenue, before.revenue);
  const expenseChange = variation(now.expenses, before.expenses);
  const occupancyChange = now.occupancyRate - before.occupancyRate;
  const adrChange = variation(now.adr, before.adr);
  const directShare = findDirectShare(current.channelRows);

  if (now.margin < 20 || expenseChange > Math.max(5, revenueChange)) {
    const category = current.expenseRows[0]?.name;
    rows.push({
      priority: "alta",
      title: "Proteger a margem operacional",
      reason: `As despesas variaram ${signed(expenseChange)}%, enquanto a receita variou ${signed(revenueChange)}%.`,
      action: category ? `Auditar imediatamente ${category}, maior categoria de despesa, e definir teto semanal.` : "Revisar as três maiores despesas e definir limites semanais por categoria.",
      impact: "Evita que crescimento de faturamento seja consumido pelo aumento de custos.",
    });
  }
  if (now.occupancyRate < 55 || occupancyChange < -5) {
    rows.push({
      priority: "alta",
      title: "Recuperar ocupação nas datas fracas",
      reason: `A ocupação está em ${now.occupancyRate.toFixed(1)}%, com variação de ${signed(occupancyChange)} p.p.`,
      action: "Identificar dias úteis com maior disponibilidade e lançar oferta segmentada para empresas, antigos hóspedes e venda direta.",
      impact: "Aumenta RevPAR usando capacidade que hoje ficaria ociosa.",
    });
  }
  if (now.occupancyRate >= 75 && adrChange <= 0) {
    rows.push({
      priority: "oportunidade",
      title: "Testar aumento de diária",
      reason: `A ocupação está forte, mas a ADR variou ${signed(adrChange)}%.`,
      action: "Elevar gradualmente a tarifa nas datas de maior procura e acompanhar conversão, RevPAR e cancelamentos.",
      impact: "Converte demanda alta em mais receita e GOPPAR sem depender de novos quartos.",
    });
  }
  if (directShare < 35) {
    rows.push({
      priority: "media",
      title: "Reduzir dependência de intermediários",
      reason: `Somente ${directShare.toFixed(1)}% da receita por canal está identificada como venda direta.`,
      action: "Criar campanha pós-checkout no WhatsApp, benefício para reserva direta e remarketing para hóspedes recorrentes.",
      impact: "Reduz comissões e aumenta a margem líquida por reserva.",
    });
  }
  if (now.cancellations + now.noShows > 0) {
    rows.push({
      priority: "media",
      title: "Diminuir perdas por cancelamento e no-show",
      reason: `${now.cancellations} cancelamentos e ${now.noShows} no-shows foram registrados no período.`,
      action: "Reforçar confirmação automática, cobrança de garantia e lembrete antes do check-in.",
      impact: "Protege receita já prevista e melhora a precisão da ocupação futura.",
    });
  }
  if (now.retentionRate < 20) {
    rows.push({
      priority: "oportunidade",
      title: "Aumentar recorrência de hóspedes",
      reason: `A taxa de retorno está em ${now.retentionRate.toFixed(1)}%.`,
      action: "Segmentar hóspedes satisfeitos e criar oferta de retorno, indicação e contato em datas especiais.",
      impact: "Aumenta receita com menor custo de aquisição.",
    });
  }
  if (now.salesRevenue <= 0) {
    rows.push({
      priority: "oportunidade",
      title: "Criar receitas acessórias",
      reason: "Não há faturamento acessório relevante no período.",
      action: "Estruturar itens como café, bebidas, day use, late checkout e experiências locais.",
      impact: "Eleva o TRevPAR sem depender apenas da diária.",
    });
  }
  if (!rows.length) {
    rows.push({
      priority: "oportunidade",
      title: "Preservar o desempenho e preparar crescimento",
      reason: "Os principais indicadores estão equilibrados no período.",
      action: "Acompanhar ocupação futura, margem, venda direta e recebíveis diariamente.",
      impact: "Mantém previsibilidade e permite agir antes que um desvio vire problema.",
    });
  }
  return rows.slice(0, 6);
}

function ComparativeKpi({ icon, label, value, current, previous, inverse = false, suffix }: { icon: ReactNode; label: string; value: string; current: number; previous: number; inverse?: boolean; suffix?: string }) {
  const delta = suffix ? current - previous : variation(current, previous);
  const improved = inverse ? delta <= 0 : delta >= 0;
  return (
    <article className="min-w-0 rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="h-4 w-4 text-primary">{icon}</span>
        <span className={`flex items-center text-[10px] font-bold ${improved ? "text-emerald-600" : "text-destructive"}`}>
          {delta >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {signed(delta)}{suffix ?? "%"}
        </span>
      </div>
      <p className="mt-2 truncate text-[9px] font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="truncate font-mono text-base font-bold tabular-nums text-foreground" title={value}>{value}</p>
      <p className="text-[9px] text-muted-foreground">contra período anterior</p>
    </article>
  );
}

function DecisionCard({ decision }: { decision: Decision }) {
  const icon = decision.priority === "alta" ? <ShieldAlert /> : decision.priority === "media" ? <AlertTriangle /> : <Megaphone />;
  return (
    <article className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className={decision.priority === "alta" ? "text-destructive" : "text-primary"}>{icon}</div>
        <div>
          <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Prioridade {decision.priority}</span>
          <h3 className="mt-0.5 font-bold text-foreground">{decision.title}</h3>
        </div>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground"><strong className="text-foreground">Por quê:</strong> {decision.reason}</p>
      <p className="mt-2 text-xs leading-relaxed text-foreground"><strong>Ação:</strong> {decision.action}</p>
      <p className="mt-2 rounded-lg bg-primary/10 px-3 py-2 text-[11px] text-foreground"><strong>Impacto esperado:</strong> {decision.impact}</p>
    </article>
  );
}

function Card({ title, subtitle, className = "", children }: { title: string; subtitle: string; className?: string; children: ReactNode }) {
  return <article className={`rounded-xl border border-border bg-card p-4 shadow-sm ${className}`}><h2 className="font-bold text-foreground">{title}</h2><p className="mb-3 text-xs text-muted-foreground">{subtitle}</p>{children}</article>;
}

function Diagnosis({ label, text }: { label: string; text: string }) {
  return <div className="rounded-lg border border-border/70 bg-muted/30 p-3"><p className="text-[9px] font-bold uppercase tracking-wider text-primary">{label}</p><p className="mt-1 text-xs leading-relaxed text-foreground">{text}</p></div>;
}

function MetricLine({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-3 border-b border-border/70 py-2 text-xs last:border-0"><span className="text-muted-foreground">{label}</span><strong className="text-right font-mono text-foreground">{value}</strong></div>;
}

function StateCard({ title, text, danger = false }: { title: string; text: string; danger?: boolean }) {
  return <section className="rounded-xl border border-border bg-card p-6"><h1 className={danger ? "font-bold text-destructive" : "font-bold text-foreground"}>{title}</h1><p className="mt-1 text-sm text-muted-foreground">{text}</p></section>;
}

function revenueDiagnosis(now: Summary, before: Summary) {
  const revenue = variation(now.revenue, before.revenue);
  const occupancy = now.occupancyRate - before.occupancyRate;
  const adr = variation(now.adr, before.adr);
  if (revenue >= 0) return `A receita cresceu ${revenue.toFixed(1)}%. A variação combina ocupação de ${signed(occupancy)} p.p. e ADR de ${signed(adr)}%.`;
  return `A receita caiu ${Math.abs(revenue).toFixed(1)}%. Os principais sinais são ocupação de ${signed(occupancy)} p.p. e ADR de ${signed(adr)}%.`;
}

function occupancyPriceDiagnosis(now: Summary, before: Summary) {
  const occupancy = now.occupancyRate - before.occupancyRate;
  const adr = variation(now.adr, before.adr);
  if (occupancy > 3 && adr < -2) return "O hotel vendeu mais quartos, mas com diária menor. Revise descontos e tarifas por canal para evitar crescimento sem margem.";
  if (occupancy < -3 && adr > 2) return "A diária aumentou enquanto a ocupação caiu. Verifique se o reajuste foi excessivo nas datas fracas.";
  if (occupancy > 3 && adr > 2) return "Ocupação e diária cresceram juntas, indicando melhora saudável de demanda e preço.";
  return "Ocupação e diária estão relativamente estáveis; concentre a análise nas datas e canais com maior desvio.";
}

function costDiagnosis(now: Summary, before: Summary, topExpense?: string) {
  const expenses = variation(now.expenses, before.expenses);
  const revenue = variation(now.revenue, before.revenue);
  if (expenses > revenue) return `As despesas cresceram mais que a receita. ${topExpense ? `${topExpense} é a maior categoria e deve ser auditada primeiro.` : "Revise as maiores categorias antes de cortar custos de forma ampla."}`;
  if (now.margin < 20) return `A margem está em ${now.margin.toFixed(1)}%, abaixo da faixa de segurança definida para o painel. Priorize desperdícios, comissões e compras.`;
  return `As despesas variaram ${signed(expenses)}% e a margem está em ${now.margin.toFixed(1)}%. A estrutura permanece administrável, mas exige acompanhamento.`;
}

function channelDiagnosis(direct: number, previousDirect: number, topChannel?: string) {
  const delta = direct - previousDirect;
  if (direct < 35) return `A venda direta representa ${direct.toFixed(1)}% e variou ${signed(delta)} p.p. ${topChannel ? `${topChannel} lidera o período.` : "Cadastre os canais para medir dependência."}`;
  return `A venda direta está em ${direct.toFixed(1)}%, com variação de ${signed(delta)} p.p. Preserve relacionamento, recompra e campanhas próprias.`;
}

function findDirectShare(rows: NumericRow[]) {
  return rows.find((row) => row.name.toLowerCase().includes("diret"))?.share ?? 0;
}
function variation(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / Math.abs(previous)) * 100;
}
function percent(value: number, total: number) { return total > 0 ? (value / total) * 100 : 0; }
function perAvailableRoom(value: number, rooms: number) { return rooms > 0 ? value / rooms : 0; }
function signed(value: number) { return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`; }
function compactCurrency(value: number) { return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value); }
function parseDate(value: string) { return new Date(`${value}T00:00:00.000Z`); }
function addDays(value: Date, amount: number) { const next = new Date(value); next.setUTCDate(next.getUTCDate() + amount); return next; }
function iso(value: Date) { return value.toISOString().slice(0, 10); }
