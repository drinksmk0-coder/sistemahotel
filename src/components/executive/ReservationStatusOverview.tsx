import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Ban, BedDouble, CalendarCheck, CheckCircle2, UserX } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany } from "@/lib/data";

type Range = { start: string; end: string };
type ReservationStatus = {
  total: number;
  confirmed: number;
  inHouse: number;
  completed: number;
  cancelled: number;
  noShow: number;
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
      setRange((current) => current?.start === start && current?.end === end ? current : { start, end });
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
    queryKey: ["reservation-status-overview", company.data?.id, range?.start, range?.end],
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
      const rows = data ?? [];
      const result: ReservationStatus = { total: rows.length, confirmed: 0, inHouse: 0, completed: 0, cancelled: 0, noShow: 0 };
      rows.forEach((row: { status?: string | null }) => {
        const status = normalizeStatus(row.status);
        if (status === "cancelled") result.cancelled += 1;
        else if (status === "noShow") result.noShow += 1;
        else if (status === "completed") result.completed += 1;
        else if (status === "inHouse") result.inHouse += 1;
        else result.confirmed += 1;
      });
      return result;
    },
  });

  const status = query.data ?? { total: 0, confirmed: 0, inHouse: 0, completed: 0, cancelled: 0, noShow: 0 };
  const cancellationRate = rate(status.cancelled, status.total);
  const noShowRate = rate(status.noShow, status.total);
  const completionRate = rate(status.completed, Math.max(0, status.total - status.cancelled - status.noShow));
  const chartData = useMemo(() => [
    { name: "Confirmadas", value: status.confirmed, fill: "var(--executive-series-1)" },
    { name: "Hospedadas", value: status.inHouse, fill: "var(--executive-series-2)" },
    { name: "Finalizadas", value: status.completed, fill: "var(--executive-series-3)" },
    { name: "Canceladas", value: status.cancelled, fill: "var(--executive-negative)" },
    { name: "No-show", value: status.noShow, fill: "var(--executive-warning)" },
  ], [status]);

  if (!range) return null;

  return (
    <section className="mb-2 rounded-xl border border-border bg-card p-3 shadow-sm" aria-label="Desempenho operacional das reservas">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2 border-b border-border/70 pb-2">
        <div>
          <p className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-primary">Operação de reservas</p>
          <h2 className="text-sm font-black text-pine-dark">Reservas, cancelamentos, finalizações e no-show</h2>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-extrabold ${cancellationRate > 15 || noShowRate > 5 ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          Perdas: {(cancellationRate + noShowRate).toFixed(1)}%
        </span>
      </div>

      <div className="grid gap-2 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <StatusCard icon={<CalendarCheck />} label="Reservas" value={status.total} detail="Criadas no período" />
          <StatusCard icon={<BedDouble />} label="Confirmadas" value={status.confirmed} detail={`${rate(status.confirmed, status.total).toFixed(1)}% do total`} />
          <StatusCard icon={<CheckCircle2 />} label="Finalizadas" value={status.completed} detail={`${completionRate.toFixed(1)}% de conclusão`} />
          <StatusCard icon={<Ban />} label="Canceladas" value={status.cancelled} detail={`${cancellationRate.toFixed(1)}% de cancelamento`} danger={cancellationRate > 15} />
          <StatusCard icon={<UserX />} label="No-show" value={status.noShow} detail={`${noShowRate.toFixed(1)}% não compareceram`} danger={noShowRate > 5} />
          <StatusCard icon={<AlertTriangle />} label="Em hospedagem" value={status.inHouse} detail="Check-in realizado" />
        </div>

        <div className="h-48 min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 4, right: 34, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 5" horizontal={false} />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={82} tick={{ fontSize: 10, fontWeight: 700 }} />
              <Tooltip formatter={(value: number) => `${value} reserva(s)`} />
              <Bar dataKey="value" radius={[0, 7, 7, 0]} maxBarSize={21}>
                {chartData.map((row) => <Cell key={row.name} fill={row.fill} />)}
                <LabelList dataKey="value" position="right" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}

function StatusCard({ icon, label, value, detail, danger = false }: { icon: React.ReactNode; label: string; value: number; detail: string; danger?: boolean }) {
  return (
    <article className={`rounded-lg border px-3 py-2 shadow-none ${danger ? "border-rose-200 bg-rose-50/70" : "border-border bg-muted/20"}`}>
      <div className={`mb-1 flex items-center gap-1.5 text-[9px] font-extrabold uppercase ${danger ? "text-rose-700" : "text-muted-foreground"}`}>
        <span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>{label}
      </div>
      <strong className="block text-lg font-black leading-none text-pine-dark">{value}</strong>
      <span className="mt-1 block text-[10px] font-semibold text-muted-foreground">{detail}</span>
    </article>
  );
}

function normalizeStatus(value: string | null | undefined): "confirmed" | "inHouse" | "completed" | "cancelled" | "noShow" {
  const status = String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[\s_-]+/g, "");
  if (status.includes("cancel")) return "cancelled";
  if (status.includes("noshow") || status.includes("naocompareceu") || status.includes("naocomparecimento")) return "noShow";
  if (status.includes("finaliz") || status.includes("checkout") || status.includes("conclu")) return "completed";
  if (status.includes("hosped") || status.includes("ocupad") || status.includes("checkin")) return "inHouse";
  return "confirmed";
}

function rate(value: number, total: number) { return total > 0 ? (value / total) * 100 : 0; }
