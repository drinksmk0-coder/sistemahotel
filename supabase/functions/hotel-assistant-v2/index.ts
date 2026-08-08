import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RecordRow = Record<string, unknown>;
type ConversationMessage = { role: "user" | "assistant"; text: string };
type QueryResult = { data: any; error: any };

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json({ ok: true });
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || serviceRoleKey;
    const authorization = request.headers.get("Authorization");

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return json({ error: "Ambiente Supabase incompleto." }, 500);
    }
    if (!authorization) return json({ error: "Login obrigatório." }, 401);

    const body = (await request.json().catch(() => ({}))) as {
      question?: string;
      company_id?: string;
      mode?: "analysis" | "reception";
      conversation?: ConversationMessage[];
    };
    const companyId = String(body.company_id ?? "").trim();
    const question = String(body.question ?? "").trim().slice(0, 4000);
    const mode = body.mode === "reception" ? "reception" : "analysis";

    if (!companyId) return json({ error: "Empresa não informada." }, 400);
    if (!question) return json({ error: "Escreva uma pergunta." }, 400);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const jwt = authorization.replace(/^Bearer\s+/i, "");
    const { data: authData, error: authError } = await admin.auth.getUser(jwt);
    if (authError || !authData.user) return json({ error: "Sessão inválida." }, 401);

    const { data: membership, error: membershipError } = await admin
      .from("company_members")
      .select("role")
      .eq("company_id", companyId)
      .eq("user_id", authData.user.id)
      .eq("ativo", true)
      .maybeSingle();

    if (membershipError) return json({ error: membershipError.message }, 500);
    if (!membership) return json({ error: "Acesso negado a esta empresa." }, 403);
    if (String(membership.role) !== "dono") {
      return json({ error: "O HotelAI analítico está disponível somente para o proprietário." }, 403);
    }

    const context = await loadOwnerContext(admin, companyId, question, mode);
    const localAnswer = deterministicAnswer(question, context);
    if (localAnswer) {
      return json({
        answer: localAnswer,
        mode,
        source: "system",
        provider: "local",
        generated_at: new Date().toISOString(),
        privacy: "Resposta calculada localmente; nenhum dado pessoal foi enviado a um provedor.",
      });
    }

    const safeConversation = normalizeConversation(body.conversation).map((message) => ({
      role: message.role,
      text: redactPersonalData(message.text),
    }));
    const safeQuestion = redactPersonalData(question);
    const memoryContext = ownerMemoryConversation(context);
    const historyContext = historicalConversation(context);

    const upstream = await fetch(`${supabaseUrl}/functions/v1/hotel-assistant`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: authorization,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        company_id: companyId,
        mode,
        question: safeQuestion,
        conversation: [...safeConversation, ...memoryContext, ...historyContext].slice(-12),
      }),
    });

    const payload = (await upstream.json().catch(() => ({}))) as {
      answer?: string;
      error?: string;
      provider?: string;
      model?: string;
      degraded?: boolean;
    };

    const trustworthyUpstreamAnswer =
      upstream.ok &&
      payload.answer &&
      (mode === "reception" || (payload.degraded !== true && payload.provider !== "local"));

    if (trustworthyUpstreamAnswer) {
      return json({
        ...payload,
        answer: payload.answer,
        mode,
        gateway: "hotel-assistant-v2",
        owner_only: true,
        privacy:
          "Acesso restrito ao proprietário; memória e histórico agregados/sanitizados foram usados como contexto.",
      });
    }

    console.warn("hotel-assistant-v2 upstream degraded", {
      status: upstream.status,
      provider: payload.provider ?? "unknown",
      model: payload.model ?? "unknown",
      degraded: payload.degraded === true,
    });

    return json({
      answer: localExecutiveAnswer(question, context, payload.error),
      mode,
      source: "system",
      provider: "local",
      degraded: true,
      owner_only: true,
      generated_at: new Date().toISOString(),
      privacy: "Resposta local; os dados do hotel permaneceram preservados.",
    });
  } catch (error) {
    console.error("hotel-assistant-v2", error);
    return json(
      {
        error: "Não foi possível concluir a consulta.",
        detail: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});

async function loadOwnerContext(
  admin: ReturnType<typeof createClient>,
  companyId: string,
  question: string,
  mode: "analysis" | "reception",
) {
  const asksWater = /\b(agua|água)\b/i.test(question);
  const analysis = mode === "analysis";
  const emptyOne = () => Promise.resolve({ data: null, error: null } as QueryResult);
  const emptyMany = () => Promise.resolve({ data: [], error: null } as QueryResult);

  const [
    companyResult,
    snapshotResult,
    memoryResult,
    pendingResult,
    waterResult,
    historyProfileResult,
    monthResult,
    weekdayResult,
    monthYearResult,
    channelResult,
    roomTypeResult,
    bookingMonthResult,
    bookingLeadResult,
    dailyResult,
  ] = await Promise.all([
    admin.from("companies").select("nome,slug,cidade,estado").eq("id", companyId).maybeSingle(),
    admin.rpc("get_hotel_ai_snapshot", { p_company_id: companyId }),
    analysis
      ? admin
          .from("company_ai_memory")
          .select("category,title,content,updated_at")
          .eq("company_id", companyId)
          .eq("active", true)
          .order("updated_at", { ascending: false })
          .limit(40)
      : emptyMany(),
    admin
      .from("reservations")
      .select("status,checkout,valor_total,valor_pago,billing_responsibility,billing_status,billing_due_date")
      .eq("company_id", companyId)
      .in("status", ["ocupado", "saida_pendente", "finalizado"])
      .limit(1000),
    asksWater
      ? admin
          .from("sales")
          .select("data,quarto,item,categoria,qtd,valor_unit,total,valor_pago,status")
          .eq("company_id", companyId)
          .or("item.ilike.%agua%,item.ilike.%água%,categoria.ilike.%agua%,categoria.ilike.%água%")
          .order("data", { ascending: false })
          .limit(2000)
      : emptyMany(),
    analysis
      ? admin.from("analytics_forecast_profile").select("*").eq("company_id", companyId).maybeSingle()
      : emptyOne(),
    analysis
      ? admin.from("analytics_month_pattern").select("month_no,average_rooms,average_occupancy,factor,sample_days,source").eq("company_id", companyId).order("month_no")
      : emptyMany(),
    analysis
      ? admin.from("analytics_weekday_pattern").select("weekday,average_rooms,average_occupancy,sample_days,source").eq("company_id", companyId).order("weekday")
      : emptyMany(),
    analysis
      ? admin.from("analytics_month_year_pattern").select("year_no,month_no,sample_days,room_nights,reservation_count,guest_count,average_rooms,average_occupancy,source").eq("company_id", companyId).order("year_no", { ascending: false }).order("month_no", { ascending: false }).limit(24)
      : emptyMany(),
    analysis
      ? admin.from("analytics_channel_pattern").select("channel,reservation_count,room_nights,guest_count,share,source").eq("company_id", companyId).order("room_nights", { ascending: false })
      : emptyMany(),
    analysis
      ? admin.from("analytics_room_type_history_pattern").select("room_type,room_nights,reservation_count,guest_count,share,source").eq("company_id", companyId).order("room_nights", { ascending: false })
      : emptyMany(),
    analysis
      ? admin.from("analytics_booking_month_pattern").select("year_no,month_no,total_reservations,ok_count,cancelled_count,no_show_count,rooms,room_nights,original_amount,final_amount,commission_amount,average_lead_days,source").eq("company_id", companyId).order("year_no", { ascending: false }).order("month_no", { ascending: false }).limit(18)
      : emptyMany(),
    analysis
      ? admin.from("analytics_booking_leadtime_profile").select("sample_reservations,average_lead_days,median_lead_days,p25_lead_days,p75_lead_days,p90_lead_days,cancellation_rate,no_show_rate,booking_adr,source,updated_at").eq("company_id", companyId).maybeSingle()
      : emptyOne(),
    analysis
      ? admin.from("analytics_daily_history").select("stay_date,occupied_rooms,occupancy_rate,checkins,checkouts,booking_rooms,direct_rooms,whatsapp_rooms,form_rooms").eq("company_id", companyId).order("stay_date", { ascending: false }).limit(90)
      : emptyMany(),
  ]);

  const pendingRows = pendingResult.data ?? [];
  const waterRows = waterResult.data ?? [];
  const memory = (memoryResult.data ?? []).map((row: RecordRow) => ({
    category: row.category,
    title: redactPersonalData(String(row.title ?? "")).slice(0, 120),
    content: redactPersonalData(String(row.content ?? "")).slice(0, 3000),
    updated_at: row.updated_at,
  }));

  const dailyRows = dailyResult.data ?? [];
  const dailySummary = dailyRows.length
    ? {
        sample_days: dailyRows.length,
        from: dailyRows[dailyRows.length - 1]?.stay_date ?? null,
        to: dailyRows[0]?.stay_date ?? null,
        average_occupancy: avg(dailyRows.map((row: RecordRow) => Number(row.occupancy_rate))),
        average_rooms: avg(dailyRows.map((row: RecordRow) => Number(row.occupied_rooms))),
        booking_room_nights: dailyRows.reduce((sum: number, row: RecordRow) => sum + Number(row.booking_rooms ?? 0), 0),
        direct_room_nights: dailyRows.reduce((sum: number, row: RecordRow) => sum + Number(row.direct_rooms ?? 0), 0),
      }
    : null;

  return {
    company: companyResult.data ?? {},
    hotel_snapshot: snapshotResult.error
      ? { unavailable: true, reason: snapshotResult.error.message }
      : snapshotResult.data ?? {},
    ai_memory: memory,
    historical_analytics: analysis
      ? {
          profile: historyProfileResult.error ? null : historyProfileResult.data,
          months: monthResult.error ? [] : monthResult.data ?? [],
          weekdays: weekdayResult.error ? [] : weekdayResult.data ?? [],
          recent_month_year: monthYearResult.error ? [] : monthYearResult.data ?? [],
          channels: channelResult.error ? [] : channelResult.data ?? [],
          room_types: roomTypeResult.error ? [] : roomTypeResult.data ?? [],
          booking_months: bookingMonthResult.error ? [] : bookingMonthResult.data ?? [],
          booking_leadtime: bookingLeadResult.error ? null : bookingLeadResult.data,
          daily_summary: dailySummary,
          rule:
            "Dados live do banco governam a operação atual; histórico analítico serve para sazonalidade, previsão e comparação. Não usar histórico agregado para afirmar que uma reserva individual existe hoje.",
        }
      : {},
    pending_operations: {
      pending_departures: pendingRows.filter((row: RecordRow) => row.status === "saida_pendente").length,
      company_receivables: pendingRows.filter(
        (row: RecordRow) =>
          row.billing_responsibility === "company" &&
          ["pending", "overdue"].includes(String(row.billing_status)),
      ).length,
      overdue_company_receivables: pendingRows.filter((row: RecordRow) => row.billing_status === "overdue").length,
      estimated_open_lodging_balance: pendingRows.reduce(
        (sum: number, row: RecordRow) => sum + Math.max(0, Number(row.valor_total) - Number(row.valor_pago)),
        0,
      ),
    },
    water_consumption: {
      consulted: asksWater,
      lines: waterRows.length,
      quantity: waterRows.reduce((sum: number, row: RecordRow) => sum + Math.max(0, Number(row.qtd)), 0),
      total: waterRows.reduce((sum: number, row: RecordRow) => sum + Math.max(0, Number(row.total)), 0),
      paid: waterRows.reduce((sum: number, row: RecordRow) => sum + Math.max(0, Number(row.valor_pago)), 0),
      rooms: new Set(waterRows.map((row: RecordRow) => row.quarto)).size,
      details: waterRows.slice(0, 60),
      report_path: "/relatorio-consumo-agua",
      document_type: "Espelho de consumo de água — não é nota fiscal",
    },
    rules: {
      checkin: "O check-in pode ocorrer com pagamento zero ou parcial; presença e pagamento são estados diferentes.",
      checkout: "O check-out comum exige quitação. A exceção é faturamento empresarial identificado, que permanece a receber.",
      overdue_departure: "Após o horário previsto de saída, a hospedagem vira saída pendente e o quarto segue para limpeza; a dívida não é apagada.",
      memory: "A memória é contexto persistente da empresa, não treinamento do modelo. Dados atuais do banco prevalecem.",
    },
  };
}

function deterministicAnswer(question: string, context: RecordRow) {
  const value = normalize(question);
  const water = asRecord(context.water_consumption);
  const pending = asRecord(context.pending_operations);

  if (/\b(agua|água)\b/.test(value) && /\b(relatorio|consumo|quantidade|total|imprimir)\b/.test(value)) {
    const quantity = Number(water.quantity ?? 0);
    const total = Number(water.total ?? 0);
    const paid = Number(water.paid ?? 0);
    return [
      "# Relatório de consumo de água",
      `**Quantidade registrada:** ${quantity.toLocaleString("pt-BR")} unidade(s)`,
      `**Valor total:** ${formatMoney(total)}`,
      `**Pago:** ${formatMoney(paid)}`,
      `**Pendente:** ${formatMoney(Math.max(0, total - paid))}`,
      `**Quartos com lançamento:** ${Number(water.rooms ?? 0)}`,
      "",
      "Abra **Relatório de água** no menu para filtrar o período, informar a empresa pagadora e imprimir ou salvar em PDF.",
      "Este documento é um espelho gerencial de consumo e não substitui nota fiscal.",
    ].join("\n");
  }

  if (/\b(check ?in|entrada do hospede|entrada do hóspede)\b/.test(value)) {
    return "O check-in pode ser realizado com pagamento zero ou parcial. O saldo continuará visível na conta e nos recebíveis.";
  }

  if (/\b(check ?out|saida do hospede|saída do hóspede|faturar empresa)\b/.test(value)) {
    return [
      "O check-out comum exige a conta quitada.",
      "Quando a empresa pagará depois, use **Faturar empresa** e informe empresa, documento, contato e vencimento.",
      `Saídas aguardando conferência: ${Number(pending.pending_departures ?? 0)}.`,
      `Contas empresariais a receber: ${Number(pending.company_receivables ?? 0)}.`,
    ].join("\n");
  }

  if (/\b(memoria|memória)\b/.test(value) && /\b(onde|como|salvar|alimentar|cadastrar)\b/.test(value)) {
    return "Abra **Memória do HotelAI**. Registre regras e conhecimentos da empresa sem CPF, cartões, senhas ou documentos de hóspedes. A memória fornece contexto e não treina o modelo externo.";
  }

  if (isHistoricalQuestion(value)) {
    const answer = localHistoricalAnswer(question, context);
    if (answer) return answer;
  }

  return "";
}

function isHistoricalQuestion(value: string) {
  return /\b(sazonal|sazonalidade|previs|forecast|ocupacao|ocupação|adr|diaria|diária|demanda|pickup|booking|alta temporada|baixa temporada|mes mais|mês mais|meses mais|meses menos)\b/.test(value);
}

function localHistoricalAnswer(question: string, context: RecordRow) {
  const history = asRecord(context.historical_analytics);
  const profile = asRecord(history.profile);
  const months = arrayOfRecords(history.months);
  const weekdays = arrayOfRecords(history.weekdays);
  const booking = asRecord(history.booking_leadtime);
  if (!months.length && !Object.keys(profile).length && !Object.keys(booking).length) return "";

  const rankedMonths = [...months].sort((a, b) => Number(b.average_occupancy) - Number(a.average_occupancy));
  const rankedWeekdays = [...weekdays].sort((a, b) => Number(b.average_occupancy) - Number(a.average_occupancy));
  const value = normalize(question);
  const lines = ["# Leitura histórica do Hotel Real", ""];

  if (profile.history_start && profile.history_end) {
    lines.push(
      `**Cobertura:** ${formatDate(String(profile.history_start))} a ${formatDate(String(profile.history_end))} (${Number(profile.history_days ?? 0).toLocaleString("pt-BR")} dias; ${Number(profile.room_capacity ?? 0)} UHs históricas).`,
    );
  }

  if (months.length) {
    const high = rankedMonths.slice(0, 3).map((row) => `${monthName(Number(row.month_no))} ${pct(row.average_occupancy)}`).join(", ");
    const low = rankedMonths.slice(-3).reverse().map((row) => `${monthName(Number(row.month_no))} ${pct(row.average_occupancy)}`).join(", ");
    lines.push(`**Meses historicamente mais fortes:** ${high}.`);
    lines.push(`**Meses historicamente mais fracos:** ${low}.`);
  }

  if (weekdays.length) {
    lines.push(
      `**Dia mais forte:** ${weekdayName(Number(rankedWeekdays[0]?.weekday))} ${pct(rankedWeekdays[0]?.average_occupancy)}; **mais fraco:** ${weekdayName(Number(rankedWeekdays[rankedWeekdays.length - 1]?.weekday))} ${pct(rankedWeekdays[rankedWeekdays.length - 1]?.average_occupancy)}.`,
    );
  }

  if (/booking|pickup|janela|antecedencia|antecedência/.test(value) && Object.keys(booking).length) {
    lines.push(
      `**Booking:** amostra ${Number(booking.sample_reservations ?? 0)}; antecedência mediana ${num(booking.median_lead_days)} dias, média ${num(booking.average_lead_days)} dias, P75 ${num(booking.p75_lead_days)} dias e P90 ${num(booking.p90_lead_days)} dias.`,
      `**Risco histórico Booking:** cancelamento ${pctRatio(booking.cancellation_rate)}, no-show ${pctRatio(booking.no_show_rate)}; ADR das reservas OK ${formatMoney(Number(booking.booking_adr ?? 0))}.`,
    );
  }

  lines.push(
    "",
    "**Como usar:** dados live governam reservas/ocupação atuais; este histórico serve para previsão, sazonalidade e comparação. Uma previsão deve combinar padrão histórico + reservas já confirmadas + calendário/eventos + preço/canal.",
    "**Confiança:** alta para padrão histórico de ocupação; moderada para diária fora dos períodos em que há receita detalhada.",
  );
  return lines.join("\n");
}

function historicalConversation(context: RecordRow): ConversationMessage[] {
  const history = asRecord(context.historical_analytics);
  const profile = asRecord(history.profile);
  const months = arrayOfRecords(history.months);
  if (!months.length && !Object.keys(profile).length) return [];

  const weekdays = arrayOfRecords(history.weekdays);
  const channels = arrayOfRecords(history.channels).slice(0, 5);
  const roomTypes = arrayOfRecords(history.room_types).slice(0, 4);
  const recent = arrayOfRecords(history.recent_month_year).slice(0, 8);
  const booking = asRecord(history.booking_leadtime);

  const parts: string[] = [
    "HISTÓRICO ANALÍTICO SANITIZADO (agregado, sem PII):",
    `Regra: ${String(history.rule ?? "Use histórico para previsão e live para operação atual.")}`,
  ];
  if (profile.history_start) {
    parts.push(
      `Cobertura ${profile.history_start}–${profile.history_end}; ${profile.history_days} dias; ${profile.room_capacity} UHs; média ${num(profile.average_occupied_rooms)} quartos/dia.`,
    );
  }
  if (months.length) {
    parts.push(`Ocupação por mês: ${months.map((r) => `${monthShort(Number(r.month_no))} ${pct(r.average_occupancy)}`).join("; ")}.`);
  }
  if (weekdays.length) {
    parts.push(`Dias: ${weekdays.map((r) => `${weekdayShort(Number(r.weekday))} ${pct(r.average_occupancy)}`).join("; ")}.`);
  }
  if (channels.length) {
    parts.push(`Canais por room-night: ${channels.map((r) => `${r.channel} ${pctRatio(r.share)}`).join("; ")}.`);
  }
  if (roomTypes.length) {
    parts.push(`UHs/tipos principais: ${roomTypes.map((r) => `${r.room_type} ${pctRatio(r.share)}`).join("; ")}.`);
  }
  if (Object.keys(booking).length) {
    parts.push(
      `Booking: n=${booking.sample_reservations}; lead med ${num(booking.median_lead_days)}d, média ${num(booking.average_lead_days)}d, P75 ${num(booking.p75_lead_days)}d, P90 ${num(booking.p90_lead_days)}d; canc ${pctRatio(booking.cancellation_rate)}; no-show ${pctRatio(booking.no_show_rate)}; ADR OK ${formatMoney(Number(booking.booking_adr ?? 0))}.`,
    );
  }
  if (recent.length) {
    parts.push(`Meses/anos recentes: ${recent.map((r) => `${r.month_no}/${r.year_no} ${pct(r.average_occupancy)}`).join("; ")}.`);
  }

  return [{ role: "assistant", text: parts.join("\n").slice(0, 1900) }];
}

function ownerMemoryConversation(context: RecordRow): ConversationMessage[] {
  const memory = Array.isArray(context.ai_memory) ? context.ai_memory : [];
  if (!memory.length) return [];
  const summary = memory
    .slice(0, 6)
    .map((item) => {
      const row = asRecord(item);
      return `${String(row.title ?? "Regra")}: ${String(row.content ?? "").slice(0, 1200)}`;
    })
    .join("\n");
  return [{ role: "assistant", text: `MEMÓRIA SANITIZADA DA EMPRESA:\n${summary}`.slice(0, 2000) }];
}

function localExecutiveAnswer(question: string, context: RecordRow, upstreamError?: string) {
  if (isHistoricalQuestion(normalize(question))) {
    const historical = localHistoricalAnswer(question, context);
    if (historical) return historical;
  }
  const pending = asRecord(context.pending_operations);
  const snapshot = asRecord(context.hotel_snapshot);
  const flattened = flattenSnapshot(snapshot);
  const metrics = [
    metricLine(flattened, "Receita contratada de hospedagem", ["reservations_contracted_revenue", "lodgingRevenue", "lodging_revenue"], "money"),
    metricLine(flattened, "Receita de hospedagem recebida", ["reservations_paid_revenue"], "money"),
    metricLine(flattened, "Despesas", ["expenses_total", "expenses", "despesas"], "money"),
    metricLine(flattened, "GOP / resultado operacional", ["gop", "resultado_operacional"], "money"),
    metricLine(flattened, "Ocupação", ["occupancyRate", "occupancy_rate", "ocupacao"], "percent"),
    metricLine(flattened, "ADR / diária média", ["reservations_average_daily_rate", "adr", "diaria_media"], "money"),
    metricLine(flattened, "RevPAR", ["revpar"], "money"),
    metricLine(flattened, "Reservas", ["reservations_total", "reservationCount", "reservation_count", "reservas"], "number"),
    metricLine(flattened, "Avaliação média", ["reviews_average_overall", "averageRating", "average_rating"], "number"),
  ].filter(Boolean) as string[];

  return [
    "# HotelAI — análise executiva",
    "",
    "## Evidências atuais",
    metrics.length ? metrics.join("\n") : "O snapshot atual não disponibilizou indicadores suficientes. Não vou inventar valores.",
    "",
    "## Pendências operacionais",
    `- Saídas pendentes: ${Number(pending.pending_departures ?? 0)}.`,
    `- Contas empresariais a receber: ${Number(pending.company_receivables ?? 0)}.`,
    upstreamError ? `\n**Provedor externo:** indisponível nesta tentativa; a análise local permaneceu ativa.` : "",
    "",
    "**Confiança:** alta nos valores exibidos; hipóteses dependem da comparação com histórico e contexto externo.",
  ].join("\n");
}

function flattenSnapshot(value: unknown, result = new Map<string, unknown>(), prefix = "") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  for (const [key, child] of Object.entries(value as RecordRow)) {
    const normalizedKey = normalizeKey(key);
    const path = prefix ? `${prefix}_${normalizedKey}` : normalizedKey;
    result.set(path, child);
    if (!result.has(normalizedKey)) result.set(normalizedKey, child);
    if (child && typeof child === "object" && !Array.isArray(child)) flattenSnapshot(child, result, path);
  }
  return result;
}

