import { useMemo, useState } from "react";
import { CalendarDays, LayoutGrid, MessageCircle, Plus, Rows3, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import {
  activeReservationForRoom,
  futureReservationsForRoom,
  roomBlock,
  roomStatusToday,
  type Client,
  type Reservation,
  type Room,
  type Sale,
  useClients,
  useComplaints,
  useInsert,
  useRateRules,
  useReservations,
  useRooms,
  useSales,
  useUpdate,
} from "@/lib/data";
import { fmtBRL, fmtDate, fmtTime, todayISO } from "@/lib/format";
import { buildGuestAccount } from "@/lib/guest-account";
import { ReservaForm, type ReservaRow } from "@/components/ReservaForm";
import { RoomTimeline } from "@/components/RoomTimeline";
import {
  ROOM_FEATURE_FILTERS,
  RoomFeatureBadges,
  RoomFeaturesEditor,
  roomMatchesFeature,
  type RoomFeaturePatch,
  type RoomWithFeatures,
} from "@/components/RoomFeatures";
import { Badge, Modal } from "@/components/ui-kit";
import { complaintLabel } from "@/lib/constants";

const STATUS_STYLE: Record<string, { bg: string; label: string }> = {
  livre: { bg: "bg-sage-bg border-sage/40 text-pine-dark", label: "Livre" },
  hospedado_pago: { bg: "bg-pine/12 border-pine/45 text-pine-dark", label: "Hospedado · quitado" },
  hospedado_debito: { bg: "bg-brick-bg border-brick/45 text-brick", label: "Hospedado · débito" },
  sinal_pago: { bg: "bg-brass-bg border-brass/55 text-[oklch(0.4_0.06_74)]", label: "Sinal pago" },
  reservado: { bg: "bg-[oklch(0.95_0.04_95)] border-brass/50 text-[oklch(0.4_0.06_74)]", label: "Reservado sem pagamento" },
  limpeza: { bg: "bg-slate-bg border-slate/40 text-slate", label: "Em limpeza" },
  manutencao: { bg: "bg-zinc-200 border-zinc-400 text-zinc-800", label: "Manutenção" },
};

export function MapaQuartos() {
  const today = todayISO();
  const { data: rooms = [] } = useRooms();
  const { data: clients = [] } = useClients();
  const { data: reservations = [] } = useReservations();
  const { data: sales = [] } = useSales();
  const { data: complaints = [] } = useComplaints();
  const { data: rateRules = [] } = useRateRules();
  const insertReservation = useInsert("reservations", ["reservations"]);
  const insertClient = useInsert("clients", ["clients"]);
  const updateRoom = useUpdate("rooms", ["rooms"]);

  const [selected, setSelected] = useState<Room | null>(null);
  const [newFor, setNewFor] = useState<number | null>(null);
  const [viewDate, setViewDate] = useState(today);
  const [viewMode, setViewMode] = useState<"timeline" | "cards">("timeline");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [featureFilter, setFeatureFilter] = useState("todos");
  const [roomSearch, setRoomSearch] = useState("");

  const filteredRooms = useMemo(
    () =>
      rooms.filter((room) => {
        if (roomSearch.trim() && !String(room.numero).includes(roomSearch.trim())) return false;
        if (featureFilter !== "todos" && !roomMatchesFeature(room as RoomWithFeatures, featureFilter)) return false;
        if (statusFilter !== "todos" && roomVisualStatus(reservations, sales, room, viewDate) !== statusFilter) return false;
        return true;
      }),
    [featureFilter, reservations, roomSearch, rooms, sales, statusFilter, viewDate],
  );

  const groups = useMemo(() => {
    const map = new Map<string, Room[]>();
    filteredRooms.forEach((room) => {
      const key = roomTypeLabel(room);
      map.set(key, [...(map.get(key) ?? []), room]);
    });
    return [...map.entries()]
      .map(([name, items]) => ({ name, rooms: items.sort((a, b) => a.numero - b.numero) }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [filteredRooms]);

  const summary = useMemo(() => {
    const statuses = rooms.map((room) => roomVisualStatus(reservations, sales, room, viewDate));
    return {
      livres: statuses.filter((status) => status === "livre").length,
      ocupados: statuses.filter((status) => status.startsWith("hospedado")).length,
      reservados: statuses.filter((status) => status === "reservado" || status === "sinal_pago").length,
      limpeza: statuses.filter((status) => status === "limpeza").length,
      smart: rooms.filter((room) => Boolean((room as RoomWithFeatures).tv_smart)).length,
      frigobar: rooms.filter((room) => Boolean((room as RoomWithFeatures).frigobar)).length,
    };
  }, [reservations, rooms, sales, viewDate]);

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
    const phone = onlyDigits(row.cliente_telefone);
    const existing = phone
      ? clients.find((client) => onlyDigits(client.telefone) === phone)
      : clients.find((client) => client.nome.trim().toLowerCase() === row.cliente_nome.trim().toLowerCase());

    if (existing && (existing.ativo === false || existing.tipo.startsWith("desativado:"))) {
      throw new Error(`O cliente ${existing.nome} está desativado. Reative o cadastro antes de reservar.`);
    }
    if (existing) return { ...cleanRow, cliente_id: existing.id, cliente_nome: existing.nome };

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
    return created[0]
      ? { ...cleanRow, cliente_id: created[0].id, cliente_nome: created[0].nome }
      : cleanRow;
  }

  function saveFeatures(room: Room, patch: RoomFeaturePatch) {
    updateRoom.mutate(
      { id: room.numero, patch },
      {
        onSuccess: () => {
          toast.success(`Características do quarto ${room.numero} salvas`);
          setSelected((current) => (current?.numero === room.numero ? ({ ...current, ...patch } as Room) : current));
        },
        onError: (error) => toast.error(error.message),
      },
    );
  }

  return (
    <div className="space-y-3 pb-8">
      <section className="rounded-xl border border-border bg-card p-2 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-auto text-base font-bold text-pine-dark">Mapa de quartos</h1>
          <button
            type="button"
            className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-bold ${viewMode === "timeline" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            onClick={() => setViewMode("timeline")}
          >
            <Rows3 className="h-3.5 w-3.5" /> Linha do tempo
          </button>
          <button
            type="button"
            className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-bold ${viewMode === "cards" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            onClick={() => setViewMode("cards")}
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Cards
          </button>
        </div>

        <div className="mt-2 grid gap-2 border-t border-border/60 pt-2 sm:grid-cols-2 lg:grid-cols-[150px_120px_minmax(180px,1fr)_minmax(180px,1fr)]">
          <label className="relative">
            <CalendarDays className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-primary" />
            <input type="date" className="field h-9 pl-8 text-xs" value={viewDate} onChange={(event) => setViewDate(event.target.value || today)} />
          </label>
          <input
            className="field h-9 text-xs"
            inputMode="numeric"
            placeholder="Buscar UH"
            value={roomSearch}
            onChange={(event) => setRoomSearch(event.target.value.replace(/\D/g, ""))}
          />
          <select className="field h-9 text-xs" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="todos">Todas as situações</option>
            <option value="livre">Livres</option>
            <option value="hospedado_pago">Hospedados quitados</option>
            <option value="hospedado_debito">Hospedados com débito</option>
            <option value="sinal_pago">Sinal pago</option>
            <option value="reservado">Reservados</option>
            <option value="limpeza">Em limpeza</option>
            <option value="manutencao">Em manutenção</option>
          </select>
          <label className="relative">
            <SlidersHorizontal className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-primary" />
            <select className="field h-9 pl-8 text-xs" value={featureFilter} onChange={(event) => setFeatureFilter(event.target.value)}>
              {ROOM_FEATURE_FILTERS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5 text-[9px] text-muted-foreground">
          <SummaryChip label="Livres" value={summary.livres} />
          <SummaryChip label="Ocupados" value={summary.ocupados} />
          <SummaryChip label="Reservados" value={summary.reservados} />
          <SummaryChip label="Limpeza" value={summary.limpeza} />
          <SummaryChip label="Smart TV" value={summary.smart} />
          <SummaryChip label="Frigobar" value={summary.frigobar} />
          <span className="ml-auto self-center font-semibold">{filteredRooms.length} de {rooms.length} quarto(s)</span>
        </div>
      </section>

      {viewMode === "timeline" ? (
        <RoomTimeline
          rooms={filteredRooms}
          reservations={reservations}
          startDate={viewDate}
          onStartDateChange={setViewDate}
          onRoomClick={setSelected}
          onCreateReservation={(room, date) => {
            setViewDate(date);
            setNewFor(room.numero);
          }}
        />
      ) : (
        <section className="space-y-4">
          {groups.map((group) => (
            <article key={group.name} className="rounded-xl border border-border bg-card/60 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold uppercase tracking-wide text-pine-dark">{group.name}</h2>
                <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground">{group.rooms.length} quarto(s)</span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {group.rooms.map((room) => {
                  const status = roomVisualStatus(reservations, sales, room, viewDate);
                  const style = STATUS_STYLE[status] ?? STATUS_STYLE.livre;
                  const reservation = reservationForDate(reservations, room.numero, viewDate);
                  const next = futureReservationsForRoom(reservations, room.numero, viewDate).find((item) => item.id !== reservation?.id);
                  const blocked = Boolean(roomBlock(complaints, room.numero));
                  const openComplaints = complaints.filter((item) => item.quarto === room.numero && item.status !== "resolvido").length;
                  return (
                    <button
                      key={room.numero}
                      type="button"
                      onClick={() => setSelected(room)}
                      className={`relative min-h-[172px] rounded-xl border p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${openComplaints ? "border-brick" : style.bg}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="block text-[9px] font-bold uppercase tracking-[0.18em] opacity-65">Quarto</span>
                          <strong className="font-serif text-2xl leading-none">{room.numero}</strong>
                        </div>
                        <span className="rounded bg-white/70 px-2 py-1 text-[9px] font-bold text-pine-dark">{fmtBRL(room.preco)}</span>
                      </div>
                      <p className="mt-1 text-[10px] font-bold">{style.label}</p>
                      <p className="text-[9px] opacity-75">{room.andar}º andar · {roomTypeLabel(room)}</p>
                      <div className="mt-2">
                        <RoomFeatureBadges room={room} compact max={5} />
                      </div>
                      {reservation ? (
                        <p className="mt-2 truncate text-[9px] font-semibold">{reservation.cliente_nome}</p>
                      ) : next ? (
                        <p className="mt-2 text-[9px] font-semibold">Próxima: {fmtDate(next.checkin)}</p>
                      ) : (
                        <p className="mt-2 text-[9px] text-muted-foreground">Sem reserva futura próxima</p>
                      )}
                      {openComplaints > 0 && (
                        <span className="absolute right-2 top-11 rounded-full bg-brick px-1.5 py-0.5 text-[9px] font-bold text-white">{openComplaints} ocorrência(s)</span>
                      )}
                      {blocked && <span className="absolute bottom-2 right-2 text-[10px] font-bold text-brick">🔒 Bloqueado</span>}
                    </button>
                  );
                })}
              </div>
            </article>
          ))}
          {!groups.length && (
            <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
              Nenhum quarto corresponde aos filtros selecionados.
            </div>
          )}
        </section>
      )}

      {selected && (
        <RoomDetailModal
          room={selected}
          reservation={activeReservationForRoom(reservations, selected.numero)}
          dateReservation={reservationForDate(reservations, selected.numero, viewDate)}
          futureReservations={futureReservationsForRoom(reservations, selected.numero, viewDate)}
          sales={sales.filter((sale) => sale.quarto === selected.numero)}
          complaints={complaints.filter((complaint) => complaint.quarto === selected.numero)}
          clients={clients}
          viewDate={viewDate}
          savingFeatures={updateRoom.isPending}
          onSaveFeatures={(patch) => saveFeatures(selected, patch)}
          onSituacao={(situacao) =>
            updateRoom.mutate(
              { id: selected.numero, patch: { situacao } },
              {
                onSuccess: () => {
                  toast.success("Situação do quarto atualizada");
                  setSelected((current) => (current ? ({ ...current, situacao } as Room) : current));
                },
                onError: (error) => toast.error(error.message),
              },
            )
          }
          onNew={() => {
            setNewFor(selected.numero);
            setSelected(null);
          }}
          onClose={() => setSelected(null)}
        />
      )}

      {newFor != null && (
        <ReservaForm
          rooms={rooms}
          clients={clients}
          reservations={reservations}
          complaints={complaints}
          rateRules={rateRules}
          fixedRoom={newFor}
          initialCheckin={viewDate}
          onClose={() => setNewFor(null)}
          onSave={(row) =>
            rowWithClient(row)
              .then((prepared) =>
                insertReservation.mutate(prepared as never, {
                  onSuccess: () => {
                    toast.success("Reserva criada");
                    setNewFor(null);
                  },
                  onError: (error) => toast.error(error.message),
                }),
              )
              .catch((error: Error) => toast.error(error.message))
          }
        />
      )}
    </div>
  );
}

function RoomDetailModal({
  room,
  reservation,
  dateReservation,
  futureReservations,
  sales,
  complaints,
  clients,
  viewDate,
  savingFeatures,
  onSaveFeatures,
  onSituacao,
  onNew,
  onClose,
}: {
  room: Room;
  reservation: Reservation | null;
  dateReservation: Reservation | null;
  futureReservations: Reservation[];
  sales: Sale[];
  complaints: { id: string; categoria: string; descricao: string | null; status: string; created_at: string }[];
  clients: Client[];
  viewDate: string;
  savingFeatures: boolean;
  onSaveFeatures: (patch: RoomFeaturePatch) => void;
  onSituacao: (value: string | null) => void;
  onNew: () => void;
  onClose: () => void;
}) {
  const stay = dateReservation ?? reservation;
  const staySales = salesForStay(sales, stay);
  const account = stay ? buildGuestAccount(stay, sales) : null;
  const client = stay?.cliente_id ? clients.find((item) => item.id === stay.cliente_id) : undefined;
  const whatsapp = stay && client?.telefone ? whatsappRoomUrl(stay, client.telefone, room.numero) : "";

  return (
    <Modal open onClose={onClose} title={`Quarto ${room.numero} — ${room.andar}º andar`} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <button type="button" className={room.situacao === "limpeza" ? "btn-primary" : "btn-ghost"} onClick={() => onSituacao(room.situacao === "limpeza" ? null : "limpeza")}>Limpeza</button>
            <button type="button" className={room.situacao === "manutencao" ? "btn-primary" : "btn-ghost"} onClick={() => onSituacao(room.situacao === "manutencao" ? null : "manutencao")}>Manutenção</button>
            {room.situacao && <button type="button" className="btn-ghost" onClick={() => onSituacao(null)}>Liberar quarto</button>}
          </div>
          <div className="flex flex-wrap gap-2">
            {whatsapp && (
              <a className="btn-ghost inline-flex items-center gap-1" href={whatsapp} target="_blank" rel="noreferrer">
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </a>
            )}
            <button type="button" className="btn-primary inline-flex items-center gap-1" onClick={onNew}>
              <Plus className="h-4 w-4" /> Nova reserva neste quarto
            </button>
          </div>
        </div>

        <RoomFeaturesEditor room={room} saving={savingFeatures} onSave={onSaveFeatures} />

        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-xl border border-border p-3">
            <h4 className="font-semibold text-pine-dark">Hospedagem em {fmtDate(viewDate)}</h4>
            {stay ? (
              <div className="mt-2 space-y-1 text-sm">
                <p className="font-semibold">{stay.cliente_nome}</p>
                <p className="text-muted-foreground">{fmtDate(stay.checkin)} {fmtTime(stay.horario_checkin)} → {fmtDate(stay.checkout)} {fmtTime(stay.horario_checkout)}</p>
                <p>Total da reserva: {fmtBRL(stay.valor_total)}</p>
                <p>Pago: {fmtBRL(stay.valor_pago)}</p>
                <p>Consumo: {fmtBRL(account?.salesTotal ?? 0)}</p>
                <p className="font-bold text-pine-dark">Saldo: {fmtBRL(account?.balance ?? 0)}</p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Quarto sem hospedagem nesta data.</p>
            )}

            <h4 className="mb-2 mt-4 font-semibold">Próximas reservas</h4>
            {futureReservations.length ? (
              <ul className="space-y-1 text-xs">
                {futureReservations.slice(0, 8).map((future) => (
                  <li key={future.id} className="flex justify-between gap-2 border-b border-border/60 py-1">
                    <span>{future.cliente_nome} · {fmtDate(future.checkin)} → {fmtDate(future.checkout)}</span>
                    <Badge tone="brass">{future.status}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma reserva futura.</p>
            )}

            <h4 className="mb-2 mt-4 font-semibold">Vendas da estadia</h4>
            {staySales.length ? (
              <ul className="space-y-1 text-xs">
                {staySales.map((sale) => (
                  <li key={sale.id} className="flex justify-between border-b border-border/60 py-1">
                    <span>{sale.item} × {sale.qtd}</span>
                    <span>{fmtBRL(sale.total)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma venda ligada à estadia.</p>
            )}
          </section>

          <section className="rounded-xl border border-border p-3">
            <h4 className="font-semibold text-pine-dark">Histórico de ocorrências</h4>
            {complaints.length ? (
              <ul className="mt-2 space-y-2 text-sm">
                {complaints.map((complaint) => (
                  <li key={complaint.id} className="rounded-lg border border-border p-2">
                    <div className="flex items-center justify-between gap-2">
                      <strong>{complaintLabel(complaint.categoria)}</strong>
                      <Badge tone={complaint.status === "resolvido" ? "sage" : "brick"}>{complaint.status}</Badge>
                    </div>
                    {complaint.descricao && <p className="mt-1 text-xs text-muted-foreground">{complaint.descricao}</p>}
                    <p className="mt-1 text-[10px] text-muted-foreground">{fmtDate(complaint.created_at)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Nenhuma ocorrência registrada neste quarto.</p>
            )}
          </section>
        </div>
      </div>
    </Modal>
  );
}

function SummaryChip({ label, value }: { label: string; value: number }) {
  return <span className="rounded-full border border-border bg-background px-2 py-1"><strong className="text-pine-dark">{value}</strong> {label}</span>;
}

function salesForStay(sales: Sale[], reservation: Reservation | null) {
  if (!reservation) return [];
  return sales.filter(
    (sale) =>
      sale.quarto === reservation.quarto &&
      (sale.reserva_id === reservation.id ||
        (sale.reserva_id == null && sale.data >= reservation.checkin && sale.data <= reservation.checkout)),
  );
}

function roomTypeLabel(room: Room) {
  const text = room.configuracao.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if ((text.includes("1c") && text.includes("1s")) || text.includes("casal solteiro")) return "Casal + solteiro";
  if (text.includes("2 solteiro") || text.includes("2s") || text.includes("duplo solteiro")) return "Duplo solteiro";
  if (text.includes("casal")) return "Casal";
  if (text.includes("solteiro")) return "Solteiro";
  if (text.includes("triplo")) return "Triplo";
  return room.configuracao || "Sem configuração";
}

function roomVisualStatus(reservations: Reservation[], sales: Sale[], room: Room, date: string) {
  const base = roomStatusAtDate(reservations, room, date);
  if (["livre", "limpeza", "manutencao"].includes(base)) return base;
  const reservation = reservationForDate(reservations, room.numero, date) ?? activeReservationForRoom(reservations, room.numero);
  if (!reservation) return base;
  const account = buildGuestAccount(reservation, sales);
  const current = reservation.status === "ocupado" || reservation.checkin < date;
  if (current) return account.balance <= 0 && account.total > 0 ? "hospedado_pago" : "hospedado_debito";
  if (account.paid > 0 && account.balance > 0) return "sinal_pago";
  return "reservado";
}

function roomStatusAtDate(reservations: Reservation[], room: Room, date: string) {
  const manual = String(room.situacao ?? "");
  if (date === todayISO()) return roomStatusToday(reservations, room.numero, date, manual);
  const active = reservations.filter(
    (reservation) =>
      reservation.quarto === room.numero &&
      !["cancelado", "finalizado", "manutencao"].includes(reservation.status),
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
        !["cancelado", "finalizado", "manutencao"].includes(reservation.status) &&
        reservation.checkin <= date &&
        reservation.checkout > date,
    ) ?? null
  );
}

function whatsappRoomUrl(reservation: Reservation, phoneValue: string, roomNumber: number) {
  const phone = whatsappPhone(phoneValue);
  if (!phone) return "";
  const balance = Math.max(0, Number(reservation.valor_total) - Number(reservation.valor_pago));
  const message = [
    `Olá, ${reservation.cliente_nome}!`,
    `Sua hospedagem/reserva do quarto ${roomNumber} está registrada de ${fmtDate(reservation.checkin)} a ${fmtDate(reservation.checkout)}.`,
    `Total: ${fmtBRL(reservation.valor_total)}. Pago: ${fmtBRL(reservation.valor_pago)}. Saldo: ${fmtBRL(balance)}.`,
  ].join("\n");
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function whatsappPhone(value?: string | null) {
  const digits = onlyDigits(value);
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
}

function onlyDigits(value?: string | null) {
  return (value ?? "").replace(/\D/g, "");
}
