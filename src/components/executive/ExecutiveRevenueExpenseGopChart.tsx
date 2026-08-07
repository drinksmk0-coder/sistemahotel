import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany } from "@/lib/data";
import { fmtBRL } from "@/lib/format";

type Range = { start: string; end: string };
type Filters = {
  payment: string;
  state: string;
  room: string;
  weekday: string;
  channel: string;
  category: string;
};
type ReservationRow = {
  status: string | null;
  checkin: string;
  quarto: number | null;
  valor_total: number | string | null;
  pagamento: string | null;
  canal: string | null;
  cliente_id: string | null;
};
type SaleRow = {
  data: string;
  total: number | string | null;
  pagamento: string | null;
};
type ExpenseRow = {
  data: string;
  categoria: string | null;
  descricao: string | null;
  valor: number | string | null;
  pagamento: string | null;
  fornecedor: string | null;
};
type RoomRow = {
  numero: number;
  configuracao: string | null;
};
type ClientRow = {
  id: string;
  estado: string | null;
};
type ChartRow = {
  key: string;
  label: string;
  lodgingRevenue: number;
  productRevenue: number;
  expenses: number;
  gop: number;
};
type NamedValue = { name: string; value: number; count: number };
type FinancialSummary = {
  lodgingRevenue: number;
  productRevenue: number;
  expenses: number;
  gop: number;
  expenseCategories: NamedValue[];
  expensePayments: NamedValue[];
};

const BLUE = "#2563eb";
const TEAL = "#14b8a6";
const RED = "#ef4444";
const GREEN = "#16a34a";
const EXPENSE_COLORS = [BLUE, TEAL, "#7c3aed", "#f59e0b", "#64748b", "#ec4899"];
const ALL_FILTERS: Filters = {
  payment: "all",
  state: "all",
  room: "all",
  weekday: "all",
  channel: "all",
  category: "all",
};

