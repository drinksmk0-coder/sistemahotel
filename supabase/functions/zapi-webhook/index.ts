import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.2";

type Row = Record<string, unknown>;
type ZapiPayload = { instanceId?: string; messageId?: string; phone?: string; fromMe?: boolean; isGroup?: boolean; senderName?: string; text?: { message?: string }; type?: string };

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "Método não permitido." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!url || !serviceKey) return json({ ok: false, error: "Ambiente Supabase incompleto." }, 500);
    const payload = (await req.json().catch(() => ({}))) as ZapiPayload;
    const instanceId = String(payload.instanceId ?? "").trim();
    const messageId = String(payload.messageId ?? "").trim();
    const phone = normalizePhone(payload.phone);
    const message = String(payload.text?.message ?? "").trim().slice(0, 4000);
    const senderName = String(payload.senderName ?? "").trim().slice(0, 160) || null;
    if (!instanceId) return json({ ok: true, ignored: "missing_instance" });

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: integration, error: integrationError } = await admin.from("zapi_integrations")
      .select("company_id,instance_id,instance_token_encrypted,client_token_encrypted,auto_reply_enabled,webhook_secret_hash")
      .eq("instance_id", instanceId).maybeSingle();
    if (integrationError) return json({ ok: false, error: integrationError.message }, 500);
    if (!integration) return json({ ok: false, error: "Instância não reconhecida." }, 404);

    const suppliedSecret = new URL(req.url).searchParams.get("secret") ?? "";
    const expectedHash = String(integration.webhook_secret_hash ?? "");
    if (!suppliedSecret || !expectedHash || (await sha256(suppliedSecret)) !== expectedHash) return json({ ok: false, error: "Webhook não autorizado." }, 401);
    if (payload.fromMe === true || payload.isGroup === true) return json({ ok: true, ignored: "outbound_or_group" });
    if (!phone || !message) return json({ ok: true, ignored: "non_text_or_missing_phone" });

    const companyId = String(integration.company_id);
    const { data: existingMessage } = messageId
      ? await admin.from("zapi_messages").select("id").eq("company_id", companyId).eq("external_message_id", messageId).maybeSingle()
      : { data: null };
    if (existingMessage?.id) return json({ ok: true, duplicate: true });

    const { data: conversation, error: conversationError } = await admin.from("zapi_conversations").upsert({
      company_id: companyId, phone, contact_name: senderName, last_message_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: "company_id,phone" }).select("id,status,handoff_reason").single();
    if (conversationError || !conversation) return json({ ok: false, error: conversationError?.message ?? "Falha ao abrir conversa." }, 500);

    const { error: inboundError } = await admin.from("zapi_messages").insert({
      company_id: companyId, conversation_id: conversation.id, external_message_id: messageId || null,
      direction: "inbound", message_type: "text", message_text: message, ai_generated: false, delivery_status: "received",
    });
    if (inboundError && !/duplicate/i.test(inboundError.message)) return json({ ok: false, error: inboundError.message }, 500);

    const handoff = handoffReason(message);
    if (handoff) {
      await admin.from("zapi_conversations").update({ status: "human", handoff_reason: handoff, updated_at: new Date().toISOString() })
        .eq("id", conversation.id).eq("company_id", companyId);
      if (integration.auto_reply_enabled === true && conversation.status !== "human") {
        await sendAndRecord({ admin, integration, companyId, conversationId: String(conversation.id), phone,
          message: "Recebi sua mensagem. Vou encaminhar para nossa equipe para que um atendente continue com você com mais cuidado.", aiGenerated: false });
      }
      return json({ ok: true, handoff: true, reason: handoff });
    }

    if (integration.auto_reply_enabled !== true || conversation.status !== "bot") return json({ ok: true, recorded: true, auto_reply: false });
    const answer = await buildAnswer(admin, companyId, message, String(conversation.id));
    if (!answer) return json({ ok: true, recorded: true, auto_reply: false, reason: "no_safe_answer" });
    const sendResult = await sendAndRecord({ admin, integration, companyId, conversationId: String(conversation.id), phone, message: answer.slice(0, 3500), aiGenerated: true });
    return json({ ok: sendResult.ok, replied: sendResult.ok, error: sendResult.error });
  } catch (error) {
    console.error("zapi-webhook", error);
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

async function buildAnswer(admin: ReturnType<typeof createClient>, companyId: string, question: string, conversationId: string) {
  const normalized = normalize(question);
  const availability = await availabilityAnswer(admin, companyId, question);
  if (availability) return availability;

  const { data: integration } = await admin.from("company_integrations").select("configuracao").eq("company_id", companyId)
    .eq("tipo", "recepcao_virtual_ia").eq("ativo", true).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const configuration = isRecord(integration?.configuracao) ? integration.configuracao : {};
  const instructions = String(configuration.instructions ?? "").slice(0, 10000);

  if (/\b(check ?in|entrada)\b/.test(normalized)) return "Nosso check-in é a partir das 14h. Se precisar de outro horário, posso encaminhar sua solicitação para a equipe verificar a possibilidade.";
  if (/\b(check ?out|saida|saída)\b/.test(normalized)) return "Nosso check-out é até as 12h. Se precisar de late check-out, a equipe pode verificar a disponibilidade.";

  const recentResult = await admin.from("zapi_messages").select("direction,message_text,created_at").eq("conversation_id", conversationId)
    .order("created_at", { ascending: false }).limit(8);
  const history = (recentResult.data ?? []).reverse().map((row) => `${row.direction === "inbound" ? "HÓSPEDE" : "HOTEL"}: ${redact(String(row.message_text ?? ""))}`)
    .join("\n").slice(0, 6000);

  const geminiKey = Deno.env.get("GEMINI_API_KEY")?.trim() || Deno.env.get("GOOGLE_GENERATIVE_AI_API_KEY")?.trim();
  const geminiModel = Deno.env.get("GEMINI_MODEL")?.trim() || "gemini-3.5-flash";
  if (geminiKey) {
    const system = [
      "Você é a recepção virtual de um hotel. Responda em português do Brasil, de forma cordial, curta e objetiva.",
      "Nunca invente preço, disponibilidade, pagamento, Pix, link, reserva, cancelamento ou política que não esteja explicitamente no contexto.",
      "Nunca confirme criação, alteração ou cancelamento de reserva. Para operações críticas, diga que a equipe humana continuará o atendimento.",
      "Não revele dados de outros hóspedes.",
      instructions ? `INSTRUÇÕES DA EMPRESA:\n${redact(instructions)}` : "",
    ].filter(Boolean).join("\n\n");
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: `CONVERSA RECENTE:\n${history}\n\nMENSAGEM ATUAL:\n${redact(question)}` }] }], generationConfig: { maxOutputTokens: 500 } }),
    });
    if (response.ok) {
      const answer = extractGemini((await response.json().catch(() => ({}))) as Row);
      if (answer) return answer;
    }
  }
  return "Obrigado pela mensagem. Para eu não passar uma informação incorreta, vou deixar sua solicitação registrada para a equipe continuar o atendimento.";
}

