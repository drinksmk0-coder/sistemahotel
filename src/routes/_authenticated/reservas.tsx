import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  Download,
  Pencil,
  ArrowLeftRight,
  Ban,
  MessageCircle,
  Star,
  Trash2,
  UsersRound,
  Upload,
} from "lucide-react";
import {
  useRooms,
  useClients,
  useReservations,
  useSales,
  useComplaints,
  useDelete,
  useInsert,
  useUpdate,
  useRateRules,
  useReservationGroups,
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

export const Route = createFileRoute("/_authenticated/reservas")({
  component: Reservas,
});

const statusTone: Record<string, string> = {
  reservado: "brass",
  ocupado: "brick",
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
  const [groupBusy, setGroupBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Reservation | null>(null);
  const [moving, setMoving] = useState<Reservation | null>(null);
  const [filter, setFilter] = useState("ativas");

  const filtered = useMemo(() => {
    if (filter === "ativas")
      return reservations.filter((r) => !["finalizado", "cancelado"].includes(r.status));
    if (filter === "pendencias")
      return reservations.filter(
        (reservation) =>
          !["cancelado", "manutencao"].includes(reservation.status) &&
          buildGuestAccount(reservation, sales).balance > 0,
      );
    if (filter === "todas") return reservations;
    return reservations.filter((r) => r.status === filter);
  }, [reservations, sales, filter]);

  function exportCSV() {
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
      ...reservations.map((r) => {
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
    downloadExcel(`reservas-${todayISO()}.xls`, rows);
  }

  const phoneDigits = (value?: string | null) => (value ?? "").replace(/\D/g, "");

  async function rowWithClient(row: ReservaRow, knownClients: Client[] = [...clients]) {
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
    const activeClients = knownClients.filter((client) => client.ativo !== false);
    const existing = telefoneDigits
      ? activeClients.find((c) => phoneDigits(c.telefone) === telefoneDigits)
      : activeClients.find(
          (c) => c.nome.trim().toLowerCase() === row.cliente_nome.trim().toLowerCase(),
        );

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
    const knownClients = [...clients];
    const occupied = [...reservations];
    const errors: string[] = [];
    let imported = 0;
    for (const [index, row] of rows.entries()) {
      if (hasActiveOverlap(occupied, row.quarto, row.checkin, row.checkout)) {
        errors.push(`Linha ${index + 2}: UH ${row.quarto} já possui reserva nesse período.`);
        continue;
      }
      try {
        const prepared = await rowWithClient(row, knownClients);
        const inserted = (await insert.mutateAsync(prepared as never)) as unknown as Reservation[];
        if (inserted[0]) occupied.push(inserted[0]);
        imported += 1;
      } catch (error) {
        errors.push(
          `Linha ${index + 2} (${row.cliente_nome}): ${error instanceof Error ? error.message : "falha ao importar"}`,
        );
      }
    }
    if (imported) toast.success(`${imported} reserva(s) importada(s).`);
    if (errors.length) toast.warning(`${errors.length} linha(s) não foram importadas.`);
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
        subtitle="Pagou o total → quarto ocupado. Pagou o sinal → reservado. O sistema bloqueia sobreposição de datas."
        action={
          <div className="flex gap-2">
            <button onClick={() => setImportOpen(true)} className="btn-ghost flex items-center gap-1.5">
              <Upload className="h-4 w-4" /> Importar
            </button>
            <button onClick={exportCSV} className="btn-ghost flex items-center gap-1.5">
              <Download className="h-4 w-4" /> Excel
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

      <div className="mb-4 flex flex-wrap gap-1.5 text-sm">
        {["ativas", "pendencias", "reservado", "ocupado", "finalizado", "todas"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 font-semibold capitalize ${filter === f ? "bg-pine text-primary-foreground" : "bg-muted text-muted-foreground"}`}
          >
            {f}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState text="Nenhuma reserva neste filtro." />
      ) : (
        <div className="card-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="p-3">Quarto</th>
                <th className="p-3">Cliente</th>
                <th className="p-3">Período</th>
                <th className="p-3">Pago / Total</th>
                <th className="p-3">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const account = buildGuestAccount(r, sales);
                return (
                <tr key={r.id} className="border-b border-border/50">
                  <td className="p-3 font-serif text-lg font-bold">{r.quarto}</td>
                  <td className="p-3">{r.cliente_nome}</td>
                  <td className="p-3 text-muted-foreground">
                    {fmtDate(r.checkin)} {fmtTime(r.horario_checkin)} → {fmtDate(r.checkout)}{" "}
                    {fmtTime(r.horario_checkout)}
                    {r.motivo_estadia && (
                      <div className="mt-1 text-xs">Motivo: {r.motivo_estadia}</div>
                    )}
                    {r.group_id && (
                      <div className="mt-1 text-xs font-semibold text-pine">
                        Grupo:{" "}
                        {reservationGroups.find((group) => group.id === r.group_id)?.nome ??
                          "Reserva em grupo"}
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    <div>
                      {fmtBRL(account.paid)} / {fmtBRL(account.total)}
                    </div>
                    {account.extrasTotal > 0 && (
                      <div className="text-xs text-muted-foreground">
                        Consumos: {fmtBRL(account.extrasTotal)}
                      </div>
                    )}
                    <Badge tone={account.balance <= 0 ? "sage" : "brass"}>
                      {account.balance <= 0
                        ? "conta quitada"
                        : account.paid > 0
                          ? `parcial · falta ${fmtBRL(account.balance)}`
                          : `a receber ${fmtBRL(account.balance)}`}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <Badge tone={statusTone[r.status]}>{r.status}</Badge>
                  </td>
                  <td className="p-3 text-right">
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
  const [paymentOpen, setPaymentOpen] = useState(false);
  const done = ["finalizado", "cancelado"].includes(reservation.status);
  const receiptUrl = whatsappReceiptUrl(reservation, account, client);
  const reviewUrl = whatsappReviewUrl(reservation, client);
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {!done && account.balance > 0 && (
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
          onClick={() => {
            if (account.lodgingPaid < account.lodgingTotal) {
              toast.error(
                `Antes do check-in, receba o saldo das diárias: ${fmtBRL(account.lodgingTotal - account.lodgingPaid)}.`,
              );
              setPaymentOpen(true);
              return;
            }
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
                onSuccess: () => toast.success("Check-in realizado"),
                onError: (e: Error) => toast.error(e.message),
              },
            );
          }}
        >
          Check-in
        </button>
      )}
      {reservation.status === "ocupado" && (
        <button
          className="rounded-md bg-slate-bg px-2 py-1 text-xs font-semibold text-slate"
          onClick={() => {
            if (account.balance > 0) {
              toast.error(
                `Check-out bloqueado: falta receber ${fmtBRL(account.balance)} entre diárias e consumos.`,
              );
              setPaymentOpen(true);
              return;
            }
            update.mutate(
              {
                id: reservation.id,
                patch: {
                  status: "finalizado",
                  horario_checkout: reservation.horario_checkout ?? currentTime(),
                },
              },
              {
                onSuccess: () => {
                  updateRoom.mutate(
                    { id: reservation.quarto, patch: { situacao: "limpeza" } },
                    {
                      onSuccess: () =>
                        toast.success("Check-out realizado; quarto enviado para limpeza"),
                      onError: (e: Error) =>
                        toast.error(`Check-out feito, mas falhou ao marcar limpeza: ${e.message}`),
                    },
                  );
                },
                onError: (e: Error) => toast.error(e.message),
              },
            );
          }}
        >
          Check-out
        </button>
      )}
      {reservation.status === "ocupado" && (
        <button
          className="rounded-md bg-brass-bg px-2 py-1 text-xs font-semibold text-[oklch(0.4_0.06_74)]"
          onClick={onEdit}
          title="Editar check-out e estender estadia"
        >
          Estender
        </button>
      )}
      {paymentOpen && (
        <GuestPaymentModal account={account} onClose={() => setPaymentOpen(false)} />
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
    </div>
  );
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

function whatsappReceiptUrl(reservation: Reservation, account: GuestAccount, client?: Client) {
  const phone = whatsappPhone(client?.telefone);
  if (!phone) return "";
  const status = account.balance <= 0
    ? "Quitado"
    : account.paid > 0
      ? "Sinal pago / saldo pendente"
      : "Pendente";
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
    `Diárias: ${fmtBRL(account.lodgingTotal)}`,
    `Produtos e serviços: ${fmtBRL(account.extrasTotal)}`,
    `Total da conta: ${fmtBRL(account.total)}`,
    `Pago: ${fmtBRL(account.paid)}`,
    `Saldo: ${fmtBRL(account.balance)}`,
    `Status: ${status}`,
    line,
    "Para nota fiscal, envie os dados da empresa/CNPJ por aqui que a recepção dará continuidade.",
    "Obrigado pela preferência!",
  ].join("\n");
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
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