export function ExecutiveRevenueExpenseGopChart() {
  const company = useCurrentCompany();
  const [chartHost, setChartHost] = useState<HTMLElement | null>(null);
  const [insightsHost, setInsightsHost] = useState<HTMLElement | null>(null);
  const [range, setRange] = useState<Range | null>(null);
  const [filters, setFilters] = useState<Filters>(ALL_FILTERS);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-executive-dashboard]");
    if (!root) return;

    let attempts = 0;
    let card: HTMLElement | null = null;
    let chartPortalHost: HTMLDivElement | null = null;
    let financialPortalHost: HTMLDivElement | null = null;
    let titleElement: HTMLElement | null = null;
    let originalTitle = "2. Receitas por dia (R$)";
    const hiddenElements = new Set<HTMLElement>();

    const syncRange = () => {
      const fields = root.querySelectorAll<HTMLInputElement>('header input[type="date"]');
      if (fields.length < 2 || !fields[0].value || !fields[1].value) return;
      const start = fields[0].value <= fields[1].value ? fields[0].value : fields[1].value;
      const end = fields[0].value <= fields[1].value ? fields[1].value : fields[0].value;
      if (titleElement) titleElement.textContent = `2. Hospedagem, produtos, despesas e GOP por ${rangeGranularity(start, end)}`;
      setRange((current) => current?.start === start && current?.end === end ? current : { start, end });
    };

    const syncFilters = () => {
      const filterTitle = Array.from(root.querySelectorAll<HTMLElement>("section h2"))
        .find((heading) => heading.textContent?.trim() === "Filtros cruzados");
      const panel = filterTitle?.closest("section");
      if (!panel) return;

      const next = { ...ALL_FILTERS };
      panel.querySelectorAll<HTMLLabelElement>("label").forEach((label) => {
        const select = label.querySelector<HTMLSelectElement>("select");
        if (!select) return;
        const text = label.textContent?.trim().toLowerCase() ?? "";
        if (text.startsWith("forma de pagamento")) next.payment = select.value;
        else if (text.startsWith("estado")) next.state = select.value;
        else if (text.startsWith("quarto")) next.room = select.value;
        else if (text.startsWith("dia da semana")) next.weekday = select.value;
        else if (text.startsWith("canal")) next.channel = select.value;
        else if (text.startsWith("categoria do quarto")) next.category = select.value;
      });
      setFilters((current) => sameFilters(current, next) ? current : next);
    };

    const install = () => {
      attempts += 1;
      const title = Array.from(root.querySelectorAll<HTMLElement>("article h2"))
        .find((heading) => heading.textContent?.trim().startsWith("2. Receita"));
      card = title?.closest("article") ?? null;
      const dashboard = root.firstElementChild as HTMLElement | null;
      const footer = dashboard?.querySelector<HTMLElement>("footer");
      if (!card || !title || !dashboard || !footer) return false;

      originalTitle = title.textContent ?? originalTitle;
      titleElement = title;

      chartPortalHost = card.querySelector<HTMLDivElement>("[data-revenue-expense-gop-host]");
      if (!chartPortalHost) {
        chartPortalHost = document.createElement("div");
        chartPortalHost.dataset.revenueExpenseGopHost = "true";
        chartPortalHost.className = "min-w-0";
        card.appendChild(chartPortalHost);
      }

      Array.from(card.children).forEach((child) => {
        if (child === title || child === chartPortalHost || !(child instanceof HTMLElement)) return;
        child.style.display = "none";
        child.dataset.revenueExpenseHidden = "true";
        hiddenElements.add(child);
      });

      financialPortalHost = dashboard.querySelector<HTMLDivElement>("[data-expense-insights-host]");
      if (!financialPortalHost) {
        financialPortalHost = document.createElement("div");
        financialPortalHost.dataset.expenseInsightsHost = "true";
        dashboard.insertBefore(financialPortalHost, footer);
      }

      setChartHost(chartPortalHost);
      setInsightsHost(financialPortalHost);
      syncRange();
      syncFilters();
      return true;
    };

    const timer = window.setInterval(() => {
      if (install() || attempts >= 60) window.clearInterval(timer);
    }, 100);

    const syncAfterInteraction = () => {
      window.setTimeout(() => {
        syncRange();
        syncFilters();
        if (!chartPortalHost?.isConnected || !financialPortalHost?.isConnected) install();
      }, 0);
    };

    root.addEventListener("input", syncAfterInteraction, true);
    root.addEventListener("change", syncAfterInteraction, true);
    root.addEventListener("click", syncAfterInteraction, true);

    return () => {
      window.clearInterval(timer);
      root.removeEventListener("input", syncAfterInteraction, true);
      root.removeEventListener("change", syncAfterInteraction, true);
      root.removeEventListener("click", syncAfterInteraction, true);
      hiddenElements.forEach((element) => {
        element.style.removeProperty("display");
        delete element.dataset.revenueExpenseHidden;
      });
      const title = card?.querySelector<HTMLElement>("h2");
      if (title) title.textContent = originalTitle;
      chartPortalHost?.remove();
      financialPortalHost?.remove();
    };
  }, []);

  const query = useQuery({
    queryKey: ["executive-revenue-expense-gop", company.data?.id, range?.start, range?.end],
    enabled: Boolean(company.data?.id && range),
    staleTime: 60_000,
    placeholderData: (previousData) => previousData,
    queryFn: async () => {
      const [reservationsResult, salesResult, expensesResult, roomsResult, clientsResult] = await Promise.all([
        (supabase as any)
          .from("reservations")
          .select("status,checkin,quarto,valor_total,pagamento,canal,cliente_id")
          .eq("company_id", company.data!.id)
          .gte("checkin", range!.start)
          .lte("checkin", range!.end),
        (supabase as any)
          .from("sales")
          .select("data,total,pagamento")
          .eq("company_id", company.data!.id)
          .gte("data", range!.start)
          .lte("data", range!.end),
        (supabase as any)
          .from("expenses")
          .select("data,categoria,descricao,valor,pagamento,fornecedor")
          .eq("company_id", company.data!.id)
          .gte("data", range!.start)
          .lte("data", range!.end),
        (supabase as any)
          .from("rooms")
          .select("numero,configuracao")
          .eq("company_id", company.data!.id),
        (supabase as any)
          .from("clients")
          .select("id,estado")
          .eq("company_id", company.data!.id),
      ]);

      if (reservationsResult.error) throw reservationsResult.error;
      if (salesResult.error) throw salesResult.error;
      if (expensesResult.error) throw expensesResult.error;
      if (roomsResult.error) throw roomsResult.error;
      if (clientsResult.error) throw clientsResult.error;

      return {
        reservations: (reservationsResult.data ?? []) as ReservationRow[],
        sales: (salesResult.data ?? []) as SaleRow[],
        expenses: (expensesResult.data ?? []) as ExpenseRow[],
        rooms: (roomsResult.data ?? []) as RoomRow[],
        clients: (clientsResult.data ?? []) as ClientRow[],
      };
    },
  });

  const analysis = useMemo(() => {
    if (!query.data || !range) return { rows: [], summary: emptySummary() };
    return buildAnalysis(query.data, range, filters);
  }, [filters, query.data, range]);

  const hasUnallocatedFilters = filters.state !== "all"
    || filters.room !== "all"
    || filters.channel !== "all"
    || filters.category !== "all";

  return (
    <>
      {chartHost && createPortal(
        <div className="min-w-0">
          {query.isLoading && <ChartState text="Carregando receitas, despesas e GOP…" />}
          {query.error && <ChartState text="Não foi possível carregar a visão financeira." danger />}
          {!query.isLoading && !query.error && <RevenueExpenseGopChart rows={analysis.rows} summary={analysis.summary} />}
        </div>,
        chartHost,
      )}

      {insightsHost && createPortal(
        <ExpenseInsights
          loading={query.isLoading}
          error={Boolean(query.error)}
          summary={analysis.summary}
          hasUnallocatedFilters={hasUnallocatedFilters}
        />,
        insightsHost,
      )}
    </>
  );
}

