import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RecordRow = Record<string, unknown>;
type ConversationMessage = { role: "user" | "assistant"; text: string };

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
    const question = String(body.question ?? "")
      .trim()
      .slice(0, 4000);
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
      return json(
        { error: "O HotelAI analítico está disponível somente para o proprietário." },
        403,
      );
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
    // Envie somente a pergunta real para o classificador do assistente-base.
    // Antes, o snapshot era concatenado à pergunta; palavras como "reserva" dentro
    // do contexto faziam perguntas analíticas (ex.: "como está o hotel?") virarem
    // indevidamente um tutorial de reservas.
    const memoryContext = ownerMemoryConversation(context);

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
        conversation: [...safeConversation, ...memoryContext].slice(-12),
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
          "Acesso restrito ao proprietário; memória sanitizada e dados agregados foram usados como contexto.",
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
  const [companyResult, snapshotResult, memoryResult, pendingResult] = await Promise.all([
    admin.from("companies").select("nome,slug,cidade,estado").eq("id", companyId).maybeSingle(),
    admin.rpc("get_hotel_ai_snapshot", { p_company_id: companyId }),
    mode === "analysis"
      ? admin
          .from("company_ai_memory")
          .select("category,title,content,updated_at")
          .eq("company_id", companyId)
          .eq("active", true)
          .order("updated_at", { ascending: false })
          .limit(40)
      : Promise.resolve({ data: [], error: null }),
    admin
      .from("reservations")
      .select(
        "status,checkout,valor_total,valor_pago,billing_responsibility,billing_status,billing_due_date",
      )
      .eq("company_id", companyId)
      .in("status", ["ocupado", "saida_pendente", "finalizado"])
      .limit(1000),
  ]);

  const pendingRows = pendingResult.data ?? [];
  const memory = (memoryResult.data ?? []).map((row) => ({
    category: row.category,
    title: redactPersonalData(String(row.title ?? "")).slice(0, 120),
    content: redactPersonalData(String(row.content ?? "")).slice(0, 3000),
    updated_at: row.updated_at,
  }));

  return {
    company: companyResult.data ?? {},
    hotel_snapshot: snapshotResult.error
      ? { unavailable: true, reason: snapshotResult.error.message }
      : (snapshotResult.data ?? {}),
    ai_memory: memory,
    pending_operations: {
      pending_departures: pendingRows.filter((row) => row.status === "saida_pendente").length,
      company_receivables: pendingRows.filter(
        (row) =>
          row.billing_responsibility === "company" &&
          ["pending", "overdue"].includes(String(row.billing_status)),
      ).length,
      overdue_company_receivables: pendingRows.filter((row) => row.billing_status === "overdue")
        .length,
      estimated_open_lodging_balance: pendingRows.reduce(
        (sum, row) => sum + Math.max(0, Number(row.valor_total) - Number(row.valor_pago)),
        0,
      ),
    },
    water_consumption: {
      requires_corporate_account: true,
      report_path: "/relatorio-consumo-agua",
      rule: "O relatório exige uma empresa cadastrada e inclui somente funcionários vinculados. Hóspedes comuns nunca entram.",
      document_type: "Relatório empresarial de consumo de água — não é nota fiscal",
    },
    rules: {
      checkin:
        "O check-in pode ocorrer com pagamento zero ou parcial; presença e pagamento são estados diferentes.",
      checkout:
        "O check-out comum exige quitação. A exceção é faturamento empresarial identificado, que permanece a receber.",
      overdue_departure:
        "Após o horário previsto de saída, a hospedagem vira saída pendente e o quarto segue para limpeza; a dívida não é apagada.",
      memory:
        "A memória é contexto persistente da empresa, não treinamento do modelo. Dados atuais do banco prevalecem.",
    },
  };
}

