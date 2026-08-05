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
    reservation_id?: string | null;
    requested_checkin?: string | null;
    requested_checkout?: string | null;
    guests?: number | null;
    room?: number | null;
    daily_rate?: number | null;
    total?: number | null;
    source_campaign?: string | null;
    fnrh_url?: string | null;
    review_url?: string | null;
    calendar_event_id?: string | null;
    last_contact_at?: string | null;
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
  const missing = missingFields(actionType, body);

  const queuePayload = {
    intent,
    text,
    context,
    event_type: body.event_type ?? "inbound_message",
    source_campaign: context.source_campaign ?? null,
    opt_in: body.contact?.opt_in === true,
    missing_fields: missing,
  };

  const initialStatus = requiresHumanConfirmation || missing.length > 0
    ? "pending_review"
    : "approved";

  const { data, error } = await supabase
    .from("ai_automation_queue")
    .upsert(
      {
        company_id: body.company_id,
        source: body.channel,
        external_id: body.external_message_id,
        action_type: actionType,
        status: initialStatus,
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
    missing_fields: missing,
    reply: buildReply(actionType, body),
    next_step: data.status === "pending_review"
      ? "Aguardar conferência humana no HospedaMais."
      : "Ação não crítica liberada para execução pelo n8n.",
  });
});

function classifyIntent(text: string, eventType?: string) {
  const normalized = normalize(text);

  const eventMap: Record<string, string> = {
    booking_email: "booking_import",
    calendar_sync: "calendar_sync",
    checkin_reminder: "checkin_reminder",
    checkout_reminder: "checkout_reminder",
    fnrh_reminder: "fnrh",
    review_request: "review",
    post_stay_followup: "post_stay_followup",
    abandoned_reservation: "abandoned_reservation",
    lead_followup: "lead_followup",
  };
  if (eventType && eventMap[eventType]) return eventMap[eventType];

  if (/cancel|desist|nao vou|não vou/.test(normalized)) return "cancel_request";
  if (/alter|mudar|trocar.*data|adiar|antecipar/.test(normalized)) return "change_request";
  if (/avali|nota|feedback/.test(normalized)) return "review";
  if (/fnrh|ficha|check.?in online|cadastro hospede/.test(normalized)) return "fnrh";
  if (/check.?in|horario de entrada|chegada/.test(normalized)) return "checkin_question";
  if (/check.?out|horario de saida|saída/.test(normalized)) return "checkout_question";
  if (/agenda|calendario|calendário|agendar/.test(normalized)) return "calendar_sync";
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
  if (intent === "post_stay_followup") return "send_post_stay_followup";
  if (intent === "abandoned_reservation") return "recover_abandoned_reservation";
  if (intent === "lead_followup") return "follow_up_lead";
  if (intent === "checkin_reminder") return "send_checkin_reminder";
  if (intent === "checkout_reminder") return "send_checkout_reminder";
  if (intent === "calendar_sync") return "sync_calendar_event";
  if (intent === "checkin_question") return "answer_checkin_question";
  if (intent === "checkout_question") return "answer_checkout_question";
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
  const missing: string[] = [];
  if (["create_draft_reservation", "import_booking_draft"].includes(actionType)) {
    if (!body.contact?.name) missing.push("contact.name");
    if (!body.context?.requested_checkin) missing.push("context.requested_checkin");
    if (!body.context?.requested_checkout) missing.push("context.requested_checkout");
    if (!body.context?.guests) missing.push("context.guests");
  }
  if (["send_fnrh_link", "send_checkin_reminder", "send_checkout_reminder", "send_post_stay_followup"].includes(actionType)) {
    if (!body.context?.reservation_id) missing.push("context.reservation_id");
  }
  if (actionType === "send_fnrh_link" && !body.context?.fnrh_url) missing.push("context.fnrh_url");
  if (actionType === "send_review_request" && !body.context?.review_url) missing.push("context.review_url");
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
      return `${greeting}segue o link seguro da FNRH para preencher os dados antes do check-in.`;
    case "send_checkin_reminder":
      return `${greeting}seu check-in está próximo. Confira o horário de chegada e finalize a FNRH antes de vir ao hotel.`;
    case "send_checkout_reminder":
      return `${greeting}lembramos que seu check-out está programado. A recepção pode ajudar com qualquer ajuste necessário.`;
    case "send_review_request":
      return `${greeting}obrigado pela hospedagem. Sua avaliação ajuda o hotel a melhorar continuamente.`;
    case "send_post_stay_followup":
      return `${greeting}esperamos que tenha chegado bem. Gostaríamos de saber como foi sua experiência no hotel.`;
    case "recover_abandoned_reservation":
      return `${greeting}sua consulta de hospedagem ficou incompleta. Posso retomar as datas e verificar a disponibilidade para você.`;
    case "follow_up_lead":
      return `${greeting}estou retomando seu atendimento para ajudar a concluir a reserva.`;
    case "sync_calendar_event":
      return `${greeting}o compromisso foi preparado para sincronização com a agenda operacional do hotel.`;
    case "answer_checkin_question":
      return `${greeting}vou consultar os dados da reserva e o horário de check-in configurado pelo hotel.`;
    case "answer_checkout_question":
      return `${greeting}vou consultar os dados da reserva e o horário de check-out configurado pelo hotel.`;
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
