import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type InviteBody = {
  company_id?: string;
  email?: string;
  nome?: string | null;
  role?: "dono" | "recepcao" | "limpeza" | "cafe";
  redirect_to?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "Metodo nao permitido" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Ambiente Supabase incompleto" }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Login obrigatorio" }, 401);

  const body = (await req.json().catch(() => ({}))) as InviteBody;
  const email = body.email?.trim().toLowerCase();
  const role = body.role ?? "recepcao";
  const allowedRoles = new Set(["dono", "recepcao", "limpeza", "cafe"]);

  if (!body.company_id || !email || !allowedRoles.has(role)) {
    return json({ error: "Dados do convite invalidos" }, 400);
  }

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
  if (!owner) return json({ error: "Apenas o dono pode convidar funcionarios" }, 403);

  const redirectTo = body.redirect_to || `${new URL(req.url).origin}/auth?convite=1`;
  const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: {
      nome: body.nome ?? "",
      company_id: body.company_id,
      role,
    },
    redirectTo,
  });

  if (inviteError) return json({ error: inviteError.message }, 400);
  const invitedUserId = inviteData.user?.id;
  if (!invitedUserId) return json({ error: "Convite enviado sem usuario retornado" }, 500);

  const { error: inviteRowError } = await admin.from("company_invites").upsert(
    {
      company_id: body.company_id,
      email,
      nome: body.nome ?? null,
      role,
      status: "enviado",
      invited_by: requester.id,
    },
    { onConflict: "company_id,email" },
  );
  if (inviteRowError) return json({ error: inviteRowError.message }, 500);

  const { error: memberError } = await admin.from("company_members").upsert(
    {
      company_id: body.company_id,
      user_id: invitedUserId,
      role,
      ativo: true,
    },
    { onConflict: "company_id,user_id" },
  );
  if (memberError) return json({ error: memberError.message }, 500);

  return json({ ok: true, user_id: invitedUserId });
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
