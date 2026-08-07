import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  DoorOpen,
  LogIn,
  Sparkles,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import {
  useSales,
  useUpdate,
  type Reservation,
  type Room,
} from "@/lib/data";
import {
  RoomFeatureBadges,
  roomFeatureTags,
} from "@/components/RoomFeatures";
import { GuestPaymentModal } from "@/components/GuestPaymentModal";
import {
  CompanyBillingCheckoutModal,
  type CompanyBillingCheckout,
} from "@/components/CompanyBillingCheckoutModal";
import { buildGuestAccount } from "@/lib/guest-account";
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
  const [daysVisible, setDaysVisible] = useState<TimelineRange>(14);
  const [paymentReservation, setPaymentReservation] = useState<Reservation | null>(null);
  const [companyBillingReservation, setCompanyBillingReservation] = useState<Reservation | null>(null);
  const [companyBillingBusy, setCompanyBillingBusy] = useState(false);
  const [busyReservationId, setBusyReservationId] = useState<string | null>(null);
  const [cleaningRoom, setCleaningRoom] = useState<number | null>(null);
  const { data: sales = [] } = useSales();
  const updateRoomSituation = useUpdate("rooms", ["rooms"]);
  const updateReservation = useUpdate("reservations", ["reservations"]);
  const today = todayISO();
  const dates = useMemo(
    () => Array.from({ length: daysVisible }, (_, index) => addDaysISO(startDate, index)),
    [daysVisible, startDate],
  );
  const endDate = dates[dates.length - 1] ?? startDate;

  const paymentAccount = useMemo(
    () => (paymentReservation ? buildGuestAccount(paymentReservation, sales) : null),
    [paymentReservation, sales],
  );
  const companyBillingAccount = useMemo(
    () =>
      companyBillingReservation
        ? buildGuestAccount(companyBillingReservation, sales)
        : null,
    [companyBillingReservation, sales],
  );

  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-room-timeline-root]");
    const toolbar = root?.previousElementSibling;
    const duplicatedDate = toolbar?.querySelector<HTMLInputElement>('input[type="date"]');
    const label = duplicatedDate?.closest("label");
    if (label instanceof HTMLElement) label.hidden = true;

    toolbar?.querySelectorAll("button").forEach((button) => {
      const text = button.textContent?.trim();
      const last = button.lastChild;
      if (text === "Linha do tempo" && last?.nodeType === Node.TEXT_NODE) last.textContent = " Mapa";
      if (text === "Cards" && last?.nodeType === Node.TEXT_NODE) last.textContent = " Quartos";
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
      .map((group) => ({ ...group, rooms: [...group.rooms].sort((a, b) => a.numero - b.numero) }))
      .sort((a, b) => a.floor - b.floor || a.name.localeCompare(b.name, "pt-BR"));
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
          const unavailable = rooms.filter((room) => {
            const cleaningToday = date === today && room.situacao === "limpeza";
            const hasReservation = (reservationsByRoom.get(room.numero) ?? []).some(
              (reservation) =>
                !["cancelado", "finalizado", "manutencao"].includes(reservation.status) &&
                reservation.checkin <= date &&
                reservation.checkout >= date,
            );
            return cleaningToday || hasReservation;
          }).length;
          return [date, Math.max(0, rooms.length - unavailable)] as const;
        }),
      ),
    [dates, reservationsByRoom, rooms, today],
  );

  function isCompanyReservation(reservation: Reservation) {
    return reservation.billing_responsibility === "company" || Boolean(reservation.billing_company_name);
  }

  function handleCheckIn(reservation: Reservation) {
    const account = buildGuestAccount(reservation, sales);
    const company = isCompanyReservation(reservation);
    if (!company && account.balance > 0.009) {
      setPaymentReservation(reservation);
      toast.info("Receba a hospedagem antes do check-in.");
      return;
    }

    setBusyReservationId(reservation.id);
    updateReservation.mutate(
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
          updateRoomSituation.mutate(
            { id: reservation.quarto, patch: { situacao: "ocupado" } },
            {
              onSuccess: () => {
                toast.success(`Check-in do quarto ${reservation.quarto} realizado.`);
                setBusyReservationId(null);
              },
              onError: (error: Error) => {
                toast.error(`Check-in feito, mas falhou ao atualizar o quarto: ${error.message}`);
                setBusyReservationId(null);
              },
            },
          );
        },
        onError: (error: Error) => {
          toast.error(error.message);
          setBusyReservationId(null);
        },
      },
    );
  }

  function finishCheckout(reservation: Reservation) {
    const account = buildGuestAccount(reservation, sales);
    if (account.balance > 0.009) {
      if (isCompanyReservation(reservation)) setCompanyBillingReservation(reservation);
      else setPaymentReservation(reservation);
      return;
    }

    setBusyReservationId(reservation.id);
    updateReservation.mutate(
      {
        id: reservation.id,
        patch: {
          status: "finalizado",
          horario_checkout: reservation.horario_checkout ?? currentTime(),
          checkout_at: new Date().toISOString(),
          billing_status:
            reservation.billing_responsibility === "company" ? "paid" : "not_applicable",
        },
      },
      {
        onSuccess: () => {
          updateRoomSituation.mutate(
            { id: reservation.quarto, patch: { situacao: "limpeza" } },
            {
              onSuccess: () => {
                toast.success(`Check-out concluído. Quarto ${reservation.quarto} enviado para limpeza.`);
                setBusyReservationId(null);
              },
              onError: (error: Error) => {
                toast.error(`Check-out feito, mas falhou ao enviar para limpeza: ${error.message}`);
                setBusyReservationId(null);
              },
            },
          );
        },
        onError: (error: Error) => {
          toast.error(error.message);
          setBusyReservationId(null);
        },
      },
    );
  }

  function finishCompanyBilling(billing: CompanyBillingCheckout) {
    const reservation = companyBillingReservation;
    if (!reservation) return;
    setCompanyBillingBusy(true);
    updateReservation.mutate(
      {
        id: reservation.id,
        patch: {
          ...billing,
          status: "finalizado",
          horario_checkout: reservation.horario_checkout ?? currentTime(),
          checkout_at: new Date().toISOString(),
        },
      },
      {
        onSuccess: () => {
          updateRoomSituation.mutate(
            { id: reservation.quarto, patch: { situacao: "limpeza" } },
            {
              onSuccess: () => {
                toast.success("Check-out concluído; valor enviado para faturamento da empresa e quarto para limpeza.");
                setCompanyBillingReservation(null);
                setCompanyBillingBusy(false);
              },
              onError: (error: Error) => {
                toast.error(`Faturamento concluído, mas falhou ao enviar para limpeza: ${error.message}`);
                setCompanyBillingReservation(null);
                setCompanyBillingBusy(false);
              },
            },
          );
        },
        onError: (error: Error) => {
          toast.error(error.message);
          setCompanyBillingBusy(false);
        },
      },
    );
  }

  function finishCleaning(room: Room) {
    setCleaningRoom(room.numero);
    updateRoomSituation.mutate(
      { id: room.numero, patch: { situacao: null } },
      {
        onSuccess: () => {
          toast.success(`Limpeza concluída. Quarto ${room.numero} liberado.`);
          setCleaningRoom(null);
        },
        onError: (error: Error) => {
          toast.error(error.message);
          setCleaningRoom(null);
        },
      },
    );
  }

  const roomColumnWidth = 270;
  const dayWidth = daysVisible >= 60 ? 56 : daysVisible >= 30 ? 64 : 82;
  const rowHeight = 54;
  const gridTemplateColumns = `${roomColumnWidth}px repeat(${daysVisible}, minmax(${dayWidth}px, 1fr))`;
  const minimumWidth = roomColumnWidth + daysVisible * dayWidth;

  return (
    <>
      <section data-room-timeline-root className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border bg-card px-2.5 py-2">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-semibold text-muted-foreground">
                O mapa mostra automaticamente o próximo passo de cada hospedagem.
              </p>
              <label className="relative inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground shadow-sm">
                <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                <span>{fmtDate(startDate)} a {fmtDate(endDate)}</span>
                <input
                  type="date"
                  className="absolute inset-0 cursor-pointer opacity-0"
                  value={startDate}
                  onChange={(event) => event.target.value && onStartDateChange(event.target.value)}
                  aria-label="Escolher data"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <div className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5">
                <button type="button" className="grid min-h-7 min-w-7 place-items-center rounded-md text-pine-dark hover:bg-card" onClick={() => onStartDateChange(addDaysISO(startDate, -daysVisible))} aria-label="Período anterior">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button type="button" className="min-h-7 rounded-md px-2 text-xs font-extrabold text-pine-dark hover:bg-card" onClick={() => onStartDateChange(todayISO())}>Hoje</button>
                <button type="button" className="grid min-h-7 min-w-7 place-items-center rounded-md text-pine-dark hover:bg-card" onClick={() => onStartDateChange(addDaysISO(startDate, daysVisible))} aria-label="Próximo período">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5 font-bold">
                {([7, 14, 30, 60] as TimelineRange[]).map((days) => (
                  <button
                    key={days}
                    type="button"
                    className={`min-h-7 rounded-md px-2 text-[11px] transition ${daysVisible === days ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-card"}`}
                    onClick={() => setDaysVisible(days)}
                  >
                    {days} dias
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[9px] font-semibold text-muted-foreground">
            <Legend color="bg-[var(--chart-5)]" label="Reserva" />
            <Legend color="bg-emerald-600" label="Hospedado · quitado" emphasis />
            <Legend color="bg-brick" label="Hospedado · débito" emphasis />
            <Legend color="bg-indigo-600" label="Saiu e retorna" />
            <Legend color="bg-slate" label="Finalizada" />
            <span className="ml-auto hidden rounded-full bg-primary/10 px-2 py-1 font-bold text-primary sm:inline-flex">
              1 próxima ação por hospedagem
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div style={{ minWidth: minimumWidth }}>
            <div className="sticky top-0 z-30 grid border-b border-border bg-card/95 backdrop-blur" style={{ gridTemplateColumns }}>
              <div className="sticky left-0 z-40 flex items-center border-r border-border bg-card px-2 py-1" style={{ gridColumn: 1, gridRow: 1 }}>
                <strong className="text-xs text-pine-dark">{rooms.length} quartos</strong>
              </div>
              {dates.map((date, index) => {
                const current = parseDate(date);
                const isToday = date === today;
                const weekend = [0, 6].includes(current.getDay());
                const available = availabilityByDate.get(date) ?? 0;
                return (
                  <button
                    key={date}
                    type="button"
                    onClick={() => onStartDateChange(date)}
                    className={`border-r border-border/45 px-1 py-1 text-center transition ${isToday ? "bg-primary/10" : weekend ? "bg-muted/25" : "bg-card"}`}
                    style={{ gridColumn: index + 2, gridRow: 1 }}
                    aria-label={`Consultar ${fmtDate(date)}`}
                  >
                    <span className="block text-[9px] font-extrabold uppercase text-muted-foreground">{current.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}</span>
                    <span className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full text-xs font-black ${isToday ? "bg-primary text-primary-foreground" : "text-pine-dark"}`}>{current.getDate()}</span>
                    <span className={`block text-[9px] font-bold ${available === 0 ? "text-brick" : "text-primary"}`}>{available} livre(s)</span>
                  </button>
                );
              })}
            </div>

            {groupedRooms.map((group) => (
              <div key={`${group.name}-${group.floor}`}>
                <div className="sticky left-0 z-20 flex h-7 items-center border-b border-primary/15 bg-primary/10 px-2.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.07em] text-pine-dark">{group.name} · {group.floor}º andar</span>
                  <span className="ml-2 rounded-full border border-primary/15 bg-card px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">{group.rooms.length} UH</span>
                </div>

                {group.rooms.map((room) => {
                  const visibleReservations = (reservationsByRoom.get(room.numero) ?? [])
                    .filter((reservation) => reservation.status !== "cancelado" && reservation.checkin <= addDaysISO(startDate, daysVisible - 1) && reservation.checkout >= startDate)
                    .sort((a, b) => a.checkin.localeCompare(b.checkin));
                  const featureTitle = roomFeatureTags(room).map((item) => item.label).join(" · ");
                  const cleaning = room.situacao === "limpeza";

                  return (
                    <div key={`${room.company_id}-${room.numero}`} className="relative grid border-b border-border/55" style={{ gridTemplateColumns, height: rowHeight }}>
                      <div className="sticky left-0 z-20 flex items-center border-r border-border/70 bg-card px-2.5 py-1 text-pine-dark" style={{ gridColumn: 1, gridRow: 1 }}>
                        <button type="button" onClick={() => onRoomClick(room)} className="min-w-0 flex-1 text-left" title={featureTitle || "Características ainda não cadastradas"}>
                          <div className="flex items-center justify-between gap-2">
                            <strong className="text-sm font-black">{room.numero}</strong>
                            <span className="shrink-0 rounded-md border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[9px] font-extrabold text-primary">{fmtBRL(room.preco)}</span>
                          </div>
                          <div className="max-h-4 overflow-hidden"><RoomFeatureBadges room={room} compact max={3} /></div>
                        </button>
                        {cleaning && (
                          <button
                            type="button"
                            disabled={cleaningRoom === room.numero}
                            onClick={() => finishCleaning(room)}
                            className="ml-2 inline-flex shrink-0 items-center gap-1 rounded-lg bg-amber-100 px-2 py-1 text-[9px] font-extrabold text-amber-800 transition hover:bg-amber-200 disabled:opacity-60"
                            title="Confirmar que a limpeza terminou e liberar o quarto"
                          >
                            <Sparkles className="h-3 w-3" /> Concluir limpeza
                          </button>
                        )}
                      </div>

                      {dates.map((date, index) => {
                        const weekend = [0, 6].includes(parseDate(date).getDay());
                        const isToday = date === today;
                        return (
                          <button
                            key={date}
                            type="button"
                            onClick={() => onCreateReservation(room, date)}
                            className={`group/cell relative border-r border-border/35 transition hover:bg-primary/[0.07] ${isToday ? "bg-primary/[0.045]" : weekend ? "bg-muted/15" : "bg-card"}`}
                            style={{ gridColumn: index + 2, gridRow: 1 }}
                            aria-label={`Reservar quarto ${room.numero} em ${fmtDate(date)}`}
                          />
                        );
                      })}

                      {visibleReservations.map((reservation) => {
                        const startIndex = Math.max(0, daysBetween(startDate, reservation.checkin));
                        const endExclusive = Math.min(daysVisible, daysBetween(startDate, reservation.checkout) + 1);
                        const span = Math.max(1, endExclusive - startIndex);
                        const checkedIn = reservationIsCheckedIn(reservation);
                        const temporarilyAway = checkedIn && room.situacao === "ausente_temporario";
                        const account = buildGuestAccount(reservation, sales);
                        const company = isCompanyReservation(reservation);
                        const checkoutDue = checkedIn && today >= reservation.checkout;
                        const visual = reservationVisual(reservation, today, temporarilyAway, account.balance, account.total, account.paid);
                        const busy = busyReservationId === reservation.id;

                        let primaryAction: React.ReactNode = null;
                        if (reservation.status === "reservado") {
                          if (!company && account.balance > 0.009) {
                            primaryAction = (
                              <PrimaryAction icon={<WalletCards className="h-3.5 w-3.5" />} label="Receber" title={`Receber ${fmtBRL(account.balance)} antes do check-in`} onClick={() => setPaymentReservation(reservation)} />
                            );
                          } else {
                            primaryAction = (
                              <PrimaryAction icon={<LogIn className="h-3.5 w-3.5" />} label="Check-in" title={company ? "Empresa: check-in sem cobrança na recepção" : "Fazer check-in"} disabled={busy} onClick={() => handleCheckIn(reservation)} />
                            );
                          }
                        } else if (checkoutDue && !["finalizado", "cancelado"].includes(reservation.status)) {
                          if (account.balance > 0.009) {
                            primaryAction = company ? (
                              <PrimaryAction icon={<Building2 className="h-3.5 w-3.5" />} label="Faturar" title="Revisar conta, faturar empresa e concluir check-out" onClick={() => setCompanyBillingReservation(reservation)} />
                            ) : (
                              <PrimaryAction icon={<CircleDollarSign className="h-3.5 w-3.5" />} label="Revisar conta" title={`Há ${fmtBRL(account.balance)} pendente antes do check-out`} onClick={() => setPaymentReservation(reservation)} />
                            );
                          } else {
                            primaryAction = (
                              <PrimaryAction icon={<DoorOpen className="h-3.5 w-3.5" />} label="Check-out" title="Conta revisada e quitada: concluir check-out" disabled={busy} onClick={() => finishCheckout(reservation)} />
                            );
                          }
                        }

                        return (
                          <div
                            key={reservation.id}
                            className={`relative z-10 mx-1 my-1 flex min-w-0 overflow-hidden rounded-lg border shadow-sm ring-1 ring-black/5 transition hover:z-20 hover:brightness-105 hover:shadow-md ${visual.className}`}
                            style={{ gridColumn: `${startIndex + 2} / span ${span}`, gridRow: 1 }}
                            title={`${reservation.cliente_nome} · ${fmtDate(reservation.checkin)} a ${fmtDate(reservation.checkout)} · ${visual.label}`}
                          >
                            <button type="button" onClick={() => onRoomClick(room)} className="flex min-w-0 flex-1 items-center px-2.5 text-left">
                              <span className="min-w-0">
                                <strong className="block truncate text-[11px] font-black leading-tight">{reservation.cliente_nome}</strong>
                                <span className="mt-0.5 flex items-center gap-1 truncate text-[9px] font-bold opacity-95">
                                  <CircleDollarSign className="h-2.5 w-2.5 shrink-0" /> {visual.label}
                                </span>
                              </span>
                            </button>
                            {primaryAction}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </section>

      {paymentAccount && <GuestPaymentModal account={paymentAccount} onClose={() => setPaymentReservation(null)} />}

      {companyBillingReservation && companyBillingAccount && (
        <CompanyBillingCheckoutModal
          reservation={companyBillingReservation}
          balance={companyBillingAccount.balance}
          busy={companyBillingBusy}
          onClose={() => setCompanyBillingReservation(null)}
          onConfirm={finishCompanyBilling}
        />
      )}
    </>
  );
}

function PrimaryAction({
  icon,
  label,
  title,
  onClick,
  disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex shrink-0 items-center gap-1.5 border-l border-white/30 bg-black/12 px-2.5 text-[9px] font-extrabold transition hover:bg-black/25 disabled:cursor-wait disabled:opacity-60"
      title={title}
    >
      {icon}
      <span className="hidden xl:inline">{label}</span>
    </button>
  );
}

function Legend({ color, label, emphasis = false }: { color: string; label: string; emphasis?: boolean }) {
  return (
    <span className={`flex items-center gap-1 rounded-full px-2 py-1 ${emphasis ? "border border-border bg-muted/45 font-bold text-foreground" : "bg-muted/20"}`}>
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function reservationIsCheckedIn(reservation: Reservation) {
  return ["ocupado", "saida_pendente"].includes(reservation.status) || Boolean(reservation.checkin_at);
}

function reservationVisual(
  reservation: Reservation,
  today: string,
  temporarilyAway: boolean,
  balance: number,
  total: number,
  paid: number,
): ReservationVisual {
  const overdue = balance > 0 && reservation.checkout < today && !["finalizado", "cancelado"].includes(reservation.status);

  if (overdue) return { className: "border-brick bg-brick text-white", label: `Débito vencido · ${fmtBRL(balance)}` };
  if (reservation.status === "finalizado") return { className: "border-slate/60 bg-slate text-white", label: "Finalizada" };

  if (reservationIsCheckedIn(reservation)) {
    if (temporarilyAway) return { className: "border-indigo-700 bg-indigo-600 text-white", label: "Saiu e retorna" };
    if (balance > 0) return { className: "border-brick bg-brick text-white", label: `Hospedado · débito ${fmtBRL(balance)}` };
    return { className: "border-emerald-700 bg-emerald-600 text-white", label: "Hospedado · quitado" };
  }

  const paymentLabel = total > 0 && paid >= total ? "quitada" : paid > 0 ? "sinal pago" : "aguardando pagamento";
  return { className: "border-[var(--chart-5)] bg-[var(--chart-5)] text-white", label: `Reserva · ${paymentLabel}` };
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

function currentTime() {
  return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });
}
