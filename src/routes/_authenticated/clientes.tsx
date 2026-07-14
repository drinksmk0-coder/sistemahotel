import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Download, Search } from "lucide-react";
import { useClients, useReservations, useInsert, type Client } from "@/lib/data";
import { fmtBRL, fmtDate, downloadCSV, todayISO } from "@/lib/format";
import { CLIENT_TYPES, BR_STATES } from "@/lib/constants";
import { PageHeader } from "@/components/AppLayout";
import { Modal, Field, Badge, EmptyState } from "@/components/ui-kit";

export const Route = createFileRoute("/_authenticated/clientes")({
  component: Clientes,
});

function Clientes() {
  const { data: clients = [] } = useClients();
  const { data: reservations = [] } = useReservations();
  const insert = useInsert("clients", ["clients"]);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const spentByClient = useMemo(() => {
    const m = new Map<string, number>();
    reservations.forEach((r) => {
      if (r.cliente_id && r.pago)
        m.set(r.cliente_id, (m.get(r.cliente_id) ?? 0) + Number(r.valor_total));
    });
    return m;
  }, [reservations]);

  const filtered = clients.filter(
    (c) =>
      c.nome.toLowerCase().includes(q.toLowerCase()) ||
      (c.telefone ?? "").includes(q) ||
      (c.documento ?? "").includes(q) ||
      (c.cpf ?? "").includes(q),
  );

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

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          className="field pl-9"
          placeholder="Buscar por nome, telefone…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState text="Nenhum cliente encontrado." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <div key={c.id} className="card-surface p-4">
              <div className="flex items-start justify-between">
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
              <div className="mt-3 flex justify-between text-sm">
                <span className="text-muted-foreground">{c.visitas} visita(s)</span>
                <span className="font-semibold">{fmtBRL(spentByClient.get(c.id) ?? 0)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <ClientForm
          clients={clients}
          onClose={() => setOpen(false)}
          onSave={(row) =>
            insert.mutate(row, {
              onSuccess: () => {
                toast.success("Cliente cadastrado");
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

function ClientForm({
  clients,
  onClose,
  onSave,
}: {
  clients: Client[];
  onClose: () => void;
  onSave: (
    row: Pick<
      Client,
      "nome" | "tipo" | "telefone" | "documento" | "cpf" | "data_nascimento" | "profissao" | "cidade" | "estado"
    >,
  ) => void;
}) {
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<string>(CLIENT_TYPES[0]);
  const [telefone, setTelefone] = useState("");
  const [cpf, setCpf] = useState("");
  const [nascimento, setNascimento] = useState("");
  const [profissao, setProfissao] = useState("");
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");

  const cpfDigits = onlyDigits(cpf);
  const cpfJaCadastrado =
    cpfDigits.length > 0 &&
    clients.some((client) => client.cpf && onlyDigits(client.cpf) === cpfDigits);

  return (
    <Modal open onClose={onClose} title="Novo cliente">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (cpfJaCadastrado) {
            toast.error("Este CPF já está cadastrado.");
            return;
          }
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
            <input
              className="field"
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
              maxLength={14}
              aria-invalid={cpfJaCadastrado}
            />
            {cpfJaCadastrado && (
              <p className="mt-1 text-xs font-semibold text-brick">Este CPF já está cadastrado.</p>
            )}
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
          <button type="submit" className="btn-primary" disabled={cpfJaCadastrado}>
            Salvar
          </button>
        </div>
      </form>
    </Modal>
  );
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}
