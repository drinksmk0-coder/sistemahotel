import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { Brain, Pencil, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppLayout";
import { Modal } from "@/components/ui-kit";
import { useRole, useSession } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/memoria-ia")({
  component: HotelAiMemoryPage,
});

type MemoryCategory = "operacao" | "tarifas" | "atendimento" | "financeiro" | "marketing" | "outros";
type MemoryRow = {
  id: string;
  company_id: string;
  category: MemoryCategory;
  title: string;
  content: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

const CATEGORIES: Array<{ value: MemoryCategory; label: string }> = [
  { value: "operacao", label: "Operação" },
  { value: "tarifas", label: "Tarifas e regras comerciais" },
  { value: "atendimento", label: "Atendimento" },
  { value: "financeiro", label: "Financeiro" },
  { value: "marketing", label: "Marketing" },
  { value: "outros", label: "Outros" },
];

function HotelAiMemoryPage() {
  const { user } = useSession();
  const { data: role, isLoading: roleLoading } = useRole(user);
  const company = useCurrentCompany();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<MemoryRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const query = useQuery({
    queryKey: ["company-ai-memory", company.data?.id],
    enabled: Boolean(company.data?.id && role === "dono"),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("company_ai_memory")
        .select("id,company_id,category,title,content,active,created_at,updated_at")
        .eq("company_id", company.data!.id)
        .order("active", { ascending: false })
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MemoryRow[];
    },
  });

  if (roleLoading || !role) {
    return <div className="card-surface p-6 text-sm text-muted-foreground">Carregando permissões…</div>;
  }
  if (role !== "dono") return <Navigate to="/painel" />;

  const rows = query.data ?? [];
  const activeCount = rows.filter((row) => row.active).length;

  async function remove(row: MemoryRow) {
    if (!window.confirm(`Excluir da memória: ${row.title}?`)) return;
    const { error } = await (supabase as any)
      .from("company_ai_memory")
      .delete()
      .eq("id", row.id)
      .eq("company_id", company.data!.id);
    if (error) return toast.error(error.message);
    toast.success("Conhecimento removido da memória.");
    await queryClient.invalidateQueries({ queryKey: ["company-ai-memory"] });
  }

  async function toggle(row: MemoryRow) {
    const { error } = await (supabase as any)
      .from("company_ai_memory")
      .update({ active: !row.active, updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("company_id", company.data!.id);
    if (error) return toast.error(error.message);
    toast.success(row.active ? "Conhecimento pausado." : "Conhecimento reativado.");
    await queryClient.invalidateQueries({ queryKey: ["company-ai-memory"] });
  }

  return (
    <div className="space-y-3 pb-8">
      <PageHeader
        title="Memória do HotelAI"
        subtitle={`${activeCount} conhecimento(s) ativo(s) · informações persistentes da empresa`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link to="/assistente" className="btn-ghost">Abrir HotelAI</Link>
            <button type="button" className="btn-primary inline-flex items-center gap-2" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> Adicionar conhecimento
            </button>
          </div>
        }
      />

      <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <strong>Registre regras do hotel, não dados pessoais nem segredos.</strong>
            <p className="mt-1 text-xs leading-relaxed">
              Não salve CPF, cartão, senha, token de API, documentos de hóspedes ou conversas privadas.
              Esta memória fornece contexto ao HotelAI; ela não treina nem altera o modelo externo.
            </p>
          </div>
        </div>
      </section>

      {query.isLoading ? (
        <div className="card-surface p-8 text-center text-sm text-muted-foreground">Carregando a memória…</div>
      ) : query.error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
          Não foi possível carregar a memória do HotelAI.
        </div>
      ) : rows.length === 0 ? (
        <div className="card-surface grid place-items-center p-10 text-center">
          <Brain className="h-10 w-10 text-muted-foreground" />
          <h2 className="mt-3 font-bold">A memória ainda está vazia</h2>
          <p className="mt-1 max-w-lg text-sm text-muted-foreground">
            Cadastre políticas de cancelamento, horários, regras de cobrança, diferenciais dos quartos,
            metas e procedimentos que a IA deve considerar nas análises.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((row) => (
            <article key={row.id} className={`card-surface p-4 ${row.active ? "" : "opacity-60"}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-bold uppercase text-muted-foreground">
                    {CATEGORIES.find((item) => item.value === row.category)?.label ?? row.category}
                  </span>
                  <h2 className="mt-2 font-bold text-foreground">{row.title}</h2>
                </div>
                <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${row.active ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground"}`}>
                  {row.active ? "Ativo" : "Pausado"}
                </span>
              </div>
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{row.content}</p>
              <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-border pt-3">
                <button type="button" className="btn-ghost text-xs" onClick={() => void toggle(row)}>
                  {row.active ? "Pausar" : "Reativar"}
                </button>
                <button type="button" className="btn-ghost inline-flex items-center gap-1 text-xs" onClick={() => setEditing(row)}>
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </button>
                <button type="button" className="rounded-md bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive" onClick={() => void remove(row)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <MemoryForm
          initial={editing}
          busy={busy}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSave={async (value) => {
            setBusy(true);
            try {
              if (editing) {
                const { error } = await (supabase as any)
                  .from("company_ai_memory")
                  .update({ ...value, updated_at: new Date().toISOString() })
                  .eq("id", editing.id)
                  .eq("company_id", company.data!.id);
                if (error) throw error;
                toast.success("Memória atualizada.");
              } else {
                const { error } = await (supabase as any).from("company_ai_memory").insert({
                  ...value,
                  company_id: company.data!.id,
                });
                if (error) throw error;
                toast.success("Conhecimento adicionado à memória.");
              }
              setCreating(false);
              setEditing(null);
              await queryClient.invalidateQueries({ queryKey: ["company-ai-memory"] });
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}

function MemoryForm({
  initial,
  busy,
  onClose,
  onSave,
}: {
  initial: MemoryRow | null;
  busy: boolean;
  onClose: () => void;
  onSave: (value: { title: string; category: MemoryCategory; content: string; active: boolean }) => Promise<void>;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [category, setCategory] = useState<MemoryCategory>(initial?.category ?? "operacao");
  const [content, setContent] = useState(initial?.content ?? "");
  const [active, setActive] = useState(initial?.active ?? true);

  return (
    <Modal open onClose={onClose} title={initial ? "Editar memória" : "Adicionar à memória do HotelAI"}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (title.trim().length < 3 || content.trim().length < 3) {
            toast.error("Informe título e conteúdo completos.");
            return;
          }
          void onSave({ title: title.trim(), category, content: content.trim(), active });
        }}
      >
        <label className="block text-xs font-semibold text-muted-foreground">
          Título
          <input className="field mt-1" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required />
        </label>
        <label className="block text-xs font-semibold text-muted-foreground">
          Categoria
          <select className="field mt-1" value={category} onChange={(event) => setCategory(event.target.value as MemoryCategory)}>
            {CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label className="block text-xs font-semibold text-muted-foreground">
          Conhecimento que a IA deve lembrar
          <textarea
            className="field mt-1 min-h-52 resize-y"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            maxLength={12000}
            placeholder="Ex.: Check-in às 15h; check-out às 12h. Reservas após meia-noite e antes das 6h pertencem ao dia operacional anterior."
            required
          />
          <span className="mt-1 block text-right text-[10px]">{content.length.toLocaleString("pt-BR")} / 12.000</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
          Disponível para o HotelAI
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Salvando…" : "Salvar na memória"}</button>
        </div>
      </form>
    </Modal>
  );
}
