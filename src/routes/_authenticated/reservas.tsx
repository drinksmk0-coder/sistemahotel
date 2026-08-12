import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  ArrowLeftRight,
  Ban,
  MessageCircle,
  Star,
  Trash2,
  Upload,
  UsersRound,
  Search,
  Send,
  FileText,
} from "lucide-react";
import {
  useRooms,
  useClients,
  useReservations,
  useComplaints,
  useDelete,
  useInsert,
  useUpdate,
  useRateRules,
  useReservationGroups,
  useSales,
  useCurrentCompany,
  statusFromPayment,
  hasActiveOverlap,
  roomBlock,
  type Client,
  type Reservation,
} from "@/lib/data";
import { supabase } from "@/integrations/supabase/client";
import { fmtBRL, fmtDate, fmtTime, todayISO, downloadExcel } from "@/lib/format";
import { ROOM_BLOCK_REASONS, complaintLabel } from "@/lib/constants";
import { PageHeader } from "@/components/AppLayout";
import { Modal, Field, Badge, EmptyState } from "@/components/ui-kit";
import { ReservaForm, type ReservaRow } from "@/components/ReservaForm";
import {
  GroupReservationForm,
  type GroupReservationPayload,
} from "@/components/GroupReservationForm";
import { GuestPaymentModal } from "@/components/GuestPaymentModal";
import { buildGuestAccount, type GuestAccount } from "@/lib/guest-account";
import {
  ReservationImportModal,
  type ReservationImportResult,
} from "@/components/ReservationImportModal";
import { ExportPeriodButton, type ExportScope } from "@/components/ExportPeriodButton";
import {
  CompanyBillingCheckoutModal,
  type CompanyBillingCheckout,
} from "@/components/CompanyBillingCheckoutModal";

export const Route = createFileRoute("/_authenticated/reservas")({
  component: Reservas,
});

const statusTone: Record<string, string> = {
  reservado: "brass",
  ocupado: "brick",
  saida_pendente: "brass",
  finalizado: "slate",
  cancelado: "slate",
  manutencao: "slate",
};

