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

type AdminClient = ReturnType<typeof createClient>;

const APP_URL = "https://sistemahotel-two.vercel.app";
const BRAND_NAME = "HospedaMais";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") {
    return json({ error: "Método não permitido" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Ambiente Supabase incompleto" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Login obrigatório" }, 401);

  const body = (await req.json().catch(() => ({}))) as InviteBody;
  const email = body.email?.trim().toLowerCase();
  const role = body.role ?? "recepcao";
  const allowedRoles = new Set(["dono", "recepcao", "limpeza", "cafe"]);

  if (!body.company_id || !email || !allowedRoles.has(role)) {
    return json({ error: "Dados do convite inválidos" }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  const { data: requesterData, error: requesterError } =
    await admin.auth.getUser(jwt);
  const requester = requesterData.user;
  if (requesterError || !requester) {
    return json({ error: "Sessão inválida" }, 401);
  }

  const { data: owner, error: ownerError } = await admin
    .from("company_members")
    .select("id")
    .eq("company_id", body.company_id)
    .eq("user_id", requester.id)
    .eq("role", "dono")
    .eq("ativo", true)
    .maybeSingle();
  if (ownerError) return json({ error: ownerError.message }, 500);
  if (!owner) {
    return json({ error: "Apenas um proprietário pode convidar a equipe" }, 403);
  }

  const { data: company, error: companyError } = await admin
    .from("companies")
    .select("nome")
    .eq("id", body.company_id)
    .maybeSingle();
  if (companyError) return json({ error: companyError.message }, 500);
  if (!company) return json({ error: "Hotel não encontrado" }, 404);

  const redirectTo = safeSystemRedirect(body.redirect_to);
  const existingUser = await findUserByEmail(admin, email);
  const link = await generateAccessLink({
    admin,
    email,
    existing: Boolean(existingUser),
    redirectTo,
    metadata: {
      nome: body.nome ?? "",
      company_id: body.company_id,
      company_name: company.nome,
      role,
      app_name: BRAND_NAME,
    },
  });

  if (!link.userId || !link.actionLink) {
    return json({ error: "Não foi possível gerar o link seguro" }, 500);
  }

  const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
  const fromEmail = Deno.env.get("HOSPEDAMAIS_FROM_EMAIL")?.trim();
  let emailSent = false;
  let emailError = "";

  if (resendKey && fromEmail) {
    const result = await sendBrandedEmail({
      apiKey: resendKey,
      fromEmail,
      to: email,
      recipientName: body.nome ?? "",
      companyName: company.nome,
      role,
      actionLink: link.actionLink,
    });
    emailSent = result.ok;
    emailError = result.error ?? "";
  }

  const status = emailSent
    ? "enviado"
    : existingUser
      ? "acesso_liberado"
      : "link_gerado";

  const { error: inviteRowError } = await admin
    .from("company_invites")
    .upsert(
      {
        company_id: body.company_id,
        email,
        nome: body.nome ?? null,
        role,
        status,
        invited_by: requester.id,
      },
      { onConflict: "company_id,email" },
    );
  if (inviteRowError) return json({ error: inviteRowError.message }, 500);

  const { error: memberError } = await admin
    .from("company_members")
    .upsert(
      {
        company_id: body.company_id,
        user_id: link.userId,
        role,
        ativo: true,
      },
      { onConflict: "company_id,user_id" },
    );
  if (memberError) return json({ error: memberError.message }, 500);

  return json({
    ok: true,
    user_id: link.userId,
    status,
    invite_url: link.actionLink,
    email_sent: emailSent,
    email_branding: emailSent ? "hospedamais" : "manual_link",
    email_error: emailError || undefined,
    message: emailSent
      ? `Convite HospedaMais enviado para ${email}.`
      : "Link seguro gerado. Copie e envie ao usuário; nenhum e-mail com marca Supabase foi disparado.",
  });
});

async function generateAccessLink({
  admin,
  email,
  existing,
  redirectTo,
  metadata,
}: {
  admin: AdminClient;
  email: string;
  existing: boolean;
  redirectTo: string;
  metadata: Record<string, unknown>;
}) {
  const { data, error } = await admin.auth.admin.generateLink({
    type: existing ? "recovery" : "invite",
    email,
    options: {
      redirectTo,
      data: metadata,
    },
  });
  if (error) throw error;

  return {
    userId: data.user?.id ?? null,
    actionLink: data.properties?.action_link ?? null,
  };
}

async function sendBrandedEmail({
  apiKey,
  fromEmail,
  to,
  recipientName,
  companyName,
  role,
  actionLink,
}: {
  apiKey: string;
  fromEmail: string;
  to: string;
  recipientName: string;
  companyName: string;
  role: string;
  actionLink: string;
}) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${BRAND_NAME} <${fromEmail}>`,
      to: [to],
      subject: `Convite para acessar a ${BRAND_NAME}`,
      html: inviteEmailHtml({
        recipientName,
        companyName,
        role,
        actionLink,
      }),
    }),
  });

  if (response.ok) return { ok: true };
  const payload = await response.text().catch(() => "");
  return {
    ok: false,
    error: `Falha no envio personalizado (${response.status}): ${payload.slice(0, 180)}`,
  };
}

function inviteEmailHtml({
  recipientName,
  companyName,
  role,
  actionLink,
}: {
  recipientName: string;
  companyName: string;
  role: string;
  actionLink: string;
}) {
  const greeting = recipientName.trim()
    ? `Olá, ${escapeHtml(recipientName.trim())}!`
    : "Olá!";
  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;background:#f4f7fa;font-family:Arial,sans-serif;color:#071a38">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #dce5ef;border-radius:16px;overflow:hidden">
          <tr><td style="padding:24px;background:linear-gradient(135deg,#2878e8,#135a8a);color:#fff">
            <div style="font-size:24px;font-weight:800">HospedaMais</div>
            <div style="font-size:13px;opacity:.85;margin-top:4px">Gestão hoteleira inteligente</div>
          </td></tr>
          <tr><td style="padding:26px">
            <p style="font-size:16px;font-weight:700;margin:0 0 14px">${greeting}</p>
            <p style="font-size:14px;line-height:1.6;margin:0 0 16px">
              Você foi convidado para acessar <strong>${escapeHtml(companyName)}</strong> na HospedaMais com o perfil <strong>${escapeHtml(roleLabel(role))}</strong>.
            </p>
            <p style="margin:24px 0;text-align:center">
              <a href="${escapeHtml(actionLink)}" style="display:inline-block;background:#2878e8;color:#fff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:10px">Aceitar convite</a>
            </p>
            <p style="font-size:12px;line-height:1.5;color:#5d6b7a;margin:0">
              Este link é individual. Não encaminhe para outra pessoa. Caso você não reconheça o convite, ignore esta mensagem.
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function roleLabel(role: string) {
  const labels: Record<string, string> = {
    dono: "Proprietário / Gestor",
    recepcao: "Recepcionista",
    limpeza: "Camareira / Governança",
    cafe: "Atendente de A&B — Café",
  };
  return labels[role] ?? role;
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[character] ?? character,
  );
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function safeSystemRedirect(_value?: string) {
  return `${APP_URL}/auth?convite=1`;
}

async function findUserByEmail(admin: AdminClient, email: string) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw error;
    const found = data.users.find(
      (user) => user.email?.toLowerCase() === email,
    );
    if (found) return found;
    if (data.users.length < 1000) return null;
  }
  return null;
}
