import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, CircleDollarSign, Plus } from "lucide-react";
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
  const [daysVisible, setDaysVisible] = useState<7 | 14 | 21>(14);
  const today = todayISO();
  const dates = useMemo(
    () => Array.from({ length: daysVisible }, (_, index) => addDaysISO(startDate, index)),
    [daysVisible, startDate],
  );
  const groupedRooms = useMemo(() => {
    const groups = new Map<string, Room[]>();
    rooms.forEach((room) => {
      const key = room.configuracao?.trim() || "Outros quartos";
      groups.set(key, [...(groups.get(key) ?? []), room]);
    });
    return [...groups]
      .map(([name, items]) => ({
        name,
        rooms: items.sort((left, right) => left.numero - right.numero),
      }))
      .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
  }, [rooms]);
  const reservationsByRoom = useMemo(() => {
    const grouped = new Map<number, Reservation[]>();
    reservations.forEach((reservation) => {
      grouped.set(reservation.quarto, [...(grouped.get(reservation.quarto) ?? []), reservation]);
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
                !["cancelado", "finalizado", "manutencao"].includes(reservation.status) &&
                reservation.checkin <= date &&
                reservation.checkout > date,
            ),
          ).length;
          return [date, Math.max(0, rooms.length - occupied)] as const;
        }),
      ),
    [dates, reservationsByRoom, rooms],
  );

  const gridTemplateColumns = `184px repeat(${daysVisible}, minmax(76px, 1fr))`;
  const minimumWidth = 184 + daysVisible * 76;
  const endDate = dates[dates.length - 1] ?? startDate;

  return (
    <section className="overflow-hidden rounded-2xl border border-pine/15 bg-card shadow-[0_18px_60px_rgba(27,71,55,0.10)]">
      <div className="border-b border-white/10 bg-[linear-gradient(135deg,var(--pine-dark),var(--pine))] px-4 py-4 text-white">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-brass">
              <CalendarDays className="h-4 w-4" />
              Agenda de ocupação
            </p>
            <h3 className="mt-1 font-serif text-xl font-bold">
              {fmtDate(startDate)} a {fmtDate(endDate)}
            </h3>
            <p className="mt-1 text-xs text-white/70">
              Clique em uma área vazia para reservar ou em uma hospedagem para abrir o quarto.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl border border-white/15 bg-white/10 p-1">
              <button
                type="button"
                className="rounded-lg p-2 text-white transition hover:bg-white/15"
                onClick={() => onStartDateChange(addDaysISO(startDate, -daysVisible))}
                aria-label="Período anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="rounded-lg px-3 py-2 text-xs font-bold text-white transition hover:bg-white/15"
                onClick={() => onStartDateChange(todayISO())}
              >
                Hoje
              </button>
              <button
                type="button"
                className="rounded-lg p-2 text-white transition hover:bg-white/15"
                onClick={() => onStartDateChange(addDaysISO(startDate, daysVisible))}
                aria-label="Próximo período"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="flex rounded-xl border border-white/15 bg-white/10 p-1 text-xs font-bold">
              {[7, 14, 21].map((days) => (
                <button
                  key={days}
                  type="button"
                  className={`rounded-lg px-3 py-2 transition ${
                    daysVisible === days
                      ? "bg-brass text-pine-dark shadow"
                      : "text-white hover:bg-white/15"
                  }`}
                  onClick={() => setDaysVisible(days as 7 | 14 | 21)}
                >
                  {days} dias
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[11px] font-semibold text-white/85">
          <Legend color="bg-pine-300" label="Hospedado / quitado" />
          <Legend color="bg-sky-400" label="Reserva sem pagamento" />
          <Legend color="bg-amber-400" label="Sinal pago" />
          <Legend color="bg-rose-500" label="Vencida / saldo pendente" />
          <Legend color="bg-slate-400" label="Finalizada" />
        </div>
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: minimumWidth }}>
          <div
            className="sticky top-0 z-30 grid border-b border-border bg-card/95 backdrop-blur"
            style={{ gridTemplateColumns }}
          >
            <div className="sticky left-0 z-40 flex items-center border-r border-border bg-card px-4 py-3">
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                  Unidade
                </span>
                <strong className="text-sm text-pine-dark">{rooms.length} quartos</strong>
              </div>
            </div>
            {dates.map((date) => {
              const current = parseDate(date);
              const isToday = date === today;
              const weekend = [0, 6].includes(current.getDay());
              return (
                <div
                  key={date}
                  className={`border-r border-border/70 px-1 py-2 text-center ${
                    isToday ? "bg-brass-bg" : weekend ? "bg-muted/55" : ""
                  }`}
                >
                  <span className="block text-[9px] font-bold uppercase text-muted-foreground">
                    {current.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}
                  </span>
                  <span
                    className={`mx-auto mt-1 flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${
                      isToday ? "bg-pine text-white shadow" : "text-foreground"
                    }`}
                  >
                    {current.getDate()}
                  </span>
                  <span className="text-[9px] text-muted-foreground">
                    {current.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}
                  </span>
                  <span
                    className={`mt-1 block text-[8px] font-bold ${
                      (availabilityByDate.get(date) ?? 0) === 0 ? "text-brick" : "text-sage"
                    }`}
                  >
                    {availabilityByDate.get(date) ?? 0} livre(s)
                  </span>
                </div>
              );
            })}
          </div>

          {groupedRooms.map((group) => (
            <div key={group.name}>
              <div className="sticky left-0 z-20 flex h-9 items-center border-b border-pine/10 bg-sage-bg px-4">
                <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-pine-dark">
                  {group.name}
                </span>
                <span className="ml-2 rounded-full bg-white/75 px-2 py-0.5 text-[9px] font-bold text-muted-foreground">
                  {group.rooms.length} UH
                </span>
              </div>

              {group.rooms.map((room) => {
                const visibleReservations = (reservationsByRoom.get(room.numero) ?? [])
                  .filter(
                    (reservation) =>
                      reservation.quarto === room.numero &&
                      reservation.status !== "cancelado" &&
                      reservation.checkin < addDaysISO(startDate, daysVisible) &&
                      reservation.checkout > startDate,
                  )
                  .sort((left, right) => left.checkin.localeCompare(right.checkin));

                return (
                  <div
                    key={`${room.company_id}-${room.numero}`}
                    className="relative grid min-h-[58px] border-b border-border/70"
                    style={{ gridTemplateColumns }}
                  >
                    <button
                      type="button"
                      onClick={() => onRoomClick(room)}
                      className="sticky left-0 z-20 flex items-center justify-between border-r border-border bg-card px-4 text-left transition hover:bg-sage-bg"
                    >
                      <div>
                        <span className="block text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                          Quarto
                        </span>
                        <strong className="font-serif text-lg text-pine-dark">{room.numero}</strong>
                      </div>
                      <div className="text-right">
                        <span className="block text-[10px] font-semibold text-muted-foreground">
                          {room.andar}º andar
                        </span>
                        <strong className="text-[10px] text-pine">{fmtBRL(room.preco)}</strong>
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
                          className={`group/cell relative border-r border-border/55 transition hover:bg-sage-bg ${
                            isToday ? "bg-brass-bg/45" : weekend ? "bg-muted/25" : ""
                          }`}
                          style={{ gridColumn: index + 2 }}
                          aria-label={`Reservar quarto ${room.numero} em ${fmtDate(date)}`}
                        >
                          <Plus className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-pine opacity-0 transition group-hover/cell:opacity-50" />
                        </button>
                      );
                    })}

                    {visibleReservations.map((reservation) => {
                      const startIndex = Math.max(0, daysBetween(startDate, reservation.checkin));
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
                          className={`relative z-10 mx-0.5 my-2 flex min-w-0 items-center overflow-hidden border px-3 text-left shadow-sm transition hover:z-20 hover:-translate-y-0.5 hover:brightness-105 hover:shadow-lg ${visual.className}`}
                          style={{
                            gridColumn: `${startIndex + 2} / span ${span}`,
                            gridRow: 1,
                            clipPath:
                              span > 1
                                ? "polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 8px 50%)"
                                : "polygon(0 0, 100% 0, 100% 100%, 0 100%)",
                          }}
                          title={`${reservation.cliente_nome} · ${fmtDate(reservation.checkin)} a ${fmtDate(reservation.checkout)}`}
                        >
                          <span className="min-w-0">
                            <strong className="block truncate text-[11px]">
                              {reservation.cliente_nome}
                            </strong>
                            <span className="flex items-center gap-1 truncate text-[9px] opacity-80">
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
            <div className="p-8 text-center text-sm text-muted-foreground">
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
  if (reservation.pago || (total > 0 && paid >= total) || reservation.status === "ocupado") {
    return {
      className: "border-pine-dark bg-pine text-white",
      label: "Quitado",
    };
  }
  if (paid > 0) {
    return {
      className: "border-brass bg-brass text-pine-dark",
      label: "Sinal pago",
    };
  }
  return {
    className: "border-[var(--chart-5)] bg-[var(--chart-5)] text-white",
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
