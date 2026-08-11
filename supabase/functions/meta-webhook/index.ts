import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const jsonHeaders = { "Content-Type": "application/json" };

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function validMetaSignature(rawBody: string, signatureHeader: string | null) {
  const appSecret = Deno.env.get("META_APP_SECRET") ?? "";
  if (!appSecret || !signatureHeader?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  return timingSafeEqual(`sha256=${hex(signature)}`, signatureHeader.toLowerCase());
}

function messageText(message: any): string | null {
  if (!message) return null;
  if (message.type === "text") return message.text?.body ?? null;
  if (message.type === "button") return message.button?.text ?? null;
  if (message.type === "interactive") {
    return message.interactive?.button_reply?.title ?? message.interactive?.list_reply?.title ?? null;
  }
  if (message.type === "image") return message.image?.caption ?? "[Imagem]";
  if (message.type === "document") return message.document?.caption ?? message.document?.filename ?? "[Documento]";
  if (message.type === "audio") return "[Áudio]";
  if (message.type === "video") return message.video?.caption ?? "[Vídeo]";
  if (message.type === "location") return "[Localização]";
  if (message.type === "contacts") return "[Contato]";
  return `[${String(message.type ?? "mensagem")}]`;
}

function asIsoTimestamp(value: unknown) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return new Date().toISOString();
  return new Date(seconds * 1000).toISOString();
}

Deno.serve(async (req: Request) => {
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const expected = Deno.env.get("META_VERIFY_TOKEN") ?? "";

    if (expected && mode === "subscribe" && token && timingSafeEqual(token, expected) && challenge) {
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  if (!(await validMetaSignature(rawBody, signature))) {
    return new Response(JSON.stringify({ error: "invalid_meta_signature" }), { status: 401, headers: jsonHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRole) {
    return new Response(JSON.stringify({ error: "server_not_configured" }), { status: 503, headers: jsonHeaders });
  }
  const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), { status: 400, headers: jsonHeaders });
  }

  for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      if (change?.field !== "messages") continue;
      const value = change?.value ?? {};
      const phoneNumberId = String(value?.metadata?.phone_number_id ?? "");
      if (!phoneNumberId) continue;

      const { data: integration } = await admin
        .from("meta_integrations")
        .select("company_id")
        .eq("whatsapp_phone_number_id", phoneNumberId)
        .maybeSingle();
      if (!integration?.company_id) continue;
      const companyId = integration.company_id as string;

      const contactsByWaId = new Map<string, string | null>();
      for (const contact of Array.isArray(value?.contacts) ? value.contacts : []) {
        const waId = String(contact?.wa_id ?? "");
        if (waId) contactsByWaId.set(waId, contact?.profile?.name ?? null);
      }

      for (const message of Array.isArray(value?.messages) ? value.messages : []) {
        const contactId = String(message?.from ?? "");
        const externalMessageId = String(message?.id ?? "");
        if (!contactId || !externalMessageId) continue;
        const createdAt = asIsoTimestamp(message?.timestamp);
        const contactName = contactsByWaId.get(contactId) ?? null;

        const { data: conversation, error: conversationError } = await admin
          .from("meta_conversations")
          .upsert(
            {
              company_id: companyId,
              channel: "whatsapp",
              contact_id: contactId,
              contact_name: contactName,
              last_message_at: createdAt,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "company_id,channel,contact_id" },
          )
          .select("id")
          .single();
        if (conversationError || !conversation?.id) {
          console.error("meta conversation upsert failed", conversationError?.message ?? "unknown");
          continue;
        }

        const { error: insertError } = await admin.from("meta_messages").insert({
          company_id: companyId,
          conversation_id: conversation.id,
          external_message_id: externalMessageId,
          channel: "whatsapp",
          direction: "inbound",
          message_type: String(message?.type ?? "text"),
          message_text: messageText(message),
          ai_generated: false,
          delivery_status: "received",
          created_at: createdAt,
        });
        if (insertError && insertError.code !== "23505") {
          console.error("meta message insert failed", insertError.message);
        }
      }

      for (const status of Array.isArray(value?.statuses) ? value.statuses : []) {
        const externalMessageId = String(status?.id ?? "");
        const deliveryStatus = String(status?.status ?? "");
        if (!externalMessageId || !deliveryStatus) continue;
        const { error: statusError } = await admin
          .from("meta_messages")
          .update({ delivery_status: deliveryStatus })
          .eq("company_id", companyId)
          .eq("channel", "whatsapp")
          .eq("external_message_id", externalMessageId);
        if (statusError) console.error("meta message status update failed", statusError.message);
      }
    }
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: jsonHeaders });
});
