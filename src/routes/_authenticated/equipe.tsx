import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check,
  Copy,
  KeyRound,
  Link2,
  Loader2,
  Mail,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/AppLayout";
import { Badge, Field, Modal } from "@/components/ui-kit";
import {
  useCompanyInvites,
  useCompanyMembers,
  useCurrentCompany,
  useDelete,
} from "@/lib/data";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/equipe")({
  component: Equipe,
});

const ROLES = [
  { value: "recepcao", label: "Recepcionista" },
  { value: "limpeza", label: "Camareira / Governança" },
  { value: "cafe", label: "Atendente de A&B — Café" },
  { value: "dono", label: "Proprietário / Gestor" },
] as const;

type InviteResult = {
  invite_url: string;
  email_sent: boolean;
  message: string;
  email_error?: string;
};

function Equipe() {
  const company = useCurrentCompany();
  const { data: members = [] } = useCompanyMembers();
  const { data: invites = [] } = useCompanyInvites();
  const queryClient = useQueryClient();
  const deleteInvite = useDelete("company_invites", ["company_invites"]);
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [memberAction, setMemberAction] = useState<string | null>(null);
  const [generatedInvite, setGeneratedInvite] = useState<InviteResult | null>(null);
  const [copied, setCopied] = useState(false);

  async function sendInvite(row: {
    nome: string | null;
    email: string;
    role: string;
  }) {
    if (!company.data?.id) {
      toast.error("Selecione uma empresa antes de convidar.");
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "send-staff-invite",
        {
          body: {
            ...row,
            company_id: company.data.id,
            redirect_to: `${window.location.origin}/auth?convite=1`,
          },
        },
      );

      if (error) throw new Error(await getFunctionErrorMessage(error));
      if (!data || typeof data !== "object") {
        throw new Error("O servidor não retornou o link do convite.");
      }
      if ("error" in data) throw new Error(String(data.error));

      const result = data as InviteResult;
      setOpen(false);
      setGeneratedInvite(result);
      setCopied(false);
      toast.success(
        result.email_sent
          ? "Convite HospedaMais enviado por e-mail."
          : "Link seguro criado. Copie e envie para a pessoa convidada.",
      );
      await queryClient.invalidateQueries({ queryKey: ["company_invites"] });
      await queryClient.invalidateQueries({ queryKey: ["company_members"] });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Não foi possível criar o convite.",
      );
    } finally {
      setSending(false);
    }
  }

  async function copyInviteLink() {
    if (!generatedInvite?.invite_url) return;
    try {
      await navigator.clipboard.writeText(generatedInvite.invite_url);
      setCopied(true);
      toast.success("Link copiado");
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Não foi possível copiar automaticamente. Selecione o link.");
    }
  }

  function cancelInvite(invite: { id: string; email: string }) {
    if (!window.confirm(`Cancelar o convite de ${invite.email}?`)) return;
    setCancelingId(invite.id);
    deleteInvite.mutate(invite.id, {
      onSuccess: async () => {
        toast.success("Convite cancelado");
        await queryClient.invalidateQueries({ queryKey: ["company_invites"] });
      },
      onError: (err) => toast.error(err.message),
      onSettled: () => setCancelingId(null),
    });
  }

  async function manageMember(
    member: { id: string; user_id: string; role: string },
    action: "remove_access" | "delete_employee" | "reset_password",
  ) {
    if (!company.data?.id) return;
    if (action === "remove_access" && member.role === "dono") {
      toast.error(
        "Acesso de proprietário não é removido por esta tela. Use o administrador da plataforma.",
      );
      return;
    }
    if (
      action === "remove_access" &&
      !window.confirm("Desativar o acesso deste usuário?")
    ) {
      return;
    }
    if (
      action === "delete_employee" &&
      !window.confirm(
        "Excluir este funcionário definitivamente?\n\nO acesso, perfil e login serão removidos. Reservas, vendas e históricos serão preservados.",
      )
    ) {
      return;
    }

    setMemberAction(`${action}:${member.id}`);
    try {
      const { data, error } = await supabase.functions.invoke(
        "manage-staff-access",
        {
          body: {
            action,
            company_id: company.data.id,
            member_id: member.id,
            user_id: member.user_id,
          },
        },
      );

      if (error) throw new Error(await getFunctionErrorMessage(error));
      if (data && typeof data === "object" && "error" in data) {
        throw new Error(String(data.error));
      }
      const response = data as { message?: string } | null;
      toast.success(
        action === "delete_employee"
          ? response?.message ?? "Funcionário excluído"
          : action === "remove_access"
            ? "Acesso removido"
            : "Link de redefinição solicitado",
      );
      await queryClient.invalidateQueries({ queryKey: ["company_members"] });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Não foi possível concluir a ação",
      );
    } finally {
      setMemberAction(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Equipe e acessos"
        subtitle="Convide proprietários e funcionários. Cada perfil recebe apenas as informações necessárias para sua função."
        action={
          <button
            onClick={() => setOpen(true)}
            className="btn-primary flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" /> Convidar pessoa
          </button>
        }
      />

      <section className="mb-4 rounded-xl border border-primary/25 bg-primary/5 p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <h2 className="text-sm font-bold text-pine-dark">
              Acesso separado por responsabilidade
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              O proprietário vê gestão e análises. A recepção opera reservas e
              hóspedes. Governança e Café usam somente o quadro operacional, sem
              nomes, pagamentos ou relatórios financeiros.
            </p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
        <section className="card-surface overflow-x-auto">
          <div className="border-b border-border p-4">
            <h3 className="font-serif text-lg font-bold">Usuários cadastrados</h3>
          </div>
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="p-3">Identificador</th>
                <th className="p-3">Função</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id} className="border-b border-border/50">
                  <td className="p-3 font-mono text-xs">{member.user_id}</td>
                  <td className="p-3">
                    <Badge tone="pine">{roleLabel(member.role)}</Badge>
                  </td>
                  <td className="p-3">
                    <Badge tone={member.ativo ? "sage" : "slate"}>
                      {member.ativo ? "ativo" : "inativo"}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold text-pine transition hover:bg-muted disabled:opacity-60"
                        onClick={() => manageMember(member, "reset_password")}
                        disabled={
                          memberAction === `reset_password:${member.id}`
                        }
                        title="Gerar redefinição de senha"
                      >
                        {memberAction === `reset_password:${member.id}` ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <KeyRound className="h-3.5 w-3.5" />
                        )}
                        Senha
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                        onClick={() =>
                          manageMember(member, "delete_employee")
                        }
                        disabled={
                          member.role === "dono" ||
                          memberAction === `delete_employee:${member.id}`
                        }
                        title={
                          member.role === "dono"
                            ? "Proprietários não podem ser excluídos por esta tela"
                            : "Excluir funcionário e login"
                        }
                      >
                        {memberAction === `delete_employee:${member.id}` ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card-surface overflow-x-auto">
          <div className="border-b border-border p-4">
            <h3 className="font-serif text-lg font-bold">Convites</h3>
          </div>
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="p-3">E-mail</th>
                <th className="p-3">Função</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {invites.map((invite) => (
                <tr key={invite.id} className="border-b border-border/50">
                  <td className="p-3">{invite.email}</td>
                  <td className="p-3">
                    <Badge tone="brass">{roleLabel(invite.role)}</Badge>
                  </td>
                  <td className="p-3">{inviteStatusLabel(invite.status)}</td>
                  <td className="p-3 text-right">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                      onClick={() => cancelInvite(invite)}
                      disabled={cancelingId === invite.id}
                      title="Cancelar convite"
                    >
                      {cancelingId === invite.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      Cancelar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      {open && (
        <InviteForm
          onClose={() => setOpen(false)}
          onSave={sendInvite}
          sending={sending}
        />
      )}

      {generatedInvite && (
        <Modal
          open
          onClose={() => setGeneratedInvite(null)}
          title={
            generatedInvite.email_sent
              ? "Convite enviado"
              : "Link de convite HospedaMais"
          }
        >
          <div className="space-y-3">
            <div
              className={`rounded-lg border p-3 text-sm ${
                generatedInvite.email_sent
                  ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                  : "border-brass/40 bg-brass-bg text-pine-dark"
              }`}
            >
              {generatedInvite.message}
            </div>
            {!generatedInvite.email_sent && (
              <>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  O envio automático personalizado será liberado quando um
                  domínio e um remetente da HospedaMais forem verificados. Até
                  lá, nenhum e-mail com marca Supabase será disparado.
                </p>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                    Link individual
                  </span>
                  <textarea
                    className="field min-h-24 break-all font-mono text-[11px]"
                    value={generatedInvite.invite_url}
                    readOnly
                  />
                </label>
                <button
                  type="button"
                  className="btn-primary inline-flex w-full items-center justify-center gap-2"
                  onClick={copyInviteLink}
                >
                  {copied ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  {copied ? "Link copiado" : "Copiar link de convite"}
                </button>
              </>
            )}
            {generatedInvite.email_error && (
              <p className="rounded-lg border border-brick/30 bg-brick-bg p-2 text-xs text-brick">
                {generatedInvite.email_error}
              </p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

async function getFunctionErrorMessage(error: unknown) {
  const context = (error as { context?: Response }).context;
  if (context) {
    try {
      const payload = await context.clone().json();
      if (payload?.error) return String(payload.error);
    } catch {
      try {
        const text = await context.clone().text();
        if (text) return text;
      } catch {
        // Usa mensagem genérica abaixo.
      }
    }
  }
  return error instanceof Error ? error.message : "Erro na função do servidor";
}

function InviteForm({
  onClose,
  onSave,
  sending,
}: {
  onClose: () => void;
  onSave: (row: { nome: string | null; email: string; role: string }) => void;
  sending: boolean;
}) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] =
    useState<(typeof ROLES)[number]["value"]>("recepcao");

  return (
    <Modal open onClose={onClose} title="Convidar pessoa">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({
            nome: nome.trim() || null,
            email: email.trim().toLowerCase(),
            role,
          });
        }}
      >
        <Field label="Nome">
          <input
            className="field"
            value={nome}
            onChange={(event) => setNome(event.target.value)}
            maxLength={120}
          />
        </Field>
        <Field label="E-mail">
          <input
            className="field"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            maxLength={255}
          />
        </Field>
        <Field label="Função">
          <select
            className="field"
            value={role}
            onChange={(event) => setRole(event.target.value as typeof role)}
          >
            {ROLES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>
        {role === "dono" && (
          <div className="rounded-lg border border-brass/40 bg-brass-bg px-3 py-2 text-xs text-pine-dark">
            Este perfil terá acesso completo aos dados e à gestão do hotel. O
            administrador da plataforma HospedaMais continuará protegido.
          </div>
        )}
        <div className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          <div className="flex items-start gap-2">
            <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              Será criado um link individual. O envio por e-mail com a marca
              HospedaMais ocorre somente quando o remetente próprio estiver
              configurado.
            </span>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost"
            disabled={sending}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="btn-primary inline-flex items-center gap-2"
            disabled={sending}
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            Criar convite
          </button>
        </div>
      </form>
    </Modal>
  );
}

function roleLabel(role: string) {
  return ROLES.find((item) => item.value === role)?.label ?? role;
}

function inviteStatusLabel(status: string) {
  const labels: Record<string, string> = {
    enviado: "E-mail enviado",
    link_gerado: "Link gerado",
    acesso_liberado: "Acesso liberado",
    aceito: "Aceito",
    cancelado: "Cancelado",
  };
  return labels[status] ?? status;
}
