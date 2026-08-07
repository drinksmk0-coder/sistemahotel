import { useQuery } from "@tanstack/react-query";
import {
  BadgeDollarSign,
  BedDouble,
  CircleCheck,
  CircleX,
  Goal,
  Hotel,
  TrendingUp,
  TriangleAlert,
  UserRoundX,
} from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany } from "@/lib/data";
import { fmtBRL, todayISO } from "@/lib/format";

type ReservationRow = {
  status: string | null;
  checkin: string;
  checkout: string;
  quarto: number | string | null;
  valor_total: number | string | null;
  canal: string | null;
};

type SaleRow = { total: number | string | null };
type RoomRow = { id: string };

type GoalStatus = "success" | "warning" | "danger";

type StrategicGoal = {
  objective: string;
  question: string;
  kpi: string;
  current: string;
  target: string;
  progress: number;
  status: GoalStatus;
  action: string;
  icon: ReactNode;
};

const DIRECT_CHANNELS = ["direto", "hotel direto", "whatsapp", "formulario", "formulário", "site", "instagram", "google"];
const CANCELLED = ["cancelada", "cancelado", "cancelled", "canceled"];
const NO_SHOW = ["no-show", "noshow", "não compareceu", "nao compareceu"];

export function ExecutiveStrategyScorecard() {
  const company = useCurrentCompany();
  const today = todayISO();
  const monthStart = `${today.slice(0, 7)}-01`;
  const previousMonthEnd = addDays(monthStart, -1);
  const previousMonthStart = `${previousMonthEnd.slice(0, 7)}-01`;

  const query = useQuery({
    queryKey: ["executive-strategy-scorecard", company.data?.id, monthStart, today],
    enabled: Boolean(company.data?.id),
    staleTime: 60_000,
    queryFn: async () => {
      const companyId = company.data!.id;
      const [currentReservations, previousReservations, currentSales, previousSales, rooms] = await Promise.all([
        (supabase as any)
          .from("reservations")
          .select("status,checkin,checkout,quarto,valor_total,canal")
          .eq("company_id", companyId)
          .lte("checkin", today)
          .gte("checkout", monthStart),
        (supabase as any)
          .from("reservations")
          .select("status,checkin,checkout,quarto,valor_total,canal")
          .eq("company_id", companyId)
          .lte("checkin", previousMonthEnd)
          .gte("checkout", previousMonthStart),
        (supabase as any)
          .from("sales")
          .select("total")
          .eq("company_id", companyId)
          .gte("data", monthStart)
          .lte("data", today),
        (supabase as any)
          .from("sales")
          .select("total")
          .eq("company_id", companyId)
          .gte("data", previousMonthStart)
          .lte("data", previousMonthEnd),
        (supabase as any).from("rooms").select("id").eq("company_id", companyId),
      ]);

      const error = currentReservations.error || previousReservations.error || currentSales.error || previousSales.error || rooms.error;
      if (error) throw error;

      return {
        currentReservations: (currentReservations.data ?? []) as ReservationRow[],
        previousReservations: (previousReservations.data ?? []) as ReservationRow[],
        currentSales: (currentSales.data ?? []) as SaleRow[],
        previousSales: (previousSales.data ?? []) as SaleRow[],
        roomCount: Math.max(0, rooms.data?.length ?? 0),
      };
    },
  });

  const goals = useMemo(() => {
    if (!query.data) return [];
    return buildGoals({
      ...query.data,
      currentStart: monthStart,
      currentEnd: today,
      previousStart: previousMonthStart,
      previousEnd: previousMonthEnd,
    });
  }, [query.data, monthStart, today, previousMonthStart, previousMonthEnd]);

  if (company.isLoading || query.isLoading) {
    return <section className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">Calculando objetivos e metas…</section>;
  }

  if (company.error || query.error || !goals.length) {
    return <section className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">Não foi possível calcular a visão estratégica.</section>;
  }

  const successCount = goals.filter((goal) => goal.status === "success").length;
  const dangerCount = goals.filter((goal) => goal.status === "danger").length;

  return (
    <section data-executive-strategy className="rounded-2xl border border-border bg-card p-3 shadow-sm" aria-label="Objetivos estratégicos do hotel">
      <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Goal className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-primary">Direção estratégica</p>
            <h2 className="text-base font-black text-foreground">O que estamos tentando alcançar?</h2>
            <p className="text-xs text-muted-foreground">Cada KPI abaixo está ligado a um objetivo, uma meta e uma ação de gestão.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] font-bold">
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">{successCount} na meta</span>
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">{goals.length - successCount - dangerCount} em atenção</span>
          <span className="rounded-full bg-red-50 px-2.5 py-1 text-red-700">{dangerCount} críticos</span>
        </div>
      </div>

      <div data-executive-goal-grid className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-5">
        {goals.map((goal) => <GoalCard key={goal.kpi} goal={goal} />)}
      </div>

      <p className="mt-2 text-[10px] text-muted-foreground">
        Metas iniciais de gestão: crescimento de receita +10%, ocupação 75%, reservas diretas 60%, cancelamentos até 8% e no-show até 3%. Depois poderão ser personalizadas pelo hotel.
      </p>
    </section>
  );
}

