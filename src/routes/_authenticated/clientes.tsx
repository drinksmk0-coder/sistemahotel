import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CalendarDays,
  FileText,
  History,
  Mail,
  Pencil,
  Phone,
  Plus,
  Power,
  Search,
} from "lucide-react";
import {
  useClients,
  useCurrentCompany,
  useInsert,
  useReservations,
  useSales,
  useUpdate,
  type Client,
  type Reservation,
} from "@/lib/data";
import { fmtBRL, fmtDate, downloadExcel, todayISO } from "@/lib/format";
import { CLIENT_TYPES, BR_STATES, stateFromPhone } from "@/lib/constants";
import { PageHeader } from "@/components/AppLayout";
import { Modal, Field, Badge, EmptyState } from "@/components/ui-kit";
import { getSystemSettings, type SystemSettings } from "@/lib/system-settings";
import { buildClientInsights } from "@/lib/guest-account";
import { ClientInsightModal, TierBadge } from "@/components/ClientInsightModal";
import { ExportPeriodButton, type ExportScope } from "@/components/ExportPeriodButton";

export const Route = createFileRoute("/_authenticated/clientes")({
  component: Clientes,
});

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function Clientes() {
  const { data: clients = [] } = useClients();
  const { data: reservations = [] } = useReservations();
  const { data: sales = [] } = useSales();
  const currentCompany = useCurrentCompany();
  const requiredGuestFields = getSystemSettings(currentCompany.data?.id).requiredGuestFields;
  const insert = useInsert("clients", ["clients"]);
  const update = useUpdate("clients", ["clients", "reservations"]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [q, setQ] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<"ativos" | "desativados" | "todos">("ativos");
  const [profileClientId, setProfileClientId] = useState<string | null>(null);

  const insights = useMemo(
    () => buildClientInsights(clients, reservations, sales),
    [clients, reservations, sales],
  );
  const currentStayByClient = useMemo(() => {
    const today = todayISO();
    const map = new Map<string, (typeof reservations)[number]>();
    reservations
      .filter(
        (reservation) =>
          !["cancelado", "finalizado", "manutencao"].includes(reservation.status) &&
          reservation.checkin <= today &&
          reservation.checkout >= today,
      )
      .forEach((reservation) => {
        if (reservation.cliente_id) map.set(reservation.cliente_id, reservation);
        map.set(`nome:${normalizeText(reservation.cliente_nome)}`, reservation);
      });
    return map;
  }, [reservations]);

  const filtered = clients.filter((c) => {
    const created = (c.created_at || "").slice(0, 10);
    const matchesSearch =
      c.nome.toLowerCase().includes(q.toLowerCase()) ||
      (c.telefone ?? "").includes(q) ||
      (c.documento ?? "").includes(q) ||
      (c.cpf ?? "").includes(q);
    const matchesFrom = !createdFrom || created >= createdFrom;
    const matchesTo = !createdTo || created <= createdTo;
    const disabled = isClientDisabled(c);
    const matchesStatus =
      statusFilter === "todos" || (statusFilter === "desativados" ? disabled : !disabled);
    return matchesSearch && matchesFrom && matchesTo && matchesStatus;
  });
  const filteredIds = filtered.map((client) => client.id);
  const allFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selectedIds.includes(id));

  async function deactivateSelected() {
    if (
      !window.confirm(
        `Desativar ${selectedIds.length} cliente(s)? O histórico de reservas será mantido.`,
      )
    )
      return;
    try {
      await Promise.all(
        selectedIds.map((id) => {
          const client = clients.find((item) => item.id === id);
          return client && !isClientDisabled(client)
            ? update.mutateAsync({ id, patch: { ativo: false } })
            : Promise.resolve();
        }),
      );
      toast.success("Clientes desativados; histórico preservado");
      setSelectedIds([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao desativar clientes");
    }
  }

  function exportCSV(scope: ExportScope) {
    const clientIdsOnDate =
      scope.mode === "date"
        ? new Set(
            reservations
              .filter(
                (reservation) =>
                  reservation.status !== "cancelado" &&
                  reservation.checkin <= scope.date &&
                  reservation.checkout >= scope.date,
              )
              .map((reservation) => reservation.cliente_id)
              .filter((id): id is string => Boolean(id)),
          )
        : null;
    const exportedClients = clientIdsOnDate
      ? clients.filter((client) => clientIdsOnDate.has(client.id))
      : clients;
    const suffix = scope.mode === "date" ? scope.date : "historico-completo";
    downloadExcel(`clientes-${suffix}.xls`, [
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
        "País",
        "CEP",
        "Visitas",
        "Segmento",
        "Gasto total",
        "Gasto médio",
        "Pagamento preferido",
        "Quarto preferido",
        "Produto preferido",
        "Dia preferido",
        "Cadastrado em",
      ],
      ...exportedClients.map((c) => [
        c.nome,
        c.tipo,
        c.telefone,
        (c as Client & { email?: string | null }).email ?? "",
        c.cpf,
        c.sexo,
        c.estado_civil,
        c.tem_filhos ? (c.quantidade_filhos ?? 0) : "Não",
        c.data_nascimento,
        c.profissao,
        c.bairro,
        c.cidade,
        c.estado,
        c.pais,
        (c as Client & { cep?: string | null }).cep ?? "",
        insights.get(c.id)?.visits ?? c.visitas,
        insights.get(c.id)?.tier ?? "Bronze",
        insights.get(c.id)?.totalCharged ?? 0,
        insights.get(c.id)?.averageSpend ?? 0,
        insights.get(c.id)?.favoritePayment ?? "",
        insights.get(c.id)?.favoriteRoom ?? "",
        insights.get(c.id)?.favoriteProduct ?? "",
        insights.get(c.id)?.favoriteWeekday ?? "",
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
            <ExportPeriodButton onExport={exportCSV} />
            <button onClick={() => setOpen(true)} className="btn-primary flex items-center gap-1.5">
              <Plus className="h-4 w-4" /> Novo cliente
            </button>
          </div>
        }
      />

      <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_auto]">
        <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_1fr]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className="field pl-9"
              placeholder="Buscar por nome, telefone…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Field label="Cadastrado de">
            <input
              className="field"
              type="date"
              value={createdFrom}
              onChange={(e) => setCreatedFrom(e.target.value)}
            />
          </Field>
          <Field label="Até">
            <input
              className="field"
              type="date"
              value={createdTo}
              onChange={(e) => setCreatedTo(e.target.value)}
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <select
            className="field h-10 w-auto"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
          >
            <option value="ativos">Ativos</option>
            <option value="desativados">Desativados</option>
            <option value="todos">Todos</option>
          </select>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setSelectedIds(allFilteredSelected ? [] : filteredIds)}
            disabled={filtered.length === 0}
          >
            {allFilteredSelected ? "Limpar seleção" : "Selecionar todos"}
          </button>
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div className="fixed bottom-24 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-card/95 px-3 py-2 shadow-2xl backdrop-blur xl:bottom-6 xl:left-[calc(50%+6.75rem)]">
          <span className="whitespace-nowrap text-xs font-semibold text-pine-dark">
            {selectedIds.length} selecionado(s)
          </span>
          <button
            type="button"
            className="rounded-full bg-brick px-3 py-1.5 text-xs font-bold text-white"
            disabled={update.isPending}
            onClick={deactivateSelected}
          >
            Desativar
          </button>
          <button
            type="button"
            className="rounded-full px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted"
            onClick={() => setSelectedIds([])}
          >
            Cancelar
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState text="Nenhum cliente encontrado." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {filtered.map((c) => {
            const insight = insights.get(c.id);
            const stay =
              currentStayByClient.get(c.id) ??
              currentStayByClient.get(`nome:${normalizeText(c.nome)}`);
            const email = (c as Client & { email?: string | null }).email;
            return (
              <article key={c.id} className="card-surface overflow-hidden p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <input
                      type="checkbox"
                      className="mt-3"
                      checked={selectedIds.includes(c.id)}
                      onChange={(e) =>
                        setSelectedIds((ids) =>
                          e.target.checked
                            ? [...new Set([...ids, c.id])]
                            : ids.filter((id) => id !== c.id),
                        )
                      }
                      aria-label={`Selecionar ${c.nome}`}
                    />
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-extrabold text-primary">
                      {clientInitials(c.nome)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold text-pine-dark">{c.nome}</p>
                      <p className="truncate text-[9px] text-muted-foreground">
                        {c.cpf || c.documento || "Documento não informado"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge tone={isClientDisabled(c) ? "slate" : "sage"}>
                      {isClientDisabled(c) ? "inativo" : stay?.canal || c.tipo}
                    </Badge>
                    <button
                      type="button"
                      className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                      onClick={() => setEditing(c)}
                      title="Editar cliente"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className={`rounded-md p-1 ${isClientDisabled(c) ? "text-sage" : "text-brick"}`}
                      onClick={() => {
                        const disabling = !isClientDisabled(c);
                        if (!window.confirm(`${disabling ? "Desativar" : "Reativar"} ${c.nome}?`))
                          return;
                        update.mutate(
                          { id: c.id, patch: { ativo: !disabling } },
                          {
                            onSuccess: () =>
                              toast.success(disabling ? "Cliente desativado" : "Cliente reativado"),
                            onError: (error) => toast.error(error.message),
                          },
                        );
                      }}
                      title={isClientDisabled(c) ? "Reativar cliente" : "Desativar cliente"}
                    >
                      <Power className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid gap-1 text-[10px] text-muted-foreground">
                  {email && (
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{email}</span>
                    </span>
                  )}
                  {c.telefone && (
                    <span className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5" /> {c.telefone}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {insight?.visits ?? c.visitas} estadia(s) ·{" "}
                    {fmtBRL(insight?.totalCharged ?? 0)}
                  </span>
                </div>

                <div className="mt-3 rounded-lg bg-muted px-2.5 py-2 text-[10px]">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>{stay ? "Estadia atual" : "Último perfil registrado"}</span>
                    {insight && <TierBadge tier={insight.tier} />}
                  </div>
                  {stay ? (
                    <>
                      <strong className="mt-0.5 block text-pine-dark">
                        Quarto {stay.quarto} · {stay.status}
                      </strong>
                      <span className="text-muted-foreground">
                        {fmtDate(stay.checkin)} → {fmtDate(stay.checkout)}
                      </span>
                    </>
                  ) : (
                    <strong className="mt-0.5 block text-pine-dark">
                      Média por estadia {fmtBRL(insight?.averageSpend ?? 0)}
                    </strong>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    className="btn-ghost flex h-8 items-center justify-center gap-1 px-2 text-[9px]"
                    onClick={() => printGuestForm(c, stay)}
                  >
                    <FileText className="h-3 w-3" /> FNRH
                  </button>
                  <button
                    type="button"
                    className="btn-ghost flex h-8 items-center justify-center gap-1 px-2 text-[9px]"
                    onClick={() => printGuestVoucher(c, stay)}
                  >
                    <FileText className="h-3 w-3" /> Voucher
                  </button>
                  <button
                    type="button"
                    className="btn-primary flex h-8 items-center justify-center gap-1 px-2 text-[9px]"
                    onClick={() => setProfileClientId(c.id)}
                  >
                    <History className="h-3 w-3" /> Histórico
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {(open || editing) && (
        <ClientForm
          clients={clients}
          editing={editing}
          requiredGuestFields={requiredGuestFields}
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
              return;
            }
            insert.mutate(row, {
              onSuccess: () => {
                toast.success("Cliente cadastrado");
                setOpen(false);
              },
              onError: (e) => toast.error(e.message),
            });
          }}
        />
      )}
      {profileClientId && insights.get(profileClientId) && (
        <ClientInsightModal
          insight={insights.get(profileClientId)!}
          onClose={() => setProfileClientId(null)}
        />
      )}
    </div>
  );
}

function clientInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function printGuestForm(client: Client, reservation?: Reservation) {
  const params = new URLSearchParams({
    tipo: "fnrh",
    nome: client.nome,
    cpf: client.cpf ?? "",
    telefone: client.telefone ?? "",
    email: client.email ?? "",
    nascimento: client.data_nascimento ? fmtDate(client.data_nascimento) : "",
    estadoCivil: client.estado_civil ?? "",
    profissao: client.profissao ?? "",
    cidade: client.cidade ?? "",
    estado: client.estado ?? "",
    pais: client.pais ?? "Brasil",
    cep: client.cep ?? "",
    bairro: client.bairro ?? "",
    quarto: reservation ? String(reservation.quarto) : "",
    checkin: reservation ? fmtDate(reservation.checkin) : "",
    checkout: reservation ? fmtDate(reservation.checkout) : "",
    acompanhantes: reservation ? String(Math.max(0, reservation.pessoas - 1)) : "",
  });
  window.open(`/imprimir?${params.toString()}`, "_blank", "noopener,noreferrer");
}

function printGuestVoucher(
  client: Client,
  reservation?: Reservation,
) {
  const params = new URLSearchParams({
    tipo: "voucher",
    nome: client.nome,
    telefone: client.telefone ?? "",
    quarto: reservation ? String(reservation.quarto) : "",
    checkin: reservation ? fmtDate(reservation.checkin) : "",
    checkout: reservation ? fmtDate(reservation.checkout) : "",
    total: reservation ? fmtBRL(reservation.valor_total) : "",
  });
  window.open(`/imprimir?${params.toString()}`, "_blank", "noopener,noreferrer");
}

function isClientDisabled(client: Client) {
  return client.ativo === false || client.tipo.startsWith("desativado:");
}

function ClientForm({
  clients,
  editing,
  onClose,
  onSave,
  requiredGuestFields,
}: {
  clients: Client[];
  editing: Client | null;
  onClose: () => void;
  requiredGuestFields: SystemSettings["requiredGuestFields"];
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
      | "pais"
      | "cep"
      | "sexo"
      | "bairro"
      | "estado_civil"
      | "tem_filhos"
      | "quantidade_filhos"
    >,
  ) => void;
}) {
  const [nome, setNome] = useState(editing?.nome ?? "");
  const [tipo, setTipo] = useState<string>(editing?.tipo ?? CLIENT_TYPES[0]);
  const [telefone, setTelefone] = useState(editing?.telefone ?? "");
  const [email, setEmail] = useState(
    (editing as (Client & { email?: string | null }) | null)?.email ?? "",
  );
  const [cpf, setCpf] = useState(editing?.cpf ?? "");
  const [nascimento, setNascimento] = useState(editing?.data_nascimento ?? "");
  const [profissao, setProfissao] = useState(editing?.profissao ?? "");
  const [sexo, setSexo] = useState(editing?.sexo ?? "");
  const [bairro, setBairro] = useState(editing?.bairro ?? "");
  const [estadoCivil, setEstadoCivil] = useState(editing?.estado_civil ?? "");
  const [temFilhos, setTemFilhos] = useState(Boolean(editing?.tem_filhos));
  const [quantidadeFilhos, setQuantidadeFilhos] = useState(
    editing?.quantidade_filhos != null ? String(editing.quantidade_filhos) : "",
  );
  const [cidade, setCidade] = useState(editing?.cidade ?? "");
  const [estado, setEstado] = useState(editing?.estado ?? "");
  const [pais, setPais] = useState(editing?.pais ?? "Brasil");
  const [cep, setCep] = useState((editing as (Client & { cep?: string | null }) | null)?.cep ?? "");

  const cpfDigits = onlyDigits(cpf);
  const telefoneDigits = onlyDigits(telefone);
  const cpfJaCadastrado =
    cpfDigits.length > 0 &&
    clients.some(
      (client) => client.id !== editing?.id && client.cpf && onlyDigits(client.cpf) === cpfDigits,
    );
  const telefoneJaCadastrado =
    telefoneDigits.length > 0 &&
    clients.some(
      (client) =>
        client.id !== editing?.id &&
        client.telefone &&
        onlyDigits(client.telefone) === telefoneDigits,
    );

  return (
    <Modal open onClose={onClose} title={editing ? "Editar cliente" : "Novo cliente"}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (cpfJaCadastrado || telefoneJaCadastrado) {
            toast.error(
              cpfJaCadastrado
                ? "Este CPF já está cadastrado."
                : "Este telefone já está cadastrado.",
            );
            return;
          }
          const nomePadrao = normalizePersonName(nome);
          if (!nomePadrao || hasNumber(nomePadrao) || nomePadrao.split(" ").length < 2) {
            toast.error("Informe o nome completo, sem números.");
            return;
          }
          if (requiredGuestFields.cpf && cpfDigits.length !== 11) {
            toast.error("CPF obrigatório. Informe os 11 dígitos.");
            return;
          }
          if (requiredGuestFields.telefone && telefoneDigits.length < 10) {
            toast.error("Telefone obrigatório. Informe DDD e número.");
            return;
          }
          if (
            (requiredGuestFields.nascimento && !nascimento) ||
            (requiredGuestFields.estado && pais === "Brasil" && !estado) ||
            (requiredGuestFields.estadoCivil && !estadoCivil)
          ) {
            toast.error("Preencha os campos obrigatórios definidos nas configurações.");
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
            pais: pais.trim() || "Brasil",
            cep: cep.trim() || null,
          });
        }}
        className="space-y-3"
      >
        <Field label="Nome">
          <input
            className="field"
            value={nome}
            onChange={(e) => setNome(e.target.value.replace(/[0-9]/g, ""))}
            required
            maxLength={80}
          />
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
              required={requiredGuestFields.telefone}
              aria-invalid={telefoneJaCadastrado}
            />
            {telefoneJaCadastrado && (
              <p className="mt-1 text-xs font-semibold text-brick">
                Este telefone já está cadastrado.
              </p>
            )}
          </Field>
        </div>
        <Field label="E-mail">
          <input
            className="field"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={120}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="CPF">
            <input
              className="field"
              value={cpf}
              onChange={(e) => setCpf(formatCpfBR(e.target.value))}
              maxLength={14}
              required={requiredGuestFields.cpf}
              aria-invalid={cpfJaCadastrado}
            />
            {cpfJaCadastrado && (
              <p className="mt-1 text-xs font-semibold text-brick">Este CPF já está cadastrado.</p>
            )}
          </Field>
          <Field label="Data de nascimento">
            <input
              type="date"
              className="field"
              value={nascimento}
              onChange={(e) => setNascimento(e.target.value)}
              required={requiredGuestFields.nascimento}
            />
          </Field>
        </div>
        <Field label="Profissão">
          <input
            className="field"
            value={profissao}
            onChange={(e) => setProfissao(e.target.value)}
            maxLength={60}
          />
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
            <select
              className="field"
              value={estadoCivil}
              onChange={(e) => setEstadoCivil(e.target.value)}
              required={requiredGuestFields.estadoCivil}
            >
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
          <input
            className="field"
            value={bairro}
            onChange={(e) => setBairro(e.target.value)}
            maxLength={80}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="País">
            <input
              className="field"
              value={pais}
              onChange={(e) => {
                setPais(e.target.value);
                if (normalizeText(e.target.value) !== "brasil") setEstado("");
              }}
              list="country-options"
              maxLength={60}
            />
            <datalist id="country-options">
              {[
                "Brasil",
                "Argentina",
                "Chile",
                "Estados Unidos",
                "Portugal",
                "Espanha",
                "França",
                "Alemanha",
                "Itália",
                "Reino Unido",
                "Angola",
                "África do Sul",
                "China",
                "Japão",
                "Índia",
                "Austrália",
              ].map((country) => (
                <option key={country} value={country} />
              ))}
            </datalist>
          </Field>
          <Field label="Cidade">
            <input
              className="field"
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
              maxLength={60}
            />
          </Field>
          <Field label="Estado">
            <select
              className="field"
              value={estado}
              onChange={(e) => setEstado(e.target.value)}
              required={requiredGuestFields.estado && normalizeText(pais) === "brasil"}
              disabled={normalizeText(pais) !== "brasil"}
            >
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
          <input
            className="field"
            value={cep}
            onChange={(e) => setCep(e.target.value)}
            maxLength={10}
            placeholder="Opcional"
          />
        </Field>
        <p className="text-xs text-muted-foreground">
          A data e o horário do cadastro são registrados automaticamente.
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancelar
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={cpfJaCadastrado || telefoneJaCadastrado}
          >
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
  const digits = onlyDigits(value)
    .replace(/^55(?=\d{10,11}$)/, "")
    .slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}
