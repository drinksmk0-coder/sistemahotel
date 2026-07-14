import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  BedDouble,
  CalendarClock,
  ClipboardCheck,
  Coffee,
  DollarSign,
  DoorOpen,
  MessageSquareWarning,
  Star,
  Wifi,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  Cell,
} from "recharts";
import {
  useRooms,
  useReservations,
  useSales,
  useComplaints,
  useFeedbacks,
  useExpenses,
  roomStatusToday,
  type Room,
  type Reservation,
  type Sale,
  type Expense,
  type Feedback,
} from "@/lib/data";
import { fmtBRL, todayISO } from "@/lib/format";
import { complaintLabel } from "@/lib/constants";
import { PageHeader } from "@/components/AppLayout";
import { Badge } from "@/components/ui-kit";
import { useRole, useSession } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/painel")({
  component: Painel,
});

function Painel() {
  const { user } = useSession();
  const { data: role } = useRole(user);
  const today = todayISO();
  const month = today.slice(0, 7);
  const previousMonth = addMonths(month, -1);
  const previousYearMonth = addYears(month, -1);
  const { data: rooms = [] } = useRooms();
  const { data: reservations = [] } = useReservations();
  const { data: sales = [] } = useSales();
  const { data: complaints = [] } = useComplaints();
  const { data: feedbacks = [] } = useFeedbacks();
  const { data: expenses = [] } = useExpenses();

  const statuses = rooms.map((r) => roomStatusToday(reservations, r.numero, today));
  const ocupados = statuses.filter((s) => s === "ocupado").length;
  const reservados = statuses.filter((s) => s === "reservado").length;
  const livres = statuses.filter((s) => s === "livre").length;
  const ocupacao = rooms.length ? Math.round((ocupados / rooms.length) * 100) : 0;

  const receitaMes =
    reservations
      .filter((r) => (r.checkin || "").slice(0, 7) === month)
      .reduce((s, r) => s + Number(r.valor_pago), 0) +
    sales.filter((s) => (s.data || "").slice(0, 7) === month).reduce((s, v) => s + Number(v.total), 0);

  const aReceber = reservations
    .filter((r) => !r.pago && r.status !== "cancelado" && r.status !== "finalizado")
    .reduce((s, r) => s + (Number(r.valor_total) - Number(r.valor_pago)), 0);

  const despesasMes = expenses
    .filter((e) => (e.data || "").slice(0, 7) === month)
    .reduce((s, e) => s + Number(e.valor), 0);
  const margemMes = receitaMes - despesasMes;
  const activeToday = reservations.filter(
    (r) =>
      r.status !== "cancelado" &&
      r.status !== "finalizado" &&
      r.status !== "manutencao" &&
      r.checkin <= today &&
      r.checkout >= today,
  );
  const ocupantesHoje = activeToday.reduce((sum, r) => sum + Number(r.pessoas ?? 1), 0);
  const capacidadeTotal = rooms.reduce((sum, room) => sum + roomCapacity(room.configuracao), 0);
  const diariaMedia = reservations.length
    ? reservations.reduce((sum, r) => sum + Number(r.valor_diaria), 0) / reservations.length
    : rooms.length
      ? rooms.reduce((sum, r) => sum + Number(r.preco), 0) / rooms.length
      : 0;

  const abertas = complaints.filter((c) => c.status !== "resolvido");
  const notas = feedbacks.map((f) => f.nota_geral).filter((n): n is number => n != null);
  const media = notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : 0;

  const currentMetrics = useMemo(
    () => buildMonthMetrics(month, reservations, sales, expenses, feedbacks, rooms.length),
    [month, reservations, sales, expenses, feedbacks, rooms.length],
  );
  const previousMonthMetrics = useMemo(
    () => buildMonthMetrics(previousMonth, reservations, sales, expenses, feedbacks, rooms.length),
    [previousMonth, reservations, sales, expenses, feedbacks, rooms.length],
  );
  const previousYearMetrics = useMemo(
    () => buildMonthMetrics(previousYearMonth, reservations, sales, expenses, feedbacks, rooms.length),
    [previousYearMonth, reservations, sales, expenses, feedbacks, rooms.length],
  );

  const byRoom = new Map<number, number>();
  complaints
    .filter((c) => c.status !== "resolvido")
    .forEach((c) => {
      if (c.quarto != null) byRoom.set(c.quarto, (byRoom.get(c.quarto) ?? 0) + 1);
    });
  const recorrentes = [...byRoom.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]);

  const wifiCount = complaints.filter((c) => c.categoria === "wifi").length;

  // --- Temporal series (last 30 days) ---
  const series = useMemo(() => buildSeries(reservations, sales, today), [reservations, sales, today]);
  const totals = useMemo(
    () =>
      series.reduce(
        (acc, d) => {
          acc.receita += d.receita;
          acc.cancelamentos += d.cancelamentos;
          acc.comparecimento += d.comparecimento;
          return acc;
        },
        { receita: 0, cancelamentos: 0, comparecimento: 0 },
      ),
    [series],
  );
  const alerta = totals.cancelamentos > totals.comparecimento && totals.cancelamentos > 0;
  const dailyAverage = series.length ? series.reduce((sum, day) => sum + day.receita, 0) / series.length : 0;
  const monthlySeries = useMemo(
    () => buildMonthlySeries(month, reservations, sales, expenses),
    [month, reservations, sales, expenses],
  );
  const monthlyAverage = monthlySeries.length
    ? monthlySeries.reduce((sum, item) => sum + item.receita, 0) / monthlySeries.length
    : 0;

  const receitaPorQuarto = useMemo(() => {
    const m = new Map<number, number>();
    reservations.forEach((r) => m.set(r.quarto, (m.get(r.quarto) ?? 0) + Number(r.valor_pago)));
    sales.forEach((s) => m.set(s.quarto, (m.get(s.quarto) ?? 0) + Number(s.total)));
    return [...m.entries()]
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([quarto, receita]) => ({ quarto: `Q${quarto}`, receita }));
  }, [reservations, sales]);

  const arrivalsToday = reservations.filter((r) => r.status !== "cancelado" && r.checkin === today);
  const departuresToday = reservations.filter((r) => r.status !== "cancelado" && r.checkout === today);

  if (role === "limpeza") {
    return (
      <LimpezaPainel
        rooms={rooms}
        reservations={reservations}
        today={today}
        departuresToday={departuresToday}
      />
    );
  }

  if (role === "cafe") {
    return <CafePainel activeToday={activeToday} ocupantesHoje={ocupantesHoje} capacidadeTotal={capacidadeTotal} />;
  }

  if (role === "recepcao") {
    return (
      <RecepcaoPainel
        ocupacao={ocupacao}
        ocupados={ocupados}
        reservados={reservados}
        livres={livres}
        arrivalsToday={arrivalsToday}
        departuresToday={departuresToday}
        aReceber={aReceber}
        abertas={abertas.length}
        ocupantesHoje={ocupantesHoje}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Painel de operação"
        subtitle="Visão geral de hoje, análise temporal e problemas recorrentes por quarto."
      />

      {alerta && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-brick/40 bg-brick-bg px-4 py-3 text-sm text-brick">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Atenção: cancelamentos acima do comparecimento</p>
            <p>
              Nos últimos 30 dias houve {totals.cancelamentos} cancelamento(s) contra {totals.comparecimento}{" "}
              comparecimento(s), com receita de {fmtBRL(totals.receita)}. Vale investigar o motivo dos cancelamentos.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
        <Stat icon={<BedDouble />} label="Ocupação hoje" value={`${ocupacao}%`} hint={`${ocupados} ocupados · ${reservados} reservados · ${livres} livres`} />
        <Stat icon={<DollarSign />} label="Receita do mês" value={fmtBRL(receitaMes)} hint={`A receber: ${fmtBRL(aReceber)}`} />
        <Stat icon={<MessageSquareWarning />} label="Reclamações abertas" value={String(abertas.length)} hint={`${wifiCount} sobre Wi-Fi`} />
        <Stat icon={<Star />} label="Avaliação média" value={media ? media.toFixed(1) : "—"} hint={`${feedbacks.length} avaliações`} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={<DollarSign />} label="Diaria media" value={fmtBRL(diariaMedia)} hint="Reservas e quartos" />
        <Stat icon={<BedDouble />} label="Ocupantes" value={String(ocupantesHoje)} hint={`Capacidade: ${capacidadeTotal}`} />
        <Stat icon={<DollarSign />} label="Despesas" value={fmtBRL(despesasMes)} hint={`Margem: ${fmtBRL(margemMes)}`} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ComparisonStat
          icon={<DollarSign />}
          label="Receitas totais"
          value={fmtBRL(currentMetrics.receita)}
          monthDelta={delta(currentMetrics.receita, previousMonthMetrics.receita)}
          yearDelta={delta(currentMetrics.receita, previousYearMetrics.receita)}
        />
        <ComparisonStat
          icon={<DollarSign />}
          label="Despesas"
          value={fmtBRL(currentMetrics.despesas)}
          monthDelta={delta(currentMetrics.despesas, previousMonthMetrics.despesas)}
          yearDelta={delta(currentMetrics.despesas, previousYearMetrics.despesas)}
          lowerIsBetter
        />
        <ComparisonStat
          icon={<BedDouble />}
          label="Ocupação mensal"
          value={`${currentMetrics.ocupacao}%`}
          monthDelta={delta(currentMetrics.ocupacao, previousMonthMetrics.ocupacao)}
          yearDelta={delta(currentMetrics.ocupacao, previousYearMetrics.ocupacao)}
        />
        <ComparisonStat
          icon={<Star />}
          label="Avaliação"
          value={currentMetrics.avaliacao ? currentMetrics.avaliacao.toFixed(1) : "—"}
          monthDelta={delta(currentMetrics.avaliacao, previousMonthMetrics.avaliacao)}
          yearDelta={delta(currentMetrics.avaliacao, previousYearMetrics.avaliacao)}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 2xl:grid-cols-2">
        <div className="card-surface p-5">
          <h3 className="section-title mb-3 text-lg">Receita ao longo do tempo (30 dias)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={series} margin={{ left: -10, right: 8, top: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => fmtBRL(v)} />
              <Bar dataKey="receita" name="Receita" radius={[4, 4, 0, 0]}>
                {series.map((entry) => (
                  <Cell key={entry.key} fill={performanceColor(entry.receita, dailyAverage)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card-surface p-5">
          <h3 className="section-title mb-3 text-lg">Comparecimento x cancelamentos</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={series} margin={{ left: -20, right: 8, top: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="comparecimento" name="Comparecimento" stroke="var(--sage)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="cancelamentos" name="Cancelamentos" stroke="var(--brick)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-4 card-surface p-5">
        <h3 className="section-title mb-3 text-lg">Receita mensal x despesas</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={monthlySeries} margin={{ left: -10, right: 8, top: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: number) => fmtBRL(v)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="receita" name="Receita" radius={[4, 4, 0, 0]}>
              {monthlySeries.map((entry) => (
                <Cell key={`receita-${entry.key}`} fill={performanceColor(entry.receita, monthlyAverage)} />
              ))}
            </Bar>
            <Bar dataKey="despesas" name="Despesas" fill="var(--brick)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 card-surface p-5">
        <h3 className="section-title mb-3 text-lg">Receita por quarto</h3>
        {receitaPorQuarto.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem receita registrada ainda.</p>
        ) : (
            <ResponsiveContainer width="100%" height={280}>
            <BarChart data={receitaPorQuarto} margin={{ left: -10, right: 8, top: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="quarto" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => fmtBRL(v)} />
              <Bar dataKey="receita" name="Receita" fill="var(--pine)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 2xl:grid-cols-2">
        <div className="card-surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="section-title text-lg">Quartos com problema recorrente</h3>
            <Link to="/reclamacoes" className="text-xs font-semibold text-pine hover:underline">
              ver todas
            </Link>
          </div>
          {recorrentes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum quarto com reclamações repetidas. Bom sinal! 🎉
            </p>
          ) : (
            <ul className="space-y-2">
              {recorrentes.map(([q, n]) => {
                const cats = complaints.filter((c) => c.quarto === q);
                const topCat = mostCommon(cats.map((c) => c.categoria));
                return (
                  <li key={q} className="flex items-center justify-between rounded-lg bg-brick-bg/50 px-3 py-2">
                    <div>
                      <span className="font-semibold">Quarto {q}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        principalmente: {complaintLabel(topCat)}
                      </span>
                    </div>
                    <Badge tone="brick">{n} reclamações</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="card-surface p-5">
          <div className="mb-3 flex items-center gap-2">
            <Wifi className="h-5 w-5 text-pine" />
            <h3 className="section-title text-lg">Wi-Fi: quarto x aparelho</h3>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Ajuda a saber se o problema é do quarto ou do aparelho do hóspede.
          </p>
          <WifiInsight complaints={complaints} feedbacks={feedbacks} />
        </div>
      </div>
    </div>
  );
}

function RecepcaoPainel({
  ocupacao,
  ocupados,
  reservados,
  livres,
  arrivalsToday,
  departuresToday,
  aReceber,
  abertas,
  ocupantesHoje,
}: {
  ocupacao: number;
  ocupados: number;
  reservados: number;
  livres: number;
  arrivalsToday: Reservation[];
  departuresToday: Reservation[];
  aReceber: number;
  abertas: number;
  ocupantesHoje: number;
}) {
  return (
    <div>
      <PageHeader
        title="Recepcao"
        subtitle="Entradas, saidas, quartos e cobrancas de hoje."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        <Stat icon={<BedDouble />} label="Ocupacao" value={`${ocupacao}%`} hint={`${ocupados} ocupados · ${reservados} reservados · ${livres} livres`} />
        <Stat icon={<CalendarClock />} label="Entradas hoje" value={String(arrivalsToday.length)} hint="Reservas com check-in hoje" />
        <Stat icon={<DoorOpen />} label="Saidas hoje" value={String(departuresToday.length)} hint="Reservas com check-out hoje" />
        <Stat icon={<DollarSign />} label="A receber" value={fmtBRL(aReceber)} hint="Reservas em aberto" />
        <Stat icon={<MessageSquareWarning />} label="Alertas" value={String(abertas)} hint={`${ocupantesHoje} ocupantes no hotel`} />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <TodayList title="Check-ins de hoje" empty="Nenhuma entrada prevista." reservations={arrivalsToday} />
        <TodayList title="Check-outs de hoje" empty="Nenhuma saida prevista." reservations={departuresToday} />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <QuickLink to="/mapa" icon={<BedDouble />} label="Abrir mapa de quartos" />
        <QuickLink to="/reservas" icon={<CalendarClock />} label="Cadastrar reserva" />
        <QuickLink to="/clientes" icon={<ClipboardCheck />} label="Consultar clientes" />
        <QuickLink to="/vendas" icon={<DollarSign />} label="Lancar venda" />
      </div>
    </div>
  );
}

function LimpezaPainel({
  rooms,
  reservations,
  today,
  departuresToday,
}: {
  rooms: Room[];
  reservations: Reservation[];
  today: string;
  departuresToday: Reservation[];
}) {
  const checkoutRooms = new Set(departuresToday.map((r) => r.quarto));
  const cleaningRooms = rooms
    .filter((room) => {
      const situacao = String((room as { situacao?: string | null }).situacao ?? "");
      return situacao === "limpeza" || checkoutRooms.has(room.numero);
    })
    .sort((a, b) => a.numero - b.numero);
  const maintenanceRooms = rooms
    .filter((room) => roomStatusToday(reservations, room.numero, today, (room as { situacao?: string | null }).situacao) === "manutencao")
    .sort((a, b) => a.numero - b.numero);

  return (
    <div>
      <PageHeader
        title="Limpeza"
        subtitle="Somente os quartos que precisam de atencao hoje."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Stat icon={<ClipboardCheck />} label="Para limpar" value={String(cleaningRooms.length)} hint="Inclui check-outs de hoje" />
        <Stat icon={<DoorOpen />} label="Saidas hoje" value={String(departuresToday.length)} hint="Quartos liberando" />
        <Stat icon={<AlertTriangle />} label="Manutencao" value={String(maintenanceRooms.length)} hint="Nao liberar para hospede" />
      </div>

      <section className="mt-5 card-surface p-5">
        <h3 className="section-title mb-3 text-lg">Quartos para limpeza</h3>
        {cleaningRooms.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum quarto pendente agora.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-8 2xl:grid-cols-10">
            {cleaningRooms.map((room) => (
              <div key={room.numero} className="rounded-md border border-brass/45 bg-brass/10 px-3 py-4 text-center">
                <div className="font-serif text-2xl font-bold text-pine-dark">{room.numero}</div>
                <div className="mt-1 text-[11px] uppercase text-muted-foreground">Quarto</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {maintenanceRooms.length > 0 && (
        <section className="mt-4 card-surface p-5">
          <h3 className="section-title mb-3 text-lg">Quartos em manutencao</h3>
          <div className="flex flex-wrap gap-2">
            {maintenanceRooms.map((room) => (
              <Badge key={room.numero} tone="brick">Quarto {room.numero}</Badge>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function CafePainel({
  activeToday,
  ocupantesHoje,
  capacidadeTotal,
}: {
  activeToday: Reservation[];
  ocupantesHoje: number;
  capacidadeTotal: number;
}) {
  const rooms = activeToday
    .map((reservation) => ({
      quarto: reservation.quarto,
      pessoas: Number(reservation.pessoas ?? 1),
      hospede: reservationGuestName(reservation),
    }))
    .sort((a, b) => a.quarto - b.quarto);

  return (
    <div>
      <PageHeader
        title="Cafe da manha"
        subtitle="Quantidade de pessoas hospedadas hoje."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Stat icon={<Coffee />} label="Pessoas hoje" value={String(ocupantesHoje)} hint="Total para o cafe" />
        <Stat icon={<BedDouble />} label="Quartos ocupados" value={String(activeToday.length)} hint={`Capacidade total: ${capacidadeTotal}`} />
        <Stat icon={<ClipboardCheck />} label="Media por quarto" value={rooms.length ? (ocupantesHoje / rooms.length).toFixed(1) : "0"} hint="Ajuda no preparo" />
      </div>

      <section className="mt-5 card-surface p-5">
        <h3 className="section-title mb-3 text-lg">Quartos com hospedes</h3>
        {rooms.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum hospede ativo agora.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="p-3">Quarto</th>
                  <th className="p-3">Pessoas</th>
                  <th className="p-3">Hospede</th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((row) => (
                  <tr key={row.quarto} className="border-b border-border/50">
                    <td className="p-3 font-semibold">Quarto {row.quarto}</td>
                    <td className="p-3">{row.pessoas}</td>
                    <td className="p-3 text-muted-foreground">{row.hospede}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function TodayList({
  title,
  empty,
  reservations,
}: {
  title: string;
  empty: string;
  reservations: Reservation[];
}) {
  return (
    <section className="card-surface p-5">
      <h3 className="section-title mb-3 text-lg">{title}</h3>
      {reservations.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="space-y-2">
          {reservations.slice(0, 8).map((reservation) => (
            <div key={reservation.id} className="flex items-center justify-between rounded-md border border-border/70 px-3 py-2">
              <div>
                <p className="font-semibold">Quarto {reservation.quarto}</p>
                <p className="text-xs text-muted-foreground">{reservationGuestName(reservation)}</p>
              </div>
              <Badge tone={reservation.pago ? "pine" : "brass"}>{reservation.pago ? "Pago" : "Pendente"}</Badge>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function QuickLink({ to, icon, label }: { to: "/mapa" | "/reservas" | "/clientes" | "/vendas"; icon: React.ReactNode; label: string }) {
  return (
    <Link to={to} className="card-surface flex items-center gap-3 p-4 text-sm font-semibold text-pine-dark transition hover:border-pine/40 hover:bg-sage-bg/50">
      <span className="rounded-md bg-sage-bg p-2 text-pine [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
      {label}
    </Link>
  );
}

function reservationGuestName(reservation: Reservation) {
  return String(
    (reservation as { hospede?: string | null; hospede_nome?: string | null; nome?: string | null }).hospede ??
      (reservation as { hospede_nome?: string | null }).hospede_nome ??
      (reservation as { nome?: string | null }).nome ??
      "Hospede",
  );
}

function buildSeries(reservations: Reservation[], sales: Sale[], today: string) {
  const days: { key: string; label: string; receita: number; cancelamentos: number; comparecimento: number }[] = [];
  const base = new Date(today + "T00:00:00");
  for (let i = 29; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({
      key,
      label: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`,
      receita: 0,
      cancelamentos: 0,
      comparecimento: 0,
    });
  }
  const idx = new Map(days.map((d) => [d.key, d]));
  reservations.forEach((r) => {
    const day = idx.get((r.checkin || "").slice(0, 10));
    if (!day) return;
    day.receita += Number(r.valor_pago);
    if (r.status === "cancelado") day.cancelamentos += 1;
    if (r.status === "ocupado" || r.status === "finalizado") day.comparecimento += 1;
  });
  sales.forEach((s) => {
    const day = idx.get((s.data || "").slice(0, 10));
    if (day) day.receita += Number(s.total);
  });
  return days;
}

function buildMonthlySeries(anchorMonth: string, reservations: Reservation[], sales: Sale[], expenses: Expense[]) {
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const key = addMonths(anchorMonth, -i);
    months.push({
      key,
      label: monthLabel(key),
      receita: revenueForMonth(key, reservations, sales),
      despesas: expensesForMonth(key, expenses),
    });
  }
  return months;
}

function buildMonthMetrics(
  month: string,
  reservations: Reservation[],
  sales: Sale[],
  expenses: Expense[],
  feedbacks: Feedback[],
  roomCount: number,
) {
  const reviews = feedbacks.filter((f) => (f.created_at || "").slice(0, 7) === month && f.nota_geral != null);
  const avaliacao = reviews.length
    ? reviews.reduce((sum, f) => sum + Number(f.nota_geral), 0) / reviews.length
    : 0;
  return {
    receita: revenueForMonth(month, reservations, sales),
    despesas: expensesForMonth(month, expenses),
    ocupacao: occupancyForMonth(month, reservations, roomCount),
    avaliacao,
  };
}

function revenueForMonth(month: string, reservations: Reservation[], sales: Sale[]) {
  return (
    reservations
      .filter((r) => (r.checkin || "").slice(0, 7) === month)
      .reduce((sum, r) => sum + Number(r.valor_pago), 0) +
    sales.filter((s) => (s.data || "").slice(0, 7) === month).reduce((sum, s) => sum + Number(s.total), 0)
  );
}

function expensesForMonth(month: string, expenses: Expense[]) {
  return expenses.filter((e) => (e.data || "").slice(0, 7) === month).reduce((sum, e) => sum + Number(e.valor), 0);
}

function occupancyForMonth(month: string, reservations: Reservation[], roomCount: number) {
  if (!roomCount) return 0;
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(year, monthNumber - 1, 1);
  const last = new Date(year, monthNumber, 0);
  const daysInMonth = last.getDate();
  const occupiedNights = reservations
    .filter((r) => r.status !== "cancelado" && r.status !== "manutencao")
    .reduce((sum, r) => sum + overlappingNights(r.checkin, r.checkout, first, last), 0);
  return Math.round((occupiedNights / (roomCount * daysInMonth)) * 100);
}

function overlappingNights(checkin: string, checkout: string, first: Date, last: Date) {
  if (!checkin || !checkout) return 0;
  const start = new Date(`${checkin}T00:00:00`);
  const end = new Date(`${checkout}T00:00:00`);
  const monthEndExclusive = new Date(last);
  monthEndExclusive.setDate(last.getDate() + 1);
  const overlapStart = new Date(Math.max(start.getTime(), first.getTime()));
  const overlapEnd = new Date(Math.min(end.getTime(), monthEndExclusive.getTime()));
  return Math.max(0, Math.round((overlapEnd.getTime() - overlapStart.getTime()) / 86400000));
}

function addMonths(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function addYears(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  return `${year + offset}-${String(monthNumber).padStart(2, "0")}`;
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber - 1, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
}

function delta(current: number, previous: number) {
  if (!previous && !current) return 0;
  if (!previous) return 100;
  return ((current - previous) / previous) * 100;
}

function performanceColor(value: number, average: number) {
  if (average <= 0) return "var(--pine)";
  if (value < average * 0.55) return "var(--brick)";
  if (value < average * 0.85) return "var(--brass)";
  return "var(--pine)";
}

function Stat({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="stat-card min-w-0">
      <div className="mb-2 flex min-w-0 items-center gap-2 text-pine">
        <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        <span className="min-w-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      </div>
      <div className="min-w-0 break-words font-serif text-[clamp(1.45rem,2.4vw,2rem)] font-bold leading-tight">{value}</div>
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function ComparisonStat({
  icon,
  label,
  value,
  monthDelta,
  yearDelta,
  lowerIsBetter = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  monthDelta: number;
  yearDelta: number;
  lowerIsBetter?: boolean;
}) {
  return (
    <div className="stat-card min-w-0">
      <div className="mb-2 flex min-w-0 items-center gap-2 text-pine">
        <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        <span className="min-w-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      </div>
      <div className="min-w-0 break-words font-serif text-[clamp(1.45rem,2.4vw,2rem)] font-bold leading-tight">{value}</div>
      <div className="mt-2 space-y-1 text-[11px]">
        <DeltaLine label="vs mês anterior" value={monthDelta} lowerIsBetter={lowerIsBetter} />
        <DeltaLine label="vs ano anterior" value={yearDelta} lowerIsBetter={lowerIsBetter} />
      </div>
    </div>
  );
}

function DeltaLine({ label, value, lowerIsBetter }: { label: string; value: number; lowerIsBetter: boolean }) {
  const positive = value >= 0;
  const good = lowerIsBetter ? !positive : positive;
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <div className={`flex items-center justify-between gap-2 ${good ? "text-pine" : "text-brick"}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1 font-semibold">
        <Icon className="h-3 w-3" />
        {value > 0 ? "+" : ""}
        {value.toFixed(1)}%
      </span>
    </div>
  );
}

function WifiInsight({
  complaints,
  feedbacks,
}: {
  complaints: { categoria: string; quarto: number | null; dispositivo: string | null }[];
  feedbacks: { quarto: number | null; wifi_problema: boolean; wifi_dispositivo: string | null }[];
}) {
  const wifiComplaints = complaints.filter((c) => c.categoria === "wifi");
  const wifiFeedbacks = feedbacks.filter((f) => f.wifi_problema);

  const rooms = new Map<number, number>();
  wifiComplaints.forEach((c) => c.quarto != null && rooms.set(c.quarto, (rooms.get(c.quarto) ?? 0) + 1));
  wifiFeedbacks.forEach((f) => f.quarto != null && rooms.set(f.quarto, (rooms.get(f.quarto) ?? 0) + 1));

  const devices = new Map<string, number>();
  wifiComplaints.forEach((c) => c.dispositivo && devices.set(c.dispositivo, (devices.get(c.dispositivo) ?? 0) + 1));
  wifiFeedbacks.forEach((f) => f.wifi_dispositivo && devices.set(f.wifi_dispositivo, (devices.get(f.wifi_dispositivo) ?? 0) + 1));

  const topRooms = [...rooms.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const topDevices = [...devices.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);

  if (topRooms.length === 0 && topDevices.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem registros de Wi-Fi ainda.</p>;
  }

  const repeatingRoom = topRooms.find(([, n]) => n >= 2);

  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="mb-1 text-xs font-semibold text-muted-foreground">Por quarto</p>
          {topRooms.length ? (
            topRooms.map(([q, n]) => (
              <div key={q} className="flex justify-between border-b border-border/60 py-1">
                <span>Quarto {q}</span>
                <span className="font-semibold">{n}</span>
              </div>
            ))
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold text-muted-foreground">Por aparelho</p>
          {topDevices.length ? (
            topDevices.map(([d, n]) => (
              <div key={d} className="flex justify-between border-b border-border/60 py-1">
                <span>{d}</span>
                <span className="font-semibold">{n}</span>
              </div>
            ))
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </div>
      </div>
      <p className="rounded-lg bg-sage-bg/60 px-3 py-2 text-xs text-pine-dark">
        {repeatingRoom
          ? `O quarto ${repeatingRoom[0]} repete queixas de Wi-Fi — provável problema de sinal no quarto.`
          : "As queixas estão espalhadas por vários quartos/aparelhos — provavelmente ligadas ao aparelho do hóspede, não a um quarto específico."}
      </p>
    </div>
  );
}

function mostCommon(arr: string[]): string {
  const m = new Map<string, number>();
  arr.forEach((x) => m.set(x, (m.get(x) ?? 0) + 1));
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

function roomCapacity(config: string): number {
  const numbers = config.match(/\d+/g)?.map(Number) ?? [];
  if (numbers.length) return Math.max(...numbers);
  const text = config.toLowerCase();
  if (text.includes("triplo")) return 3;
  if (text.includes("quad")) return 4;
  if (text.includes("famil")) return 5;
  if (text.includes("duplo") || text.includes("casal")) return 2;
  return 1;
}