function deterministicAnswer(question: string, context: RecordRow) {
  const value = normalize(question);
  const pending = asRecord(context.pending_operations);

  if (
    /\b(agua|água)\b/.test(value) &&
    /\b(relatorio|consumo|quantidade|total|imprimir)\b/.test(value)
  ) {
    return [
      "# Relatório empresarial de consumo de água",
      "",
      "Abra **Relatório de água**, selecione uma empresa cadastrada e o período.",
      "O sistema mostrará somente o consumo dos funcionários vinculados à empresa selecionada. Hóspedes comuns nunca entram no relatório.",
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

  if (
    /\b(memoria|memória)\b/.test(value) &&
    /\b(onde|como|salvar|alimentar|cadastrar)\b/.test(value)
  ) {
    return "Abra **Memória do HotelAI**. Registre regras e conhecimentos da empresa sem CPF, cartões, senhas ou documentos de hóspedes. A memória fornece contexto e não treina o modelo externo.";
  }

  return "";
}

function localExecutiveAnswer(question: string, context: RecordRow, upstreamError?: string) {
  const value = normalize(question);
  const pending = asRecord(context.pending_operations);
  const snapshot = asRecord(context.hotel_snapshot);
  const flattened = flattenSnapshot(snapshot);
  const metrics = [
    metricLine(flattened, "Receita total", ["revenue", "receita", "receita_total"], "money"),
    metricLine(flattened, "Receita de hospedagem", ["lodgingRevenue", "lodging_revenue"], "money"),
    metricLine(
      flattened,
      "Receita de produtos e serviços",
      ["salesRevenue", "sales_revenue"],
      "money",
    ),
    metricLine(flattened, "Despesas", ["expenses", "despesas"], "money"),
    metricLine(flattened, "GOP / resultado operacional", ["gop", "resultado_operacional"], "money"),
    metricLine(flattened, "Margem", ["margin", "margem"], "percent"),
    metricLine(flattened, "Ocupação", ["occupancyRate", "occupancy_rate", "ocupacao"], "percent"),
    metricLine(flattened, "ADR / diária média", ["adr", "diaria_media"], "money"),
    metricLine(flattened, "RevPAR", ["revpar"], "money"),
    metricLine(
      flattened,
      "Reservas",
      ["reservationCount", "reservation_count", "reservas"],
      "number",
    ),
    metricLine(flattened, "Avaliação média", ["averageRating", "average_rating"], "number"),
    metricLine(flattened, "Reclamações abertas", ["openComplaints", "open_complaints"], "number"),
  ].filter(Boolean) as string[];

  const details: string[] = [];
  if (/canal|origem|booking|whatsapp|formulario|formulário|hotel direto/.test(value)) {
    details.push(
      ...rankedRows(
        snapshot,
        ["channelRows", "channel_rows", "originRows", "origin_rows"],
        "Canais e origens",
      ),
    );
  }
  if (/despesa|custo|gasto/.test(value)) {
    details.push(...rankedRows(snapshot, ["expenseRows", "expense_rows"], "Principais despesas"));
  }
  if (/reclam|avaliacao|avaliação|nota|quarto|barulho|limpeza/.test(value)) {
    details.push(
      ...rankedRows(snapshot, ["complaintRows", "complaint_rows"], "Reclamações por categoria"),
    );
  }

  const actions = executiveActions(flattened, pending);
  return [
    "# HotelAI — análise executiva",
    "",
    "## Evidências atuais",
    metrics.length
      ? metrics.join("\n")
      : "O snapshot atual não disponibilizou indicadores suficientes. Não vou inventar valores.",
    details.length ? `\n${details.join("\n")}` : "",
    "",
    "## Prioridades",
    actions.join("\n"),
    "",
    "## Leitura",
    "A análise acima foi calculada diretamente com os dados agregados do hotel. Compare ocupação, diária média, receita e margem no mesmo período; receita maior sem melhora da margem indica pressão de custos ou descontos.",
    upstreamError
      ? `\n**Provedor externo:** indisponível nesta tentativa. A análise local permaneceu ativa.`
      : "",
    "",
    "**Confiança:** alta nos valores exibidos; hipóteses dependem da comparação com períodos anteriores.",
  ].join("\n");
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
  return [{ role: "assistant", text: `MEMÓRIA SANITIZADA DA EMPRESA:\n${summary}` }];
}

function flattenSnapshot(value: unknown, result = new Map<string, unknown>()) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  for (const [key, child] of Object.entries(value as RecordRow)) {
    result.set(normalizeKey(key), child);
    if (child && typeof child === "object" && !Array.isArray(child)) {
      flattenSnapshot(child, result);
    }
  }
  return result;
}

function metricLine(
  values: Map<string, unknown>,
  label: string,
  aliases: string[],
  format: "money" | "percent" | "number",
) {
  let found: unknown;
  for (const alias of aliases.map(normalizeKey)) {
    if (values.has(alias)) {
      found = values.get(alias);
      break;
    }
  }
  const number = Number(found);
  if (found == null || found === "" || Number.isNaN(number)) return "";
  const formatted =
    format === "money"
      ? formatMoney(number)
      : format === "percent"
        ? `${number.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`
        : number.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return `- **${label}:** ${formatted}`;
}

function rankedRows(snapshot: RecordRow, aliases: string[], title: string) {
  const key = aliases.find((alias) => Array.isArray(snapshot[alias]));
  const rows = key ? (snapshot[key] as unknown[]) : [];
  if (!rows.length) return [];
  const lines = rows.slice(0, 6).map((item) => {
    const row = asRecord(item);
    const label =
      row.channel ??
      row.canal ??
      row.origin ??
      row.origem ??
      row.category ??
      row.categoria ??
      row.label ??
      row.name ??
      "Sem categoria";
    const numeric =
      row.revenue ??
      row.receita ??
      row.total ??
      row.value ??
      row.valor ??
      row.count ??
      row.quantidade;
    const number = Number(numeric);
    return `- ${String(label)}: ${Number.isFinite(number) ? number.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "sem valor consolidado"}`;
  });
  return [`### ${title}`, ...lines];
}

function executiveActions(values: Map<string, unknown>, pending: RecordRow) {
  const actions: string[] = [];
  const complaints = numericMetric(values, ["openComplaints", "open_complaints"]);
  const rating = numericMetric(values, ["averageRating", "average_rating"]);
  const margin = numericMetric(values, ["margin", "margem"]);
  if (complaints > 0)
    actions.push(
      `1. Tratar ${complaints.toLocaleString("pt-BR")} reclamação(ões) aberta(s), começando pelas urgentes.`,
    );
  if (rating > 0 && rating < 3.5)
    actions.push(
      `${actions.length + 1}. Investigar a avaliação média abaixo de 3,5 e os critérios com notas menores.`,
    );
  if (margin < 0)
    actions.push(
      `${actions.length + 1}. Rever despesas e preços: o resultado operacional está negativo.`,
    );
  const pendingDepartures = Number(pending.pending_departures ?? 0);
  if (pendingDepartures > 0)
    actions.push(`${actions.length + 1}. Conferir ${pendingDepartures} saída(s) pendente(s).`);
  const receivables = Number(pending.company_receivables ?? 0);
  if (receivables > 0)
    actions.push(
      `${actions.length + 1}. Cobrar ou conciliar ${receivables} conta(s) empresarial(is) a receber.`,
    );
  if (!actions.length)
    actions.push(
      "1. Nenhum alerta crítico foi confirmado pelos indicadores disponíveis; acompanhe a comparação com o período anterior.",
    );
  return actions;
}

function numericMetric(values: Map<string, unknown>, aliases: string[]) {
  for (const alias of aliases.map(normalizeKey)) {
    const value = Number(values.get(alias));
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function normalizeKey(value: string) {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
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

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function asRecord(value: unknown): RecordRow {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordRow) : {};
}

function formatMoney(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
