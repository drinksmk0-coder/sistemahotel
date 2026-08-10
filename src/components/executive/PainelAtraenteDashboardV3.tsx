import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BarChart3,
  BedDouble,
  Building2,
  CalendarDays,
  CircleDollarSign,
  CreditCard,
  Maximize2,
  Minimize2,
  Percent,
  ReceiptText,
  TrendingUp,
  Users,
  WalletCards,
} from "lucide-react";
import {
  useClients,
  useCurrentCompany,
  useExpenses,
  useFeedbacks,
  useReservations,
  useRooms,
  useSales,
  type Client,
  type Expense,
  type Reservation,
  type Sale,
} from "@/lib/data";
import { fmtBRL, fmtDate, nightsBetween, todayISO } from "@/lib/format";

type TabKey = "resumo" | "hospedes" | "quartos" | "despesas" | "canais";
type ComparisonMode = "previous_month" | "previous_year";

type Snapshot = {
  revenue: number;
  lodgingRevenue: number;
  extras: number;
  expenses: number;
  gop: number;
  margin: number;
  occupiedNights: number;
  occupancy: number;
  adr: number;
  revpar: number;
  ticket: number;
  reservations: number;
  guests: number;
  hasData: boolean;
};

type DonutRow = { name: string; value: number; share: number };

type RoomRow = {
  room: number;
  revenue: number;
  nights: number;
  occupancy: number;
  reservations: number;
};

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
  "color-mix(in srgb, var(--primary) 48%, var(--foreground))",
  "color-mix(in srgb, var(--primary) 30%, var(--muted-foreground))",
  "color-mix(in srgb, var(--primary) 20%, var(--border))",
  "var(--muted-foreground)",
];

