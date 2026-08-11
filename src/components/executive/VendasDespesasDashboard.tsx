import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  CreditCard,
  Download,
  Maximize2,
  Minimize2,
  PackageCheck,
  ReceiptText,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useCurrentCompany, useExpenses, useProducts, useSales } from "@/lib/data";
import { downloadCSV, fmtBRL, todayISO } from "@/lib/format";

type SaleRow = {
  id: string;
  compra_id?: string | null;
  data: string;
  item: string;
  categoria?: string | null;
  produto_id?: string | null;
  qtd: number;
  valor_unit: number;
  total: number;
  valor_pago?: number | null;
  pagamento?: string | null;
  status?: string | null;
};

type ExpenseRow = {
  id: string;
  data: string;
  categoria: string;
  descricao: string;
  fornecedor?: string | null;
  pagamento?: string | null;
  valor: number;
};

type ProductRow = {
  id: string;
  nome: string;
  categoria?: string | null;
  preco: number;
  custo_unitario?: number | null;
  estoque_atual: number;
  estoque_minimo: number;
  ativo: boolean;
};

type ComparisonMode = "previous_month" | "previous_year";

export function VendasDespesasDashboard() {
  const dashboardRef = useRef<HTMLDivElement>(null);
  const currentCompany = useCurrentCompany();
  const { data: saleRows = [] } = useSales();
  const { data: expenseRows = [] } = useExpenses();
  const { data: productRows = [] } = useProducts();
  const sales = saleRows as unknown as SaleRow[];
  const expenses = expenseRows as unknown as ExpenseRow[];
  const products = productRows as unknown as ProductRow[];

  const today = todayISO();
  const defaultMonth = today.slice(0, 7);
  const [month, setMonth] = useState(defaultMonth);
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>("previous_month");
  const [categoryFilter, setCategoryFilter] = useState("todas");
  const [paymentFilter, setPaymentFilter] = useState("todos");
  const [expenseFilter, setExpenseFilter] = useState("todas");
  const [isFullscreen, setIsFullscreen] = useState(false);

  const start = `${month}-01`;
  const end = nextMonthISO(start);
  const comparisonStart = comparisonMode === "previous_month" ? previousMonthISO(start) : previousYearISO(start);
  const comparisonEnd = nextMonthISO(comparisonStart);

  useEffect(() => {
    const sync = () => setIsFullscreen(document.fullscreenElement === dashboardRef.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  async function toggleFullscreen() {
    if (!dashboardRef.current) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await dashboardRef.current.requestFullscreen();
  }

  const validSales = useMemo(
    () => sales.filter((row) => normalize(row.status) !== "cancelado"),
    [sales],
  );

  const monthSalesBase = useMemo(
    () => validSales.filter((row) => row.data >= start && row.data < end),
    [end, start, validSales],
  );

  const categories = useMemo(
    () => unique(monthSalesBase.map((row) => row.categoria || "Sem categoria")),
    [monthSalesBase],
  );
  const payments = useMemo(
    () => unique(monthSalesBase.map((row) => row.pagamento || "Não informado")),
    [monthSalesBase],
  );
  const expenseCategories = useMemo(
    () => unique(expenses.filter((row) => row.data >= start && row.data < end).map((row) => row.categoria || "Sem categoria")),
    [end, expenses, start],
  );

  const monthSales = useMemo(
    () => monthSalesBase.filter((row) =>
      (categoryFilter === "todas" || (row.categoria || "Sem categoria") === categoryFilter) &&
      (paymentFilter === "todos" || (row.pagamento || "Não informado") === paymentFilter)),
    [categoryFilter, monthSalesBase, paymentFilter],
  );

  const monthExpenses = useMemo(
    () => expenses.filter((row) => row.data >= start && row.data < end)
      .filter((row) => expenseFilter === "todas" || (row.categoria || "Sem categoria") === expenseFilter),
    [end, expenseFilter, expenses, start],
  );

  const current = useMemo(
    () => snapshot(monthSales, monthExpenses),
    [monthExpenses, monthSales],
  );
  const comparison = useMemo(
    () => snapshot(
      validSales.filter((row) => row.data >= comparisonStart && row.data < comparisonEnd),
      expenses.filter((row) => row.data >= comparisonStart && row.data < comparisonEnd),
    ),
    [comparisonEnd, comparisonStart, expenses, validSales],
  );

  const activeProducts = products.filter((row) => row.ativo);
  const lowStock = activeProducts
    .filter((row) => Number(row.estoque_atual) <= Number(row.estoque_minimo))
    .sort((a, b) => Number(a.estoque_atual) - Number(b.estoque_atual));
  const inventorySaleValue = activeProducts.reduce(
    (sum, row) => sum + Number(row.estoque_atual || 0) * Number(row.preco || 0), 0,
  );
  const inventoryCostValue = activeProducts.reduce(
    (sum, row) => sum + Number(row.estoque_atual || 0) * Number(row.custo_unitario || 0), 0,
  );

  const productMap = useMemo(() => new Map(products.map((row) => [row.id, row])), [products]);
  const costAnalysis = useMemo(() => {
    let knownRevenue = 0;
    let estimatedCost = 0;
    let totalRevenue = 0;
    for (const sale of monthSales) {
      totalRevenue += Number(sale.total || 0);
      const product = sale.produto_id ? productMap.get(sale.produto_id) : undefined;
      const cost = Number(product?.custo_unitario || 0);
      if (cost > 0) {
        knownRevenue += Number(sale.total || 0);
        estimatedCost += Number(sale.qtd || 0) * cost;
      }
    }
    const coverage = totalRevenue > 0 ? (knownRevenue / totalRevenue) * 100 : 0;
    const grossMargin = knownRevenue > 0 ? ((knownRevenue - estimatedCost) / knownRevenue) * 100 : null;
    return { coverage, estimatedCost, grossMargin };
  }, [monthSales, productMap]);

  const dailyData = useMemo(() => {
    const days = daysInMonth(start);
    return Array.from({ length: days }, (_, index) => {
      const day = String(index + 1).padStart(2, "0");
      const date = `${month}-${day}`;
      return {
        day,
        vendas: monthSales.filter((row) => row.data === date).reduce((sum, row) => sum + Number(row.total || 0), 0),
        despesas: monthExpenses.filter((row) => row.data === date).reduce((sum, row) => sum + Number(row.valor || 0), 0),
      };
    });
  }, [month, monthExpenses, monthSales, start]);

  const salesByCategory = useMemo(
    () => rankBy(monthSales, (row) => row.categoria || "Sem categoria", (row) => Number(row.total || 0)).slice(0, 8),
    [monthSales],
  );
  const salesByPayment = useMemo(
    () => rankBy(monthSales, (row) => row.pagamento || "Não informado", (row) => Number(row.total || 0)).slice(0, 8),
    [monthSales],
  );
  const topProducts = useMemo(() => {
    const map = new Map<string, { label: string; value: number; qty: number }>();
    monthSales.forEach((row) => {
      const key = row.item || "Sem item";
      const current = map.get(key) ?? { label: key, value: 0, qty: 0 };
      current.value += Number(row.total || 0);
      current.qty += Number(row.qtd || 0);
      map.set(key, current);
    });
    return [...map.values()].sort((a, b) => b.value - a.value).slice(0, 8);
  }, [monthSales]);
  const expenseRanking = useMemo(
    () => rankBy(monthExpenses, (row) => row.categoria || "Sem categoria", (row) => Number(row.valor || 0)).slice(0, 8),
    [monthExpenses],
  );

  const coverageRatio = current.expenses > 0 ? (current.sales / current.expenses) * 100 : current.sales > 0 ? 100 : 0;
  const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" })
    .format(new Date(`${start}T12:00:00`));

  function exportPanel() {
    downloadCSV(`bi-vendas-despesas-${month}.csv`, [
      ["Indicador", "Valor"],
      ["Vendas de produtos", current.sales],
      ["Recebido", current.received],
      ["A receber", current.pending],
      ["Ticket médio", current.ticket],
      ["Itens vendidos", current.items],
      ["Despesas", current.expenses],
      ["Cobertura das despesas (%)", coverageRatio],
      ["Produtos ativos", activeProducts.length],
      ["Estoque baixo", lowStock.length],
    ]);
  }

  return (
    <div ref={dashboardRef} className="vd-dashboard">
      <header className="vd-header">
        <div>
          <p className="vd-eyebrow">{currentCompany.data?.nome || "HospedaMais"} · gestão comercial</p>
          <h1>Vendas de produtos & despesas</h1>
          <p>Visão gerencial de {monthLabel}: vendas, recebimentos, gastos, estoque e desempenho dos produtos.</p>
        </div>
        <div className="vd-header-actions">
          <button type="button" className="vd-action" onClick={exportPanel}><Download size={15} /> CSV</button>
          <button type="button" className="vd-action" onClick={() => void toggleFullscreen()}>
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            {isFullscreen ? "Sair" : "Tela inteira"}
          </button>
        </div>
      </header>

      <div className="vd-filters">
        <label>Mês<input type="month" value={month} onChange={(event) => setMonth(event.target.value || defaultMonth)} /></label>
        <label>Categoria<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="todas">Todas</option>{categories.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Pagamento<select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)}><option value="todos">Todos</option>{payments.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Despesa<select value={expenseFilter} onChange={(event) => setExpenseFilter(event.target.value)}><option value="todas">Todas</option>{expenseCategories.map((value) => <option key={value}>{value}</option>)}</select></label>
        <div className="vd-compare-toggle">
          <button className={comparisonMode === "previous_month" ? "active" : ""} onClick={() => setComparisonMode("previous_month")}>Mês anterior</button>
          <button className={comparisonMode === "previous_year" ? "active" : ""} onClick={() => setComparisonMode("previous_year")}>Ano anterior</button>
        </div>
      </div>

      <section className="vd-kpi-grid">
        <Kpi icon={<ShoppingCart />} label="Vendas de produtos" value={fmtBRL(current.sales)} hint={`${current.purchases} compra(s)`} delta={delta(current.sales, comparison.sales)} />
        <Kpi icon={<WalletCards />} label="Recebido" value={fmtBRL(current.received)} hint={`${current.sales > 0 ? Math.round((current.received / current.sales) * 100) : 0}% das vendas`} />
        <Kpi icon={<CreditCard />} label="A receber" value={fmtBRL(current.pending)} hint="Pendente / parcial" tone={current.pending > 0 ? "warn" : "good"} />
        <Kpi icon={<ReceiptText />} label="Ticket médio" value={fmtBRL(current.ticket)} hint="por compra" delta={delta(current.ticket, comparison.ticket)} />
        <Kpi icon={<PackageCheck />} label="Itens vendidos" value={String(current.items)} hint={`${monthSales.length} linha(s) de venda`} delta={delta(current.items, comparison.items)} />
        <Kpi icon={<TrendingDown />} label="Despesas" value={fmtBRL(current.expenses)} hint={`${monthExpenses.length} lançamento(s)`} delta={delta(current.expenses, comparison.expenses)} inverse />
        <Kpi icon={<TrendingUp />} label="Cobertura despesas" value={`${coverageRatio.toFixed(1)}%`} hint="vendas de produtos ÷ despesas; não é lucro" tone={coverageRatio >= 100 ? "good" : "warn"} />
        <Kpi icon={<AlertTriangle />} label="Estoque baixo" value={String(lowStock.length)} hint={`${activeProducts.length} produtos ativos`} tone={lowStock.length ? "warn" : "good"} />
      </section>

      <section className="vd-compare-strip">
        <Compare label="Vendas" current={current.sales} previous={comparison.sales} money />
        <Compare label="Despesas" current={current.expenses} previous={comparison.expenses} money inverse />
        <Compare label="Compras" current={current.purchases} previous={comparison.purchases} />
        <Compare label="Ticket" current={current.ticket} previous={comparison.ticket} money />
        <div className="vd-cost-status">
          <span>Margem dos produtos</span>
          <strong>{costAnalysis.grossMargin == null ? "Sem custo cadastrado" : `${costAnalysis.grossMargin.toFixed(1)}%`}</strong>
          <small>{costAnalysis.coverage > 0 ? `custo conhecido em ${costAnalysis.coverage.toFixed(0)}% da receita filtrada` : "cadastre custo unitário nos produtos"}</small>
        </div>
      </section>

      <section className="vd-chart-grid">
        <Panel title="Evolução diária" subtitle="Vendas de produtos × despesas lançadas">
          <div className="vd-chart vd-chart-main">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="vdSales" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--primary)" stopOpacity={0.32}/><stop offset="95%" stopColor="var(--primary)" stopOpacity={0.02}/></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.35} />
                <XAxis dataKey="day" tick={{ fontSize: 9 }} interval={2} />
                <YAxis tick={{ fontSize: 9 }} tickFormatter={compactMoney} width={52} />
                <Tooltip formatter={(value) => fmtBRL(Number(value))} labelFormatter={(label) => `Dia ${label}`} />
                <Area type="monotone" dataKey="vendas" name="Vendas" stroke="var(--primary)" fill="url(#vdSales)" strokeWidth={2.5} />
                <Area type="monotone" dataKey="despesas" name="Despesas" stroke="var(--destructive)" fill="transparent" strokeWidth={2.2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Vendas por categoria" subtitle="Categorias com maior faturamento">
          <HorizontalBars data={salesByCategory} total={current.sales} />
        </Panel>
      </section>

      <section className="vd-detail-grid">
        <Panel title="Receita por pagamento" subtitle="Como as vendas foram cobradas">
          <HorizontalBars data={salesByPayment} total={current.sales} compact />
        </Panel>
        <Panel title="Ranking de produtos" subtitle="Produtos com maior faturamento">
          <div className="vd-ranking">{topProducts.length ? topProducts.map((row, index) => <div key={row.label} className="vd-rank-row"><span className="vd-rank-number">{index + 1}</span><div><strong>{row.label}</strong><small>{row.qty} un.</small></div><b>{fmtBRL(row.value)}</b></div>) : <Empty />}</div>
        </Panel>
        <Panel title="Despesas por categoria" subtitle="Onde o dinheiro está sendo gasto">
          <HorizontalBars data={expenseRanking} total={current.expenses} compact danger />
        </Panel>
        <Panel title="Estoque & capital" subtitle="Risco de ruptura e valor potencial">
          <div className="vd-stock-summary"><span><Boxes size={15}/> Venda potencial <strong>{fmtBRL(inventorySaleValue)}</strong></span><span>Custo cadastrado <strong>{inventoryCostValue > 0 ? fmtBRL(inventoryCostValue) : "não informado"}</strong></span></div>
          <div className="vd-ranking vd-stock-list">{lowStock.length ? lowStock.slice(0, 6).map((row) => <div key={row.id} className="vd-rank-row"><span className="vd-alert-dot"/><div><strong>{row.nome}</strong><small>mínimo {Number(row.estoque_minimo)}</small></div><b>{Number(row.estoque_atual)} un.</b></div>) : <Empty text="Nenhum produto em estoque baixo." />}</div>
        </Panel>
      </section>

      <footer className="vd-footer">As despesas são lançamentos gerais do hotel. A comparação com vendas de produtos indica cobertura financeira, não lucro líquido. Para margem real dos produtos, cadastre o custo unitário.</footer>
    </div>
  );
}

function Kpi({ icon, label, value, hint, delta: change, inverse = false, tone }: { icon: React.ReactNode; label: string; value: string; hint: string; delta?: number | null; inverse?: boolean; tone?: "good" | "warn" }) {
  const favorable = change == null ? null : inverse ? change <= 0 : change >= 0;
  return <article className={`vd-kpi ${tone ? `vd-${tone}` : ""}`}><div className="vd-kpi-icon">{icon}</div><div className="vd-kpi-copy"><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>{change != null && <em className={favorable ? "up" : "down"}>{change >= 0 ? "+" : ""}{change.toFixed(1)}%</em>}</article>;
}

function Compare({ label, current, previous, money = false, inverse = false }: { label: string; current: number; previous: number; money?: boolean; inverse?: boolean }) {
  const change = delta(current, previous);
  const favorable = change == null ? null : inverse ? change <= 0 : change >= 0;
  return <div className="vd-compare"><span>{label}</span><strong>{money ? fmtBRL(current) : formatNumber(current)}</strong><small>{change == null ? "Sem base comparável" : <><b className={favorable ? "up" : "down"}>{change >= 0 ? "+" : ""}{change.toFixed(1)}%</b> vs. período</>}</small></div>;
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <article className="vd-panel"><header><div><h2>{title}</h2><p>{subtitle}</p></div></header>{children}</article>;
}

function HorizontalBars({ data, total, compact = false, danger = false }: { data: Array<{ label: string; value: number }>; total: number; compact?: boolean; danger?: boolean }) {
  if (!data.length) return <Empty />;
  if (!compact) return <div className="vd-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} layout="vertical" margin={{ top: 5, right: 48, left: 22, bottom: 2 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.3}/><XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={compactMoney}/><YAxis type="category" dataKey="label" width={92} tick={{ fontSize: 9 }}/><Tooltip formatter={(value) => fmtBRL(Number(value))}/><Bar dataKey="value" name="Valor" fill={danger ? "var(--destructive)" : "var(--primary)"} radius={[0,4,4,0]}/></BarChart></ResponsiveContainer></div>;
  return <div className="vd-mini-bars">{data.map((row) => { const share = total > 0 ? (row.value / total) * 100 : 0; return <div key={row.label}><div className="vd-mini-label"><span>{row.label}</span><b>{fmtBRL(row.value)} · {share.toFixed(0)}%</b></div><div className="vd-mini-track"><i className={danger ? "danger" : ""} style={{ width: `${Math.max(3, Math.min(100, share))}%` }}/></div></div>; })}</div>;
}

function Empty({ text = "Sem dados no período selecionado." }: { text?: string }) { return <div className="vd-empty">{text}</div>; }

function snapshot(sales: SaleRow[], expenses: ExpenseRow[]) {
  const salesValue = sales.reduce((sum, row) => sum + Number(row.total || 0), 0);
  const received = sales.reduce((sum, row) => sum + Math.min(Number(row.valor_pago || 0), Number(row.total || 0)), 0);
  const purchases = new Set(sales.map((row) => row.compra_id || row.id)).size;
  const items = sales.reduce((sum, row) => sum + Number(row.qtd || 0), 0);
  const expenseValue = expenses.filter((row) => !isFinancialMovement(row)).reduce((sum, row) => sum + Number(row.valor || 0), 0);
  return { sales: salesValue, received, pending: Math.max(0, salesValue - received), purchases, items, expenses: expenseValue, ticket: purchases ? salesValue / purchases : 0 };
}

function isFinancialMovement(row: ExpenseRow) {
  const value = normalize(`${row.categoria} ${row.descricao}`);
  return value.includes("retirada") || value.includes("movimentacao financeira") || value.includes("proprietario") || value.includes("socio");
}

function rankBy<T>(rows: T[], label: (row: T) => string, value: (row: T) => number) {
  const map = new Map<string, number>();
  rows.forEach((row) => { const key = label(row); map.set(key, (map.get(key) ?? 0) + value(row)); });
  return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

function delta(current: number, previous: number) {
  if (!previous) return current ? null : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function nextMonthISO(start: string) { const date = new Date(`${start}T12:00:00`); date.setMonth(date.getMonth() + 1); return date.toISOString().slice(0, 10); }
function previousMonthISO(start: string) { const date = new Date(`${start}T12:00:00`); date.setMonth(date.getMonth() - 1); return date.toISOString().slice(0, 10); }
function previousYearISO(start: string) { const date = new Date(`${start}T12:00:00`); date.setFullYear(date.getFullYear() - 1); return date.toISOString().slice(0, 10); }
function daysInMonth(start: string) { return Math.round((new Date(`${nextMonthISO(start)}T12:00:00`).getTime() - new Date(`${start}T12:00:00`).getTime()) / 86400000); }
function normalize(value?: string | null) { return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); }
function unique(values: string[]) { return [...new Set(values)].sort((a, b) => a.localeCompare(b, "pt-BR")); }
function compactMoney(value: number) { if (Math.abs(value) >= 1000) return `R$ ${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`; return `R$ ${Math.round(value)}`; }
function formatNumber(value: number) { return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value); }
