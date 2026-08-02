import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
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

type FunnelRow = {
  label: string;
  value: number;
  rate: number;
  tone: "primary" | "positive" | "warning" | "danger";
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
    queryKey: ["reservation-status-funnel", company.data?.id, range?.start, range?.end],
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

  if (!range) return null;
  const status = query.data ?? { total: 0, confirmed: 0, inHouse: 0, completed: 0, cancelled: 0, noShow: 0 };
  const valid = Math.max(0, status.total - status.cancelled - status.noShow);
  const funnel = useMemo<FunnelRow[]>(() => [
    { label: "Reservas criadas", value: status.total, rate: 100, tone: "primary" },
    { label: "Confirmadas", value: status.confirmed, rate: rate(status.confirmed, status.total), tone: "primary" },
    { label: "Check-in / hospedadas", value: status.inHouse, rate: rate(status.inHouse, status.total), tone: "positive" },
    { label: "Check-out / finalizadas", value: status.completed, rate: rate(status.completed, valid), tone: "positive" },
    { label: "Canceladas", value: status.cancelled, rate: rate(status.cancelled, status.total), tone: "danger" },
    { label: "No-show", value: status.noShow, rate: rate(status.noShow, status.total), tone: "warning" },
  ], [status, valid]);
  const cancellationRate = rate(status.cancelled, status.total);
  const noShowRate = rate(status.noShow, status.total);
  const maxValue = Math.max(1, ...funnel.map((row) => row.value));

  return (
    <section className="mb-2 rounded-xl border border-border bg-card p-3 shadow-sm" aria-label="Funil operacional das reservas">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2 border-b border-border/70 pb-2">
        <div>
          <p className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-primary">Funil de reservas</p>
          <h2 className="text-sm font-black text-pine-dark">Da reserva criada ao check-out</h2>
          <p className="text-[10px] text-muted-foreground">Mostra conversão, perdas por cancelamento e não comparecimento.</p>
        </div>
        <div className="flex gap-1.5 text-[10px] font-extrabold">
          <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-rose-700">Cancelamento {cancellationRate.toFixed(1)}%</span>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700">No-show {noShowRate.toFixed(1)}%</span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-2" role="img" aria-label="Etapas do funil de reservas">
          {funnel.map((row, index) => {
            const width = Math.max(24, (row.value / maxValue) * 100 - index * 2.5);
            const tone = {
              primary: "bg-primary text-primary-foreground",
              positive: "bg-emerald-600 text-white",
              warning: "bg-amber-500 text-amber-950",
              danger: "bg-rose-600 text-white",
            }[row.tone];
            return (
              <div key={row.label} className="flex justify-center">
                <div className={`flex min-h-9 items-center justify-between rounded-md px-3 text-xs font-bold shadow-sm ${tone}`} style={{ width: `${width}%` }}>
                  <span className="truncate">{row.label}</span>
                  <strong className="ml-3 shrink-0">{row.value} · {row.rate.toFixed(1)}%</strong>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid content-start gap-2 sm:grid-cols-3 lg:grid-cols-1">
          <Metric label="Reservas válidas" value={valid} detail={`${rate(valid, status.total).toFixed(1)}% do total`} />
          <Metric label="Conversão em check-out" value={status.completed} detail={`${rate(status.completed, valid).toFixed(1)}% das válidas`} />
          <Metric label="Perdas totais" value={status.cancelled + status.noShow} detail={`${(cancellationRate + noShowRate).toFixed(1)}% do total`} danger={cancellationRate + noShowRate > 15} />
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value, detail, danger = false }: { label: string; value: number; detail: string; danger?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${danger ? "border-rose-200 bg-rose-50" : "border-border bg-muted/25"}`}>
      <span className="block text-[9px] font-extrabold uppercase text-muted-foreground">{label}</span>
      <strong className="block text-xl font-black text-pine-dark">{value}</strong>
      <span className={`text-[10px] font-semibold ${danger ? "text-rose-700" : "text-muted-foreground"}`}>{detail}</span>
    </div>
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
