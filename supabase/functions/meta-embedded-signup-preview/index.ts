import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Body = {
  action?: "config" | "status" | "complete";
  company_id?: string;
  code?: string;
  waba_id?: string;
  phone_number_id?: string;
  business_id?: string;
};

type Row = Record<string, unknown>;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return out({ ok: true });
  if (req.method !== "POST") return out({ ok: false, error: "Método não permitido." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const authorization = req.headers.get("Authorization") ?? "";
    if (!supabaseUrl || !serviceRole) return out({ ok: false, error: "Ambiente incompleto." }, 500);
    if (!authorization) return out({ ok: false, error: "Login obrigatório." }, 401);

    const body = (await req.json().catch(() => ({}))) as Body;
    const companyId = String(body.company_id ?? "").trim();
    const action = body.action ?? "status";
    if (!isUuid(companyId)) return out({ ok: false, error: "Empresa inválida." }, 400);

    const admin = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const jwt = authorization.replace(/^Bearer\s+/i, "");
    const { data: authData, error: authError } = await admin.auth.getUser(jwt);
    if (authError || !authData.user) return out({ ok: false, error: "Sessão inválida." }, 401);

    const { data: member } = await admin
      .from("company_members")
      .select("role")
      .eq("company_id", companyId)
      .eq("user_id", authData.user.id)
      .eq("ativo", true)
      .maybeSingle();
    if (!member || String(member.role) !== "dono") {
      return out({ ok: false, error: "Somente o proprietário pode conectar o WhatsApp." }, 403);
    }

    const { data: existing } = await admin
      .from("meta_integrations")
      .select("app_id,app_secret_encrypted,whatsapp_access_token_encrypted,whatsapp_phone_number_id,whatsapp_business_account_id,webhook_verified,updated_at")
      .eq("company_id", companyId)
      .maybeSingle();

    const graphVersion = normalizeGraphVersion(Deno.env.get("META_GRAPH_VERSION") ?? "v23.0");
    const appId = String(Deno.env.get("META_APP_ID") ?? existing?.app_id ?? "").trim();
    const configId = String(Deno.env.get("META_EMBEDDED_SIGNUP_CONFIG_ID") ?? "").trim();
    const connected = Boolean(
      existing?.whatsapp_access_token_encrypted &&
      existing?.whatsapp_phone_number_id &&
      existing?.whatsapp_business_account_id,
    );

    if (action === "config" || action === "status") {
      return out({
        ok: true,
        ready: Boolean(appId && configId),
        connected,
        app_id: appId || null,
        config_id: configId || null,
        graph_version: graphVersion,
        phone_number_id: existing?.whatsapp_phone_number_id ?? null,
        waba_id: existing?.whatsapp_business_account_id ?? null,
        webhook_verified: existing?.webhook_verified === true,
        updated_at: existing?.updated_at ?? null,
        missing_platform_config: [
          !appId && "META_APP_ID",
          !configId && "META_EMBEDDED_SIGNUP_CONFIG_ID",
        ].filter(Boolean),
      });
    }

    if (action !== "complete") return out({ ok: false, error: "Ação desconhecida." }, 400);
    const code = String(body.code ?? "").trim();
    const wabaId = String(body.waba_id ?? "").trim();
    const phoneNumberId = String(body.phone_number_id ?? "").trim();
    if (!code) return out({ ok: false, error: "A Meta não devolveu o código de autorização." }, 400);
    if (!wabaId || !phoneNumberId) {
      return out({ ok: false, error: "Conclua a seleção da conta e do número dentro da janela da Meta." }, 400);
    }
    if (!appId) return out({ ok: false, error: "Meta App ID ainda não configurado na plataforma." }, 503);

    const encryptionSecret = Deno.env.get("META_ENCRYPTION_KEY") || serviceRole;
    let appSecret = String(Deno.env.get("META_APP_SECRET") ?? "").trim();
    if (!appSecret && existing?.app_secret_encrypted) {
      appSecret = await decrypt(String(existing.app_secret_encrypted), encryptionSecret).catch(() => "");
    }
    if (!appSecret) {
      return out({ ok: false, error: "Meta App Secret ainda não configurado no servidor." }, 503);
    }

    const tokenUrl = new URL(`https://graph.facebook.com/${graphVersion}/oauth/access_token`);
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("code", code);
    const tokenResponse = await fetch(tokenUrl, { method: "GET", signal: AbortSignal.timeout(20_000) });
    const tokenPayload = (await tokenResponse.json().catch(() => ({}))) as Row;
    const accessToken = String(tokenPayload.access_token ?? "").trim();
    if (!tokenResponse.ok || !accessToken) {
      console.error("meta embedded signup token exchange failed", tokenResponse.status);
      return out({ ok: false, error: "A Meta não concluiu a autorização. Tente conectar novamente." }, 502);
    }

    const subscribeResponse = await fetch(
      `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(wabaId)}/subscribed_apps`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(20_000),
      },
    );
    const subscribePayload = (await subscribeResponse.json().catch(() => ({}))) as Row;
    const subscribed = subscribeResponse.ok && subscribePayload.success !== false;
    if (!subscribed) {
      console.error("meta embedded signup subscribe failed", subscribeResponse.status);
    }

    let displayPhone: string | null = null;
    let verifiedName: string | null = null;
    try {
      const phoneResponse = await fetch(
        `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name`,
        { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15_000) },
      );
      if (phoneResponse.ok) {
        const phonePayload = (await phoneResponse.json()) as Row;
        displayPhone = text(phonePayload.display_phone_number);
        verifiedName = text(phonePayload.verified_name);
      }
    } catch {
      // A conexão principal não depende da leitura do nome exibido.
    }

    const encryptedToken = await encrypt(accessToken, encryptionSecret);
    const { error: integrationError } = await admin.from("meta_integrations").upsert(
      {
        company_id: companyId,
        app_id: appId,
        whatsapp_access_token_encrypted: encryptedToken,
        whatsapp_phone_number_id: phoneNumberId,
        whatsapp_business_account_id: wabaId,
        webhook_verified: subscribed,
        auto_reply_enabled: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id" },
    );
    if (integrationError) return out({ ok: false, error: integrationError.message }, 400);

    const { data: channel } = await admin
      .from("company_integrations")
      .select("id,configuracao")
      .eq("company_id", companyId)
      .eq("tipo", "whatsapp_business")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const channelConfig = {
      ...((channel?.configuracao && typeof channel.configuracao === "object") ? channel.configuracao : {}),
      connection_mode: "meta_embedded_signup",
      business_id: text(body.business_id),
      business_account_id: wabaId,
      phone_number_id: phoneNumberId,
      display_phone_number: displayPhone,
      verified_name: verifiedName,
      webhook_subscribed: subscribed,
      connected_at: new Date().toISOString(),
    };
    if (channel?.id) {
      await admin.from("company_integrations").update({
        nome: verifiedName ? `WhatsApp — ${verifiedName}` : "WhatsApp Business",
        identificador: displayPhone || phoneNumberId,
        ativo: true,
        configuracao: channelConfig,
        observacoes: "Conectado automaticamente pela Plataforma Comercial do WhatsApp.",
        updated_at: new Date().toISOString(),
      }).eq("id", channel.id).eq("company_id", companyId);
    } else {
      await admin.from("company_integrations").insert({
        company_id: companyId,
        tipo: "whatsapp_business",
        nome: verifiedName ? `WhatsApp — ${verifiedName}` : "WhatsApp Business",
        identificador: displayPhone || phoneNumberId,
        ativo: true,
        configuracao: channelConfig,
        observacoes: "Conectado automaticamente pela Plataforma Comercial do WhatsApp.",
      });
    }

    return out({
      ok: true,
      connected: true,
      webhook_subscribed: subscribed,
      display_phone_number: displayPhone,
      verified_name: verifiedName,
      phone_number_id: phoneNumberId,
      waba_id: wabaId,
      auto_reply_enabled: false,
    });
  } catch (error) {
    console.error("meta-embedded-signup-preview", error instanceof Error ? error.name : "unknown");
    return out({ ok: false, error: "Não foi possível concluir a conexão com a Meta agora." }, 500);
  }
});

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeGraphVersion(value: string) {
  const clean = value.trim();
  return /^v\d+\.\d+$/.test(clean) ? clean : "v23.0";
}

function text(value: unknown) {
  const result = String(value ?? "").trim();
  return result || null;
}

async function cryptoKey(secret: string, usages: KeyUsage[]) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, usages);
}

async function encrypt(value: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await cryptoKey(secret, ["encrypt"]),
    new TextEncoder().encode(value),
  );
  return `${b64(iv)}.${b64(new Uint8Array(encrypted))}`;
}

async function decrypt(value: string, secret: string) {
  const [ivPart, encryptedPart] = value.split(".");
  if (!ivPart || !encryptedPart) throw new Error("encrypted_value_invalid");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64(ivPart) },
    await cryptoKey(secret, ["decrypt"]),
    unb64(encryptedPart),
  );
  return new TextDecoder().decode(decrypted);
}

function b64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}

function unb64(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function out(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
