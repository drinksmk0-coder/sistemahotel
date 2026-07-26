import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Expand, Minimize2 } from "lucide-react";
import { type DashboardPeriod } from "@/lib/dashboard-utils";

export function DashboardHeader({
  title,
  subtitle,
  period,
  onPeriodChange,
}: {
  title: string;
  subtitle: string;
  period: DashboardPeriod;
  onPeriodChange: (period: DashboardPeriod) => void;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-2">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h1 className="text-lg font-extrabold tracking-tight text-pine-dark">{title}</h1>
          <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-primary">
            HotelAI Command · V6
          </p>
        </div>
        <p className="truncate text-[11px] text-muted-foreground" title={subtitle}>
          {subtitle}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <PeriodSelector value={period} onChange={onPeriodChange} />
        <DashboardTvButton />
      </div>
    </header>
  );
}

export function DashboardTvButton() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const sync = () => {
      const enabled =
        Boolean(document.fullscreenElement) ||
        document.documentElement.dataset.dashboardMode === "tv";
      setActive(enabled);
      document.documentElement.dataset.dashboardMode = enabled ? "tv" : "normal";
    };
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  async function toggle() {
    if (!active) {
      document.documentElement.dataset.dashboardMode = "tv";
      setActive(true);
      await document.documentElement.requestFullscreen?.().catch(() => undefined);
      return;
    }
    document.documentElement.dataset.dashboardMode = "normal";
    setActive(false);
    await document.exitFullscreen?.().catch(() => undefined);
  }

  return (
    <button
      type="button"
      className="btn-ghost flex h-9 items-center gap-1.5 whitespace-nowrap px-2.5 text-[10px] font-bold"
      onClick={toggle}
      title={active ? "Sair do modo TV" : "Exibir este painel em modo TV"}
    >
      {active ? <Minimize2 className="h-3.5 w-3.5" /> : <Expand className="h-3.5 w-3.5" />}
      <span className="hidden sm:inline">{active ? "Sair da TV" : "Modo TV"}</span>
    </button>
  );
}

export function PeriodSelector({
  value,
  onChange,
}: {
  value: DashboardPeriod;
  onChange: (period: DashboardPeriod) => void;
}) {
  return (
    <div
      className="flex rounded-lg border border-border bg-muted p-1"
      aria-label="Período do dashboard"
    >
      {(["dia", "mes", "ano"] as const).map((period) => (
        <button
          key={period}
          type="button"
          onClick={() => onChange(period)}
          className={`rounded px-3 py-1.5 text-xs font-bold capitalize transition ${
            value === period
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-card"
          }`}
        >
          {period === "mes" ? "Mês" : period}
        </button>
      ))}
    </div>
  );
}

