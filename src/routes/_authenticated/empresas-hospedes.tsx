import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Building2, Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppLayout";
import { EmptyState, Field, Modal } from "@/components/ui-kit";
import { useCurrentCompany } from "@/lib/data";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/empresas-hospedes")({
  component: EmpresasHospedes,
});

type CorporateAccount = {
  id: string;
  company_id: string;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

type FormInput = {
  name: string;
  document: string;
  email: string;
  phone: string;
  active: boolean;
};

function EmpresasHospedes() {
  const current = useCurrentCompany();
  const companyId = current.data?.id;
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<CorporateAccount | null>(null);
  const [open, setOpen] = useState(false);

  const accounts = useQuery({
    queryKey: ["corporate_accounts", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<CorporateAccount[]> => {
      const { data, error } = await (supabase as any)
        .from("corporate_accounts")
        .select("id,company_id,name,document,email,phone,active,created_at,updated_at")
        .eq("company_id", companyId)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("pt-BR");
    if (!q) return accounts.data ?? [];
    return (accounts.data ?? []).filter((row) =>
      [row.name, row.document, row.email, row.phone]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(q)),
    );
  }, [accounts.data, search]);

  async function save(input: FormInput) {
    if (!companyId) throw new Error("Hotel não encontrado.");
    const cleanName = input.name.trim().replace(/\s+/g, " ");
    if (!cleanName) throw new Error("Informe o nome da empresa.");

    const duplicate = (accounts.data ?? []).find(
      (row) =>
        row.id !== editing?.id &&
        row.name.trim().toLocaleLowerCase("pt-BR") === cleanName.toLocaleLowerCase("pt-BR"),
    );
    if (duplicate) {
      throw new Error(`A empresa ${duplicate.name} já está cadastrada. Edite ou reative o cadastro existente.`);
    }

    const payload = {
      name: cleanName,
      document: input.document.trim() || null,
      email: input.email.trim().toLocaleLowerCase("pt-BR") || null,
      phone: input.phone.trim() || null,
      active: input.active,
      updated_at: new Date().toISOString(),
    };

    if (editing) {
      const { error } = await (supabase as any)
        .from("corporate_accounts")
        .update(payload)
        .eq("id", editing.id)
        .eq("company_id", companyId);
      if (error) throw error;
      toast.success("Empresa hóspede atualizada.");
    } else {
      const { error } = await (supabase as any)
        .from("corporate_accounts")
        .insert({ company_id: companyId, ...payload });
      if (error) throw error;
      toast.success("Empresa hóspede cadastrada.");
    }

    setOpen(false);
    setEditing(null);
    await qc.invalidateQueries({ queryKey: ["corporate_accounts", companyId] });
  }

  async function toggle(account: CorporateAccount) {
    if (!companyId) return;
    const { error } = await (supabase as any)
      .from("corporate_accounts")
      .update({ active: !account.active, updated_at: new Date().toISOString() })
      .eq("id", account.id)
      .eq("company_id", companyId);
    if (error) return toast.error(error.message);
    await qc.invalidateQueries({ queryKey: ["corporate_accounts", companyId] });
    toast.success(account.active ? "Empresa desativada sem perder histórico." : "Empresa reativada.");
  }

  return (
    <div>
      <PageHeader
        title="Empresas hóspedes"
        subtitle="Cadastre empresas que enviam hóspedes ao hotel. Edite ou desative sem perder o histórico."
        action={
          <button
            type="button"
            className="btn-primary flex items-center gap-1.5"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Nova empresa
          </button>
        }
      />

      <section className="mb-4 rounded-xl border border-border bg-card p-3 shadow-sm">
        <label className="relative block max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="field pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar empresa, CNPJ/documento, telefone ou e-mail"
          />
        </label>
      </section>

      {accounts.isLoading ? (
        <div className="card-surface p-5 text-sm text-muted-foreground">Carregando empresas…</div>
      ) : filtered.length === 0 ? (
        <EmptyState text="Nenhuma empresa hóspede encontrada." />
      ) : (
        <section className="card-surface overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="p-3">Empresa</th>
                <th className="p-3">Documento</th>
                <th className="p-3">Contato</th>
                <th className="p-3">Situação</th>
                <th className="p-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((account) => (
                <tr key={account.id} className="border-b border-border/50">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
                        <Building2 className="h-4 w-4" />
                      </span>
                      <strong>{account.name}</strong>
                    </div>
                  </td>
                  <td className="p-3">{account.document || "—"}</td>
                  <td className="p-3">
                    <div>{account.phone || "—"}</div>
                    <div className="text-xs text-muted-foreground">{account.email || "—"}</div>
                  </td>
                  <td className="p-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-bold ${account.active ? "bg-sage-bg text-pine-dark" : "bg-muted text-muted-foreground"}`}>
                      {account.active ? "Ativa" : "Inativa"}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="btn-ghost flex items-center gap-1 py-1 text-xs"
                        onClick={() => {
                          setEditing(account);
                          setOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" /> Editar
                      </button>
                      <button
                        type="button"
                        className="btn-ghost py-1 text-xs"
                        onClick={() => void toggle(account)}
                      >
                        {account.active ? "Desativar" : "Reativar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {open && (
        <CompanyGuestModal
          editing={editing}
          onClose={() => {
            setOpen(false);
            setEditing(null);
          }}
          onSave={async (input) => {
            try {
              await save(input);
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Não foi possível salvar a empresa.");
            }
          }}
        />
      )}
    </div>
  );
}

function CompanyGuestModal({
  editing,
  onClose,
  onSave,
}: {
  editing: CorporateAccount | null;
  onClose: () => void;
  onSave: (input: FormInput) => Promise<void>;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [document, setDocument] = useState(editing?.document ?? "");
  const [email, setEmail] = useState(editing?.email ?? "");
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [active, setActive] = useState(editing?.active ?? true);
  const [saving, setSaving] = useState(false);

  return (
    <Modal open onClose={onClose} title={editing ? "Editar empresa hóspede" : "Nova empresa hóspede"}>
      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          try {
            await onSave({ name, document, email, phone, active });
          } finally {
            setSaving(false);
          }
        }}
      >
        <Field label="Nome da empresa">
          <input className="field" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Serranalog" required />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="CNPJ / Documento">
            <input className="field" value={document} onChange={(event) => setDocument(event.target.value)} />
          </Field>
          <Field label="Telefone">
            <input className="field" value={phone} onChange={(event) => setPhone(event.target.value)} />
          </Field>
        </div>
        <Field label="E-mail de faturamento / contato">
          <input type="email" className="field" value={email} onChange={(event) => setEmail(event.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
          Empresa ativa para novas hospedagens
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? "Salvando…" : "Salvar empresa"}</button>
        </div>
      </form>
    </Modal>
  );
}
