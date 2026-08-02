import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ExecutiveBiDashboard } from "@/components/executive/ExecutiveBiDashboard";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany } from "@/lib/data";
import { fmtBRL } from "@/lib/format";

type Range = { start: string; end: string };
type Summary = { revenue: number; expenses: number; gop: number };
type TimelinePoint = {
  period: string;
  receita: number;
  despesas: number;
  gop: number;
};
type ExecutiveSignal = {
  tone: "positive" | "warning" | "critical" | "neutral";
  title: string;
  detail: string;
};

const COLORS = {
  receita: "#2563EB",
  despesas: "#E11D48",
  gop: "#059669",
};

export function ExecutiveBiDashboardReadable() {
  const rootRef = useRef<HTMLDivElement>(null);
  const company = useCurrentCompany();
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [range, setRange] = useState<Range | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    function syncRange() {
      const inputs = root.querySelectorAll<HTMLInputElement>('input[type="date"]');
      if (inputs.length < 2 || !inputs[0].value || !inputs[1].value) return;
      const next = normalizeRange(inputs[0].value, inputs[1].value);
      setRange((current) =>
        current?.start === next.start && current?.end === next.end ? current : next,
      );
    }

    function installHost() {
      const target = [...root.querySelectorAll<HTMLElement>("article")].find((article) =>
        article.querySelector("h2")?.textContent?.trim().startsWith("1."),
      );
      if (!target) return;

      let portalHost = target.querySelector<HTMLDivElement>(".executive-temporal-host");
      if (!portalHost) {
        portalHost = document.createElement("div");
        portalHost.className = "executive-temporal-host";
        target.appendChild(portalHost);
      }
      target.classList.add("executive-temporal-replaced");
      setHost(portalHost);
    }

    const observer = new MutationObserver(() => {
      installHost();
      syncRange();
    });
    observer.observe(root, { childList: true, subtree: true });
    root.addEventListener("change", syncRange, true);
    root.addEventListener("input", syncRange, true);

    const timer = window.setTimeout(() => {
      installHost();
      syncRange();
    }, 0);

    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      root.removeEventListener("change", syncRange, true);
      root.removeEventListener("input", syncRange, true);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="executive-readable-root h-full min-h-0 overflow-hidden"
      data-executive-dashboard
    >
      <ExecutiveBiDashboard />
      {host &&
        createPortal(
          <TemporalFinancialPanel companyId={company.data?.id} range={range} />,
          host,
        )}
    </div>
  );
}