export function PainelAtraenteDashboardV3() {
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
  const comparisonStart = comparisonMode === "previous_month"
    ? previousMonthISO(monthStart)
    : sameMonthPreviousYearISO(monthStart);
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

  const current = useMemo(
    () => calculateSnapshot(monthStart, nextMonth, reservations, sales, expenses, rooms.length),
    [expenses, monthStart, nextMonth, reservations, rooms.length, sales],
  );
  const previous = useMemo(
    () => calculateSnapshot(comparisonStart, comparisonEnd, reservations, sales, expenses, rooms.length),
    [comparisonEnd, comparisonStart, expenses, reservations, rooms.length, sales],
  );

  const monthReservations = useMemo(
    () => reservations.filter((r) => isOperational(r) && r.checkin < nextMonth && r.checkout > monthStart),
    [monthStart, nextMonth, reservations],
  );

  const activeStays = reservations.filter(
    (r) => isOperational(r) && ["ocupado", "saida_pendente"].includes(normalize(r.status)) && r.checkin <= today && r.checkout > today,
  );
  const currentOccupancy = rooms.length
    ? (new Set(activeStays.map((r) => r.quarto)).size / rooms.length) * 100
    : 0;

  const averageScore = useMemo(() => {
    const scores = feedbacks
      .filter((f) => String(f.created_at ?? "").slice(0, 7) === today.slice(0, 7))
      .map((f) => Number(f.nota_geral))
      .filter((v) => Number.isFinite(v) && v > 0);
    return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  }, [feedbacks, today]);

  const revenueByPayment = useMemo(
    () => buildRevenueByPayment(monthStart, nextMonth, monthReservations, sales),
    [monthReservations, monthStart, nextMonth, sales],
  );
  const revenueByChannel = useMemo(
    () => buildRevenueByChannel(monthStart, nextMonth, monthReservations),
    [monthReservations, monthStart, nextMonth],
  );
  const roomNightsByChannel = useMemo(
    () => buildRoomNightsByChannel(monthStart, nextMonth, monthReservations),
    [monthReservations, monthStart, nextMonth],
  );
  const expenseByCategory = useMemo(
    () => buildExpenseByCategory(monthStart, nextMonth, expenses),
    [expenses, monthStart, nextMonth],
  );
  const roomRows = useMemo(
    () => buildRoomRows(monthStart, nextMonth, monthReservations, daysInMonth),
    [daysInMonth, monthReservations, monthStart, nextMonth],
  );

  const guestProfiles = useMemo(() => {
    const ids = new Set(monthReservations.map((r) => r.cliente_id).filter(Boolean));
    return clients.filter((client) => ids.has(client.id));
  }, [clients, monthReservations]);

  const sexDistribution = useMemo(
    () => distribution(guestProfiles.map((c) => labelOf(c.sexo, "Não informado"))),
    [guestProfiles],
  );
  const civilDistribution = useMemo(
    () => distribution(guestProfiles.map((c) => labelOf(c.estado_civil, "Não informado"))),
    [guestProfiles],
  );
  const stateDistribution = useMemo(
    () => distribution(guestProfiles.map((c) => labelOf(c.estado, "Não informado")), 8),
    [guestProfiles],
  );
  const ageDistribution = useMemo(() => buildAgeDistribution(guestProfiles, today), [guestProfiles, today]);
  const ages = guestProfiles
    .map((c) => ageFromBirthDate(c.data_nascimento, today))
    .filter((age): age is number => age !== null);
  const averageAge = ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : 0;

  const weeklyTrend = useMemo(
    () => buildWeeklyTrend(monthStart, nextMonth, monthReservations, sales, expenses),
    [expenses, monthReservations, monthStart, nextMonth, sales],
  );
  const occupancyTrend = useMemo(
    () => buildOccupancyTrend(today, reservations, rooms.length),
    [reservations, rooms.length, today],
  );

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

  return (
    <div ref={dashboardRef} className="painel-v2-shell min-h-full overflow-hidden">
      <header className="painel-v2-header border-b border-border bg-primary px-3 py-2.5 text-primary-foreground sm:px-4">
        <div className="mx-auto flex max-w-[1920px] flex-wrap items-center gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary-foreground/15"><Building2 className="h-4 w-4" /></span>
            <div>
              <p className="text-sm font-extrabold sm:text-base">{currentCompany.data?.nome ?? "HospedaMais"}</p>
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] opacity-70">Business Intelligence · {monthLabel} · {fmtDate(today)}</p>
            </div>
          </div>

          <nav className="order-3 flex w-full gap-1 overflow-x-auto pt-1 lg:order-none lg:ml-4 lg:w-auto lg:pt-0">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button key={key} type="button" onClick={() => setTab(key)} className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[10px] font-extrabold transition ${tab === key ? "bg-primary-foreground text-primary" : "border border-primary-foreground/20 hover:bg-primary-foreground/10"}`}>
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <a href="/reservas" className="inline-flex h-8 items-center rounded-lg border border-primary-foreground/25 px-2.5 text-[10px] font-bold hover:bg-primary-foreground/10">Operação</a>
            <button type="button" onClick={() => void toggleFullscreen()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-primary-foreground/25 px-2.5 text-[10px] font-bold hover:bg-primary-foreground/10">
              {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              {isFullscreen ? "Sair" : "Tela inteira"}
            </button>
          </div>
        </div>
      </header>

      <main className="painel-v2-content mx-auto flex max-w-[1920px] flex-col gap-2 p-2.5 sm:p-3.5">
        {tab === "resumo" && (
          <>
            <section className="grid grid-cols-2 gap-1.5 md:grid-cols-4 xl:grid-cols-8">
              {summaryKpis.map((kpi) => <Kpi key={kpi.label} {...kpi} />)}
            </section>

            <section className="grid gap-2 xl:grid-cols-[1.25fr_.75fr]">
              <Panel title="Receita, despesas e resultado" subtitle="Evolução semanal do mês">
                <div className="h-56 xl:h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={weeklyTrend} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                      <defs>
                        <linearGradient id="revArea" x1="0" x2="0" y1="0" y2="1"><stop offset="5%" stopColor="var(--primary)" stopOpacity={0.28}/><stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/></linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="semana" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} />
                      <YAxis axisLine={false} tickLine={false} width={56} tickFormatter={compactBRL} tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [fmtBRL(Number(value)), String(name)]} />
                      <Area type="monotone" dataKey="Receita" stroke="var(--primary)" fill="url(#revArea)" strokeWidth={2.4} />
                      <Area type="monotone" dataKey="Despesas" stroke="var(--destructive)" fill="transparent" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Panel>

              <Panel title="Comparação" subtitle={`${monthLabel} x ${comparisonLabel}`} action={
                <div className="flex rounded-lg bg-muted p-1">
                  <button type="button" onClick={() => setComparisonMode("previous_month")} className={`rounded px-2 py-1 text-[9px] font-bold ${comparisonMode === "previous_month" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Mês anterior</button>
                  <button type="button" onClick={() => setComparisonMode("previous_year")} className={`rounded px-2 py-1 text-[9px] font-bold ${comparisonMode === "previous_year" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Ano anterior</button>
                </div>
              }>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {comparisonRows.map((row) => <Comparison key={row.label} {...row} hasBase={previous.hasData} />)}
                </div>
                {!previous.hasData && <p className="mt-2 rounded-lg border border-dashed p-2 text-[9px] text-muted-foreground">Sem base suficiente em {comparisonLabel}. O painel não inventa comparação.</p>}
              </Panel>
            </section>

            <section className="grid gap-2 lg:grid-cols-2 xl:grid-cols-4">
              <DonutPanel title="Receita por canal" rows={revenueByChannel} valueFormatter={fmtBRL} />
              <DonutPanel title="Receita por pagamento" rows={revenueByPayment} valueFormatter={fmtBRL} />
              <Panel title="Ocupação" subtitle="Últimos 7 dias">
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={occupancyTrend} margin={{ top: 6, right: 5, left: -18, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="dia" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} />
                      <YAxis domain={[0, 100]} axisLine={false} tickLine={false} width={38} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v}%`, "Ocupação"]} />
                      <Area type="monotone" dataKey="ocupacao" stroke="var(--primary)" fill="color-mix(in srgb, var(--primary) 14%, transparent)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
              <Panel title="Leitura rápida" subtitle="Indicadores complementares">
                <div className="grid grid-cols-2 gap-2">
                  <Mini label="Hóspedes no mês" value={String(current.guests)} />
                  <Mini label="Nota média" value={averageScore ? averageScore.toFixed(1).replace(".", ",") : "—"} />
                  <Mini label="Extras" value={fmtBRL(current.extras)} />
                  <Mini label="Diárias" value={String(current.occupiedNights)} />
                </div>
              </Panel>
            </section>
          </>
        )}

        {tab === "hospedes" && (
          <>
            <section className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
              <Kpi label="Hóspedes únicos" value={String(guestProfiles.length)} hint="titulares vinculados às reservas do mês" />
              <Kpi label="Idade média" value={averageAge ? `${formatNumber(averageAge, 1)} anos` : "—"} hint="somente cadastros com nascimento" />
              <Kpi label="Estados" value={String(stateDistribution.filter((r) => r.name !== "Não informado").length)} hint="origens estaduais identificadas" />
              <Kpi label="Satisfação" value={averageScore ? `${formatNumber((averageScore / 5) * 100, 0)}%` : "—"} hint={averageScore ? `nota ${formatNumber(averageScore, 1)}/5` : "sem avaliações no mês"} />
            </section>
            <section className="grid gap-2 lg:grid-cols-2 xl:grid-cols-4">
              <DonutPanel title="Sexo" rows={sexDistribution} valueFormatter={(v) => `${v} hóspedes`} />
              <DonutPanel title="Faixa etária" rows={ageDistribution} valueFormatter={(v) => `${v} hóspedes`} />
              <DonutPanel title="Estado civil" rows={civilDistribution} valueFormatter={(v) => `${v} hóspedes`} />
              <Panel title="Estado de origem" subtitle="Ranking dos hóspedes por UF">
                <Ranking rows={stateDistribution.map((r) => ({ label: r.name, value: r.value, text: `${formatNumber(r.share, 0)}%` }))} />
              </Panel>
            </section>
          </>
        )}

        {tab === "quartos" && (
          <>
            <section className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
              <Kpi label="Receita de quartos" value={fmtBRL(current.lodgingRevenue)} hint="somente hospedagem" />
              <Kpi label="ADR" value={fmtBRL(current.adr)} hint="receita / diárias ocupadas" />
              <Kpi label="RevPAR" value={fmtBRL(current.revpar)} hint="receita / UHs disponíveis" />
              <Kpi label="Ocupação" value={`${formatNumber(current.occupancy, 1)}%`} hint={`${current.occupiedNights} diárias ocupadas`} />
            </section>
            <section className="grid gap-2 xl:grid-cols-[1.35fr_.65fr]">
              <Panel title="Receita por quarto" subtitle="Ranking de faturamento das UHs no mês">
                <div className="h-[420px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={roomRows.slice(0, 14)} layout="vertical" margin={{ top: 4, right: 20, left: 4, bottom: 0 }}>
                      <CartesianGrid horizontal={false} stroke="var(--border)" />
                      <XAxis type="number" axisLine={false} tickLine={false} tickFormatter={compactBRL} tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} />
                      <YAxis type="category" dataKey="label" width={54} axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v) => [fmtBRL(Number(v)), "Receita"]} />
                      <Bar dataKey="receita" fill="var(--primary)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
              <Panel title="Ranking das UHs" subtitle="Receita, ocupação e reservas">
                <div className="space-y-1.5">
                  {roomRows.slice(0, 12).map((row, index) => (
                    <div key={row.room} className="grid grid-cols-[28px_1fr_auto] items-center gap-2 rounded-lg border border-border bg-background/55 px-2 py-1.5">
                      <span className="text-[9px] font-extrabold text-muted-foreground">#{index + 1}</span>
                      <div><p className="text-[10px] font-extrabold">UH {row.room}</p><p className="text-[8px] text-muted-foreground">{formatNumber(row.occupancy, 0)}% ocup. · {row.nights} diárias · {row.reservations} reserva(s)</p></div>
                      <strong className="font-mono text-[10px] text-primary">{fmtBRL(row.revenue)}</strong>
                    </div>
                  ))}
                </div>
              </Panel>
            </section>
          </>
        )}

        {tab === "despesas" && (
          <>
            <section className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
              <Kpi label="Despesas operacionais" value={fmtBRL(current.expenses)} hint="retiradas financeiras excluídas" />
              <Kpi label="% da receita" value={`${formatNumber(current.revenue ? (current.expenses / current.revenue) * 100 : 0, 1)}%`} hint="peso das despesas" />
              <Kpi label="GOP" value={fmtBRL(current.gop)} hint="receita − despesas" />
              <Kpi label="Margem GOP" value={`${formatNumber(current.margin, 1)}%`} hint="resultado operacional" />
            </section>
            <section className="grid gap-2 lg:grid-cols-2">
              <DonutPanel title="Despesas por categoria" rows={expenseByCategory} valueFormatter={fmtBRL} large />
              <Panel title="Receita x despesas" subtitle="Comparação semanal do mês">
                <div className="h-[360px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={weeklyTrend} margin={{ top: 8, right: 10, left: -8, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="semana" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} />
                      <YAxis axisLine={false} tickLine={false} width={58} tickFormatter={compactBRL} tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [fmtBRL(Number(v)), String(n)]} />
                      <Area type="monotone" dataKey="Receita" stroke="var(--primary)" fill="color-mix(in srgb, var(--primary) 10%, transparent)" strokeWidth={2.4} />
                      <Area type="monotone" dataKey="Despesas" stroke="var(--destructive)" fill="color-mix(in srgb, var(--destructive) 8%, transparent)" strokeWidth={2.2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
            </section>
          </>
        )}

        {tab === "canais" && (
          <>
            <section className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
              <Kpi label="Canais ativos" value={String(revenueByChannel.length)} hint="com receita no mês" />
              <Kpi label="Maior canal" value={revenueByChannel[0]?.name ?? "—"} hint={revenueByChannel[0] ? `${formatNumber(revenueByChannel[0].share, 0)}% da receita` : "sem base"} />
              <Kpi label="Receita de hospedagem" value={fmtBRL(current.lodgingRevenue)} hint="distribuída por canal" />
              <Kpi label="Diárias vendidas" value={String(current.occupiedNights)} hint="quartos/noites por canal" />
            </section>
            <section className="grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
              <DonutPanel title="Receita por canal" rows={revenueByChannel} valueFormatter={fmtBRL} large />
              <DonutPanel title="Quartos por canal" rows={roomNightsByChannel} valueFormatter={(v) => `${v} diárias`} large />
              <DonutPanel title="Receita por pagamento" rows={revenueByPayment} valueFormatter={fmtBRL} large />
            </section>
            <section className="grid gap-2 lg:grid-cols-2">
              <Panel title="Ranking de canais por receita" subtitle="Origem das reservas do mês">
                <Ranking rows={revenueByChannel.map((r) => ({ label: r.name, value: r.value, text: `${formatNumber(r.share, 1)}%` }))} money />
              </Panel>
              <Panel title="Ranking de canais por quartos/noites" subtitle="Volume de diárias ocupadas por canal">
                <Ranking rows={roomNightsByChannel.map((r) => ({ label: r.name, value: r.value, text: `${formatNumber(r.share, 1)}%` }))} />
              </Panel>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <article className="painel-v2-kpi min-w-0"><p className="truncate text-[8px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">{label}</p><p className="painel-v2-kpi-value truncate" title={value}>{value}</p><p className="mt-1 truncate text-[8px] text-muted-foreground" title={hint}>{hint}</p></article>;
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border bg-background/60 p-2"><p className="text-[8px] font-bold uppercase tracking-[.06em] text-muted-foreground">{label}</p><p className="mt-1 font-mono text-sm font-extrabold">{value}</p></div>;
}

function Panel({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <article className="min-w-0 rounded-xl border border-border bg-card p-2.5"><div className="mb-2 flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-xs font-extrabold">{title}</h2>{subtitle && <p className="mt-0.5 text-[8px] text-muted-foreground">{subtitle}</p>}</div>{action}</div>{children}</article>;
}

function DonutPanel({ title, rows, valueFormatter, large = false }: { title: string; rows: DonutRow[]; valueFormatter: (value: number) => string; large?: boolean }) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  return <Panel title={title} subtitle={total ? `Total ${valueFormatter(total)}` : "Sem dados no período"}>
    {rows.length ? <div className={`grid items-center gap-2 ${large ? "md:grid-cols-[1.1fr_.9fr]" : "grid-cols-[.9fr_1.1fr]"}`}>
      <div className={large ? "h-64" : "h-40"}><ResponsiveContainer width="100%" height="100%"><PieChart><Tooltip contentStyle={tooltipStyle} formatter={(v) => [valueFormatter(Number(v)), title]} /><Pie data={rows} dataKey="value" nameKey="name" innerRadius={large ? 58 : 38} outerRadius={large ? 88 : 62} paddingAngle={2} stroke="var(--card)" strokeWidth={2}>{rows.map((row, index) => <Cell key={`${row.name}-${index}`} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />)}</Pie></PieChart></ResponsiveContainer></div>
      <div className="space-y-1.5">{rows.slice(0, 6).map((row, index) => <div key={row.name} className="flex items-center gap-2 text-[9px]"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: DONUT_COLORS[index % DONUT_COLORS.length] }} /><span className="min-w-0 flex-1 truncate font-semibold">{row.name}</span><span className="shrink-0 font-mono text-muted-foreground">{formatNumber(row.share, 0)}%</span></div>)}</div>
    </div> : <Empty />}
  </Panel>;
}

