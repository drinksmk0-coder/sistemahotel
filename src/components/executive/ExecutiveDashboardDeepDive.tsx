import { useQuery } from "@tanstack/react-query";
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
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany } from "@/lib/data";
import { fmtBRL } from "@/lib/format";

type Range = { start: string; end: string };
type Metric = "cancelled" | "noShow" | "all";
type ReservationRow = {
  status: string | null;
  checkin: string;
  checkout: string;
  cliente_id: string | null;
  motivo_estadia: string | null;
  valor_total: number | string | null;
};
type SaleRow = { data: string; total: number | string | null };
type ExpenseRow = { data: string; valor: number | string | null };
type ClientRow = {
  id: string;
  sexo: string | null;
  estado_civil: string | null;
  data_nascimento: string | null;
};
type EnrichedReservation = ReservationRow & {
  gender: string;
  civil: string;
  motive: string;
  age: string;
};
type DailyFinanceRow = { date: string; revenue: number; expenses: number };
type ProfileRow = { name: string; value: number; count: number; total: number };

export function ExecutiveDashboardDeepDive() {
  const company = useCurrentCompany();
  const [range, setRange] = useState<Range | null>(null);
  const [revenueHost, setRevenueHost] = useState<HTMLElement | null>(null);
  const [profileHost, setProfileHost] = useState<HTMLElement | null>(null);
  const [metric, setMetric] = useState<Metric>("cancelled");
  const [gender, setGender] = useState("todos");
  const [civil, setCivil] = useState("todos");
  const [motive, setMotive] = useState("todos");
  const [age, setAge] = useState("todos");

  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-executive-dashboard]");
    if (!root) return;

    let attempts = 0;
    let revenueCard: HTMLElement | null = null;
    let revenuePortal: HTMLDivElement | null = null;
    let profilePortal: HTMLDivElement | null = null;
    let originalTitle = "2. Receitas por dia (R$)";

    const syncRange = () => {
      const fields = root.querySelectorAll<HTMLInputElement>('input[type="date"]');
      if (fields.length < 2 || !fields[0].value || !fields[1].value) return;
      const start = fields[0].value <= fields[1].value ? fields[0].value : fields[1].value;
      const end = fields[0].value <= fields[1].value ? fields[1].value : fields[0].value;
      setRange((current) => current?.start === start && current?.end === end ? current : { start, end });
    };

    const install = () => {
      attempts += 1;
      const headings = Array.from(root.querySelectorAll<HTMLElement>("article h2"));
      const revenueTitle = headings.find((heading) => heading.textContent?.startsWith("2. Receitas por dia"));
      const dashboard = root.firstElementChild as HTMLElement | null;
      const footer = dashboard?.querySelector<HTMLElement>("footer");
      if (!revenueTitle || !dashboard || !footer) return false;

      revenueCard = revenueTitle.closest("article");
      if (!revenueCard) return false;
      originalTitle = revenueTitle.textContent ?? originalTitle;
      revenueTitle.textContent = "2. Receitas e despesas por dia (R$)";

      revenuePortal = revenueCard.querySelector<HTMLDivElement>("[data-daily-finance-host]");
      if (!revenuePortal) {
        revenuePortal = document.createElement("div");
        revenuePortal.dataset.dailyFinanceHost = "true";
        revenueCard.appendChild(revenuePortal);
      }
      Array.from(revenueCard.children).forEach((child) => {
        if (child !== revenueTitle && child !== revenuePortal) {
          (child as HTMLElement).dataset.deepDiveHidden = "true";
          (child as HTMLElement).style.display = "none";
        }
      });

      profilePortal = dashboard.querySelector<HTMLDivElement>("[data-profile-analysis-host]");
      if (!profilePortal) {
        profilePortal = document.createElement("div");
        profilePortal.dataset.profileAnalysisHost = "true";
        dashboard.insertBefore(profilePortal, footer);
      }

      setRevenueHost(revenuePortal);
      setProfileHost(profilePortal);
      syncRange();
      return true;
    };

    const timer = window.setInterval(() => {
      if (install() || attempts >= 60) window.clearInterval(timer);
    }, 100);
    root.addEventListener("input", syncRange, true);
    root.addEventListener("change", syncRange, true);

    return () => {
      window.clearInterval(timer);
      root.removeEventListener("input", syncRange, true);
      root.removeEventListener("change", syncRange, true);
      revenueCard?.querySelectorAll<HTMLElement>("[data-deep-dive-hidden]").forEach((element) => {
        element.style.removeProperty("display");
        delete element.dataset.deepDiveHidden;
      });
      const heading = revenueCard?.querySelector<HTMLElement>("h2");
      if (heading) heading.textContent = originalTitle;
      revenuePortal?.remove();
      profilePortal?.remove();
    };
  }, []);

  const query = useQuery({
    queryKey: ["executive-profile-cross-analysis", company.data?.id, range?.start, range?.end],
    enabled: Boolean(company.data?.id && range),
    staleTime: 60_000,
    queryFn: async () => {
      const [reservationsResult, salesResult, expensesResult, clientsResult] = await Promise.all([
        (supabase as any)
          .from("reservations")
          .select("status,checkin,checkout,cliente_id,motivo_estadia,valor_total")
          .eq("company_id", company.data!.id)
          .lte("checkin", range!.end)
          .gte("checkout", range!.start),
        (supabase as any)
          .from("sales")
          .select("data,total")
          .eq("company_id", company.data!.id)
          .gte("data", range!.start)
          .lte("data", range!.end),
        (supabase as any)
          .from("expenses")
          .select("data,valor")
          .eq("company_id", company.data!.id)
          .gte("data", range!.start)
          .lte("data", range!.end),
        (supabase as any)
          .from("clients")
          .select("id,sexo,estado_civil,data_nascimento")
          .eq("company_id", company.data!.id),
      ]);
      if (reservationsResult.error) throw reservationsResult.error;
      if (salesResult.error) throw salesResult.error;
      if (expensesResult.error) throw expensesResult.error;
      if (clientsResult.error) throw clientsResult.error;
      return {
        reservations: (reservationsResult.data ?? []) as ReservationRow[],
        sales: (salesResult.data ?? []) as SaleRow[],
        expenses: (expensesResult.data ?? []) as ExpenseRow[],
        clients: (clientsResult.data ?? []) as ClientRow[],
      };
    },
  });

  const enriched = useMemo<EnrichedReservation[]>(() => {
    if (!query.data) return [];
    const clients = new Map(query.data.clients.map((client) => [client.id, client]));
    return query.data.reservations.map((reservation) => {
      const client = reservation.cliente_id ? clients.get(reservation.cliente_id) : undefined;
      return {
        ...reservation,
        gender: label(client?.sexo, "Não informado"),
        civil: label(client?.estado_civil, "Não informado"),
        motive: label(reservation.motivo_estadia, "Não informado"),
        age: ageBand(client?.data_nascimento),
      };
    });
  }, [query.data]);

  const dailyFinance = useMemo<DailyFinanceRow[]>(() => {
    if (!range || !query.data) return [];
    const rows: DailyFinanceRow[] = [];
    let cursor = parseDate(range.start);
    const end = parseDate(range.end);
    while (cursor <= end) {
      const day = iso(cursor);
      const lodging = query.data.reservations
        .filter((row) => row.checkin === day && !isCancelled(row.status) && !isNoShow(row.status))
        .reduce((sum, row) => sum + number(row.valor_total), 0);
      const extras = query.data.sales
        .filter((row) => row.data === day)
        .reduce((sum, row) => sum + number(row.total), 0);
      const expenses = query.data.expenses
        .filter((row) => row.data === day)
        .reduce((sum, row) => sum + number(row.valor), 0);
      rows.push({ date: formatDay(day), revenue: lodging + extras, expenses });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return rows;
  }, [query.data, range]);

  const filtered = useMemo(() => enriched.filter((row) => {
    if (gender !== "todos" && row.gender !== gender) return false;
    if (civil !== "todos" && row.civil !== civil) return false;
    if (motive !== "todos" && row.motive !== motive) return false;
    if (age !== "todos" && row.age !== age) return false;
    return true;
  }), [age, civil, enriched, gender, motive]);

  const profile = useMemo(() => ({
    gender: buildProfileRows(filtered, "gender", metric),
    civil: buildProfileRows(filtered, "civil", metric),
    motive: buildProfileRows(filtered, "motive", metric),
    age: buildProfileRows(filtered, "age", metric),
  }), [filtered, metric]);

  const optionRows = useMemo(() => ({
    gender: unique(enriched.map((row) => row.gender)),
    civil: unique(enriched.map((row) => row.civil)),
    motive: unique(enriched.map((row) => row.motive)),
    age: unique(enriched.map((row) => row.age)),
  }), [enriched]);

  const selectedCount = filtered.filter((row) => matchesMetric(row, metric)).length;

  return (
    <>
      {revenueHost && createPortal(<DailyFinanceChart rows={dailyFinance} />, revenueHost)}
      {profileHost && createPortal(
        <section className="executive-profile-analysis rounded-2xl border border-border bg-card p-3 shadow-sm" aria-label="Perfil de cancelamentos e no-show">
          <div className="mb-3 flex flex-col gap-2 border-b border-border pb-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-sm font-black text-primary">8. Quem mais cancela ou não comparece?</h2>
              <p className="text-[10px] font-semibold text-muted-foreground">Cruze sexo, estado civil, motivo e idade. As barras mostram taxa e quantidade na lateral.</p>
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
              <Filter label="Analisar" value={metric} onChange={(value) => setMetric(value as Metric)} options={[
                ["cancelled", "Cancelamentos"],
                ["noShow", "No-show"],
                ["all", "Todas as reservas"],
              ]} />
              <Filter label="Sexo" value={gender} onChange={setGender} options={withAll(optionRows.gender)} />
              <Filter label="Estado civil" value={civil} onChange={setCivil} options={withAll(optionRows.civil)} />
              <Filter label="Motivo" value={motive} onChange={setMotive} options={withAll(optionRows.motive)} />
              <Filter label="Idade" value={age} onChange={setAge} options={withAll(optionRows.age)} />
            </div>
          </div>

          <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] font-bold text-muted-foreground">
            <span className="rounded-full bg-muted px-2 py-1">Base filtrada: {filtered.length} reservas</span>
            <span className="rounded-full bg-primary/10 px-2 py-1 text-primary">Resultado: {selectedCount}</span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ProfileBars title="Sexo" rows={profile.gender} metric={metric} />
            <ProfileBars title="Estado civil" rows={profile.civil} metric={metric} />
            <ProfileBars title="Motivo da hospedagem" rows={profile.motive} metric={metric} />
            <ProfileBars title="Faixa etária" rows={profile.age} metric={metric} />
          </div>
        </section>,
        profileHost,
      )}
    </>
  );
}

