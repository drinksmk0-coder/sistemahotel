import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ManageBody = {
  action?: "remove_access" | "reset_password";
  company_id?: string;
  member_id?: string;
  user_id?: string;
};

const RESET_URL = "https://sistemahotel-three.vercel.app/auth?redefinir=1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "Metodo nao permitido" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Ambiente Supabase incompleto" }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Login obrigatorio" }, 401);

  const body = (await req.json().catch(() => ({}))) as ManageBody;
  if (!body.company_id || !body.user_id || !body.action) return json({ error: "Dados invalidos" }, 400);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const jwt = authHeader.replace("Bearer ", "");
  const { data: requesterData, error: requesterError } = await admin.auth.getUser(jwt);
  const requester = requesterData.user;
  if (requesterError || !requester) return json({ error: "Sessao invalida" }, 401);

  const { data: owner, error: ownerError } = await admin
    .from("company_members")
    .select("id")
    .eq("company_id", body.company_id)
    .eq("user_id", requester.id)
    .eq("role", "dono")
    .eq("ativo", true)
    .maybeSingle();

  if (ownerError) return json({ error: ownerError.message }, 500);
  if (!owner) return json({ error: "Apenas o dono pode alterar acessos" }, 403);
  if (body.user_id === requester.id && body.action === "remove_access") {
    return json({ error: "Voce nao pode remover seu proprio acesso" }, 400);
  }

  if (body.action === "remove_access") {
    let query = admin
      .from("company_members")
      .update({ ativo: false })
      .eq("company_id", body.company_id)
      .eq("user_id", body.user_id);

    if (body.member_id) query = query.eq("id", body.member_id);
    const { error } = await query;
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  const { data: target, error: targetError } = await admin.auth.admin.getUserById(body.user_id);
  if (targetError || !target.user?.email) return json({ error: "Nao foi possivel localizar o e-mail do usuario" }, 404);

  const { error: resetError } = await admin.auth.resetPasswordForEmail(target.user.email, {
    redirectTo: RESET_URL,
  });
  if (resetError) return json({ error: resetError.message }, 500);

  return json({ ok: true, email: target.user.email });
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
