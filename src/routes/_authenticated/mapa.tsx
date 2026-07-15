import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import {
  useRooms,
  useClients,
  useReservations,
  useSales,
  useComplaints,
  useInsert,
  useUpdate,
  roomStatusToday,
  activeReservationForRoom,
  futureReservationsForRoom,
  roomBlock,
  type Client,
  type Reservation,
  type Room,
} from "@/lib/data";
import { fmtBRL, fmtDate, fmtTime, todayISO } from "@/lib/format";
import { complaintLabel } from "@/lib/constants";
import { PageHeader } from "@/components/AppLayout";
import { Modal, Badge } from "@/components/ui-kit";
import { ReservaForm, type ReservaRow } from "@/components/ReservaForm";

export const Route = createFileRoute("/_authenticated/mapa")({
  component: Mapa,
});

const STATUS_STYLE: Record<string, { bg: string; label: string }> = {
  livre: { bg: "bg-sage-bg border-sage/40 text-pine-dark", label: "Livre" },
  ocupado: { bg: "bg-brick-bg border-brick/40 text-brick", label: "Ocupado" },
  reservado: { bg: "bg-brass-bg border-brass/50 text-[oklch(0.4_0.06_74)]", label: "Reservado" },
  limpeza: { bg: "bg-slate-bg border-slate/40 text-slate", label: "Em limpeza" },
  manutencao: { bg: "bg-slate-bg border-slate/40 text-slate", label: "Manutenção" },
};

