import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, BadgeDollarSign, BedDouble, ShieldCheck, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmtBRL } from "@/lib/format";

type Range = { start: string; end: string };
type NamedValue = { name: string; value: number };
type Summary = {
  revenue: number;
  expenses: number;
  gop: number;
  margin: number;
  occupancyRate: number;
  adr: number;
  revpar: number;
};
type StrategicPayload = {
  summary?: Partial<Summary>;
  channelRows?: NamedValue[];
  roomTypeRows?: NamedValue[];
  expenseRows?: NamedValue[];
};

type CommandCenterProps = {
  companyId?: string;
  range: Range | null;
};

export function ExecutiveCommandCenter({ companyId, range }: CommandCenterProps) {
  const previousRange = range ? previousSameLength(range) : null;
  const query = useQuery({
    queryKey: ["executive-command-center", companyId, range?.start, range?.end],
    enabled: Boolean(companyId && range && previousRange),
    staleTime: 60_000,
    queryFn: async () => {
      const [currentResult, previousResult] = await Promise.all([
        (supabase as any).rpc("dashboard_strategic_aggregates", {
          p_company_id: companyId,
          p_start: range!.start,
          p_end: range!.end,
        }),
        (supabase as any).rpc("dashboard_strategic_aggregates", {
          p_company_id: companyId,
          p_start: previousRange!.start,
          p_end: previousRange!.end,
        }),
      ]);
      if (currentResult.error) throw currentResult.error;
      if (previousResult.error) throw previousResult.error;
      return {
        current: currentResult.data as StrategicPayload,
        previous: previousResult.data as StrategicPayload,
      };
    },
  });

  if (!companyId || !range || query.isLoading) {
    return <div className="h-24 animate-pulse rounded-xl border border-border bg-card" />;
  }
  if (query.error || !query.data) return null;

  const now = normalizeSummary(query.data.current.summary);
  const before = normalizeSummary(query.data.previous.summary);
  const revenueDelta = variation(now.revenue, before.revenue);
  const occupancyDelta = now.occupancyRate - before.occupancyRate;
  const adrDelta = variation(now.adr, before.adr);
  const revparDelta = variation(now.revpar, before.revpar);
  const missingCosts = now.revenue > 0 && now.expenses === 0;
  const topChannel = firstNamed(query.data.current.channelRows);
  const topRoom = firstNamed(query.data.current.roomTypeRows);
  const health = buildHealth(now, revenueDelta, occupancyDelta, revparDelta, missingCosts);
  const priority = buildPriority(now, revenueDelta, occupancyDelta, adrDelta, missingCosts);
  const opportunity = buildOpportunity(now, revenueDelta, occupancyDelta, adrDelta, topChannel, topRoom);

  return (
    <section className="command-center rounded-xl border border-border bg-card p-3 shadow-sm" aria-label="Resumo executivo do hotel">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-primary">Command Center</p>
          <h2 className="text-base font-black text-pine-dark">O que o gestor precisa saber agora</h2>
        </div>
        <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-extrabold ${health.classes}`}>
          <ShieldCheck className="h-3.5 w-3.5" />
          {health.label} · {health.score}/100
        </span>
      </div>

      <div className="grid gap-2 md:grid-cols-4">
        <CommandCard
          icon={<BadgeDollarSign />}
          label="Resultado"
          value={`${fmtBRL(now.revenue)} em receita`}
          detail={`Receita ${signed(revenueDelta)}% · RevPAR ${signed(revparDelta)}%`}
          tone={revenueDelta >= 0 ? "positive" : "warning"}
        />
        <CommandCard
          icon={<BedDouble />}
          label="Demanda"
          value={`${now.occupancyRate.toFixed(1)}% de ocupação`}
          detail={`${signed(occupancyDelta)} p.p. · ADR ${fmtBRL(now.adr)}`}
          tone={occupancyDelta >= 0 ? "positive" : "warning"}
        />
        <CommandCard
          icon={<AlertTriangle />}
          label="Prioridade do dia"
          value={priority.title}
          detail={priority.detail}
          tone={priority.tone}
        />
        <CommandCard
          icon={<Sparkles />}
          label="Oportunidade"
          value={opportunity.title}
          detail={opportunity.detail}
          tone="neutral"
        />
      </div>

      <div className="mt-3 flex flex-col gap-2 rounded-lg border border-primary/15 bg-primary/5 px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <strong className="text-pine-dark">Ação recomendada:</strong>{" "}
          <span className="text-muted-foreground">{priority.action}</span>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 font-extrabold text-primary">
          Decisão orientada por dados <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </section>
  );
}

function CommandCard({ icon, label, value, detail, tone }: { icon: React.ReactNode; label: string; value: string; detail: string; tone: "positive" | "warning" | "critical" | "neutral" }) {
  const classes = {
    positive: "border-emerald-200 bg-emerald-50/70 text-emerald-800",
    warning: "border-amber-200 bg-amber-50/70 text-amber-900",
    critical: "border-rose-200 bg-rose-50/70 text-rose-900",
    neutral: "border-primary/15 bg-primary/5 text-primary",
  }[tone];
  return (
    <article className={`min-w-0 rounded-lg border p-3 ${classes}`}>
      <div className="mb-2 flex items-center gap-2">
        <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        <span className="text-[9px] font-extrabold uppercase tracking-wide">{label}</span>
      </div>
      <strong className="block text-sm leading-tight text-pine-dark">{value}</strong>
      <span className="mt-1 block text-[10px] font-semibold opacity-80">{detail}</span>
    </article>
  );
}

function buildHealth(now: Summary, revenueDelta: number, occupancyDelta: number, revparDelta: number, missingCosts: boolean) {
  let score = 50;
  score += clamp(revenueDelta / 3, -18, 18);
  score += clamp(occupancyDelta * 1.4, -15, 15);
  score += clamp(revparDelta / 4, -12, 12);
  if (now.occupancyRate >= 70) score += 8;
  if (missingCosts) score -= 18;
  score = Math.round(clamp(score, 0, 100));
  if (missingCosts) return { score, label: "Dados incompletos", classes: "border-amber-200 bg-amber-50 text-amber-900" };
  if (score >= 72) return { score, label: "Hotel saudável", classes: "border-emerald-200 bg-emerald-50 text-emerald-800" };
  if (score >= 48) return { score, label: "Acompanhar", classes: "border-primary/20 bg-primary/5 text-primary" };
  return { score, label: "Atenção", classes: "border-rose-200 bg-rose-50 text-rose-900" };
}

function buildPriority(now: Summary, revenueDelta: number, occupancyDelta: number, adrDelta: number, missingCosts: boolean) {
  if (missingCosts) return { title: "Cadastrar despesas", detail: "GOP e margem não são confiáveis", action: "Lançar os custos do período antes de decidir sobre lucro ou economia.", tone: "critical" as const };
  if (occupancyDelta < -5 && adrDelta < 0) return { title: "Recuperar demanda", detail: "Ocupação e diária caíram juntas", action: "Revisar canais, disponibilidade, campanhas e preço dos próximos sete dias.", tone: "critical" as const };
  if (revenueDelta < -10) return { title: "Reagir à queda de receita", detail: `${signed(revenueDelta)}% contra o período anterior`, action: "Separar o efeito de ocupação, ADR e canal para definir a correção principal.", tone: "warning" as const };
  if (now.occupancyRate >= 80 && adrDelta <= 0) return { title: "Aumentar diária média", detail: "Alta ocupação com ADR sem avanço", action: "Testar aumento moderado de tarifa nas datas e quartos com maior procura.", tone: "positive" as const };
  return { title: "Preservar desempenho", detail: "Sem desvio crítico detectado", action: "Monitorar diariamente ocupação, ADR, RevPAR e custos para agir antes da queda.", tone: "neutral" as const };
}

function buildOpportunity(now: Summary, revenueDelta: number, occupancyDelta: number, adrDelta: number, channel?: NamedValue, room?: NamedValue) {
  if (now.occupancyRate >= 75 && adrDelta < 5) return { title: "Revenue management", detail: "Há espaço para testar tarifa maior" };
  if (room) return { title: `Priorizar ${room.name}`, detail: "É o tipo de quarto com maior receita" };
  if (channel) return { title: `Fortalecer ${channel.name}`, detail: "É o canal com maior contribuição" };
  if (revenueDelta > 0 && occupancyDelta > 0) return { title: "Escalar o que funcionou", detail: "Receita e demanda avançaram juntas" };
  return { title: "Melhorar cadastro", detail: "Complete canais, perfil e origem para gerar recomendações melhores" };
}

function normalizeSummary(value?: Partial<Summary>): Summary {
  return {
    revenue: Number(value?.revenue) || 0,
    expenses: Number(value?.expenses) || 0,
    gop: Number(value?.gop) || 0,
    margin: Number(value?.margin) || 0,
    occupancyRate: Number(value?.occupancyRate) || 0,
    adr: Number(value?.adr) || 0,
    revpar: Number(value?.revpar) || 0,
  };
}
function firstNamed(rows?: NamedValue[]) { return rows?.find((row) => row.value > 0); }
function previousSameLength(range: Range): Range { const start = parseDate(range.start); const end = parseDate(range.end); const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1); const previousEnd = new Date(start); previousEnd.setUTCDate(previousEnd.getUTCDate() - 1); const previousStart = new Date(previousEnd); previousStart.setUTCDate(previousStart.getUTCDate() - days + 1); return { start: iso(previousStart), end: iso(previousEnd) }; }
function parseDate(value: string) { return new Date(`${value}T00:00:00Z`); }
function iso(date: Date) { return date.toISOString().slice(0, 10); }
function variation(current: number, previous: number) { if (previous === 0) return current === 0 ? 0 : 100; return ((current - previous) / Math.abs(previous)) * 100; }
function signed(value: number) { return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`; }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
