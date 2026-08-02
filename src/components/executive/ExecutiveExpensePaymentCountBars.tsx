import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany } from "@/lib/data";

type Range = { start: string; end: string };
type ExpenseRow = {
  data: string;
  pagamento: string | null;
};
type CountRow = {
  name: string;
  count: number;
};

export function ExecutiveExpensePaymentCountBars() {
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
        .find((heading) => heading.textContent?.trim() === "9. Como as despesas foram pagas");
      const card = title?.closest("article");
      if (!card) return false;

      portalHost = card.querySelector<HTMLDivElement>("[data-expense-payment-count-host]");
      if (!portalHost) {
        portalHost = document.createElement("div");
        portalHost.dataset.expensePaymentCountHost = "true";
        portalHost.className = "mt-3 border-t border-border pt-3";
        card.appendChild(portalHost);
      }

      setHost(portalHost);
      syncControls();
      return true;
    };

    const timer = window.setInterval(() => {
      if (install() || attempts >= 80) window.clearInterval(timer);
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
    queryKey: ["executive-expense-payment-count", company.data?.id, range?.start, range?.end],
    enabled: Boolean(company.data?.id && range),
    staleTime: 60_000,
    queryFn: async () => {
      const result = await (supabase as any)
        .from("expenses")
        .select("data,pagamento")
        .eq("company_id", company.data!.id)
        .gte("data", range!.start)
        .lte("data", range!.end);
      if (result.error) throw result.error;
      return (result.data ?? []) as ExpenseRow[];
    },
  });

  const rows = useMemo<CountRow[]>(() => {
    const counts = new Map<string, number>();
    (query.data ?? [])
      .filter((row) => weekdayFilter === "all" || weekday(row.data) === weekdayFilter)
      .filter((row) => payment === "all" || normalizePayment(row.pagamento) === payment)
      .forEach((row) => {
        const name = normalizePayment(row.pagamento);
        counts.set(name, (counts.get(name) ?? 0) + 1);
      });
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "pt-BR"));
  }, [payment, query.data, weekdayFilter]);

  if (!host) return null;

  return createPortal(
    <div className="min-w-0">
      <div className="mb-2 flex items-end justify-between gap-2">
        <div>
          <h3 className="text-[11px] font-black text-foreground">Quantidade por forma de pagamento</h3>
          <p className="text-[9px] font-medium text-muted-foreground">Número de lançamentos de despesas em cada modalidade.</p>
        </div>
        <strong className="whitespace-nowrap text-xs tabular-nums text-blue-600">
          {rows.reduce((sum, row) => sum + row.count, 0)} pagamentos
        </strong>
      </div>

      {query.isLoading && <State text="Carregando quantidades…" />}
      {query.error && <State text="Não foi possível carregar as quantidades." danger />}
      {!query.isLoading && !query.error && rows.length === 0 && <State text="Sem pagamentos no período selecionado." />}
      {!query.isLoading && !query.error && rows.length > 0 && (
        <div className="h-32 min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ top: 2, right: 34, bottom: 0, left: 4 }}>
              <CartesianGrid strokeDasharray="3 5" horizontal={false} />
              <XAxis type="number" allowDecimals={false} hide />
              <YAxis type="category" dataKey="name" width={112} tick={{ fontSize: 9, fontWeight: 600 }} />
              <Tooltip formatter={(value: number) => [`${value} lançamento${value === 1 ? "" : "s"}`, "Quantidade"]} />
              <Bar dataKey="count" name="Quantidade" fill="#2563eb" radius={[0, 5, 5, 0]} maxBarSize={16}>
                <LabelList dataKey="count" position="right" fill="currentColor" fontSize={10} fontWeight={800} formatter={(value: number) => `${value}x`} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
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

function State({ text, danger = false }: { text: string; danger?: boolean }) {
  return (
    <div className={`grid h-24 place-items-center rounded-xl text-[10px] font-semibold ${danger ? "bg-red-50 text-red-700" : "text-muted-foreground"}`}>
      {text}
    </div>
  );
}