function RevenueExpenseGopChart({ rows, summary }: { rows: ChartRow[]; summary: FinancialSummary }) {
  if (!rows.some((row) => row.lodgingRevenue !== 0 || row.productRevenue !== 0 || row.expenses !== 0)) {
    return <ChartState text="Sem receitas ou despesas no período selecionado." />;
  }

  return (
    <div className="min-w-0">
      <div className="mb-2 grid grid-cols-2 gap-1.5 xl:grid-cols-4">
        <SummaryValue label="Hospedagem" value={summary.lodgingRevenue} tone="blue" />
        <SummaryValue label="Produtos/serviços" value={summary.productRevenue} tone="teal" />
        <SummaryValue label="Despesas" value={summary.expenses} tone="red" />
        <SummaryValue label="GOP" value={summary.gop} tone={summary.gop >= 0 ? "green" : "red"} />
      </div>
      <div data-executive-chart="detail" data-chart-points={rows.length} className="h-60 min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 5" vertical={false} />
            <XAxis dataKey="label" interval={rows.length <= 12 ? 0 : "preserveStartEnd"} minTickGap={18} tickMargin={8} />
            <YAxis width={52} tickFormatter={compactCurrency} />
            <Tooltip
              formatter={(value: number, name: string) => [fmtBRL(value), name]}
              labelFormatter={(label) => `Período: ${label}`}
            />
            <Legend wrapperStyle={{ fontSize: 9, fontWeight: 700 }} />
            <ReferenceLine y={0} stroke="var(--border)" />
            <Bar dataKey="lodgingRevenue" name="Hospedagem" fill={BLUE} radius={[5, 5, 0, 0]} maxBarSize={rows.length <= 12 ? 34 : 20} />
            <Bar dataKey="productRevenue" name="Produtos/serviços" fill={TEAL} radius={[5, 5, 0, 0]} maxBarSize={rows.length <= 12 ? 34 : 20} />
            <Bar dataKey="expenses" name="Despesas" fill={RED} radius={[5, 5, 0, 0]} maxBarSize={rows.length <= 12 ? 34 : 20} />
            <Line
              type="monotone"
              dataKey="gop"
              name="GOP"
              stroke={GREEN}
              strokeWidth={3}
              dot={{ r: 3, fill: GREEN, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function SummaryValue({ label, value, tone }: { label: string; value: number; tone: "blue" | "teal" | "red" | "green" }) {
  const tones = {
    blue: "border-blue-100 bg-blue-50/70 text-blue-700",
    teal: "border-teal-100 bg-teal-50/70 text-teal-700",
    red: "border-red-100 bg-red-50/70 text-red-700",
    green: "border-emerald-100 bg-emerald-50/70 text-emerald-700",
  };
  return (
    <div className={`rounded-lg border px-2 py-1.5 ${tones[tone]}`}>
      <span className="block text-[8px] font-extrabold uppercase tracking-wide">{label}</span>
      <strong className="block truncate text-[11px] tabular-nums" title={fmtBRL(value)}>{fmtBRL(value)}</strong>
    </div>
  );
}

function ExpenseInsights({ loading, error, summary, hasUnallocatedFilters }: {
  loading: boolean;
  error: boolean;
  summary: FinancialSummary;
  hasUnallocatedFilters: boolean;
}) {
  const isEmpty = !loading
    && !error
    && summary.expenseCategories.length === 0
    && summary.expensePayments.length === 0;

  if (isEmpty) {
    return (
      <section data-executive-empty-expenses className="rounded-2xl border border-dashed border-border bg-card px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-xs font-black text-blue-600">8–9. Análise de despesas</h2>
            <p className="text-[10px] font-medium text-muted-foreground">Nenhuma despesa cadastrada no período selecionado.</p>
          </div>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-extrabold text-emerald-700">R$ 0,00</span>
        </div>
        {hasUnallocatedFilters && (
          <p className="mt-1 text-[9px] font-medium text-muted-foreground">
            Os filtros de período, dia da semana e forma de pagamento também são aplicados às despesas.
          </p>
        )}
      </section>
    );
  }

  return (
    <section data-executive-detail-grid="expenses" className="executive-expense-insights grid grid-cols-1 gap-2 lg:grid-cols-2">
      <article data-executive-panel data-empty={!loading && !error && summary.expenseCategories.length === 0} className="min-w-0 rounded-2xl border border-border bg-card p-3 shadow-sm">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-black text-blue-600">8. Ranking de despesas por categoria</h2>
            <p className="text-[10px] font-medium text-muted-foreground">Mostra onde o hotel está concentrando seus custos.</p>
          </div>
          <strong className="whitespace-nowrap text-sm text-red-600">{fmtBRL(summary.expenses)}</strong>
        </div>
        {loading && <CompactState text="Carregando despesas…" />}
        {error && <CompactState text="Não foi possível carregar as despesas." danger />}
        {!loading && !error && <ExpenseRanking rows={summary.expenseCategories} />}
      </article>

      <article data-executive-panel data-empty={!loading && !error && summary.expensePayments.length === 0} className="min-w-0 rounded-2xl border border-border bg-card p-3 shadow-sm">
        <div className="mb-3">
          <h2 className="text-sm font-black text-blue-600">9. Como as despesas foram pagas</h2>
          <p className="text-[10px] font-medium text-muted-foreground">Compara valor e quantidade de pagamentos por modalidade.</p>
        </div>
        {loading && <CompactState text="Carregando formas de pagamento…" />}
        {error && <CompactState text="Não foi possível carregar as formas de pagamento." danger />}
        {!loading && !error && <ExpensePaymentDonut rows={summary.expensePayments} />}
      </article>

      {hasUnallocatedFilters && (
        <p className="col-span-full px-2 text-[9px] font-medium text-muted-foreground">
          Estado, quarto, canal e categoria segmentam receitas. Despesas não possuem esses vínculos no cadastro; nelas são aplicados período, dia da semana e forma de pagamento.
        </p>
      )}
    </section>
  );
}

function ExpenseRanking({ rows }: { rows: NamedValue[] }) {
  if (!rows.length) return <CompactState text="Nenhuma despesa cadastrada no período selecionado." />;
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div className="flex min-h-48 flex-col justify-evenly gap-3">
      {rows.slice(0, 7).map((row) => (
        <div key={row.name} className="grid grid-cols-[minmax(7rem,1fr)_2fr_auto] items-center gap-2 text-xs">
          <span className="truncate font-semibold" title={row.name}>{row.name}</span>
          <div className="h-3.5 overflow-hidden rounded-full bg-red-50">
            <div className="h-full rounded-full bg-red-500" style={{ width: `${Math.max(3, (row.value / max) * 100)}%` }} />
          </div>
          <span className="min-w-[6.5rem] text-right tabular-nums"><strong>{fmtBRL(row.value)}</strong> · {row.count}x</span>
        </div>
      ))}
    </div>
  );
}

function ExpensePaymentDonut({ rows }: { rows: NamedValue[] }) {
  if (!rows.length) return <CompactState text="Nenhuma forma de pagamento registrada no período." />;
  const data = compactRows(rows);
  const total = data.reduce((sum, row) => sum + row.value, 0);
  return (
    <div data-executive-donut-layout="true" className="grid min-h-48 grid-cols-1 items-center gap-3 sm:grid-cols-[minmax(10rem,0.85fr)_minmax(0,1.15fr)]">
      <div data-executive-donut-chart="true" className="h-48 min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius="48%"
              outerRadius="82%"
              paddingAngle={data.length === 1 ? 0 : 2}
              stroke={data.length === 1 ? "none" : "var(--card)"}
              strokeWidth={data.length === 1 ? 0 : 2}
              isAnimationActive={false}
            >
              {data.map((row, index) => <Cell key={row.name} fill={EXPENSE_COLORS[index % EXPENSE_COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(value: number) => fmtBRL(value)} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div data-executive-donut-legend="true" className="space-y-2 text-xs">
        {data.map((row, index) => (
          <div key={row.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: EXPENSE_COLORS[index % EXPENSE_COLORS.length] }} />
              <span className="truncate" title={row.name}>{row.name}</span>
            </span>
            <strong className="whitespace-nowrap text-right tabular-nums">{((row.value / total) * 100).toFixed(1)}% · {fmtBRL(row.value)} · {row.count}x</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildAnalysis(data: {
  reservations: ReservationRow[];
  sales: SaleRow[];
  expenses: ExpenseRow[];
  rooms: RoomRow[];
  clients: ClientRow[];
}, range: Range, filters: Filters): { rows: ChartRow[]; summary: FinancialSummary } {
  const roomMap = new Map(data.rooms.map((room) => [room.numero, room]));
  const clientMap = new Map(data.clients.map((client) => [client.id, client]));
  const raw = new Map<string, { lodgingRevenue: number; productRevenue: number; expenses: number }>();

  data.reservations
    .filter((row) => !isCancelled(row.status) && !isNoShow(row.status) && !isMaintenance(row.status))
    .filter((row) => matchesReservation(row, filters, roomMap, clientMap))
    .forEach((row) => addDaily(raw, row.checkin, "lodgingRevenue", number(row.valor_total)));

  data.sales
    .filter((row) => matchesSale(row, filters))
    .forEach((row) => addDaily(raw, row.data, "productRevenue", number(row.total)));

  const filteredExpenses = data.expenses.filter((row) => {
    if (filters.weekday !== "all" && weekday(row.data) !== filters.weekday) return false;
    if (filters.payment !== "all" && normalizePayment(row.pagamento) !== filters.payment) return false;
    return true;
  });

  filteredExpenses.forEach((row) => addDaily(raw, row.data, "expenses", number(row.valor)));

  const span = daysBetween(range.start, range.end) + 1;
  const grouped = new Map<string, ChartRow>();
  const cursor = parseDate(range.start);
  const end = parseDate(range.end);

  while (cursor <= end) {
    const date = iso(cursor);
    const values = raw.get(date) ?? { lodgingRevenue: 0, productRevenue: 0, expenses: 0 };
    const bucket = chartBucket(date, span);
    const current = grouped.get(bucket.key) ?? {
      key: bucket.key,
      label: bucket.label,
      lodgingRevenue: 0,
      productRevenue: 0,
      expenses: 0,
      gop: 0,
    };
    current.lodgingRevenue += values.lodgingRevenue;
    current.productRevenue += values.productRevenue;
    current.expenses += values.expenses;
    grouped.set(bucket.key, current);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const rows = [...grouped.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((row) => ({ ...row, gop: row.lodgingRevenue + row.productRevenue - row.expenses }));

  const lodgingRevenue = rows.reduce((sum, row) => sum + row.lodgingRevenue, 0);
  const productRevenue = rows.reduce((sum, row) => sum + row.productRevenue, 0);
  const expenses = rows.reduce((sum, row) => sum + row.expenses, 0);

  return {
    rows,
    summary: {
      lodgingRevenue,
      productRevenue,
      expenses,
      gop: lodgingRevenue + productRevenue - expenses,
      expenseCategories: aggregateExpenses(filteredExpenses, (row) => cleanLabel(row.categoria, "Não informado")),
      expensePayments: aggregateExpenses(filteredExpenses, (row) => normalizePayment(row.pagamento)),
    },
  };
}

function aggregateExpenses(rows: ExpenseRow[], getName: (row: ExpenseRow) => string): NamedValue[] {
  const map = new Map<string, NamedValue>();
  rows.forEach((row) => {
    const name = getName(row);
    const current = map.get(name) ?? { name, value: 0, count: 0 };
    current.value += number(row.valor);
    current.count += 1;
    map.set(name, current);
  });
  return [...map.values()].filter((row) => row.value > 0).sort((a, b) => b.value - a.value);
}

function matchesReservation(
  row: ReservationRow,
  filters: Filters,
  roomMap: Map<number, RoomRow>,
  clientMap: Map<string, ClientRow>,
) {
  if (filters.payment !== "all" && normalizePayment(row.pagamento) !== filters.payment) return false;
  if (filters.state !== "all" && stateCode(clientMap.get(row.cliente_id ?? "")?.estado ?? "") !== filters.state) return false;
  if (filters.room !== "all" && String(row.quarto ?? "") !== filters.room) return false;
  if (filters.weekday !== "all" && weekday(row.checkin) !== filters.weekday) return false;
  if (filters.channel !== "all" && normalizeChannel(row.canal) !== filters.channel) return false;
  if (filters.category !== "all" && (roomMap.get(row.quarto ?? -1)?.configuracao || "Não informado") !== filters.category) return false;
  return true;
}

function matchesSale(row: SaleRow, filters: Filters) {
  if (filters.payment !== "all" && normalizePayment(row.pagamento) !== filters.payment) return false;
  if (filters.weekday !== "all" && weekday(row.data) !== filters.weekday) return false;
  if (filters.state !== "all" || filters.room !== "all" || filters.channel !== "all" || filters.category !== "all") return false;
  return true;
}

function chartBucket(date: string, span: number) {
  const parsed = parseDate(date);
  if (span <= 62) return { key: date, label: formatDay(date) };
  if (span <= 180) {
    const mondayOffset = (parsed.getUTCDay() + 6) % 7;
    parsed.setUTCDate(parsed.getUTCDate() - mondayOffset);
    return { key: iso(parsed), label: `Sem. ${formatDay(iso(parsed))}` };
  }
  const key = `${date.slice(0, 7)}-01`;
  return {
    key,
    label: new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" })
      .format(parseDate(key))
      .replace(" de ", "/"),
  };
}

function addDaily(
  map: Map<string, { lodgingRevenue: number; productRevenue: number; expenses: number }>,
  date: string,
  field: "lodgingRevenue" | "productRevenue" | "expenses",
  value: number,
) {
  const current = map.get(date) ?? { lodgingRevenue: 0, productRevenue: 0, expenses: 0 };
  current[field] += value;
  map.set(date, current);
}

function compactRows(rows: NamedValue[]) {
  if (rows.length <= 6) return rows;
  const top = rows.slice(0, 5);
  const rest = rows.slice(5).reduce((acc, row) => ({
    name: "Outros",
    value: acc.value + row.value,
    count: acc.count + row.count,
  }), { name: "Outros", value: 0, count: 0 });
  return [...top, rest];
}

function emptySummary(): FinancialSummary {
  return {
    lodgingRevenue: 0,
    productRevenue: 0,
    expenses: 0,
    gop: 0,
    expenseCategories: [],
    expensePayments: [],
  };
}

function sameFilters(a: Filters, b: Filters) {
  return a.payment === b.payment
    && a.state === b.state
    && a.room === b.room
    && a.weekday === b.weekday
    && a.channel === b.channel
    && a.category === b.category;
}

function cleanLabel(value: string | null | undefined, fallback: string) {
  const clean = String(value ?? "").trim();
  return clean || fallback;
}

function normalizePayment(value: string | null) {
  const text = normalize(value);
  if (text.includes("pix")) return "Pix";
  if (text.includes("dinheiro")) return "Dinheiro";
  if (text.includes("debito")) return "Cartão de Débito";
  if (text.includes("credito")) return "Cartão de Crédito";
  if (text.includes("transfer")) return "Transferência";
  if (text.includes("boleto")) return "Boleto";
  return value?.trim() || "Não informado";
}

function normalizeChannel(value: string | null) {
  const text = normalize(value);
  if (text.includes("booking")) return "Booking.com";
  if (text.includes("google")) return "Google";
  if (text.includes("instagram")) return "Instagram";
  if (text.includes("whats") || text.includes("direto") || text.includes("balcao")) return "Direto (Site/WhatsApp)";
  return value?.trim() || "Outros";
}

function isCancelled(value: string | null) { return normalize(value).includes("cancel"); }
function isNoShow(value: string | null) {
  const text = normalize(value).replace(/[\s_-]+/g, "");
  return text.includes("noshow") || text.includes("naocompareceu") || text.includes("naocomparecimento");
}
function isMaintenance(value: string | null) { return normalize(value).includes("manut"); }
function normalize(value: string | null | undefined) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
function number(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function weekday(date: string) { return String(parseDate(date).getUTCDay()); }
function daysBetween(start: string, end: string) {
  return Math.max(0, Math.round((parseDate(end).getTime() - parseDate(start).getTime()) / 86_400_000));
}
function parseDate(value: string) { return new Date(`${value}T00:00:00Z`); }
function iso(date: Date) { return date.toISOString().slice(0, 10); }
function formatDay(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(parseDate(value));
}
function compactCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}
function stateCode(value: string) {
  const clean = normalize(value).toUpperCase();
  const aliases: Record<string, string> = {
    ACRE: "AC", ALAGOAS: "AL", AMAPA: "AP", AMAZONAS: "AM", BAHIA: "BA", CEARA: "CE",
    "DISTRITO FEDERAL": "DF", "ESPIRITO SANTO": "ES", GOIAS: "GO", MARANHAO: "MA",
    "MATO GROSSO": "MT", "MATO GROSSO DO SUL": "MS", "MINAS GERAIS": "MG", PARA: "PA",
    PARAIBA: "PB", PARANA: "PR", PERNAMBUCO: "PE", PIAUI: "PI", "RIO DE JANEIRO": "RJ",
    "RIO GRANDE DO NORTE": "RN", "RIO GRANDE DO SUL": "RS", RONDONIA: "RO", RORAIMA: "RR",
    "SANTA CATARINA": "SC", "SAO PAULO": "SP", SERGIPE: "SE", TOCANTINS: "TO",
  };
  return aliases[clean] ?? (clean.length === 2 ? clean : clean.toLowerCase().replace("br-", "").toUpperCase());
}

function rangeGranularity(start: string, end: string) {
  const dayCount = Math.round((parseDate(end).getTime() - parseDate(start).getTime()) / 86_400_000) + 1;
  if (dayCount > 120) return "mês";
  if (dayCount > 45) return "semana";
  return "dia";
}

function ChartState({ text, danger = false }: { text: string; danger?: boolean }) {
  return (
    <div className={`grid h-52 place-items-center rounded-xl text-xs font-semibold ${danger ? "bg-red-50 text-red-700" : "text-muted-foreground"}`}>
      {text}
    </div>
  );
}

function CompactState({ text, danger = false }: { text: string; danger?: boolean }) {
  return (
    <div data-executive-empty className={`grid min-h-48 place-items-center rounded-xl px-4 text-center text-xs font-semibold ${danger ? "bg-red-50 text-red-700" : "text-muted-foreground"}`}>
      {text}
    </div>
  );
}
