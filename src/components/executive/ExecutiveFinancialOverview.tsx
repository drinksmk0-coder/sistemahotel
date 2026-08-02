import { useQuery } from "@tanstack/react-query";
import { BadgeDollarSign, ReceiptText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany } from "@/lib/data";
import { fmtBRL } from "@/lib/format";

type Range = { start: string; end: string };
type Summary = { revenue: number; expenses: number; gop: number };
type ReservationRow = { status: string | null; valor_total: number | string | null; pagamento: string | null };
type SaleRow = { total: number | string | null; pagamento: string | null };
type ExpenseRow = { valor: number | string | null; pagamento: string | null };

const EMPTY: Summary = { revenue: 0, expenses: 0, gop: 0 };

export function ExecutiveFinancialOverview() {
  const company = useCurrentCompany();
  const [range, setRange] = useState<Range | null>(null);
  const [payment, setPayment] = useState("all");
  const [kpiHost, setKpiHost] = useState<HTMLElement | null>(null);
  const [chartHost, setChartHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-executive-dashboard]");
    if (!root) return;
    let kpiPortal: HTMLDivElement | null = null;
    let chartPortal: HTMLDivElement | null = null;

    const sync = () => {
      const fields = root.querySelectorAll<HTMLInputElement>('header input[type="date"]');
      if (fields.length >= 2 && fields[0].value && fields[1].value) {
        const start = fields[0].value <= fields[1].value ? fields[0].value : fields[1].value;
        const end = fields[0].value <= fields[1].value ? fields[1].value : fields[0].value;
        setRange((current) => current?.start === start && current?.end === end ? current : { start, end });
      }
      const title = Array.from(root.querySelectorAll<HTMLElement>("section h2")).find((node) => node.textContent?.trim() === "Filtros cruzados");
      let nextPayment = "all";
      title?.closest("section")?.querySelectorAll<HTMLLabelElement>("label").forEach((label) => {
        if (label.textContent?.trim().toLowerCase().startsWith("forma de pagamento")) {
          nextPayment = label.querySelector<HTMLSelectElement>("select")?.value ?? "all";
        }
      });
      setPayment((current) => current === nextPayment ? current : nextPayment);
    };

    const install = () => {
      const kpiSection = Array.from(root.querySelectorAll<HTMLElement>("section")).find((section) =>
        Array.from(section.querySelectorAll("article p")).some((label) => label.textContent?.trim() === "Receita total"),
      );
      if (kpiSection && (!kpiPortal || !kpiPortal.isConnected)) {
        kpiPortal = document.createElement("div");
        kpiPortal.style.display = "contents";
        kpiSection.appendChild(kpiPortal);
        setKpiHost(kpiPortal);
      }

      const revenuePortal = root.querySelector<HTMLElement>("[data-revenue-expense-gop-host]");
      const revenueCard = revenuePortal?.closest("article") ?? Array.from(root.querySelectorAll<HTMLElement>("article")).find((article) => article.querySelector("h2")?.textContent?.startsWith("2. Receitas"));
      if (revenueCard && (!chartPortal || !chartPortal.isConnected)) {
        chartPortal = document.createElement("div");
        chartPortal.dataset.executiveFinancialSummary = "true";
        if (revenuePortal) revenueCard.insertBefore(chartPortal, revenuePortal);
        else revenueCard.appendChild(chartPortal);
        setChartHost(chartPortal);
      }
      sync();
    };

    install();
    const timer = window.setInterval(install, 300);
    const stop = window.setTimeout(() => window.clearInterval(timer), 20_000);
    const delayed = () => window.setTimeout(install, 0);
    root.addEventListener("input", delayed, true);
    root.addEventListener("change", delayed, true);
    root.addEventListener("click", delayed, true);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
      root.removeEventListener("input", delayed, true);
      root.removeEventListener("change", delayed, true);
      root.removeEventListener("click", delayed, true);
      kpiPortal?.remove();
      chartPortal?.remove();
    };
  }, []);

  const previousRange = useMemo(() => range ? previousSameLength(range) : null, [range]);
  const query = useQuery({
    queryKey: ["executive-financial-overview", company.data?.id, range?.start, range?.end, payment],
    enabled: Boolean(company.data?.id && range && previousRange),
    staleTime: 60_000,
    queryFn: async () => ({
      current: await loadSummary(company.data!.id, range!, payment),
      previous: await loadSummary(company.data!.id, previousRange!, payment),
    }),
  });

  const current = query.data?.current ?? EMPTY;
  const previous = query.data?.previous ?? EMPTY;

  return <>
    {kpiHost && createPortal(<>
      <FinancialKpi icon={<ReceiptText />} label="Despesas gerais" value={fmtBRL(current.expenses)} delta={variation(current.expenses, previous.expenses)} inverse tone="expense" />
      <FinancialKpi icon={<BadgeDollarSign />} label="GOP" value={fmtBRL(current.gop)} delta={variation(current.gop, previous.gop)} tone={current.gop >= 0 ? "gop" : "expense"} />
    </>, kpiHost)}

    {chartHost && createPortal(
      <div className="executive-financial-strip mb-2 grid grid-cols-3 gap-1.5">
        <Mini label="Receita" value={current.revenue} className="text-blue-700" />
        <Mini label="Despesas" value={current.expenses} className="text-red-600" />
        <Mini label="GOP" value={current.gop} className={current.gop >= 0 ? "text-emerald-700" : "text-red-600"} />
        {current.revenue > 0 && current.expenses === 0 && <p className="col-span-3 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[9px] font-semibold text-amber-900">Nenhuma despesa foi lançada neste período. Selecione julho, 30 dias ou o ano para visualizar os custos já cadastrados.</p>}
      </div>,
      chartHost,
    )}
  </>;
}

