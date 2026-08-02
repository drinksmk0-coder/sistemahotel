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
  name: string;
  value: number;
  count: number;
};
type CategoryRow = {
  name: string;
  value: number;
  count: number;
  descriptions: DescriptionRow[];
};

export function ExecutiveExpenseCategoryFrequency() {
  const company = useCurrentCompany();
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [range, setRange] = useState<Range | null>(null);
  const [payment, setPayment] = useState("all");
  const [weekdayFilter, setWeekdayFilter] = useState("all");

  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-executive-dashboard]");
    if (!root) return;

    let attempts = 0;
    let portalHost: HTMLDivElement | null = null;
    let rankingCard: HTMLElement | null = null;
    const hiddenElements = new Set<HTMLElement>();

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
      const title = Array.from(root.querySelectorAll<HTMLElement>("article h2"))
        .find((heading) => heading.textContent?.trim() === "8. Ranking de despesas por categoria");
      rankingCard = title?.closest("article") ?? null;
      if (!rankingCard || !title) return false;

      portalHost = rankingCard.querySelector<HTMLDivElement>("[data-expense-category-frequency-host]");
      if (!portalHost) {
        portalHost = document.createElement("div");
        portalHost.dataset.expenseCategoryFrequencyHost = "true";
        portalHost.className = "min-w-0";
        rankingCard.appendChild(portalHost);
      }

      Array.from(rankingCard.children).forEach((child) => {
        if (!(child instanceof HTMLElement) || child === portalHost || child.contains(title)) return;
        child.style.display = "none";
        child.dataset.expenseCategoryFrequencyHidden = "true";
        hiddenElements.add(child);
      });

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
      hiddenElements.forEach((element) => {
        element.style.removeProperty("display");
        delete element.dataset.expenseCategoryFrequencyHidden;
      });
      portalHost?.remove();
    };
  }, []);

  const query = useQuery({
    queryKey: ["executive-expense-category-frequency", company.data?.id, range?.start, range?.end],
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

  const rows = useMemo<CategoryRow[]>(() => {
    const categories = new Map<string, {
      value: number;
      count: number;
      descriptions: Map<string, DescriptionRow>;
    }>();

    (query.data ?? [])
      .filter((row) => weekdayFilter === "all" || weekday(row.data) === weekdayFilter)
      .filter((row) => payment === "all" || normalizePayment(row.pagamento) === payment)
      .forEach((row) => {
        const category = cleanLabel(row.categoria, "Não informado");
        const description = cleanLabel(row.descricao, "Sem descrição");
        const value = number(row.valor);
        const current = categories.get(category) ?? {
          value: 0,
          count: 0,
          descriptions: new Map<string, DescriptionRow>(),
        };
        current.value += value;
        current.count += 1;

        const detail = current.descriptions.get(description) ?? { name: description, value: 0, count: 0 };
        detail.value += value;
        detail.count += 1;
        current.descriptions.set(description, detail);
        categories.set(category, current);
      });

    return [...categories.entries()]
      .map(([name, row]) => ({
        name,
        value: row.value,
        count: row.count,
        descriptions: [...row.descriptions.values()].sort((a, b) => b.value - a.value),
      }))
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value || b.count - a.count);
  }, [payment, query.data, weekdayFilter]);

  if (!host) return null;

  return createPortal(
    <CategoryRanking rows={rows} loading={query.isLoading} error={Boolean(query.error)} />,
    host,
  );
}

