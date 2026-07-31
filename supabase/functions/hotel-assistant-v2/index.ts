import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RecordRow = Record<string, unknown>;
type AssistantMode = "analysis" | "reception";
type ConversationMessage = { role: "user" | "assistant"; text: string };
type ProviderFailure = { status?: number; message?: string; provider?: string };

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json({ ok: true });
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = request.headers.get("Authorization");
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: "Ambiente Supabase incompleto." }, 500);
    }
    if (!authorization) return json({ error: "Login obrigatório." }, 401);

    const body = (await request.json().catch(() => ({}))) as {
      mode?: AssistantMode;
      question?: string;
      company_id?: string;
      conversation?: ConversationMessage[];
    };
    const companyId = String(body.company_id ?? "").trim();
    const question = String(body.question ?? "").trim().slice(0, 4000);
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

    const memberRole = String(membership.role ?? "");
    if (memberRole !== "dono") {
      return json(
        { error: "O HotelAI analítico está disponível somente para o proprietário." },
        403,
      );
    }
    const mode: AssistantMode = body.mode === "reception" ? "reception" : "analysis";
    const context = await loadContext(admin, companyId, question, memberRole, mode);
    const deterministic = deterministicAnswer(question, context, memberRole);
    if (deterministic) {
      return json({
        answer: deterministic,
        mode,
        source: "system",
        provider: "local",
        generated_at: new Date().toISOString(),
        privacy: "Resposta calculada localmente; nenhum dado foi enviado ao provedor de IA.",
      });
    }

    const conversation = normalizeConversation(body.conversation).map((message) => ({
      role: message.role,
      text: redactPersonalData(message.text),
    }));
    const prompt = [
      `PERGUNTA ATUAL:\n${redactPersonalData(question)}`,
      `HISTÓRICO RECENTE:\n${JSON.stringify(conversation)}`,
      `CONTEXTO OFICIAL DO SISTEMA:\n${JSON.stringify(context)}`,
    ].join("\n\n");
    const instructions = buildSystemPrompt(mode, String(context.reception_rules ?? ""));

    let failure: ProviderFailure | null = null;
    const geminiKey =
      Deno.env.get("GEMINI_API_KEY")?.trim() ||
      Deno.env.get("GOOGLE_GENERATIVE_AI_API_KEY")?.trim() ||
      (await loadGeminiKey(admin));
    if (geminiKey) {
      for (const model of geminiModels()) {
        const result = await callGemini(geminiKey, model, instructions, prompt);
        if (result.answer) {
          return json({
            answer: result.answer,
            mode,
            source: "ai",
            provider: "gemini",
            model,
            generated_at: new Date().toISOString(),
            privacy: "Somente dados agregados e memória sanitizada foram enviados.",
          });
        }
        failure = { status: result.status, message: result.message, provider: "gemini" };
        if (result.status === 401 || result.status === 403) break;
      }
    }

    const openAiKey = Deno.env.get("OPENAI_API_KEY")?.trim();
    const openAiModel = Deno.env.get("OPENAI_MODEL")?.trim();
    if (openAiKey && openAiModel) {
      const result = await callOpenAI(openAiKey, openAiModel, instructions, prompt);
      if (result.answer) {
        return json({
          answer: result.answer,
          mode,
          source: "ai",
          provider: "openai",
          model: openAiModel,
          generated_at: new Date().toISOString(),
          privacy: "Somente dados agregados e memória sanitizada foram enviados.",
        });
      }
      failure = { status: result.status, message: result.message, provider: "openai" };
    }

    return json({
      answer: offlineAnswer(question, context, failure),
      mode,
      source: "system",
      provider: "local",
      degraded: true,
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

async function loadContext(
  admin: ReturnType<typeof createClient>,
  companyId: string,
  question: string,
  memberRole: string,
  mode: AssistantMode,
) {
  const wantsAvailability = /\b(disponibilidade|disponivel|quarto livre|reservar|reserva para|fim de semana)\b/i.test(question);
  const wantsWater = /\b(relatorio|relatório|consumo|quantidade|total)\b/i.test(question) && /\b(agua|água)\b/i.test(question);
  const [company, snapshot, integrations, checkins, receptionRules, memory, availability, water, pending] =
    await Promise.all([
      loadCompany(admin, companyId),
      loadSnapshot(admin, companyId),
      loadIntegrations(admin, companyId),
      loadCheckinSummary(admin, companyId),
      loadReceptionInstructions(admin, companyId),
      memberRole === "dono" && mode === "analysis"
        ? loadMemory(admin, companyId)
        : Promise.resolve([]),
      wantsAvailability
        ? loadAvailability(admin, companyId, question)
        : Promise.resolve({ consulted: false }),
      wantsWater && memberRole === "dono"
        ? loadWaterSummary(admin, companyId, question)
        : Promise.resolve({ consulted: false }),
      loadPendingSummary(admin, companyId),
    ]);

  return {
    company,
    hotel_snapshot: snapshot,
    integrations,
    checkin_online: checkins,
    reception_rules: receptionRules,
    ai_memory: memory,
    availability,
    water_consumption: water,
    pending_operations: pending,
    rules: {
      checkin: "O check-in pode ocorrer com pagamento zero ou parcial; presença e pagamento são estados diferentes.",
      checkout: "O check-out comum exige saldo quitado. A exceção é faturamento empresarial identificado, que permanece em contas a receber.",
      overdue_departure: "Após o horário previsto de saída, a hospedagem vira saída pendente e o quarto segue para limpeza; a dívida não é apagada.",
      memory: "A memória é contexto persistente da empresa, não treinamento do modelo. Dados transacionais atuais prevalecem sobre a memória.",
    },
  };
}

async function loadCompany(admin: ReturnType<typeof createClient>, companyId: string) {
  const { data } = await admin
    .from("companies")
    .select("nome,slug,cidade,estado")
    .eq("id", companyId)
    .maybeSingle();
  return data ?? {};
}

async function loadSnapshot(admin: ReturnType<typeof createClient>, companyId: string) {
  const { data, error } = await admin.rpc("get_hotel_ai_snapshot", { p_company_id: companyId });
  return error ? { unavailable: true, reason: error.message } : data ?? {};
}

async function loadIntegrations(admin: ReturnType<typeof createClient>, companyId: string) {
  const { data, error } = await admin
    .from("company_integrations")
    .select("tipo,nome,ativo,updated_at")
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false });
  return error ? [] : data ?? [];
}

