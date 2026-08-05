import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Action = "get" | "save" | "status" | "qr" | "configure_webhook";

type RequestBody = {
  action?: Action;
  company_id?: string;
  instance_id?: string;
  instance_token?: string;
  client_token?: string;
  phone_number?: string;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json({ ok: true });
  if (request.method !== "POST") return json({ ok: false, error: "Método não permitido." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const encryptionKey = Deno.env.get("ZAPI_ENCRYPTION_KEY") ?? "";
    const authorization = request.headers.get("Authorization") ?? "";

    if (!supabaseUrl || !serviceRoleKey || !encryptionKey) {
      return json({ ok: false, error: "Ambiente da integração Z-API incompleto." }, 500);
    }
    if (!authorization) return json({ ok: false, error: "Login obrigatório." }, 401);

    const body = (await request.json().catch(() => ({}))) as RequestBody;
    const companyId = String(body.company_id ?? "").trim();
    const action = body.action ?? "get";
    if (!companyId) return json({ ok: false, error: "Empresa não informada." }, 400);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const jwt = authorization.replace(/^Bearer\s+/i, "");
    const { data: authData, error: authError } = await admin.auth.getUser(jwt);
    if (authError || !authData.user) return json({ ok: false, error: "Sessão inválida." }, 401);

    const { data: membership } = await admin
      .from("company_members")
      .select("role")
      .eq("company_id", companyId)
      .eq("user_id", authData.user.id)
      .eq("ativo", true)
      .maybeSingle();

    if (!membership || !["dono", "admin"].includes(String(membership.role))) {
      return json({ ok: false, error: "Somente proprietário ou administrador pode configurar o WhatsApp." }, 403);
    }

    if (action === "save") {
      const instanceId = String(body.instance_id ?? "").trim();
      const instanceToken = String(body.instance_token ?? "").trim();
      const clientToken = String(body.client_token ?? "").trim();
      if (!instanceId || !instanceToken || !clientToken) {
        return json({ ok: false, error: "Instance ID, Token e Client Token são obrigatórios." }, 400);
      }

      const [encryptedInstanceToken, encryptedClientToken] = await Promise.all([
        encrypt(instanceToken, encryptionKey),
        encrypt(clientToken, encryptionKey),
      ]);

      const { error } = await admin.from("zapi_integrations").upsert({
        company_id: companyId,
        instance_id: instanceId,
        instance_token_encrypted: encryptedInstanceToken,
        client_token_encrypted: encryptedClientToken,
        phone_number: String(body.phone_number ?? "").trim() || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "company_id" });

      if (error) return json({ ok: false, error: error.message }, 400);
      return json({ ok: true, saved: true });
    }

    const { data: row, error: rowError } = await admin
      .from("zapi_integrations")
      .select("company_id,instance_id,instance_token_encrypted,client_token_encrypted,phone_number,connected,smartphone_connected,last_status,webhook_configured,updated_at")
      .eq("company_id", companyId)
      .maybeSingle();

    if (rowError) return json({ ok: false, error: rowError.message }, 400);
    if (!row) return json({ ok: true, configured: false });

    if (action === "get") {
      return json({
        ok: true,
        configured: true,
        instance_id: row.instance_id,
        phone_number: row.phone_number,
        connected: row.connected,
        smartphone_connected: row.smartphone_connected,
        last_status: row.last_status,
        webhook_configured: row.webhook_configured,
        updated_at: row.updated_at,
      });
    }

    const [instanceToken, clientToken] = await Promise.all([
      decrypt(row.instance_token_encrypted, encryptionKey),
      decrypt(row.client_token_encrypted, encryptionKey),
    ]);
    const baseUrl = `https://api.z-api.io/instances/${encodeURIComponent(row.instance_id)}/token/${encodeURIComponent(instanceToken)}`;
    const headers = { "Client-Token": clientToken, "Content-Type": "application/json" };

    if (action === "status") {
      const upstream = await fetch(`${baseUrl}/status`, { headers });
      const payload = await upstream.json().catch(() => ({})) as Record<string, unknown>;
      if (!upstream.ok) return json({ ok: false, error: String(payload.error ?? "Falha ao consultar Z-API.") }, upstream.status);

      const connected = payload.connected === true;
      const smartphoneConnected = payload.smartphoneConnected === true;
      await admin.from("zapi_integrations").update({
        connected,
        smartphone_connected: smartphoneConnected,
        last_status: String(payload.error ?? (connected ? "connected" : "disconnected")),
        updated_at: new Date().toISOString(),
      }).eq("company_id", companyId);

      return json({ ok: true, connected, smartphone_connected: smartphoneConnected, detail: payload.error ?? null });
    }

    if (action === "qr") {
      const upstream = await fetch(`${baseUrl}/qr-code`, { headers });
      const payload = await upstream.json().catch(() => ({})) as { value?: string; error?: string };
      if (!upstream.ok || !payload.value) {
        return json({ ok: false, error: payload.error ?? "Não foi possível gerar o QR Code." }, upstream.status || 400);
      }
      return json({ ok: true, qr_code: payload.value });
    }

    if (action === "configure_webhook") {
      const webhookUrl = `${supabaseUrl}/functions/v1/zapi-webhook?company_id=${encodeURIComponent(companyId)}`;
      const upstream = await fetch(`${baseUrl}/update-webhook-received`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ value: webhookUrl }),
      });
      const payload = await upstream.json().catch(() => ({})) as { value?: boolean; error?: string };
      if (!upstream.ok || payload.value !== true) {
        return json({ ok: false, error: payload.error ?? "Não foi possível configurar o webhook." }, upstream.status || 400);
      }
      await admin.from("zapi_integrations").update({
        webhook_configured: true,
        updated_at: new Date().toISOString(),
      }).eq("company_id", companyId);
      return json({ ok: true, webhook_configured: true, webhook_url: webhookUrl });
    }

    return json({ ok: false, error: "Ação desconhecida." }, 400);
  } catch (error) {
    console.error("zapi-admin", error);
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

async function getAesKey(secret: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encrypt(value: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await getAesKey(secret);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value));
  return `${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`;
}

async function decrypt(value: string, secret: string) {
  const [ivPart, dataPart] = value.split(".");
  if (!ivPart || !dataPart) throw new Error("Credencial cifrada inválida.");
  const key = await getAesKey(secret);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivPart) },
    key,
    fromBase64(dataPart),
  );
  return new TextDecoder().decode(decrypted);
}

function toBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}