function Ranking({ rows, money = false }: { rows: Array<{ label: string; value: number; text?: string }>; money?: boolean }) {
  if (!rows.length) return <Empty />;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return <div className="space-y-2">{rows.slice(0, 10).map((row) => <div key={row.label}><div className="mb-1 flex items-center justify-between gap-2 text-[9px]"><span className="truncate font-bold">{row.label}</span><span className="font-mono text-muted-foreground">{money ? fmtBRL(row.value) : row.value} {row.text ? `· ${row.text}` : ""}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(row.value / max) * 100}%` }} /></div></div>)}</div>;
}

function Comparison({ label, current, previous, delta, unit, favorable, hasBase }: { label: string; current: string; previous: string; delta: number | null; unit: string; favorable: boolean | null; hasBase: boolean }) {
  const deltaText = !hasBase || delta === null ? "sem base" : `${delta >= 0 ? "+" : ""}${formatNumber(delta, 1)}${unit}`;
  return <div className="rounded-lg border border-border bg-background/55 p-2"><div className="flex items-start justify-between gap-1"><p className="truncate text-[8px] font-extrabold uppercase tracking-[.06em] text-muted-foreground">{label}</p><span className={`rounded-full px-1.5 py-0.5 text-[8px] font-extrabold ${favorable === null || !hasBase ? "bg-muted text-muted-foreground" : favorable ? "bg-emerald-500/10 text-emerald-700" : "bg-destructive/10 text-destructive"}`}>{deltaText}</span></div><p className="mt-1 truncate font-mono text-sm font-extrabold">{current}</p><p className="mt-0.5 truncate text-[8px] text-muted-foreground">base: {hasBase ? previous : "sem dados"}</p></div>;
}

function Empty() { return <div className="grid h-28 place-items-center rounded-lg border border-dashed border-border text-[9px] text-muted-foreground">Sem dados suficientes no período.</div>; }

function metric(label: string, current: number, previous: number, favorableUp: boolean, money: boolean) {
  const delta = previous === 0 ? null : money ? ((current - previous) / Math.abs(previous)) * 100 : current - previous;
  const favorable = delta === null ? null : favorableUp ? delta >= 0 : delta <= 0;
  return { label, current: money ? fmtBRL(current) : `${formatNumber(current, 1)}%`, previous: money ? fmtBRL(previous) : `${formatNumber(previous, 1)}%`, delta, unit: money ? "%" : " p.p.", favorable };
}

function calculateSnapshot(start: string, end: string, reservations: Reservation[], sales: Sale[], expenses: Expense[], roomCount: number): Snapshot {
  const valid = reservations.filter(isOperational);
  const overlapping = valid.filter((r) => r.checkin < end && r.checkout > start);
  let lodgingRevenue = 0;
  let occupiedNights = 0;
  let guests = 0;
  overlapping.forEach((r) => {
    const totalNights = Math.max(1, nightsBetween(r.checkin, r.checkout));
    const overlap = overlapNights(r.checkin, r.checkout, start, end);
    if (!overlap) return;
    lodgingRevenue += Number(r.valor_total ?? 0) * (overlap / totalNights);
    occupiedNights += overlap;
    guests += Math.max(1, Number(r.pessoas ?? 1));
  });
  const extras = sales.filter((s) => s.data >= start && s.data < end && normalize(s.status) !== "cancelado").reduce((sum, s) => sum + Number(s.total ?? 0), 0);
  const operatingExpenses = expenses.filter((e) => e.data >= start && e.data < end && !isFinancialMovement(e.categoria, e.descricao)).reduce((sum, e) => sum + Number(e.valor ?? 0), 0);
  const revenue = lodgingRevenue + extras;
  const days = Math.max(1, nightsBetween(start, end));
  const available = roomCount * days;
  const gop = revenue - operatingExpenses;
  return {
    revenue,
    lodgingRevenue,
    extras,
    expenses: operatingExpenses,
    gop,
    margin: revenue ? (gop / revenue) * 100 : 0,
    occupiedNights,
    occupancy: available ? Math.min(100, (occupiedNights / available) * 100) : 0,
    adr: occupiedNights ? lodgingRevenue / occupiedNights : 0,
    revpar: available ? lodgingRevenue / available : 0,
    ticket: overlapping.length ? revenue / overlapping.length : 0,
    reservations: overlapping.length,
    guests,
    hasData: overlapping.length > 0 || extras > 0 || operatingExpenses > 0,
  };
}

function buildRevenueByPayment(start: string, end: string, reservations: Reservation[], sales: Sale[]): DonutRow[] {
  const map = new Map<string, number>();
  reservations.forEach((r) => {
    const overlap = overlapNights(r.checkin, r.checkout, start, end);
    if (!overlap) return;
    const totalNights = Math.max(1, nightsBetween(r.checkin, r.checkout));
    add(map, labelOf(r.pagamento, "Não informado"), Number(r.valor_total ?? 0) * (overlap / totalNights));
  });
  sales.filter((s) => s.data >= start && s.data < end && normalize(s.status) !== "cancelado").forEach((s) => add(map, labelOf(s.pagamento, "Não informado"), Number(s.total ?? 0)));
  return mapToDonut(map);
}

function buildRevenueByChannel(start: string, end: string, reservations: Reservation[]): DonutRow[] {
  const map = new Map<string, number>();
  reservations.forEach((r) => {
    const overlap = overlapNights(r.checkin, r.checkout, start, end);
    if (!overlap) return;
    const totalNights = Math.max(1, nightsBetween(r.checkin, r.checkout));
    add(map, labelOf(r.canal, "Hotel Direto"), Number(r.valor_total ?? 0) * (overlap / totalNights));
  });
  return mapToDonut(map);
}

function buildRoomNightsByChannel(start: string, end: string, reservations: Reservation[]): DonutRow[] {
  const map = new Map<string, number>();
  reservations.forEach((r) => {
    const overlap = overlapNights(r.checkin, r.checkout, start, end);
    if (overlap) add(map, labelOf(r.canal, "Hotel Direto"), overlap);
  });
  return mapToDonut(map);
}

function buildExpenseByCategory(start: string, end: string, expenses: Expense[]): DonutRow[] {
  const map = new Map<string, number>();
  expenses.filter((e) => e.data >= start && e.data < end && !isFinancialMovement(e.categoria, e.descricao)).forEach((e) => add(map, labelOf(e.categoria, "Geral"), Number(e.valor ?? 0)));
  return mapToDonut(map);
}

function buildRoomRows(start: string, end: string, reservations: Reservation[], daysInMonth: number) {
  const map = new Map<number, RoomRow>();
  reservations.forEach((r) => {
    const overlap = overlapNights(r.checkin, r.checkout, start, end);
    if (!overlap) return;
    const totalNights = Math.max(1, nightsBetween(r.checkin, r.checkout));
    const current = map.get(r.quarto) ?? { room: r.quarto, revenue: 0, nights: 0, occupancy: 0, reservations: 0 };
    current.revenue += Number(r.valor_total ?? 0) * (overlap / totalNights);
    current.nights += overlap;
    current.reservations += 1;
    current.occupancy = Math.min(100, (current.nights / daysInMonth) * 100);
    map.set(r.quarto, current);
  });
  return [...map.values()].sort((a, b) => b.revenue - a.revenue).map((r) => ({ ...r, label: `UH ${r.room}`, receita: r.revenue }));
}

function buildWeeklyTrend(start: string, end: string, reservations: Reservation[], sales: Sale[], expenses: Expense[]) {
  const buckets = [1, 8, 15, 22, 29].map((day, index) => ({ semana: index === 4 ? "29+" : `${day}-${Math.min(day + 6, 28)}`, Receita: 0, Despesas: 0 }));
  reservations.forEach((r) => {
    const totalNights = Math.max(1, nightsBetween(r.checkin, r.checkout));
    const nightly = Number(r.valor_total ?? 0) / totalNights;
    let d = maxISO(r.checkin, start);
    const limit = minISO(r.checkout, end);
    while (d < limit) { buckets[bucketIndex(d)].Receita += nightly; d = addDays(d, 1); }
  });
  sales.filter((s) => s.data >= start && s.data < end && normalize(s.status) !== "cancelado").forEach((s) => { buckets[bucketIndex(s.data)].Receita += Number(s.total ?? 0); });
  expenses.filter((e) => e.data >= start && e.data < end && !isFinancialMovement(e.categoria, e.descricao)).forEach((e) => { buckets[bucketIndex(e.data)].Despesas += Number(e.valor ?? 0); });
  return buckets.map((b) => ({ ...b, Receita: Number(b.Receita.toFixed(2)), Despesas: Number(b.Despesas.toFixed(2)) }));
}

function buildOccupancyTrend(today: string, reservations: Reservation[], roomCount: number) {
  return Array.from({ length: 7 }, (_, index) => {
    const day = addDays(today, index - 6);
    const occupied = new Set(reservations.filter((r) => isOperational(r) && r.checkin <= day && r.checkout > day).map((r) => r.quarto)).size;
    return { dia: new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`)).replace(".", ""), ocupacao: roomCount ? Math.round((occupied / roomCount) * 100) : 0 };
  });
}

