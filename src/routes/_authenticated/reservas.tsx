import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Download, Pencil, ArrowLeftRight, Ban, MessageCircle, Trash2 } from "lucide-react";
import {
  useRooms,
  useClients,
  useReservations,
  useComplaints,
  useDelete,
  useInsert,
  useUpdate,
  statusFromPayment,
  hasActiveOverlap,
  roomBlock,
  type Client,
  type Reservation,
} from "@/lib/data";
import { fmtBRL, fmtDate, fmtTime, todayISO, downloadCSV } from "@/lib/format";
import { ROOM_BLOCK_REASONS, complaintLabel } from "@/lib/constants";
import { PageHeader } from "@/components/AppLayout";
import { Modal, Field, Badge, EmptyState } from "@/components/ui-kit";
import { ReservaForm, type ReservaRow } from "@/components/ReservaForm";

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
  const insert = useInsert("reservations", ["reservations"]);
  const insertClient = useInsert("clients", ["clients"]);
  const insertComplaint = useInsert("complaints", ["complaints"]);
  const update = useUpdate("reservations", ["reservations"]);
  const remove = useDelete("reservations", ["reservations"]);
  const updateRoom = useUpdate("rooms", ["rooms"]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Reservation | null>(null);
  const [moving, setMoving] = useState<Reservation | null>(null);
  const [filter, setFilter] = useState("ativas");

  const filtered = useMemo(() => {
    if (filter === "ativas")
      return reservations.filter((r) => !["finalizado", "cancelado"].includes(r.status));
    if (filter === "todas") return reservations;
    return reservations.filter((r) => r.status === filter);
  }, [reservations, filter]);

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
    downloadCSV(`reservas-${todayISO()}.csv`, rows);
  }

  const phoneDigits = (value?: string | null) => (value ?? "").replace(/\D/g, "");

  async function rowWithClient(row: ReservaRow) {
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
    const existing = telefoneDigits
      ? clients.find((c) => phoneDigits(c.telefone) === telefoneDigits)
      : clients.find((c) => c.nome.trim().toLowerCase() === row.cliente_nome.trim().toLowerCase());

    if (existing) {
      const sameName = existing.nome.trim().toLowerCase() === row.cliente_nome.trim().toLowerCase();
      if (!sameName) {
        throw new Error(`Telefone já cadastrado para ${existing.nome}. Se for a mesma pessoa, selecione o cliente cadastrado.`);
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
      quantidade_filhos: row.cliente_tem_filhos ? row.cliente_quantidade_filhos ?? 0 : null,
    })) as unknown as Client[];

    const client = created[0];
    return client ? { ...cleanRow, cliente_id: client.id, cliente_nome: client.nome } : cleanRow;
  }

  return (
    <div>
      <PageHeader
        title="Reservas"
        subtitle="Pagou o total → quarto ocupado. Pagou o sinal → reservado. O sistema bloqueia sobreposição de datas."
        action={
          <div className="flex gap-2">
            <button onClick={exportCSV} className="btn-ghost flex items-center gap-1.5">
              <Download className="h-4 w-4" /> CSV
            </button>
            <button onClick={() => setOpen(true)} className="btn-primary flex items-center gap-1.5">
              <Plus className="h-4 w-4" /> Nova reserva
            </button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-1.5 text-sm">
        {["ativas", "reservado", "ocupado", "finalizado", "todas"].map((f) => (
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
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-border/50">
                  <td className="p-3 font-serif text-lg font-bold">{r.quarto}</td>
                  <td className="p-3">{r.cliente_nome}</td>
                  <td className="p-3 text-muted-foreground">
                    {fmtDate(r.checkin)} {fmtTime(r.horario_checkin)} → {fmtDate(r.checkout)}{" "}
                    {fmtTime(r.horario_checkout)}
                    {r.motivo_estadia && <div className="mt-1 text-xs">Motivo: {r.motivo_estadia}</div>}
                  </td>
                  <td className="p-3">
                    <div>{fmtBRL(r.valor_pago)} / {fmtBRL(r.valor_total)}</div>
                    <Badge tone={r.pago ? "sage" : "brass"}>
                      {r.pago ? "quitado" : Number(r.valor_pago) > 0 ? "sinal pago" : "a receber"}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <Badge tone={statusTone[r.status]}>{r.status}</Badge>
                  </td>
                  <td className="p-3 text-right">
                    <RowActions
                      reservation={r}
                      update={update}
                      remove={remove}
                      updateRoom={updateRoom}
                      client={clients.find((c) => c.id === r.cliente_id)}
                      onEdit={() => setEditing(r)}
                      onMove={() => setMoving(r)}
                    />
                  </td>
                </tr>
              ))}
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
          editing={editing}
          onClose={() => {
            setOpen(false);
            setEditing(null);
          }}
          onSave={(row) => {
            if (editing) {
              rowWithClient(row).then((prepared) => update.mutate(
                { id: editing.id, patch: prepared },
                {
                  onSuccess: () => {
                    toast.success("Reserva atualizada");
                    setEditing(null);
                  },
                  onError: (e: Error) => toast.error(e.message),
                },
              )).catch((e: Error) => toast.error(e.message));
            } else {
              rowWithClient(row).then((prepared) => insert.mutate(prepared as never, {
                onSuccess: () => {
                  toast.success("Reserva criada");
                  setOpen(false);
                },
                onError: (e: Error) => toast.error(e.message),
              })).catch((e: Error) => toast.error(e.message));
            }
          }}
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
  update,
  remove,
  updateRoom,
  client,
  onEdit,
  onMove,
}: {
  reservation: Reservation;
  update: ReturnType<typeof useUpdate>;
  remove: ReturnType<typeof useDelete>;
  updateRoom: ReturnType<typeof useUpdate>;
  client?: Client;
  onEdit: () => void;
  onMove: () => void;
}) {
  const done = ["finalizado", "cancelado"].includes(reservation.status);
  const total = Number(reservation.valor_total);
  const receiptUrl = whatsappReceiptUrl(reservation, client);
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {!done && !reservation.pago && (
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
          <button
            className="rounded-md bg-sage-bg px-2 py-1 text-xs font-semibold text-pine-dark"
            onClick={() =>
              update.mutate(
                {
                  id: reservation.id,
                  patch: {
                    valor_pago: total,
                    pago: true,
                    status: "ocupado",
                    checkin_at: reservation.checkin_at ?? new Date().toISOString(),
                    horario_reserva: reservation.horario_reserva ?? currentTime(),
                    horario_checkin: reservation.horario_checkin ?? currentTime(),
                  },
                },
                {
                  onSuccess: () => toast.success("Pagamento total registrado"),
                  onError: (e: Error) => toast.error(e.message),
                },
              )
            }
          >
            Pagar total
          </button>
        </>
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
                onSuccess: () => toast.success("Check-in realizado"),
                onError: (e: Error) => toast.error(e.message),
              },
            )
          }
        >
          Check-in
        </button>
      )}
      {reservation.status === "ocupado" && (
        <button
          className="rounded-md bg-slate-bg px-2 py-1 text-xs font-semibold text-slate"
          onClick={() =>
            update.mutate(
              { id: reservation.id, patch: { status: "finalizado", horario_checkout: reservation.horario_checkout ?? currentTime() } },
              {
                onSuccess: () => {
                  updateRoom.mutate(
                    { id: reservation.quarto, patch: { situacao: "limpeza" } },
                    {
                      onSuccess: () => toast.success("Check-out realizado; quarto enviado para limpeza"),
                      onError: (e: Error) => toast.error(`Check-out feito, mas falhou ao marcar limpeza: ${e.message}`),
                    },
                  );
                },
                onError: (e: Error) => toast.error(e.message),
              },
            )
          }
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
      <button
        className="rounded-md bg-brick-bg px-2 py-1 text-xs font-semibold text-brick"
        onClick={() => {
          if (!window.confirm(`Cancelar a reserva de ${reservation.cliente_nome}? O registro será mantido no histórico.`)) return;
          update.mutate({
            id: reservation.id,
            patch: { status: "cancelado" },
          }, {
            onSuccess: () => toast.success("Reserva cancelada"),
            onError: (e: Error) => toast.error(e.message),
          });
        }}
        title="Cancelar reserva"
      >
        <Ban className="h-3.5 w-3.5" />
      </button>
      <button
        className="rounded-md bg-brick-bg px-2 py-1 text-xs font-semibold text-brick"
        onClick={() => {
          if (!window.confirm(`Excluir definitivamente a reserva de ${reservation.cliente_nome}?`)) return;
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

  const overlap = hasActiveOverlap(reservations, newRoom, reservation.checkin, reservation.checkout, reservation.id);
  const block = roomBlock(complaints ?? [], newRoom);
  const blocked = !!block && !override;

  return (
    <Modal open onClose={onClose} title={`Trocar quarto — ${reservation.cliente_nome}`}>
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Hóspede atualmente no quarto <strong>{reservation.quarto}</strong>.
        </p>
        <Field label="Novo quarto">
          <select className="field" value={newRoom} onChange={(e) => { setNewRoom(Number(e.target.value)); setOverride(false); }}>
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
            <input className="field" value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={200} />
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
  const status = reservation.pago ? "Quitado" : Number(reservation.valor_pago) > 0 ? "Sinal pago / saldo pendente" : "Pendente";
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