async function availabilityAnswer(admin: ReturnType<typeof createClient>, companyId: string, question: string) {
  if (!/\b(disponibilidade|disponivel|disponíveis|quarto livre|reservar|reserva)\b/i.test(question)) return "";
  const dates = question.match(/\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b/g) ?? [];
  const parsed = dates.map(normalizeDate).filter((value): value is string => Boolean(value));
  if (parsed.length < 2) return "Para verificar a disponibilidade corretamente, me informe a data de entrada e a data de saída.";
  const [checkin, checkout] = parsed;
  if (checkout <= checkin) return "A data de saída precisa ser posterior à data de entrada.";
  const { data, error } = await admin.rpc("get_hotel_room_availability", { _company_id: companyId, _checkin: checkin, _checkout: checkout });
  if (error) return "Não consegui consultar a disponibilidade agora. Vou deixar a equipe continuar o atendimento.";
  const rooms = Array.isArray(data) ? data : [];
  if (!rooms.length) return `Não encontrei quartos disponíveis de ${formatDate(checkin)} a ${formatDate(checkout)}. Posso deixar sua solicitação registrada para a equipe conferir alternativas.`;
  const options = rooms.slice(0, 8).map((row) => String(isRecord(row) ? row.numero ?? row.quarto ?? "" : "").trim()).filter(Boolean);
  return `Encontrei ${rooms.length} quarto(s) disponível(is) de ${formatDate(checkin)} a ${formatDate(checkout)}${options.length ? `: ${options.join(", ")}` : ""}. A equipe confirma a reserva e as condições de pagamento antes de finalizar.`;
}

