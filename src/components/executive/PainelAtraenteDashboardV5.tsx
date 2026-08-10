import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  BarChart3, BedDouble, Building2, CircleDollarSign, Maximize2, Minimize2,
  ReceiptText, Users,
} from "lucide-react";
import {
  useClients, useCurrentCompany, useExpenses, useFeedbacks, useReservations,
  useRooms, useSales, type Client, type Expense, type Reservation, type Sale,
} from "@/lib/data";
import { fmtBRL, fmtDate, nightsBetween, todayISO } from "@/lib/format";

type TabKey = "resumo" | "hospedes" | "quartos" | "despesas" | "canais";
type ComparisonMode = "previous_month" | "previous_year";
type DonutRow = { name: string; value: number; share: number };
type DailyTrendRow = { data: string; dia: string; Receita: number; Despesas: number; MediaReceita: number; MediaDespesas: number };
type RoomRow = { room: number; label: string; revenue: number; receita: number; nights: number; occupancy: number; reservations: number; ticket: number };
type GuestSpendRow = { key: string; name: string; lodging: number; products: number; total: number; items: string[]; purchases: number };
type RoomChannelRow = { channel: string; nights: number; revenue: number; reservations: number; rooms: Array<{ room: number; nights: number; revenue: number; reservations: number }> };
type Snapshot = { revenue: number; lodgingRevenue: number; extras: number; expenses: number; gop: number; margin: number; occupiedNights: number; occupancy: number; adr: number; revpar: number; ticket: number; reservations: number; guests: number; hasData: boolean };

const TABS: Array<{ key: TabKey; label: string; icon: typeof BarChart3 }> = [
  { key: "resumo", label: "Resumo", icon: BarChart3 },
  { key: "hospedes", label: "Hóspedes", icon: Users },
  { key: "quartos", label: "Quartos", icon: BedDouble },
  { key: "despesas", label: "Despesas", icon: ReceiptText },
  { key: "canais", label: "Canais", icon: CircleDollarSign },
];
const DONUT_COLORS = [
  "var(--primary)",
  "color-mix(in srgb, var(--primary) 72%, white)",
  "color-mix(in srgb, var(--primary) 52%, var(--foreground))",
  "color-mix(in srgb, var(--primary) 36%, var(--muted-foreground))",
  "color-mix(in srgb, var(--primary) 22%, var(--border))",
  "var(--muted-foreground)",
];