function GoalCard({ goal }: { goal: StrategicGoal }) {
  const status = statusTheme(goal.status);
  return (
    <article data-executive-goal-card data-goal-status={goal.status} className={`flex h-full min-w-0 flex-col rounded-xl border p-3 ${status.card}`}>
      <div className="flex items-start justify-between gap-2">
        <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${status.icon}`}>{goal.icon}</div>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase ${status.badge}`}>
          {status.statusIcon}{status.label}
        </span>
      </div>

      <p className="mt-2 text-[9px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">Objetivo</p>
      <h3 className="text-sm font-black leading-tight text-foreground">{goal.objective}</h3>
      <p className="mt-1 min-h-8 text-[10px] leading-4 text-muted-foreground">{goal.question}</p>

      <div data-executive-goal-metric className="mt-2 rounded-lg border border-border/60 bg-background/90 p-2.5 shadow-sm">
        <p className="text-[9px] font-bold uppercase text-muted-foreground">KPI: {goal.kpi}</p>
        <div className="mt-1 flex items-end justify-between gap-2">
          <strong className="text-base font-black text-foreground">{goal.current}</strong>
          <span className="text-[10px] font-bold text-muted-foreground">Meta {goal.target}</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className={`h-full rounded-full ${status.progress}`} style={{ width: `${Math.max(4, Math.min(100, goal.progress))}%` }} />
        </div>
      </div>

      <div data-executive-goal-action className="mt-2 rounded-lg bg-background/70 px-2.5 py-2">
        <p className="text-[9px] font-extrabold uppercase text-muted-foreground">Ação recomendada</p>
        <p className="mt-0.5 text-[10px] font-semibold leading-4 text-foreground">{goal.action}</p>
      </div>
    </article>
  );
}

