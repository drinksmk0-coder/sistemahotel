import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  ArrowUpRight,
  BedDouble,
  Building2,
  CalendarDays,
  Download,
  Maximize2,
  Minimize2,
  Percent,
  ReceiptText,
  Search,
  Star,
  TrendingUp,
  UserRoundX,
  Users,
  WalletCards,
  XCircle,
} from "lucide-react";
import {
  useCurrentCompany,
  useExpenses,
  useFeedbacks,
  useReservations,
  useRooms,
  useSales,
  type Reservation,
} from "@/lib/data";
import {
  addDaysISO,
  downloadCSV,
  fmtBRL,
  fmtDate,
  nightsBetween,
  todayISO,
} from "@/lib/format";
import "./painel-atraente-v2.css";

export const Route = createFileRoute("/_authenticated/painel-atraente")({
  component: PainelAtraente,
});

type StatusKey =
  | "reservado"
  | "ocupado"
  | "saida_pendente"
  | "finalizado"
  | "cancelado"
  | "manutencao";

const STATUS: Record<StatusKey, { label: string; className: string }> = {
  reservado: { label: "Reservado", className: "border-sky-200 bg-sky-50 text-sky-700" },
  ocupado: { label: "Hospedado", className: "border-blue-200 bg-blue-50 text-blue-700" },
  saida_pendente: { label: "Saída pendente", className: "border-amber-200 bg-amber-50 text-amber-800" },
  finalizado: { label: "Finalizado", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  cancelado: { label: "Cancelado", className: "border-red-200 bg-red-50 text-red-700" },
  manutencao: { label: "Manutenção", className: "border-zinc-200 bg-zinc-50 text-zinc-700" },
};

const FILTERS: Array<{ key: "todos" | StatusKey; label: string }> = [
  { key: "todos", label: "Todos" },
  { key: "ocupado", label: "Hospedados" },
  { key: "saida_pendente", label: "Saídas" },
  { key: "reservado", label: "Reservados" },
  { key: "finalizado", label: "Finalizados" },
  { key: "cancelado", label: "Cancelados" },
];

function PainelAtraente() {
  const dashboardRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"todos" | StatusKey>("todos");
  const [query, setQuery] = useState("");

  const today = todayISO();
  const currentCompany = useCurrentCompany();
  const { data: rooms = [] } = useRooms();
  const { data: reservations = [] } = useReservations();
  const { data: sales = [] } = useSales();
  const { data: expenses = [] } = useExpenses();
  const { data: rawFeedbacks = [] } = useFeedbacks();
  const feedbacks = rawFeedbacks as Array<any>;

  const monthStart = `${today.slice(0, 7)}-01`;
  const nextMonth = nextMonthISO(monthStart);
  const daysInMonth = Math.max(1, nightsBetween(monthStart, nextMonth));
  const availableRoomNights = Math.max(0, rooms.length * daysInMonth);
  const monthLabel = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(`${monthStart}T12:00:00-03:00`));

  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(document.fullscreenElement === dashboardRef.current);
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  async function toggleFullscreen() {
    if (!dashboardRef.current) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await dashboardRef.current.requestFullscreen();
  }

  const validReservations = useMemo(
    () => reservations.filter((reservation) => !["cancelado", "manutencao"].includes(normalize(reservation.status))),
    [reservations],
  );

  const monthReservations = useMemo(
    () =>
      validReservations.filter(
        (reservation) => reservation.checkin < nextMonth && reservation.checkout > monthStart,
      ),
    [monthStart, nextMonth, validReservations],
  );

  const periodReservations = useMemo(
    () =>
      reservations.filter(
        (reservation) =>
          reservation.checkin >= monthStart &&
          reservation.checkin < nextMonth &&
          normalize(reservation.status) !== "manutencao",
      ),
    [monthStart, nextMonth, reservations],
  );

  const activeStays = useMemo(
    () =>
      validReservations.filter((reservation) => {
        const row = reservation as Reservation & { checkout_at?: string | null };
        if (row.checkout_at) return false;
        if (!["ocupado", "saida_pendente"].includes(normalize(row.status))) return false;
        return row.checkin <= today;
      }),
    [today, validReservations],
  );

  const occupiedRooms = new Set(activeStays.map((reservation) => reservation.quarto)).size;
  const currentOccupancy = rooms.length ? (occupiedRooms / rooms.length) * 100 : 0;
  const activeGuests = activeStays.reduce(
    (sum, reservation) => sum + Math.max(1, Number(reservation.pessoas ?? 1)),
    0,
  );
  const departuresPending = activeStays.filter(
    (reservation) => normalize(reservation.status) === "saida_pendente" || reservation.checkout <= today,
  ).length;
  const arrivalsToday = validReservations.filter(
    (reservation) => reservation.checkin === today && normalize(reservation.status) === "reservado",
  ).length;

  const financial = useMemo(() => {
    let lodgingRevenue = 0;
    let lodgingPaid = 0;
    let occupiedNights = 0;

    monthReservations.forEach((reservation) => {
      const totalNights = Math.max(1, nightsBetween(reservation.checkin, reservation.checkout));
      const overlap = overlapNights(reservation.checkin, reservation.checkout, monthStart, nextMonth);
      if (!overlap) return;
      const ratio = overlap / totalNights;
      lodgingRevenue += Number(reservation.valor_total ?? 0) * ratio;
      lodgingPaid += Math.min(
        Number(reservation.valor_pago ?? 0),
        Number(reservation.valor_total ?? 0),
      ) * ratio;
      occupiedNights += overlap;
    });

    const monthSales = sales.filter(
      (sale) => sale.data >= monthStart && sale.data < nextMonth && normalize(sale.status) !== "cancelado",
    );
    const extraRevenue = monthSales.reduce((sum, sale) => sum + Number(sale.total ?? 0), 0);
    const extraPaid = monthSales.reduce(
      (sum, sale) => sum + Math.min(Number(sale.valor_pago ?? 0), Number(sale.total ?? 0)),
      0,
    );

    return {
      lodgingRevenue,
      lodgingPaid,
      occupiedNights,
      extraRevenue,
      extraPaid,
      totalRevenue: lodgingRevenue + extraRevenue,
      totalPaid: lodgingPaid + extraPaid,
    };
  }, [monthReservations, monthStart, nextMonth, sales]);

  const operatingExpenses = useMemo(
    () =>
      expenses
        .filter((expense) => expense.data >= monthStart && expense.data < nextMonth)
        .filter((expense) => !isFinancialMovement(expense.categoria, expense.descricao))
        .reduce((sum, expense) => sum + Number(expense.valor ?? 0), 0),
    [expenses, monthStart, nextMonth],
  );

  const adr = financial.occupiedNights ? financial.lodgingRevenue / financial.occupiedNights : 0;
  const revpar = availableRoomNights ? financial.lodgingRevenue / availableRoomNights : 0;
  const trevpar = availableRoomNights ? financial.totalRevenue / availableRoomNights : 0;
  const gop = financial.totalRevenue - operatingExpenses;
  const gopMargin = financial.totalRevenue ? (gop / financial.totalRevenue) * 100 : 0;
  const goppar = availableRoomNights ? gop / availableRoomNights : 0;
  const monthOccupancy = availableRoomNights
    ? Math.min(100, (financial.occupiedNights / availableRoomNights) * 100)
    : 0;
  const receivedRate = financial.totalRevenue
    ? Math.min(100, (financial.totalPaid / financial.totalRevenue) * 100)
    : 0;
  const outstanding = Math.max(0, financial.totalRevenue - financial.totalPaid);

  const cancellationCount = periodReservations.filter(
    (reservation) => normalize(reservation.status) === "cancelado",
  ).length;
  const noShowCount = periodReservations.filter(isNoShow).length;

  const monthFeedbacks = feedbacks.filter(
    (feedback) => String(feedback.created_at ?? "").slice(0, 7) === today.slice(0, 7),
  );
  const feedbackScores = monthFeedbacks
    .map((feedback) => Number(feedback.nota_geral))
    .filter((score) => Number.isFinite(score) && score > 0);
  const averageScore = feedbackScores.length
    ? feedbackScores.reduce((sum, score) => sum + score, 0) / feedbackScores.length
    : 0;
  const satisfactionRate = averageScore ? (averageScore / 5) * 100 : 0;

  const bookingCount = monthReservations.filter((reservation) =>
    normalize(reservation.canal).includes("booking"),
  ).length;
  const bookingShare = monthReservations.length ? (bookingCount / monthReservations.length) * 100 : 0;
  const averageStay = monthReservations.length
    ? monthReservations.reduce(
        (sum, reservation) => sum + Math.max(1, nightsBetween(reservation.checkin, reservation.checkout)),
        0,
      ) / monthReservations.length
    : 0;

  const revenueByWeek = useMemo(() => {
    const buckets = [
      { name: "1–7", receita: 0 },
      { name: "8–14", receita: 0 },
      { name: "15–21", receita: 0 },
      { name: "22–28", receita: 0 },
      { name: "29+", receita: 0 },
    ];

    monthReservations.forEach((reservation) => {
      const totalNights = Math.max(1, nightsBetween(reservation.checkin, reservation.checkout));
      const nightly = Number(reservation.valor_total ?? 0) / totalNights;
      let day = maxISO(reservation.checkin, monthStart);
      const end = minISO(reservation.checkout, nextMonth);
      while (day < end) {
        const bucket = Math.min(4, Math.floor((Number(day.slice(8, 10)) - 1) / 7));
        buckets[bucket].receita += nightly;
        day = addDaysISO(day, 1);
      }
    });

    sales
      .filter((sale) => sale.data >= monthStart && sale.data < nextMonth && normalize(sale.status) !== "cancelado")
      .forEach((sale) => {
        const bucket = Math.min(4, Math.floor((Number(sale.data.slice(8, 10)) - 1) / 7));
        buckets[bucket].receita += Number(sale.total ?? 0);
      });

    return buckets.map((bucket) => ({ ...bucket, receita: Number(bucket.receita.toFixed(2)) }));
  }, [monthReservations, monthStart, nextMonth, sales]);

  const occupancyTrend = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const day = addDaysISO(today, index - 6);
      const occupied = new Set(
        validReservations
          .filter((reservation) => reservation.checkin <= day && reservation.checkout > day)
          .map((reservation) => reservation.quarto),
      ).size;
      return {
        dia: new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" })
          .format(new Date(`${day}T12:00:00Z`))
          .replace(".", ""),
        taxa: rooms.length ? Math.round((occupied / rooms.length) * 100) : 0,
      };
    });
  }, [rooms.length, today, validReservations]);

  const filteredReservations = useMemo(() => {
    const needle = normalize(query);
    return reservations
      .filter((reservation) => {
        const matchesStatus = statusFilter === "todos" || normalize(reservation.status) === statusFilter;
        if (!matchesStatus) return false;
        if (!needle) return true;
        return [
          reservation.codigo_externo,
          reservation.id,
          reservation.cliente_nome,
          reservation.quarto,
          reservation.canal,
          reservation.pagamento,
        ].some((value) => normalize(value).includes(needle));
      })
      .sort((a, b) => b.checkin.localeCompare(a.checkin) || b.created_at.localeCompare(a.created_at));
  }, [query, reservations, statusFilter]);

  function exportVisible() {
    downloadCSV(`reservas-painel-${today}.csv`, [
      ["Reserva", "UH", "Hóspede", "Check-in", "Check-out", "Pessoas", "Canal", "Pagamento", "Total", "Status"],
      ...filteredReservations.map((reservation) => [
        reservation.codigo_externo || reservation.id.slice(0, 8),
        reservation.quarto,
        reservation.cliente_nome,
        reservation.checkin,
        reservation.checkout,
        reservation.pessoas,
        reservation.canal ?? "",
        reservation.pagamento ?? "",
        reservation.valor_total,
        reservation.status,
      ]),
    ]);
  }

  const kpis = [
    {
      icon: TrendingUp,
      label: "Receita total",
      value: fmtBRL(financial.totalRevenue),
      hint: `${fmtBRL(financial.totalPaid)} recebido`,
    },
    {
      icon: BedDouble,
      label: "Ocupação atual",
      value: `${Math.round(currentOccupancy)}%`,
      hint: `${occupiedRooms}/${rooms.length} UHs · mês ${Math.round(monthOccupancy)}%`,
    },
    {
      icon: CalendarDays,
      label: "ADR",
      value: fmtBRL(adr),
      hint: `${financial.occupiedNights} diárias no mês`,
    },
    {
      icon: WalletCards,
      label: "RevPAR",
      value: fmtBRL(revpar),
      hint: "Receita de quartos / UH disponível",
    },
    {
      icon: ReceiptText,
      label: "Reservas",
      value: String(periodReservations.length),
      hint: `${arrivalsToday} chegada(s) hoje`,
    },
    {
      icon: Users,
      label: "Hóspedes no hotel",
      value: String(activeGuests),
      hint: `${departuresPending} saída(s) pendente(s)`,
    },
    {
      icon: TrendingUp,
      label: "TRevPAR",
      value: fmtBRL(trevpar),
      hint: "Receita total / UH disponível",
    },
    {
      icon: WalletCards,
      label: "GOP",
      value: fmtBRL(gop),
      hint: `${fmtBRL(operatingExpenses)} despesas operacionais`,
    },
    {
      icon: Percent,
      label: "Margem GOP",
      value: `${gopMargin.toFixed(1).replace(".", ",")}%`,
      hint: "GOP / receita operacional",
    },
    {
      icon: WalletCards,
      label: "GOPPAR",
      value: fmtBRL(goppar),
      hint: "GOP / UH disponível",
    },
    {
      icon: XCircle,
      label: "Cancelamentos",
      value: String(cancellationCount),
      hint: `${periodReservations.length ? ((cancellationCount / periodReservations.length) * 100).toFixed(1).replace(".", ",") : "0"}% das reservas do mês`,
    },
    {
      icon: UserRoundX,
      label: "No-show",
      value: String(noShowCount),
      hint: "Não comparecimentos no mês",
    },
  ];

  const indicators = [
    { label: "Recebido", value: receivedRate, detail: outstanding > 0 ? `${fmtBRL(outstanding)} a receber` : "sem saldo pendente" },
    { label: "Satisfação", value: satisfactionRate, detail: averageScore ? `nota ${averageScore.toFixed(1).replace(".", ",")}/5` : "sem avaliações no mês" },
    { label: "Booking", value: bookingShare, detail: `${bookingCount} reserva(s) válida(s)` },
    { label: "Estadia média", value: Math.min(100, (averageStay / 7) * 100), detail: `${averageStay.toFixed(1).replace(".", ",")} diária(s)` },
  ];

  return (
    <div ref={dashboardRef} className="painel-v2-shell overflow-hidden">
      <section className="painel-v2-header border-b border-border bg-primary px-3 py-3 text-primary-foreground sm:px-4">
        <div className="mx-auto flex max-w-[1920px] flex-wrap items-center gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary-foreground/15">
              <Building2 className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold sm:text-base">{currentCompany.data?.nome ?? "HospedaMais"}</p>
              <p className="truncate text-[9px] font-semibold uppercase tracking-[0.14em] opacity-70">
                Visão executiva · {capitalize(monthLabel)} · {fmtDate(today)}
              </p>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <a href="/reservas" className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary-foreground px-3 text-[10px] font-extrabold text-primary transition hover:opacity-90">
              <ArrowUpRight className="h-3.5 w-3.5" /> Reservas
            </a>
            <a href="/clientes" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-primary-foreground/25 px-3 text-[10px] font-bold transition hover:bg-primary-foreground/10">
              <Users className="h-3.5 w-3.5" /> Hóspedes
            </a>
            <button type="button" onClick={exportVisible} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-primary-foreground/25 px-3 text-[10px] font-bold transition hover:bg-primary-foreground/10">
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
            <button type="button" onClick={() => void toggleFullscreen()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-primary-foreground/25 px-3 text-[10px] font-bold transition hover:bg-primary-foreground/10">
              {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              {isFullscreen ? "Sair da tela inteira" : "Tela inteira"}
            </button>
          </div>
        </div>
      </section>

      <div className="painel-v2-content mx-auto flex max-w-[1920px] flex-col gap-2 px-2.5 py-2.5 sm:px-3.5">
        <section className="painel-v2-summary">
          {kpis.map(({ icon: Icon, label, value, hint }) => (
            <article key={label} className="painel-v2-kpi">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <p className="truncate text-[9px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground" title={label}>{label}</p>
              </div>
              <p className="painel-v2-kpi-value" title={value}>{value}</p>
              <p className="painel-v2-kpi-hint mt-1 truncate text-[9px] text-muted-foreground" title={hint}>{hint}</p>
            </article>
          ))}
        </section>

        <section className="painel-v2-operations grid gap-1.5 rounded-xl border border-border bg-card p-2 md:grid-cols-4">
          {indicators.map((indicator) => (
            <div key={indicator.label} className="min-w-0 px-1.5">
              <div className="mb-1 flex items-center justify-between gap-2 text-[9px]">
                <span className="font-bold text-muted-foreground">{indicator.label}</span>
                <strong className="font-mono text-foreground">{Math.round(indicator.value)}%</strong>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${clampPercent(indicator.value)}%` }} />
              </div>
              <p className="mt-1 truncate text-[8px] text-muted-foreground" title={indicator.detail}>{indicator.detail}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-2 lg:grid-cols-2">
          <article className="min-w-0 rounded-xl border border-border bg-card p-2.5">
            <div className="mb-1.5 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-xs font-extrabold text-foreground">Receita por semana</h2>
                <p className="truncate text-[9px] text-muted-foreground">Hospedagem rateada por diária + vendas extras do mês.</p>
              </div>
              <strong className="shrink-0 font-mono text-xs text-primary">{fmtBRL(financial.totalRevenue)}</strong>
            </div>
            <div className="painel-v2-chart w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueByWeek} barSize={24} margin={{ top: 4, right: 4, left: -8, bottom: -4 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.55} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 9 }} />
                  <YAxis axisLine={false} tickLine={false} width={52} tick={{ fill: "var(--muted-foreground)", fontSize: 9 }} tickFormatter={compactBRL} />
                  <Tooltip cursor={{ fill: "color-mix(in srgb, var(--primary) 5%, transparent)" }} contentStyle={tooltipStyle} formatter={(value) => [fmtBRL(Number(value)), "Receita"]} labelFormatter={(label) => `Dias ${label}`} />
                  <Bar dataKey="receita" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className="min-w-0 rounded-xl border border-border bg-card p-2.5">
            <div className="mb-1.5 flex items-start justify-between gap-2">
              <div>
                <h2 className="text-xs font-extrabold text-foreground">Ocupação · últimos 7 dias</h2>
                <p className="text-[9px] text-muted-foreground">Evolução diária das UHs ocupadas.</p>
              </div>
              <strong className="font-mono text-xs text-primary">Hoje {Math.round(currentOccupancy)}%</strong>
            </div>
            <div className="painel-v2-chart w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={occupancyTrend} margin={{ top: 4, right: 4, left: -18, bottom: -4 }}>
                  <defs>
                    <linearGradient id="painelV2Occupancy" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.55} />
                  <XAxis dataKey="dia" axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 9 }} />
                  <YAxis domain={[0, 100]} axisLine={false} tickLine={false} width={42} tick={{ fill: "var(--muted-foreground)", fontSize: 9 }} tickFormatter={(value) => `${value}%`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${value}%`, "Ocupação"]} />
                  <Area type="monotone" dataKey="taxa" stroke="var(--primary)" strokeWidth={2} fill="url(#painelV2Occupancy)" dot={{ r: 2, fill: "var(--primary)" }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </article>
        </section>

        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex flex-col gap-2 border-b border-border px-3 py-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xs font-extrabold">Reservas</h2>
              <p className="text-[9px] text-muted-foreground">{filteredReservations.length} registro(s) · tabela detalhada abaixo do resumo executivo.</p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-lg bg-muted p-1">
                {FILTERS.map((filter) => (
                  <button
                    type="button"
                    key={filter.key}
                    onClick={() => setStatusFilter(filter.key)}
                    className={`whitespace-nowrap rounded-md px-2 py-1 text-[9px] font-bold transition ${
                      statusFilter === filter.key
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-card hover:text-foreground"
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
              <label className="relative min-w-[180px] flex-1 sm:flex-none">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar reserva, hóspede ou UH"
                  className="h-8 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-[10px] outline-none focus:border-primary"
                />
              </label>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-left text-[10px]">
              <thead className="bg-muted/60 text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Reserva</th>
                  <th className="px-3 py-2">UH</th>
                  <th className="px-3 py-2">Hóspede</th>
                  <th className="px-3 py-2">Entrada</th>
                  <th className="px-3 py-2">Saída</th>
                  <th className="px-3 py-2">Canal</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredReservations.slice(0, isFullscreen ? 30 : 18).map((reservation) => {
                  const status = normalize(reservation.status) as StatusKey;
                  const statusView = STATUS[status] ?? { label: reservation.status, className: "border-border bg-muted text-foreground" };
                  return (
                    <tr key={reservation.id} className="painel-v2-table-row border-t border-border/70 transition hover:bg-muted/35">
                      <td className="px-3 font-mono font-semibold">{reservation.codigo_externo || reservation.id.slice(0, 8)}</td>
                      <td className="px-3 font-bold text-primary">{reservation.quarto}</td>
                      <td className="max-w-[230px] truncate px-3 font-semibold" title={reservation.cliente_nome}>{reservation.cliente_nome}</td>
                      <td className="px-3 whitespace-nowrap">{fmtDate(reservation.checkin)}</td>
                      <td className="px-3 whitespace-nowrap">{fmtDate(reservation.checkout)}</td>
                      <td className="max-w-[140px] truncate px-3" title={reservation.canal ?? ""}>{reservation.canal || "Direto"}</td>
                      <td className="px-3 text-right font-mono font-bold">{fmtBRL(Number(reservation.valor_total ?? 0))}</td>
                      <td className="px-3">
                        <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[8px] font-extrabold ${statusView.className}`}>{statusView.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-[9px] text-muted-foreground">
            <span>Mostrando até {isFullscreen ? 30 : 18} linhas neste painel.</span>
            <a href="/reservas" className="inline-flex items-center gap-1 font-extrabold text-primary hover:underline">
              Abrir gestão completa <ArrowUpRight className="h-3 w-3" />
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}

const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  color: "var(--foreground)",
  fontSize: 10,
};

function isFinancialMovement(category?: string | null, description?: string | null) {
  const value = normalize(`${category ?? ""} ${description ?? ""}`);
  return value.includes("retirada") || value.includes("movimentacao financeira") || value.includes("movimentação financeira");
}

function isNoShow(reservation: Reservation) {
  const row = reservation as Reservation & { presence_status?: string | null };
  const value = normalize(`${reservation.status ?? ""} ${row.presence_status ?? ""}`);
  return value.includes("no_show") || value.includes("no-show") || value.includes("nao compareceu") || value.includes("não compareceu");
}

function compactBRL(value: number) {
  const absolute = Math.abs(Number(value));
  if (absolute >= 1_000_000) return `R$${(Number(value) / 1_000_000).toFixed(1)}M`;
  if (absolute >= 1_000) return `R$${Math.round(Number(value) / 1_000)}k`;
  return `R$${Math.round(Number(value))}`;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

function overlapNights(checkin: string, checkout: string, start: string, end: string) {
  const overlapStart = maxISO(checkin, start);
  const overlapEnd = minISO(checkout, end);
  if (overlapEnd <= overlapStart) return 0;
  return Math.max(0, nightsBetween(overlapStart, overlapEnd));
}

function nextMonthISO(monthStart: string) {
  const [year, month] = monthStart.split("-").map(Number);
  const date = new Date(Date.UTC(year, month, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function maxISO(a: string, b: string) {
  return a > b ? a : b;
}

function minISO(a: string, b: string) {
  return a < b ? a : b;
}

function normalize(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function capitalize(value: string) {
  return value ? value.charAt(0).toLocaleUpperCase("pt-BR") + value.slice(1) : value;
}
