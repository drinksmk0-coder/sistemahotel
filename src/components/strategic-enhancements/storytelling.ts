import { fmtBRL } from "@/lib/format";
import type {
  ChannelData,
  DailyStoryRow,
  Story,
  StoryPeriodMetrics,
  Trend,
} from "./types";

export function trend(current: number, previous: number, higherIsBetter = true): Trend {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) {
    return { direction: "unknown", percent: null, favorable: null };
  }
  const percent = ((current - previous) / Math.abs(previous)) * 100;
  const direction = Math.abs(percent) < 0.5 ? "flat" : percent > 0 ? "up" : "down";
  return {
    direction,
    percent,
    favorable: direction === "flat" ? null : higherIsBetter ? percent > 0 : percent < 0,
  };
}

export function financialStory(
  rows: DailyStoryRow[],
  current: StoryPeriodMetrics,
  previous: StoryPeriodMetrics,
): Story {
  const gopTrend = trend(current.gop, previous.gop, true);
  const critical = biggestNegativeDay(rows);
  const headline = trendHeadline("O GOP", gopTrend, fmtBRL(current.gop));
  const why = critical
    ? `O ponto mais crítico foi ${critical.label}: receita de ${fmtBRL(critical.totalRevenue)}, despesas de ${fmtBRL(critical.expenses)} e maior gasto em ${critical.topExpenseCategory} (${fmtBRL(critical.topExpenseValue)}).`
    : "Ainda não há dias suficientes para apontar a principal mudança dentro do período.";
  const impact = current.gop >= 0
    ? `O hotel reteve ${fmtBRL(current.gop)} depois das despesas, com TRevPAR de ${fmtBRL(current.trevpar)}.`
    : `As despesas superaram as receitas em ${fmtBRL(Math.abs(current.gop))}, pressionando caixa e margem.`;
  const action = critical
    ? `Revise os lançamentos de ${critical.topExpenseCategory} em ${critical.label} e compare com reservas, hóspedes e receita de ${critical.topRevenueSource} nesse dia.`
    : "Acompanhe diariamente receita, despesas e saldo pendente antes de alterar preços ou cortar custos.";
  return {
    trend: gopTrend,
    headline,
    why,
    impact,
    action,
    confidence: rows.length >= 7 ? "alta" : rows.length >= 3 ? "média" : "baixa",
    aiPrompt: `Analise o gráfico Receita, Despesas e GOP no período. GOP atual ${fmtBRL(current.gop)}, anterior ${fmtBRL(previous.gop)}, receita ${fmtBRL(current.totalRevenue)}, despesas ${fmtBRL(current.expenses)}, TRevPAR ${fmtBRL(current.trevpar)}. Explique o que aconteceu, por que aconteceu, impacto e ação. Principal dia crítico: ${critical ? `${critical.label}, despesa ${fmtBRL(critical.expenses)}, categoria ${critical.topExpenseCategory}` : "não identificado"}.`,
  };
}

export function revenueMixStory(current: StoryPeriodMetrics, previous: StoryPeriodMetrics): Story {
  const revenueTrend = trend(current.totalRevenue, previous.totalRevenue, true);
  const parts = [
    ["Hospedagem", current.lodgingRevenue],
    ["Produtos", current.productRevenue],
    ["Serviços", current.serviceRevenue],
  ] as const;
  const leader = [...parts].sort((a, b) => b[1] - a[1])[0];
  const share = current.totalRevenue > 0 ? (leader[1] / current.totalRevenue) * 100 : 0;
  return {
    trend: revenueTrend,
    headline: trendHeadline("A receita total", revenueTrend, fmtBRL(current.totalRevenue)),
    why: `${leader[0]} respondeu por ${share.toFixed(1)}% da receita do período.`,
    impact: current.productRevenue + current.serviceRevenue > 0
      ? `Receitas adicionais somaram ${fmtBRL(current.productRevenue + current.serviceRevenue)} e elevaram o TRevPAR.`
      : "A receita depende praticamente apenas das diárias, reduzindo oportunidades de aumentar ticket por hóspede.",
    action: current.productRevenue + current.serviceRevenue > 0
      ? "Priorize os produtos e serviços com maior margem e ofereça-os antes do check-in e durante a estadia."
      : "Cadastre e venda extras como lavanderia, estacionamento, late checkout e produtos de conveniência.",
    confidence: "alta",
    aiPrompt: `Explique a composição da receita: hospedagem ${fmtBRL(current.lodgingRevenue)}, produtos ${fmtBRL(current.productRevenue)}, serviços ${fmtBRL(current.serviceRevenue)}, total ${fmtBRL(current.totalRevenue)} e TRevPAR ${fmtBRL(current.trevpar)}. Compare com o período anterior e recomende ações.`,
  };
}