function buildGoals(input: {
  currentReservations: ReservationRow[];
  previousReservations: ReservationRow[];
  currentSales: SaleRow[];
  previousSales: SaleRow[];
  roomCount: number;
  currentStart: string;
  currentEnd: string;
  previousStart: string;
  previousEnd: string;
}): StrategicGoal[] {
  const currentRevenue = revenue(input.currentReservations, input.currentSales);
  const previousRevenue = revenue(input.previousReservations, input.previousSales);
  const revenueGrowth = percentageChange(currentRevenue, previousRevenue);

  const occupancy = occupancyRate(input.currentReservations, input.roomCount, input.currentStart, input.currentEnd);
  const directShare = reservationShare(input.currentReservations, (row) => isDirect(row.canal));
  const cancellationRate = reservationShare(input.currentReservations, (row) => includesStatus(row.status, CANCELLED));
  const noShowRate = reservationShare(input.currentReservations, (row) => includesStatus(row.status, NO_SHOW));

  return [
    {
      objective: "Aumentar a receita",
      question: "O hotel está faturando mais que no período anterior?",
      kpi: "Crescimento da receita",
      current: `${signed(revenueGrowth)}%`,
      target: "+10%",
      progress: revenueGrowth <= 0 ? 8 : (revenueGrowth / 10) * 100,
      status: highStatus(revenueGrowth, 10, 3),
      action: revenueGrowth >= 10
        ? `Meta atingida. Preserve os canais, tarifas e ofertas que geraram ${fmtBRL(currentRevenue)}.`
        : revenueGrowth > 0
          ? "O crescimento ainda está abaixo da meta. Revise tarifa média, quartos ociosos e vendas extras."
          : "Receita caiu. Compare canais, tarifas e dias de baixa procura antes de investir em divulgação.",
      icon: <BadgeDollarSign className="h-4 w-4" />,
    },
    {
      objective: "Ocupar melhor os quartos",
      question: "A estrutura disponível está sendo usada o suficiente?",
      kpi: "Taxa de ocupação",
      current: `${occupancy.toFixed(1)}%`,
      target: "75%",
      progress: (occupancy / 75) * 100,
      status: highStatus(occupancy, 75, 60),
      action: occupancy >= 75
        ? "Ocupação saudável. Proteja a diária média e evite descontos desnecessários."
        : occupancy >= 60
          ? "Concentre ofertas nos dias e categorias abaixo da média, sem reduzir todas as tarifas."
          : "Há muitos quartos ociosos. Priorize calendário de demanda, canais locais e campanhas para datas fracas.",
      icon: <BedDouble className="h-4 w-4" />,
    },
    {
      objective: "Depender menos de comissões",
      question: "As reservas estão vindo dos canais próprios do hotel?",
      kpi: "Participação de reservas diretas",
      current: `${directShare.toFixed(1)}%`,
      target: "60%",
      progress: (directShare / 60) * 100,
      status: highStatus(directShare, 60, 40),
      action: directShare >= 60
        ? "Boa participação direta. Fortaleça recompra, WhatsApp e relacionamento pós-estadia."
        : directShare >= 40
          ? "Crie benefício exclusivo para reserva direta e registre corretamente a origem de cada reserva."
          : "Dependência alta de intermediários. Reforce WhatsApp, Google, formulário e contato com hóspedes recorrentes.",
      icon: <Hotel className="h-4 w-4" />,
    },
    {
      objective: "Reduzir perdas por cancelamento",
      question: "Quanto da demanda confirmada está sendo perdida antes da chegada?",
      kpi: "Taxa de cancelamento",
      current: `${cancellationRate.toFixed(1)}%`,
      target: "≤ 8%",
      progress: inverseProgress(cancellationRate, 8),
      status: lowStatus(cancellationRate, 8, 12),
      action: cancellationRate <= 8
        ? "Taxa controlada. Continue confirmando reservas e acompanhando motivos de cancelamento."
        : cancellationRate <= 12
          ? "Atenção: classifique os motivos e reforce confirmação antes da chegada."
          : "Perda crítica. Revise políticas, garantias, origem das reservas e antecedência dos cancelamentos.",
      icon: <CircleX className="h-4 w-4" />,
    },
    {
      objective: "Diminuir no-show",
      question: "Quantos quartos ficaram bloqueados para hóspedes que não chegaram?",
      kpi: "Taxa de no-show",
      current: `${noShowRate.toFixed(1)}%`,
      target: "≤ 3%",
      progress: inverseProgress(noShowRate, 3),
      status: lowStatus(noShowRate, 3, 6),
      action: noShowRate <= 3
        ? "No-show controlado. Mantenha confirmação e lembretes próximos ao check-in."
        : noShowRate <= 6
          ? "Confirme chegada por WhatsApp e avalie garantia antecipada nas reservas de maior risco."
          : "No-show alto. Implemente confirmação obrigatória, prazo de resposta e política de garantia.",
      icon: <UserRoundX className="h-4 w-4" />,
    },
  ];
}