function DailyFinanceChart({ rows }: { rows: DailyFinanceRow[] }) {
  if (!rows.some((row) => row.revenue > 0 || row.expenses > 0)) return <Empty />;
  return (
    <div className="h-52">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 5" vertical={false} />
          <XAxis dataKey="date" minTickGap={20} />
          <YAxis width={48} tickFormatter={compactCurrency} />
          <Tooltip formatter={(value: number, name: string) => [fmtBRL(value), name]} />
          <Legend wrapperStyle={{ fontSize: 10, fontWeight: 700 }} />
          <Bar dataKey="revenue" name="Receitas" fill="var(--primary)" radius={[5, 5, 0, 0]} maxBarSize={18} />
          <Bar dataKey="expenses" name="Despesas" fill="var(--destructive, #ef4444)" radius={[5, 5, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ProfileBars({ title, rows, metric }: { title: string; rows: ProfileRow[]; metric: Metric }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <article className="rounded-xl border border-border bg-background/45 p-2.5">
      <h3 className="mb-2 text-[11px] font-black text-foreground">{title}</h3>
      {rows.length ? <div className="space-y-2">
        {rows.slice(0, 6).map((row) => (
          <div key={row.name} className="grid grid-cols-[minmax(5rem,1fr)_1.5fr_auto] items-center gap-2 text-[10px]">
            <span className="truncate font-semibold" title={row.name}>{row.name}</span>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(3, (row.value / max) * 100)}%` }} />
            </div>
            <strong className="min-w-[4.3rem] text-right tabular-nums">{metric === "all" ? `${row.count}` : `${row.value.toFixed(1)}% · ${row.count}`}</strong>
          </div>
        ))}
      </div> : <p className="py-6 text-center text-[10px] font-semibold text-muted-foreground">Sem dados no cruzamento atual.</p>}
    </article>
  );
}

function Filter({ label: filterLabel, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: [string, string][] }) {
  return (
    <label className="min-w-0 text-[8px] font-extrabold uppercase text-muted-foreground">
      <span className="mb-0.5 block">{filterLabel}</span>
      <select className="field h-8 min-w-0 w-full px-2 text-[10px] font-semibold" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
    </label>
  );
}

function buildProfileRows(rows: EnrichedReservation[], field: "gender" | "civil" | "motive" | "age", metric: Metric): ProfileRow[] {
  const groups = new Map<string, EnrichedReservation[]>();
  rows.forEach((row) => groups.set(row[field], [...(groups.get(row[field]) ?? []), row]));
  return [...groups.entries()].map(([name, group]) => {
    const selected = group.filter((row) => matchesMetric(row, metric)).length;
    return {
      name,
      count: selected,
      total: group.length,
      value: metric === "all" ? selected : group.length > 0 ? (selected / group.length) * 100 : 0,
    };
  }).filter((row) => row.count > 0 || metric === "all").sort((a, b) => b.value - a.value || b.count - a.count);
}

function matchesMetric(row: ReservationRow, metric: Metric) {
  if (metric === "all") return true;
  if (metric === "cancelled") return isCancelled(row.status);
  return isNoShow(row.status);
}
function withAll(values: string[]): [string, string][] { return [["todos", "Todos"], ...values.map((value) => [value, value] as [string, string])]; }
function unique(values: string[]) { return [...new Set(values)].sort((a, b) => a.localeCompare(b, "pt-BR")); }
function label(value: string | null | undefined, fallback: string) { const clean = String(value ?? "").trim(); return clean ? clean.replaceAll("_", " ").replace(/(^|\s)\S/g, (letter) => letter.toUpperCase()) : fallback; }
function ageBand(value: string | null | undefined) { if (!value) return "Não informado"; const birth = new Date(`${value}T00:00:00Z`); if (Number.isNaN(birth.getTime())) return "Não informado"; const age = Math.floor((Date.now() - birth.getTime()) / 31_557_600_000); if (age < 18) return "Até 17"; if (age <= 24) return "18–24"; if (age <= 34) return "25–34"; if (age <= 44) return "35–44"; if (age <= 54) return "45–54"; if (age <= 64) return "55–64"; return "65+"; }
function normalize(value: string | null | undefined) { return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[\s_-]+/g, ""); }
function isCancelled(value: string | null | undefined) { return normalize(value).includes("cancel"); }
function isNoShow(value: string | null | undefined) { const text = normalize(value); return text.includes("noshow") || text.includes("naocompareceu") || text.includes("naocomparecimento"); }
function number(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function parseDate(value: string) { return new Date(`${value}T00:00:00Z`); }
function iso(date: Date) { return date.toISOString().slice(0, 10); }
function formatDay(value: string) { return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(parseDate(value)); }
function compactCurrency(value: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 }).format(value); }
function Empty() { return <div className="grid h-48 place-items-center text-xs font-semibold text-muted-foreground">Sem dados suficientes no período.</div>; }
