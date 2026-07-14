import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Mail, Plus } from "lucide-react";
import { PageHeader } from "@/components/AppLayout";
import { Badge, Field, Modal } from "@/components/ui-kit";
import { useCompanyInvites, useCompanyMembers, useCurrentCompany } from "@/lib/data";
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
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);

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
          <h3 className="font-semibold text-pine-dark">1. Funcionario cria login</h3>
          <p className="mt-1 text-sm text-muted-foreground">Use o mesmo link do sistema e cadastre o email dele.</p>
        </div>
        <div className="card-surface p-4">
          <h3 className="font-semibold text-pine-dark">2. Voce registra o convite</h3>
          <p className="mt-1 text-sm text-muted-foreground">Escolha recepcao, limpeza ou cafe.</p>
        </div>
        <div className="card-surface p-4">
          <h3 className="font-semibold text-pine-dark">3. Clique em ativar</h3>
          <p className="mt-1 text-sm text-muted-foreground">O sistema libera a tela correta para aquele email.</p>
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
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id} className="border-b border-border/50">
                  <td className="p-3 font-mono text-xs">{member.user_id}</td>
                  <td className="p-3"><Badge tone="pine">{member.role}</Badge></td>
                  <td className="p-3">{member.ativo ? "Ativo" : "Inativo"}</td>
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
              </tr>
            </thead>
            <tbody>
              {invites.map((invite) => (
                <tr key={invite.id} className="border-b border-border/50">
                  <td className="p-3">{invite.email}</td>
                  <td className="p-3"><Badge tone="brass">{invite.role}</Badge></td>
                  <td className="p-3">{invite.status}</td>
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
