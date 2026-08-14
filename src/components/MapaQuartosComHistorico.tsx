import { useEffect, useMemo } from "react";
import { AlertTriangle, BedDouble, CalendarCheck2, CheckCircle2, Clock3, Sparkles } from "lucide-react";
import { MapaQuartos } from "@/components/MapaQuartos";
import { buildGuestAccount } from "@/lib/guest-account";
import { roomStatusToday, useReservations, useRooms, useSales } from "@/lib/data";
import { fmtBRL, fmtDate, todayISO } from "@/lib/format";

/**
 * Preview operacional do mapa. Mantém o mapa atual intacto e adiciona uma camada
 * de decisão acima dele. Também mantém um dia de histórico visível ao abrir.
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
      if (dateInput.value !== today) return;

      dateInput.dataset.historyAdjusted = "true";
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(dateInput, previousDayISO(today));
      dateInput.dispatchEvent(new Event("change", { bubbles: true }));
    }, 0);

    return () => window.clearTimeout(timer);
  }, [today]);

  const operational = useMemo(() => {
    const active = reservations.filter((reservation) => !["cancelado", "manutencao"].includes(reservation.status));
    const occupied = active.filter((reservation) => reservation.status === "ocupado");
    const todayArrivals = active.filter((reservation) => reservation.checkin === today && reservation.status === "reservado");
    const todayDepartures = active.filter((reservation) => reservation.checkout === today && reservation.status === "ocupado");
    const debtStays = occupied
      .map((reservation) => ({ reservation, account: buildGuestAccount(reservation, sales) }))
      .filter((item) => item.account.balance > 0.009);

    const roomStates = rooms.map((room) => String(roomStatusToday(room, reservations) ?? room.situacao ?? "livre"));
    const maintenance = roomStates.filter((status) => status.includes("manutencao")).length;
    const cleaning = roomStates.filter((status) => status.includes("limpeza")).length;
    const occupiedRooms = new Set(occupied.map((reservation) => Number(reservation.quarto))).size;
    const reservedRooms = new Set(todayArrivals.map((reservation) => Number(reservation.quarto))).size;
    const freeReady = Math.max(0, rooms.length - occupiedRooms - reservedRooms - cleaning - maintenance);

    const overlappingRooms = new Set<number>();
    for (let i = 0; i < active.length; i += 1) {
      for (let j = i + 1; j < active.length; j += 1) {
        const a = active[i];
        const b = active[j];
        if (Number(a.quarto) !== Number(b.quarto)) continue;
        if (a.checkin < b.checkout && b.checkin < a.checkout) overlappingRooms.add(Number(a.quarto));
      }
    }

    const alerts = [
      ...debtStays.map(({ reservation, account }) => ({
        severity: "alta" as const,
        title: `UH ${reservation.quarto} com débito`,
        detail: `${reservation.cliente_nome} · ${fmtBRL(account.balance)} em aberto`,
        action: "Receber antes do checkout",
      })),
      ...todayArrivals.slice(0, 5).map((reservation) => ({
        severity: "media" as const,
        title: `Check-in hoje · UH ${reservation.quarto}`,
        detail: `${reservation.cliente_nome} · entrada ${fmtDate(reservation.checkin)}`,
        action: "Confirmar chegada e quarto pronto",
      })),
      ...Array.from(overlappingRooms).map((room) => ({
        severity: "critica" as const,
        title: `Possível conflito · UH ${room}`,
        detail: "Há reservas ativas com períodos sobrepostos neste quarto.",
        action: "Revisar atribuição imediatamente",
      })),
    ].slice(0, 8);

    return {
      freeReady,
      occupied: occupiedRooms,
      reserved: reservedRooms,
      cleaning,
      maintenance,
      arrivals: todayArrivals.length,
      departures: todayDepartures.length,
      debtCount: debtStays.length,
      debtTotal: debtStays.reduce((sum, item) => sum + item.account.balance, 0),
      conflicts: overlappingRooms.size,
      alerts,
    };
  }, [reservations, rooms, sales, today]);

  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-border bg-card p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary/10 text-primary"><Sparkles className="h-4 w-4" /></span>
              <div>
                <h2 className="text-sm font-extrabold text-pine-dark">Resumo operacional de hoje</h2>
                <p className="text-[10px] text-muted-foreground">Referência: {fmtDate(today)} · dados atuais do sistema</p>
              </div>
            </div>
          </div>
          <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold text-muted-foreground">{rooms.length} UHs no inventário</span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <Metric label="Livres e prontas" value={operational.freeReady} icon={<CheckCircle2 className="h-4 w-4" />} tone="ok" />
          <Metric label="Ocupadas" value={operational.occupied} icon={<BedDouble className="h-4 w-4" />} />
          <Metric label="Reservadas hoje" value={operational.reserved} icon={<CalendarCheck2 className="h-4 w-4" />} />
          <Metric label="Aguardando limpeza" value={operational.cleaning} icon={<Clock3 className="h-4 w-4" />} tone={operational.cleaning ? "warn" : "neutral"} />
          <Metric label="Em manutenção" value={operational.maintenance} icon={<AlertTriangle className="h-4 w-4" />} tone={operational.maintenance ? "danger" : "neutral"} />
          <Metric label="Conflitos" value={operational.conflicts} icon={<AlertTriangle className="h-4 w-4" />} tone={operational.conflicts ? "danger" : "ok"} />
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MiniMetric label="Check-ins hoje" value={String(operational.arrivals)} />
          <MiniMetric label="Checkouts hoje" value={String(operational.departures)} />
          <MiniMetric label="Hospedagens com débito" value={String(operational.debtCount)} />
          <MiniMetric label="Total em aberto" value={fmtBRL(operational.debtTotal)} emphasize={operational.debtTotal > 0} />
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-extrabold text-pine-dark">Atenção agora</h2>
            <p className="text-[10px] text-muted-foreground">Somente regras objetivas calculadas a partir das reservas e contas.</p>
          </div>
          <span className="rounded-full bg-brick-bg px-2.5 py-1 text-[10px] font-black text-brick">{operational.alerts.length} item(ns)</span>
        </div>

        {operational.alerts.length === 0 ? (
          <div className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">Nenhuma pendência prioritária detectada agora.</div>
        ) : (
          <div className="grid gap-2 lg:grid-cols-2">
            {operational.alerts.map((alert, index) => (
              <article key={`${alert.title}-${index}`} className="rounded-xl border border-border/80 bg-background/55 p-3">
                <div className="flex items-start gap-2">
                  <span className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${alert.severity === "critica" ? "bg-destructive" : alert.severity === "alta" ? "bg-brick" : "bg-brass"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <strong className="text-xs text-foreground">{alert.title}</strong>
                      <span className="text-[9px] font-black uppercase tracking-wide text-muted-foreground">{alert.severity}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">{alert.detail}</p>
                    <p className="mt-1.5 text-[10px] font-bold text-primary">Próxima ação: {alert.action}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <MapaQuartos />
    </div>
  );
}

function Metric({ label, value, icon, tone = "neutral" }: { label: string; value: number; icon: React.ReactNode; tone?: "neutral" | "ok" | "warn" | "danger" }) {
  const toneClass = tone === "ok" ? "bg-sage-bg text-pine-dark" : tone === "warn" ? "bg-brass-bg text-[oklch(0.42_0.08_75)]" : tone === "danger" ? "bg-brick-bg text-brick" : "bg-muted text-foreground";
  return <div className="rounded-xl border border-border/70 p-2.5"><div className={`mb-2 grid h-7 w-7 place-items-center rounded-lg ${toneClass}`}>{icon}</div><strong className="block text-xl leading-none text-pine-dark">{value}</strong><span className="mt-1 block text-[10px] font-semibold text-muted-foreground">{label}</span></div>;
}

function MiniMetric({ label, value, emphasize = false }: { label: string; value: string; emphasize?: boolean }) {
  return <div className="rounded-xl bg-muted/55 px-3 py-2"><span className="block text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{label}</span><strong className={`mt-0.5 block text-sm ${emphasize ? "text-brick" : "text-pine-dark"}`}>{value}</strong></div>;
}

function previousDayISO(date: string) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() - 1);
  return value.toISOString().slice(0, 10);
}
