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
    const contextualQuestion = [
      `PERGUNTA DO PROPRIETÁRIO:\n${safeQuestion}`,
      `CONTEXTO ADICIONAL DA HOSPEDAMAIS:\n${JSON.stringify(context)}`,
      "Responda com: o que aconteceu, evidências, possíveis causas, impacto, ação recomendada, prazo e nível de confiança.",
    ].join("\n\n");

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
        question: contextualQuestion,
        conversation: safeConversation,
      }),
    });
    const payload = (await upstream.json().catch(() => ({}))) as {
      answer?: string;
      error?: string;
      provider?: string;
      model?: string;
      degraded?: boolean;
    };

    if (upstream.ok && payload.answer) {
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

    return json({
      answer: offlineAnswer(context, payload.error),
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
  const [companyResult, snapshotResult, memoryResult, pendingResult, waterResult] =
    await Promise.all([
      admin
        .from("companies")
        .select("nome,slug,cidade,estado")
        .eq("id", companyId)
        .maybeSingle(),
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
      asksWater
        ? admin
            .from("sales")
            .select("data,quarto,item,categoria,qtd,valor_unit,total,valor_pago,status")
            .eq("company_id", companyId)
            .or(
              "item.ilike.%agua%,item.ilike.%água%,categoria.ilike.%agua%,categoria.ilike.%água%",
            )
            .order("data", { ascending: false })
            .limit(2000)
        : Promise.resolve({ data: [], error: null }),
    ]);

  const pendingRows = pendingResult.data ?? [];
  const waterRows = waterResult.data ?? [];
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
      : snapshotResult.data ?? {},
    ai_memory: memory,
    pending_operations: {
      pending_departures: pendingRows.filter((row) => row.status === "saida_pendente").length,
      company_receivables: pendingRows.filter(
        (row) =>
          row.billing_responsibility === "company" &&
          ["pending", "overdue"].includes(String(row.billing_status)),
      ).length,
      overdue_company_receivables: pendingRows.filter(
        (row) => row.billing_status === "overdue",
      ).length,
      estimated_open_lodging_balance: pendingRows.reduce(
        (sum, row) =>
          sum + Math.max(0, Number(row.valor_total) - Number(row.valor_pago)),
        0,
      ),
    },
    water_consumption: {
      consulted: asksWater,
      lines: waterRows.length,
      quantity: waterRows.reduce((sum, row) => sum + Math.max(0, Number(row.qtd)), 0),
      total: waterRows.reduce((sum, row) => sum + Math.max(0, Number(row.total)), 0),
      paid: waterRows.reduce(
        (sum, row) => sum + Math.max(0, Number(row.valor_pago)),
        0,
      ),
      rooms: new Set(waterRows.map((row) => row.quarto)).size,
      details: waterRows.slice(0, 60),
      report_path: "/relatorio-consumo-agua",
      document_type: "Espelho de consumo de água — não é nota fiscal",
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

  return "";
}

function offlineAnswer(context: RecordRow, upstreamError?: string) {
  const pending = asRecord(context.pending_operations);
  return [
    upstreamError || "O provedor externo está temporariamente indisponível.",
    `Saídas pendentes: ${Number(pending.pending_departures ?? 0)}.`,
    `Contas empresariais a receber: ${Number(pending.company_receivables ?? 0)}.`,
    "Relatório de água, regras de check-in/check-out e memória da empresa continuam disponíveis localmente.",
  ].join("\n");
}

function normalizeConversation(value: unknown): ConversationMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is RecordRow => Boolean(item) && typeof item === "object")
    .map((item) => ({
      role: item.role === "assistant" ? "assistant" as const : "user" as const,
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
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordRow)
    : {};
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
