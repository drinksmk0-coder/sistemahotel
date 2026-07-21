import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Download, Search, Trash2, Pencil } from "lucide-react";
import brazil from "@svg-maps/brazil";
import { useClients, useInsert, useUpdate, useBulkDelete, type Client } from "@/lib/data";
import { fmtDate, downloadCSV, todayISO } from "@/lib/format";
import { CLIENT_TYPES, BR_STATES } from "@/lib/constants";
import { PageHeader } from "@/components/AppLayout";
import { Modal, Field, Badge, EmptyState } from "@/components/ui-kit";

export const Route = createFileRoute("/_authenticated/clientes")({
  component: Clientes,
});

function Clientes() {
  const { data: clients = [] } = useClients();
  const insert = useInsert("clients", ["clients"]);
  const update = useUpdate("clients", ["clients"]);
  const bulkDelete = useBulkDelete("clients", ["clients"]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = clients.filter(
    (c) =>
      c.nome.toLowerCase().includes(q.toLowerCase()) ||
      (c.telefone ?? "").includes(q) ||
      (c.documento ?? "").includes(q),
  );

  const allFilteredSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id));

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (allFilteredSelected ? new Set() : new Set(filtered.map((c) => c.id))));
  }

  function confirmBulkDelete() {
    if (selected.size === 0) return;
    if (!window.confirm(`Excluir ${selected.size} cliente(s) selecionado(s)? Esta ação não pode ser desfeita.`)) return;
    bulkDelete.mutate([...selected], {
      onSuccess: () => {
        toast.success(`${selected.size} cliente(s) excluído(s)`);
        setSelected(new Set());
      },
      onError: (e) => toast.error(e.message),
    });
  }

  function confirmDeleteOne(c: Client) {
    if (!window.confirm(`Excluir o cliente "${c.nome}"? Esta ação não pode ser desfeita.`)) return;
    bulkDelete.mutate([c.id], {
      onSuccess: () => toast.success("Cliente excluído"),
      onError: (e) => toast.error(e.message),
    });
  }

  function exportCSV() {
    downloadCSV(`clientes-${todayISO()}.csv`, [
      ["Nome", "Tipo", "Telefone", "CPF", "Nascimento", "Profissão", "Cidade", "Estado", "Visitas", "Cadastrado em"],
      ...clients.map((c) => [
        c.nome,
        c.tipo,
        c.telefone,
        c.cpf,
        c.data_nascimento,
        c.profissao,
        c.cidade,
        c.estado,
        c.visitas,
        c.created_at.slice(0, 10),
      ]),
    ]);
  }

  return (
    <div>
      <PageHeader
        title="Clientes"
        subtitle="Hóspedes e clientes fixos da pousada."
        action={
          <div className="flex gap-2">
            <button onClick={exportCSV} className="btn-ghost flex items-center gap-1.5">
              <Download className="h-4 w-4" /> CSV
            </button>
            <button onClick={() => setOpen(true)} className="btn-primary flex items-center gap-1.5">
              <Plus className="h-4 w-4" /> Novo cliente
            </button>
          </div>
        }
      />

      <BrazilClientMap clients={clients} />

      <div className="mb-4 mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="field pl-9"
            placeholder="Buscar por nome, telefone…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} />
          Selecionar todos {filtered.length ? `(${filtered.length})` : ""}
        </label>
        {selected.size > 0 && (
          <button
            onClick={confirmBulkDelete}
            className="flex items-center gap-1.5 rounded-md bg-brick px-3 py-2 text-sm font-semibold text-white"
          >
            <Trash2 className="h-4 w-4" /> Excluir selecionados ({selected.size})
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState text="Nenhum cliente encontrado." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <div key={c.id} className={`card-surface relative flex flex-col p-4 ${selected.has(c.id) ? "ring-2 ring-pine" : ""}`}>
              <input
                type="checkbox"
                className="absolute right-3 top-3 h-4 w-4"
                checked={selected.has(c.id)}
                onChange={() => toggleOne(c.id)}
              />
              <div className="flex items-start justify-between pr-6">
                <div>
                  <p className="font-serif text-lg font-bold">{c.nome}</p>
                  {c.telefone && <p className="text-sm text-muted-foreground">{c.telefone}</p>}
                </div>
                <Badge tone={c.tipo === "cliente fixo" ? "brass" : "sage"}>{c.tipo}</Badge>
              </div>
              <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                {c.cpf && <p>CPF: {c.cpf}</p>}
                {(c.cidade || c.estado) && <p>{[c.cidade, c.estado].filter(Boolean).join(" / ")}</p>}
                {c.profissao && <p>{c.profissao}</p>}
                {c.data_nascimento && <p>Nasc.: {fmtDate(c.data_nascimento)}</p>}
                <p>Cadastrado em {fmtDate(c.created_at)}</p>
              </div>
              <div className="mt-2 text-sm text-muted-foreground">{c.visitas} visita(s)</div>
              {/* Ações sempre visíveis — não dependem de hover */}
              <div className="mt-3 flex gap-2 border-t border-border pt-3">
                <button
                  onClick={() => setEditing(c)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-muted px-2 py-1.5 text-xs font-semibold text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </button>
                <button
                  onClick={() => confirmDeleteOne(c)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-brick-bg px-2 py-1.5 text-xs font-semibold text-brick"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(open || editing) && (
        <ClientForm
          existing={editing}
          onClose={() => {
            setOpen(false);
            setEditing(null);
          }}
          onSave={(row) => {
            if (editing) {
              update.mutate(
                { id: editing.id, patch: row },
                {
                  onSuccess: () => {
                    toast.success("Cliente atualizado");
                    setEditing(null);
                  },
                  onError: (e) => toast.error(e.message),
                },
              );
            } else {
              insert.mutate(row, {
                onSuccess: () => {
                  toast.success("Cliente cadastrado");
                  setOpen(false);
                },
                onError: (e) => toast.error(e.message),
              });
            }
          }}
        />
      )}
    </div>
  );
}

function clientCountsByState(clients: Client[]): Record<string, number> {
  const counts: Record<string, number> = {};
  clients.forEach((c) => {
    if (!c.estado) return;
    const uf = c.estado.toLowerCase();
    counts[uf] = (counts[uf] ?? 0) + 1;
  });
  return counts;
}

function BrazilClientMap({ clients }: { clients: Client[] }) {
  const counts = useMemo(() => clientCountsByState(clients), [clients]);
  const max = Math.max(1, ...Object.values(counts));
  const [hover, setHover] = useState<string | null>(null);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="card-surface p-4">
      <h3 className="section-title mb-1 text-lg">Origem dos clientes</h3>
      <p className="mb-3 text-xs text-muted-foreground">
        Baseado no campo "Estado" de cada cliente · {total} de {clients.length} com estado preenchido
      </p>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <svg viewBox={brazil.viewBox} className="h-auto w-full max-w-sm">
          {brazil.locations.map((loc) => {
            const n = counts[loc.id] ?? 0;
            const intensity = n / max;
            const fill = n === 0 ? "var(--muted)" : `color-mix(in oklch, var(--pine) ${15 + intensity * 75}%, white)`;
            return (
              <path
                key={loc.id}
                d={loc.path}
                fill={fill}
                stroke="var(--card)"
                strokeWidth={1}
                onMouseEnter={() => setHover(loc.id)}
                onMouseLeave={() => setHover(null)}
                className="cursor-pointer transition-opacity hover:opacity-80"
              >
                <title>
                  {loc.name}: {n} cliente(s)
                </title>
              </path>
            );
          })}
        </svg>
        <div className="min-w-[140px] text-sm">
          {hover ? (
            <>
              <p className="font-semibold">{brazil.locations.find((l) => l.id === hover)?.name}</p>
              <p className="text-muted-foreground">{counts[hover] ?? 0} cliente(s)</p>
            </>
          ) : (
            <p className="text-muted-foreground">Passe o mouse sobre um estado para ver o total.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ClientForm({
  existing,
  onClose,
  onSave,
}: {
  existing?: Client | null;
  onClose: () => void;
  onSave: (
    row: Pick<
      Client,
      "nome" | "tipo" | "telefone" | "documento" | "cpf" | "data_nascimento" | "profissao" | "cidade" | "estado"
    >,
  ) => void;
}) {
  const [nome, setNome] = useState(existing?.nome ?? "");
  const [tipo, setTipo] = useState<string>(existing?.tipo ?? CLIENT_TYPES[0]);
  const [telefone, setTelefone] = useState(existing?.telefone ?? "");
  const [cpf, setCpf] = useState(existing?.cpf ?? "");
  const [nascimento, setNascimento] = useState(existing?.data_nascimento ?? "");
  const [profissao, setProfissao] = useState(existing?.profissao ?? "");
  const [cidade, setCidade] = useState(existing?.cidade ?? "");
  const [estado, setEstado] = useState(existing?.estado ?? "");

  return (
    <Modal open onClose={onClose} title={existing ? `Editar cliente — ${existing.nome}` : "Novo cliente"}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            nome: nome.trim(),
            tipo,
            telefone: telefone.trim() || null,
            documento: null,
            cpf: cpf.trim() || null,
            data_nascimento: nascimento || null,
            profissao: profissao.trim() || null,
            cidade: cidade.trim() || null,
            estado: estado || null,
          });
        }}
        className="space-y-3"
      >
        <Field label="Nome">
          <input className="field" value={nome} onChange={(e) => setNome(e.target.value)} required maxLength={80} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo">
            <select className="field" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {CLIENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Telefone">
            <input className="field" value={telefone} onChange={(e) => setTelefone(e.target.value)} maxLength={20} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="CPF">
            <input className="field" value={cpf} onChange={(e) => setCpf(e.target.value)} maxLength={14} />
          </Field>
          <Field label="Data de nascimento">
            <input type="date" className="field" value={nascimento} onChange={(e) => setNascimento(e.target.value)} />
          </Field>
        </div>
        <Field label="Profissão">
          <input className="field" value={profissao} onChange={(e) => setProfissao(e.target.value)} maxLength={60} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cidade">
            <input className="field" value={cidade} onChange={(e) => setCidade(e.target.value)} maxLength={60} />
          </Field>
          <Field label="Estado">
            <select className="field" value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="">—</option>
              {BR_STATES.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">
          A data e o horário do cadastro são registrados automaticamente.
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancelar
          </button>
          <button type="submit" className="btn-primary">
            Salvar
          </button>
        </div>
      </form>
    </Modal>
  );
}
