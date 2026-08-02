import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany } from "@/lib/data";

type Range = { start: string; end: string };
type ReservationStatus = {
  total: number;
  completed: number;
  cancelled: number;
  noShow: number;
};

const EMPTY_STATUS: ReservationStatus = {
  total: 0,
  completed: 0,
  cancelled: 0,
  noShow: 0,
};

export function ReservationStatusOverview() {
  const company = useCurrentCompany();
  const [range, setRange] = useState<Range | null>(null);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-executive-dashboard]");
    if (!root) return;

    const sync = () => {
      const fields = root.querySelectorAll<HTMLInputElement>('input[type="date"]');
      if (fields.length < 2 || !fields[0].value || !fields[1].value) return;
      const start = fields[0].value <= fields[1].value ? fields[0].value : fields[1].value;
      const end = fields[0].value <= fields[1].value ? fields[1].value : fields[0].value;
      setRange((current) =>
        current?.start === start && current?.end === end ? current : { start, end },
      );
    };

    sync();
    root.addEventListener("input", sync, true);
    root.addEventListener("change", sync, true);
    const observer = new MutationObserver(sync);
    observer.observe(root, { childList: true, subtree: true });

    return () => {
      root.removeEventListener("input", sync, true);
      root.removeEventListener("change", sync, true);
      observer.disconnect();
    };
  }, []);

  const query = useQuery({
    queryKey: ["reservation-status-bars", company.data?.id, range?.start, range?.end],
    enabled: Boolean(company.data?.id && range),
    staleTime: 60_000,
    queryFn: async (): Promise<ReservationStatus> => {
      const { data, error } = await (supabase as any)
        .from("reservations")
        .select("status,checkin")
        .eq("company_id", company.data!.id)
        .gte("checkin", range!.start)
        .lte("checkin", range!.end);
      if (error) throw error;

      const result: ReservationStatus = { ...EMPTY_STATUS };
      (data ?? []).forEach((row: { status?: string | null }) => {
        const status = normalizeStatus(row.status);
        result.total += 1;
        if (status === "completed") result.completed += 1;
        if (status === "cancelled") result.cancelled += 1;
        if (status === "noShow") result.noShow += 1;
      });
      return result;
    },
  });

  if (!range) return null;

  const status = query.data ?? EMPTY_STATUS;
  const data = [
    { name: "Reservas", value: status.total, fill: "var(--executive-series-1)" },
    { name: "Finalizadas", value: status.completed, fill: "var(--executive-series-3)" },
    { name: "Canceladas", value: status.cancelled, fill: "var(--executive-negative)" },
    { name: "No-show", value: status.noShow, fill: "var(--executive-warning)" },
  ];
  const cancellationRate = rate(status.cancelled, status.total);
  const noShowRate = rate(status.noShow, status.total);

  return (
    <section className="mx-0 mb-2 rounded-xl border border-border bg-card p-3 shadow-sm" aria-label="Comparação do status das reservas">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2 border-b border-border/70 pb-2">
        <div>
          <p className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-primary">Operação de reservas</p>
          <h2 className="text-sm font-black text-pine-dark">Reservas, finalizadas, canceladas e no-show</h2>
        </div>
        <span className="rounded-full border border-primary/15 bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">
          Cancelamento {cancellationRate.toFixed(1)}% · No-show {noShowRate.toFixed(1)}%
        </span>
      </div>

      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: 8, right: 18, top: 22, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 5" vertical={false} />
            <XAxis dataKey="name" />
            <YAxis allowDecimals={false} width={34} />
            <Tooltip formatter={(value: number) => `${value} reserva(s)`} />
            <Bar dataKey="value" radius={[8, 8, 0, 0]} maxBarSize={72}>
              {data.map((row) => <Cell key={row.name} fill={row.fill} />)}
              <LabelList dataKey="value" position="top" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function normalizeStatus(value: string | null | undefined): "completed" | "cancelled" | "noShow" | "other" {
  const status = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
  if (status.includes("cancel")) return "cancelled";
  if (status.includes("noshow") || status.includes("naocompareceu") || status.includes("naocomparecimento")) return "noShow";
  if (status.includes("finaliz") || status.includes("checkout") || status.includes("conclu")) return "completed";
  return "other";
}

function rate(value: number, total: number) {
  return total > 0 ? (value / total) * 100 : 0;
}
