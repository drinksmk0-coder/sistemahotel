import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
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
  valor: number | string | null;
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
  revenue: number;
  expenses: number;
  gop: number;
};

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
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [range, setRange] = useState<Range | null>(null);
  const [filters, setFilters] = useState<Filters>(ALL_FILTERS);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-executive-dashboard]");
    if (!root) return;

    let attempts = 0;
    let card: HTMLElement | null = null;
    let portalHost: HTMLDivElement | null = null;
    const hiddenElements = new Set<HTMLElement>();

    const syncRange = () => {
      const fields = root.querySelectorAll<HTMLInputElement>('header input[type="date"]');
      if (fields.length < 2 || !fields[0].value || !fields[1].value) return;
      const start = fields[0].value <= fields[1].value ? fields[0].value : fields[1].value;
      const end = fields[0].value <= fields[1].value ? fields[1].value : fields[0].value;
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
        .find((heading) => heading.textContent?.trim() === "2. Receitas por dia (R$)");
      card = title?.closest("article") ?? null;
      if (!card || !title) return false;

      portalHost = card.querySelector<HTMLDivElement>("[data-revenue-expense-gop-host]");
      if (!portalHost) {
        portalHost = document.createElement("div");
        portalHost.dataset.revenueExpenseGopHost = "true";
        portalHost.className = "min-w-0";
        card.appendChild(portalHost);
      }

      Array.from(card.children).forEach((child) => {
        if (child === title || child === portalHost || !(child instanceof HTMLElement)) return;
        child.style.display = "none";
        child.dataset.revenueExpenseHidden = "true";
        hiddenElements.add(child);
      });

      setHost(portalHost);
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
        if (!portalHost?.isConnected) install();
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
      portalHost?.remove();
    };
  }, []);

  const query = useQuery({
    queryKey: ["executive-revenue-expense-gop", company.data?.id, range?.start, range?.end],
    enabled: Boolean(company.data?.id && range),
    staleTime: 60_000,
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
          .select("data,valor")
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

  const rows = useMemo(() => {
    if (!query.data || !range) return [];
    return buildChartRows(query.data, range, filters);
  }, [filters, query.data, range]);

  const hasUnallocatedFilters = filters.payment !== "all"
    || filters.state !== "all"
    || filters.room !== "all"
    || filters.channel !== "all"
    || filters.category !== "all";

  if (!host) return null;

  return createPortal(
    <div className="min-w-0">
      {query.isLoading && <ChartState text="Carregando receitas, despesas e GOP…" />}
      {query.error && <ChartState text="Não foi possível carregar as despesas do período." danger />}
      {!query.isLoading && !query.error && <RevenueExpenseGopChart rows={rows} />}
      {hasUnallocatedFilters && !query.isLoading && !query.error && (
        <p className="mt-1 text-[9px] font-medium text-muted-foreground">
          Despesas gerais não possuem vínculo com pagamento, estado, quarto, canal ou categoria; esses filtros segmentam a receita, enquanto os custos permanecem no período selecionado.
        </p>
      )}
    </div>,
    host,
  );
}

function RevenueExpenseGopChart({ rows }: { rows: ChartRow[] }) {
  if (!rows.some((row) => row.revenue !== 0 || row.expenses !== 0)) {
    return <ChartState text="Sem receitas ou despesas no período selecionado." />;
  }

  return (
    <div className="h-52 min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ left: 0, right: 8, top: 12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 5" vertical={false} />
          <XAxis dataKey="label" minTickGap={18} />
          <YAxis width={52} tickFormatter={compactCurrency} />
          <Tooltip
            formatter={(value: number, name: string) => [fmtBRL(value), name]}
            labelFormatter={(label) => `Período: ${label}`}
          />
          <Legend wrapperStyle={{ fontSize: 10, fontWeight: 700 }} />
          <ReferenceLine y={0} stroke="var(--border)" />
          <Bar dataKey="revenue" name="Receitas" fill="#2563eb" radius={[5, 5, 0, 0]} maxBarSize={18} />
          <Bar dataKey="expenses" name="Despesas gerais" fill="#ef4444" radius={[5, 5, 0, 0]} maxBarSize={18} />
          <Line
            type="monotone"
            dataKey="gop"
            name="GOP"
            stroke="#16a34a"
            strokeWidth={3}
            dot={{ r: 3, fill: "#16a34a", strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function buildChartRows(data: {
  reservations: ReservationRow[];
  sales: SaleRow[];
  expenses: ExpenseRow[];
  rooms: RoomRow[];
  clients: ClientRow[];
}, range: Range, filters: Filters): ChartRow[] {
  const roomMap = new Map(data.rooms.map((room) => [room.numero, room]));
  const clientMap = new Map(data.clients.map((client) => [client.id, client]));
  const raw = new Map<string, { revenue: number; expenses: number }>();

  data.reservations
    .filter((row) => !isCancelled(row.status) && !isNoShow(row.status) && !isMaintenance(row.status))
    .filter((row) => matchesReservation(row, filters, roomMap, clientMap))
    .forEach((row) => addDaily(raw, row.checkin, "revenue", number(row.valor_total)));

  data.sales
    .filter((row) => matchesSale(row, filters))
    .forEach((row) => addDaily(raw, row.data, "revenue", number(row.total)));

  data.expenses
    .filter((row) => filters.weekday === "all" || weekday(row.data) === filters.weekday)
    .forEach((row) => addDaily(raw, row.data, "expenses", number(row.valor)));

  const span = daysBetween(range.start, range.end) + 1;
  const grouped = new Map<string, ChartRow>();
  let cursor = parseDate(range.start);
  const end = parseDate(range.end);

  while (cursor <= end) {
    const date = iso(cursor);
    const values = raw.get(date) ?? { revenue: 0, expenses: 0 };
    const bucket = chartBucket(date, span);
    const current = grouped.get(bucket.key) ?? {
      key: bucket.key,
      label: bucket.label,
      revenue: 0,
      expenses: 0,
      gop: 0,
    };
    current.revenue += values.revenue;
    current.expenses += values.expenses;
    grouped.set(bucket.key, current);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return [...grouped.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((row) => ({ ...row, gop: row.revenue - row.expenses }));
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

function addDaily(map: Map<string, { revenue: number; expenses: number }>, date: string, field: "revenue" | "expenses", value: number) {
  const current = map.get(date) ?? { revenue: 0, expenses: 0 };
  current[field] += value;
  map.set(date, current);
}

function sameFilters(a: Filters, b: Filters) {
  return a.payment === b.payment
    && a.state === b.state
    && a.room === b.room
    && a.weekday === b.weekday
    && a.channel === b.channel
    && a.category === b.category;
}

function normalizePayment(value: string | null) {
  const text = normalize(value);
  if (text.includes("pix")) return "Pix";
  if (text.includes("dinheiro")) return "Dinheiro";
  if (text.includes("debito")) return "Cartão de Débito";
  if (text.includes("credito")) return "Cartão de Crédito";
  if (text.includes("transfer")) return "Transferência";
  return value?.trim() || "Outros";
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

function ChartState({ text, danger = false }: { text: string; danger?: boolean }) {
  return (
    <div className={`grid h-52 place-items-center rounded-xl text-xs font-semibold ${danger ? "bg-red-50 text-red-700" : "text-muted-foreground"}`}>
      {text}
    </div>
  );
}