async function sendAndRecord(args: { admin: ReturnType<typeof createClient>; integration: Row; companyId: string; conversationId: string; phone: string; message: string; aiGenerated: boolean }) {
  try {
    const secret = Deno.env.get("ZAPI_ENCRYPTION_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const instanceToken = await decrypt(String(args.integration.instance_token_encrypted ?? ""), secret);
    const clientToken = await decrypt(String(args.integration.client_token_encrypted ?? ""), secret);
    const instanceId = String(args.integration.instance_id ?? "");
    const upstream = await fetch(`https://api.z-api.io/instances/${encodeURIComponent(instanceId)}/token/${encodeURIComponent(instanceToken)}/send-text`, {
      method: "POST", headers: { "Client-Token": clientToken, "Content-Type": "application/json" }, body: JSON.stringify({ phone: args.phone, message: args.message }),
    });
    const payload = (await upstream.json().catch(() => ({}))) as Row;
    const externalId = String(payload.messageId ?? payload.zaapId ?? "").trim() || null;
    await args.admin.from("zapi_messages").insert({ company_id: args.companyId, conversation_id: args.conversationId, external_message_id: externalId,
      direction: "outbound", message_type: "text", message_text: args.message, ai_generated: args.aiGenerated, delivery_status: upstream.ok ? "sent" : `error_${upstream.status}` });
    return { ok: upstream.ok, error: upstream.ok ? undefined : String(payload.error ?? "Falha ao enviar mensagem.") };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
}

function handoffReason(message: string) {
  const value = normalize(message);
  if (/\b(emergencia|emergência|socorro|acidente|hospital|policia|polícia|incendio|incêndio)\b/.test(value)) return "emergency";
  if (/\b(reclamacao|reclamação|problema|barulho|sujo|sujeira|defeito|quebrado|sem agua|sem água)\b/.test(value)) return "complaint";
  if (/\b(cancelar|cancelamento|alterar reserva|mudar reserva|trocar data|reembolso)\b/.test(value)) return "reservation_change";
  if (/\b(pagamento|pix|cartao|cartão|cobranca|cobrança|comprovante|estorno)\b/.test(value)) return "payment";
  if (/\b(falar com|atendente|humano|gerente|recepcao|recepção|pessoa)\b/.test(value)) return "human_requested";
  return "";
}
function normalizePhone(value: unknown) { const digits = String(value ?? "").replace(/\D/g, ""); return digits.length >= 10 && digits.length <= 15 ? digits : ""; }
function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); }
function normalizeDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = value.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/); if (!match) return undefined;
  const now = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric" }).format(new Date());
  const year = match[3] ? (match[3].length === 2 ? `20${match[3]}` : match[3]) : now;
  return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}
function formatDate(value: string) { const [year, month, day] = value.split("-"); return `${day}/${month}/${year}`; }
function redact(value: string) { return value.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[e-mail removido]").replace(/\b(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}\b/g, "[telefone removido]").replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[CPF removido]").replace(/\b\d{2}\.?\d{3}\.?\d{3}[\/]?\d{4}-?\d{2}\b/g, "[CNPJ removido]").slice(0, 12000); }
function extractGemini(payload: Row) { const candidates = Array.isArray(payload.candidates) ? payload.candidates : []; return candidates.flatMap((candidate) => { const row = isRecord(candidate) ? candidate : {}; const content = isRecord(row.content) ? row.content : {}; return Array.isArray(content.parts) ? content.parts : []; }).map((part) => String(isRecord(part) ? part.text ?? "" : "")).filter(Boolean).join("\n").trim(); }
function isRecord(value: unknown): value is Row { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
async function sha256(value: string) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join(""); }
async function key(secret: string) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret)); return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["decrypt"]); }
async function decrypt(value: string, secret: string) { const [iv, data] = value.split("."); if (!iv || !data) throw new Error("Credencial cifrada inválida."); const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await key(secret), unb64(data)); return new TextDecoder().decode(decrypted); }
function unb64(value: string) { return Uint8Array.from(atob(value), (c) => c.charCodeAt(0)); }
function json(payload: unknown, status = 200) { return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json; charset=utf-8" } }); }
