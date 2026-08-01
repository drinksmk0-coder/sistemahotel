import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Eye,
  Plus,
} from "lucide-react";
import {
  RoomFeatureBadges,
  roomFeatureTags,
} from "@/components/RoomFeatures";
import type { Reservation, Room } from "@/lib/data";
import { fmtBRL, fmtDate, todayISO } from "@/lib/format";

const LARGE_TEXT_STORAGE_KEY = "hotel:room-map-large-text";

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
  const [largeText, setLargeText] = useState(false);
  const today = todayISO();

  useEffect(() => {
    setLargeText(window.localStorage.getItem(LARGE_TEXT_STORAGE_KEY) === "1");
  }, []);

  function toggleLargeText() {
    setLargeText((current) => {
      const next = !current;
      window.localStorage.setItem(LARGE_TEXT_STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  const dates = useMemo(
    () =>
      Array.from({ length: daysVisible }, (_, index) =>
        addDaysISO(startDate, index),
      ),
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

  const roomColumnWidth = largeText ? 310 : 265;
  const dayColumnWidth = largeText ? 92 : 82;
  const gridTemplateColumns = `${roomColumnWidth}px repeat(${daysVisible}, minmax(${dayColumnWidth}px, 1fr))`;
  const minimumWidth = roomColumnWidth + daysVisible * dayColumnWidth;
  const endDate = dates[dates.length - 1] ?? startDate;

  return (
    <section className="overflow-hidden rounded-xl border-2 border-border bg-card shadow-md">
      <div className="border-b border-border bg-card px-3 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <CalendarDays className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <strong
                className={`block truncate font-extrabold text-pine-dark ${
                  largeText ? "text-lg" : "text-base"
                }`}
              >
                {fmtDate(startDate)} a {fmtDate(endDate)}
              </strong>
              <span
                className={`font-medium text-muted-foreground ${
                  largeText ? "text-sm" : "text-xs"
                }`}
              >
                Clique em um espaço livre para reservar. Clique na UH para abrir
                os detalhes.
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={`inline-flex min-h-10 items-center gap-2 rounded-lg border-2 px-3 font-extrabold transition ${
                largeText
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-pine-dark hover:bg-muted"
              }`}
              onClick={toggleLargeText}
              aria-pressed={largeText}
            >
              <Eye className="h-5 w-5" />
              Letras grandes
            </button>

            <div className="flex items-center rounded-lg border border-border bg-muted/30 p-1">
              <button
                type="button"
                className="grid h-9 w-9 place-items-center rounded-md text-pine-dark transition hover:bg-card"
                onClick={() =>
                  onStartDateChange(addDaysISO(startDate, -daysVisible))
                }
                aria-label="Período anterior"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                className="min-h-9 rounded-md px-3 text-sm font-extrabold text-pine-dark transition hover:bg-card"
                onClick={() => onStartDateChange(todayISO())}
              >
                Hoje
              </button>
              <button
                type="button"
                className="grid h-9 w-9 place-items-center rounded-md text-pine-dark transition hover:bg-card"
                onClick={() =>
                  onStartDateChange(addDaysISO(startDate, daysVisible))
                }
                aria-label="Próximo período"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>

            <div className="flex items-center rounded-lg border border-border bg-muted/30 p-1 font-bold">
              {[7, 14, 21].map((days) => (
                <button
                  key={days}
                  type="button"
                  className={`min-h-9 rounded-md px-3 text-sm transition ${
                    daysVisible === days
                      ? "bg-primary text-primary-foreground shadow"
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

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs font-bold text-foreground">
          <Legend color="bg-pine" label="Hospedado / quitado" />
          <Legend color="bg-sky-500" label="Reserva sem pagamento" />
          <Legend color="bg-amber-400" label="Sinal pago" />
          <Legend color="bg-rose-600" label="Vencida / saldo pendente" />
          <Legend color="bg-slate-400" label="Finalizada" />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Cores das tarifas">
          <span className="text-xs font-extrabold text-pine-dark">Tarifas:</span>
          <TariffLegend price={110} />
          <TariffLegend price={90} />
          <TariffLegend price={80} />
        </div>
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: minimumWidth }}>
          <div
            className="sticky top-0 z-30 grid border-b-2 border-border bg-card/95 backdrop-blur"
            style={{ gridTemplateColumns }}
          >
            <div className="sticky left-0 z-40 flex items-center border-r-2 border-border bg-card px-3 py-3">
              <div>
                <span
                  className={`block font-extrabold uppercase tracking-wide text-muted-foreground ${
                    largeText ? "text-sm" : "text-xs"
                  }`}
                >
                  Quarto e diária
                </span>
                <strong
                  className={`text-pine-dark ${
                    largeText ? "text-lg" : "text-base"
                  }`}
                >
                  {rooms.length} quartos
                </strong>
              </div>
            </div>

            {dates.map((date) => {
              const current = parseDate(date);
              const isToday = date === today;
              const weekend = [0, 6].includes(current.getDay());
              const available = availabilityByDate.get(date) ?? 0;
              return (
                <div
                  key={date}
                  className={`border-r border-border px-1 py-2 text-center ${
                    isToday ? "bg-brass-bg" : weekend ? "bg-muted/60" : ""
                  }`}
                >
                  <span
                    className={`block font-extrabold uppercase text-muted-foreground ${
                      largeText ? "text-sm" : "text-xs"
                    }`}
                  >
                    {current
                      .toLocaleDateString("pt-BR", { weekday: "short" })
                      .replace(".", "")}
                  </span>
                  <span
                    className={`mx-auto mt-1 flex items-center justify-center rounded-full font-black ${
                      largeText ? "h-9 w-9 text-lg" : "h-8 w-8 text-base"
                    } ${
                      isToday
                        ? "bg-pine text-white shadow"
                        : "bg-card text-foreground"
                    }`}
                  >
                    {current.getDate()}
                  </span>
                  <span
                    className={`mt-1 block font-extrabold ${
                      largeText ? "text-sm" : "text-xs"
                    } ${available === 0 ? "text-brick" : "text-sage"}`}
                  >
                    {available} livre(s)
                  </span>
                </div>
              );
            })}
          </div>

          {groupedRooms.map((group) => (
            <div key={group.name}>
              <div
                className={`sticky left-0 z-20 flex items-center border-b border-pine/20 bg-sage-bg px-3 ${
                  largeText ? "h-11" : "h-9"
                }`}
              >
                <span
                  className={`font-black uppercase tracking-wide text-pine-dark ${
                    largeText ? "text-sm" : "text-xs"
                  }`}
                >
                  {group.name}
                </span>
                <span className="ml-2 rounded-full bg-white px-2.5 py-1 text-xs font-extrabold text-pine-dark shadow-sm">
                  {group.rooms.length} UH
                </span>
              </div>

              {group.rooms.map((room) => {
                const visibleReservations = (
                  reservationsByRoom.get(room.numero) ?? []
                )
                  .filter(
                    (reservation) =>
                      reservation.quarto === room.numero &&
                      reservation.status !== "cancelado" &&
                      reservation.checkin <
                        addDaysISO(startDate, daysVisible) &&
                      reservation.checkout > startDate,
                  )
                  .sort((left, right) =>
                    left.checkin.localeCompare(right.checkin),
                  );
                const featureTitle = roomFeatureTags(room)
                  .map((tag) => tag.label)
                  .join(" · ");
                const tariff = tariffStyle(Number(room.preco));

                return (
                  <div
                    key={`${room.company_id}-${room.numero}`}
                    className={`relative grid border-b border-border ${
                      largeText ? "min-h-[88px]" : "min-h-[72px]"
                    }`}
                    style={{ gridTemplateColumns }}
                  >
                    <button
                      type="button"
                      onClick={() => onRoomClick(room)}
                      className="sticky left-0 z-20 flex items-center justify-between gap-3 border-r-2 border-border bg-card px-3 text-left transition hover:bg-sage-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                      title={
                        featureTitle || "Características ainda não cadastradas"
                      }
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="sr-only">Quarto</span>
                          <strong
                            className={`leading-none text-pine-dark ${
                              largeText ? "text-3xl" : "text-2xl"
                            }`}
                          >
                            {room.numero}
                          </strong>
                          <span
                            className={`font-bold text-muted-foreground ${
                              largeText ? "text-sm" : "text-xs"
                            }`}
                          >
                            {room.andar}º andar
                          </span>
                        </div>
                        <div className="mt-2">
                          <RoomFeatureBadges room={room} compact max={2} />
                        </div>
                      </div>

                      <span
                        className={`shrink-0 rounded-xl border-2 px-3 py-2 text-center font-black shadow-sm ${
                          largeText ? "text-lg" : "text-base"
                        } ${tariff.className}`}
                        aria-label={`Diária ${fmtBRL(room.preco)}`}
                      >
                        {fmtBRL(room.preco)}
                      </span>
                    </button>

                    {dates.map((date, index) => {
                      const weekend = [0, 6].includes(parseDate(date).getDay());
                      const isToday = date === today;
                      return (
                        <button
                          key={date}
                          type="button"
                          onClick={() => onCreateReservation(room, date)}
                          className={`group/cell relative border-r border-border/70 transition hover:bg-sage-bg focus-visible:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${
                            isToday
                              ? "bg-brass-bg/50"
                              : weekend
                                ? "bg-muted/30"
                                : ""
                          }`}
                          style={{ gridColumn: index + 2 }}
                          aria-label={`Reservar quarto ${room.numero} em ${fmtDate(date)}`}
                        >
                          <Plus className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 text-pine opacity-0 transition group-hover/cell:opacity-70 group-focus-visible/cell:opacity-100" />
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
                          className={`relative z-10 mx-1 my-2 flex min-w-0 items-center overflow-hidden rounded-lg border-2 px-3 text-left shadow-md transition hover:z-20 hover:brightness-105 hover:shadow-xl focus-visible:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${visual.className}`}
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
                            <strong
                              className={`block truncate font-black ${
                                largeText ? "text-base" : "text-sm"
                              }`}
                            >
                              {reservation.cliente_nome}
                            </strong>
                            <span
                              className={`mt-1 flex items-center gap-1 truncate font-bold opacity-95 ${
                                largeText ? "text-sm" : "text-xs"
                              }`}
                            >
                              <CircleDollarSign className="h-4 w-4 shrink-0" />
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
            <div className="p-10 text-center text-base font-semibold text-muted-foreground">
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
    <span className="flex items-center gap-2">
      <span className={`h-3.5 w-3.5 rounded-full border border-black/10 ${color}`} />
      {label}
    </span>
  );
}

function TariffLegend({ price }: { price: number }) {
  const style = tariffStyle(price);
  return (
    <span
      className={`rounded-lg border-2 px-2.5 py-1 text-xs font-black shadow-sm ${style.className}`}
    >
      R$ {price}
    </span>
  );
}

function tariffStyle(price: number) {
  if (price === 110) {
    return {
      className: "border-orange-600 bg-orange-500 text-white",
    };
  }
  if (price === 90) {
    return {
      className: "border-blue-700 bg-blue-600 text-white",
    };
  }
  if (price === 80) {
    return {
      className: "border-slate-400 bg-white text-slate-950",
    };
  }
  return {
    className: "border-zinc-500 bg-zinc-100 text-zinc-950",
  };
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
      className: "border-rose-800 bg-rose-600 text-white",
      label: "Saldo vencido",
    };
  }
  if (reservation.status === "finalizado") {
    return {
      className: "border-slate-500 bg-slate-300 text-slate-950",
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
      className: "border-amber-700 bg-amber-400 text-slate-950",
      label: "Sinal pago",
    };
  }
  return {
    className: "border-sky-700 bg-sky-500 text-white",
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
