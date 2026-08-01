import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Plus,
} from "lucide-react";
import {
  RoomFeatureBadges,
  roomFeatureTags,
} from "@/components/RoomFeatures";
import type { Reservation, Room } from "@/lib/data";
import { fmtBRL, fmtDate, todayISO } from "@/lib/format";

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
  const [daysVisible, setDaysVisible] = useState<7 | 14 | 21>(7);
  const today = todayISO();
  const dates = useMemo(
    () =>
      Array.from({ length: daysVisible }, (_, index) =>
        addDaysISO(startDate, index),
      ),
    [daysVisible, startDate],
  );
  const endDate = dates[dates.length - 1] ?? startDate;

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(
      "[data-room-timeline-root]",
    );
    const toolbar = root?.previousElementSibling;
    const duplicatedDate = toolbar?.querySelector<HTMLInputElement>(
      'input[type="date"]',
    );
    const label = duplicatedDate?.closest("label");
    if (label instanceof HTMLElement) label.hidden = true;
  }, []);

  const groupedRooms = useMemo(() => {
    const groups = new Map<
      string,
      { name: string; floor: number; rooms: Room[] }
    >();

    rooms.forEach((room) => {
      const name = room.configuracao?.trim() || "Outros quartos";
      const key = `${name}|${room.andar}`;
      const current = groups.get(key);
      if (current) {
        current.rooms.push(room);
      } else {
        groups.set(key, { name, floor: room.andar, rooms: [room] });
      }
    });

    return [...groups.values()]
      .map((group) => ({
        ...group,
        rooms: group.rooms.sort((left, right) => left.numero - right.numero),
      }))
      .sort(
        (left, right) =>
          left.floor - right.floor ||
          left.name.localeCompare(right.name, "pt-BR"),
      );
  }, [rooms]);

  const reservationsByRoom = useMemo(() => {
    const grouped = new Map<number, Reservation[]>();
    reservations.forEach((reservation) => {
      grouped.set(reservation.quarto, [
        ...(grouped.get(reservation.quarto) ?? []),
        reservation,
      ]);
    });
    return grouped;
  }, [reservations]);

  const availabilityByDate = useMemo(
    () =>
      new Map(
        dates.map((date) => {
          const occupied = rooms.filter((room) =>
            (reservationsByRoom.get(room.numero) ?? []).some(
              (reservation) =>
                !["cancelado", "finalizado", "manutencao"].includes(
                  reservation.status,
                ) &&
                reservation.checkin <= date &&
                reservation.checkout > date,
            ),
          ).length;
          return [date, Math.max(0, rooms.length - occupied)] as const;
        }),
      ),
    [dates, reservationsByRoom, rooms],
  );

  const roomColumnWidth = 280;
  const dayWidth = 80;
  const rowHeight = 52;
  const gridTemplateColumns = `${roomColumnWidth}px repeat(${daysVisible}, minmax(${dayWidth}px, 1fr))`;
  const minimumWidth = roomColumnWidth + daysVisible * dayWidth;

  return (
    <section
      data-room-timeline-root
      className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
    >
      <div className="border-b border-border bg-card px-3 py-2.5">
        <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground shadow-sm transition hover:brightness-105 focus-within:ring-2 focus-within:ring-primary/35">
              <CalendarDays className="h-4 w-4 shrink-0" />
              <span>
                {fmtDate(startDate)} a {fmtDate(endDate)}
              </span>
              <input
                type="date"
                className="absolute inset-0 cursor-pointer opacity-0"
                value={startDate}
                onChange={(event) => {
                  if (event.target.value) {
                    onStartDateChange(event.target.value);
                  }
                }}
                aria-label="Escolher data para consultar hospedagens"
              />
            </label>
            <span className="max-w-xl text-xs font-medium text-muted-foreground">
              Clique na data azul para consultar uma data atual ou antiga.
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-lg border border-border bg-muted/40 p-1">
              <button
                type="button"
                className="grid min-h-9 min-w-9 place-items-center rounded-md text-pine-dark transition hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() =>
                  onStartDateChange(addDaysISO(startDate, -daysVisible))
                }
                aria-label="Período anterior"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                className="min-h-9 rounded-md px-3 text-sm font-extrabold text-pine-dark transition hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() => onStartDateChange(todayISO())}
              >
                Hoje
              </button>
              <button
                type="button"
                className="grid min-h-9 min-w-9 place-items-center rounded-md text-pine-dark transition hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() =>
                  onStartDateChange(addDaysISO(startDate, daysVisible))
                }
                aria-label="Próximo período"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>

            <div className="flex items-center rounded-lg border border-border bg-muted/40 p-1 font-bold">
              {[7, 14, 21].map((days) => (
                <button
                  key={days}
                  type="button"
                  className={`min-h-9 rounded-md px-3 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    daysVisible === days
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-card"
                  }`}
                  onClick={() => setDaysVisible(days as 7 | 14 | 21)}
                >
                  {days} dias
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] font-semibold text-muted-foreground">
          <Legend color="bg-pine" label="Hospedado / quitado" />
          <Legend color="bg-[var(--chart-5)]" label="Reserva sem pagamento" />
          <Legend color="bg-brass" label="Sinal pago" />
          <Legend color="bg-brick" label="Vencida / saldo pendente" />
          <Legend color="bg-slate" label="Finalizada" />
        </div>
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: minimumWidth }}>
          <div
            className="sticky top-0 z-30 grid border-b border-border bg-card/95 backdrop-blur"
            style={{ gridTemplateColumns }}
          >
            <div className="sticky left-0 z-40 flex items-center border-r border-border bg-card px-3 py-2">
              <div>
                <span className="block text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">
                  Quarto, diária e características
                </span>
                <strong className="text-sm text-pine-dark">
                  {rooms.length} quartos encontrados
                </strong>
              </div>
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
                  className={`border-r border-border/70 px-1 py-2 text-center transition focus-visible:z-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    isToday
                      ? "bg-primary/10"
                      : weekend
                        ? "bg-muted/40"
                        : "bg-card"
                  }`}
                  aria-label={`Consultar ${fmtDate(date)}`}
                >
                  <span className="block text-[10px] font-extrabold uppercase text-muted-foreground">
                    {current
                      .toLocaleDateString("pt-BR", { weekday: "short" })
                      .replace(".", "")}
                  </span>
                  <span
                    className={`mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-black ${
                      isToday
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-pine-dark"
                    }`}
                  >
                    {current.getDate()}
                  </span>
                  <span
                    className={`mt-0.5 block text-[10px] font-bold ${
                      available === 0 ? "text-brick" : "text-primary"
                    }`}
                  >
                    {available} livre(s)
                  </span>
                </button>
              );
            })}
          </div>

          {groupedRooms.map((group) => (
            <div key={`${group.name}-${group.floor}`}>
              <div className="sticky left-0 z-20 flex h-9 items-center border-b border-primary/15 bg-primary/10 px-3">
                <span className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-pine-dark">
                  {group.name} · {group.floor}º andar
                </span>
                <span className="ml-2 rounded-full border border-primary/15 bg-card px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                  {group.rooms.length} UH
                </span>
              </div>

              {group.rooms.map((room) => {
                const visibleReservations = (
                  reservationsByRoom.get(room.numero) ?? []
                )
                  .filter(
                    (reservation) =>
                      reservation.status !== "cancelado" &&
                      reservation.checkin <
                        addDaysISO(startDate, daysVisible) &&
                      reservation.checkout > startDate,
                  )
                  .sort((left, right) =>
                    left.checkin.localeCompare(right.checkin),
                  );
                const featureTitle = roomFeatureTags(room)
                  .map((item) => item.label)
                  .join(" · ");

                return (
                  <div
                    key={`${room.company_id}-${room.numero}`}
                    className="relative grid border-b border-border/75"
                    style={{ gridTemplateColumns, height: rowHeight }}
                  >
                    <button
                      type="button"
                      onClick={() => onRoomClick(room)}
                      className="sticky left-0 z-20 flex items-center border-r border-border bg-card px-3 py-1.5 text-left text-pine-dark transition hover:bg-primary/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                      title={
                        featureTitle || "Características ainda não cadastradas"
                      }
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <strong className="text-base font-black">
                            {room.numero}
                          </strong>
                          <span className="shrink-0 rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-extrabold text-primary">
                            {fmtBRL(room.preco)}
                          </span>
                        </div>
                        <div className="mt-0.5 max-h-4 overflow-hidden">
                          <RoomFeatureBadges room={room} compact max={3} />
                        </div>
                      </div>
                    </button>

                    {dates.map((date, index) => {
                      const weekend = [0, 6].includes(
                        parseDate(date).getDay(),
                      );
                      const isToday = date === today;

                      return (
                        <button
                          key={date}
                          type="button"
                          onClick={() => onCreateReservation(room, date)}
                          className={`group/cell relative border-r border-border/60 transition hover:bg-primary/[0.08] focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                            isToday
                              ? "bg-primary/[0.06]"
                              : weekend
                                ? "bg-muted/20"
                                : "bg-card"
                          }`}
                          style={{ gridColumn: index + 2 }}
                          aria-label={`Reservar quarto ${room.numero} em ${fmtDate(
                            date,
                          )}`}
                        >
                          <Plus className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 text-primary opacity-0 transition group-hover/cell:opacity-55 group-focus-visible/cell:opacity-80" />
                        </button>
                      );
                    })}

                    {visibleReservations.map((reservation) => {
                      const startIndex = Math.max(
                        0,
                        daysBetween(startDate, reservation.checkin),
                      );
                      const endIndex = Math.min(
                        daysVisible,
                        daysBetween(startDate, reservation.checkout),
                      );
                      const span = Math.max(1, endIndex - startIndex);
                      const visual = reservationVisual(reservation, today);

                      return (
                        <button
                          key={reservation.id}
                          type="button"
                          onClick={() => onRoomClick(room)}
                          className={`relative z-10 mx-1 my-1 flex min-w-0 items-center overflow-hidden rounded-md border px-2 text-left shadow-sm transition hover:z-20 hover:brightness-105 hover:shadow-md focus-visible:z-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${visual.className}`}
                          style={{
                            gridColumn: `${startIndex + 2} / span ${span}`,
                            gridRow: 1,
                          }}
                          title={`${reservation.cliente_nome} · ${fmtDate(
                            reservation.checkin,
                          )} a ${fmtDate(reservation.checkout)}`}
                        >
                          <span className="min-w-0">
                            <strong className="block truncate text-[11px] font-black">
                              {reservation.cliente_nome}
                            </strong>
                            <span className="flex items-center gap-1 truncate text-[9px] font-bold opacity-95">
                              <CircleDollarSign className="h-3 w-3 shrink-0" />
                              {visual.label} · {fmtBRL(reservation.valor_total)}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}

          {rooms.length === 0 && (
            <div className="p-10 text-center text-sm font-semibold text-muted-foreground">
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
    <span className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function reservationVisual(reservation: Reservation, today: string) {
  const total = Number(reservation.valor_total);
  const paid = Number(reservation.valor_pago);
  const overdue =
    !reservation.pago &&
    reservation.checkout < today &&
    !["finalizado", "cancelado"].includes(reservation.status);

  if (overdue) {
    return {
      className: "border-brick bg-brick text-white",
      label: "Saldo vencido",
    };
  }
  if (reservation.status === "finalizado") {
    return {
      className: "border-border bg-muted text-muted-foreground",
      label: "Finalizada",
    };
  }
  if (
    reservation.pago ||
    (total > 0 && paid >= total) ||
    reservation.status === "ocupado"
  ) {
    return {
      className: "border-pine-dark bg-pine text-white",
      label: "Quitado",
    };
  }
  if (paid > 0) {
    return {
      className: "border-brass bg-brass text-white",
      label: "Sinal pago",
    };
  }
  return {
    className:
      "border-[var(--chart-5)] bg-[var(--chart-5)] text-white",
    label: "A receber",
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