function FinancialKpi({ icon, label, value, delta, inverse = false, tone }: { icon: React.ReactNode; label: string; value: string; delta: number; inverse?: boolean; tone: "expense" | "gop" }) {
  const favorable = inverse ? delta <= 0 : delta >= 0;
  return <article className="flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-card px-3 py-3 shadow-sm">
    <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${tone === "expense" ? "bg-red-50 text-red-500" : "bg-emerald-50 text-emerald-600"} [&>svg]:h-5 [&>svg]:w-5`}>{icon}</div>
    <div className="min-w-0"><p className="truncate text-[10px] font-bold text-muted-foreground">{label}</p><strong className="block truncate text-base font-black text-foreground">{value}</strong><span className={`text-[9px] font-bold ${favorable ? "text-emerald-600" : "text-red-500"}`}>vs período anterior {delta >= 0 ? "+" : ""}{delta.toFixed(1)}%</span></div>
  </article>;
}

function Mini({ label, value, className }: { label: string; value: number; className: string }) {
  return <div className="rounded-lg border border-border bg-background/70 px-2 py-1.5"><span className="block text-[8px] font-extrabold uppercase text-muted-foreground">{label}</span><strong className={`block truncate text-xs font-black tabular-nums ${className}`}>{fmtBRL(value)}</strong></div>;
}

async function loadSummary(companyId: string, range: Range, payment: string): Promise<Summary> {
  const [reservationsResult, salesResult, expensesResult] = await Promise.all([
    (supabase as any).from("reservations").select("status,valor_total,pagamento").eq("company_id", companyId).gte("checkin", range.start).lte("checkin", range.end),
    (supabase as any).from("sales").select("total,pagamento").eq("company_id", companyId).gte("data", range.start).lte("data", range.end),
    (supabase as any).from("expenses").select("valor,pagamento").eq("company_id", companyId).gte("data", range.start).lte("data", range.end),
  ]);
  if (reservationsResult.error) throw reservationsResult.error;
  if (salesResult.error) throw salesResult.error;
  if (expensesResult.error) throw expensesResult.error;
  const reservations = ((reservationsResult.data ?? []) as ReservationRow[]).filter((row) => !isExcluded(row.status)).filter((row) => payment === "all" || normalizePayment(row.pagamento) === payment);
  const sales = ((salesResult.data ?? []) as SaleRow[]).filter((row) => payment === "all" || normalizePayment(row.pagamento) === payment);
  const expenses = ((expensesResult.data ?? []) as ExpenseRow[]).filter((row) => payment === "all" || normalizePayment(row.pagamento) === payment);
  const revenue = reservations.reduce((sum, row) => sum + number(row.valor_total), 0) + sales.reduce((sum, row) => sum + number(row.total), 0);
  const expenseTotal = expenses.reduce((sum, row) => sum + number(row.valor), 0);
  return { revenue, expenses: expenseTotal, gop: revenue - expenseTotal };
}

function previousSameLength(range: Range): Range { const start = parseDate(range.start); const end = parseDate(range.end); const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1); const previousEnd = addDays(start, -1); const previousStart = addDays(previousEnd, -days + 1); return { start: iso(previousStart), end: iso(previousEnd) }; }
function isExcluded(value: string | null) { const status = normalize(value).replace(/[\s_-]+/g, ""); return status.includes("cancel") || status.includes("noshow") || status.includes("naocompare") || status.includes("manut"); }
function normalizePayment(value: string | null) { const text = normalize(value); if (text.includes("pix")) return "Pix"; if (text.includes("dinheiro")) return "Dinheiro"; if (text.includes("debito")) return "Cartão de Débito"; if (text.includes("credito")) return "Cartão de Crédito"; if (text.includes("transfer")) return "Transferência"; if (text.includes("pendente") || text.includes("fiado")) return "Pendente/Fiado"; return value?.trim() || "Outros"; }
function normalize(value: string | null | undefined) { return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); }
function number(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function variation(current: number, previous: number) { if (previous === 0) return current === 0 ? 0 : 100; return ((current - previous) / Math.abs(previous)) * 100; }
function parseDate(value: string) { return new Date(`${value}T00:00:00Z`); }
function addDays(date: Date, amount: number) { const copy = new Date(date); copy.setUTCDate(copy.getUTCDate() + amount); return copy; }
function iso(date: Date) { return date.toISOString().slice(0, 10); }
