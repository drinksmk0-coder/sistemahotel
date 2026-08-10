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
import {
  addDaysISO,
  downloadCSV,
  fmtBRL,
  fmtDate,
  nightsBetween,
  todayISO,
} from "@/lib/format";

type StatusKey =
  | "reservado"
  | "ocupado"
  | "saida_pendente"
  | "finalizado"
  | "cancelado"
  | "manutencao";

type ComparisonMode = "previous_month" | "previous_year";

type PeriodSnapshot = {
  lodgingRevenue: number;
  lodgingPaid: number;
  extraRevenue: number;
  extraPaid: number;
  totalRevenue: number;
  totalPaid: number;
  occupiedNights: number;
  operatingExpenses: number;
  gop: number;
  gopMargin: number;
  occupancy: number;
  adr: number;
  revpar: number;
  trevpar: number;
  goppar: number;
  ticketAverage: number;
  reservationCount: number;
  hasData: boolean;
};

type RankingRow = {
  label: string;
  value: number;
  secondary?: string;
};

type DistributionRow = {
  label: string;
  value: number;
  share: number;
};

const STATUS: Record<StatusKey, { label: string; className: string }> = {
  reservado: { label: "Reservado", className: "border-sky-200 bg-sky-50 text-sky-700" },
  ocupado: { label: "Hospedado", className: "border-blue-200 bg-blue-50 text-blue-700" },
  saida_pendente: {
    label: "Saída pendente",
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
  finalizado: {
    label: "Finalizado",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  cancelado: { label: "Cancelado", className: "border-red-200 bg-red-50 text-red-700" },
  manutencao: {
    label: "Manutenção",
    className: "border-zinc-200 bg-zinc-50 text-zinc-700",
  },
};

const FILTERS: Array<{ key: "todos" | StatusKey; label: string }> = [
  { key: "todos", label: "Todos" },
  { key: "ocupado", label: "Hospedados" },
  { key: "saida_pendente", label: "Saídas" },
  { key: "reservado", label: "Reservados" },
  { key: "finalizado", label: "Finalizados" },
  { key: "cancelado", label: "Cancelados" },
];

export function PainelAtraenteDashboard() {
  const dashboardRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"todos" | StatusKey>("todos");
  const [query, setQuery] = useState("");
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>("previous_month");

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
  const previousMonthStart = previousMonthISO(monthStart);
  const previousYearStart = sameMonthPreviousYearISO(monthStart);
  const comparisonStart = comparisonMode === "previous_month" ? previousMonthStart : previousYearStart;
  const comparisonEnd = nextMonthISO(comparisonStart);
  const daysInMonth = Math.max(1, nightsBetween(monthStart, nextMonth));

  const monthLabel = formatMonthLabel(monthStart, false);
  const currentShortLabel = formatMonthLabel(monthStart, true);
  const comparisonLabel = formatMonthLabel(comparisonStart, true);

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

  const operationalReservations = useMemo(
    () => reservations.filter(isOperationalReservation),
    [reservations],
  );

  const monthReservations = useMemo(
    () =>
      operationalReservations.filter(
        (reservation) => reservation.checkin < nextMonth && reservation.checkout > monthStart,
      ),
    [monthStart, nextMonth, operationalReservations],
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

  const currentSnapshot = useMemo(
    () =>
      calculatePeriodSnapshot({
        start: monthStart,
        end: nextMonth,
        reservations,
        sales,
        expenses,
        roomCount: rooms.length,
      }),
    [expenses, monthStart, nextMonth, reservations, rooms.length, sales],
  );

  const comparisonSnapshot = useMemo(
    () =>
      calculatePeriodSnapshot({
        start: comparisonStart,
        end: comparisonEnd,
        reservations,
        sales,
        expenses,
        roomCount: rooms.length,
      }),
    [comparisonEnd, comparisonStart, expenses, reservations, rooms.length, sales],
  );

  const activeStays = useMemo(
    () =>
      operationalReservations.filter((reservation) => {
        const row = reservation as Reservation & { checkout_at?: string | null };
        if (row.checkout_at) return false;
        if (!["ocupado", "saida_pendente"].includes(normalize(row.status))) return false;
        return row.checkin <= today;
      }),
    [operationalReservations, today],
  );

  const occupiedRooms = new Set(activeStays.map((reservation) => reservation.quarto)).size;
  const currentOccupancy = rooms.length ? (occupiedRooms / rooms.length) * 100 : 0;
  const activeGuests = activeStays.reduce(
    (sum, reservation) => sum + Math.max(1, Number(reservation.pessoas ?? 1)),
    0,
  );
  const departuresPending = activeStays.filter(
    (reservation) =>
      normalize(reservation.status) === "saida_pendente" || reservation.checkout <= today,
  ).length;
  const arrivalsToday = operationalReservations.filter(
    (reservation) => reservation.checkin === today && normalize(reservation.status) === "reservado",
  ).length;

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
  const bookingShare = monthReservations.length
    ? (bookingCount / monthReservations.length) * 100
    : 0;
  const averageStay = monthReservations.length
    ? monthReservations.reduce(
        (sum, reservation) =>
          sum + Math.max(1, nightsBetween(reservation.checkin, reservation.checkout)),
        0,
      ) / monthReservations.length
    : 0;

  const receivedRate = currentSnapshot.totalRevenue
    ? Math.min(100, (currentSnapshot.totalPaid / currentSnapshot.totalRevenue) * 100)
    : 0;
  const outstanding = Math.max(0, currentSnapshot.totalRevenue - currentSnapshot.totalPaid);

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
      .filter(
        (sale) =>
          sale.data >= monthStart &&
          sale.data < nextMonth &&
          normalize(sale.status) !== "cancelado",
      )
      .forEach((sale) => {
        const bucket = Math.min(4, Math.floor((Number(sale.data.slice(8, 10)) - 1) / 7));
        buckets[bucket].receita += Number(sale.total ?? 0);
      });

    return buckets.map((bucket) => ({
      ...bucket,
      receita: Number(bucket.receita.toFixed(2)),
    }));
  }, [monthReservations, monthStart, nextMonth, sales]);

  const occupancyTrend = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const day = addDaysISO(today, index - 6);
      const occupied = new Set(
        operationalReservations
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
  }, [operationalReservations, rooms.length, today]);

  const revenueByPayment = useMemo(() => {
    const totals = new Map<string, number>();

    monthReservations.forEach((reservation) => {
      const overlap = overlapNights(reservation.checkin, reservation.checkout, monthStart, nextMonth);
      const totalNights = Math.max(1, nightsBetween(reservation.checkin, reservation.checkout));
      if (!overlap) return;
      addToMap(
        totals,
        dimensionLabel(reservation.pagamento, "Não informado"),
        Number(reservation.valor_total ?? 0) * (overlap / totalNights),
      );
    });

    sales
      .filter(
        (sale) =>
          sale.data >= monthStart &&
          sale.data < nextMonth &&
          normalize(sale.status) !== "cancelado",
      )
      .forEach((sale) =>
        addToMap(
          totals,
          dimensionLabel(sale.pagamento, "Não informado"),
          Number(sale.total ?? 0),
        ),
      );

    return mapToRanking(totals, currentSnapshot.totalRevenue, 7);
  }, [currentSnapshot.totalRevenue, monthReservations, monthStart, nextMonth, sales]);

  const revenueByChannel = useMemo(() => {
    const totals = new Map<string, number>();
    monthReservations.forEach((reservation) => {
      const overlap = overlapNights(reservation.checkin, reservation.checkout, monthStart, nextMonth);
      const totalNights = Math.max(1, nightsBetween(reservation.checkin, reservation.checkout));
      if (!overlap) return;
      addToMap(
        totals,
        dimensionLabel(reservation.canal, "Hotel Direto"),
        Number(reservation.valor_total ?? 0) * (overlap / totalNights),
      );
    });
    return mapToRanking(totals, currentSnapshot.lodgingRevenue, 7);
  }, [currentSnapshot.lodgingRevenue, monthReservations, monthStart, nextMonth]);

  const expenseByCategory = useMemo(() => {
    const totals = new Map<string, number>();
    expenses
      .filter((expense) => expense.data >= monthStart && expense.data < nextMonth)
      .filter((expense) => !isFinancialMovement(expense.categoria, expense.descricao))
      .forEach((expense) =>
        addToMap(
          totals,
          dimensionLabel(expense.categoria, "Geral"),
          Number(expense.valor ?? 0),
        ),
      );
    return mapToRanking(totals, currentSnapshot.operatingExpenses, 7);
  }, [currentSnapshot.operatingExpenses, expenses, monthStart, nextMonth]);

  const roomRanking = useMemo(() => {
    const totals = new Map<number, { revenue: number; nights: number }>();
    monthReservations.forEach((reservation) => {
      const overlap = overlapNights(reservation.checkin, reservation.checkout, monthStart, nextMonth);
      const totalNights = Math.max(1, nightsBetween(reservation.checkin, reservation.checkout));
      if (!overlap) return;
      const current = totals.get(reservation.quarto) ?? { revenue: 0, nights: 0 };
      current.revenue += Number(reservation.valor_total ?? 0) * (overlap / totalNights);
      current.nights += overlap;
      totals.set(reservation.quarto, current);
    });

    return [...totals.entries()]
      .map(([room, row]) => ({
        label: `UH ${room}`,
        value: row.revenue,
        secondary: `${Math.min(100, (row.nights / daysInMonth) * 100).toFixed(0)}% ocup. · ${row.nights} diária(s)`,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [daysInMonth, monthReservations, monthStart, nextMonth]);

  const guestProfiles = useMemo(() => {
    const ids = new Set(
      monthReservations
        .map((reservation) => reservation.cliente_id)
        .filter((id): id is string => Boolean(id)),
    );
    return clients.filter((client) => ids.has(client.id));
  }, [clients, monthReservations]);

  const stateDistribution = useMemo(
    () => buildDistribution(guestProfiles.map((client) => dimensionLabel(client.estado, "Não informado")), 6),
    [guestProfiles],
  );
  const sexDistribution = useMemo(
    () => buildDistribution(guestProfiles.map((client) => dimensionLabel(client.sexo, "Não informado")), 5),
    [guestProfiles],
  );
  const civilDistribution = useMemo(
    () => buildDistribution(guestProfiles.map((client) => dimensionLabel(client.estado_civil, "Não informado")), 5),
    [guestProfiles],
  );

  const ages = useMemo(
    () =>
      guestProfiles
        .map((client) => ageFromBirthDate(client.data_nascimento, today))
        .filter((age): age is number => age !== null),
    [guestProfiles, today],
  );
  const averageAge = ages.length ? ages.reduce((sum, age) => sum + age, 0) / ages.length : 0;
  const ageDistribution = useMemo(
    () => buildAgeDistribution(guestProfiles, today),
    [guestProfiles, today],
  );

  const comparisonChartData = [
    {
      periodo: comparisonLabel,
      receita: comparisonSnapshot.totalRevenue,
      despesas: comparisonSnapshot.operatingExpenses,
      gop: comparisonSnapshot.gop,
    },
    {
      periodo: currentShortLabel,
      receita: currentSnapshot.totalRevenue,
      despesas: currentSnapshot.operatingExpenses,
      gop: currentSnapshot.gop,
    },
  ];

  const comparisons = [
    {
      label: "Receita",
      current: currentSnapshot.totalRevenue,
      previous: comparisonSnapshot.totalRevenue,
      currentText: fmtBRL(currentSnapshot.totalRevenue),
      previousText: fmtBRL(comparisonSnapshot.totalRevenue),
      delta: percentageChange(currentSnapshot.totalRevenue, comparisonSnapshot.totalRevenue),
      unit: "%",
      favorableWhen: "up" as const,
    },
    {
      label: "Despesas",
      current: currentSnapshot.operatingExpenses,
      previous: comparisonSnapshot.operatingExpenses,
      currentText: fmtBRL(currentSnapshot.operatingExpenses),
      previousText: fmtBRL(comparisonSnapshot.operatingExpenses),
      delta: percentageChange(currentSnapshot.operatingExpenses, comparisonSnapshot.operatingExpenses),
      unit: "%",
      favorableWhen: "down" as const,
    },
    {
      label: "GOP",
      current: currentSnapshot.gop,
      previous: comparisonSnapshot.gop,
      currentText: fmtBRL(currentSnapshot.gop),
      previousText: fmtBRL(comparisonSnapshot.gop),
      delta: percentageChange(currentSnapshot.gop, comparisonSnapshot.gop),
      unit: "%",
      favorableWhen: "up" as const,
    },
    {
      label: "Margem operacional",
      current: currentSnapshot.gopMargin,
      previous: comparisonSnapshot.gopMargin,
      currentText: `${formatNumber(currentSnapshot.gopMargin, 1)}%`,
      previousText: `${formatNumber(comparisonSnapshot.gopMargin, 1)}%`,
      delta: currentSnapshot.gopMargin - comparisonSnapshot.gopMargin,
      unit: " p.p.",
      favorableWhen: "up" as const,
    },
    {
      label: "Ticket médio",
      current: currentSnapshot.ticketAverage,
      previous: comparisonSnapshot.ticketAverage,
      currentText: fmtBRL(currentSnapshot.ticketAverage),
      previousText: fmtBRL(comparisonSnapshot.ticketAverage),
      delta: percentageChange(currentSnapshot.ticketAverage, comparisonSnapshot.ticketAverage),
      unit: "%",
      favorableWhen: "up" as const,
    },
    {
      label: "Ocupação",
      current: currentSnapshot.occupancy,
      previous: comparisonSnapshot.occupancy,
      currentText: `${formatNumber(currentSnapshot.occupancy, 1)}%`,
      previousText: `${formatNumber(comparisonSnapshot.occupancy, 1)}%`,
      delta: currentSnapshot.occupancy - comparisonSnapshot.occupancy,
      unit: " p.p.",
      favorableWhen: "up" as const,
    },
  ];

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
      [
        "Reserva",
        "UH",
        "Hóspede",
        "Check-in",
        "Check-out",
        "Pessoas",
        "Canal",
        "Pagamento",
        "Total",
        "Status",
      ],
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
      value: fmtBRL(currentSnapshot.totalRevenue),
      hint: `${fmtBRL(currentSnapshot.totalPaid)} recebido`,
    },
    {
      icon: BedDouble,
      label: "Ocupação atual",
      value: `${Math.round(currentOccupancy)}%`,
      hint: `${occupiedRooms}/${rooms.length} UHs · mês ${Math.round(currentSnapshot.occupancy)}%`,
    },
    {
      icon: CalendarDays,
      label: "ADR",
      value: fmtBRL(currentSnapshot.adr),
      hint: `${currentSnapshot.occupiedNights} diárias no mês`,
    },
    {
      icon: WalletCards,
      label: "RevPAR",
      value: fmtBRL(currentSnapshot.revpar),
      hint: "Receita de quartos / UH disponível",
    },
    {
      icon: ReceiptText,
      label: "Ticket médio",
      value: fmtBRL(currentSnapshot.ticketAverage),
      hint: "Receita total / reservas com estadia no mês",
    },
    {
      icon: WalletCards,
      label: "Despesas",
      value: fmtBRL(currentSnapshot.operatingExpenses),
      hint: "Somente despesas operacionais",
    },
    {
      icon: Percent,
      label: "Margem operacional",
      value: `${formatNumber(currentSnapshot.gopMargin, 1)}%`,
      hint: "GOP / receita · não é lucro líquido contábil",
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
      value: fmtBRL(currentSnapshot.trevpar),
      hint: "Receita total / UH disponível",
    },
    {
      icon: WalletCards,
      label: "GOP",
      value: fmtBRL(currentSnapshot.gop),
      hint: "Receita menos despesas operacionais",
    },
    {
      icon: WalletCards,
      label: "GOPPAR",
      value: fmtBRL(currentSnapshot.goppar),
      hint: "GOP / UH disponível",
    },
    {
      icon: XCircle,
      label: "Cancelamentos",
      value: String(cancellationCount),
      hint: `${periodReservations.length ? formatNumber((cancellationCount / periodReservations.length) * 100, 1) : "0"}% das reservas do mês`,
    },
    {
      icon: UserRoundX,
      label: "No-show",
      value: String(noShowCount),
      hint: "Não comparecimentos no mês",
    },
  ];

  const indicators = [
    {
      label: "Recebido",
      value: receivedRate,
      detail: outstanding > 0 ? `${fmtBRL(outstanding)} a receber` : "sem saldo pendente",
    },
    {
      label: "Satisfação",
      value: satisfactionRate,
      detail: averageScore
        ? `nota ${averageScore.toFixed(1).replace(".", ",")}/5`
        : "sem avaliações no mês",
    },
    {
      label: "Booking",
      value: bookingShare,
      detail: `${bookingCount} reserva(s) válida(s)`,
    },
    {
      label: "Estadia média",
      value: Math.min(100, (averageStay / 7) * 100),
      detail: `${averageStay.toFixed(1).replace(".", ",")} diária(s)`,
    },
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
              <p className="truncate text-sm font-extrabold sm:text-base">
                {currentCompany.data?.nome ?? "HospedaMais"}
              </p>
              <p className="truncate text-[9px] font-semibold uppercase tracking-[0.14em] opacity-70">
                Visão executiva · {capitalize(monthLabel)} · {fmtDate(today)}
              </p>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <a
              href="/reservas"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary-foreground px-3 text-[10px] font-extrabold text-primary transition hover:opacity-90"
            >
              <ArrowUpRight className="h-3.5 w-3.5" /> Reservas
            </a>
            <a
              href="/clientes"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-primary-foreground/25 px-3 text-[10px] font-bold transition hover:bg-primary-foreground/10"
            >
              <Users className="h-3.5 w-3.5" /> Hóspedes
            </a>
            <button
              type="button"
              onClick={exportVisible}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-primary-foreground/25 px-3 text-[10px] font-bold transition hover:bg-primary-foreground/10"
            >
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-primary-foreground/25 px-3 text-[10px] font-bold transition hover:bg-primary-foreground/10"
            >
              {isFullscreen ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
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
                <p
                  className="truncate text-[9px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground"
                  title={label}
                >
                  {label}
                </p>
              </div>
              <p className="painel-v2-kpi-value" title={value}>
                {value}
              </p>
              <p
                className="painel-v2-kpi-hint mt-1 truncate text-[9px] text-muted-foreground"
                title={hint}
              >
                {hint}
              </p>
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
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${clampPercent(indicator.value)}%` }}
                />
              </div>
              <p
                className="mt-1 truncate text-[8px] text-muted-foreground"
                title={indicator.detail}
              >
                {indicator.detail}
              </p>
            </div>
          ))}
        </section>

        <section className="grid gap-2 lg:grid-cols-2">
          <article className="min-w-0 rounded-xl border border-border bg-card p-2.5">
            <div className="mb-1.5 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-xs font-extrabold text-foreground">Receita por semana</h2>
                <p className="truncate text-[9px] text-muted-foreground">
                  Hospedagem rateada por diária + vendas extras do mês.
                </p>
              </div>
              <strong className="shrink-0 font-mono text-xs text-primary">
                {fmtBRL(currentSnapshot.totalRevenue)}
              </strong>
            </div>
            <div className="painel-v2-chart w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={revenueByWeek}
                  barSize={24}
                  margin={{ top: 4, right: 4, left: -8, bottom: -4 }}
                >
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.55} />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 9 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    width={52}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 9 }}
                    tickFormatter={compactBRL}
                  />
                  <Tooltip
                    cursor={{ fill: "color-mix(in srgb, var(--primary) 5%, transparent)" }}
                    contentStyle={tooltipStyle}
                    formatter={(value) => [fmtBRL(Number(value)), "Receita"]}
                    labelFormatter={(label) => `Dias ${label}`}
                  />
                  <Bar dataKey="receita" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className="min-w-0 rounded-xl border border-border bg-card p-2.5">
            <div className="mb-1.5 flex items-start justify-between gap-2">
              <div>
                <h2 className="text-xs font-extrabold text-foreground">
                  Ocupação · últimos 7 dias
                </h2>
                <p className="text-[9px] text-muted-foreground">Evolução diária das UHs ocupadas.</p>
              </div>
              <strong className="font-mono text-xs text-primary">
                Hoje {Math.round(currentOccupancy)}%
              </strong>
            </div>
            <div className="painel-v2-chart w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={occupancyTrend}
                  margin={{ top: 4, right: 4, left: -18, bottom: -4 }}
                >
                  <defs>
                    <linearGradient id="painelV2Occupancy" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.55} />
                  <XAxis
                    dataKey="dia"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 9 }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    axisLine={false}
                    tickLine={false}
                    width={42}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 9 }}
                    tickFormatter={(value) => `${value}%`}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value) => [`${value}%`, "Ocupação"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="taxa"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    fill="url(#painelV2Occupancy)"
                    dot={{ r: 2, fill: "var(--primary)" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </article>
        </section>

        <section className="rounded-xl border border-border bg-card p-2.5">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <div>
              <h2 className="text-xs font-extrabold">Comparação de desempenho</h2>
              <p className="text-[9px] text-muted-foreground">
                {currentShortLabel} comparado com {comparisonLabel}. Receita e ocupação usam estadias alocadas no período.
              </p>
            </div>
            <div className="ml-auto flex rounded-lg bg-muted p-1">
              <button
                type="button"
                onClick={() => setComparisonMode("previous_month")}
                className={`rounded-md px-2.5 py-1 text-[9px] font-extrabold transition ${
                  comparisonMode === "previous_month"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Mês anterior
              </button>
              <button
                type="button"
                onClick={() => setComparisonMode("previous_year")}
                className={`rounded-md px-2.5 py-1 text-[9px] font-extrabold transition ${
                  comparisonMode === "previous_year"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Mesmo mês ano anterior
              </button>
            </div>
          </div>

          <div className="painel-v2-comparison-grid">
            {comparisons.map((item) => (
              <ComparisonTile
                key={item.label}
                label={item.label}
                currentText={item.currentText}
                previousText={item.previousText}
                delta={item.delta}
                deltaUnit={item.unit}
                favorableWhen={item.favorableWhen}
                hasBase={comparisonSnapshot.hasData}
              />
            ))}
          </div>

          <div className="mt-2 grid gap-2 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)]">
            <div className="rounded-lg bg-muted/35 p-2">
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-extrabold">Receita x despesas x GOP</p>
                  <p className="text-[8px] text-muted-foreground">
                    GOP = receita operacional − despesas operacionais.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-[8px] text-muted-foreground">
                  <LegendDot className="bg-primary" label="Receita" />
                  <LegendDot className="bg-destructive" label="Despesas" />
                  <LegendDot className="bg-foreground/70" label="GOP" />
                </div>
              </div>
              <div className="painel-v2-compare-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={comparisonChartData} margin={{ top: 4, right: 4, left: -8, bottom: -4 }}>
                    <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.55} />
                    <XAxis
                      dataKey="periodo"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "var(--muted-foreground)", fontSize: 9 }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      width={52}
                      tick={{ fill: "var(--muted-foreground)", fontSize: 9 }}
                      tickFormatter={compactBRL}
                    />
                    <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [fmtBRL(Number(value)), metricLabel(String(name))]} />
                    <Bar dataKey="receita" fill="var(--primary)" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="despesas" fill="var(--destructive)" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="gop" fill="var(--foreground)" fillOpacity={0.72} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-lg border border-border bg-background/60 p-2.5">
                <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  Lucro operacional (GOP)
                </p>
                <p className="mt-1 font-mono text-lg font-extrabold text-foreground">
                  {fmtBRL(currentSnapshot.gop)}
                </p>
                <p className="mt-1 text-[9px] text-muted-foreground">
                  {fmtBRL(currentSnapshot.totalRevenue)} receita − {fmtBRL(currentSnapshot.operatingExpenses)} despesas.
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background/60 p-2.5">
                <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  Margem operacional
                </p>
                <p className="mt-1 font-mono text-lg font-extrabold text-primary">
                  {formatNumber(currentSnapshot.gopMargin, 1)}%
                </p>
                <p className="mt-1 text-[9px] text-muted-foreground">
                  Indicador gerencial; não representa lucro líquido contábil.
                </p>
              </div>
            </div>
          </div>

          {!comparisonSnapshot.hasData && (
            <p className="mt-2 rounded-lg border border-dashed border-border bg-muted/30 px-2.5 py-2 text-[9px] text-muted-foreground">
              Não há base operacional suficiente em {comparisonLabel} para calcular variações confiáveis. O painel mantém a opção disponível e mostrará os comparativos automaticamente quando houver dados.
            </p>
          )}
        </section>

        <section className="grid gap-2 lg:grid-cols-2">
          <RankingPanel
            title="Receita por forma de pagamento"
            subtitle="Hospedagem rateada no mês + vendas extras, conforme a forma registrada."
            rows={revenueByPayment}
            emptyText="Nenhuma receita com forma de pagamento registrada no período."
          />
          <RankingPanel
            title="Receita de hospedagem por canal"
            subtitle="Compara os canais de origem das reservas válidas do mês."
            rows={revenueByChannel}
            emptyText="Nenhum canal de reserva disponível no período."
          />
        </section>

        <section className="grid gap-2 xl:grid-cols-3">
          <RankingPanel
            title="Ranking dos quartos"
            subtitle="Ordenado por receita de hospedagem; mostra também a ocupação mensal de cada UH."
            rows={roomRanking}
            emptyText="Nenhuma UH com receita no período."
          />

          <RankingPanel
            title="Despesas por categoria"
            subtitle={`Total operacional no mês: ${fmtBRL(currentSnapshot.operatingExpenses)}.`}
            rows={expenseByCategory}
            emptyText="Nenhuma despesa operacional cadastrada no período."
          />

          <article className="min-w-0 rounded-xl border border-border bg-card p-2.5">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <h2 className="text-xs font-extrabold">Perfil dos hóspedes</h2>
                <p className="text-[9px] text-muted-foreground">
                  Titulares vinculados às reservas válidas com estadia no mês.
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-sm font-extrabold text-primary">{guestProfiles.length}</p>
                <p className="text-[8px] text-muted-foreground">cadastros vinculados</p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <DistributionPanel title="Estado" rows={stateDistribution} />
              <DistributionPanel title="Sexo" rows={sexDistribution} />
              <DistributionPanel
                title="Idade"
                rows={ageDistribution}
                detail={averageAge ? `média ${formatNumber(averageAge, 1)} anos` : "idade média sem base"}
              />
              <DistributionPanel title="Estado civil" rows={civilDistribution} />
            </div>
          </article>
        </section>

        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex flex-col gap-2 border-b border-border px-3 py-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xs font-extrabold">Reservas</h2>
              <p className="text-[9px] text-muted-foreground">
                {filteredReservations.length} registro(s) · tabela detalhada abaixo da análise gerencial.
              </p>
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
                  const statusView = STATUS[status] ?? {
                    label: reservation.status,
                    className: "border-border bg-muted text-foreground",
                  };
                  return (
                    <tr
                      key={reservation.id}
                      className="painel-v2-table-row border-t border-border/70 transition hover:bg-muted/35"
                    >
                      <td className="px-3 font-mono font-semibold">
                        {reservation.codigo_externo || reservation.id.slice(0, 8)}
                      </td>
                      <td className="px-3 font-bold text-primary">{reservation.quarto}</td>
                      <td
                        className="max-w-[230px] truncate px-3 font-semibold"
                        title={reservation.cliente_nome}
                      >
                        {reservation.cliente_nome}
                      </td>
                      <td className="whitespace-nowrap px-3">{fmtDate(reservation.checkin)}</td>
                      <td className="whitespace-nowrap px-3">{fmtDate(reservation.checkout)}</td>
                      <td
                        className="max-w-[140px] truncate px-3"
                        title={reservation.canal ?? ""}
                      >
                        {reservation.canal || "Direto"}
                      </td>
                      <td className="px-3 text-right font-mono font-bold">
                        {fmtBRL(Number(reservation.valor_total ?? 0))}
                      </td>
                      <td className="px-3">
                        <span
                          className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[8px] font-extrabold ${statusView.className}`}
                        >
                          {statusView.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-[9px] text-muted-foreground">
            <span>Mostrando até {isFullscreen ? 30 : 18} linhas neste painel.</span>
            <a
              href="/reservas"
              className="inline-flex items-center gap-1 font-extrabold text-primary hover:underline"
            >
              Abrir gestão completa <ArrowUpRight className="h-3 w-3" />
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}

function ComparisonTile({
  label,
  currentText,
  previousText,
  delta,
  deltaUnit,
  favorableWhen,
  hasBase,
}: {
  label: string;
  currentText: string;
  previousText: string;
  delta: number | null;
  deltaUnit: string;
  favorableWhen: "up" | "down";
  hasBase: boolean;
}) {
  const favorable =
    delta === null
      ? null
      : favorableWhen === "up"
        ? delta >= 0
        : delta <= 0;
  const deltaText = !hasBase || delta === null ? "sem base" : `${delta >= 0 ? "+" : ""}${formatNumber(delta, 1)}${deltaUnit}`;

  return (
    <div className="min-w-0 rounded-lg border border-border bg-background/55 p-2">
      <div className="flex items-start justify-between gap-2">
        <p className="truncate text-[8px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground" title={label}>
          {label}
        </p>
        <span
          className={`shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[8px] font-extrabold ${
            favorable === null
              ? "bg-muted text-muted-foreground"
              : favorable
                ? "bg-emerald-500/10 text-emerald-700"
                : "bg-destructive/10 text-destructive"
          }`}
        >
          {deltaText}
        </span>
      </div>
      <p className="mt-1 truncate font-mono text-sm font-extrabold" title={currentText}>{currentText}</p>
      <p className="mt-0.5 truncate text-[8px] text-muted-foreground" title={previousText}>
        base: {hasBase ? previousText : "sem dados suficientes"}
      </p>
    </div>
  );
}

function RankingPanel({
  title,
  subtitle,
  rows,
  emptyText,
}: {
  title: string;
  subtitle: string;
  rows: RankingRow[];
  emptyText: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <article className="min-w-0 rounded-xl border border-border bg-card p-2.5">
      <div className="mb-2">
        <h2 className="text-xs font-extrabold">{title}</h2>
        <p className="text-[9px] text-muted-foreground">{subtitle}</p>
      </div>
      {!rows.length ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-[9px] text-muted-foreground">
          {emptyText}
        </div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((row, index) => (
            <div key={`${row.label}-${index}`} className="grid grid-cols-[minmax(80px,1fr)_minmax(110px,1.5fr)_auto] items-center gap-2">
              <div className="min-w-0">
                <p className="truncate text-[9px] font-bold" title={row.label}>{row.label}</p>
                {row.secondary && (
                  <p className="truncate text-[8px] text-muted-foreground" title={row.secondary}>{row.secondary}</p>
                )}
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.max(3, Math.min(100, (row.value / max) * 100))}%` }}
                />
              </div>
              <p className="whitespace-nowrap text-right font-mono text-[9px] font-extrabold">
                {fmtBRL(row.value)}
              </p>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function DistributionPanel({
  title,
  rows,
  detail,
}: {
  title: string;
  rows: DistributionRow[];
  detail?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/55 p-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[9px] font-extrabold">{title}</p>
        {detail && <span className="text-[8px] text-muted-foreground">{detail}</span>}
      </div>
      {!rows.length ? (
        <p className="text-[8px] text-muted-foreground">Sem dados cadastrados.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((row) => (
            <div key={row.label}>
              <div className="mb-0.5 flex items-center justify-between gap-2 text-[8px]">
                <span className="truncate font-semibold" title={row.label}>{row.label}</span>
                <span className="shrink-0 font-mono text-muted-foreground">
                  {row.value} · {formatNumber(row.share, 0)}%
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${clampPercent(row.share)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-2 w-2 rounded-sm ${className}`} /> {label}
    </span>
  );
}

function calculatePeriodSnapshot({
  start,
  end,
  reservations,
  sales,
  expenses,
  roomCount,
}: {
  start: string;
  end: string;
  reservations: Reservation[];
  sales: Sale[];
  expenses: Expense[];
  roomCount: number;
}): PeriodSnapshot {
  const overlapReservations = reservations.filter(
    (reservation) =>
      isOperationalReservation(reservation) && reservation.checkin < end && reservation.checkout > start,
  );

  let lodgingRevenue = 0;
  let lodgingPaid = 0;
  let occupiedNights = 0;

  overlapReservations.forEach((reservation) => {
    const overlap = overlapNights(reservation.checkin, reservation.checkout, start, end);
    const totalNights = Math.max(1, nightsBetween(reservation.checkin, reservation.checkout));
    if (!overlap) return;
    const ratio = overlap / totalNights;
    lodgingRevenue += Number(reservation.valor_total ?? 0) * ratio;
    lodgingPaid +=
      Math.min(Number(reservation.valor_pago ?? 0), Number(reservation.valor_total ?? 0)) * ratio;
    occupiedNights += overlap;
  });

  const periodSales = sales.filter(
    (sale) => sale.data >= start && sale.data < end && normalize(sale.status) !== "cancelado",
  );
  const extraRevenue = periodSales.reduce((sum, sale) => sum + Number(sale.total ?? 0), 0);
  const extraPaid = periodSales.reduce(
    (sum, sale) => sum + Math.min(Number(sale.valor_pago ?? 0), Number(sale.total ?? 0)),
    0,
  );

  const periodExpenses = expenses.filter((expense) => expense.data >= start && expense.data < end);
  const operatingExpenses = periodExpenses
    .filter((expense) => !isFinancialMovement(expense.categoria, expense.descricao))
    .reduce((sum, expense) => sum + Number(expense.valor ?? 0), 0);

  const days = Math.max(1, nightsBetween(start, end));
  const availableRoomNights = Math.max(0, roomCount * days);
  const totalRevenue = lodgingRevenue + extraRevenue;
  const totalPaid = lodgingPaid + extraPaid;
  const gop = totalRevenue - operatingExpenses;
  const gopMargin = totalRevenue ? (gop / totalRevenue) * 100 : 0;
  const occupancy = availableRoomNights ? Math.min(100, (occupiedNights / availableRoomNights) * 100) : 0;
  const adr = occupiedNights ? lodgingRevenue / occupiedNights : 0;
  const revpar = availableRoomNights ? lodgingRevenue / availableRoomNights : 0;
  const trevpar = availableRoomNights ? totalRevenue / availableRoomNights : 0;
  const goppar = availableRoomNights ? gop / availableRoomNights : 0;
  const reservationCount = overlapReservations.length;
  const ticketAverage = reservationCount ? totalRevenue / reservationCount : 0;

  return {
    lodgingRevenue,
    lodgingPaid,
    extraRevenue,
    extraPaid,
    totalRevenue,
    totalPaid,
    occupiedNights,
    operatingExpenses,
    gop,
    gopMargin,
    occupancy,
    adr,
    revpar,
    trevpar,
    goppar,
    ticketAverage,
    reservationCount,
    hasData: overlapReservations.length > 0 || periodSales.length > 0 || periodExpenses.length > 0,
  };
}

function mapToRanking(totals: Map<string, number>, denominator: number, limit: number): RankingRow[] {
  return [...totals.entries()]
    .filter(([, value]) => Number.isFinite(value) && value > 0)
    .map(([label, value]) => ({
      label,
      value,
      secondary: denominator > 0 ? `${formatNumber((value / denominator) * 100, 1)}% do total` : undefined,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

function buildDistribution(values: string[], limit: number): DistributionRow[] {
  if (!values.length) return [];
  const totals = new Map<string, number>();
  values.forEach((value) => addToMap(totals, value, 1));
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const head = sorted.slice(0, limit);
  const tail = sorted.slice(limit).reduce((sum, [, value]) => sum + value, 0);
  if (tail > 0) head.push(["Outros", tail]);
  return head.map(([label, value]) => ({ label, value, share: (value / values.length) * 100 }));
}

function buildAgeDistribution(clients: Client[], today: string): DistributionRow[] {
  if (!clients.length) return [];
  const buckets = new Map<string, number>([
    ["Até 24", 0],
    ["25–34", 0],
    ["35–44", 0],
    ["45–54", 0],
    ["55–64", 0],
    ["65+", 0],
    ["Não informado", 0],
  ]);

  clients.forEach((client) => {
    const age = ageFromBirthDate(client.data_nascimento, today);
    let bucket = "Não informado";
    if (age !== null) {
      if (age <= 24) bucket = "Até 24";
      else if (age <= 34) bucket = "25–34";
      else if (age <= 44) bucket = "35–44";
      else if (age <= 54) bucket = "45–54";
      else if (age <= 64) bucket = "55–64";
      else bucket = "65+";
    }
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  });

  return [...buckets.entries()]
    .filter(([, value]) => value > 0)
    .map(([label, value]) => ({ label, value, share: (value / clients.length) * 100 }));
}

function ageFromBirthDate(date: string | null | undefined, today: string) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [birthYear, birthMonth, birthDay] = date.split("-").map(Number);
  const [year, month, day] = today.split("-").map(Number);
  let age = year - birthYear;
  if (month < birthMonth || (month === birthMonth && day < birthDay)) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

function addToMap<K>(map: Map<K, number>, key: K, amount: number) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function metricLabel(value: string) {
  if (value === "receita") return "Receita";
  if (value === "despesas") return "Despesas";
  if (value === "gop") return "GOP";
  return value;
}

function percentageChange(current: number, previous: number) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || Math.abs(previous) < 0.005) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
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
  return value.includes("retirada") || value.includes("movimentacao financeira");
}

function isOperationalReservation(reservation: Reservation) {
  const status = normalize(reservation.status);
  return !["cancelado", "manutencao"].includes(status) && !isNoShow(reservation);
}

function isNoShow(reservation: Reservation) {
  const row = reservation as Reservation & { presence_status?: string | null };
  const value = normalize(`${reservation.status ?? ""} ${row.presence_status ?? ""}`);
  return (
    value.includes("no_show") ||
    value.includes("no-show") ||
    value.includes("nao compareceu")
  );
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

function previousMonthISO(monthStart: string) {
  const [year, month] = monthStart.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function sameMonthPreviousYearISO(monthStart: string) {
  const [year, month] = monthStart.split("-").map(Number);
  return `${year - 1}-${String(month).padStart(2, "0")}-01`;
}

function formatMonthLabel(monthStart: string, short: boolean) {
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    month: short ? "short" : "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return formatter
    .format(new Date(`${monthStart}T12:00:00Z`))
    .replace(" de ", "/")
    .replace(".", "");
}

function dimensionLabel(value: unknown, fallback: string) {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "-" || normalize(raw) === "nao informado") return fallback;
  return raw
    .replace(/_/g, " ")
    .split(/\s+/)
    .map((part) => {
      const normalized = normalize(part);
      if (["pix", "ted", "doc"].includes(normalized)) return part.toUpperCase();
      if (normalized === "booking.com") return "Booking.com";
      return part.charAt(0).toLocaleUpperCase("pt-BR") + part.slice(1).toLocaleLowerCase("pt-BR");
    })
    .join(" ");
}

function formatNumber(value: number, digits: number) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number.isFinite(value) ? value : 0);
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