function CategoryRanking({ rows, loading, error }: { rows: CategoryRow[]; loading: boolean; error: boolean }) {
  if (loading) return <State text="Carregando despesas…" />;
  if (error) return <State text="Não foi possível carregar as despesas." danger />;
  if (!rows.length) return <State text="Nenhuma despesa cadastrada no período selecionado." />;

  const totalValue = rows.reduce((sum, row) => sum + row.value, 0);
  const totalCount = rows.reduce((sum, row) => sum + row.count, 0);
  const maxValue = Math.max(1, ...rows.map((row) => row.value));
  const maxCount = Math.max(1, ...rows.map((row) => row.count));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/45 px-2.5 py-2 text-[10px] font-semibold text-muted-foreground">
        <span>Total analisado: <strong className="text-foreground">{fmtBRL(totalValue)}</strong></span>
        <span><strong className="text-foreground">{totalCount}</strong> {launchLabel(totalCount)}</span>
      </div>

      {rows.slice(0, 7).map((row) => {
        const frequency = totalCount > 0 ? (row.count / totalCount) * 100 : 0;
        const generic = isGenericCategory(row.name);
        return (
          <div key={row.name} className="rounded-xl border border-border bg-background/45 p-2.5">
            <div className="mb-2 flex items-start justify-between gap-3 text-xs">
              <strong className="min-w-0 break-words">{row.name}</strong>
              <span className="shrink-0 text-right tabular-nums">
                <strong className="text-red-600">{fmtBRL(row.value)}</strong>
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="grid grid-cols-[4.2rem_minmax(0,1fr)_auto] items-center gap-2 text-[9px]">
                <span className="font-bold uppercase text-muted-foreground">Valor gasto</span>
                <div className="h-2.5 overflow-hidden rounded-full bg-red-50">
                  <div className="h-full rounded-full bg-red-500" style={{ width: `${Math.max(3, (row.value / maxValue) * 100)}%` }} />
                </div>
                <strong className="min-w-[3.5rem] text-right tabular-nums">{((row.value / totalValue) * 100).toFixed(1)}%</strong>
              </div>

              <div className="grid grid-cols-[4.2rem_minmax(0,1fr)_auto] items-center gap-2 text-[9px]">
                <span className="font-bold uppercase text-muted-foreground">Frequência</span>
                <div className="h-2.5 overflow-hidden rounded-full bg-blue-50">
                  <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.max(3, (row.count / maxCount) * 100)}%` }} />
                </div>
                <strong className="min-w-[7.8rem] text-right tabular-nums">
                  {row.count} {launchLabel(row.count)} · {frequency.toFixed(1)}%
                </strong>
              </div>
            </div>

            {generic && row.descriptions.length > 0 && (
              <details className="mt-2 rounded-lg border border-dashed border-border bg-card px-2.5 py-2 text-[10px]">
                <summary className="cursor-pointer font-bold text-blue-600">
                  Ver o que compõe “{row.name}” ({row.descriptions.length} {descriptionLabel(row.descriptions.length)})
                </summary>
                <div className="mt-2 space-y-1.5">
                  {row.descriptions.slice(0, 8).map((detail) => (
                    <div key={detail.name} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-t border-border/60 pt-1.5 first:border-0 first:pt-0">
                      <span className="break-words text-muted-foreground">{detail.name}</span>
                      <strong className="whitespace-nowrap text-right tabular-nums">
                        {fmtBRL(detail.value)} · {detail.count} {launchLabel(detail.count)}
                      </strong>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        );
      })}
    </div>
  );
}

function isGenericCategory(value: string) {
  const text = normalize(value);
  return text === "outros" || text === "outro" || text === "nao informado" || text === "sem categoria";
}

function launchLabel(count: number) {
  return count === 1 ? "lançamento" : "lançamentos";
}

function descriptionLabel(count: number) {
  return count === 1 ? "descrição" : "descrições";
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

function weekday(value: string) {
  return String(new Date(`${value}T00:00:00Z`).getUTCDay());
}

function cleanLabel(value: string | null | undefined, fallback: string) {
  const clean = String(value ?? "").trim();
  return clean || fallback;
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalize(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function State({ text, danger = false }: { text: string; danger?: boolean }) {
  return (
    <div className={`grid min-h-48 place-items-center rounded-xl text-xs font-semibold ${danger ? "bg-red-50 text-red-700" : "text-muted-foreground"}`}>
      {text}
    </div>
  );
}
