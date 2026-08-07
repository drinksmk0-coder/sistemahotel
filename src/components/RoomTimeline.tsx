import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  LogOut,
  Plus,
  Undo2,
} from "lucide-react";
import { useUpdate, type Reservation, type Room } from "@/lib/data";
import { RoomFeatureBadges, roomFeatureTags } from "@/components/RoomFeatures";
import { fmtBRL, fmtDate, todayISO } from "@/lib/format";

type TimelineRange = 7 | 14 | 30 | 60;

type ReservationVisual = {
  className: string;
  label: string;
};

export function RoomTimeline({
  rooms,
  reservations,
  startDate,
  onStartDateChange,
  onRoomClick,
  onCreateReservation,
}: {
  rooms: Room[];
  reservations: Reservation[];
  startDate: string;
  onStartDateChange: (date: string) => void;
  onRoomClick: (room: Room) => void;
  onCreateReservation: (room: Room, date: string) => void;
}) {
  const [daysVisible, setDaysVisible] = useState<TimelineRange>(30);
  const updateRoomSituation = useUpdate("rooms", ["rooms"]);
  const today = todayISO();
  const dates = useMemo(
    () => Array.from({ length: daysVisible }, (_, index) => addDaysISO(startDate, index)),
    [daysVisible, startDate],
  );
  const endDate = dates[dates.length - 1] ?? startDate;

  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-room-timeline-root]");
    const toolbar = root?.previousElementSibling;
    const duplicatedDate = toolbar?.querySelector<HTMLInputElement>('input[type="date"]');
    const label = duplicatedDate?.closest("label");
    if (label instanceof HTMLElement) label.hidden = true;

    // Mantém a navegação com nomes simples para a equipe do hotel.
    toolbar?.querySelectorAll("button").forEach((button) => {
      const text = button.textContent?.trim();
      const last = button.lastChild;
      if (text === "Linha do tempo" && last?.nodeType === Node.TEXT_NODE) {
        last.textContent = " Mapa";
      }
      if (text === "Cards" && last?.nodeType === Node.TEXT_NODE) {
        last.textContent = " Quartos";
      }
    });
  }, []);

  const groupedRooms = useMemo(() => {
    const groups = new Map<string, { name: string; floor: number; rooms: Room[] }>();
    rooms.forEach((room) => {
      const name = room.configuracao?.trim() || "Outros quartos";
      const key = `${name}|${room.andar}`;
      const current = groups.get(key);
      if (current) current.rooms.push(room);
      else groups.set(key, { name, floor: room.andar, rooms: [room] });
    });
    return [...groups.values()]
      .map((group) => ({
        ...group,
        rooms: [...group.rooms].sort((a, b) => a.numero - b.numero),
      }))
      .sort((a, b) => a.floor - b.floor || a.name.localeCompare(b.name, "pt-BR"));
  }, [rooms]);

  const reservationsByRoom = useMemo(() => {
    const grouped = new Map<number, Reservation[]>();
    reservations.forEach((reservation) => {
      grouped.set(reservation.quarto, [...(grouped.get(reservation.quarto) ?? []), reservation]);
    });
    return grouped;
  }, [reservations]);

  // IMPORTANTE: a regra operacional do sistema bloqueia também a data do checkout.
  // O mapa precisa representar exatamente a mesma regra para não mostrar falsa disponibilidade.
  const availabilityByDate = useMemo(
    () =>
      new Map(
        dates.map((date) => {
          const occupied = rooms.filter((room) =>
            (reservationsByRoom.get(room.numero) ?? []).some(
              (reservation) =>
                !["cancelado", "finalizado", "manutencao"].includes(reservation.status) &&
                reservation.checkin <= date &&
                reservation.checkout >= date,
            ),
          ).length;
          return [date, Math.max(0, rooms.length - occupied)] as const;
        }),
      ),
    [dates, reservationsByRoom, rooms],
  );

  const roomColumnWidth = 260;
  const dayWidth = daysVisible >= 60 ? 56 : daysVisible >= 30 ? 64 : 80;
  const rowHeight = 46;
  const gridTemplateColumns = `${roomColumnWidth}px repeat(${daysVisible}, minmax(${dayWidth}px, 1fr))`;
  const minimumWidth = roomColumnWidth + daysVisible * dayWidth;

  return (
    <section
      data-room-timeline-root
      className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
    >
      <div className="border-b border-border bg-card px-2.5 py-2">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div>
              <h2 className="text-sm font-extrabold text-pine-dark">Mapa de ocupação</h2>
              <p className="text-[10px] text-muted-foreground">
                Cada reserva ocupa visualmente todo o período bloqueado, inclusive a data de saída.
              </p>
            </div>
            <label className="relative inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground shadow-sm">
              <CalendarDays className="h-3.5 w-3.5 shrink-0" />
              <span>{fmtDate(startDate)} a {fmtDate(endDate)}</span>
              <input
                type="date"
                className="absolute inset-0 cursor-pointer opacity-0"
                value={startDate}
                onChange={(event) => event.target.value && onStartDateChange(event.target.value)}
                aria-label="Escolher data para consultar hospedagens"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5">
              <button
                type="button"
                className="grid min-h-7 min-w-7 place-items-center rounded-md text-pine-dark transition hover:bg-card"
                onClick={() => onStartDateChange(addDaysISO(startDate, -daysVisible))}
                aria-label="Período anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="min-h-7 rounded-md px-2 text-xs font-extrabold text-pine-dark transition hover:bg-card"
                onClick={() => onStartDateChange(todayISO())}
              >
                Hoje
              </button>
              <button
                type="button"
                className="grid min-h-7 min-w-7 place-items-center rounded-md text-pine-dark transition hover:bg-card"
                onClick={() => onStartDateChange(addDaysISO(startDate, daysVisible))}
                aria-label="Próximo período"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5 font-bold">
              {([7, 14, 30, 60] as TimelineRange[]).map((days) => (
                <button
                  key={days}
                  type="button"
                  className={`min-h-7 rounded-md px-2 text-[11px] transition ${
                    daysVisible === days
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-card"
                  }`}
                  onClick={() => setDaysVisible(days)}
                >
                  {days} dias
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] font-semibold text-muted-foreground">
          <Legend color="bg-emerald-600" label="Hospedado · quitado" />
          <Legend color="bg-brick" label="Hospedado · com débito" />
          <Legend color="bg-[var(--chart-5)]" label="Reserva · aguardando check-in" />
          <Legend color="bg-indigo-600" label="Saiu e retorna" />
          <Legend color="bg-slate" label="Finalizada" />
        </div>
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: minimumWidth }}>
          <div
            className="sticky top-0 z-30 grid border-b border-border bg-card/95 backdrop-blur"
            style={{ gridTemplateColumns }}
          >
            <div className="sticky left-0 z-40 flex items-center border-r border-border bg-card px-2 py-1">
              <strong className="text-xs text-pine-dark">{rooms.length} quartos</strong>
            </div>
            {dates.map((date) => {
              const current = parseDate(date);
              const isToday = date === today;
              const weekend = [0, 6].includes(current.getDay());
              const available = availabilityByDate.get(date) ?? 0;
              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => onStartDateChange(date)}
                  className={`border-r border-border/70 px-1 py-1 text-center transition ${
                    isToday ? "bg-primary/10" : weekend ? "bg-muted/35" : "bg-card"
                  }`}
                  aria-label={`Consultar ${fmtDate(date)}`}
                >
                  <span className="block text-[9px] font-extrabold uppercase text-muted-foreground">
                    {current.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}
                  </span>
                  <span
                    className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full text-xs font-black ${
                      isToday ? "bg-primary text-primary-foreground shadow-sm" : "text-pine-dark"
                    }`}
                  >
                    {current.getDate()}
                  </span>
                  <span className={`block text-[9px] font-bold ${available === 0 ? "text-brick" : "text-primary"}`}>
                    {available} livre(s)
                  </span>
                </button>
              );
            })}
          </div>

          {groupedRooms.map((group) => (
            <div key={`${group.name}-${group.floor}`}>
              <div className="sticky left-0 z-20 flex h-7 items-center border-b border-primary/15 bg-primary/10 px-2.5">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.07em] text-pine-dark">
                  {group.name} · {group.floor}º andar
                </span>
                <span className="ml-2 rounded-full border border-primary/15 bg-card px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">
                  {group.rooms.length} UH
                </span>
              </div>

              {group.rooms.map((room) => {
                const visibleReservations = (reservationsByRoom.get(room.numero) ?? [])
                  .filter(
                    (reservation) =>
                      reservation.status !== "cancelado" &&
                      reservation.checkin <= addDaysISO(startDate, daysVisible - 1) &&
                      reservation.checkout >= startDate,
                  )
                  .sort((a, b) => a.checkin.localeCompare(b.checkin));
                const featureTitle = roomFeatureTags(room).map((item) => item.label).join(" · ");

                return (
                  <div
                    key={`${room.company_id}-${room.numero}`}
                    className="relative grid border-b border-border/75"
                    style={{ gridTemplateColumns, height: rowHeight }}
                  >
                    <button
                      type="button"
                      onClick={() => onRoomClick(room)}
                      className="sticky left-0 z-20 flex items-center border-r border-border bg-card px-2.5 py-1 text-left text-pine-dark transition hover:bg-primary/[0.05]"
                      title={featureTitle || "Características ainda não cadastradas"}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <strong className="text-sm font-black">{room.numero}</strong>
                          <span className="shrink-0 rounded-md border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[9px] font-extrabold text-primary">
                            {fmtBRL(room.preco)}
                          </span>
                        </div>
                        <div className="max-h-4 overflow-hidden">
                          <RoomFeatureBadges room={room} compact max={3} />
                        </div>
                      </div>
                    </button>

                    {dates.map((date, index) => {
                      const weekend = [0, 6].includes(parseDate(date).getDay());
                      const isToday = date === today;
                      return (
                        <button
                          key={date}
                          type="button"
                          onClick={() => onCreateReservation(room, date)}
                          className={`group/cell relative border-r border-border/60 transition hover:bg-primary/[0.08] ${
                            isToday ? "bg-primary/[0.06]" : weekend ? "bg-muted/20" : "bg-card"
                          }`}
                          style={{ gridColumn: index + 2 }}
                          aria-label={`Reservar quarto ${room.numero} em ${fmtDate(date)}`}
                        >
                          <Plus className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-primary opacity-0 transition group-hover/cell:opacity-55" />
                        </button>
                      );
                    })}

                    {visibleReservations.map((reservation) => {
                      const startIndex = Math.max(0, daysBetween(startDate, reservation.checkin));
                      // checkout é inclusivo na regra de conflito; +1 faz a barra ocupar também a coluna da saída.
                      const endExclusive = Math.min(
                        daysVisible,
                        daysBetween(startDate, reservation.checkout) + 1,
                      );
                      const span = Math.max(1, endExclusive - startIndex);
                      const checkedIn = reservationIsCheckedIn(reservation);
                      const temporarilyAway = checkedIn && room.situacao === "ausente_temporario";
                      const visual = reservationVisual(reservation, today, temporarilyAway);

                      return (
                        <div
                          key={reservation.id}
                          className={`relative z-10 mx-1 my-1 flex min-w-0 overflow-hidden rounded-md border shadow-sm transition hover:z-20 hover:brightness-105 hover:shadow-md ${visual.className}`}
                          style={{
                            gridColumn: `${startIndex + 2} / span ${span}`,
                            gridRow: 1,
                          }}
                          title={`${reservation.cliente_nome} · ${fmtDate(reservation.checkin)} a ${fmtDate(reservation.checkout)} · ${visual.label}`}
                        >
                          <button
                            type="button"
                            onClick={() => onRoomClick(room)}
                            className="flex min-w-0 flex-1 items-center px-2 text-left"
                          >
                            <span className="min-w-0">
                              <strong className="block truncate text-[10px] font-black">
                                {reservation.cliente_nome}
                              </strong>
                              <span className="flex items-center gap-1 truncate text-[8px] font-bold opacity-95">
                                <CircleDollarSign className="h-2.5 w-2.5 shrink-0" />
                                {visual.label}
                              </span>
                            </span>
                          </button>

                          {checkedIn && (
                            <button
                              type="button"
                              disabled={updateRoomSituation.isPending}
                              onClick={() =>
                                updateRoomSituation.mutate({
                                  id: room.numero,
                                  patch: { situacao: temporarilyAway ? null : "ausente_temporario" },
                                })
                              }
                              className="flex min-w-8 shrink-0 items-center justify-center border-l border-white/25 bg-black/5 px-1.5 transition hover:bg-black/10 disabled:cursor-wait disabled:opacity-60"
                              aria-label={
                                temporarilyAway
                                  ? `Marcar hóspede do quarto ${room.numero} como retornado`
                                  : `Marcar hóspede do quarto ${room.numero} como saída temporária`
                              }
                              title={temporarilyAway ? "Hóspede voltou" : "Hóspede saiu e vai voltar"}
                            >
                              {temporarilyAway ? <Undo2 className="h-3.5 w-3.5" /> : <LogOut className="h-3.5 w-3.5" />}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}

          {rooms.length === 0 && (
            <div className="p-8 text-center text-sm font-semibold text-muted-foreground">
              Nenhum quarto corresponde aos filtros selecionados.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function reservationIsCheckedIn(reservation: Reservation) {
  return reservation.status === "ocupado" || Boolean(reservation.checkin_at);
}

function reservationVisual(
  reservation: Reservation,
  today: string,
  temporarilyAway: boolean,
): ReservationVisual {
  const total = Math.max(0, Number(reservation.valor_total) || 0);
  const paid = Math.max(0, Number(reservation.valor_pago) || 0);
  const balance = Math.max(0, total - paid);
  const overdue =
    balance > 0 &&
    reservation.checkout < today &&
    !["finalizado", "cancelado"].includes(reservation.status);

  if (overdue) {
    return {
      className: "border-brick bg-brick text-white",
      label: `Débito vencido · ${fmtBRL(balance)}`,
    };
  }

  if (reservation.status === "finalizado") {
    return {
      className: "border-slate/60 bg-slate text-white",
      label: "Finalizada",
    };
  }

  if (reservationIsCheckedIn(reservation)) {
    if (temporarilyAway) {
      return {
        className: "border-indigo-700 bg-indigo-600 text-white",
        label: "Saiu e retorna",
      };
    }

    if (balance > 0) {
      return {
        className: "border-brick bg-brick text-white",
        label: `Hospedado · débito ${fmtBRL(balance)}`,
      };
    }

    return {
      className: "border-emerald-700 bg-emerald-600 text-white",
      label: "Hospedado · quitado",
    };
  }

  const paymentLabel =
    total > 0 && paid >= total
      ? "quitada"
      : paid > 0
        ? "sinal pago"
        : "sem pagamento";

  return {
    className: "border-[var(--chart-5)] bg-[var(--chart-5)] text-white",
    label: `Reserva · ${paymentLabel}`,
  };
}

function parseDate(date: string) {
  return new Date(`${date}T12:00:00`);
}

function addDaysISO(date: string, days: number) {
  const value = parseDate(date);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string) {
  const diff = parseDate(end).getTime() - parseDate(start).getTime();
  return Math.round(diff / 86_400_000);
}