function Mapa() {
  const today = todayISO();
  const { data: rooms = [] } = useRooms();
  const { data: clients = [] } = useClients();
  const { data: reservations = [] } = useReservations();
  const { data: sales = [] } = useSales();
  const { data: complaints = [] } = useComplaints();
  const insert = useInsert("reservations", ["reservations"]);
  const insertClient = useInsert("clients", ["clients"]);
  const updateRoom = useUpdate("rooms", ["rooms"]);
  const [selected, setSelected] = useState<Room | null>(null);
  const [newFor, setNewFor] = useState<number | null>(null);
  const [viewDate, setViewDate] = useState(today);

  const complaintsByRoom = useMemo(() => {
    const m = new Map<number, number>();
    complaints
      .filter((c) => c.status !== "resolvido")
      .forEach((c) => c.quarto != null && m.set(c.quarto, (m.get(c.quarto) ?? 0) + 1));
    return m;
  }, [complaints]);

  const roomGroups = useMemo(() => {
    const m = new Map<string, { title: string; price: number; type: string; rooms: Room[] }>();
    rooms.forEach((room) => {
      const type = roomTypeLabel(room);
      const price = Number(room.preco ?? 0);
      const key = `${type}-${price}`;
      if (!m.has(key)) m.set(key, { title: `${type} • ${fmtBRL(price)}`, price, type, rooms: [] });
      m.get(key)!.rooms.push(room);
    });
    return [...m.values()]
      .map((group) => ({ ...group, rooms: group.rooms.sort((a, b) => a.numero - b.numero) }))
      .sort((a, b) => a.price - b.price || a.type.localeCompare(b.type));
  }, [rooms]);

  const maxComplaints = Math.max(1, ...complaintsByRoom.values());
  const revenueByRoom = useMemo(() => {
    const m = new Map<number, number>();
    reservations.forEach((r) => {
      if (!["cancelado", "finalizado"].includes(r.status) && r.checkout >= today) {
        m.set(r.quarto, (m.get(r.quarto) ?? 0) + Number(r.valor_total));
      }
    });
    sales
      .filter((s) => {
        const reservation = s.reserva_id ? reservations.find((r) => r.id === s.reserva_id) : null;
        return !reservation || (!["cancelado", "finalizado"].includes(reservation.status) && reservation.checkout >= today);
      })
      .forEach((s) => m.set(s.quarto, (m.get(s.quarto) ?? 0) + Number(s.total)));
    return m;
  }, [reservations, sales, today]);

  const dateSummary = useMemo(() => {
    const arrivals = reservations.filter((r) => r.status !== "cancelado" && r.checkin === viewDate);
    const departures = reservations.filter((r) => r.status !== "cancelado" && r.checkout === viewDate);
    const occupied = rooms.filter((room) => roomStatusAtDate(reservations, room, viewDate) === "ocupado").length;
    const reserved = rooms.filter((room) => roomStatusAtDate(reservations, room, viewDate) === "reservado").length;
    const cleaning = rooms.filter((room) => roomStatusAtDate(reservations, room, viewDate) === "limpeza").length;
    return { arrivals: arrivals.length, departures: departures.length, occupied, reserved, cleaning };
  }, [reservations, rooms, viewDate]);

  const phoneDigits = (value?: string | null) => (value ?? "").replace(/\D/g, "");

  async function rowWithClient(row: ReservaRow) {
    if (row.cliente_id) return row;
    const telefoneDigits = phoneDigits(row.cliente_telefone);
    const existing = telefoneDigits
      ? clients.find((c) => phoneDigits(c.telefone) === telefoneDigits)
      : clients.find((c) => c.nome.trim().toLowerCase() === row.cliente_nome.trim().toLowerCase());

    const cleanRow = { ...row };
    delete cleanRow.cliente_telefone;
    delete cleanRow.cliente_tipo;
    delete cleanRow.cliente_data_nascimento;
    delete cleanRow.cliente_sexo;
    delete cleanRow.cliente_cidade;
    delete cleanRow.cliente_estado;
    delete cleanRow.cliente_bairro;
    delete cleanRow.cliente_estado_civil;
    delete cleanRow.cliente_tem_filhos;
    delete cleanRow.cliente_quantidade_filhos;

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
      tipo: row.cliente_tipo || "hóspede normal",
      data_nascimento: row.cliente_data_nascimento || null,
      sexo: row.cliente_sexo || null,
      cidade: row.cliente_cidade || null,
      estado: row.cliente_estado || null,
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
        title="Mapa de quartos"
        subtitle="Agrupado por tipo e valor. Escolha uma data para ver reservas futuras, entradas, saídas e limpeza prevista."
      />

      <section className="mb-4 rounded-lg border border-border bg-card p-3 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <label className="text-sm">
            <span className="mb-1 block font-semibold text-muted-foreground">Ver disponibilidade em</span>
            <input
              type="date"
              value={viewDate}
              onChange={(event) => setViewDate(event.target.value || today)}
              className="field max-w-[220px]"
            />
          </label>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
            <MiniCount label="Ocupados" value={dateSummary.occupied} />
            <MiniCount label="Reservados" value={dateSummary.reserved} />
            <MiniCount label="Entram" value={dateSummary.arrivals} />
            <MiniCount label="Saem" value={dateSummary.departures} />
            <MiniCount label="Limpeza" value={dateSummary.cleaning} />
          </div>
        </div>
        {viewDate !== today && (
          <p className="mt-2 text-xs text-muted-foreground">
            Em {fmtDate(viewDate)}, quartos com saída aparecem como limpeza prevista para evitar vender antes da arrumação.
          </p>
        )}
      </section>

      <div className="mb-4 flex flex-wrap gap-3 text-xs">
        {Object.entries(STATUS_STYLE).map(([k, s]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={`inline-block h-3 w-3 rounded ${s.bg.split(" ")[0]}`} /> {s.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded bg-brick" /> intensidade = reclamações abertas
        </span>
      </div>

      <div className="space-y-5">
        {roomGroups.map((group) => (
          <div key={group.title} className="rounded-lg border border-border bg-card/60 p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="section-title text-sm uppercase tracking-wide text-pine-dark">
                {group.title}
              </h3>
              <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground">
                {group.rooms.length} quarto(s)
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8 2xl:grid-cols-10">
              {group.rooms.map((r) => {
                const st = roomStatusAtDate(reservations, r, viewDate);
                const style = STATUS_STYLE[st] ?? STATUS_STYLE.livre;
                const n = complaintsByRoom.get(r.numero) ?? 0;
                const intensity = n / maxComplaints;
                const blocked = !!roomBlock(complaints, r.numero);
                const dayReservation = reservationForDate(reservations, r.numero, viewDate);
                const next = futureReservationsForRoom(reservations, r.numero, viewDate).find(
                  (reservation) => reservation.id !== dayReservation?.id,
                );
                const departure = reservations.find((reservation) => reservation.quarto === r.numero && reservation.status !== "cancelado" && reservation.checkout === viewDate);
                const revenue = revenueByRoom.get(r.numero) ?? 0;
                return (
                  <button
                    key={r.numero}
                    onClick={() => setSelected(r)}
                    className={`relative min-h-[112px] rounded-lg border p-2 text-left transition hover:scale-[1.02] ${n > 0 ? "border-brick" : style.bg}`}
                    style={n > 0 ? { backgroundColor: `rgba(200,60,40,${0.12 + intensity * 0.5})` } : undefined}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-serif text-lg font-bold leading-none">{r.numero}</div>
                      <span className="rounded bg-white/65 px-1.5 py-0.5 text-[9px] font-bold uppercase text-pine-dark">
                        {roomTypeShort(r)}
                      </span>
                    </div>
                    <div className="mt-1 text-[10px] font-semibold opacity-80">{r.andar}º andar · {fmtBRL(r.preco)}</div>
                    <div className="mt-1 text-[10px] font-bold">{style.label}</div>
                    {dayReservation ? (
                      <div className="mt-1 text-[9px] leading-tight opacity-90">
                        {dayReservation.cliente_nome}
                      </div>
                    ) : departure ? (
                      <div className="mt-1 text-[9px] leading-tight opacity-90">
                        Sai: {departure.cliente_nome}
                      </div>
                    ) : next && (
                      <div className="mt-1 text-[9px] leading-tight opacity-90">
                        Próx: {fmtDate(next.checkin)}
                      </div>
                    )}
                    {next && (
                      <div className="mt-1 rounded bg-white/55 px-1.5 py-0.5 text-[9px] font-semibold text-pine-dark">
                        Futuro: {fmtDate(next.checkin)} → {fmtDate(next.checkout)}
                      </div>
                    )}
                    {revenue > 0 && <div className="mt-1 text-[9px] font-semibold">{fmtBRL(revenue)}</div>}
                    {n > 0 && (
                      <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brick px-1 text-[9px] font-bold text-white">
                        {n}
                      </span>
                    )}
                    {blocked && (
                      <span className="absolute bottom-1 right-1 text-[9px] font-bold text-brick">🔒</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <RoomModal
          room={selected}
          onClose={() => setSelected(null)}
          reservation={activeReservationForRoom(reservations, selected.numero)}
          dateReservation={reservationForDate(reservations, selected.numero, viewDate)}
          viewDate={viewDate}
          futureReservations={futureReservationsForRoom(reservations, selected.numero, viewDate).filter(
            (fr) => fr.id !== activeReservationForRoom(reservations, selected.numero)?.id,
          )}
          sales={sales.filter((s) => s.quarto === selected.numero)}
          complaints={complaints.filter((c) => c.quarto === selected.numero)}
          onNew={() => {
            setNewFor(selected.numero);
            setSelected(null);
          }}
          onSituacao={(situacao) => {
            updateRoom.mutate(
              { id: selected.numero, patch: { situacao } },
              {
                onSuccess: () => {
                  toast.success(situacao ? "Situação do quarto atualizada" : "Situação removida");
                  setSelected((prev) => (prev ? { ...prev, situacao } : prev));
                },
                onError: (e) => toast.error(e.message),
              },
            );
          }}
        />
      )}

      {newFor != null && (
        <ReservaForm
          rooms={rooms}
          clients={clients}
          reservations={reservations}
          complaints={complaints}
          fixedRoom={newFor}
          initialCheckin={viewDate}
          onClose={() => setNewFor(null)}
          onSave={(row) =>
            rowWithClient(row).then((prepared) => insert.mutate(prepared as never, {
              onSuccess: () => {
                toast.success("Reserva criada");
                setNewFor(null);
              },
              onError: (e) => toast.error(e.message),
            })).catch((e: Error) => toast.error(e.message))
          }
        />
      )}
    </div>
  );
}

function RoomModal({
  room,
  onClose,
  reservation,
  dateReservation,
  viewDate,
  futureReservations,
  sales,
  complaints,
  onNew,
  onSituacao,
}: {
  room: Room;
  onClose: () => void;
  reservation: ReturnType<typeof activeReservationForRoom>;
  dateReservation: Reservation | null;
  viewDate: string;
  futureReservations: ReturnType<typeof futureReservationsForRoom>;
  sales: { id: string; item: string; qtd: number; total: number; reserva_id: string | null; categoria: string | null }[];
  complaints: { id: string; categoria: string; descricao: string | null; status: string; created_at: string }[];
  onNew: () => void;
  onSituacao: (situacao: string | null) => void;
}) {
  const stayId = reservation?.id;
  const staySales = stayId ? sales.filter((s) => s.reserva_id === stayId || s.reserva_id == null) : sales;
  const salesTotal = staySales.reduce((s, v) => s + Number(v.total), 0);
  const diaria = reservation ? Number(reservation.valor_total) : 0;
  const totalHospedagem = diaria + salesTotal;
  const selectedStay = dateReservation && dateReservation.id !== reservation?.id ? dateReservation : null;

  return (
    <Modal open onClose={onClose} title={`Quarto ${room.numero} — ${room.andar}º andar`} wide>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onSituacao(room.situacao === "limpeza" ? null : "limpeza")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${room.situacao === "limpeza" ? "bg-slate text-white" : "bg-slate-bg text-slate"}`}
          >
            {room.situacao === "limpeza" ? "✓ Em limpeza" : "Marcar limpeza"}
          </button>
          <button
            type="button"
            onClick={() => onSituacao(room.situacao === "manutencao" ? null : "manutencao")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${room.situacao === "manutencao" ? "bg-slate text-white" : "bg-slate-bg text-slate"}`}
          >
            {room.situacao === "manutencao" ? "✓ Em manutenção" : "Marcar manutenção"}
          </button>
          {room.situacao && (
            <button
              type="button"
              onClick={() => onSituacao(null)}
              className="rounded-md bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground"
            >
              Liberar quarto
            </button>
          )}
        </div>
        <button onClick={onNew} className="btn-primary flex items-center gap-1.5">
          <Plus className="h-4 w-4" /> Nova reserva neste quarto
        </button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <section>
          {selectedStay && (
            <div className="mb-4 rounded-lg border border-brass/50 bg-brass-bg/60 p-3 text-sm">
              <h4 className="mb-1 font-semibold">Reserva em {fmtDate(viewDate)}</h4>
              <p className="font-semibold">{selectedStay.cliente_nome}</p>
              <p className="text-muted-foreground">
                {fmtDate(selectedStay.checkin)} {fmtTime(selectedStay.horario_checkin)} →{" "}
                {fmtDate(selectedStay.checkout)} {fmtTime(selectedStay.horario_checkout)}
              </p>
            </div>
          )}

          <h4 className="mb-2 font-semibold">Hospedagem atual</h4>
          {reservation ? (
            <div className="space-y-1 text-sm">
              <p className="font-semibold">{reservation.cliente_nome}</p>
              <p className="text-muted-foreground">
                {fmtDate(reservation.checkin)} {fmtTime(reservation.horario_checkin)} →{" "}
                {fmtDate(reservation.checkout)} {fmtTime(reservation.horario_checkout)} · {reservation.diarias} diária(s)
              </p>
              <p>Diárias: {fmtBRL(reservation.valor_total)}</p>
              <p>
                Status:{" "}
                <Badge tone={reservation.pago ? "sage" : "brick"}>
                  {reservation.pago ? "Pago" : "A receber"}
                </Badge>
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sem reserva ativa.</p>
          )}

          <h4 className="mb-2 mt-4 font-semibold">Próximas reservas</h4>
          {futureReservations.length ? (
            <ul className="space-y-1 text-sm">
              {futureReservations.map((fr) => (
                <li key={fr.id} className="flex items-center justify-between border-b border-border/60 py-1">
                  <span>
                    {fr.cliente_nome} · {fmtDate(fr.checkin)} {fmtTime(fr.horario_checkin)} →{" "}
                    {fmtDate(fr.checkout)} {fmtTime(fr.horario_checkout)}
                  </span>
                  <Badge tone="brass">{fr.status}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma reserva futura — quarto livre para novas datas.</p>
          )}

          <h4 className="mb-2 mt-4 font-semibold">Vendas desta estadia</h4>
          {staySales.length ? (
            <ul className="space-y-1 text-sm">
              {staySales.map((s) => (
                <li key={s.id} className="flex justify-between border-b border-border/60 py-1">
                  <span>{s.item} ×{s.qtd}</span>
                  <span>{fmtBRL(s.total)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma venda registrada.</p>
          )}

          <div className="mt-3 rounded-lg bg-sage-bg/60 p-3">
            <div className="flex justify-between text-sm">
              <span>Diárias</span>
              <span>{fmtBRL(diaria)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Vendas</span>
              <span>{fmtBRL(salesTotal)}</span>
            </div>
            <div className="mt-1 flex justify-between border-t border-pine/20 pt-1 font-serif text-lg font-bold text-pine-dark">
              <span>Total da hospedagem</span>
              <span>{fmtBRL(totalHospedagem)}</span>
            </div>
          </div>
        </section>

        <section>
          <h4 className="mb-2 font-semibold">Histórico de reclamações</h4>
          {complaints.length ? (
            <ul className="space-y-2 text-sm">
              {complaints.map((c) => (
                <li key={c.id} className="rounded-lg border border-border p-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{complaintLabel(c.categoria)}</span>
                    <Badge tone={c.status === "resolvido" ? "sage" : "brick"}>{c.status}</Badge>
                  </div>
                  {c.descricao && <p className="mt-1 text-muted-foreground">{c.descricao}</p>}
                  <p className="mt-1 text-[11px] text-muted-foreground">{fmtDate(c.created_at)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma reclamação neste quarto. 👍</p>
          )}
        </section>
      </div>
    </Modal>
  );
}

function MiniCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <p className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="font-serif text-lg font-bold leading-tight text-pine-dark">{value}</p>
    </div>
  );
}

function roomTypeLabel(room: Room) {
  const text = normalizeRoomText(room.configuracao);
  if ((text.includes("1c") && text.includes("1s")) || text.includes("casal solteiro")) return "Casal + solteiro";
  if (text.includes("2 solteiro") || text.includes("2s") || text.includes("duplo solteiro")) return "Duplo solteiro";
  if (text.includes("casal")) return "Casal";
  if (text.includes("solteiro")) return "Solteiro";
  if (text.includes("triplo")) return "Triplo";
  return room.configuracao || "Sem configuração";
}

function roomTypeShort(room: Room) {
  const label = roomTypeLabel(room);
  if (label === "Casal + solteiro") return "C+S";
  if (label === "Duplo solteiro") return "2S";
  if (label === "Casal") return "C";
  if (label === "Solteiro") return "S";
  if (label === "Triplo") return "3";
  return label.slice(0, 3);
}

function normalizeRoomText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function roomStatusAtDate(reservations: Reservation[], room: Room, date: string) {
  const manual = String((room as { situacao?: string | null }).situacao ?? "");
  if (date === todayISO() && (manual === "limpeza" || manual === "manutencao")) return manual;
  const active = reservations.filter(
    (reservation) =>
      reservation.quarto === room.numero &&
      reservation.status !== "cancelado" &&
      reservation.status !== "finalizado" &&
      reservation.status !== "manutencao",
  );
  if (active.some((reservation) => reservation.checkin === date)) return "reservado";
  if (active.some((reservation) => reservation.checkin < date && reservation.checkout > date)) return "ocupado";
  if (active.some((reservation) => reservation.checkout === date)) return "limpeza";
  return "livre";
}

function reservationForDate(reservations: Reservation[], roomNumber: number, date: string) {
  return (
    reservations.find(
      (reservation) =>
        reservation.quarto === roomNumber &&
        reservation.status !== "cancelado" &&
        reservation.status !== "finalizado" &&
        reservation.status !== "manutencao" &&
        reservation.checkin <= date &&
        reservation.checkout > date,
    ) ?? null
  );
}
