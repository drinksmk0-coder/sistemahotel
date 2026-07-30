import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ManageBody = {
  action?: "remove_access" | "delete_employee" | "reset_password";
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
  const removesUser = body.action === "remove_access" || body.action === "delete_employee";
  if (body.user_id === requester.id && removesUser) {
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

  if (body.action === "delete_employee") {
    let memberQuery = admin
      .from("company_members")
      .select("id, role, user_id")
      .eq("company_id", body.company_id)
      .eq("user_id", body.user_id);
    if (body.member_id) memberQuery = memberQuery.eq("id", body.member_id);

    const { data: targetMember, error: memberError } = await memberQuery.maybeSingle();
    if (memberError) return json({ error: memberError.message }, 500);
    if (!targetMember) return json({ error: "Funcionario nao encontrado nesta empresa" }, 404);
    if (targetMember.role === "dono") {
      return json({ error: "A conta do dono nao pode ser excluida pela tela de equipe" }, 400);
    }

    const { data: targetUser, error: targetError } = await admin.auth.admin.getUserById(body.user_id);
    if (targetError || !targetUser.user) {
      return json({ error: "Nao foi possivel localizar o login do funcionario" }, 404);
    }

    const { count: otherMemberships, error: membershipsError } = await admin
      .from("company_members")
      .select("id", { count: "exact", head: true })
      .eq("user_id", body.user_id)
      .neq("company_id", body.company_id);
    if (membershipsError) return json({ error: membershipsError.message }, 500);

    if (targetUser.user.email) {
      await admin
        .from("company_invites")
        .delete()
        .eq("company_id", body.company_id)
        .eq("email", targetUser.user.email);
    }

    if ((otherMemberships ?? 0) > 0) {
      const { error: deleteMemberError } = await admin
        .from("company_members")
        .delete()
        .eq("id", targetMember.id)
        .eq("company_id", body.company_id);
      if (deleteMemberError) return json({ error: deleteMemberError.message }, 500);

      return json({
        ok: true,
        auth_user_deleted: false,
        message:
          "Funcionario excluido desta empresa. O login foi mantido porque ele participa de outra empresa.",
      });
    }

    const auditTables = ["clients", "complaints", "reservations", "sales"] as const;
    for (const table of auditTables) {
      const { error: auditError } = await admin
        .from(table)
        .update({ created_by: null })
        .eq("created_by", body.user_id);
      if (auditError) {
        return json(
          {
            error: `O historico impediu a exclusao do login: ${auditError.message}`,
          },
          500,
        );
      }
    }

    const { error: deleteUserError } = await admin.auth.admin.deleteUser(body.user_id);
    if (deleteUserError) {
      return json(
        {
          error: `Nao foi possivel excluir o login: ${deleteUserError.message}`,
        },
        500,
      );
    }

    return json({
      ok: true,
      auth_user_deleted: true,
      message: "Funcionario, perfil e login excluidos. O historico foi preservado.",
    });
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