export function reservationStory(current: StoryPeriodMetrics, previous: StoryPeriodMetrics): Story {
  const outstandingTrend = trend(current.outstandingShare, previous.outstandingShare, false);
  return {
    trend: outstandingTrend,
    headline: `${current.debtReservations} reserva(s) têm saldo pendente (${current.outstandingShare.toFixed(1)}% do valor reservado).`,
    why: `Foram reservados ${fmtBRL(current.grossReserved)}, recebidos ${fmtBRL(current.received)} e ainda faltam ${fmtBRL(current.outstanding)}.`,
    impact: `O saldo pendente reduz o caixa disponível e aumenta o risco de checkout sem quitação. Cancelamentos representam ${current.cancellationRate.toFixed(1)}% das reservas e ${fmtBRL(current.cancellationValue)} em valor potencial perdido.`,
    action: "Priorize cobranças das reservas com check-in mais próximo, confirme o sinal e acompanhe saldo antes do checkout.",
    confidence: "alta",
    aiPrompt: `Analise a saúde das reservas: ${current.totalReservations} reservas, ${current.cancellations} cancelamentos, valor cancelado ${fmtBRL(current.cancellationValue)}, valor reservado ${fmtBRL(current.grossReserved)}, recebido ${fmtBRL(current.received)}, saldo ${fmtBRL(current.outstanding)} e ${current.debtReservations} reservas em débito. Compare com o período anterior e indique prioridades.`,
  };
}

export function expenseStory(
  rows: DailyStoryRow[],
  current: StoryPeriodMetrics,
  previous: StoryPeriodMetrics,
): Story {
  const expenseTrend = trend(current.expenses, previous.expenses, false);
  const peak = [...rows].sort((a, b) => b.expenses - a.expenses)[0];
  return {
    trend: expenseTrend,
    headline: trendHeadline("As despesas", expenseTrend, fmtBRL(current.expenses)),
    why: peak && peak.expenses > 0
      ? `O maior gasto ocorreu em ${peak.label}: ${fmtBRL(peak.expenses)}, principalmente em ${peak.topExpenseCategory}.`
      : "Não há despesa relevante registrada no período.",
    impact: current.totalRevenue > 0
      ? `As despesas consumiram ${((current.expenses / current.totalRevenue) * 100).toFixed(1)}% da receita.`
      : "Sem receita registrada, qualquer despesa pressiona diretamente o caixa.",
    action: peak && peak.expenses > 0
      ? `Abra Despesas e confira os lançamentos de ${peak.topExpenseCategory} em ${peak.label}; diferencie gasto recorrente de ocorrência extraordinária.`
      : "Mantenha categorias e datas de despesas preenchidas para identificar causas e desperdícios.",
    confidence: rows.length ? "alta" : "baixa",
    aiPrompt: `Analise as despesas do período: total ${fmtBRL(current.expenses)}, anterior ${fmtBRL(previous.expenses)}. Maior dia: ${peak ? `${peak.label}, ${fmtBRL(peak.expenses)}, categoria ${peak.topExpenseCategory}` : "sem dados"}. Relacione com receita, GOP e ações de economia.`,
  };
}

export function channelStory(data: ChannelData): Story {
  const current = data.current;
  const previous = data.previous;
  const dependencyTrend = trend(
    current.bookingDependencyReservations,
    previous.bookingDependencyReservations,
    false,
  );
  return {
    trend: dependencyTrend,
    headline: `A Booking representa ${current.bookingDependencyReservations.toFixed(1)}% das reservas e ${current.bookingDependencyRevenue.toFixed(1)}% da receita de hospedagem.`,
    why: `Booking gerou ${fmtBRL(current.bookingRevenue)}; canais diretos geraram ${fmtBRL(current.directRevenue)}. A comissão estimada foi ${fmtBRL(current.bookingCommission)}.`,
    impact: current.bookingDependencyReservations > 60
      ? "A dependência elevada aumenta custo de aquisição e deixa o hotel mais exposto às regras da OTA."
      : "A distribuição entre OTA e canais diretos está mais equilibrada.",
    action: current.bookingDependencyReservations > 60
      ? "Use a Booking para aquisição, mas ofereça benefícios de retorno pelo WhatsApp, balcão e site, sem descumprir regras da plataforma."
      : "Preserve os canais diretos e acompanhe ticket, cancelamentos e recorrência de cada origem.",
    confidence: "alta",
    aiPrompt: `Compare Booking e venda direta: dependência por reservas ${current.bookingDependencyReservations.toFixed(1)}%, por receita ${current.bookingDependencyRevenue.toFixed(1)}%, receita Booking ${fmtBRL(current.bookingRevenue)}, direta ${fmtBRL(current.directRevenue)}, comissão estimada ${fmtBRL(current.bookingCommission)}, ticket Booking ${fmtBRL(current.bookingAverageTicket)} e direto ${fmtBRL(current.directAverageTicket)}. Compare com o período anterior e recomende ações.`,
  };
}

function biggestNegativeDay(rows: DailyStoryRow[]) {
  if (!rows.length) return undefined;
  let selected = rows[0];
  let worstChange = Number.POSITIVE_INFINITY;
  for (let index = 1; index < rows.length; index += 1) {
    const change = rows[index].gop - rows[index - 1].gop;
    if (change < worstChange) {
      worstChange = change;
      selected = rows[index];
    }
  }
  return selected;
}

function trendHeadline(label: string, value: Trend, formatted: string) {
  if (value.direction === "unknown") return `${label} ficou em ${formatted}; ainda não há base anterior para comparação.`;
  if (value.direction === "flat") return `${label} ficou estável em ${formatted}.`;
  return `${label} ${value.direction === "up" ? "subiu" : "caiu"} ${Math.abs(value.percent ?? 0).toFixed(1)}% e chegou a ${formatted}.`;
}
