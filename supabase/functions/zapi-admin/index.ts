import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Body = {
  action?: "get" | "save" | "status" | "qr" | "webhook" | "auto_reply";
  company_id?: string;
  instance_id?: string;
  instance_token?: string;
  client_token?: string;
  phone_number?: string;
  enabled?: boolean;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return response({ ok: true });
  if (req.method !== "POST") return response({ ok: false, error: "Método não permitido." }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const auth = req.headers.get("Authorization") ?? "";
    if (!url || !serviceKey) return response({ ok: false, error: "Ambiente Supabase incompleto." }, 500);
    if (!auth) return response({ ok: false, error: "Login obrigatório." }, 401);

    const body = (await req.json().catch(() => ({}))) as Body;
    const companyId = String(body.company_id ?? "").trim();
    const action = body.action ?? "get";
    if (!companyId) return response({ ok: false, error: "Empresa não informada." }, 400);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const jwt = auth.replace(/^Bearer\s+/i, "");
    const { data: authData, error: authError } = await admin.auth.getUser(jwt);
    if (authError || !authData.user) return response({ ok: false, error: "Sessão inválida." }, 401);

    const { data: member } = await admin
      .from("company_members")
      .select("role")
      .eq("company_id", companyId)
      .eq("user_id", authData.user.id)
      .eq("ativo", true)
      .maybeSingle();
    if (!member || String(member.role) !== "dono") {
      return response({ ok: false, error: "Somente o proprietário pode configurar o WhatsApp." }, 403);
    }

    const encryptionSecret = Deno.env.get("ZAPI_ENCRYPTION_KEY") || serviceKey;

    if (action === "save") {
      const instanceId = String(body.instance_id ?? "").trim();
      const instanceToken = String(body.instance_token ?? "").trim();
      const clientToken = String(body.client_token ?? "").trim();
      if (!instanceId || !instanceToken || !clientToken) {
        return response({ ok: false, error: "Instance ID, Token e Client Token são obrigatórios." }, 400);
      }
      const [encInstance, encClient] = await Promise.all([
        encrypt(instanceToken, encryptionSecret),
        encrypt(clientToken, encryptionSecret),
      ]);
      const { error } = await admin.from("zapi_integrations").upsert({
        company_id: companyId,
        instance_id: instanceId,
        instance_token_encrypted: encInstance,
        client_token_encrypted: encClient,
        phone_number: String(body.phone_number ?? "").trim() || null,
        connected: false,
        smartphone_connected: false,
        webhook_configured: false,
        webhook_secret_hash: null,
        auto_reply_enabled: false,
        updated_at: new Date().toISOString(),
      }, { onConflict: "company_id" });
      if (error) return response({ ok: false, error: error.message }, 400);
      return response({ ok: true, saved: true, auto_reply_enabled: false });
    }

    const { data: row, error } = await admin
      .from("zapi_integrations")
      .select("company_id,instance_id,instance_token_encrypted,client_token_encrypted,phone_number,connected,smartphone_connected,last_status,webhook_configured,auto_reply_enabled,updated_at")
      .eq("company_id", companyId)
      .maybeSingle();
    if (error) return response({ ok: false, error: error.message }, 400);
    if (!row) return response({ ok: true, configured: false, auto_reply_enabled: false });

    if (action === "get") {
      const [{ count: conversations }, { count: human }] = await Promise.all([
        admin.from("zapi_conversations").select("id", { count: "exact", head: true }).eq("company_id", companyId),
        admin.from("zapi_conversations").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "human"),
      ]);
      return response({
        ok: true,
        configured: true,
        instance_id: row.instance_id,
        phone_number: row.phone_number,
        connected: row.connected,
        smartphone_connected: row.smartphone_connected,
        last_status: row.last_status,
        webhook_configured: row.webhook_configured,
        auto_reply_enabled: row.auto_reply_enabled,
        conversations: conversations ?? 0,
        human_handoffs: human ?? 0,
        updated_at: row.updated_at,
      });
    }

    const [instanceToken, clientToken] = await Promise.all([
      decrypt(row.instance_token_encrypted, encryptionSecret),
      decrypt(row.client_token_encrypted, encryptionSecret),
    ]);
    const base = `https://api.z-api.io/instances/${encodeURIComponent(row.instance_id)}/token/${encodeURIComponent(instanceToken)}`;
    const headers = { "Client-Token": clientToken, "Content-Type": "application/json" };

    if (action === "status") {
      const upstream = await fetch(`${base}/status`, { headers });
      const payload = await upstream.json().catch(() => ({})) as Record<string, unknown>;
      if (!upstream.ok) return response({ ok: false, error: String(payload.error ?? "Falha ao consultar Z-API.") }, upstream.status);
      const connected = payload.connected === true;
      const smartphoneConnected = payload.smartphoneConnected === true;
      await admin.from("zapi_integrations").update({
        connected,
        smartphone_connected: smartphoneConnected,
        last_status: String(payload.error ?? (connected ? "connected" : "disconnected")),
        updated_at: new Date().toISOString(),
      }).eq("company_id", companyId);
      return response({ ok: true, connected, smartphone_connected: smartphoneConnected, detail: payload.error ?? null });
    }

    if (action === "qr") {
      const upstream = await fetch(`${base}/qr-code`, { headers });
      const payload = await upstream.json().catch(() => ({})) as { value?: string; error?: string };
      if (!upstream.ok || !payload.value) {
        return response({ ok: false, error: payload.error ?? "Não foi possível gerar o QR Code." }, upstream.status || 400);
      }
      return response({ ok: true, qr_code: payload.value });
    }

    if (action === "webhook") {
      const rawSecret = randomSecret();
      const webhookUrl = `${url}/functions/v1/zapi-webhook?secret=${encodeURIComponent(rawSecret)}`;
      const upstream = await fetch(`${base}/update-webhook-received`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ value: webhookUrl }),
      });
      const payload = await upstream.json().catch(() => ({})) as Record<string, unknown>;
      if (!upstream.ok) {
        return response({ ok: false, error: String(payload.error ?? payload.message ?? "Não foi possível configurar o webhook na Z-API.") }, upstream.status);
      }
      await admin.from("zapi_integrations").update({
        webhook_secret_hash: await sha256(rawSecret),
        webhook_configured: true,
        ai_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("company_id", companyId);
      return response({ ok: true, webhook_configured: true });
    }

    if (action === "auto_reply") {
      const enabled = body.enabled === true;
      if (enabled && row.webhook_configured !== true) {
        return response({ ok: false, error: "Configure o webhook antes de ativar as respostas automáticas." }, 409);
      }
      if (enabled && row.connected !== true) {
        return response({ ok: false, error: "Conecte o WhatsApp e confirme o status antes de ativar a IA automática." }, 409);
      }
      const { error: updateError } = await admin.from("zapi_integrations").update({
        auto_reply_enabled: enabled,
        ai_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("company_id", companyId);
      if (updateError) return response({ ok: false, error: updateError.message }, 400);
      return response({ ok: true, auto_reply_enabled: enabled });
    }

    return response({ ok: false, error: "Ação desconhecida." }, 400);
  } catch (error) {
    return response({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

async function key(secret: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function encrypt(value: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(secret), new TextEncoder().encode(value));
  return `${b64(iv)}.${b64(new Uint8Array(encrypted))}`;
}
async function decrypt(value: string, secret: string) {
  const [iv, data] = value.split(".");
  if (!iv || !data) throw new Error("Credencial cifrada inválida.");
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await key(secret), unb64(data));
  return new TextDecoder().decode(decrypted);
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function randomSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return b64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function b64(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)); }
function unb64(value: string) { return Uint8Array.from(atob(value), (c) => c.charCodeAt(0)); }
function response(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });
}
