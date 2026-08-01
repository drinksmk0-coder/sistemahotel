import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
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
type TimelinePoint = { period: string; receita: number; despesas: number; gop: number };

const COLORS = { receita: "#2563EB", despesas: "#E11D48", gop: "#059669" };

export function ExecutiveBiDashboardSafe() {
  const rootRef = useRef<HTMLDivElement>(null);
  const company = useCurrentCompany();
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [range, setRange] = useState<Range | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let stopped = false;
    let attempts = 0;

    const syncRange = () => {
      const inputs = root.querySelectorAll<HTMLInputElement>('input[type="date"]');
      if (inputs.length < 2) return;
      const start = inputs[0]?.value;
      const end = inputs[1]?.value;
      if (!isIsoDate(start) || !isIsoDate(end)) return;
      const next = normalizeRange(start, end);
      setRange((current) =>
        current?.start === next.start && current?.end === next.end ? current : next,
      );
    };

    const installOnce = () => {
      if (stopped) return;
      const target = [...root.querySelectorAll<HTMLElement>("article")].find((article) =>
        article.querySelector("h2")?.textContent?.trim().startsWith("1."),
      );
      if (!target) {
        attempts += 1;
        if (attempts < 50) window.setTimeout(installOnce, 100);
        return;
      }

      let portalHost = target.querySelector<HTMLDivElement>(".executive-temporal-host");
      if (!portalHost) {
        portalHost = document.createElement("div");
        portalHost.className = "executive-temporal-host";
        target.appendChild(portalHost);
      }
      target.classList.add("executive-temporal-replaced");
      setHost(portalHost);
      syncRange();
    };

    const onDateChange = (event: Event) => {
      if (event.target instanceof HTMLInputElement && event.target.type === "date") {
        window.setTimeout(syncRange, 0);
      }
    };

    root.addEventListener("change", onDateChange, true);
    root.addEventListener("input", onDateChange, true);
    installOnce();

    return () => {
      stopped = true;
      root.removeEventListener("change", onDateChange, true);
      root.removeEventListener("input", onDateChange, true);
    };
  }, []);

  return (
    <div ref={rootRef} className="executive-readable-root h-full min-h-0 overflow-y-auto">
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
    queryKey: ["executive-financial-timeline-safe", companyId, range?.start, range?.end],
    enabled: Boolean(companyId && range && buckets.length),
    staleTime: 60_000,
    retry: 1,
    queryFn: async () =>
      Promise.all(
        buckets.map(async (bucket) => {
          const { data, error } = await (supabase as any).rpc("dashboard_strategic_aggregates", {
            p_company_id: companyId,
            p_start: bucket.start,
            p_end: bucket.end,
          });
          if (error) throw error;
          const summary = data?.summary ?? {};
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
  const insight = first && last
    ? `Receita ${signedVariation(last.receita, first.receita)} · GOP ${signedVariation(last.gop, first.gop)}`
    : "Evolução do período";

  return (
    <div className="p-2.5">
      <div className="mb-2 flex min-h-7 items-start justify-between gap-3">
        <h2 className="text-sm font-extrabold text-foreground">1. O resultado melhorou ou piorou?</h2>
        <span className="max-w-[48%] truncate rounded-full bg-primary/8 px-2.5 py-1 text-[10px] font-semibold text-primary" title={insight}>
          {insight}
        </span>
      </div>
      <div className="mb-2 flex flex-wrap gap-4 px-1 text-[11px] font-semibold">
        <Legend color={COLORS.receita} label="Receita" />
        <Legend color={COLORS.despesas} label="Despesas" />
        <Legend color={COLORS.gop} label="GOP" />
      </div>
      {query.isLoading ? (
        <div className="grid h-[210px] place-items-center text-sm text-muted-foreground">Carregando evolução temporal…</div>
      ) : query.error ? (
        <div className="grid h-[210px] place-items-center text-sm text-destructive">Não foi possível carregar a evolução temporal.</div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={rows} margin={{ left: 4, right: 18, top: 12, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="period" tick={{ fontSize: 11, fontWeight: 600 }} minTickGap={18} />
            <YAxis width={72} tick={{ fontSize: 10, fontWeight: 600 }} tickFormatter={compactCurrency} />
            <Tooltip labelStyle={{ fontWeight: 700 }} formatter={(value: number) => fmtBRL(value)} />
            <Line type="monotone" dataKey="receita" name="Receita" stroke={COLORS.receita} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            <Line type="monotone" dataKey="despesas" name="Despesas" stroke={COLORS.despesas} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            <Line type="monotone" dataKey="gop" name="GOP" stroke={COLORS.gop} strokeWidth={3} strokeDasharray="7 4" dot={{ r: 4 }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
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
  const rows: { start: string; end: string; label: string }[] = [];
  let cursor = parseDate(range.start);
  const end = parseDate(range.end);
  while (cursor <= end && rows.length < 366) {
    const value = iso(cursor);
    rows.push({ start: value, end: value, label: formatDay(value) });
    cursor = shiftDays(cursor, 1);
  }
  return rows;
}

function weeklyBuckets(range: Range) {
  const rows: { start: string; end: string; label: string }[] = [];
  let cursor = parseDate(range.start);
  const finalDate = parseDate(range.end);
  while (cursor <= finalDate && rows.length < 60) {
    const bucketEnd = minDate(shiftDays(cursor, 6), finalDate);
    rows.push({ start: iso(cursor), end: iso(bucketEnd), label: `${formatDay(iso(cursor))}–${formatDay(iso(bucketEnd))}` });
    cursor = shiftDays(bucketEnd, 1);
  }
  return rows;
}

function monthlyBuckets(range: Range) {
  const rows: { start: string; end: string; label: string }[] = [];
  let cursor = startOfMonth(parseDate(range.start));
  const finalDate = parseDate(range.end);
  while (cursor <= finalDate && rows.length < 120) {
    const bucketStart = maxDate(cursor, parseDate(range.start));
    const bucketEnd = minDate(endOfMonth(cursor), finalDate);
    rows.push({
      start: iso(bucketStart),
      end: iso(bucketEnd),
      label: new Intl.DateTimeFormat("pt-BR", {
        month: "short",
        year: range.start.slice(0, 4) === range.end.slice(0, 4) ? undefined : "2-digit",
        timeZone: "UTC",
      }).format(cursor).replace(".", ""),
    });
    cursor = startOfMonth(shiftMonths(cursor, 1));
  }
  return rows;
}

function isIsoDate(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parseDate(value).getTime()));
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