export function PainelAtraenteDashboardV5() {
  const dashboardRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<TabKey>("resumo");
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>("previous_month");
  const [isFullscreen, setIsFullscreen] = useState(false);

  const today = todayISO();
  const currentCompany = useCurrentCompany();
  const { data: rooms = [] } = useRooms();
  const { data: clients = [] } = useClients();
  const { data: reservations = [] } = useReservations();
  const { data: sales = [] } = useSales();
  const { data: expenses = [] } = useExpenses();
  const { data: rawFeedbacks = [] } = useFeedbacks();
  const feedbacks = rawFeedbacks as Array<any>;

  const monthStart = `${today.slice(0, 7)}-01`;
  const nextMonth = nextMonthISO(monthStart);
  const comparisonStart = comparisonMode === "previous_month" ? previousMonthISO(monthStart) : sameMonthPreviousYearISO(monthStart);
  const comparisonEnd = nextMonthISO(comparisonStart);
  const monthLabel = formatMonthLabel(monthStart);
  const comparisonLabel = formatMonthLabel(comparisonStart);
  const daysInMonth = Math.max(1, nightsBetween(monthStart, nextMonth));

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

  const monthReservations = useMemo(() => reservations.filter((r) => isOperational(r) && r.checkin < nextMonth && r.checkout > monthStart), [reservations, monthStart, nextMonth]);
  const current = useMemo(() => calculateSnapshot(monthStart, nextMonth, reservations, sales, expenses, rooms.length), [monthStart, nextMonth, reservations, sales, expenses, rooms.length]);
  const previous = useMemo(() => calculateSnapshot(comparisonStart, comparisonEnd, reservations, sales, expenses, rooms.length), [comparisonStart, comparisonEnd, reservations, sales, expenses, rooms.length]);
  const activeStays = reservations.filter((r) => isOperational(r) && ["ocupado", "saida_pendente"].includes(normalize(r.status)) && r.checkin <= today && r.checkout > today);
  const currentOccupancy = rooms.length ? (new Set(activeStays.map((r) => r.quarto)).size / rooms.length) * 100 : 0;

  const averageScore = useMemo(() => {
    const scores = feedbacks.filter((f) => String(f.created_at ?? "").slice(0, 7) === today.slice(0, 7)).map((f) => Number(f.nota_geral)).filter((v) => Number.isFinite(v) && v > 0);
    return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  }, [feedbacks, today]);

  const revenueByPayment = useMemo(() => buildRevenueByPayment(monthStart, nextMonth, monthReservations, sales), [monthStart, nextMonth, monthReservations, sales]);
  const revenueByChannel = useMemo(() => buildRevenueByChannel(monthStart, nextMonth, monthReservations), [monthStart, nextMonth, monthReservations]);
  const roomNightsByChannel = useMemo(() => buildRoomNightsByChannel(monthStart, nextMonth, monthReservations), [monthStart, nextMonth, monthReservations]);
  const roomChannels = useMemo(() => buildRoomsByChannel(monthStart, nextMonth, monthReservations), [monthStart, nextMonth, monthReservations]);
  const expenseByCategory = useMemo(() => buildExpenseByCategory(monthStart, nextMonth, expenses), [monthStart, nextMonth, expenses]);
  const roomRows = useMemo(() => buildRoomRows(monthStart, nextMonth, monthReservations, daysInMonth), [monthStart, nextMonth, monthReservations, daysInMonth]);
  const guestSpendRows = useMemo(() => buildGuestSpendRows(monthStart, nextMonth, monthReservations, sales, clients), [monthStart, nextMonth, monthReservations, sales, clients]);
  const productBuyers = useMemo(() => guestSpendRows.filter((r) => r.products > 0).sort((a, b) => b.products - a.products), [guestSpendRows]);
  const productRevenue = productBuyers.reduce((s, r) => s + r.products, 0);
  const averageGuestRevenue = guestSpendRows.length ? guestSpendRows.reduce((s, r) => s + r.total, 0) / guestSpendRows.length : 0;

  const guestProfiles = useMemo(() => {
    const ids = new Set(monthReservations.map((r) => r.cliente_id).filter(Boolean));
    return clients.filter((c) => ids.has(c.id));
  }, [clients, monthReservations]);
  const sexDistribution = useMemo(() => distribution(guestProfiles.map((c) => labelOf(c.sexo, "Não informado"))), [guestProfiles]);
  const civilDistribution = useMemo(() => distribution(guestProfiles.map((c) => labelOf(c.estado_civil, "Não informado"))), [guestProfiles]);
  const stateDistribution = useMemo(() => distribution(guestProfiles.map((c) => labelOf(c.estado, "Não informado")), 8), [guestProfiles]);
  const ageDistribution = useMemo(() => buildAgeDistribution(guestProfiles, today), [guestProfiles, today]);
  const ages = guestProfiles.map((c) => ageFromBirthDate(c.data_nascimento, today)).filter((a): a is number => a !== null);
  const averageAge = ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : 0;

  const dailyTrend = useMemo(() => buildDailyTrend(monthStart, nextMonth, monthReservations, sales, expenses), [monthStart, nextMonth, monthReservations, sales, expenses]);
  const occupancyTrend = useMemo(() => buildOccupancyTrend(today, reservations, rooms.length), [today, reservations, rooms.length]);
  const revenueRoomRanking = [...roomRows].sort((a, b) => b.revenue - a.revenue);
  const occupancyRoomRanking = [...roomRows].sort((a, b) => b.occupancy - a.occupancy || b.nights - a.nights);
  const ticketRoomRanking = [...roomRows].sort((a, b) => b.ticket - a.ticket || b.revenue - a.revenue);

  const comparisonRows = [
    metric("Receita", current.revenue, previous.revenue, true, true),
    metric("Despesas", current.expenses, previous.expenses, false, true),
    metric("GOP", current.gop, previous.gop, true, true),
    metric("Margem", current.margin, previous.margin, true, false),
    metric("Ticket médio", current.ticket, previous.ticket, true, true),
    metric("Ocupação", current.occupancy, previous.occupancy, true, false),
  ];
  const summaryKpis = [
    { label: "Receita", value: fmtBRL(current.revenue), hint: `${fmtBRL(current.lodgingRevenue)} hospedagem` },
    { label: "Despesas", value: fmtBRL(current.expenses), hint: `${formatNumber(current.revenue ? (current.expenses / current.revenue) * 100 : 0, 1)}% da receita` },
    { label: "GOP", value: fmtBRL(current.gop), hint: "resultado operacional" },
    { label: "Margem", value: `${formatNumber(current.margin, 1)}%`, hint: "GOP / receita" },
    { label: "Ticket médio", value: fmtBRL(current.ticket), hint: `${current.reservations} reservas` },
    { label: "Ocupação mês", value: `${formatNumber(current.occupancy, 1)}%`, hint: `hoje ${formatNumber(currentOccupancy, 0)}%` },
    { label: "ADR", value: fmtBRL(current.adr), hint: `${current.occupiedNights} diárias` },
    { label: "RevPAR", value: fmtBRL(current.revpar), hint: "receita por UH disponível" },
  ];

  return <div ref={dashboardRef} className="painel-v2-shell painel-v4-shell min-h-full overflow-hidden">
    <header className="painel-v2-header painel-v4-header border-b border-border bg-primary text-primary-foreground">
      <div className="painel-v4-header-inner mx-auto flex max-w-[2400px] flex-wrap items-center gap-2">
        <div className="flex min-w-0 items-center gap-2"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary-foreground/15"><Building2 className="h-4 w-4" /></span><div className="min-w-0"><p className="truncate text-sm font-extrabold sm:text-base">{currentCompany.data?.nome ?? "HospedaMais"}</p><p className="truncate text-[9px] font-semibold uppercase tracking-[0.12em] opacity-70">Business Intelligence · {monthLabel} · {fmtDate(today)}</p></div></div>
        <nav className="painel-v4-tabs">{TABS.map(({ key, label, icon: Icon }) => <button key={key} type="button" onClick={() => setTab(key)} className={`painel-v4-tab ${tab === key ? "is-active" : ""}`}><Icon className="h-3.5 w-3.5" /><span>{label}</span></button>)}</nav>
        <div className="painel-v4-actions ml-auto flex items-center gap-1.5"><a href="/reservas" className="painel-v4-action">Operação</a><button type="button" onClick={() => void toggleFullscreen()} className="painel-v4-action inline-flex items-center gap-1.5">{isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}<span className="painel-v4-action-label">{isFullscreen ? "Sair" : "Tela inteira"}</span></button></div>
      </div>
    </header>

    <main className="painel-v2-content painel-v4-content mx-auto flex max-w-[2400px] flex-col">
      {tab === "resumo" && <>
        <section className="painel-v4-kpi-grid">{summaryKpis.map((k) => <Kpi key={k.label} {...k} />)}</section>
        <section className="painel-v4-summary-grid">
          <Panel title="Receita e despesas por dia" subtitle="Todos os dias do mês · linhas pontilhadas = média móvel de 7 dias"><DailyTrendChart data={dailyTrend} /></Panel>
          <Panel title="Comparação" subtitle={`${monthLabel} x ${comparisonLabel}`} action={<div className="flex rounded-lg bg-muted p-1"><button type="button" onClick={() => setComparisonMode("previous_month")} className={`rounded px-2 py-1 text-[9px] font-bold ${comparisonMode === "previous_month" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Mês anterior</button><button type="button" onClick={() => setComparisonMode("previous_year")} className={`rounded px-2 py-1 text-[9px] font-bold ${comparisonMode === "previous_year" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Ano anterior</button></div>}><div className="painel-v4-comparison-grid">{comparisonRows.map((r) => <Comparison key={r.label} {...r} hasBase={previous.hasData} />)}</div>{!previous.hasData && <p className="mt-2 rounded-lg border border-dashed p-2 text-[9px] text-muted-foreground">Sem base suficiente em {comparisonLabel}.</p>}</Panel>
        </section>
        <section className="painel-v4-card-grid"><DonutPanel title="Receita por canal" rows={revenueByChannel} valueFormatter={fmtBRL} /><DonutPanel title="Receita por pagamento" rows={revenueByPayment} valueFormatter={fmtBRL} /><Panel title="Ocupação" subtitle="Últimos 7 dias"><SmallOccupancy data={occupancyTrend} /></Panel><Panel title="Leitura rápida" subtitle="Indicadores complementares"><div className="grid grid-cols-2 gap-2"><Mini label="Hóspedes" value={String(current.guests)} /><Mini label="Nota média" value={averageScore ? averageScore.toFixed(1).replace(".", ",") : "—"} /><Mini label="Produtos/Extras" value={fmtBRL(current.extras)} /><Mini label="Diárias" value={String(current.occupiedNights)} /></div></Panel></section>
      </>}

      {tab === "hospedes" && <>
        <section className="painel-v4-kpi-grid painel-v4-kpi-grid-6"><Kpi label="Hóspedes com receita" value={String(guestSpendRows.length)} hint="titulares/reservas identificados" /><Kpi label="Receita média/hóspede" value={fmtBRL(averageGuestRevenue)} hint="diárias + produtos" /><Kpi label="Compraram produtos" value={String(productBuyers.length)} hint={`${fmtBRL(productRevenue)} em consumos`} /><Kpi label="Idade média" value={averageAge ? `${formatNumber(averageAge, 1)} anos` : "—"} hint="cadastros com nascimento" /><Kpi label="Estados" value={String(stateDistribution.filter((r) => r.name !== "Não informado").length)} hint="origens identificadas" /><Kpi label="Satisfação" value={averageScore ? `${formatNumber((averageScore / 5) * 100, 0)}%` : "—"} hint={averageScore ? `nota ${formatNumber(averageScore, 1)}/5` : "sem avaliações"} /></section>
        <section className="painel-v4-guest-grid"><Panel title="Receita por hóspede" subtitle="Diárias + produtos/consumos"><Ranking rows={guestSpendRows.slice(0, 12).map((r) => ({ label: r.name, value: r.total, text: `${fmtBRL(r.lodging)} diárias · ${fmtBRL(r.products)} produtos` }))} money /></Panel><Panel title="Hóspedes que compraram produtos" subtitle="Quem consumiu além das diárias"><BuyerList rows={productBuyers.slice(0, 12)} /></Panel></section>
        <section className="painel-v4-card-grid"><DonutPanel title="Sexo" rows={sexDistribution} valueFormatter={(v) => `${v} hóspedes`} /><DonutPanel title="Faixa etária" rows={ageDistribution} valueFormatter={(v) => `${v} hóspedes`} /><DonutPanel title="Estado civil" rows={civilDistribution} valueFormatter={(v) => `${v} hóspedes`} /><Panel title="Estado de origem" subtitle="Ranking por UF"><Ranking rows={stateDistribution.map((r) => ({ label: r.name, value: r.value, text: `${formatNumber(r.share, 0)}%` }))} /></Panel></section>
      </>}

      {tab === "quartos" && <>
        <section className="painel-v4-kpi-grid"><Kpi label="Receita de quartos" value={fmtBRL(current.lodgingRevenue)} hint="somente hospedagem" /><Kpi label="ADR" value={fmtBRL(current.adr)} hint="receita / diárias ocupadas" /><Kpi label="RevPAR" value={fmtBRL(current.revpar)} hint="receita / UHs disponíveis" /><Kpi label="Ocupação" value={`${formatNumber(current.occupancy, 1)}%`} hint={`${current.occupiedNights} diárias ocupadas`} /></section>
        <section className="painel-v4-room-grid"><Panel title="Receita por quarto" subtitle="Ranking visual de faturamento das UHs no mês"><RoomRevenueChart rows={revenueRoomRanking} /></Panel><div className="painel-v4-room-rankings"><Panel title="Ranking por ocupação" subtitle="UHs com maior percentual de noites ocupadas"><Ranking rows={occupancyRoomRanking.map((r) => ({ label: `UH ${r.room}`, value: r.occupancy, text: `${r.nights} diárias` }))} percent /></Panel><Panel title="Ticket médio por quarto" subtitle="Receita média por reserva em cada UH"><Ranking rows={ticketRoomRanking.map((r) => ({ label: `UH ${r.room}`, value: r.ticket, text: `${r.reservations} reserva(s)` }))} money /></Panel></div></section>
        <section className="painel-v4-two-grid"><DonutPanel title="Quartos por canal de vendas" rows={roomNightsByChannel} valueFormatter={(v) => `${formatNumber(v, 0)} diárias`} large /><Panel title="Quais quartos cada canal vendeu" subtitle="UH, diárias e receita por origem da reserva"><RoomChannelList rows={roomChannels} /></Panel></section>
      </>}

      {tab === "despesas" && <>
        <section className="painel-v4-kpi-grid"><Kpi label="Despesas operacionais" value={fmtBRL(current.expenses)} hint="retiradas financeiras excluídas" /><Kpi label="% da receita" value={`${formatNumber(current.revenue ? (current.expenses / current.revenue) * 100 : 0, 1)}%`} hint="peso das despesas" /><Kpi label="GOP" value={fmtBRL(current.gop)} hint="receita − despesas" /><Kpi label="Margem GOP" value={`${formatNumber(current.margin, 1)}%`} hint="resultado operacional" /></section>
        <section className="painel-v4-expense-grid"><DonutPanel title="Despesas por categoria" rows={expenseByCategory} valueFormatter={fmtBRL} large /><Panel title="Receita e despesas por dia" subtitle="Movimento diário + média móvel de 7 dias"><DailyTrendChart data={dailyTrend} /></Panel></section>
      </>}

      {tab === "canais" && <>
        <section className="painel-v4-kpi-grid"><Kpi label="Canais ativos" value={String(revenueByChannel.length)} hint="com receita no mês" /><Kpi label="Maior canal" value={revenueByChannel[0]?.name ?? "—"} hint={revenueByChannel[0] ? `${formatNumber(revenueByChannel[0].share, 0)}% da receita` : "sem base"} /><Kpi label="Receita de hospedagem" value={fmtBRL(current.lodgingRevenue)} hint="distribuída por canal" /><Kpi label="Diárias vendidas" value={String(current.occupiedNights)} hint="quartos/noites por canal" /></section>
        <section className="painel-v4-channel-grid"><DonutPanel title="Receita por canal" rows={revenueByChannel} valueFormatter={fmtBRL} large /><DonutPanel title="Quartos por canal" rows={roomNightsByChannel} valueFormatter={(v) => `${formatNumber(v, 0)} diárias`} large /><DonutPanel title="Receita por pagamento" rows={revenueByPayment} valueFormatter={fmtBRL} large /></section>
        <section className="painel-v4-two-grid"><Panel title="Ranking de canais por receita"><Ranking rows={revenueByChannel.map((r) => ({ label: r.name, value: r.value, text: `${formatNumber(r.share, 1)}%` }))} money /></Panel><Panel title="Ranking de canais por quartos/noites"><Ranking rows={roomNightsByChannel.map((r) => ({ label: r.name, value: r.value, text: `${formatNumber(r.share, 1)}%` }))} /></Panel></section>
      </>}
    </main>
  </div>;
}

function Panel({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) { return <article className="painel-v4-panel min-w-0 rounded-xl border border-border bg-card"><div className="mb-2 flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h2 className="text-xs font-extrabold">{title}</h2>{subtitle && <p className="mt-0.5 text-[8px] text-muted-foreground">{subtitle}</p>}</div>{action}</div>{children}</article>; }
function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) { return <article className="painel-v2-kpi painel-v4-kpi min-w-0"><p className="truncate text-[8px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">{label}</p><p className="painel-v2-kpi-value truncate" title={value}>{value}</p><p className="painel-v4-kpi-hint mt-1 truncate text-[8px] text-muted-foreground" title={hint}>{hint}</p></article>; }
function Mini({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-border bg-background/60 p-2"><p className="text-[8px] font-bold uppercase text-muted-foreground">{label}</p><p className="mt-1 font-mono text-sm font-extrabold">{value}</p></div>; }
function DonutPanel({ title, rows, valueFormatter, large = false }: { title: string; rows: DonutRow[]; valueFormatter: (v: number) => string; large?: boolean }) { const total = rows.reduce((s, r) => s + r.value, 0); return <Panel title={title} subtitle={total ? `Total ${valueFormatter(total)}` : "Sem dados no período"}>{rows.length ? <div className={`painel-v4-donut-layout ${large ? "is-large" : ""}`}><div className="painel-v4-donut-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Tooltip contentStyle={tooltipStyle} formatter={(v) => [valueFormatter(Number(v)), title]} /><Pie data={rows} dataKey="value" nameKey="name" innerRadius="54%" outerRadius="82%" paddingAngle={2} stroke="var(--card)" strokeWidth={2}>{rows.map((r, i) => <Cell key={`${r.name}-${i}`} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}</Pie></PieChart></ResponsiveContainer></div><div className="space-y-1.5">{rows.slice(0, 7).map((r, i) => <div key={r.name} className="flex items-center gap-2 text-[9px]"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} /><span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span><span className="shrink-0 font-mono text-muted-foreground">{formatNumber(r.share, 0)}%</span></div>)}</div></div> : <Empty />}</Panel>; }
function Ranking({ rows, money = false, percent = false }: { rows: Array<{ label: string; value: number; text?: string }>; money?: boolean; percent?: boolean }) { if (!rows.length) return <Empty />; const max = Math.max(1, ...rows.map((r) => r.value)); return <div className="painel-v4-ranking">{rows.slice(0, 12).map((r, i) => <div key={`${r.label}-${i}`} className="painel-v4-ranking-row"><div className="mb-1 flex items-center justify-between gap-2 text-[9px]"><span className="truncate font-bold">{r.label}</span><span className="shrink-0 font-mono text-muted-foreground">{money ? fmtBRL(r.value) : percent ? `${formatNumber(r.value, 1)}%` : formatNumber(r.value, Number.isInteger(r.value) ? 0 : 1)} {r.text ? `· ${r.text}` : ""}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(r.value / max) * 100}%` }} /></div></div>)}</div>; }
function BuyerList({ rows }: { rows: GuestSpendRow[] }) { if (!rows.length) return <Empty text="Nenhum hóspede com compra vinculada." />; return <div className="painel-v4-buyer-list">{rows.map((r, i) => <div key={r.key} className="painel-v4-buyer-row"><span className="painel-v4-rank">#{i + 1}</span><div className="min-w-0"><p className="truncate text-[10px] font-extrabold">{r.name}</p><p className="truncate text-[8px] text-muted-foreground">{r.items.length ? r.items.join(" · ") : `${r.purchases} compra(s)`}</p></div><div className="text-right"><strong className="block font-mono text-[10px] text-primary">{fmtBRL(r.products)}</strong><span className="text-[8px] text-muted-foreground">total {fmtBRL(r.total)}</span></div></div>)}</div>; }
function RoomChannelList({ rows }: { rows: RoomChannelRow[] }) { if (!rows.length) return <Empty text="Sem reservas com canal identificado no período." />; return <div className="space-y-2">{rows.slice(0, 8).map((row, index) => <div key={row.channel} className="rounded-lg border border-border bg-background/55 p-2"><div className="mb-1.5 flex items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="grid h-5 w-5 place-items-center rounded-full bg-primary/10 text-[8px] font-black text-primary">{index + 1}</span><strong className="text-[10px]">{row.channel}</strong></div><span className="font-mono text-[9px] text-muted-foreground">{row.nights} diárias · {fmtBRL(row.revenue)}</span></div><div className="flex flex-wrap gap-1">{row.rooms.slice(0, 12).map((room) => <span key={`${row.channel}-${room.room}`} className="rounded-md border border-border bg-card px-1.5 py-1 text-[8px] font-semibold" title={`${room.nights} diária(s) · ${room.reservations} reserva(s) · ${fmtBRL(room.revenue)}`}>UH {room.room} <span className="text-muted-foreground">· {room.nights}d</span></span>)}</div></div>)}</div>; }
function RoomRevenueChart({ rows }: { rows: RoomRow[] }) { return <div className="painel-v4-chart-tall"><ResponsiveContainer width="100%" height="100%"><BarChart data={rows.slice(0, 16)} layout="vertical" margin={{ top: 4, right: 20, left: 4, bottom: 0 }}><CartesianGrid horizontal={false} stroke="var(--border)" /><XAxis type="number" axisLine={false} tickLine={false} tickFormatter={compactBRL} tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} /><YAxis type="category" dataKey="label" width={55} axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} /><Tooltip contentStyle={tooltipStyle} formatter={(v) => [fmtBRL(Number(v)), "Receita"]} /><Bar dataKey="receita" fill="var(--primary)" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></div>; }
function SmallOccupancy({ data }: { data: Array<{ dia: string; ocupacao: number }> }) { return <div className="painel-v4-chart-small"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={data} margin={{ top: 6, right: 5, left: -18, bottom: 0 }}><CartesianGrid vertical={false} stroke="var(--border)" /><XAxis dataKey="dia" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} /><YAxis domain={[0, 100]} axisLine={false} tickLine={false} width={38} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} /><Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v}%`, "Ocupação"]} /><Area type="monotone" dataKey="ocupacao" stroke="var(--primary)" fill="color-mix(in srgb, var(--primary) 14%, transparent)" strokeWidth={2} /></ComposedChart></ResponsiveContainer></div>; }
function DailyTrendChart({ data }: { data: DailyTrendRow[] }) { return <div className="painel-v4-daily-scroll"><div className="painel-v4-daily-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={data} margin={{ top: 8, right: 10, left: -8, bottom: 2 }}><CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.7} /><XAxis dataKey="dia" interval={0} axisLine={false} tickLine={false} height={24} tick={{ fontSize: 8, fill: "var(--muted-foreground)" }} /><YAxis axisLine={false} tickLine={false} width={58} tickFormatter={compactBRL} tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} /><Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => `Dia ${l}`} formatter={(v, n) => [fmtBRL(Number(v)), trendLabel(String(n))]} /><Area type="monotone" dataKey="Receita" stroke="var(--primary)" fill="color-mix(in srgb, var(--primary) 13%, transparent)" strokeWidth={1.5} dot={false} /><Area type="monotone" dataKey="Despesas" stroke="var(--destructive)" fill="color-mix(in srgb, var(--destructive) 8%, transparent)" strokeWidth={1.4} dot={false} /><Line type="monotone" dataKey="MediaReceita" stroke="var(--primary)" strokeWidth={2.6} strokeDasharray="6 4" dot={false} /><Line type="monotone" dataKey="MediaDespesas" stroke="var(--destructive)" strokeWidth={2.3} strokeDasharray="3 4" dot={false} /></ComposedChart></ResponsiveContainer></div><div className="painel-v4-chart-legend"><span><i className="bg-primary" /> Receita diária</span><span><i className="bg-destructive" /> Despesa diária</span><span><i className="border-t-2 border-dashed border-primary" /> Média móvel da receita (7 dias)</span><span><i className="border-t-2 border-dashed border-destructive" /> Média móvel das despesas (7 dias)</span></div></div>; }
function Comparison({ label, current, previous, delta, unit, favorable, hasBase }: { label: string; current: string; previous: string; delta: number | null; unit: string; favorable: boolean | null; hasBase: boolean }) { const text = !hasBase || delta === null ? "sem base" : `${delta >= 0 ? "+" : ""}${formatNumber(delta, 1)}${unit}`; return <div className="rounded-lg border border-border bg-background/55 p-2"><div className="flex items-start justify-between gap-1"><p className="truncate text-[8px] font-extrabold uppercase text-muted-foreground">{label}</p><span className={`rounded-full px-1.5 py-0.5 text-[8px] font-extrabold ${favorable === null || !hasBase ? "bg-muted text-muted-foreground" : favorable ? "bg-emerald-500/10 text-emerald-700" : "bg-destructive/10 text-destructive"}`}>{text}</span></div><p className="mt-1 truncate font-mono text-sm font-extrabold">{current}</p><p className="mt-0.5 truncate text-[8px] text-muted-foreground">base: {hasBase ? previous : "sem dados"}</p></div>; }
function Empty({ text = "Sem dados suficientes no período." }: { text?: string }) { return <div className="grid h-28 place-items-center rounded-lg border border-dashed border-border px-3 text-center text-[9px] text-muted-foreground">{text}</div>; }

function calculateSnapshot(start: string, end: string, reservations: Reservation[], sales: Sale[], expenses: Expense[], roomCount: number): Snapshot { const overlapping = reservations.filter((r) => isOperational(r) && r.checkin < end && r.checkout > start); let lodgingRevenue = 0, occupiedNights = 0, guests = 0; overlapping.forEach((r) => { const totalNights = Math.max(1, nightsBetween(r.checkin, r.checkout)); const overlap = overlapNights(r.checkin, r.checkout, start, end); lodgingRevenue += Number(r.valor_total ?? 0) * (overlap / totalNights); occupiedNights += overlap; guests += Math.max(1, Number(r.pessoas ?? 1)); }); const extras = sales.filter((s) => s.data >= start && s.data < end && normalize(s.status) !== "cancelado").reduce((s, x) => s + Number(x.total ?? 0), 0); const operatingExpenses = expenses.filter((e) => e.data >= start && e.data < end && !isFinancialMovement(e.categoria, e.descricao)).reduce((s, x) => s + Number(x.valor ?? 0), 0); const revenue = lodgingRevenue + extras; const days = Math.max(1, nightsBetween(start, end)); const available = roomCount * days; const gop = revenue - operatingExpenses; return { revenue, lodgingRevenue, extras, expenses: operatingExpenses, gop, margin: revenue ? (gop / revenue) * 100 : 0, occupiedNights, occupancy: available ? Math.min(100, (occupiedNights / available) * 100) : 0, adr: occupiedNights ? lodgingRevenue / occupiedNights : 0, revpar: available ? lodgingRevenue / available : 0, ticket: overlapping.length ? revenue / overlapping.length : 0, reservations: overlapping.length, guests, hasData: overlapping.length > 0 || extras > 0 || operatingExpenses > 0 }; }
function buildRevenueByPayment(start: string, end: string, reservations: Reservation[], sales: Sale[]) { const map = new Map<string, number>(); reservations.forEach((r) => { const overlap = overlapNights(r.checkin, r.checkout, start, end); if (!overlap) return; add(map, labelOf(r.pagamento, "Não informado"), proportionalRevenue(r, overlap)); }); sales.filter((s) => s.data >= start && s.data < end && normalize(s.status) !== "cancelado").forEach((s) => add(map, labelOf(s.pagamento, "Não informado"), Number(s.total ?? 0))); return mapToDonut(map); }
function buildRevenueByChannel(start: string, end: string, reservations: Reservation[]) { const map = new Map<string, number>(); reservations.forEach((r) => { const overlap = overlapNights(r.checkin, r.checkout, start, end); if (overlap) add(map, labelOf(r.canal, "Hotel Direto"), proportionalRevenue(r, overlap)); }); return mapToDonut(map); }
function buildRoomNightsByChannel(start: string, end: string, reservations: Reservation[]) { const map = new Map<string, number>(); reservations.forEach((r) => { const overlap = overlapNights(r.checkin, r.checkout, start, end); if (overlap) add(map, labelOf(r.canal, "Hotel Direto"), overlap); }); return mapToDonut(map); }
function buildRoomsByChannel(start: string, end: string, reservations: Reservation[]): RoomChannelRow[] { const channelMap = new Map<string, { nights: number; revenue: number; reservations: number; rooms: Map<number, { room: number; nights: number; revenue: number; reservations: number }> }>(); reservations.forEach((r) => { const overlap = overlapNights(r.checkin, r.checkout, start, end); if (!overlap) return; const channel = labelOf(r.canal, "Hotel Direto"); const revenue = proportionalRevenue(r, overlap); const group = channelMap.get(channel) ?? { nights: 0, revenue: 0, reservations: 0, rooms: new Map() }; group.nights += overlap; group.revenue += revenue; group.reservations += 1; const room = group.rooms.get(r.quarto) ?? { room: r.quarto, nights: 0, revenue: 0, reservations: 0 }; room.nights += overlap; room.revenue += revenue; room.reservations += 1; group.rooms.set(r.quarto, room); channelMap.set(channel, group); }); return [...channelMap.entries()].map(([channel, g]) => ({ channel, nights: g.nights, revenue: g.revenue, reservations: g.reservations, rooms: [...g.rooms.values()].sort((a, b) => b.nights - a.nights || b.revenue - a.revenue) })).sort((a, b) => b.nights - a.nights || b.revenue - a.revenue); }
function buildExpenseByCategory(start: string, end: string, expenses: Expense[]) { const map = new Map<string, number>(); expenses.filter((e) => e.data >= start && e.data < end && !isFinancialMovement(e.categoria, e.descricao)).forEach((e) => add(map, labelOf(e.categoria, "Geral"), Number(e.valor ?? 0))); return mapToDonut(map); }
function buildRoomRows(start: string, end: string, reservations: Reservation[], daysInMonth: number): RoomRow[] { const map = new Map<number, RoomRow>(); reservations.forEach((r) => { const overlap = overlapNights(r.checkin, r.checkout, start, end); if (!overlap) return; const current = map.get(r.quarto) ?? { room: r.quarto, label: `UH ${r.quarto}`, revenue: 0, receita: 0, nights: 0, occupancy: 0, reservations: 0, ticket: 0 }; current.revenue += proportionalRevenue(r, overlap); current.nights += overlap; current.reservations += 1; current.occupancy = Math.min(100, (current.nights / daysInMonth) * 100); current.ticket = current.reservations ? current.revenue / current.reservations : 0; current.receita = current.revenue; map.set(r.quarto, current); }); return [...map.values()].sort((a, b) => b.revenue - a.revenue); }
function buildGuestSpendRows(start: string, end: string, reservations: Reservation[], sales: Sale[], clients: Client[]): GuestSpendRow[] { const names = new Map(clients.map((c) => [c.id, c.nome])); const map = new Map<string, GuestSpendRow>(); reservations.forEach((r) => { const overlap = overlapNights(r.checkin, r.checkout, start, end); if (!overlap) return; const key = String(r.cliente_id || r.id); const row = map.get(key) ?? { key, name: names.get(r.cliente_id || "") || r.cliente_nome || "Hóspede", lodging: 0, products: 0, total: 0, items: [], purchases: 0 }; row.lodging += proportionalRevenue(r, overlap); map.set(key, row); }); sales.filter((s) => s.data >= start && s.data < end && normalize(s.status) !== "cancelado").forEach((s: any) => { const reservation = reservations.find((r) => r.id === s.reserva_id); const key = String(s.cliente_id || reservation?.cliente_id || s.reserva_id || s.id); const row = map.get(key) ?? { key, name: names.get(s.cliente_id || "") || s.comprador_nome || reservation?.cliente_nome || "Hóspede", lodging: 0, products: 0, total: 0, items: [], purchases: 0 }; row.products += Number(s.total ?? 0); row.purchases += 1; if (s.item && !row.items.includes(String(s.item))) row.items.push(String(s.item)); map.set(key, row); }); return [...map.values()].map((r) => ({ ...r, total: r.lodging + r.products })).sort((a, b) => b.total - a.total); }
function buildDailyTrend(start: string, end: string, reservations: Reservation[], sales: Sale[], expenses: Expense[]): DailyTrendRow[] { const days: DailyTrendRow[] = []; for (let d = start; d < end; d = addDays(d, 1)) days.push({ data: d, dia: d.slice(8, 10), Receita: 0, Despesas: 0, MediaReceita: 0, MediaDespesas: 0 }); const index = new Map(days.map((r, i) => [r.data, i])); reservations.forEach((r) => { const nights = Math.max(1, nightsBetween(r.checkin, r.checkout)); const nightly = Number(r.valor_total ?? 0) / nights; for (let d = maxISO(r.checkin, start); d < minISO(r.checkout, end); d = addDays(d, 1)) { const i = index.get(d); if (i !== undefined) days[i].Receita += nightly; } }); sales.filter((s) => s.data >= start && s.data < end && normalize(s.status) !== "cancelado").forEach((s) => { const i = index.get(s.data); if (i !== undefined) days[i].Receita += Number(s.total ?? 0); }); expenses.filter((e) => e.data >= start && e.data < end && !isFinancialMovement(e.categoria, e.descricao)).forEach((e) => { const i = index.get(e.data); if (i !== undefined) days[i].Despesas += Number(e.valor ?? 0); }); return days.map((r, i) => { const from = Math.max(0, i - 6); const slice = days.slice(from, i + 1); return { ...r, Receita: round2(r.Receita), Despesas: round2(r.Despesas), MediaReceita: round2(slice.reduce((s, x) => s + x.Receita, 0) / slice.length), MediaDespesas: round2(slice.reduce((s, x) => s + x.Despesas, 0) / slice.length) }; }); }
function buildOccupancyTrend(today: string, reservations: Reservation[], roomCount: number) { return Array.from({ length: 7 }, (_, i) => { const day = addDays(today, i - 6); const occupied = new Set(reservations.filter((r) => isOperational(r) && r.checkin <= day && r.checkout > day).map((r) => r.quarto)).size; return { dia: new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`)).replace(".", ""), ocupacao: roomCount ? Math.round((occupied / roomCount) * 100) : 0 }; }); }
function distribution(values: string[], limit = 6) { const map = new Map<string, number>(); values.forEach((v) => add(map, v, 1)); return mapToDonut(map).slice(0, limit); }
function buildAgeDistribution(clients: Client[], today: string) { return distribution(clients.map((c) => ageFromBirthDate(c.data_nascimento, today)).filter((a): a is number => a !== null).map((a) => a < 18 ? "Até 17" : a <= 25 ? "18–25" : a <= 35 ? "26–35" : a <= 45 ? "36–45" : a <= 60 ? "46–60" : "61+")); }
function mapToDonut(map: Map<string, number>): DonutRow[] { const total = [...map.values()].reduce((a, b) => a + b, 0); return [...map.entries()].map(([name, value]) => ({ name, value: round2(value), share: total ? (value / total) * 100 : 0 })).sort((a, b) => b.value - a.value); }
function metric(label: string, current: number, previous: number, favorableUp: boolean, money: boolean) { const delta = previous === 0 ? null : money ? ((current - previous) / Math.abs(previous)) * 100 : current - previous; const favorable = delta === null ? null : favorableUp ? delta >= 0 : delta <= 0; return { label, current: money ? fmtBRL(current) : `${formatNumber(current, 1)}%`, previous: money ? fmtBRL(previous) : `${formatNumber(previous, 1)}%`, delta, unit: money ? "%" : " p.p.", favorable }; }
function trendLabel(name: string) { return name === "MediaReceita" ? "Média móvel da receita (7 dias)" : name === "MediaDespesas" ? "Média móvel das despesas (7 dias)" : name; }
function proportionalRevenue(r: Reservation, overlap: number) { return Number(r.valor_total ?? 0) * (overlap / Math.max(1, nightsBetween(r.checkin, r.checkout))); }
function add(map: Map<string, number>, key: string, value: number) { map.set(key, (map.get(key) ?? 0) + value); }
function isOperational(r: Reservation) { return !["cancelado", "manutencao"].includes(normalize(r.status)); }
function isFinancialMovement(category?: string | null, description?: string | null) { const v = normalize(`${category ?? ""} ${description ?? ""}`); return v.includes("retirada") || v.includes("movimentacao financeira"); }
function labelOf(value: unknown, fallback: string) { const raw = String(value ?? "").trim(); return raw && raw !== "-" ? raw : fallback; }
function overlapNights(checkin: string, checkout: string, start: string, end: string) { const a = maxISO(checkin, start), b = minISO(checkout, end); return b > a ? Math.max(0, nightsBetween(a, b)) : 0; }
function ageFromBirthDate(birth: string | null | undefined, today: string) { if (!birth || !/^\d{4}-\d{2}-\d{2}$/.test(birth)) return null; let age = Number(today.slice(0, 4)) - Number(birth.slice(0, 4)); if (today.slice(5) < birth.slice(5)) age -= 1; return age >= 0 && age <= 120 ? age : null; }
function normalize(value: unknown) { return String(value ?? "").trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
function formatNumber(value: number, digits = 1) { return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number.isFinite(value) ? value : 0); }
function formatMonthLabel(value: string) { return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)).replace(".", ""); }
function nextMonthISO(start: string) { const [y, m] = start.split("-").map(Number); const d = new Date(Date.UTC(y, m, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`; }
function previousMonthISO(start: string) { const [y, m] = start.split("-").map(Number); const d = new Date(Date.UTC(y, m - 2, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`; }
function sameMonthPreviousYearISO(start: string) { return `${Number(start.slice(0, 4)) - 1}${start.slice(4)}`; }
function addDays(date: string, days: number) { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
function maxISO(a: string, b: string) { return a > b ? a : b; }
function minISO(a: string, b: string) { return a < b ? a : b; }
function compactBRL(value: number) { const v = Number(value); if (Math.abs(v) >= 1_000_000) return `R$${formatNumber(v / 1_000_000, 1)}M`; if (Math.abs(v) >= 1_000) return `R$${formatNumber(v / 1_000, 0)}k`; return `R$${formatNumber(v, 0)}`; }
function round2(v: number) { return Number(v.toFixed(2)); }
const tooltipStyle = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--foreground)", fontSize: 10 };
