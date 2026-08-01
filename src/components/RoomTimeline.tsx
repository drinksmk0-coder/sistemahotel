import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Plus,
  Type,
} from "lucide-react";
import { RoomFeatureBadges, roomFeatureTags } from "@/components/RoomFeatures";
import type { Reservation, Room } from "@/lib/data";
import { fmtBRL, fmtDate, todayISO } from "@/lib/format";

const LARGE_TEXT_KEY = "hotel:room-map:large-text";

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
  const [largeText, setLargeText] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(LARGE_TEXT_KEY) === "1";
  });
  const today = todayISO();
  const dates = useMemo(
    () => Array.from({ length: daysVisible }, (_, index) => addDaysISO(startDate, index)),
    [daysVisible, startDate],
  );
  const endDate = dates[dates.length - 1] ?? startDate;

  useEffect(() => {
    window.localStorage.setItem(LARGE_TEXT_KEY, largeText ? "1" : "0");
  }, [largeText]);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-room-timeline-root]");
    const toolbar = root?.previousElementSibling;
    const duplicatedDate = toolbar?.querySelector<HTMLInputElement>('input[type="date"]');
    const label = duplicatedDate?.closest("label");
    if (label instanceof HTMLElement) label.hidden = true;
  }, []);

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

  const roomColumnWidth = largeText ? 300 : 260;
  const dayWidth = largeText ? 92 : 78;
  const rowHeight = largeText ? 82 : 66;
  const gridTemplateColumns = `${roomColumnWidth}px repeat(${daysVisible}, minmax(${dayWidth}px, 1fr))`;
  const minimumWidth = roomColumnWidth + daysVisible * dayWidth;

  return (
    <section
      data-room-timeline-root
      className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
    >
      <div className="border-b border-border bg-card px-3 py-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-primary px-3 py-2 font-bold text-primary-foreground shadow-sm hover:brightness-105 focus-within:ring-2 focus-within:ring-primary/40">
              <CalendarDays className="h-5 w-5 shrink-0" />
              <span className={largeText ? "text-base" : "text-sm"}>
                {fmtDate(startDate)} a {fmtDate(endDate)}
              </span>
              <input
                type="date"
                className="absolute inset-0 cursor-pointer opacity-0"
                value={startDate}
                onChange={(event) => {
                  if (event.target.value) onStartDateChange(event.target.value);
                }}
                aria-label="Escolher data para consultar hospedagens"
              />
            </label>
            <span className="max-w-xl text-xs font-medium text-muted-foreground">
              Clique na data azul para abrir o calendário, digitar uma data antiga ou consultar quem se hospedou naquele período.
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-lg border border-border bg-muted/35 p-1">
              <button
                type="button"
                className="grid min-h-10 min-w-10 place-items-center rounded-md text-pine-dark hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() => onStartDateChange(addDaysISO(startDate, -daysVisible))}
                aria-label="Período anterior"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                className="min-h-10 rounded-md px-3 text-sm font-extrabold text-pine-dark hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() => onStartDateChange(todayISO())}
              >
                Hoje
              </button>
              <button
                type="button"
                className="grid min-h-10 min-w-10 place-items-center rounded-md text-pine-dark hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() => onStartDateChange(addDaysISO(startDate, daysVisible))}
                aria-label="Próximo período"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>

            <div className="flex items-center rounded-lg border border-border bg-muted/35 p-1 font-bold">
              {[7, 14, 21].map((days) => (
                <button
                  key={days}
                  type="button"
                  className={`min-h-10 rounded-md px-3 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
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

            <button
              type="button"
              className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-extrabold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                largeText
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-pine-dark hover:bg-muted"
              }`}
              onClick={() => setLargeText((current) => !current)}
              aria-pressed={largeText}
            >
              <Type className="h-5 w-5" /> Letras grandes
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-bold text-slate-700">
          <Legend color="bg-pine" label="Hospedado / quitado" />
          <Legend color="bg-sky-500" label="Reserva sem pagamento" />
          <Legend color="bg-amber-400" label="Sinal pago" />
          <Legend color="bg-rose-500" label="Vencida / saldo pendente" />
          <Legend color="bg-slate-400" label="Finalizada" />
          <span className="mx-1 hidden h-5 w-px bg-border md:block" />
          <PriceLegend price={110} />
          <PriceLegend price={90} />
          <PriceLegend price={80} />
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
                <span className="block text-xs font-extrabold uppercase tracking-[0.12em] text-slate-600">
                  Quarto e diária
                </span>
                <strong className={largeText ? "text-base text-pine-dark" : "text-sm text-pine-dark"}>
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
                  className={`border-r border-border/70 px-1 py-2 text-center focus-visible:z-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    isToday ? "bg-amber-100" : weekend ? "bg-slate-100" : "bg-card"
                  }`}
                  aria-label={`Consultar ${fmtDate(date)}`}
                >
                  <span className="block text-[11px] font-extrabold uppercase text-slate-600">
                    {current.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}
                  </span>
                  <span
                    className={`mx-auto mt-0.5 flex items-center justify-center rounded-full font-black ${
                      largeText ? "h-8 w-8 text-base" : "h-7 w-7 text-sm"
                    } ${isToday ? "bg-pine text-white shadow" : "text-slate-950"}`}
                  >
                    {current.getDate()}
                  </span>
                  <span className={`mt-0.5 block font-extrabold ${available === 0 ? "text-brick" : "text-emerald-700"} ${largeText ? "text-xs" : "text-[10px]"}`}>
                    {available} livre(s)
                  </span>
                </button>
              );
            })}
          </div>

          {groupedRooms.map((group) => (
            <div key={group.name}>
              <div className="sticky left-0 z-20 flex min-h-8 items-center border-b border-pine/10 bg-sage-bg px-3">
                <span className="text-xs font-extrabold uppercase tracking-[0.08em] text-pine-dark">
                  {group.name}
                </span>
                <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-xs font-bold text-slate-700">
                  {group.rooms.length} UH
                </span>
              </div>

              {group.rooms.map((room) => {
                const visibleReservations = (reservationsByRoom.get(room.numero) ?? [])
                  .filter(
                    (reservation) =>
                      reservation.status !== "cancelado" &&
                      reservation.checkin < addDaysISO(startDate, daysVisible) &&
                      reservation.checkout > startDate,
                  )
                  .sort((left, right) => left.checkin.localeCompare(right.checkin));
                const featureTitle = roomFeatureTags(room)
                  .map((item) => item.label)
                  .join(" · ");

                return (
                  <div
                    key={`${room.company_id}-${room.numero}`}
                    className="relative grid border-b border-border/80"
                    style={{ gridTemplateColumns, minHeight: rowHeight }}
                  >
                    <button
                      type="button"
                      onClick={() => onRoomClick(room)}
                      className="sticky left-0 z-20 flex items-center justify-between gap-3 border-r border-border bg-card px-3 text-left transition hover:bg-sage-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                      title={featureTitle || "Características ainda não cadastradas"}
                    >
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="sr-only">Quarto</span>
                          <strong className={largeText ? "text-3xl font-black text-pine-dark" : "text-2xl font-black text-pine-dark"}>
                            {room.numero}
                          </strong>
                          <span className={largeText ? "text-sm font-bold text-slate-700" : "text-xs font-bold text-slate-700"}>
                            {room.andar}º andar
                          </span>
                        </div>
                        <RoomFeatureBadges room={room} compact max={largeText ? 3 : 2} />
                      </div>
                      <span className={`shrink-0 rounded-lg border-2 px-2.5 py-1.5 font-black shadow-sm ${priceClass(Number(room.preco))} ${largeText ? "text-lg" : "text-base"}`}>
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
                          className={`group/cell relative border-r border-border/65 transition hover:bg-sage-bg focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                            isToday ? "bg-amber-50" : weekend ? "bg-slate-50" : "bg-white"
                          }`}
                          style={{ gridColumn: index + 2 }}
                          aria-label={`Reservar quarto ${room.numero} em ${fmtDate(date)}`}
                        >
                          <Plus className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 text-pine opacity-0 transition group-hover/cell:opacity-60 group-focus-visible/cell:opacity-80" />
                        </button>
                      );
                    })}

                    {visibleReservations.map((reservation) => {
                      const startIndex = Math.max(0, daysBetween(startDate, reservation.checkin));
                      const endIndex = Math.min(daysVisible, daysBetween(startDate, reservation.checkout));
                      const span = Math.max(1, endIndex - startIndex);
                      const visual = reservationVisual(reservation, today);
                      return (
                        <button
                          key={reservation.id}
                          type="button"
                          onClick={() => onRoomClick(room)}
                          className={`relative z-10 mx-1 my-2 flex min-w-0 items-center overflow-hidden rounded-lg border-2 px-2 text-left shadow-md transition hover:z-20 hover:brightness-105 hover:shadow-xl focus-visible:z-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${visual.className}`}
                          style={{
                            gridColumn: `${startIndex + 2} / span ${span}`,
                            gridRow: 1,
                          }}
                          title={`${reservation.cliente_nome} · ${fmtDate(reservation.checkin)} a ${fmtDate(reservation.checkout)}`}
                        >
                          <span className="min-w-0">
                            <strong className={`block truncate font-black ${largeText ? "text-base" : "text-sm"}`}>
                              {reservation.cliente_nome}
                            </strong>
                            <span className={`flex items-center gap-1 truncate font-bold opacity-95 ${largeText ? "text-sm" : "text-xs"}`}>
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
            <div className="p-10 text-center text-base font-semibold text-slate-700">
              Nenhum quarto corresponde aos filtros selecionados. Tente outro pacote ou característica.
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
      <span className={`h-3 w-3 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function PriceLegend({ price }: { price: number }) {
  return (
    <span className={`rounded-md border-2 px-2 py-1 text-xs font-black ${priceClass(price)}`}>
      R$ {price}
    </span>
  );
}

function priceClass(price: number) {
  if (price === 110) return "border-orange-500 bg-orange-100 text-orange-950";
  if (price === 90) return "border-blue-500 bg-blue-100 text-blue-950";
  if (price === 80) return "border-slate-400 bg-white text-slate-950";
  return "border-slate-400 bg-slate-100 text-slate-950";
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
      className: "border-rose-700 bg-rose-600 text-white",
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
      className: "border-amber-600 bg-amber-400 text-slate-950",
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