function TemporalFinancialPanel({ companyId, range }: { companyId?: string; range: Range | null }) {
  const buckets = useMemo(() => (range ? buildBuckets(range) : []), [range]);
  const query = useQuery({
    queryKey: ["executive-financial-timeline", companyId, range?.start, range?.end],
    enabled: Boolean(companyId && range && buckets.length),
    staleTime: 60_000,
    queryFn: async () =>
      Promise.all(
        buckets.map(async (bucket) => {
          const { data, error } = await (supabase as any).rpc("dashboard_strategic_aggregates", {
            p_company_id: companyId,
            p_start: bucket.start,
            p_end: bucket.end,
          });
          if (error) throw error;
          const summary = (data?.summary ?? {}) as Partial<Summary>;
          return {
            period: bucket.label,
            receita: Number(summary.revenue) || 0,
            despesas: Number(summary.expenses) || 0,
            gop: Number(summary.gop) || 0,
          } satisfies TimelinePoint;
        }),
      ),
  });

  const rows = query.data ?? [];
  const first = rows[0];
  const last = rows.at(-1);
  const signal = executiveSignal(rows);
  const insight = first && last
    ? `Receita ${signedVariation(last.receita, first.receita)} · GOP ${signedVariation(last.gop, first.gop)}`
    : "Evolução do período";

  return (
    <div className="p-2.5" aria-label="Evolução financeira e leitura executiva">
      <div className="mb-1.5 flex min-h-7 items-start justify-between gap-3 border-b border-border/70 pb-1.5">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-extrabold text-pine-dark">
            1. O resultado melhorou ou piorou?
          </h2>
          <p className="mt-0.5 truncate text-[10px] font-medium text-muted-foreground">
            Compare receita, custos e lucro operacional antes de decidir.
          </p>
        </div>
        <span
          className="max-w-[45%] truncate rounded-full border border-primary/15 bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary"
          title={insight}
        >
          {insight}
        </span>
      </div>

      <div className="mb-1.5 grid grid-cols-3 gap-1.5">
        <MetricPulse label="Receita final" value={fmtBRL(last?.receita ?? 0)} variation={first && last ? variation(last.receita, first.receita) : 0} />
        <MetricPulse label="Despesas finais" value={fmtBRL(last?.despesas ?? 0)} variation={first && last ? variation(last.despesas, first.despesas) : 0} inverse />
        <MetricPulse label="GOP final" value={fmtBRL(last?.gop ?? 0)} variation={first && last ? variation(last.gop, first.gop) : 0} />
      </div>

      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-3 px-1 text-[10px] font-semibold">
          <Legend color={COLORS.receita} label="Receita" />
          <Legend color={COLORS.despesas} label="Despesas" />
          <Legend color={COLORS.gop} label="GOP" />
        </div>
        <SignalBadge signal={signal} />
      </div>

      {query.isLoading ? (
        <div className="grid h-[150px] place-items-center text-sm text-muted-foreground">
          Carregando evolução temporal…
        </div>
      ) : query.error ? (
        <div className="grid h-[150px] place-items-center text-sm text-destructive">
          Não foi possível carregar a evolução temporal.
        </div>
      ) : (
        <div className="h-[150px] min-h-0 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ left: 4, right: 18, top: 8, bottom: 2 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="period" tick={{ fontSize: 9, fontWeight: 600 }} minTickGap={18} />
              <YAxis width={64} tick={{ fontSize: 8, fontWeight: 600 }} tickFormatter={compactCurrency} />
              <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
              <Tooltip labelStyle={{ fontWeight: 700 }} formatter={(value: number) => fmtBRL(value)} />
              <Line type="monotone" dataKey="receita" name="Receita" stroke={COLORS.receita} strokeWidth={3} dot={{ r: 2.5 }} activeDot={{ r: 5 }} />
              <Line type="monotone" dataKey="despesas" name="Despesas" stroke={COLORS.despesas} strokeWidth={3} dot={{ r: 2.5 }} activeDot={{ r: 5 }} />
              <Line type="monotone" dataKey="gop" name="GOP" stroke={COLORS.gop} strokeWidth={3} strokeDasharray="7 4" dot={{ r: 2.5 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function MetricPulse({ label, value, variation: delta, inverse = false }: { label: string; value: string; variation: number; inverse?: boolean }) {
  const favorable = inverse ? delta <= 0 : delta >= 0;
  return (
    <div className="min-w-0 rounded-md border border-border/70 bg-muted/20 px-2 py-1.5">
      <p className="truncate text-[8px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-0.5 flex items-baseline justify-between gap-1">
        <strong className="truncate text-[11px] text-pine-dark">{value}</strong>
        <span className={favorable ? "text-[9px] font-extrabold text-emerald-700" : "text-[9px] font-extrabold text-rose-700"}>
          {delta >= 0 ? "+" : ""}{delta.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

function SignalBadge({ signal }: { signal: ExecutiveSignal }) {
  const classes = {
    positive: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    critical: "border-rose-200 bg-rose-50 text-rose-800",
    neutral: "border-slate-200 bg-slate-50 text-slate-700",
  }[signal.tone];
  return (
    <span className={`max-w-[48%] truncate rounded-md border px-2 py-1 text-[9px] font-extrabold ${classes}`} title={`${signal.title}: ${signal.detail}`}>
      {signal.title}: {signal.detail}
    </span>
  );
}

function executiveSignal(rows: TimelinePoint[]): ExecutiveSignal {
  const first = rows[0];
  const last = rows.at(-1);
  if (!first || !last) return { tone: "neutral", title: "Leitura", detail: "Aguardando dados" };

  const revenueDelta = variation(last.receita, first.receita);
  const expenseDelta = variation(last.despesas, first.despesas);
  const gopDelta = variation(last.gop, first.gop);

  if (last.gop < 0) {
    return { tone: "critical", title: "Atenção", detail: "GOP negativo; revisar custos e tarifas" };
  }
  if (expenseDelta > revenueDelta + 5) {
    return { tone: "warning", title: "Risco", detail: "Custos crescem mais que a receita" };
  }
  if (revenueDelta > 0 && gopDelta > revenueDelta) {
    return { tone: "positive", title: "Oportunidade", detail: "Receita e eficiência melhoraram" };
  }
  if (revenueDelta < 0) {
    return { tone: "warning", title: "Prioridade", detail: "Recuperar demanda e diária média" };
  }
  return { tone: "neutral", title: "Estável", detail: "Acompanhar canais, tarifas e custos" };
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />{label}</span>;
}

function buildBuckets(range: Range) {
  const totalDays = differenceInDays(range.start, range.end) + 1;
  if (totalDays <= 14) return dailyBuckets(range);
  if (totalDays <= 90) return weeklyBuckets(range);
  return monthlyBuckets(range);
}

function dailyBuckets(range: Range) {
  const rows = [];
  let cursor = parseDate(range.start);
  const end = parseDate(range.end);
  while (cursor <= end) {
    const value = iso(cursor);
    rows.push({ start: value, end: value, label: formatDay(value) });
    cursor = shiftDays(cursor, 1);
  }
  return rows;
}

function weeklyBuckets(range: Range) {
  const rows = [];
  let cursor = parseDate(range.start);
  const finalDate = parseDate(range.end);
  while (cursor <= finalDate) {
    const bucketEnd = minDate(shiftDays(cursor, 6), finalDate);
    rows.push({ start: iso(cursor), end: iso(bucketEnd), label: `${formatDay(iso(cursor))}–${formatDay(iso(bucketEnd))}` });
    cursor = shiftDays(bucketEnd, 1);
  }
  return rows;
}

function monthlyBuckets(range: Range) {
  const rows = [];
  let cursor = startOfMonth(parseDate(range.start));
  const finalDate = parseDate(range.end);
  while (cursor <= finalDate) {
    const bucketStart = maxDate(cursor, parseDate(range.start));
    const bucketEnd = minDate(endOfMonth(cursor), finalDate);
    rows.push({
      start: iso(bucketStart),
      end: iso(bucketEnd),
      label: new Intl.DateTimeFormat("pt-BR", { month: "short", year: range.start.slice(0, 4) === range.end.slice(0, 4) ? undefined : "2-digit", timeZone: "UTC" }).format(cursor).replace(".", ""),
    });
    cursor = startOfMonth(shiftMonths(cursor, 1));
  }
  return rows;
}

function normalizeRange(start: string, end: string): Range { return start <= end ? { start, end } : { start: end, end: start }; }
function parseDate(value: string) { return new Date(`${value}T00:00:00Z`); }
function iso(date: Date) { return date.toISOString().slice(0, 10); }
function differenceInDays(start: string, end: string) { return Math.max(0, Math.round((parseDate(end).getTime() - parseDate(start).getTime()) / 86_400_000)); }
function shiftDays(date: Date, days: number) { const next = new Date(date); next.setUTCDate(next.getUTCDate() + days); return next; }
function shiftMonths(date: Date, months: number) { const next = new Date(date); next.setUTCMonth(next.getUTCMonth() + months); return next; }
function startOfMonth(date: Date) { return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)); }
function endOfMonth(date: Date) { return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)); }
function minDate(a: Date, b: Date) { return a <= b ? a : b; }
function maxDate(a: Date, b: Date) { return a >= b ? a : b; }
function formatDay(value: string) { return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(parseDate(value)); }
function variation(current: number, previous: number) { if (previous === 0) return current === 0 ? 0 : 100; return ((current - previous) / Math.abs(previous)) * 100; }
function signedVariation(current: number, previous: number) { const value = variation(current, previous); return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`; }
function compactCurrency(value: number) { return new Intl.NumberFormat("pt-BR", { notation: "compact", style: "currency", currency: "BRL", maximumFractionDigits: 1 }).format(value); }
