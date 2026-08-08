import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CircleDollarSign, Gauge, TrendingDown, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany } from "@/lib/data";
import { fmtBRL, todayISO } from "@/lib/format";

type Range = { start: string; end: string };
type ReservationRow = {
  status: string | null;
  checkin: string;
  checkout: string;
  valor_total: number | string | null;
};
type SaleRow = { data: string; total: number | string | null };
type ExpenseRow = {
  data: string;
  categoria: string | null;
  descricao: string | null;
  valor: number | string | null;
};
type RoomRow = { numero: number };

type FinancialKpis = {
  lodgingRevenue: number;
  ancillaryRevenue: number;
  totalRevenue: number;
  operatingExpenses: number;
  gop: number;
  gopMargin: number;
  revpar: number;
  trevpar: number;
  goppar: number;
  availableRoomNights: number;
};

const EMPTY: FinancialKpis = {
  lodgingRevenue: 0,
  ancillaryRevenue: 0,
  totalRevenue: 0,
  operatingExpenses: 0,
  gop: 0,
  gopMargin: 0,
  revpar: 0,
  trevpar: 0,
  goppar: 0,
  availableRoomNights: 0,
};

export function ExecutiveFinancialKpis() {
  const company = useCurrentCompany();
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [range, setRange] = useState<Range | null>(null);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-executive-dashboard]");
    if (!root) return;

    let attempts = 0;
    let portalHost: HTMLDivElement | null = null;

    const syncRange = () => {
      const fields = root.querySelectorAll<HTMLInputElement>('header input[type="date"]');
      if (fields.length < 2 || !fields[0].value || !fields[1].value) return;
      const start = fields[0].value <= fields[1].value ? fields[0].value : fields[1].value;
      const end = fields[0].value <= fields[1].value ? fields[1].value : fields[0].value;
      setRange((current) => current?.start === start && current?.end === end ? current : { start, end });
    };

    const install = () => {
      attempts += 1;
      const kpiGrid = root.querySelector<HTMLElement>("[data-executive-kpi-grid]");
      if (!kpiGrid) return false;

      const existing = root.querySelector<HTMLDivElement>("[data-executive-financial-kpis-host]");
      if (existing) {
        portalHost = existing;
      } else {
        portalHost = document.createElement("div");
        portalHost.dataset.executiveFinancialKpisHost = "true";
        kpiGrid.insertAdjacentElement("afterend", portalHost);
      }
      setHost(portalHost);
      syncRange();
      return true;
    };

    const timer = window.setInterval(() => {
      if (install() || attempts >= 60) window.clearInterval(timer);
    }, 100);

    const onRangeChange = () => window.setTimeout(syncRange, 0);
    root.addEventListener("input", onRangeChange, true);
    root.addEventListener("change", onRangeChange, true);

    return () => {
      window.clearInterval(timer);
      root.removeEventListener("input", onRangeChange, true);
      root.removeEventListener("change", onRangeChange, true);
      portalHost?.remove();
    };
  }, []);

  const effectiveRange = range ?? { start: `${todayISO().slice(0, 7)}-01`, end: todayISO() };
  const query = useQuery({
    queryKey: ["executive-financial-kpis", company.data?.id, effectiveRange.start, effectiveRange.end],
    enabled: Boolean(company.data?.id && range),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const [reservationsResult, salesResult, expensesResult, roomsResult] = await Promise.all([
        (supabase as any)
          .from("reservations")
          .select("status,checkin,checkout,valor_total")
          .eq("company_id", company.data!.id)
          .lte("checkin", effectiveRange.end)
          .gte("checkout", effectiveRange.start),
        (supabase as any)
          .from("sales")
          .select("data,total")
          .eq("company_id", company.data!.id)
          .gte("data", effectiveRange.start)
          .lte("data", effectiveRange.end),
        (supabase as any)
          .from("expenses")
          .select("data,categoria,descricao,valor")
          .eq("company_id", company.data!.id)
          .gte("data", effectiveRange.start)
          .lte("data", effectiveRange.end),
        (supabase as any)
          .from("rooms")
          .select("numero")
          .eq("company_id", company.data!.id)
          .lt("numero", 900),
      ]);

      if (reservationsResult.error) throw reservationsResult.error;
      if (salesResult.error) throw salesResult.error;
      if (expensesResult.error) throw expensesResult.error;
      if (roomsResult.error) throw roomsResult.error;

      return {
        reservations: (reservationsResult.data ?? []) as ReservationRow[],
        sales: (salesResult.data ?? []) as SaleRow[],
        expenses: (expensesResult.data ?? []) as ExpenseRow[],
        rooms: (roomsResult.data ?? []) as RoomRow[],
      };
    },
  });

  const metrics = useMemo(() => {
    if (!query.data) return EMPTY;
    return calculateFinancialKpis(query.data, effectiveRange);
  }, [effectiveRange.end, effectiveRange.start, query.data]);

  if (!host) return null;

  return createPortal(
    <section data-executive-financial-kpis className="mt-2 grid grid-cols-1 gap-2 xl:grid-cols-2">
      <div className="rounded-2xl border border-border bg-card p-2.5 shadow-sm">
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <div>
            <h2 className="text-[11px] font-black uppercase tracking-wide text-foreground">Resultado operacional</h2>
            <p className="text-[9px] font-medium text-muted-foreground">Período selecionado · retirada do proprietário não entra como despesa operacional</p>
          </div>
          <CircleDollarSign className="h-4 w-4 shrink-0 text-emerald-600" />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <MetricCard label="Despesas operacionais" value={fmtBRL(metrics.operatingExpenses)} icon={<TrendingDown className="h-4 w-4" />} tone="red" />
          <MetricCard label="Lucro operacional (GOP)" value={fmtBRL(metrics.gop)} icon={<TrendingUp className="h-4 w-4" />} tone={metrics.gop >= 0 ? "green" : "red"} />
          <MetricCard label="Margem GOP" value={`${metrics.gopMargin.toFixed(1)}%`} icon={<Gauge className="h-4 w-4" />} tone={metrics.gopMargin >= 0 ? "green" : "red"} />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-2.5 shadow-sm">
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <div>
            <h2 className="text-[11px] font-black uppercase tracking-wide text-foreground">Rentabilidade por UH disponível</h2>
            <p className="text-[9px] font-medium text-muted-foreground">RevPAR → TRevPAR → GOPPAR: hospedagem → receita total → resultado operacional</p>
          </div>
          <Gauge className="h-4 w-4 shrink-0 text-violet-600" />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <MetricCard label="RevPAR" value={fmtBRL(metrics.revpar)} hint="Receita de hospedagem / UHs disponíveis" tone="purple" />
          <MetricCard label="TRevPAR" value={fmtBRL(metrics.trevpar)} hint="Receita total / UHs disponíveis" tone="blue" />
          <MetricCard label="GOPPAR" value={fmtBRL(metrics.goppar)} hint="GOP / UHs disponíveis" tone={metrics.goppar >= 0 ? "green" : "red"} />
        </div>
      </div>
    </section>,
    host,
  );
}