async function loadCheckinSummary(admin: ReturnType<typeof createClient>, companyId: string) {
  const { data, error } = await admin
    .from("guest_checkins")
    .select("status,submitted_at,reviewed_at,mtur_status,signature_data_url,updated_at")
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false })
    .limit(30);
  if (error) return { unavailable: true };
  const rows = data ?? [];
  return {
    total: rows.length,
    submitted: rows.filter((row) => Boolean(row.submitted_at)).length,
    signed: rows.filter((row) => Boolean(row.signature_data_url)).length,
    awaiting_review: rows.filter((row) => row.submitted_at && !row.reviewed_at).length,
    by_status: rows.reduce((acc: Record<string, number>, row) => {
      const key = String(row.status ?? "sem_status");
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
  };
}

async function loadReceptionInstructions(admin: ReturnType<typeof createClient>, companyId: string) {
  const { data } = await admin
    .from("company_integrations")
    .select("configuracao")
    .eq("company_id", companyId)
    .eq("tipo", "recepcao_virtual_ia")
    .eq("ativo", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const config = isRecord(data?.configuracao) ? data.configuracao : {};
  return String(config.instructions ?? DEFAULT_RECEPTION_PROMPT).slice(0, 12000);
}

async function loadMemory(admin: ReturnType<typeof createClient>, companyId: string) {
  const { data, error } = await admin
    .from("company_ai_memory")
    .select("category,title,content,updated_at")
    .eq("company_id", companyId)
    .eq("active", true)
    .order("updated_at", { ascending: false })
    .limit(40);
  if (error) return [];
  let used = 0;
  return (data ?? []).flatMap((row) => {
    if (used >= 18000) return [];
    const content = redactPersonalData(String(row.content ?? "")).slice(0, 3000);
    used += content.length;
    return [{
      category: row.category,
      title: redactPersonalData(String(row.title ?? "")).slice(0, 120),
      content,
      updated_at: row.updated_at,
      authority: "Contexto fornecido pelo proprietário; dados atuais do banco prevalecem.",
    }];
  });
}

async function loadPendingSummary(admin: ReturnType<typeof createClient>, companyId: string) {
  const { data, error } = await admin
    .from("reservations")
    .select("status,checkout,valor_total,valor_pago,billing_responsibility,billing_status,billing_due_date")
    .eq("company_id", companyId)
    .in("status", ["ocupado", "saida_pendente", "finalizado"])
    .limit(1000);
  if (error) return { unavailable: true };
  const rows = data ?? [];
  return {
    pending_departures: rows.filter((row) => row.status === "saida_pendente").length,
    company_receivables: rows.filter((row) =>
      row.billing_responsibility === "company" && ["pending", "overdue"].includes(String(row.billing_status)),
    ).length,
    overdue_company_receivables: rows.filter((row) => row.billing_status === "overdue").length,
    estimated_open_balance: rows.reduce(
      (sum, row) => sum + Math.max(0, Number(row.valor_total) - Number(row.valor_pago)),
      0,
    ),
  };
}

async function loadAvailability(admin: ReturnType<typeof createClient>, companyId: string, question: string) {
  const period = extractPeriod(question, false);
  if (!period || period.end <= period.start) {
    return { consulted: false, reason: "Informe check-in e check-out." };
  }
  const { data, error } = await admin.rpc("get_hotel_room_availability", {
    _company_id: companyId,
    _checkin: period.start,
    _checkout: period.end,
  });
  if (error) return { consulted: false, reason: error.message };
  const rooms = Array.isArray(data) ? data : [];
  return {
    consulted: true,
    checkin: period.start,
    checkout: period.end,
    count: rooms.length,
    rooms: rooms.slice(0, 30),
  };
}

async function loadWaterSummary(admin: ReturnType<typeof createClient>, companyId: string, question: string) {
  const period = extractPeriod(question, true)!;
  const { data, error } = await admin
    .from("sales")
    .select("data,quarto,item,categoria,qtd,valor_unit,total,valor_pago,status")
    .eq("company_id", companyId)
    .gte("data", period.start)
    .lte("data", period.end)
    .or("item.ilike.%agua%,item.ilike.%água%,categoria.ilike.%agua%,categoria.ilike.%água%")
    .order("data", { ascending: true })
    .limit(2000);
  if (error) return { consulted: false, reason: error.message, period };
  const rows = data ?? [];
  const quantity = rows.reduce((sum, row) => sum + Math.max(0, Number(row.qtd)), 0);
  const total = rows.reduce((sum, row) => sum + Math.max(0, Number(row.total)), 0);
  const paid = rows.reduce((sum, row) => sum + Math.max(0, Number(row.valor_pago)), 0);
  return {
    consulted: true,
    period,
    lines: rows.length,
    quantity,
    total,
    paid,
    pending: Math.max(0, total - paid),
    rooms: new Set(rows.map((row) => row.quarto)).size,
    details: rows.slice(0, 60).map((row) => ({
      date: row.data,
      room: row.quarto,
      item: row.item,
      quantity: row.qtd,
      unit_value: row.valor_unit,
      total: row.total,
      status: row.status,
    })),
    detailed_report_path: "/relatorio-consumo-agua",
    document_type: "Espelho de consumo; não é nota fiscal.",
  };
}

function deterministicAnswer(question: string, context: RecordRow, memberRole: string) {
  const value = normalize(question);
  const water = isRecord(context.water_consumption) ? context.water_consumption : {};
  const availability = isRecord(context.availability) ? context.availability : {};
  const pending = isRecord(context.pending_operations) ? context.pending_operations : {};

  if (/\b(agua|água)\b/.test(value) && /\b(relatorio|consumo|quantidade|total|imprimir)\b/.test(value)) {
    if (memberRole !== "dono") return "O relatório de consumo de água é restrito ao proprietário.";
    if (!water.consulted) return `Não consegui consolidar o consumo de água: ${water.reason ?? "dados indisponíveis"}.`;
    const details = Array.isArray(water.details) ? water.details : [];
    const lines = details.slice(0, 20).map((entry) => {
      const row = isRecord(entry) ? entry : {};
      return `• ${formatDate(String(row.date))} · UH ${row.room ?? "—"} · ${row.item ?? "Água"} · ${row.quantity ?? 0} un. · ${formatMoney(Number(row.total))}`;
    });
    return [
      "# Relatório de consumo de água",
      `**Período:** ${formatDate(String((water.period as RecordRow)?.start))} a ${formatDate(String((water.period as RecordRow)?.end))}`,
      `**Quantidade:** ${Number(water.quantity ?? 0).toLocaleString("pt-BR")} unidade(s)`,
      `**Valor total:** ${formatMoney(Number(water.total))}`,
      `**Pago:** ${formatMoney(Number(water.paid))}`,
      `**Pendente:** ${formatMoney(Number(water.pending))}`,
      `**Quartos com lançamento:** ${Number(water.rooms ?? 0)}`,
      "",
      ...lines,
      details.length > 20 ? `\nMais ${details.length - 20} lançamento(s) estão no relatório detalhado.` : "",
      "",
      "Abra **Relatório de água** no menu para informar a empresa pagadora, ver hóspedes e imprimir/salvar em PDF.",
      "Este documento é um espelho gerencial de consumo e não substitui nota fiscal.",
    ].filter(Boolean).join("\n");
  }

  if (/\b(disponibilidade|quarto livre|quartos livres)\b/.test(value) && availability.consulted) {
    const rooms = Array.isArray(availability.rooms) ? availability.rooms : [];
    const labels = rooms.slice(0, 20).map((entry) => {
      const row = isRecord(entry) ? entry : {};
      return row.numero ?? row.quarto ?? row.room;
    }).filter(Boolean);
    return [
      `Disponibilidade de ${availability.checkin} a ${availability.checkout}: **${availability.count ?? 0} quarto(s)**.`,
      labels.length ? `UH disponíveis: ${labels.join(", ")}.` : "",
      "Confirme a reserva em **Reservas → Nova reserva**.",
    ].filter(Boolean).join("\n");
  }

  if (/\b(check ?in|entrada do hospede)\b/.test(value)) {
    return "O check-in pode ser realizado com pagamento zero ou parcial. Abra **Reservas**, localize a reserva e clique em **Check-in**; o saldo continuará visível na conta.";
  }
  if (/\b(check ?out|saida do hospede|faturar empresa)\b/.test(value)) {
    return [
      "No check-out comum, a conta precisa estar quitada.",
      "Quando uma empresa pagará depois, use **Faturar empresa**, informe empresa, documento, contato e vencimento. A saída é concluída, mas o saldo permanece em contas a receber.",
      `Saídas aguardando conferência agora: **${Number(pending.pending_departures ?? 0)}**.`,
    ].join("\n");
  }
  if (/\b(memoria|memória|lembrar|conhecimento)\b/.test(value) && /\b(onde|como|cadastrar|alimentar|salvar)\b/.test(value)) {
    return "Abra **Memória do HotelAI**. Cadastre regras e conhecimentos da empresa sem CPF, cartões, senhas ou documentos de hóspedes. Essa memória fornece contexto; não treina o modelo externo.";
  }
  if (/\b(onde|como|abrir|imprimir)\b/.test(value) && /\b(relatorio de agua|relatório de água)\b/.test(value)) {
    return "Abra **Relatório de água** no menu. Escolha o período e o hóspede, informe a empresa pagadora e clique em **Imprimir / salvar PDF**.";
  }
  return "";
}

function offlineAnswer(question: string, context: RecordRow, failure: ProviderFailure | null) {
  const pending = isRecord(context.pending_operations) ? context.pending_operations : {};
  const reason = failure?.status === 429
    ? "O provedor atingiu o limite temporário."
    : failure?.status && failure.status >= 500
      ? "O provedor está temporariamente indisponível."
      : "O provedor externo não respondeu.";
  return [
    reason,
    `Saídas pendentes: ${Number(pending.pending_departures ?? 0)}.`,
    `Contas empresariais a receber: ${Number(pending.company_receivables ?? 0)}.`,
    "Os relatórios de água, disponibilidade, check-in, check-out e navegação continuam funcionando localmente.",
    `Pergunta recebida: ${redactPersonalData(question).slice(0, 300)}`,
  ].join("\n");
}

function buildSystemPrompt(mode: AssistantMode, receptionRules: string) {
  const common = `Você é o HotelAI do sistema HospedaMais. Responda em português do Brasil.
Use o CONTEXTO OFICIAL como fonte de verdade. Dados atuais do banco sempre prevalecem sobre ai_memory.
Ai_memory é contexto persistente fornecido pelo proprietário, não treinamento do modelo e não prova uma transação.
Nunca invente reservas, pagamentos, valores, pessoas, documentos ou integrações.
Não revele dados pessoais. Explique claramente quando um dado estiver ausente.
Check-in pode ocorrer sem quitação. Check-out comum exige quitação; faturamento empresarial é a exceção e permanece a receber.
Para análises: o que aconteceu, por que aconteceu, como afeta e o que fazer agora.`;
  if (mode === "analysis") return `${common}\nPriorize dados agregados, evidências, ações e nível de confiança.`;
  return `${common}\nAtue como recepção cordial e objetiva. Use estas instruções da empresa:\n${receptionRules}`;
}

function extractPeriod(question: string, defaultMonth: boolean) {
  const dates = question.match(/\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b/g) ?? [];
  const normalized = dates.map(normalizeDate).filter((value): value is string => Boolean(value));
  if (normalized.length >= 2) return { start: normalized[0], end: normalized[1] };
  if (!defaultMonth) return null;
  const today = todayLocal();
  return { start: `${today.slice(0, 7)}-01`, end: today };
}

function normalizeDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = value.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (!match) return undefined;
  const year = match[3]
    ? match[3].length === 2 ? `20${match[3]}` : match[3]
    : todayLocal().slice(0, 4);
  return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function todayLocal() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function loadGeminiKey(admin: ReturnType<typeof createClient>) {
  const { data } = await admin.rpc("get_hotel_gemini_api_key");
  return typeof data === "string" ? data.trim() : "";
}

function geminiModels() {
  return [...new Set([
    Deno.env.get("GEMINI_MODEL")?.trim(),
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
  ].filter((value): value is string => Boolean(value)))];
}

async function callGemini(apiKey: string, model: string, instructions: string, prompt: string) {
  try {
    const response = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: instructions }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 4096 },
        }),
      },
      22000,
    );
    const payload = (await response.json().catch(() => ({}))) as RecordRow;
    if (!response.ok) return { status: response.status, message: nestedString(payload, ["error", "message"]) };
    const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
    const answer = candidates.flatMap((candidate) => {
      const content = isRecord(candidate) && isRecord(candidate.content) ? candidate.content : {};
      return Array.isArray(content.parts) ? content.parts : [];
    }).map((part) => isRecord(part) ? String(part.text ?? "") : "").filter(Boolean).join("\n").trim();
    return { answer, status: answer ? 200 : 502, message: answer ? "" : "Resposta vazia." };
  } catch (error) {
    return { status: 503, message: error instanceof Error ? error.message : String(error) };
  }
}