function distribution(values: string[], limit = 6): DonutRow[] {
  const map = new Map<string, number>();
  values.forEach((v) => add(map, v, 1));
  return mapToDonut(map).slice(0, limit);
}

function buildAgeDistribution(clients: Client[], today: string) {
  const labels = clients.map((c) => ageFromBirthDate(c.data_nascimento, today)).filter((a): a is number => a !== null).map((age) => age < 18 ? "Até 17" : age <= 25 ? "18–25" : age <= 35 ? "26–35" : age <= 45 ? "36–45" : age <= 60 ? "46–60" : "61+");
  return distribution(labels);
}

function mapToDonut(map: Map<string, number>): DonutRow[] {
  const total = [...map.values()].reduce((a, b) => a + b, 0);
  return [...map.entries()].map(([name, value]) => ({ name, value: Number(value.toFixed(2)), share: total ? (value / total) * 100 : 0 })).sort((a, b) => b.value - a.value);
}

function add(map: Map<string, number>, key: string, value: number) { map.set(key, (map.get(key) ?? 0) + value); }
function isOperational(r: Reservation) { return !["cancelado", "manutencao"].includes(normalize(r.status)); }
function isFinancialMovement(category?: string | null, description?: string | null) { const value = normalize(`${category ?? ""} ${description ?? ""}`); return value.includes("retirada") || value.includes("movimentacao financeira"); }
function labelOf(value: unknown, fallback: string) { const raw = String(value ?? "").trim(); return raw && raw !== "-" ? raw : fallback; }
function overlapNights(checkin: string, checkout: string, start: string, end: string) { const a = maxISO(checkin, start); const b = minISO(checkout, end); return b > a ? Math.max(0, nightsBetween(a, b)) : 0; }
function maxISO(a: string, b: string) { return a > b ? a : b; }
function minISO(a: string, b: string) { return a < b ? a : b; }
function normalize(value: unknown) { return String(value ?? "").trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
function formatNumber(value: number, digits = 1) { return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number.isFinite(value) ? value : 0); }
function formatMonthLabel(value: string) { return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)).replace(".", ""); }
function nextMonthISO(start: string) { const [y, m] = start.split("-").map(Number); const d = new Date(Date.UTC(y, m, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`; }
function previousMonthISO(start: string) { const [y, m] = start.split("-").map(Number); const d = new Date(Date.UTC(y, m - 2, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`; }
function sameMonthPreviousYearISO(start: string) { return `${Number(start.slice(0, 4)) - 1}${start.slice(4)}`; }
function ageFromBirthDate(birth: string | null | undefined, today: string) { if (!birth || !/^\d{4}-\d{2}-\d{2}$/.test(birth)) return null; let age = Number(today.slice(0, 4)) - Number(birth.slice(0, 4)); if (today.slice(5) < birth.slice(5)) age -= 1; return age >= 0 && age <= 120 ? age : null; }
function bucketIndex(date: string) { return Math.min(4, Math.floor((Number(date.slice(8, 10)) - 1) / 7)); }
function addDays(date: string, days: number) { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
function compactBRL(value: number) { const v = Number(value); if (Math.abs(v) >= 1_000_000) return `R$${formatNumber(v / 1_000_000, 1)}M`; if (Math.abs(v) >= 1_000) return `R$${formatNumber(v / 1_000, 0)}k`; return `R$${formatNumber(v, 0)}`; }

const tooltipStyle = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--foreground)", fontSize: 10 };
