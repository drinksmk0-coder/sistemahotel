import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Plus } from "lucide-react";
import { PageHeader } from "@/components/AppLayout";
import { Badge, Field, Modal } from "@/components/ui-kit";
import { useCompanyInvites, useCompanyMembers, useInsert } from "@/lib/data";
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
  const { data: members = [] } = useCompanyMembers();
  const { data: invites = [] } = useCompanyInvites();
  const insertInvite = useInsert("company_invites", ["company_invites"]);
  const insertMember = useInsert("company_members", ["company_members"]);
  const [open, setOpen] = useState(false);

  async function activateInvite(invite: { email: string; role: string }) {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, email")
      .eq("email", invite.email)
      .maybeSingle();

    if (error) {
      toast.error(error.message);
      return;
    }

    if (!profile?.id) {
      toast.error("Esse email ainda nao criou login. Peca para o funcionario criar a conta primeiro.");
      return;
    }

    insertMember.mutate(
      { user_id: profile.id, role: invite.role, ativo: true },
      {
        onSuccess: () => toast.success("Funcionario ativado com esse perfil"),
        onError: (e) => toast.error(e.message),
      },
    );
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
                <th className="p-3">Acesso</th>
              </tr>
            </thead>
            <tbody>
              {invites.map((invite) => (
                <tr key={invite.id} className="border-b border-border/50">
                  <td className="p-3">{invite.email}</td>
                  <td className="p-3"><Badge tone="brass">{invite.role}</Badge></td>
                  <td className="p-3">{invite.status}</td>
                  <td className="p-3">
                    <button
                      className="btn-primary inline-flex items-center gap-1.5 text-xs"
                      onClick={() => activateInvite(invite)}
                      disabled={insertMember.isPending}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Ativar
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
          onSave={(row) =>
            insertInvite.mutate(row, {
              onSuccess: () => {
                toast.success("Convite registrado");
                setOpen(false);
              },
              onError: (e) => toast.error(e.message),
            })
          }
        />
      )}
    </div>
  );
}

function InviteForm({ onClose, onSave }: { onClose: () => void; onSave: (row: Record<string, unknown>) => void }) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]["value"]>("recepcao");

  return (
    <Modal open onClose={onClose} title="Convidar funcionario">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ nome: nome || null, email, role, status: "pendente" });
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
          Depois que o funcionario criar login com esse email, clique em Ativar na lista de convites.
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
          <button type="submit" className="btn-primary">Salvar convite</button>
        </div>
      </form>
    </Modal>
  );
}