function Reservas() {
  const { data: rooms = [] } = useRooms();
  const { data: clients = [] } = useClients();
  const { data: reservations = [] } = useReservations();
  const { data: complaints = [] } = useComplaints();
  const { data: rateRules = [] } = useRateRules();
  const { data: reservationGroups = [] } = useReservationGroups();
  const { data: sales = [] } = useSales();
  const currentCompany = useCurrentCompany();
  const queryClient = useQueryClient();
  const insert = useInsert("reservations", ["reservations"]);
  const insertClient = useInsert("clients", ["clients"]);
  const insertComplaint = useInsert("complaints", ["complaints"]);
  const update = useUpdate("reservations", ["reservations"]);
  const remove = useDelete("reservations", ["reservations"]);
  const updateRoom = useUpdate("rooms", ["rooms"]);
  const [open, setOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [groupBusy, setGroupBusy] = useState(false);
  const [editing, setEditing] = useState<Reservation | null>(null);
  const [moving, setMoving] = useState<Reservation | null>(null);
  const [filter, setFilter] = useState("ativas");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const reservationId = new URLSearchParams(window.location.search).get("editar");
    if (!reservationId || !reservations.length) return;
    const reservation = reservations.find((item) => item.id === reservationId);
    if (!reservation) return;
    setEditing(reservation);
    window.history.replaceState({}, "", window.location.pathname);
  }, [reservations]);
  const [dateFilter, setDateFilter] = useState("");


  const overdueDepartures = reservations.filter(
    (reservation) =>
      reservation.status === "saida_pendente" ||
      (reservation.status === "ocupado" && reservation.checkout < todayISO()),
  );

  const filtered = useMemo(() => {
    let filteredRows: Reservation[];
    if (filter === "ativas")
      filteredRows = reservations.filter((r) => !["finalizado", "cancelado"].includes(r.status));
    else if (filter === "pendencias")
      filteredRows = reservations.filter(
        (reservation) =>
          reservation.status !== "cancelado" &&
          reservation.status !== "manutencao" &&
          reservation.checkout < todayISO() &&
          buildGuestAccount(reservation, sales).balance > 0,
      );
    else if (filter === "saidas")
      filteredRows = reservations.filter(
        (reservation) =>
          reservation.status === "saida_pendente" ||
          (reservation.status === "ocupado" && reservation.checkout < todayISO()),
      );
    else if (filter === "todas") filteredRows = reservations;
    else filteredRows = reservations.filter((r) => r.status === filter);

    if (dateFilter) {
      filteredRows = filteredRows.filter(
        (reservation) =>
          reservation.checkin <= dateFilter && reservation.checkout >= dateFilter,
      );
    }



    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return filteredRows;
    return filteredRows.filter((reservation) =>
      [
        reservation.id,
        reservation.cliente_nome,
        reservation.quarto,
        reservation.canal,
        reservation.status,
        reservation.billing_company_name,
      ].some((value) => String(value ?? "").toLocaleLowerCase("pt-BR").includes(term)),
    );
  }, [reservations, sales, filter, search, dateFilter]);

  function exportCSV(scope: ExportScope) {
    const exportedReservations =
      scope.mode === "date"
        ? reservations.filter(
            (reservation) =>
              reservation.checkin <= scope.date && reservation.checkout >= scope.date,
          )
        : reservations;
    const suffix = scope.mode === "date" ? scope.date : "historico-completo";
    const rows: (string | number | null)[][] = [
      [
        "Quarto",
        "Cliente",
        "CPF",
        "Telefone",
        "Nascimento",
        "Sexo",
        "Estado civil",
        "Cidade",
        "Estado",
        "Profissão",
        "Tipo de cliente",
        "Check-in",
        "Horário check-in",
        "Check-out",
        "Horário check-out",
        "Horário da reserva",
        "Diárias",
        "Pessoas",
        "Valor diária",
        "Desconto",
        "Total",
        "Pago",
        "Pagamento",
        "Canal de vendas",
        "Motivo da estadia",
        "Status",
      ],
      ...exportedReservations.map((r) => {
        const client = clients.find((c) => c.id === r.cliente_id);
        return [
          r.quarto,
          r.cliente_nome,
          client?.cpf ?? "",
          client?.telefone ?? "",
          client?.data_nascimento ?? "",
          client?.sexo ?? "",
          client?.estado_civil ?? "",
          client?.cidade ?? "",
          client?.estado ?? "",
          client?.profissao ?? "",
          client?.tipo ?? "",
          r.checkin,
          fmtTime(r.horario_checkin),
          r.checkout,
          fmtTime(r.horario_checkout),
          fmtTime(r.horario_reserva),
          r.diarias,
          r.pessoas,
          r.valor_diaria,
          r.desconto,
          r.valor_total,
          r.valor_pago,
          r.pagamento,
          r.canal ?? "",
          r.motivo_estadia ?? "",
          r.status,
        ];
      }),
    ];
    downloadExcel(`reservas-${suffix}.xls`, rows);
  }

  const phoneDigits = (value?: string | null) => (value ?? "").replace(/\D/g, "");

  async function rowWithClient(row: ReservaRow, knownClients = clients) {
    const cleanRow = { ...row };
    delete cleanRow.cliente_telefone;
    delete cleanRow.cliente_email;
    delete cleanRow.cliente_cpf;
    delete cleanRow.cliente_tipo;
    delete cleanRow.cliente_data_nascimento;
    delete cleanRow.cliente_sexo;
    delete cleanRow.cliente_profissao;
    delete cleanRow.cliente_cidade;
    delete cleanRow.cliente_estado;
    delete cleanRow.cliente_cep;
    delete cleanRow.cliente_bairro;
    delete cleanRow.cliente_estado_civil;
    delete cleanRow.cliente_tem_filhos;
    delete cleanRow.cliente_quantidade_filhos;

    if (row.cliente_id) return cleanRow;
    const telefoneDigits = phoneDigits(row.cliente_telefone);
    const existingAnyStatus = telefoneDigits
      ? knownClients.find((c) => phoneDigits(c.telefone) === telefoneDigits)
      : knownClients.find(
          (c) => c.nome.trim().toLowerCase() === row.cliente_nome.trim().toLowerCase(),
        );
    if (
      existingAnyStatus &&
      (existingAnyStatus.ativo === false || existingAnyStatus.tipo.startsWith("desativado:"))
    ) {
      throw new Error(
        `O telefone pertence ao cliente desativado ${existingAnyStatus.nome}. Reative esse cadastro antes de criar a reserva.`,
      );
    }
    const existing = existingAnyStatus;

    if (existing) {
      const sameName = existing.nome.trim().toLowerCase() === row.cliente_nome.trim().toLowerCase();
      if (!sameName) {
        throw new Error(
          `Telefone já cadastrado para ${existing.nome}. Se for a mesma pessoa, selecione o cliente cadastrado.`,
        );
      }
      return { ...cleanRow, cliente_id: existing.id, cliente_nome: existing.nome };
    }

    const created = (await insertClient.mutateAsync({
      nome: row.cliente_nome,
      telefone: row.cliente_telefone || null,
      email: row.cliente_email || null,
      cpf: row.cliente_cpf || null,
      tipo: row.cliente_tipo || "hóspede normal",
      data_nascimento: row.cliente_data_nascimento || null,
      sexo: row.cliente_sexo || null,
      profissao: row.cliente_profissao || null,
      cidade: row.cliente_cidade || null,
      estado: row.cliente_estado || null,
      cep: row.cliente_cep || null,
      bairro: row.cliente_bairro || null,
      estado_civil: row.cliente_estado_civil || null,
      tem_filhos: row.cliente_tem_filhos ?? null,
      quantidade_filhos: row.cliente_tem_filhos ? (row.cliente_quantidade_filhos ?? 0) : null,
    })) as unknown as Client[];

    const client = created[0];
    if (client) knownClients.push(client);
    return client ? { ...cleanRow, cliente_id: client.id, cliente_nome: client.nome } : cleanRow;
  }

  async function importReservations(rows: ReservaRow[]): Promise<ReservationImportResult> {
    const errors: string[] = [];
    const knownClients = [...clients];
    const occupied = reservations
      .filter((reservation) => !["cancelado", "manutencao"].includes(reservation.status))
      .map((reservation) => ({
        quarto: reservation.quarto,
        checkin: reservation.checkin,
        checkout: reservation.checkout,
      }));
    let imported = 0;

    for (const [index, row] of rows.entries()) {
      const overlaps = occupied.some(
        (item) =>
          item.quarto === row.quarto &&
          row.checkin < item.checkout &&
          row.checkout > item.checkin,
      );
      if (overlaps && row.status !== "cancelado") {
        errors.push(
          `Linha ${index + 2}: UH ${row.quarto} já está ocupada nesse período; não importada.`,
        );
        continue;
      }
      try {
        const prepared = await rowWithClient(row, knownClients);
        await insert.mutateAsync(prepared as never);
        if (!["cancelado", "manutencao"].includes(row.status)) {
          occupied.push({ quarto: row.quarto, checkin: row.checkin, checkout: row.checkout });
        }
        imported += 1;
      } catch (error) {
        errors.push(
          `Linha ${index + 2}: ${
            error instanceof Error ? error.message : "falha ao importar a reserva"
          }`,
        );
      }
    }
    if (imported) toast.success(`${imported} reserva(s) importada(s)`);
    return { imported, errors };
  }

  async function createGroupReservation(payload: GroupReservationPayload) {
    if (!currentCompany.data?.id) {
      toast.error("Empresa não encontrada.");
      return;
    }
    setGroupBusy(true);
    try {
      const { error } = await (supabase as any).rpc("create_group_reservation", {
        p_group: {
          ...payload.group,
          company_id: currentCompany.data.id,
        },
        p_reservations: payload.reservations,
      });
      if (error) throw error;

      await queryClient.invalidateQueries({ queryKey: ["reservations"] });
      await queryClient.invalidateQueries({ queryKey: ["reservation_groups"] });
      toast.success(`${payload.reservations.length} reservas criadas no grupo.`);
      setGroupOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao criar reserva em grupo.");
    } finally {
      setGroupBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Reservas"
        subtitle={`${reservations.length} reserva(s) · hospedagem, consumo e pagamentos consolidados`}
        action={
          <div className="flex gap-2">
            <ExportPeriodButton onExport={exportCSV} />
            <button
              onClick={() => setImportOpen(true)}
              className="btn-ghost flex items-center gap-1.5"
            >
              <Upload className="h-4 w-4" /> Importar
            </button>
            <button
              onClick={() => setGroupOpen(true)}
              className="btn-ghost flex items-center gap-1.5"
            >
              <UsersRound className="h-4 w-4" /> Reserva em grupo
            </button>
            <button onClick={() => setOpen(true)} className="btn-primary flex items-center gap-1.5">
              <Plus className="h-4 w-4" /> Nova reserva
            </button>
          </div>
        }
      />

      {overdueDepartures.length > 0 && (
        <button
          type="button"
          className="mb-2 flex w-full items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-left text-sm text-amber-950 shadow-sm"
          onClick={() => setFilter("saidas")}
        >
          <span>
            <strong>{overdueDepartures.length} saída(s) aguardando conferência.</strong> O quarto
            deixa de ficar ocupado automaticamente, mas a conta continua pendente até a baixa.
          </span>
          <span className="shrink-0 rounded-full bg-amber-200 px-2.5 py-1 text-xs font-bold">
            Ver saídas
          </span>
        </button>
      )}

      <div className="mb-3 flex flex-col gap-2 rounded-xl border border-border bg-card p-2.5 shadow-sm lg:flex-row lg:items-center">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Buscar reserva</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="field h-9 bg-muted/45 pl-9"
            placeholder="Buscar por hóspede, código, quarto ou canal..."
          />
        </label>
        <label className="flex min-w-[170px] items-center gap-2 rounded-lg border border-border bg-background px-2 text-xs font-semibold text-muted-foreground">
          <span>Data</span>
          <input
            type="date"
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value)}
            className="h-8 min-w-0 flex-1 bg-transparent text-foreground outline-none"
          />
          {dateFilter && (
            <button
              type="button"
              onClick={() => setDateFilter("")}
              className="rounded px-1 text-muted-foreground hover:text-foreground"
              title="Limpar data"
            >
              ×
            </button>
          )}
        </label>
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <label className="flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1">
            <span className="font-semibold text-muted-foreground">Na data</span>
            <input
              type="date"
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
              className="bg-transparent text-xs outline-none"
            />
          </label>
          {dateFilter && (
            <button type="button" className="rounded-full bg-muted px-2.5 py-1.5 font-semibold" onClick={() => setDateFilter("")}>
              Limpar data
            </button>
          )}
          {["ativas", "saidas", "pendencias", "reservado", "ocupado", "finalizado", "todas"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-2.5 py-1.5 font-semibold capitalize transition ${filter === f ? "bg-pine text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:text-foreground"}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState text="Nenhuma reserva neste filtro." />
      ) : (
        <div className="card-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="p-2.5">Código</th>
                <th className="p-2.5">Hóspede</th>
                <th className="p-2.5">Quarto</th>
                <th className="p-2.5">Check-in</th>
                <th className="p-2.5">Check-out</th>
                <th className="p-2.5">Canal</th>
                <th className="p-2.5">Valor</th>
                <th className="p-2.5">Status</th>
                <th className="p-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const account = buildGuestAccount(r, sales);
                const daysOverdue =
                  r.checkout < todayISO() ? calendarDayDifference(todayISO(), r.checkout) : 0;
                const rowDeparturePending =
                  r.status === "saida_pendente" ||
                  (r.status === "ocupado" && daysOverdue > 0);
                const companyBillingPending =
                  r.billing_responsibility === "company" && account.balance > 0;
                const needsAttention =
                  r.status !== "cancelado" &&
                  r.status !== "manutencao" &&
                  (rowDeparturePending || (daysOverdue > 0 && account.balance > 0));
                const room = rooms.find((item) => item.numero === r.quarto);
                return (
                  <tr
                    key={r.id}
                    className={`border-b border-border/50 ${needsAttention ? "bg-brick-bg/35" : ""}`}
                  >
                    <td className="p-2.5 text-xs font-bold text-primary">
                      #{String(r.id).slice(0, 6).toUpperCase()}
                    </td>
                    <td className="p-2.5">
                      <strong className="block text-sm text-pine-dark">{r.cliente_nome}</strong>
                      {r.group_id && (
                        <span className="text-[9px] font-semibold text-primary">
                          {reservationGroups.find((group) => group.id === r.group_id)?.nome ??
                            "Reserva em grupo"}
                        </span>
                      )}
                    </td>
                    <td className="p-2.5">
                      <strong className="block text-sm text-pine-dark">UH {r.quarto}</strong>
                      <span className="text-[9px] text-muted-foreground">
                        {room?.configuracao || "Unidade habitacional"}
                      </span>
                    </td>
                    <td className="p-2.5 text-xs">
                      {fmtDate(r.checkin)}
                      <span className="block text-[9px] text-muted-foreground">
                        {fmtTime(r.horario_checkin)}
                      </span>
                    </td>
                    <td className="p-2.5 text-xs">
                      {fmtDate(r.checkout)}
                      <span className="block text-[9px] text-muted-foreground">
                        {fmtTime(r.horario_checkout)}
                      </span>
                    </td>
                    <td className="p-2.5 text-xs font-semibold">{r.canal || "Direto"}</td>
                    <td className="p-2.5">
                      <strong className="block whitespace-nowrap text-sm text-pine-dark">
                        {fmtBRL(account.total)}
                      </strong>
                      <span
                        className={`text-[9px] font-semibold ${
                          account.balance > 0 ? "text-brick" : "text-sage"
                        }`}
                      >
                        {account.balance > 0
                          ? `Falta ${fmtBRL(account.balance)}`
                          : "Conta quitada"}
                      </span>
                      {companyBillingPending && (
                        <span className="mt-0.5 block text-[9px] font-bold text-primary">
                          Empresa: {r.billing_company_name || "não identificada"}
                          {r.billing_due_date ? ` · vence ${fmtDate(r.billing_due_date)}` : ""}
                        </span>
                      )}
                      {needsAttention && (
                        <div className="mt-1 text-[9px] font-bold text-brick">
                          {companyBillingPending
                            ? "A receber da empresa"
                            : rowDeparturePending
                              ? "Saída pendente de conferência"
                              : r.status === "finalizado"
                                ? "Checkout com saldo"
                                : "Reserva vencida"}
                          {daysOverdue > 0 ? ` · ${daysOverdue} dia(s)` : ""}
                        </div>
                      )}
                    </td>
                    <td className="p-2.5">
                      <Badge tone={statusTone[r.status]}>
                        {r.status === "saida_pendente" ? "saída pendente" : r.status}
                      </Badge>
                    </td>
                    <td className="p-2.5 text-right">
                      <RowActions
                        reservation={r}
                        account={account}
                        update={update}
                        remove={remove}
                        updateRoom={updateRoom}
                        client={clients.find((c) => c.id === r.cliente_id)}
                        onEdit={() => setEditing(r)}
                        onMove={() => setMoving(r)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {(open || editing) && (
        <ReservaForm
          rooms={rooms}
          clients={clients}
          reservations={reservations}
          complaints={complaints}
          rateRules={rateRules}
          editing={editing}
          onClose={() => {
            setOpen(false);
            setEditing(null);
          }}
          onSave={(row) => {
            if (editing) {
              rowWithClient(row)
                .then((prepared) =>
                  update.mutate(
                    { id: editing.id, patch: prepared },
                    {
                      onSuccess: () => {
                        toast.success("Reserva atualizada");
                        setEditing(null);
                      },
                      onError: (e: Error) => toast.error(e.message),
                    },
                  ),
                )
                .catch((e: Error) => toast.error(e.message));
            } else {
              rowWithClient(row)
                .then((prepared) =>
                  insert.mutate(prepared as never, {
                    onSuccess: () => {
                      toast.success("Reserva criada");
                      setOpen(false);
                    },
                    onError: (e: Error) => toast.error(e.message),
                  }),
                )
                .catch((e: Error) => toast.error(e.message));
            }
          }}
        />
      )}

      {groupOpen && (
        <GroupReservationForm
          rooms={rooms}
          reservations={reservations}
          rateRules={rateRules}
          busy={groupBusy}
          onClose={() => setGroupOpen(false)}
          onSave={createGroupReservation}
        />
      )}

      {importOpen && (
        <ReservationImportModal
          rooms={rooms}
          onClose={() => setImportOpen(false)}
          onImport={importReservations}
        />
      )}

      {moving && (
        <MoveRoomModal
          reservation={moving}
          rooms={rooms}
          reservations={reservations}
          complaints={complaints}
          onClose={() => setMoving(null)}
          onConfirm={(newRoom, reason, desc) => {
            update.mutate(
              { id: moving.id, patch: { quarto: newRoom } },
              {
                onSuccess: () => {
                  if (reason) {
                    insertComplaint.mutate({
                      quarto: moving.quarto,
                      categoria: reason,
                      gravidade: "alta",
                      descricao: desc || null,
                      origem: "recepcao",
                      status: "aberto",
                    } as never);
                  }
                  toast.success(`Hóspede movido para o quarto ${newRoom}`);
                  setMoving(null);
                },
                onError: (e: Error) => toast.error(e.message),
              },
            );
          }}
        />
      )}
    </div>
  );
}

function RowActions({
  reservation,
  account,
  update,
  remove,
  updateRoom,
  client,
  onEdit,
  onMove,
}: {
  reservation: Reservation;
  account: GuestAccount;
  update: ReturnType<typeof useUpdate>;
  remove: ReturnType<typeof useDelete>;
  updateRoom: ReturnType<typeof useUpdate>;
  client?: Client;
  onEdit: () => void;
  onMove: () => void;
}) {
  const done = ["finalizado", "cancelado"].includes(reservation.status);
  const departureStage = ["ocupado", "saida_pendente"].includes(reservation.status);
  const total = Number(reservation.valor_total);
  const balance = account.balance;
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [companyBillingOpen, setCompanyBillingOpen] = useState(false);
  const [companyBillingBusy, setCompanyBillingBusy] = useState(false);
  const receiptUrl = whatsappReceiptUrl(reservation, client);
  const reviewUrl = whatsappReviewUrl(reservation, client);

  function markGuestDeparted() {
    update.mutate(
      {
        id: reservation.id,
        patch: {
          status: "saida_pendente",
          presence_status: "checkout",
          horario_checkout: currentTime(),
          checkout_at: new Date().toISOString(),
        },
      },
      {
        onSuccess: () => {
          updateRoom.mutate(
            { id: reservation.quarto, patch: { situacao: "limpeza" } },
            { onError: (e: Error) => toast.error(`Saída registrada, mas falhou ao enviar o quarto para limpeza: ${e.message}`) },
          );
          toast.success(balance > 0 ? `Hóspede saiu. Saldo pendente: ${fmtBRL(balance)}.` : "Hóspede saiu; quarto enviado para limpeza.");
        },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  }

  function finishCheckout(
    extraPatch: Record<string, unknown> = {},
    options?: { companyBilling?: boolean },
  ) {
    if (options?.companyBilling) setCompanyBillingBusy(true);
    update.mutate(
      {
        id: reservation.id,
        patch: {
          status: "finalizado",
          horario_checkout: reservation.horario_checkout ?? currentTime(),
          checkout_at: new Date().toISOString(),
          ...extraPatch,
        },
      },
      {
        onSuccess: () => {
          updateRoom.mutate(
            { id: reservation.quarto, patch: { situacao: "limpeza" } },
            {
              onSuccess: () => {
                toast.success(
                  options?.companyBilling
                    ? "Check-out realizado; saldo enviado para contas a receber da empresa."
                    : "Check-out realizado; quarto enviado para limpeza",
                );
                setCompanyBillingOpen(false);
                setCompanyBillingBusy(false);
              },
              onError: (e: Error) => {
                toast.error(`Check-out feito, mas falhou ao marcar limpeza: ${e.message}`);
                setCompanyBillingOpen(false);
                setCompanyBillingBusy(false);
              },
            },
          );
        },
        onError: (e: Error) => {
          toast.error(e.message);
          setCompanyBillingBusy(false);
        },
      },
    );
  }

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {!done && account.lodgingPaid <= 0 && (
        <>
          <button
            className="rounded-md bg-brass-bg px-2 py-1 text-xs font-semibold text-[oklch(0.4_0.06_74)]"
            onClick={() =>
              update.mutate(
                {
                  id: reservation.id,
                  patch: {
                    valor_pago: Math.round((total / 2) * 100) / 100,
                    pago: false,
                    status: "reservado",
                    horario_reserva: reservation.horario_reserva ?? currentTime(),
                  },
                },
                {
                  onSuccess: () => toast.success("Sinal registrado"),
                  onError: (e: Error) => toast.error(e.message),
                },
              )
            }
          >
            Sinal
          </button>
        </>
      )}
      {balance > 0 && reservation.status !== "cancelado" && (
        <button
          className="rounded-md bg-sage-bg px-2 py-1 text-xs font-semibold text-pine-dark"
          onClick={() => setPaymentOpen(true)}
        >
          Receber conta
        </button>
      )}
      {reservation.status === "reservado" && (
        <button
          className="rounded-md bg-brick-bg px-2 py-1 text-xs font-semibold text-brick"
          onClick={() =>
            update.mutate(
              {
                id: reservation.id,
                patch: {
                  status: "ocupado",
                  checkin_at: reservation.checkin_at ?? new Date().toISOString(),
                  horario_checkin: reservation.horario_checkin ?? currentTime(),
                },
              },
              {
                onSuccess: () => {
                  updateRoom.mutate(
                    { id: reservation.quarto, patch: { situacao: "ocupado" } },
                    {
                      onError: (e: Error) =>
                        toast.error(`Check-in feito, mas falhou ao atualizar o quarto: ${e.message}`),
                    },
                  );
                  toast.success(
                    balance > 0
                      ? `Check-in realizado com saldo pendente de ${fmtBRL(balance)}.`
                      : "Check-in realizado",
                  );
                },
                onError: (e: Error) => toast.error(e.message),
              },
            )
          }
          title={balance > 0 ? "O pagamento será acompanhado na conta do hóspede." : undefined}
        >
          Check-in
        </button>
      )}
      {reservation.status === "ocupado" && (
        <button
          className="rounded-md bg-brass-bg px-2 py-1 text-xs font-bold text-pine-dark"
          onClick={markGuestDeparted}
          title="Registrar que o hóspede deixou fisicamente o hotel; a conta pode continuar pendente"
        >
          O hóspede saiu
        </button>
      )}
      {departureStage && (
        <button
          className="rounded-md bg-slate-bg px-2 py-1 text-xs font-semibold text-slate"
          onClick={() => {
            if (balance > 0) {
              toast.error(
                `Check-out bloqueado: faltam ${fmtBRL(balance)}. Receba a conta ou use “Faturar empresa”.`,
              );
              setPaymentOpen(true);
              return;
            }
            finishCheckout({
              billing_status:
                reservation.billing_responsibility === "company" ? "paid" : "not_applicable",
            });
          }}
        >
          {balance > 0 ? "Receber antes do check-out" : "Check-out"}
        </button>
      )}
      {departureStage && balance > 0 && (
        <button
          className="rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary"
          onClick={() => setCompanyBillingOpen(true)}
          title="Concluir a saída mantendo o saldo a receber da empresa"
        >
          Faturar empresa
        </button>
      )}
      {departureStage && (
        <button
          className="rounded-md bg-brass-bg px-2 py-1 text-xs font-semibold text-[oklch(0.4_0.06_74)]"
          onClick={onEdit}
          title="Editar check-out e estender estadia"
        >
          Estender
        </button>
      )}
      {!done && (
        <button
          className="rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground"
          onClick={onMove}
          title="Trocar de quarto"
        >
          <ArrowLeftRight className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        className="rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground"
        onClick={onEdit}
        title="Editar"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      {!done && (
        <button
          className="rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary"
          onClick={() => sendOnlineCheckin(reservation, client)}
          title="Enviar FNRH e check-in online pelo WhatsApp"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      )}
      {receiptUrl ? (
        <a
          className="rounded-md bg-sage-bg px-2 py-1 text-xs font-semibold text-pine-dark"
          href={receiptUrl}
          target="_blank"
          rel="noopener"
          title="Enviar recibo no WhatsApp"
        >
          <MessageCircle className="h-3.5 w-3.5" />
        </a>
      ) : (
        <button
          className="rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground"
          onClick={() => toast.error("Cadastre o telefone do cliente para enviar pelo WhatsApp.")}
          title="Cliente sem telefone"
        >
          <MessageCircle className="h-3.5 w-3.5" />
        </button>
      )}
      <NfseDocumentAction reservation={reservation} client={client} />
      {reviewUrl ? (
        <a
          className="rounded-md bg-brass-bg px-2 py-1 text-xs font-semibold text-pine-dark"
          href={reviewUrl}
          target="_blank"
          rel="noopener"
          title="Enviar avaliação pelo WhatsApp"
        >
          <Star className="h-3.5 w-3.5" />
        </a>
      ) : (
        <button
          className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
          onClick={() => toast.error("Cadastre o telefone do cliente para enviar a avaliação.")}
          title="Cliente sem telefone"
        >
          <Star className="h-3.5 w-3.5" />
        </button>
      )}
      {!done && (
        <button
          className="rounded-md bg-brick-bg px-2 py-1 text-xs font-semibold text-brick"
          onClick={() => {
            if (
              !window.confirm(
                `Cancelar a reserva de ${reservation.cliente_nome}? O registro será mantido no histórico.`,
              )
            )
              return;
            update.mutate(
              {
                id: reservation.id,
                patch: { status: "cancelado" },
              },
              {
                onSuccess: () => toast.success("Reserva cancelada"),
                onError: (e: Error) => toast.error(e.message),
              },
            );
          }}
          title="Cancelar reserva"
        >
          <Ban className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        className="rounded-md bg-brick-bg px-2 py-1 text-xs font-semibold text-brick"
        onClick={() => {
          if (!window.confirm(`Excluir definitivamente a reserva de ${reservation.cliente_nome}?`))
            return;
          remove.mutate(reservation.id, {
            onSuccess: () => toast.success("Reserva excluída"),
            onError: (e: Error) => toast.error(e.message),
          });
        }}
        title="Excluir reserva"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      {paymentOpen && <GuestPaymentModal account={account} onClose={() => setPaymentOpen(false)} />}
      {companyBillingOpen && (
        <CompanyBillingCheckoutModal
          reservation={reservation}
          balance={balance}
          busy={companyBillingBusy}
          onClose={() => setCompanyBillingOpen(false)}
          onConfirm={(billing: CompanyBillingCheckout) =>
            finishCheckout(billing, { companyBilling: true })
          }
        />
      )}
    </div>
  );
}

function calendarDayDifference(laterISO: string, earlierISO: string): number {
  const later = new Date(`${laterISO}T12:00:00`);
  const earlier = new Date(`${earlierISO}T12:00:00`);
  return Math.max(0, Math.round((later.getTime() - earlier.getTime()) / 86_400_000));
}

function MoveRoomModal({
  reservation,
  rooms,
  reservations,
  complaints,
  onClose,
  onConfirm,
}: {
  reservation: Reservation;
  rooms: ReturnType<typeof useRooms>["data"];
  reservations: Reservation[];
  complaints: ReturnType<typeof useComplaints>["data"];
  onClose: () => void;
  onConfirm: (newRoom: number, reason: string | null, desc: string) => void;
}) {
  const others = (rooms ?? []).filter((r) => r.numero !== reservation.quarto);
  const [newRoom, setNewRoom] = useState<number>(others[0]?.numero ?? reservation.quarto);
  const [reason, setReason] = useState<string>("");
  const [desc, setDesc] = useState("");
  const [override, setOverride] = useState(false);

  const overlap = hasActiveOverlap(
    reservations,
    newRoom,
    reservation.checkin,
    reservation.checkout,
    reservation.id,
  );
  const block = roomBlock(complaints ?? [], newRoom);
  const blocked = !!block && !override;

  return (
    <Modal open onClose={onClose} title={`Trocar quarto — ${reservation.cliente_nome}`}>
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Hóspede atualmente no quarto <strong>{reservation.quarto}</strong>.
        </p>
        <Field label="Novo quarto">
          <select
            className="field"
            value={newRoom}
            onChange={(e) => {
              setNewRoom(Number(e.target.value));
              setOverride(false);
            }}
          >
            {others.map((r) => (
              <option key={r.numero} value={r.numero}>
                {r.numero} ({r.andar}º)
              </option>
            ))}
          </select>
        </Field>

        <Field label="Motivo da saída do quarto anterior (bloqueia novos hóspedes)">
          <select className="field" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Sem motivo (não bloquear)</option>
            {ROOM_BLOCK_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        {reason && (
          <Field label="Detalhe (opcional)">
            <input
              className="field"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              maxLength={200}
            />
          </Field>
        )}

        {overlap && (
          <p className="rounded-lg bg-brick-bg px-3 py-2 text-sm text-brick">
            ⚠ O quarto {newRoom} já tem reserva no período desta hospedagem.
          </p>
        )}
        {block && (
          <div className="rounded-lg bg-brick-bg px-3 py-2 text-sm">
            <p className="font-semibold text-brick">
              ⚠ Quarto {newRoom} bloqueado: {complaintLabel(block.categoria)}
            </p>
            <p className="mt-1 text-brick">Liberar mesmo assim?</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setOverride(true)}
                className={`rounded-md px-3 py-1 text-xs font-semibold ${override ? "bg-pine text-primary-foreground" : "bg-sage-bg text-pine-dark"}`}
              >
                Sim
              </button>
              <button
                type="button"
                onClick={() => setOverride(false)}
                className={`rounded-md px-3 py-1 text-xs font-semibold ${!override ? "bg-brick text-white" : "bg-muted text-muted-foreground"}`}
              >
                Não
              </button>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={overlap || blocked}
            onClick={() => onConfirm(newRoom, reason || null, desc.trim())}
          >
            Confirmar troca
          </button>
        </div>
      </div>
    </Modal>
  );
}

function whatsappReceiptUrl(reservation: Reservation, client?: Client) {
  const phone = whatsappPhone(client?.telefone);
  if (!phone) return "";
  const status = reservation.pago
    ? "Quitado"
    : Number(reservation.valor_pago) > 0
      ? "Sinal pago / saldo pendente"
      : "Pendente";
  const balance = Math.max(0, Number(reservation.valor_total) - Number(reservation.valor_pago));
  const line = "------------------------------";
  const message = [
    "🏨 HOTEL REAL CRUZÍLIA",
    "RECIBO DE HOSPEDAGEM",
    line,
    `Cliente: ${reservation.cliente_nome}`,
    `Quarto: ${reservation.quarto}`,
    `Entrada: ${fmtDate(reservation.checkin)} ${fmtTime(reservation.horario_checkin)}`,
    `Saída: ${fmtDate(reservation.checkout)} ${fmtTime(reservation.horario_checkout)}`,
    `Diárias: ${reservation.diarias}`,
    line,
    `Total: ${fmtBRL(reservation.valor_total)}`,
    `Pago: ${fmtBRL(reservation.valor_pago)}`,
    `Saldo: ${fmtBRL(balance)}`,
    `Status: ${status}`,
    line,
    "Para nota fiscal, envie os dados da empresa/CNPJ por aqui que a recepção dará continuidade.",
    "Obrigado pela preferência!",
  ].join("\n");
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

async function sendOnlineCheckin(reservation: Reservation, client?: Client) {
  const phone = whatsappPhone(client?.telefone);
  if (!phone) {
    toast.error("Cadastre o telefone do cliente para enviar o check-in online.");
    return;
  }
  const existing = await (supabase as any)
    .from("guest_checkins")
    .select("public_token,status")
    .eq("reservation_id", reservation.id)
    .maybeSingle();
  if (existing.error) {
    toast.error(existing.error.message);
    return;
  }
  let token = existing.data?.public_token as string | undefined;
  if (!token) {
    const created = await (supabase as any)
      .from("guest_checkins")
      .insert({
        company_id: reservation.company_id,
        reservation_id: reservation.id,
        client_id: reservation.cliente_id ?? null,
      })
      .select("public_token")
      .single();
    if (created.error) {
      toast.error(created.error.message);
      return;
    }
    token = created.data.public_token;
  }
  const formUrl = `${window.location.origin}/checkin-online?token=${token}`;
  if (existing.data?.status && existing.data.status !== "enviado") {
    window.open(formUrl, "_blank", "noopener");
    toast.success("Ficha preenchida aberta para conferência ou impressão.");
    return;
  }
  const message = [
    `Olá, ${reservation.cliente_nome}!`,
    `Para agilizar seu check-in no quarto ${reservation.quarto}, preencha e assine a Ficha Nacional de Registro de Hóspedes pelo celular:`,
    formUrl,
    "Ao finalizar, a recepção receberá os dados para conferência.",
  ].join("\n\n");
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
}

function NfseDocumentAction({
  reservation,
  client,
}: {
  reservation: Reservation;
  client?: Client;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function shareOfficialNfse(file?: File) {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Selecione o PDF oficial da NFS-e emitida pela Prefeitura.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("O PDF da NFS-e deve ter no máximo 10 MB.");
      return;
    }
    const phone = whatsappPhone(client?.telefone);
    if (!phone) {
      toast.error("Cadastre o telefone do cliente para enviar a NFS-e.");
      return;
    }

    const text = [
      `Olá, ${reservation.cliente_nome}!`,
      "Segue a NFS-e oficial da sua hospedagem, emitida pela Prefeitura de Cruzília.",
      `Reserva: ${reservation.codigo_externo ?? reservation.id.slice(0, 8)} · Quarto ${reservation.quarto}`,
    ].join("\n\n");
    const shareData: ShareData = {
      files: [file],
      title: "NFS-e oficial",
      text,
    };

    if (navigator.canShare?.(shareData)) {
      try {
        await navigator.share(shareData);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        toast.error("Não foi possível compartilhar o PDF neste dispositivo.");
      }
      return;
    }

    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    toast.info("Conversa aberta. Clique no clipe do WhatsApp e anexe o PDF oficial selecionado.");
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(event) => {
          void shareOfficialNfse(event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
      <button
        type="button"
        className="rounded-md bg-slate-bg px-2 py-1 text-xs font-semibold text-slate"
        onClick={() => inputRef.current?.click()}
        title="Selecionar e compartilhar o PDF oficial da NFS-e"
      >
        <FileText className="h-3.5 w-3.5" />
      </button>
    </>
  );
}

function whatsappReviewUrl(reservation: Reservation, client?: Client) {
  const phone = whatsappPhone(client?.telefone);
  if (!phone || typeof window === "undefined") return "";
  const formUrl = `${window.location.origin}/avaliar?quarto=${reservation.quarto}&empresa=${reservation.company_id}`;
  const message = [
    `Olá, ${reservation.cliente_nome}!`,
    "Obrigado por se hospedar conosco.",
    "Você pode avaliar sua estadia pelo link abaixo. É rápido e ajuda muito nossa equipe:",
    formUrl,
  ].join("\n\n");
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function whatsappPhone(value?: string | null) {
  const digits = (value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

void statusFromPayment;

function currentTime() {
  return new Date().toTimeString().slice(0, 5);
}
