import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, Loader2, Mail, Plus, Trash2, UserX } from "lucide-react";
import { PageHeader } from "@/components/AppLayout";
import { Badge, Field, Modal } from "@/components/ui-kit";
import { useCompanyInvites, useCompanyMembers, useCurrentCompany, useDelete } from "@/lib/data";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/equipe")({
  component: Equipe,
});

const ROLES = [
  { value: "recepcao", label: "Recepcao" },
  { value: "limpeza", label: "Limpeza" },
  { value: "cafe", label: "Cafe" },
  { value: "dono", label: "Dono" },
] as const;

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

  async function sendInvite(row: { nome: string | null; email: string; role: string }) {
    if (!company.data?.id) {
      toast.error("Selecione uma empresa antes de convidar.");
      return;
    }

    setSending(true);
    try {
      const { error } = await supabase.functions.invoke("send-staff-invite", {
        body: {
          ...row,
          company_id: company.data.id,
          redirect_to: `${window.location.origin}/auth?convite=1`,
        },
      });

      if (error) throw error;
      toast.success("Convite enviado por e-mail. Ao aceitar, o acesso ja fica liberado.");
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["company_invites"] });
      await queryClient.invalidateQueries({ queryKey: ["company_members"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Nao foi possivel enviar o convite.");
    } finally {
      setSending(false);
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
    action: "remove_access" | "reset_password",
  ) {
    if (!company.data?.id) return;
    if (action === "remove_access" && member.role === "dono" && !window.confirm("Remover acesso de um dono?")) return;
    if (action === "remove_access" && !window.confirm("Remover o acesso deste usuario?")) return;

    setMemberAction(`${action}:${member.id}`);
    try {
      const { data, error } = await supabase.functions.invoke("manage-staff-access", {
        body: {
          action,
          company_id: company.data.id,
          member_id: member.id,
          user_id: member.user_id,
        },
      });

      if (error) throw error;
      if (data && typeof data === "object" && "error" in data) throw new Error(String(data.error));
      toast.success(action === "remove_access" ? "Acesso removido" : "E-mail de redefinicao enviado");
      await queryClient.invalidateQueries({ queryKey: ["company_members"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Nao foi possivel concluir a acao");
    } finally {
      setMemberAction(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Equipe"
        subtitle="Cadastre recepcionistas, limpeza e cafe. Cada perfil ve apenas o que precisa."
        action={
          <button onClick={() => setOpen(true)} className="btn-primary flex items-center gap-1.5">
            <Plus className="h-4 w-4" /> Convidar funcionario
          </button>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 xl:grid-cols-3">
        <div className="card-surface p-4">
          <h3 className="font-semibold text-pine-dark">1. Envie o convite</h3>
          <p className="mt-1 text-sm text-muted-foreground">O funcionario recebe um link seguro por e-mail.</p>
        </div>
        <div className="card-surface p-4">
          <h3 className="font-semibold text-pine-dark">2. Ele cria a senha</h3>
          <p className="mt-1 text-sm text-muted-foreground">Ao aceitar, ele define a senha no proprio sistema.</p>
        </div>
        <div className="card-surface p-4">
          <h3 className="font-semibold text-pine-dark">3. Acesso liberado</h3>
          <p className="mt-1 text-sm text-muted-foreground">O perfil escolhido ja fica pronto para entrar.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
        <section className="card-surface overflow-x-auto">
          <div className="border-b border-border p-4">
            <h3 className="font-serif text-lg font-bold">Usuarios ativos</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="p-3">Usuario</th>
                <th className="p-3">Perfil</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id} className="border-b border-border/50">
                  <td className="p-3 font-mono text-xs">{member.user_id}</td>
                  <td className="p-3"><Badge tone="pine">{member.role}</Badge></td>
                  <td className="p-3">{member.ativo ? "Ativo" : "Inativo"}</td>
                  <td className="p-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold text-pine transition hover:bg-muted disabled:opacity-60"
                        onClick={() => manageMember(member, "reset_password")}
                        disabled={memberAction === `reset_password:${member.id}`}
                        title="Enviar redefinicao de senha"
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
                        onClick={() => manageMember(member, "remove_access")}
                        disabled={!member.ativo || memberAction === `remove_access:${member.id}`}
                        title="Remover acesso"
                      >
                        {memberAction === `remove_access:${member.id}` ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <UserX className="h-3.5 w-3.5" />
                        )}
                        Remover
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="p-3">Email</th>
                <th className="p-3">Perfil</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {invites.map((invite) => (
                <tr key={invite.id} className="border-b border-border/50">
                  <td className="p-3">{invite.email}</td>
                  <td className="p-3"><Badge tone="brass">{invite.role}</Badge></td>
                  <td className="p-3">{invite.status}</td>
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
    </div>
  );
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
  const [role, setRole] = useState<(typeof ROLES)[number]["value"]>("recepcao");

  return (
    <Modal open onClose={onClose} title="Convidar funcionario">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ nome: nome || null, email, role });
        }}
      >
        <Field label="Nome">
          <input className="field" value={nome} onChange={(e) => setNome(e.target.value)} />
        </Field>
        <Field label="Email">
          <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Perfil">
          <select className="field" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </Field>
        <div className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          O funcionario recebe um e-mail de convite. Ao aceitar, ele ja entra com o perfil escolhido.
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost" disabled={sending}>Cancelar</button>
          <button type="submit" className="btn-primary inline-flex items-center gap-2" disabled={sending}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Enviar convite
          </button>
        </div>
      </form>
    </Modal>
  );
}
