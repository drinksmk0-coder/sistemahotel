import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
  Search,
  Star,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  useCurrentCompany,
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
  reservado: {
    label: "Reservado",
    className: "border-sky-400/20 bg-sky-400/10 text-sky-300",
  },
  ocupado: {
    label: "Hospedado",
    className: "border-amber-400/20 bg-amber-400/10 text-amber-300",
  },
  saida_pendente: {
    label: "Saída pendente",
    className: "border-orange-400/20 bg-orange-400/10 text-orange-300",
  },
  finalizado: {
    label: "Finalizado",
    className: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
  },
  cancelado: {
    label: "Cancelado",
    className: "border-red-400/20 bg-red-400/10 text-red-300",
  },
  manutencao: {
    label: "Manutenção",
    className: "border-zinc-400/20 bg-zinc-400/10 text-zinc-300",
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

function PainelAtraente() {
  const today = todayISO();
  const currentCompany = useCurrentCompany();
  const { data: rooms = [] } = useRooms();
  const { data: reservations = [] } = useReservations();
  const { data: sales = [] } = useSales();
  const { data: rawFeedbacks = [] } = useFeedbacks();
  const feedbacks = rawFeedbacks as Array<any>;
  const [statusFilter, setStatusFilter] = useState<"todos" | StatusKey>("todos");
  const [query, setQuery] = useState("");

  const monthStart = `${today.slice(0, 7)}-01`;
  const nextMonth = nextMonthISO(monthStart);
  const monthLabel = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(`${monthStart}T12:00:00-03:00`));

  const validReservations = useMemo(
    () => reservations.filter((reservation) => !["cancelado", "manutencao"].includes(reservation.status)),
    [reservations],
  );

  const monthReservations = useMemo(
    () =>
      validReservations.filter(
        (reservation) => reservation.checkin < nextMonth && reservation.checkout > monthStart,
      ),
    [monthStart, nextMonth, validReservations],
  );

  const activeStays = useMemo(
    () =>
      validReservations.filter((reservation) => {
        const row = reservation as Reservation & { checkout_at?: string | null };
        if (row.checkout_at) return false;
        if (!["ocupado", "saida_pendente"].includes(row.status)) return false;
        return row.checkin <= today;
      }),
    [today, validReservations],
  );

  const activeRooms = new Set(activeStays.map((reservation) => reservation.quarto));
  const occupiedRooms = activeRooms.size;
  const currentOccupancy = rooms.length ? (occupiedRooms / rooms.length) * 100 : 0;
  const activeGuests = activeStays.reduce(
    (sum, reservation) => sum + Math.max(1, Number(reservation.pessoas ?? 1)),
    0,
  );
  const departuresPending = activeStays.filter(
    (reservation) => reservation.status === "saida_pendente" || reservation.checkout <= today,
  ).length;
  const arrivalsToday = validReservations.filter(
    (reservation) => reservation.checkin === today && reservation.status === "reservado",
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
      (sale) => sale.data >= monthStart && sale.data < nextMonth && sale.status !== "cancelado",
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

  const adr = financial.occupiedNights ? financial.lodgingRevenue / financial.occupiedNights : 0;
  const receivedRate = financial.totalRevenue
    ? Math.min(100, (financial.totalPaid / financial.totalRevenue) * 100)
    : 0;

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
      .filter((sale) => sale.data >= monthStart && sale.data < nextMonth && sale.status !== "cancelado")
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
        dia: new Intl.DateTimeFormat("pt-BR", {
          weekday: "short",
          timeZone: "UTC",
        })
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
        const matchesStatus = statusFilter === "todos" || reservation.status === statusFilter;
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

  const cards = [
    {
      icon: TrendingUp,
      label: `Receita contratada · ${capitalize(monthLabel.split(" de ")[0] || monthLabel)}`,
      value: fmtBRL(financial.totalRevenue),
      side: `${Math.round(receivedRate)}% recebido`,
      hint: `${fmtBRL(financial.lodgingRevenue)} hospedagem + ${fmtBRL(financial.extraRevenue)} extras`,
    },
    {
      icon: BedDouble,
      label: "Ocupação atual",
      value: `${Math.round(currentOccupancy)}%`,
      side: `${arrivalsToday} chegada(s) hoje`,
      hint: `${occupiedRooms} de ${rooms.length} UHs ocupadas`,
    },
    {
      icon: Users,
      label: "Hóspedes no hotel",
      value: String(activeGuests),
      side: `${departuresPending} saída(s) pendente(s)`,
      hint: `${occupiedRooms} quarto(s) em hospedagem`,
    },
    {
      icon: CalendarDays,
      label: "ADR contratado",
      value: fmtBRL(adr),
      side: `${financial.occupiedNights} diária(s)`,
      hint: "Receita de hospedagem ÷ diárias ocupadas do mês",
    },
  ];

  const indicators = [
    { label: "Receita já recebida", value: receivedRate },
    { label: "Satisfação dos hóspedes", value: satisfactionRate },
    { label: "Participação Booking", value: bookingShare },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-[#2b2630] bg-[#0d0b11] text-[#f5f0e8] shadow-2xl">
      <section className="border-b border-[#2b2630] bg-[#100e14]/95 px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#c9983c] text-[#16110a] shadow-[0_8px_30px_rgba(201,152,60,.2)]">
              <Building2 className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-serif text-xl font-semibold tracking-wide">
                {currentCompany.data?.nome ?? "HospedaMais"}
              </p>
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#817a89]">
                Painel visual V2 · dados reais do HospedaMais
              </p>
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <a
              href="/reservas"
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#c9983c] px-4 text-xs font-bold text-[#171109] transition hover:bg-[#d8aa53]"
            >
              <ArrowUpRight className="h-4 w-4" /> Reservas
            </a>
            <button
              type="button"
              onClick={exportVisible}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#37313d] bg-white/[0.03] px-3 text-xs font-semibold text-[#c9c2cf] transition hover:bg-white/[0.07] hover:text-white"
            >
              <Download className="h-4 w-4" /> CSV
            </button>
          </div>
        </div>
      </section>

      <div className="space-y-6 px-4 py-5 sm:px-6 sm:py-7">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#c9983c]">Visão executiva</p>
            <h1 className="mt-1 font-serif text-3xl font-bold tracking-tight sm:text-4xl">Painel de controle</h1>
            <p className="mt-1 text-sm text-[#847e8d]">
              {capitalize(monthLabel)} · reservas, hóspedes, receita e ocupação em uma única leitura.
            </p>
          </div>
          <div className="rounded-xl border border-[#2b2630] bg-white/[0.025] px-4 py-2 text-right">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#726b7a]">Data operacional</p>
            <p className="font-mono text-sm font-semibold text-[#d7cfdb]">{fmtDate(today)}</p>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {cards.map(({ icon: Icon, label, value, side, hint }) => (
            <article
              key={label}
              className="group rounded-xl border border-[#2b2630] bg-[#15121a] p-4 transition hover:-translate-y-0.5 hover:border-[#c9983c]/35 hover:shadow-[0_16px_40px_rgba(0,0,0,.28)]"
            >
              <div className="mb-5 flex items-start justify-between gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#c9983c]/10 text-[#d8aa53]">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="max-w-[52%] text-right text-[10px] font-semibold leading-relaxed text-[#8c8594]">{side}</span>
              </div>
              <p className="font-mono text-2xl font-bold tracking-tight text-white">{value}</p>
              <p className="mt-1 text-xs font-semibold text-[#d8d2dc]">{label}</p>
              <p className="mt-1.5 text-[10px] leading-relaxed text-[#716b79]">{hint}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
          <article className="rounded-xl border border-[#2b2630] bg-[#15121a] p-4 sm:p-5">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-white">Receita por semana do mês</h2>
                <p className="mt-1 text-[10px] text-[#777180]">
                  Hospedagem alocada por diária + vendas extras. Inclui reservas futuras confirmadas do mês.
                </p>
              </div>
              <strong className="font-mono text-lg text-[#d8aa53]">{fmtBRL(financial.totalRevenue)}</strong>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueByWeek} barSize={28}>
                  <CartesianGrid vertical={false} stroke="rgba(255,255,255,.05)" />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#817a89", fontSize: 10 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    width={64}
                    tick={{ fill: "#817a89", fontSize: 10 }}
                    tickFormatter={(value) => `R$${Math.round(Number(value) / 1000)}k`}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(255,255,255,.025)" }}
                    contentStyle={{
                      background: "#0f0d13",
                      border: "1px solid #342f39",
                      borderRadius: 10,
                      color: "#f5f0e8",
                      fontSize: 11,
                    }}
                    formatter={(value) => [fmtBRL(Number(value)), "Receita"]}
                    labelFormatter={(label) => `Dias ${label}`}
                  />
                  <Bar dataKey="receita" fill="#c9983c" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <article className="rounded-xl border border-[#2b2630] bg-[#15121a] p-4 sm:p-5">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-white">Ocupação</h2>
                  <p className="mt-1 text-[10px] text-[#777180]">Últimos 7 dias</p>
                </div>
                <span className="font-mono text-2xl font-bold text-[#d8aa53]">{Math.round(currentOccupancy)}%</span>
              </div>
              <div className="h-28">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={occupancyTrend}>
                    <defs>
                      <linearGradient id="painelAtrativoOccupancy" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="5%" stopColor="#c9983c" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#c9983c" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="dia"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#817a89", fontSize: 9 }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#0f0d13",
                        border: "1px solid #342f39",
                        borderRadius: 10,
                        color: "#f5f0e8",
                        fontSize: 11,
                      }}
                      formatter={(value) => [`${value}%`, "Ocupação"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="taxa"
                      stroke="#c9983c"
                      strokeWidth={2}
                      fill="url(#painelAtrativoOccupancy)"
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="rounded-xl border border-[#2b2630] bg-[#15121a] p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-sm font-bold text-white">Indicadores do mês</h2>
                {averageScore > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#c9983c]/10 px-2 py-1 font-mono text-[10px] text-[#d8aa53]">
                    <Star className="h-3 w-3 fill-current" /> {averageScore.toFixed(1)}
                  </span>
                )}
              </div>
              <div className="space-y-4">
                {indicators.map((indicator) => (
                  <div key={indicator.label}>
                    <div className="mb-1.5 flex items-center justify-between text-[10px]">
                      <span className="text-[#9a93a1]">{indicator.label}</span>
                      <strong className="font-mono text-[#e2dbe6]">{Math.round(indicator.value)}%</strong>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                      <div
                        className="h-full rounded-full bg-[#c9983c]"
                        style={{ width: `${Math.max(0, Math.min(100, indicator.value))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2 border-t border-[#2b2630] pt-4">
                <div className="rounded-lg bg-white/[0.025] p-3">
                  <p className="font-mono text-lg font-bold text-white">{averageStay.toFixed(1)}</p>
                  <p className="mt-0.5 text-[9px] text-[#777180]">média de diárias</p>
                </div>
                <div className="rounded-lg bg-white/[0.025] p-3">
                  <p className="font-mono text-lg font-bold text-white">{monthReservations.length}</p>
                  <p className="mt-0.5 text-[9px] text-[#777180]">reservas no mês</p>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-[#2b2630] bg-[#15121a]">
          <div className="flex flex-col gap-3 border-b border-[#2b2630] px-4 py-4 lg:flex-row lg:items-center lg:justify-between sm:px-5">
            <div>
              <h2 className="text-sm font-bold text-white">Reservas</h2>
              <p className="mt-1 text-[10px] text-[#777180]">{filteredReservations.length} registro(s) visível(is)</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-lg bg-white/[0.035] p-1">
                {FILTERS.map((filter) => (
                  <button
                    type="button"
                    key={filter.key}
                    onClick={() => setStatusFilter(filter.key)}
                    className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-[10px] font-semibold transition ${
                      statusFilter === filter.key
                        ? "bg-[#c9983c] text-[#171109]"
                        : "text-[#817a89] hover:bg-white/[0.05] hover:text-white"
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
              <label className="relative min-w-[190px] flex-1 sm:flex-none">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#716b79]" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar hóspede, UH, canal…"
                  className="h-9 w-full rounded-lg border border-[#342f39] bg-[#0f0d13] pl-9 pr-3 text-xs text-white outline-none placeholder:text-[#615b68] focus:border-[#c9983c]/50 sm:w-64"
                />
              </label>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-xs">
              <thead>
                <tr className="border-b border-[#2b2630] bg-white/[0.02] text-[9px] uppercase tracking-[0.12em] text-[#716b79]">
                  <th className="px-4 py-3 font-bold sm:px-5">Reserva</th>
                  <th className="px-3 py-3 font-bold">UH</th>
                  <th className="px-3 py-3 font-bold">Hóspede</th>
                  <th className="px-3 py-3 font-bold">Entrada</th>
                  <th className="px-3 py-3 font-bold">Saída</th>
                  <th className="px-3 py-3 font-bold">Pessoas</th>
                  <th className="px-3 py-3 font-bold">Canal</th>
                  <th className="px-3 py-3 font-bold">Total</th>
                  <th className="px-3 py-3 font-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredReservations.slice(0, 60).map((reservation) => {
                  const status = STATUS[(reservation.status as StatusKey) || "reservado"] ?? STATUS.reservado;
                  return (
                    <tr
                      key={reservation.id}
                      className="border-b border-[#2b2630]/70 text-[#bfb8c5] transition last:border-0 hover:bg-white/[0.025]"
                    >
                      <td className="px-4 py-3 sm:px-5">
                        <a
                          href={`/reservas?editar=${reservation.id}`}
                          className="font-mono text-[10px] font-semibold text-[#d8aa53] hover:underline"
                        >
                          {reservation.codigo_externo || reservation.id.slice(0, 8).toUpperCase()}
                        </a>
                      </td>
                      <td className="px-3 py-3 font-mono font-bold text-white">{reservation.quarto}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[#c9983c]/20 bg-[#c9983c]/10 text-[9px] font-bold text-[#d8aa53]">
                            {initials(reservation.cliente_nome)}
                          </span>
                          <span className="max-w-[220px] truncate font-semibold text-[#e5dfe8]">{reservation.cliente_nome}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 font-mono text-[10px]">{fmtDate(reservation.checkin)}</td>
                      <td className="px-3 py-3 font-mono text-[10px]">{fmtDate(reservation.checkout)}</td>
                      <td className="px-3 py-3 text-center font-mono">{reservation.pessoas}</td>
                      <td className="px-3 py-3 text-[10px]">{reservation.canal || "—"}</td>
                      <td className="px-3 py-3 font-mono font-semibold text-[#e8e2ec]">{fmtBRL(Number(reservation.valor_total ?? 0))}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-full border px-2 py-1 text-[9px] font-bold ${status.className}`}>
                          {status.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredReservations.length === 0 && (
            <div className="px-5 py-12 text-center text-xs text-[#777180]">Nenhuma reserva encontrada com esses filtros.</div>
          )}
          {filteredReservations.length > 60 && (
            <div className="border-t border-[#2b2630] px-5 py-3 text-center text-[10px] text-[#716b79]">
              Mostrando as 60 reservas mais recentes deste filtro.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function overlapNights(checkin: string, checkout: string, start: string, end: string) {
  const overlapStart = maxISO(checkin, start);
  const overlapEnd = minISO(checkout, end);
  return overlapStart < overlapEnd ? nightsBetween(overlapStart, overlapEnd) : 0;
}

function maxISO(a: string, b: string) {
  return a > b ? a : b;
}

function minISO(a: string, b: string) {
  return a < b ? a : b;
}

function nextMonthISO(monthStart: string) {
  const [year, month] = monthStart.split("-").map(Number);
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
}

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "H";
  return `${parts[0]?.[0] ?? ""}${parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : ""}`.toUpperCase();
}

function capitalize(value: string) {
  return value ? value.charAt(0).toLocaleUpperCase("pt-BR") + value.slice(1) : value;
}