export function AlertBanner({
  title,
  children,
  tone = "brick",
}: {
  title: string;
  children: React.ReactNode;
  tone?: "brick" | "brass";
}) {
  const classes =
    tone === "brick"
      ? "border-brick/45 bg-brick-bg text-brick"
      : "border-brass/60 bg-brass/15 text-pine-dark";
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${classes}`}>
      <strong className="block">{title}</strong>
      {children}
    </div>
  );
}

export function FunnelRow({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">{children}</div>;
}

export function FunnelStage({
  label,
  value,
  hint,
  percentValue,
  tone = "pine",
}: {
  label: string;
  value: string;
  hint?: string;
  percentValue?: number;
  tone?: "pine" | "sage" | "brass" | "brick";
}) {
  const colors = {
    pine: "border-t-pine bg-pine/5",
    sage: "border-t-sage bg-sage-bg/60",
    brass: "border-t-brass bg-brass/10",
    brick: "border-t-brick bg-brick-bg/70",
  }[tone];
  const gaugeColor = {
    pine: "var(--pine)",
    sage: "var(--sage)",
    brass: "var(--brass)",
    brick: "var(--brick)",
  }[tone];
  return (
    <article
      className={`relative min-w-0 rounded-xl border border-border p-3 shadow-sm ${colors}`}
    >
      <p className="truncate text-[10px] font-bold uppercase text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <strong className="truncate font-serif text-lg text-pine-dark">{value}</strong>
        {percentValue != null && (
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[9px] font-bold text-pine-dark"
            style={{
              background: `conic-gradient(${gaugeColor} ${Math.max(0, Math.min(100, percentValue))}%, var(--border) 0)`,
              boxShadow: "inset 0 0 0 5px var(--card)",
            }}
          >
            {Math.round(percentValue)}%
          </span>
        )}
      </div>
      {hint && <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{hint}</p>}
    </article>
  );
}

export function CompactKpi({
  label,
  value,
  hint,
  previousDelta,
  yearDelta,
  lowerIsBetter = false,
}: {
  label: string;
  value: string;
  hint?: string;
  previousDelta?: number | null;
  yearDelta?: number | null;
  lowerIsBetter?: boolean;
}) {
  return (
    <article className="min-w-0 rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm">
      <p className="truncate text-[10px] font-bold uppercase text-muted-foreground">{label}</p>
      <p className="truncate font-serif text-lg font-bold text-pine-dark">{value}</p>
      {hint ? (
        <p className="mt-1 truncate text-[9px] text-muted-foreground" title={hint}>
          {hint}
        </p>
      ) : (
        <div className="mt-1 flex flex-wrap gap-x-2 text-[9px]">
          <Delta value={previousDelta} label="período" lowerIsBetter={lowerIsBetter} />
          <Delta value={yearDelta} label="ano" lowerIsBetter={lowerIsBetter} />
        </div>
      )}
    </article>
  );
}

export function DashboardTabs<T extends string>({
  value,
  onChange,
  tabs,
}: {
  value: T;
  onChange: (value: T) => void;
  tabs: { value: T; label: string }[];
}) {
  return (
    <nav
      className="flex flex-wrap gap-2 border-b border-border pb-2"
      aria-label="Seções do dashboard"
    >
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          className={`rounded-md px-3 py-1.5 text-xs font-bold ${
            value === tab.value
              ? "bg-primary text-primary-foreground shadow-sm"
              : "border border-border bg-card text-pine-dark hover:bg-muted"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

export function ChartPanel({
  title,
  subtitle,
  children,
  span = 6,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  span?: 4 | 6 | 8 | 12;
}) {
  const spanClass = {
    4: "lg:col-span-4",
    6: "lg:col-span-6",
    8: "lg:col-span-8",
    12: "lg:col-span-12",
  }[span];
  return (
    <section
      className={`chart-surface p-3 shadow-sm ${spanClass}`}
    >
      <h2 className="text-xs font-bold uppercase text-pine-dark">{title}</h2>
      {subtitle && <p className="mb-2 text-[10px] text-muted-foreground">{subtitle}</p>}
      {!subtitle && <div className="mb-2" />}
      {children}
    </section>
  );
}

export function ShortList({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string; hint?: string; highlight?: boolean }[];
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <h2 className="mb-2 text-xs font-bold uppercase text-pine-dark">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sem dados no período.</p>
      ) : (
        <ol className="space-y-1.5">
          {rows.slice(0, 5).map((row, index) => (
            <li
              key={row.label}
              className={`flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-xs ${
                row.highlight ? "bg-brass/15" : "bg-muted/60"
              }`}
            >
              <div className="min-w-0">
                <strong className="block truncate text-pine-dark">
                  {index + 1}. {row.label}
                </strong>
                {row.hint && (
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {row.hint}
                  </span>
                )}
              </div>
              <span className="shrink-0 font-bold text-pine-dark">{row.value}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Delta({
  value,
  label,
  lowerIsBetter,
}: {
  value?: number | null;
  label: string;
  lowerIsBetter: boolean;
}) {
  if (value == null || !Number.isFinite(value))
    return <span className="text-muted-foreground">sem base {label}</span>;
  const positive = value >= 0;
  const good = lowerIsBetter ? !positive : positive;
  const Icon = positive ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-0.5 ${good ? "text-sage" : "text-brick"}`}>
      <Icon className="h-2.5 w-2.5" />
      {Math.abs(value).toFixed(1)}% vs {label}
    </span>
  );
}