function revenue(reservations: ReservationRow[], sales: SaleRow[]) {
  const lodging = reservations
    .filter((row) => !includesStatus(row.status, CANCELLED) && !includesStatus(row.status, NO_SHOW))
    .reduce((sum, row) => sum + (Number(row.valor_total) || 0), 0);
  const extras = sales.reduce((sum, row) => sum + (Number(row.total) || 0), 0);
  return lodging + extras;
}

function occupancyRate(reservations: ReservationRow[], roomCount: number, start: string, end: string) {
  if (!roomCount) return 0;
  const totalDays = daysInclusive(start, end);
  const occupiedRoomNights = reservations.reduce((sum, row) => {
    if (row.quarto == null || includesStatus(row.status, CANCELLED) || includesStatus(row.status, NO_SHOW)) return sum;
    return sum + overlapDays(row.checkin, row.checkout, start, end);
  }, 0);
  return Math.min(100, (occupiedRoomNights / Math.max(1, roomCount * totalDays)) * 100);
}

function reservationShare(rows: ReservationRow[], predicate: (row: ReservationRow) => boolean) {
  if (!rows.length) return 0;
  return (rows.filter(predicate).length / rows.length) * 100;
}

function isDirect(channel: string | null) {
  const normalized = normalize(channel);
  return DIRECT_CHANNELS.some((value) => normalized.includes(value));
}

function includesStatus(status: string | null, values: string[]) {
  const normalized = normalize(status);
  return values.some((value) => normalized.includes(value));
}

function normalize(value: string | null | undefined) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function highStatus(value: number, target: number, warningFloor: number): GoalStatus {
  if (value >= target) return "success";
  if (value >= warningFloor) return "warning";
  return "danger";
}

function lowStatus(value: number, target: number, dangerFloor: number): GoalStatus {
  if (value <= target) return "success";
  if (value < dangerFloor) return "warning";
  return "danger";
}

function inverseProgress(value: number, target: number) {
  if (value <= target) return 100;
  return Math.max(4, 100 - ((value - target) / Math.max(target, 1)) * 50);
}

function statusTheme(status: GoalStatus) {
  if (status === "success") return {
    label: "Na meta",
    card: "border-emerald-200 bg-emerald-50/45",
    icon: "bg-emerald-100 text-emerald-700",
    badge: "bg-emerald-100 text-emerald-700",
    progress: "bg-emerald-500",
    statusIcon: <CircleCheck className="h-3 w-3" />,
  };
  if (status === "warning") return {
    label: "Atenção",
    card: "border-amber-200 bg-amber-50/45",
    icon: "bg-amber-100 text-amber-700",
    badge: "bg-amber-100 text-amber-700",
    progress: "bg-amber-500",
    statusIcon: <TriangleAlert className="h-3 w-3" />,
  };
  return {
    label: "Crítico",
    card: "border-red-200 bg-red-50/45",
    icon: "bg-red-100 text-red-700",
    badge: "bg-red-100 text-red-700",
    progress: "bg-red-500",
    statusIcon: <TrendingUp className="h-3 w-3 rotate-180" />,
  };
}

function percentageChange(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function daysInclusive(start: string, end: string) {
  return Math.max(1, Math.floor((date(end).getTime() - date(start).getTime()) / 86_400_000) + 1);
}

function overlapDays(checkin: string, checkout: string, start: string, end: string) {
  const overlapStart = Math.max(date(checkin).getTime(), date(start).getTime());
  const overlapEnd = Math.min(date(checkout).getTime(), addDaysDate(date(end), 1).getTime());
  return Math.max(0, Math.ceil((overlapEnd - overlapStart) / 86_400_000));
}

function signed(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}

function addDays(value: string, amount: number) {
  return addDaysDate(date(value), amount).toISOString().slice(0, 10);
}

function addDaysDate(value: Date, amount: number) {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + amount);
  return result;
}

function date(value: string) {
  return new Date(`${value}T00:00:00Z`);
}
