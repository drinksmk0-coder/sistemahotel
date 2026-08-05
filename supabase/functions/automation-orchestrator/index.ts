import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-integration-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const integrationToken = Deno.env.get("INTEGRATION_WEBHOOK_TOKEN") ?? "";
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type AutomationPayload = {
  version?: string;
  company_id?: string;
  channel?: string;
  external_message_id?: string;
  event_type?: string;
  contact?: { name?: string; phone?: string; email?: string; opt_in?: boolean };
  message?: { text?: string };
  context?: {
    requested_checkin?: string | null;
    requested_checkout?: string | null;
    guests?: number | null;
    room?: number | null;
    daily_rate?: number | null;
    total?: number | null;
    source_campaign?: string | null;
  };
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json({ ok: true });
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const token = request.headers.get("x-integration-token") ?? "";
  if (!integrationToken || token !== integrationToken) {
    return json({ ok: false, error: "Invalid integration token" }, 401);
  }

  const body = (await request.json().catch(() => null)) as AutomationPayload | null;
  if (!body?.company_id || !body.channel || !body.external_message_id) {
    return json({ ok: false, error: "company_id, channel e external_message_id são obrigatórios" }, 400);
  }

  const text = String(body.message?.text ?? "").trim();
  const intent = classifyIntent(text, body.event_type);
  const context = body.context ?? {};
  const actionType = actionForIntent(intent, context);
  const requiresHumanConfirmation = isCriticalAction(actionType);

  const queuePayload = {
    intent,
    text,
    context,
    event_type: body.event_type ?? "inbound_message",
    source_campaign: context.source_campaign ?? null,
    opt_in: body.contact?.opt_in === true,
    missing_fields: missingFields(actionType, body),
  };

  const { data, error } = await supabase
    .from("ai_automation_queue")
    .upsert(
      {
        company_id: body.company_id,
        source: body.channel,
        external_id: body.external_message_id,
        action_type: actionType,
        status: requiresHumanConfirmation ? "pending_review" : "approved",
        contact_name: body.contact?.name ?? null,
        contact_phone: body.contact?.phone ?? null,
        contact_email: body.contact?.email ?? null,
        payload: queuePayload,
        requires_human_confirmation: requiresHumanConfirmation,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id,source,external_id" },
    )
    .select("id,status,action_type,requires_human_confirmation")
    .single();

  if (error) return json({ ok: false, error: error.message }, 400);

  return json({
    ok: true,
    queue_id: data.id,
    action_type: data.action_type,
    status: data.status,
    requires_human_confirmation: data.requires_human_confirmation,
    reply: buildReply(actionType, body),
    next_step: requiresHumanConfirmation
      ? "Aguardar aprovação humana no HospedaMais."
      : "Ação informativa liberada para execução pelo n8n.",
  });
});

function classifyIntent(text: string, eventType?: string) {
  const normalized = normalize(text);
  if (eventType === "booking_email") return "booking_import";
  if (/cancel|desist|nao vou|não vou/.test(normalized)) return "cancel_request";
  if (/alter|mudar|trocar.*data|adiar|antecipar/.test(normalized)) return "change_request";
  if (/avali|nota|feedback/.test(normalized)) return "review";
  if (/fnrh|ficha|check.?in online|cadastro hospede/.test(normalized)) return "fnrh";
  if (/preco|valor|dispon|vaga|quarto|reserv/.test(normalized)) return "reservation_lead";
  if (/humano|atendente|recepcao|recepção/.test(normalized)) return "human_handoff";
  return "general_question";
}

function actionForIntent(intent: string, context: AutomationPayload["context"]) {
  if (intent === "cancel_request") return "request_cancellation";
  if (intent === "change_request") return "request_reservation_change";
  if (intent === "booking_import") return "import_booking_draft";
  if (intent === "fnrh") return "send_fnrh_link";
  if (intent === "review") return "send_review_request";
  if (intent === "human_handoff") return "handoff_to_human";
  if (intent === "reservation_lead") {
    return context?.requested_checkin && context?.requested_checkout
      ? "create_draft_reservation"
      : "qualify_lead";
  }
  return "answer_question";
}

function isCriticalAction(actionType: string) {
  return [
    "create_draft_reservation",
    "import_booking_draft",
    "request_cancellation",
    "request_reservation_change",
  ].includes(actionType);
}

function missingFields(actionType: string, body: AutomationPayload) {
  if (!['create_draft_reservation','import_booking_draft'].includes(actionType)) return [];
  const missing: string[] = [];
  if (!body.contact?.name) missing.push("contact.name");
  if (!body.context?.requested_checkin) missing.push("context.requested_checkin");
  if (!body.context?.requested_checkout) missing.push("context.requested_checkout");
  if (!body.context?.guests) missing.push("context.guests");
  return missing;
}

function buildReply(actionType: string, body: AutomationPayload) {
  const firstName = String(body.contact?.name ?? "").trim().split(/\s+/)[0];
  const greeting = firstName ? `${firstName}, ` : "";
  switch (actionType) {
    case "qualify_lead":
      return `${greeting}para consultar disponibilidade, informe as datas de entrada e saída e o número de hóspedes.`;
    case "create_draft_reservation":
    case "import_booking_draft":
      return `${greeting}recebi os dados. A pré-reserva foi enviada para conferência da recepção antes da confirmação.`;
    case "request_cancellation":
      return `${greeting}o pedido de cancelamento foi encaminhado para análise. A reserva não foi cancelada automaticamente.`;
    case "request_reservation_change":
      return `${greeting}o pedido de alteração foi encaminhado para conferência da recepção.`;
    case "send_fnrh_link":
      return `${greeting}o envio da FNRH pode ser realizado após localizar e validar a reserva.`;
    case "send_review_request":
      return `${greeting}obrigado pelo contato. A solicitação de avaliação foi registrada.`;
    case "handoff_to_human":
      return `${greeting}vou encaminhar esta conversa para a recepção.`;
    default:
      return `${greeting}sua mensagem foi recebida e classificada para atendimento.`;
  }
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}