async function callOpenAI(apiKey: string, model: string, instructions: string, prompt: string) {
  try {
    const response = await fetchWithTimeout(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, instructions, input: prompt, max_output_tokens: 4096 }),
      },
      22000,
    );
    const payload = (await response.json().catch(() => ({}))) as RecordRow;
    if (!response.ok) return { status: response.status, message: nestedString(payload, ["error", "message"]) };
    if (typeof payload.output_text === "string") return { answer: payload.output_text.trim(), status: 200 };
    const output = Array.isArray(payload.output) ? payload.output : [];
    const answer = output.flatMap((item) => isRecord(item) && Array.isArray(item.content) ? item.content : [])
      .map((item) => isRecord(item) ? String(item.text ?? "") : "").filter(Boolean).join("\n").trim();
    return { answer, status: answer ? 200 : 502, message: answer ? "" : "Resposta vazia." };
  } catch (error) {
    return { status: 503, message: error instanceof Error ? error.message : String(error) };
  }
}

function normalizeConversation(value: unknown): ConversationMessage[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((row) => ({
    role: row.role === "assistant" ? "assistant" as const : "user" as const,
    text: String(row.text ?? "").slice(0, 2000),
  })).filter((row) => row.text.trim()).slice(-12);
}

function redactPersonalData(value: string) {
  return value
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[e-mail removido]")
    .replace(/\b(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}\b/g, "[telefone removido]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[CPF removido]")
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}[\/]?\d{4}-?\d{2}\b/g, "[CNPJ removido]")
    .slice(0, 4000);
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function formatMoney(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: string) {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value || "—";
}

function nestedString(payload: RecordRow, path: string[]) {
  let current: unknown = payload;
  for (const key of path) {
    if (!isRecord(current)) return "";
    current = current[key];
  }
  return typeof current === "string" ? current : "";
}

function isRecord(value: unknown): value is RecordRow {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const DEFAULT_RECEPTION_PROMPT = `Atenda com cordialidade e objetividade.
Confirme no sistema antes de informar disponibilidade, preço, pagamento ou status.
O check-in pode ocorrer com saldo pendente. O check-out comum exige quitação; faturamento empresarial exige empresa identificada.
Nunca invente Pix, links, valores ou dados pessoais.`;
