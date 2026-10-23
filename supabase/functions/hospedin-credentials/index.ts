import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const encryptionKeyB64 = Deno.env.get("HOSPEDIN_CREDENTIALS_ENCRYPTION_KEY") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !encryptionKeyB64) {
    return json({ error: "A função segura ainda não foi configurada no servidor." }, 503);
  }

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Autenticação obrigatória." }, 401);

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: authError } = await authClient.auth.getUser();
  const user = userData.user;
  if (authError || !user) return json({ error: "Sessão inválida. Entre novamente no sistema." }, 401);

  const body = await req.json().catch(() => null) as {
    companyId?: unknown; clientId?: unknown; clientSecret?: unknown;
  } | null;
  const companyId = typeof body?.companyId === "string" ? body.companyId : "";
  const clientId = typeof body?.clientId === "string" ? body.clientId.trim() : "";
  const clientSecret = typeof body?.clientSecret === "string" ? body.clientSecret : "";
  if (!isUuid(companyId) || !clientId || !clientSecret || clientId.length > 500 || clientSecret.length > 4000) {
    return json({ error: "Informe um Client ID, Client Secret e empresa válidos." }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: isMember, error: membershipError } = await admin.rpc("is_company_member", {
    _company_id: companyId,
    _user_id: user.id,
  });
  if (membershipError || !isMember) return json({ error: "Você não tem acesso a esta empresa." }, 403);

  try {
    const rawKey = Uint8Array.from(atob(encryptionKeyB64), (char) => char.charCodeAt(0));
    if (rawKey.byteLength !== 32) throw new Error("A chave de criptografia precisa ter 32 bytes em Base64.");
    const key = await crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["encrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(clientSecret),
    );
    const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
    const { error: saveError } = await admin.from("hospedin_credentials").upsert({
      company_id: companyId,
      client_id: clientId,
      encrypted_client_secret: toBase64(new Uint8Array(encrypted)),
      secret_iv: toBase64(iv),
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "company_id" });
    if (saveError) throw saveError;
    return json({ ok: true, message: "Credenciais armazenadas com criptografia." });
  } catch (error) {
    console.error("Hospedin credential storage failed:", error instanceof Error ? error.message : "unknown error");
    return json({ error: "Não foi possível armazenar as credenciais com segurança." }, 500);
  }
});

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
