import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Download, Search } from "lucide-react";
import { useClients, useReservations, useInsert, type Client } from "@/lib/data";
import { fmtBRL, fmtDate, downloadCSV, todayISO } from "@/lib/format";
import { CLIENT_TYPES, BR_STATES, stateFromPhone } from "@/lib/constants";
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
      [
        "Nome",
        "Tipo",
        "Telefone",
        "Email",
        "CPF",
        "Sexo",
        "Estado civil",
        "Filhos",
        "Nascimento",
        "Profissão",
        "Bairro",
        "Cidade",
        "Estado",
        "CEP",
        "Visitas",
        "Cadastrado em",
      ],
      ...clients.map((c) => [
        c.nome,
        c.tipo,
        c.telefone,
        (c as Client & { email?: string | null }).email ?? "",
        c.cpf,
        c.sexo,
        c.estado_civil,
        c.tem_filhos ? c.quantidade_filhos ?? 0 : "Não",
        c.data_nascimento,
        c.profissao,
        c.bairro,
        c.cidade,
        c.estado,
        (c as Client & { cep?: string | null }).cep ?? "",
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
                {(c as Client & { email?: string | null }).email && (
                  <p className="text-sm text-muted-foreground">{(c as Client & { email?: string | null }).email}</p>
                )}
                </div>
                <Badge tone={c.tipo === "cliente fixo" ? "brass" : "sage"}>{c.tipo}</Badge>
              </div>
              <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                {c.cpf && <p>CPF: {c.cpf}</p>}
                {c.sexo && <p>Sexo: {c.sexo}</p>}
                {c.estado_civil && <p>Estado civil: {c.estado_civil}</p>}
                {c.tem_filhos != null && (
                  <p>Filhos: {c.tem_filhos ? c.quantidade_filhos ?? 0 : "Não"}</p>
                )}
                {c.bairro && <p>Bairro: {c.bairro}</p>}
                {(c.cidade || c.estado) && <p>{[c.cidade, c.estado].filter(Boolean).join(" / ")}</p>}
                {(c as Client & { cep?: string | null }).cep && <p>CEP: {(c as Client & { cep?: string | null }).cep}</p>}
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
      | "nome"
      | "tipo"
      | "telefone"
      | "email"
      | "documento"
      | "cpf"
      | "data_nascimento"
      | "profissao"
      | "cidade"
      | "estado"
      | "cep"
      | "sexo"
      | "bairro"
      | "estado_civil"
      | "tem_filhos"
      | "quantidade_filhos"
    >,
  ) => void;
}) {
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<string>(CLIENT_TYPES[0]);
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [cpf, setCpf] = useState("");
  const [nascimento, setNascimento] = useState("");
  const [profissao, setProfissao] = useState("");
  const [sexo, setSexo] = useState("");
  const [bairro, setBairro] = useState("");
  const [estadoCivil, setEstadoCivil] = useState("");
  const [temFilhos, setTemFilhos] = useState(false);
  const [quantidadeFilhos, setQuantidadeFilhos] = useState("");
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");
  const [cep, setCep] = useState("");

  const cpfDigits = onlyDigits(cpf);
  const telefoneDigits = onlyDigits(telefone);
  const cpfJaCadastrado =
    cpfDigits.length > 0 &&
    clients.some((client) => client.cpf && onlyDigits(client.cpf) === cpfDigits);
  const telefoneJaCadastrado =
    telefoneDigits.length > 0 &&
    clients.some((client) => client.telefone && onlyDigits(client.telefone) === telefoneDigits);

  return (
    <Modal open onClose={onClose} title="Novo cliente">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (cpfJaCadastrado || telefoneJaCadastrado) {
            toast.error(cpfJaCadastrado ? "Este CPF já está cadastrado." : "Este telefone já está cadastrado.");
            return;
          }
          const nomePadrao = normalizePersonName(nome);
          if (!nomePadrao || hasNumber(nomePadrao) || nomePadrao.split(" ").length < 2) {
            toast.error("Informe o nome completo, sem números.");
            return;
          }
          if (cpfDigits.length !== 11) {
            toast.error("CPF obrigatório. Informe os 11 dígitos.");
            return;
          }
          if (telefoneDigits.length < 10) {
            toast.error("Telefone obrigatório. Informe DDD e número.");
            return;
          }
          if (!nascimento || !estado || !estadoCivil) {
            toast.error("Data de nascimento, estado e estado civil são obrigatórios.");
            return;
          }
          onSave({
            nome: nomePadrao,
            tipo,
            telefone: formatPhoneBR(telefone) || null,
            email: email.trim() || null,
            documento: null,
            cpf: formatCpfBR(cpf) || null,
            data_nascimento: nascimento || null,
            profissao: profissao.trim() || null,
            sexo: sexo || null,
            bairro: bairro.trim() || null,
            estado_civil: estadoCivil || null,
            tem_filhos: temFilhos,
            quantidade_filhos: temFilhos ? Number(quantidadeFilhos || 0) : null,
            cidade: cidade.trim() || null,
            estado: estado || null,
            cep: cep.trim() || null,
          });
        }}
        className="space-y-3"
      >
        <Field label="Nome">
          <input className="field" value={nome} onChange={(e) => setNome(e.target.value.replace(/[0-9]/g, ""))} required maxLength={80} />
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
            <input
              className="field"
              value={telefone}
              onChange={(e) => {
                const value = e.target.value;
                setTelefone(formatPhoneBR(value));
                const uf = stateFromPhone(value);
                if (uf) setEstado(uf);
              }}
              maxLength={20}
              required
              aria-invalid={telefoneJaCadastrado}
            />
            {telefoneJaCadastrado && (
              <p className="mt-1 text-xs font-semibold text-brick">Este telefone já está cadastrado.</p>
            )}
          </Field>
        </div>
        <Field label="E-mail">
          <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="CPF">
            <input
              className="field"
              value={cpf}
              onChange={(e) => setCpf(formatCpfBR(e.target.value))}
              maxLength={14}
              required
              aria-invalid={cpfJaCadastrado}
            />
            {cpfJaCadastrado && (
              <p className="mt-1 text-xs font-semibold text-brick">Este CPF já está cadastrado.</p>
            )}
          </Field>
          <Field label="Data de nascimento">
            <input type="date" className="field" value={nascimento} onChange={(e) => setNascimento(e.target.value)} required />
          </Field>
        </div>
        <Field label="Profissão">
          <input className="field" value={profissao} onChange={(e) => setProfissao(e.target.value)} maxLength={60} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sexo">
            <select className="field" value={sexo} onChange={(e) => setSexo(e.target.value)}>
              <option value="">—</option>
              <option value="feminino">Feminino</option>
              <option value="masculino">Masculino</option>
              <option value="outro">Outro</option>
              <option value="nao_informado">Prefere não informar</option>
            </select>
          </Field>
          <Field label="Estado civil">
            <select className="field" value={estadoCivil} onChange={(e) => setEstadoCivil(e.target.value)} required>
              <option value="">—</option>
              <option value="solteiro">Solteiro(a)</option>
              <option value="casado">Casado(a)</option>
              <option value="divorciado">Divorciado(a)</option>
              <option value="viuvo">Viúvo(a)</option>
              <option value="uniao_estavel">União estável</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tem filhos?">
            <select
              className="field"
              value={temFilhos ? "sim" : "nao"}
              onChange={(e) => {
                const next = e.target.value === "sim";
                setTemFilhos(next);
                if (!next) setQuantidadeFilhos("");
              }}
            >
              <option value="nao">Não</option>
              <option value="sim">Sim</option>
            </select>
          </Field>
          <Field label="Quantidade de filhos">
            <input
              className="field"
              inputMode="numeric"
              value={quantidadeFilhos}
              onChange={(e) => setQuantidadeFilhos(e.target.value.replace(/\D/g, ""))}
              disabled={!temFilhos}
            />
          </Field>
        </div>
        <Field label="Bairro">
          <input className="field" value={bairro} onChange={(e) => setBairro(e.target.value)} maxLength={80} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cidade">
            <input className="field" value={cidade} onChange={(e) => setCidade(e.target.value)} maxLength={60} />
          </Field>
          <Field label="Estado">
            <select className="field" value={estado} onChange={(e) => setEstado(e.target.value)} required>
              <option value="">—</option>
              {BR_STATES.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="CEP">
          <input className="field" value={cep} onChange={(e) => setCep(e.target.value)} maxLength={10} placeholder="Opcional" />
        </Field>
        <p className="text-xs text-muted-foreground">
          A data e o horário do cadastro são registrados automaticamente.
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={cpfJaCadastrado || telefoneJaCadastrado}>
            Salvar
          </button>
        </div>
      </form>
    </Modal>
  );
}

function onlyDigits(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

function hasNumber(value: string) {
  return /\d/.test(value);
}

function normalizePersonName(value: string | null | undefined) {
  return (value ?? "")
    .replace(/[0-9]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR")
    .replace(/(^|\s)(\p{L})/gu, (match) => match.toLocaleUpperCase("pt-BR"));
}

function formatCpfBR(value: string | null | undefined) {
  const digits = onlyDigits(value).slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
}

function formatPhoneBR(value: string | null | undefined) {
  const digits = onlyDigits(value).replace(/^55(?=\d{10,11}$)/, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}