function metricLine(values: Map<string, unknown>, label: string, aliases: string[], format: "money" | "percent" | "number") {
  let found: unknown;
  for (const alias of aliases.map(normalizeKey)) {
    if (values.has(alias)) { found = values.get(alias); break; }
  }
  const number = Number(found);
  if (found == null || found === "" || Number.isNaN(number)) return "";
  const formatted = format === "money" ? formatMoney(number) : format === "percent" ? `${number.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : number.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return `- **${label}:** ${formatted}`;
}

function normalizeConversation(value: unknown): ConversationMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is RecordRow => Boolean(item) && typeof item === "object")
    .map((item) => ({
      role: item.role === "assistant" ? ("assistant" as const) : ("user" as const),
      text: String(item.text ?? "").slice(0, 2000),
    }))
    .filter((item) => item.text.trim())
    .slice(-12);
}

function redactPersonalData(value: string) {
  return value
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[e-mail removido]")
    .replace(/\b(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}\b/g, "[telefone removido]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[CPF removido]")
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}[\/]?\d{4}-?\d{2}\b/g, "[CNPJ removido]")
    .slice(0, 4000);
}

function normalizeKey(value: string) {
  return normalize(value).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function asRecord(value: unknown): RecordRow {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordRow) : {};
}

function arrayOfRecords(value: unknown): RecordRow[] {
  return Array.isArray(value) ? value.filter((x): x is RecordRow => Boolean(x) && typeof x === "object" && !Array.isArray(x)) : [];
}

function avg(values: number[]) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0;
}

function num(value: unknown) {
  const n = Number(value ?? 0);
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

function pct(value: unknown) {
  const n = Number(value ?? 0);
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function pctRatio(value: unknown) {
  const n = Number(value ?? 0) * 100;
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function monthName(month: number) {
  return ["", "janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"][month] ?? String(month);
}

function monthShort(month: number) {
  return ["", "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][month] ?? String(month);
}

function weekdayName(day: number) {
  return ["", "segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"][day] ?? String(day);
}

function weekdayShort(day: number) {
  return ["", "seg", "ter", "qua", "qui", "sex", "sáb", "dom"][day] ?? String(day);
}

function formatDate(value: string) {
  const [y, m, d] = value.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : value;
}

function formatMoney(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
