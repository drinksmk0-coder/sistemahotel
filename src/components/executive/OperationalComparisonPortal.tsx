import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useReservations, type Reservation } from "@/lib/data";
import { todayISO } from "@/lib/format";

type PeriodCounts = {
  total: number;
  cancelled: number;
  noShow: number;
  hasBase: boolean;
};

export function OperationalComparisonPortal() {
  const { data: reservations = [] } = useReservations();
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const today = todayISO();
  const currentStart = `${today.slice(0, 7)}-01`;
  const previousStart = previousMonthISO(currentStart);
  const previousYearStart = sameMonthPreviousYearISO(currentStart);

  useEffect(() => {
    let currentTarget: HTMLElement | null = null;

    const sync = () => {
      const summaryGrid = document.querySelector<HTMLElement>(".painel-v4-summary-grid");
      if (!summaryGrid) {
        if (currentTarget) {
          currentTarget = null;
          setTarget(null);
        }
        return;
      }

      let slot = summaryGrid.querySelector<HTMLElement>("[data-operational-comparison-slot]");
      if (!slot) {
        slot = document.createElement("div");
        slot.dataset.operationalComparisonSlot = "true";
        slot.className = "painel-v4-operational-comparison-slot";
        summaryGrid.appendChild(slot);
      }

      if (currentTarget !== slot) {
        currentTarget = slot;
        setTarget(slot);
      }
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const current = useMemo(
    () => periodCounts(reservations, currentStart, nextMonthISO(currentStart)),
    [reservations, currentStart],
  );
  const previous = useMemo(
    () => periodCounts(reservations, previousStart, nextMonthISO(previousStart)),
    [reservations, previousStart],
  );
  const previousYear = useMemo(
    () => periodCounts(reservations, previousYearStart, nextMonthISO(previousYearStart)),
    [reservations, previousYearStart],
  );

  if (!target) return null;

  const data = [
    { indicador: "Reservas", Atual: current.total, "Mês anterior": previous.total, "Ano anterior": previousYear.total },
    { indicador: "Cancelamentos", Atual: current.cancelled, "Mês anterior": previous.cancelled, "Ano anterior": previousYear.cancelled },
    { indicador: "No-show", Atual: current.noShow, "Mês anterior": previous.noShow, "Ano anterior": previousYear.noShow },
  ];

  const missing: string[] = [];
  if (!previous.hasBase) missing.push("mês anterior");
  if (!previousYear.hasBase) missing.push("ano anterior");

  return createPortal(
    <article className="painel-v4-panel painel-v4-operational-comparison min-w-0 rounded-xl border border-border bg-card">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-xs font-extrabold">Reservas, cancelamentos e no-show</h2>
          <p className="mt-0.5 text-[8px] text-muted-foreground">
            Comparação por mês de check-in · atual × mês anterior × mesmo mês do ano anterior
          </p>
        </div>
        {missing.length > 0 && (
          <span className="rounded-full border border-dashed border-border bg-muted px-2 py-1 text-[8px] font-bold text-muted-foreground">
            Sem base: {missing.join(" e ")}
          </span>
        )}
      </div>

      <div className="h-52 sm:h-56 xl:h-60">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.75} />
            <XAxis dataKey="indicador" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} />
            <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} />
            <Tooltip
              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--foreground)", fontSize: 10 }}
              formatter={(value, name) => [Number(value), String(name)]}
            />
            <Legend wrapperStyle={{ fontSize: 10, paddingTop: 6 }} />
            <Bar dataKey="Atual" fill="var(--primary)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Mês anterior" fill="color-mix(in srgb, var(--primary) 52%, var(--muted-foreground))" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Ano anterior" fill="color-mix(in srgb, var(--primary) 24%, var(--border))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </article>,
    target,
  );
}

function periodCounts(reservations: Reservation[], start: string, end: string): PeriodCounts {
  const rows = reservations.filter((reservation) => reservation.checkin >= start && reservation.checkin < end && normalize(reservation.status) !== "manutencao");
  const cancelled = rows.filter((reservation) => isCancelled(reservation)).length;
  const noShow = rows.filter((reservation) => isNoShow(reservation)).length;
  return {
    total: rows.length,
    cancelled,
    noShow,
    hasBase: rows.length > 0,
  };
}

function isCancelled(reservation: Reservation) {
  const status = normalize(reservation.status);
  return status.includes("cancel");
}

function isNoShow(reservation: Reservation) {
  const status = normalize(reservation.status);
  const presence = normalize((reservation as Reservation & { presence_status?: string | null }).presence_status);
  return [status, presence].some((value) => value === "no_show" || value === "no-show" || value === "noshow" || value === "no show");
}

function normalize(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function nextMonthISO(start: string) {
  const [year, month] = start.split("-").map(Number);
  const date = new Date(Date.UTC(year, month, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function previousMonthISO(start: string) {
  const [year, month] = start.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function sameMonthPreviousYearISO(start: string) {
  return `${Number(start.slice(0, 4)) - 1}${start.slice(4)}`;
}
