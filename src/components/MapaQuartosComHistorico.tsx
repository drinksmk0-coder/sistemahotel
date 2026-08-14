import { useEffect, useMemo, type ReactNode } from "react";
import {
  AlertTriangle,
  BedDouble,
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  Sparkles,
} from "lucide-react";
import { MapaQuartos } from "@/components/MapaQuartos";
import { buildGuestAccount } from "@/lib/guest-account";
import { roomStatusToday, useReservations, useRooms, useSales } from "@/lib/data";
import { fmtBRL, fmtDate, todayISO } from "@/lib/format";

/**
 * Preview do mapa preservando integralmente a linha do tempo existente.
 * A única camada nova é o resumo operacional compacto acima do mapa.
 */
export function MapaQuartosComHistorico() {
  const today = todayISO();
  const { data: rooms = [] } = useRooms();
  const { data: reservations = [] } = useReservations();
  const { data: sales = [] } = useSales();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const root = document.querySelector<HTMLElement>("[data-room-timeline-root]");
      const dateInput = root?.querySelector<HTMLInputElement>('input[type="date"]');
      if (!dateInput || dateInput.dataset.historyAdjusted === "true") return;

      const todayValue = todayISO();
      if (dateInput.value !== todayValue) return;

      dateInput.dataset.historyAdjusted = "true";
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(dateInput, previousDayISO(todayValue));
      dateInput.dispatchEvent(new Event("change", { bubbles: true }));
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const summary = useMemo(() => {
    const active = reservations.filter(
      (reservation) => !["cancelado", "manutencao"].includes(reservation.status),
    );
    const occupied = active.filter((reservation) => reservation.status === "ocupado");
    const arrivals = active.filter(
      (reservation) => reservation.checkin === today && reservation.status === "reservado",
    );
    const departures = active.filter(
      (reservation) => reservation.checkout === today && reservation.status === "ocupado",
    );
    const debtStays = occupied
      .map((reservation) => ({ reservation, account: buildGuestAccount(reservation, sales) }))
      .filter((item) => item.account.balance > 0.009);

    const roomStates = rooms.map((room) =>
      String(roomStatusToday(reservations, room.numero, today, room.situacao) ?? room.situacao ?? "livre"),
    );
    const cleaning = roomStates.filter((status) => status.includes("limpeza")).length;
    const maintenance = roomStates.filter((status) => status.includes("manutencao")).length;
    const occupiedRooms = new Set(occupied.map((reservation) => Number(reservation.quarto))).size;
    const reservedRooms = new Set(arrivals.map((reservation) => Number(reservation.quarto))).size;
    const freeReady = Math.max(0, rooms.length - occupiedRooms - reservedRooms - cleaning - maintenance);

    return {
      freeReady,
      occupied: occupiedRooms,
      reserved: reservedRooms,
      cleaning,
      maintenance,
      arrivals: arrivals.length,
      departures: departures.length,
      debtCount: debtStays.length,
      debtTotal: debtStays.reduce((sum, item) => sum + item.account.balance, 0),
    };
  }, [reservations, rooms, sales, today]);

  return (
    <div className="space-y-2">
      <section className="rounded-xl border border-border bg-card p-2.5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <div>
              <h2 className="text-xs font-extrabold text-pine-dark">Resumo operacional de hoje</h2>
              <p className="text-[9px] text-muted-foreground">{fmtDate(today)} · visão rápida antes da linha do tempo</p>
            </div>
          </div>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-bold text-muted-foreground">
            {rooms.length} UHs
          </span>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4 xl:grid-cols-8">
          <Metric label="Livres e prontas" value={summary.freeReady} icon={<CheckCircle2 className="h-3.5 w-3.5" />} tone="ok" />
          <Metric label="Ocupadas" value={summary.occupied} icon={<BedDouble className="h-3.5 w-3.5" />} />
          <Metric label="Reservadas hoje" value={summary.reserved} icon={<CalendarCheck2 className="h-3.5 w-3.5" />} />
          <Metric label="Limpeza" value={summary.cleaning} icon={<Clock3 className="h-3.5 w-3.5" />} tone={summary.cleaning ? "warn" : "neutral"} />
          <Metric label="Manutenção" value={summary.maintenance} icon={<AlertTriangle className="h-3.5 w-3.5" />} tone={summary.maintenance ? "danger" : "neutral"} />
          <Metric label="Check-ins hoje" value={summary.arrivals} icon={<CalendarCheck2 className="h-3.5 w-3.5" />} />
          <Metric label="Checkouts hoje" value={summary.departures} icon={<Clock3 className="h-3.5 w-3.5" />} />
          <Metric label="Com débito" value={summary.debtCount} icon={<AlertTriangle className="h-3.5 w-3.5" />} tone={summary.debtCount ? "danger" : "ok"} />
        </div>

        {summary.debtTotal > 0 && (
          <div className="mt-1.5 text-right text-[9px] font-bold text-brick">
            Total em aberto: {fmtBRL(summary.debtTotal)}
          </div>
        )}
      </section>

      <MapaQuartos />
    </div>
  );
}

function Metric({
  label,
  value,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: number;
  icon: ReactNode;
  tone?: "neutral" | "ok" | "warn" | "danger";
}) {
  const toneClass =
    tone === "ok"
      ? "bg-sage-bg text-pine-dark"
      : tone === "warn"
        ? "bg-brass-bg text-[oklch(0.42_0.08_75)]"
        : tone === "danger"
          ? "bg-brick-bg text-brick"
          : "bg-muted text-foreground";

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/70 px-2 py-1.5">
      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md ${toneClass}`}>{icon}</span>
      <span className="min-w-0">
        <strong className="block text-sm leading-none text-pine-dark">{value}</strong>
        <span className="mt-0.5 block truncate text-[9px] font-semibold text-muted-foreground">{label}</span>
      </span>
    </div>
  );
}

function previousDayISO(date: string) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() - 1);
  return value.toISOString().slice(0, 10);
}