function MetricCard({ label, value, hint, icon, tone }: {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
  tone: "green" | "red" | "purple" | "blue";
}) {
  const tones = {
    green: "border-emerald-200 bg-emerald-50/55 text-emerald-700",
    red: "border-red-200 bg-red-50/55 text-red-700",
    purple: "border-violet-200 bg-violet-50/55 text-violet-700",
    blue: "border-blue-200 bg-blue-50/55 text-blue-700",
  };
  return (
    <div className={`min-w-0 rounded-xl border px-3 py-2 ${tones[tone]}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-black uppercase tracking-wide">{label}</span>
        {icon}
      </div>
      <strong className="mt-1 block truncate text-lg font-black tabular-nums" title={value}>{value}</strong>
      {hint && <span className="mt-0.5 block text-[8px] font-semibold opacity-75">{hint}</span>}
    </div>
  );
}

function calculateFinancialKpis(data: {
  reservations: ReservationRow[];
  sales: SaleRow[];
  expenses: ExpenseRow[];
  rooms: RoomRow[];
}, range: Range): FinancialKpis {
  const lodgingRevenue = data.reservations
    .filter((row) => isOperatingReservation(row.status))
    .reduce((sum, row) => sum + allocatedReservationRevenue(row, range), 0);
  const ancillaryRevenue = data.sales.reduce((sum, row) => sum + number(row.total), 0);
  const operatingExpenses = data.expenses
    .filter(isOperatingExpense)
    .reduce((sum, row) => sum + number(row.valor), 0);
  const totalRevenue = lodgingRevenue + ancillaryRevenue;
  const gop = totalRevenue - operatingExpenses;
  const availableRoomNights = data.rooms.length * daysInclusive(range.start, range.end);
  return {
    lodgingRevenue,
    ancillaryRevenue,
    totalRevenue,
    operatingExpenses,
    gop,
    gopMargin: totalRevenue > 0 ? (gop / totalRevenue) * 100 : 0,
    revpar: availableRoomNights > 0 ? lodgingRevenue / availableRoomNights : 0,
    trevpar: availableRoomNights > 0 ? totalRevenue / availableRoomNights : 0,
    goppar: availableRoomNights > 0 ? gop / availableRoomNights : 0,
    availableRoomNights,
  };
}

function allocatedReservationRevenue(row: ReservationRow, range: Range) {
  const totalNights = Math.max(1, daysBetween(row.checkin, row.checkout));
  const overlapStart = row.checkin > range.start ? row.checkin : range.start;
  const overlapEnd = row.checkout < addOneDay(range.end) ? row.checkout : addOneDay(range.end);
  const overlapNights = Math.max(0, daysBetween(overlapStart, overlapEnd));
  return number(row.valor_total) * Math.min(1, overlapNights / totalNights);
}

function isOperatingReservation(status: string | null) {
  const text = normalize(status).replace(/[\s_-]+/g, "");
  return !text.includes("cancel")
    && !text.includes("noshow")
    && !text.includes("naocompareceu")
    && !text.includes("naocomparecimento")
    && !text.includes("manut");
}

function isOperatingExpense(row: ExpenseRow) {
  const text = normalize(`${row.categoria ?? ""} ${row.descricao ?? ""}`);
  return !text.includes("retirada") && !text.includes("movimentacao financeira");
}

function normalize(value: string | null | undefined) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
function parseDate(value: string) { return new Date(`${value}T00:00:00Z`); }
function daysBetween(start: string, end: string) {
  return Math.max(0, Math.round((parseDate(end).getTime() - parseDate(start).getTime()) / 86_400_000));
}
function daysInclusive(start: string, end: string) { return daysBetween(start, end) + 1; }
function addOneDay(value: string) {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
