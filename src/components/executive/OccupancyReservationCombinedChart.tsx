import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany } from "@/lib/data";

type Range = { start: string; end: string };
type ReservationRow = {
  status: string | null;
  checkin: string;
  checkout: string;
  quarto: number | string | null;
};
type DailyRow = {
  date: string;
  reservations: number;
  cancelled: number;
  noShow: number;
  occupancy: number;
};

export function OccupancyReservationCombinedChart() {
  const company = useCurrentCompany();
  const [range, setRange] = useState<Range | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-executive-dashboard]");
    if (!root) return;

    const mount = () => {
      const firstCard = root.querySelector<HTMLElement>("article.executive-bi-card");
      if (!firstCard) return;
      firstCard.classList.add("executive-occupancy-combined");
      const title = firstCard.querySelector<HTMLElement>("h2");
      if (title) {
        title.textContent = "1. Ocupação, reservas, cancelamentos e no-show por dia";
        title.title = title.textContent;
      }
      let portalHost = firstCard.querySelector<HTMLElement>("[data-occupancy-reservation-host]");
      if (!portalHost) {
        portalHost = document.createElement("div");
        portalHost.dataset.occupancyReservationHost = "true";
        portalHost.className = "occupancy-reservation-host";
        firstCard.appendChild(portalHost);
      }
      setHost(portalHost);
    };

    const syncRange = () => {
      const fields = root.querySelectorAll<HTMLInputElement>('input[type="date"]');
      if (fields.length < 2 || !fields[0].value || !fields[1].value) return;
      const start = fields[0].value <= fields[1].value ? fields[0].value : fields[1].value;
      const end = fields[0].value <= fields[1].value ? fields[1].value : fields[0].value;
      setRange((current) => current?.start === start && current?.end === end ? current : { start, end });
    };

    mount();
    syncRange();
    root.addEventListener("input", syncRange, true);
    root.addEventListener("change", syncRange, true);
    const observer = new MutationObserver(() => {
      mount();
      syncRange();
    });
    observer.observe(root, { childList: true, subtree: true });

    return () => {
      root.removeEventListener("input", syncRange, true);
      root.removeEventListener("change", syncRange, true);
      observer.disconnect();
    };
  }, []);

  const query = useQuery({
    queryKey: ["occupancy-reservation-combined", company.data?.id, range?.start, range?.end],
    enabled: Boolean(company.data?.id && range),
    staleTime: 60_000,
    queryFn: async () => {
      const [reservationsResult, roomsResult] = await Promise.all([
        (supabase as any)
          .from("reservations")
          .select("status,checkin,checkout,quarto")
          .eq("company_id", company.data!.id)
          .lte("checkin", range!.end)
          .gte("checkout", range!.start),
        (supabase as any)
          .from("rooms")
          .select("id")
          .eq("company_id", company.data!.id),
      ]);
      if (reservationsResult.error) throw reservationsResult.error;
      if (roomsResult.error) throw roomsResult.error;
      return {
        reservations: (reservationsResult.data ?? []) as ReservationRow[],
        roomCount: (roomsResult.data ?? []).length,
      };
    },
  });

  const rows = useMemo<DailyRow[]>(() => {
    if (!range || !query.data) return [];
    const output: DailyRow[] = [];
    let cursor = parseDate(range.start);
    const end = parseDate(range.end);

    while (cursor <= end) {
      const isoDate = iso(cursor);
      const arrivals = query.data.reservations.filter((row) => row.checkin === isoDate);
      const validForOccupancy = query.data.reservations.filter((row) => {
        const status = normalizeStatus(row.status);
        return status !== "cancelled" && status !== "noShow" && row.checkin <= isoDate && row.checkout >= isoDate && row.quarto != null;
      });
      const occupiedRooms = new Set(validForOccupancy.map((row) => String(row.quarto))).size;

      output.push({
        date: formatDay(isoDate),
        reservations: arrivals.length,
        cancelled: arrivals.filter((row) => normalizeStatus(row.status) === "cancelled").length,
        noShow: arrivals.filter((row) => normalizeStatus(row.status) === "noShow").length,
        occupancy: query.data.roomCount > 0 ? (occupiedRooms / query.data.roomCount) * 100 : 0,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return output;
  }, [query.data, range]);

  if (!host) return null;

  return createPortal(
    <div className="h-72 pt-1">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ left: 4, right: 18, top: 24, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 5" vertical={false} />
          <XAxis dataKey="date" minTickGap={18} />
          <YAxis yAxisId="count" allowDecimals={false} width={32} />
          <YAxis yAxisId="occupancy" orientation="right" domain={[0, 100]} tickFormatter={(value) => `${value}%`} width={42} />
          <Tooltip
            formatter={(value: number, name: string) =>
              name === "Taxa de ocupação" ? `${value.toFixed(1)}%` : `${value} reserva(s)`
            }
          />
          <Legend wrapperStyle={{ fontSize: 10, fontWeight: 700 }} />
          <Bar yAxisId="count" dataKey="reservations" name="Reservas" fill="var(--executive-series-1)" radius={[5, 5, 0, 0]} maxBarSize={28}>
            <LabelList dataKey="reservations" position="top" />
          </Bar>
          <Bar yAxisId="count" dataKey="cancelled" name="Canceladas" fill="var(--executive-negative)" radius={[5, 5, 0, 0]} maxBarSize={28}>
            <LabelList dataKey="cancelled" position="top" />
          </Bar>
          <Bar yAxisId="count" dataKey="noShow" name="No-show" fill="var(--executive-warning)" radius={[5, 5, 0, 0]} maxBarSize={28}>
            <LabelList dataKey="noShow" position="top" />
          </Bar>
          <Line
            yAxisId="occupancy"
            type="monotone"
            dataKey="occupancy"
            name="Taxa de ocupação"
            stroke="var(--executive-series-3)"
            strokeWidth={3}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
          >
            <LabelList dataKey="occupancy" position="top" formatter={(value: number) => `${value.toFixed(1)}%`} />
          </Line>
        </ComposedChart>
      </ResponsiveContainer>
    </div>,
    host,
  );
}

function normalizeStatus(value: string | null | undefined): "active" | "cancelled" | "noShow" {
  const status = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
  if (status.includes("cancel")) return "cancelled";
  if (status.includes("noshow") || status.includes("naocompareceu") || status.includes("naocomparecimento")) return "noShow";
  return "active";
}

function parseDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}
function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}
function formatDay(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(parseDate(value));
}
