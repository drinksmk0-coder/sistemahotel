import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/AppLayout";
import { Badge, Field, Modal } from "@/components/ui-kit";
import { useCompanyInvites, useCompanyMembers, useInsert } from "@/lib/data";

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
  const [open, setOpen] = useState(false);

  return (
    <div>
      <PageHeader
        title="Equipe"
        subtitle="Cadastre recepcionistas e prepare perfis futuros para limpeza e cafe."
        action={
          <button onClick={() => setOpen(true)} className="btn-primary flex items-center gap-1.5">
            <Plus className="h-4 w-4" /> Convidar funcionario
          </button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
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
          Nesta etapa o convite fica registrado. O proximo passo e automatizar o envio de email e aceitar convite.
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
          <button type="submit" className="btn-primary">Salvar convite</button>
        </div>
      </form>
    </Modal>
  );
}
