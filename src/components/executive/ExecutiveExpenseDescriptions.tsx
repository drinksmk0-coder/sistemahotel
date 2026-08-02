import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany } from "@/lib/data";
import { fmtBRL } from "@/lib/format";

type Range = { start: string; end: string };
type ExpenseRow = {
  data: string;
  categoria: string | null;
  descricao: string | null;
  valor: number | string | null;
  pagamento: string | null;
};
type DescriptionRow = {
  description: string;
  category: string;
  value: number;
  count: number;
};

export function ExecutiveExpenseDescriptions() {
  const company = useCurrentCompany();
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [range, setRange] = useState<Range | null>(null);
  const [payment, setPayment] = useState("all");
  const [weekdayFilter, setWeekdayFilter] = useState("all");

  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-executive-dashboard]");
    if (!root) return;

    let attempts = 0;
    let portalHost: HTMLElement | null = null;

    const syncControls = () => {
      const dates = root.querySelectorAll<HTMLInputElement>('header input[type="date"]');
      if (dates.length >= 2 && dates[0].value && dates[1].value) {
        const start = dates[0].value <= dates[1].value ? dates[0].value : dates[1].value;
        const end = dates[0].value <= dates[1].value ? dates[1].value : dates[0].value;
        setRange((current) => current?.start === start && current?.end === end ? current : { start, end });
      }

      const filterTitle = Array.from(root.querySelectorAll<HTMLElement>("section h2"))
        .find((heading) => heading.textContent?.trim() === "Filtros cruzados");
      const panel = filterTitle?.closest("section");
      if (!panel) return;

      panel.querySelectorAll<HTMLLabelElement>("label").forEach((label) => {
        const select = label.querySelector<HTMLSelectElement>("select");
        if (!select) return;
        const text = label.textContent?.trim().toLowerCase() ?? "";
        if (text.startsWith("forma de pagamento")) setPayment(select.value);
        if (text.startsWith("dia da semana")) setWeekdayFilter(select.value);
      });
    };

    const install = () => {
      attempts += 1;
      const grid = root.querySelector<HTMLElement>("[data-expense-insights-host] .executive-expense-insights");
      if (!grid) return false;

      portalHost = grid.querySelector<HTMLElement>("[data-expense-description-card]");
      if (!portalHost) {
        portalHost = document.createElement("article");
        portalHost.dataset.expenseDescriptionCard = "true";
        portalHost.className = "min-w-0 rounded-2xl border border-border bg-card p-3 shadow-sm";
        grid.appendChild(portalHost);
      }

      setHost(portalHost);
      syncControls();
      return true;
    };

    const timer = window.setInterval(() => {
      if (install() || attempts >= 100) window.clearInterval(timer);
    }, 100);

    const syncAfterInteraction = () => window.setTimeout(() => {
      syncControls();
      if (!portalHost?.isConnected) install();
    }, 0);

    root.addEventListener("input", syncAfterInteraction, true);
    root.addEventListener("change", syncAfterInteraction, true);
    root.addEventListener("click", syncAfterInteraction, true);

    return () => {
      window.clearInterval(timer);
      root.removeEventListener("input", syncAfterInteraction, true);
      root.removeEventListener("change", syncAfterInteraction, true);
      root.removeEventListener("click", syncAfterInteraction, true);
      portalHost?.remove();
    };
  }, []);

  const query = useQuery({
    queryKey: ["executive-expense-descriptions", company.data?.id, range?.start, range?.end],
    enabled: Boolean(company.data?.id && range),
    staleTime: 60_000,
    queryFn: async () => {
      const result = await (supabase as any)
        .from("expenses")
        .select("data,categoria,descricao,valor,pagamento")
        .eq("company_id", company.data!.id)
        .gte("data", range!.start)
        .lte("data", range!.end);
      if (result.error) throw result.error;
      return (result.data ?? []) as ExpenseRow[];
    },
  });

  const rows = useMemo<DescriptionRow[]>(() => {
    const grouped = new Map<string, DescriptionRow>();

    (query.data ?? [])
      .filter((row) => weekdayFilter === "all" || weekday(row.data) === weekdayFilter)
      .filter((row) => payment === "all" || normalizePayment(row.pagamento) === payment)
      .forEach((row) => {
        const description = cleanLabel(row.descricao, "Sem descrição");
        const category = cleanLabel(row.categoria, "Não informado");
        const key = `${category}::${description}`;
        const current = grouped.get(key) ?? { description, category, value: 0, count: 0 };
        current.value += number(row.valor);
        current.count += 1;
        grouped.set(key, current);
      });

    return [...grouped.values()]
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value || b.count - a.count)
      .slice(0, 7);
  }, [payment, query.data, weekdayFilter]);

  if (!host) return null;

  return createPortal(
    <DescriptionCard rows={rows} loading={query.isLoading} error={Boolean(query.error)} />,
    host,
  );
}

function DescriptionCard({ rows, loading, error }: { rows: DescriptionRow[]; loading: boolean; error: boolean }) {
  const max = Math.max(1, ...rows.map((row) => row.value));

  return (
    <div className="min-w-0">
      <div className="mb-3">
        <h2 className="text-sm font-black text-blue-600">10. Descrição das despesas</h2>
        <p className="text-[10px] font-medium text-muted-foreground">Mostra exatamente quais gastos formam as categorias.</p>
      </div>

      {loading && <State text="Carregando descrições…" />}
      {error && <State text="Não foi possível carregar as descrições." danger />}
      {!loading && !error && rows.length === 0 && <State text="Nenhuma descrição cadastrada no período." />}

      {!loading && !error && rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={`${row.category}-${row.description}`} className="rounded-lg border border-border/70 bg-background/55 p-2">
              <div className="mb-1 flex items-start justify-between gap-2 text-[10px]">
                <div className="min-w-0">
                  <strong className="block truncate text-foreground" title={row.description}>{row.description}</strong>
                  <span className="block truncate text-[9px] text-muted-foreground" title={row.category}>{row.category}</span>
                </div>
                <strong className="shrink-0 tabular-nums text-red-600">{fmtBRL(row.value)}</strong>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <div className="h-2 overflow-hidden rounded-full bg-red-50">
                  <div className="h-full rounded-full bg-red-500" style={{ width: `${Math.max(4, (row.value / max) * 100)}%` }} />
                </div>
                <span className="whitespace-nowrap text-[9px] font-bold text-muted-foreground">
                  {row.count} {row.count === 1 ? "lançamento" : "lançamentos"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>,
    host,
  );
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

function cleanLabel(value: string | null | undefined, fallback: string) {
  const clean = String(value ?? "").trim();
  return clean || fallback;
}

function weekday(value: string) {
  return String(new Date(`${value}T00:00:00Z`).getUTCDay());
}

function normalize(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function State({ text, danger = false }: { text: string; danger?: boolean }) {
  return (
    <div className={`grid min-h-40 place-items-center rounded-xl text-xs font-semibold ${danger ? "bg-red-50 text-red-700" : "text-muted-foreground"}`}>
      {text}
    </div>
  );
}
