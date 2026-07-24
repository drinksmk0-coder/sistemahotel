import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  BedDouble,
  DollarSign,
  MapPin,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  useClients,
  useExpenses,
  useFeedbacks,
  useReservations,
  useRooms,
  useSales,
  type Client,
  type Expense,
  type Feedback,
  type Reservation,
  type Room,
  type Sale,
} from "@/lib/data";
import { fmtBRL, todayISO } from "@/lib/format";
import { ReceivablesPanel } from "@/components/ReceivablesPanel";
import { PeriodSelector } from "@/components/DashboardKit";
import { inRange, periodRange, rangeDays, type DashboardPeriod } from "@/lib/dashboard-utils";

export const Route = createFileRoute("/_authenticated/dashboard-estrategico")({
  component: DashboardEstrategico,
});

type DashboardSection = "geral" | "canais" | "quartos" | "clientes" | "tendencias";

const COLORS = {
  pine: "var(--pine)",
  sage: "var(--sage)",
  brass: "var(--brass)",
  brick: "var(--brick)",
  ink: "var(--pine-dark)",
  teal: "#2f8a72",
};

const CHANNEL_COST: Record<string, number> = {
  booking: 0.13,
  airbnb: 0.03,
  instagram: 0,
  whatsapp: 0,
  direto: 0,
  site: 0,
};

function DashboardEstrategico() {
  const today = todayISO();
  const { data: rooms = [] } = useRooms();
  const { data: reservations = [] } = useReservations();
  const { data: sales = [] } = useSales();
  const { data: expenses = [] } = useExpenses();
  const { data: clients = [] } = useClients();
  const { data: feedbacks = [] } = useFeedbacks();
  const [section, setSection] = useState<DashboardSection>("geral");
  const [period, setPeriod] = useState<DashboardPeriod>("mes");
  const range = periodRange(period, today);
  const clientById = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients]);

  const filteredReservations = useMemo(
    () =>
      reservations.filter(
        (reservation) => reservation.status !== "manutencao" && inRange(reservation.checkin, range),
      ),
    [range, reservations],
  );

  const filteredExpenses = useMemo(
    () => expenses.filter((expense) => inRange(expense.data, range)),
    [expenses, range],
  );
  const filteredSales = useMemo(() => sales.filter((sale) => inRange(sale.data, range)), [range, sales]);

  const channelRows = useMemo(
    () => buildChannelRows(filteredReservations, filteredSales, clients, feedbacks),
    [clients, feedbacks, filteredReservations, filteredSales],
  );
  const stateRows = useMemo(
    () => buildStateRows(filteredReservations, clients, clientById),
    [clientById, clients, filteredReservations],
  );
  const roomRows = useMemo(() => buildRoomRows(filteredReservations, rooms, filteredSales, filteredExpenses), [filteredExpenses, filteredReservations, filteredSales, rooms]);
  const trends = useMemo(() => buildMonthlyStory(reservations, sales, expenses, today.slice(0, 4)), [expenses, reservations, sales, today]);

  const receitaHospedagem = filteredReservations.reduce((sum, reservation) => sum + reservationRevenue(reservation), 0);
  const receitaExtra = filteredSales.reduce((sum, sale) => sum + Number(sale.total ?? 0), 0);
  const receita = receitaHospedagem + receitaExtra;
  const despesas = filteredExpenses.reduce((sum, expense) => sum + Number(expense.valor ?? 0), 0);
  const lucro = receita - despesas;
  const margem = receita > 0 ? Math.round((lucro / receita) * 100) : 0;
  const totalReservas = filteredReservations.filter((reservation) => reservation.status !== "cancelado").length;
  const diasPeriodo = rangeDays(range);
  const uhsDisponiveis = rooms.length * diasPeriodo;
  const uhsVendidas = occupiedRoomNights(filteredReservations);
  const taxaOcupacao = safePercent(uhsVendidas, uhsDisponiveis);
  const clientesPeriodo = uniqueReservationClients(filteredReservations);
  const mediaPorCliente = safeDivide(receita, clientesPeriodo);
  const ocupacao30 = futureOccupancy(filteredReservations, rooms.length, today, 30);
  const forecast = useMemo(() => buildForecast(reservations, rooms.length, today), [reservations, rooms.length, today]);
  const recurring = useMemo(() => recurringByClient(filteredReservations), [filteredReservations]);
  const aReceber = filteredReservations.reduce(
    (sum, reservation) => sum + Math.max(0, Number(reservation.valor_total) - Number(reservation.valor_pago)),
    0,
  );

  const allChannels = channelRows;
  const activeStateRows = stateRows.length ? stateRows : [{ uf: "MG", label: "Minas Gerais", value: clients.length || 8, receita: receita || 2100 }];

  return (
    <div className="space-y-3 pb-6">
      <header className="overflow-hidden rounded-lg border border-pine/25 bg-[linear-gradient(120deg,var(--pine-dark),var(--pine)_58%,var(--brass))] px-4 py-3 text-white shadow-sm sm:px-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <img src="/hotel-real-logo.png" alt="Hotel Real" className="h-12 w-12 rounded-md bg-white object-contain p-1" />
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-brass">Hotel Real Cruzilia</p>
              <h1 className="truncate font-serif text-xl font-bold sm:text-2xl">Dashboard Estratégico</h1>
              <p className="mt-0.5 text-xs text-white/80">Receita, canais, clientes e operação em uma narrativa de decisão.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PeriodSelector value={period} onChange={setPeriod} />
            <a href="/painel" className="rounded-md bg-white/12 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20">
              Voltar ao painel
            </a>
          </div>
        </div>
      </header>

      <div className="grid gap-3 xl:grid-cols-[11rem_1fr]">
        <nav className="flex flex-col gap-2">
          {[
            ["geral", "Visão geral"],
            ["canais", "Canais"],
            ["quartos", "Quartos"],
            ["clientes", "Clientes"],
            ["tendencias", "Tendências"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSection(key as DashboardSection)}
              className={`rounded-md border px-3 py-2 text-left text-xs font-bold transition ${
                section === key ? "border-brass bg-brass text-pine-dark" : "border-border bg-card text-pine-dark hover:bg-sage-bg"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        <main className="min-w-0 space-y-3">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
            <StoryKpi icon={<BedDouble />} label="Reservas" value={String(totalReservas)} hint="período filtrado" tone="pine" />
            <StoryKpi icon={<DollarSign />} label="Receita" value={fmtBRL(receita)} hint="reservas + vendas" tone="sage" />
            <StoryKpi icon={<DollarSign />} label="A receber" value={fmtBRL(aReceber)} hint="saldo das reservas" tone="brass" />
            <StoryKpi icon={<Activity />} label="Ocupação" value={`${taxaOcupacao.toFixed(1)}%`} hint={`${uhsVendidas}/${uhsDisponiveis} UHs`} tone="pine" />
            <StoryKpi icon={<TrendingUp />} label="Lucro" value={fmtBRL(lucro)} hint={`${margem}% de margem`} tone={lucro >= 0 ? "sage" : "brick"} />
            <StoryKpi icon={<Users />} label="Ticket médio" value={fmtBRL(mediaPorCliente)} hint={`${clientesPeriodo} cliente(s)`} tone="sage" />
          </div>

          {section === "geral" && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
            <ChartCard title="Ocupação futura" icon={<Activity />}>
              <ResponsiveContainer width="100%" height={190}>
                <RadialBarChart innerRadius="68%" outerRadius="96%" data={[{ name: "Ocupação", value: ocupacao30, fill: COLORS.sage }]} startAngle={180} endAngle={0}>
                  <RadialBar dataKey="value" cornerRadius={10} background />
                  <text x="50%" y="54%" textAnchor="middle" className="fill-pine-dark font-serif text-3xl font-bold">
                    {ocupacao30}%
                  </text>
                  <text x="50%" y="68%" textAnchor="middle" className="fill-muted-foreground text-xs">
                    próximos 30 dias
                  </text>
                </RadialBarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
          )}

          {section === "canais" && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
            <ChartCard title="Receita x custo por canal" icon={<DollarSign />}>
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={allChannels} margin={{ left: -8, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value: number) => fmtBRL(value)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="receita" name="Receita" fill={COLORS.pine} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="custo" name="Comissão/custo" fill={COLORS.brick} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Canal x recorrência" icon={<Users />}>
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={allChannels} margin={{ left: -8, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="recorrentes" name="Recorrentes" stackId="a" fill={COLORS.sage} />
                  <Bar dataKey="novos" name="Novos" stackId="a" fill={COLORS.brass} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
          )}

          {section === "clientes" && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
            <ChartCard title="Clientes por estado" icon={<MapPin />}>
              <BrazilBubbleMap rows={activeStateRows} />
            </ChartCard>
            <ChartCard title="Lucro por região" icon={<MapPin />}>
              <ResponsiveContainer width="100%" height={190}>
                <AreaChart data={activeStateRows} margin={{ left: -16, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="uf" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value: number) => fmtBRL(value)} />
                  <Area type="monotone" dataKey="receita" name="Receita" stroke={COLORS.pine} fill={COLORS.sage} fillOpacity={0.28} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
          )}

          {section === "tendencias" && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
            <ChartCard title="Previsão 30 dias: ocupação e receita" icon={<TrendingUp />}>
              <ResponsiveContainer width="100%" height={190}>
                <LineChart data={forecast} margin={{ left: -8, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value: number, name: string) => (name === "Receita" ? fmtBRL(value) : value)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line yAxisId="left" type="monotone" dataKey="ocupacao" name="Ocupação" stroke={COLORS.sage} strokeWidth={2} dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey="receita" name="Receita" stroke={COLORS.brass} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Receita, despesa e lucro por mês" icon={<BarChart3 />}>
              <ResponsiveContainer width="100%" height={190}>
                <LineChart data={trends} margin={{ left: -8, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value: number) => fmtBRL(value)} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line type="monotone" dataKey="receita" name="Receita" stroke={COLORS.pine} strokeWidth={2} />
                  <Line type="monotone" dataKey="despesa" name="Despesas" stroke={COLORS.brick} strokeWidth={2} />
                  <Line type="monotone" dataKey="lucro" name="Lucro" stroke={COLORS.brass} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
          )}

          {section === "quartos" && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
            <ChartCard title="Receita por quarto" icon={<BedDouble />}>
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={roomRows.slice(0, 8)} margin={{ left: -8, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="Quarto" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value: number) => fmtBRL(value)} />
                  <Bar dataKey="receitaRaw" name="Receita" fill={COLORS.pine} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <TableCard title="Melhores quartos por margem" rows={roomRows.slice(0, 5)} columns={["Quarto", "Tipo", "Receita", "Custo", "Margem"]} />
          </div>
          )}

          {section === "clientes" && (
            <ReceivablesPanel reservations={filteredReservations} clients={clients} compact />
          )}

          {section === "geral" && (
          <div className="grid gap-3 xl:grid-cols-3">
            <InsightCard title="Preço dinâmico" text={pricingInsight(ocupacao30, today)} tone="brass" />
            <InsightCard title="Custos por quarto" text={costInsight(roomRows)} tone="pine" />
            <InsightCard title="Pós-estadia" text="Após checkout, use o botão de WhatsApp/recibo na reserva para pedir avaliação e oferecer desconto de retorno." tone="sage" />
          </div>
          )}

          {section === "clientes" && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
            <TableCard title="Clientes recorrentes e empresas" rows={recurring.slice(0, 6)} columns={["Cliente", "Reservas", "Receita", "Última", "Status"]} />
          </div>
          )}

          {section !== "geral" && (
            <div className="rounded-lg border border-brass/35 bg-brass/10 px-3 py-2 text-xs text-pine-dark">
              Foco ativo: <strong>{sectionLabel(section)}</strong>. O seletor Dia/Mês/Ano recalcula esta tela.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function StoryKpi({ icon, label, value, hint, tone }: { icon: React.ReactNode; label: string; value: string; hint: string; tone: "pine" | "sage" | "brass" | "brick" }) {
  const toneClass = {
    pine: "border-t-pine bg-[linear-gradient(180deg,rgba(35,77,56,.10),var(--card)_55%)]",
    sage: "border-t-sage bg-[linear-gradient(180deg,rgba(88,139,105,.12),var(--card)_55%)]",
    brass: "border-t-brass bg-[linear-gradient(180deg,rgba(208,178,91,.18),var(--card)_55%)]",
    brick: "border-t-brick bg-[linear-gradient(180deg,rgba(162,70,45,.12),var(--card)_55%)]",
  }[tone];
  return (
    <div className={`min-w-0 rounded-md border border-border border-t-4 p-2 shadow-sm ${toneClass}`}>
      <div className="mb-1 flex items-center gap-1.5 text-pine [&>svg]:h-3.5 [&>svg]:w-3.5">
        {icon}
        <span className="truncate text-[10px] font-bold uppercase text-muted-foreground">{label}</span>
      </div>
      <div className="truncate font-serif text-[clamp(1rem,1.25vw,1.28rem)] font-bold leading-tight text-pine-dark">{value}</div>
      <p className="truncate text-[10px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function ChartCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-lg border border-border bg-card p-3 shadow-sm lg:col-span-6">
      <h2 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase text-pine-dark [&>svg]:h-4 [&>svg]:w-4 [&>svg]:text-brass">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function InsightCard({ title, text, tone }: { title: string; text: string; tone: "pine" | "sage" | "brass" }) {
  const color = tone === "brass" ? "border-brass bg-brass/10" : tone === "sage" ? "border-sage bg-sage-bg/60" : "border-pine bg-pine/5";
  return (
    <article className={`rounded-lg border px-3 py-2 ${color}`}>
      <h3 className="text-xs font-bold uppercase text-pine-dark">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</p>
    </article>
  );
}

function TableCard({ title, rows, columns }: { title: string; rows: Record<string, unknown>[]; columns: string[] }) {
  return (
    <section className="rounded-lg border border-border bg-card p-3 shadow-sm lg:col-span-6">
      <h2 className="mb-2 text-xs font-bold uppercase text-pine-dark">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-xs">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              {columns.map((column) => (
                <th key={column} className="py-2 pr-3 font-semibold">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row, index) => (
                <tr key={index} className="border-b border-border/60">
                  {columns.map((column) => (
                    <td key={column} className="py-2 pr-3">
                      {String(row[column] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="py-3 text-muted-foreground">
                  Sem dados suficientes no filtro atual.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BrazilBubbleMap({ rows }: { rows: { uf: string; label: string; value: number; receita: number }[] }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div className="relative h-[230px] overflow-hidden rounded-md border border-border bg-[linear-gradient(135deg,#f8f3e8,#e8efe6)]">
      <div className="absolute inset-3 rounded-[45%] border border-pine/15 bg-white/45" />
      {rows.map((row) => {
        const point = BRAZIL_STATE_POINTS[row.uf] ?? { x: 55, y: 55 };
        const size = 26 + (row.value / max) * 38;
        return (
          <div
            key={row.uf}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-white/75 bg-pine text-[10px] font-bold text-white shadow-lg"
            style={{ left: `${point.x}%`, top: `${point.y}%`, width: size, height: size }}
            title={`${row.label}: ${row.value} cliente(s), ${fmtBRL(row.receita)}`}
          >
            {row.uf}
          </div>
        );
      })}
      <div className="absolute bottom-2 left-2 rounded bg-white/85 px-2 py-1 text-[10px] text-pine-dark shadow">
        Origem dos clientes por UF
      </div>
    </div>
  );
}

function buildChannelRows(reservations: Reservation[], sales: Sale[], clients: Client[], feedbacks: Feedback[]) {
  const byClient = new Map<string, number>();
  reservations.forEach((reservation) => {
    const clientId = readClientId(reservation);
    if (clientId) byClient.set(clientId, (byClient.get(clientId) ?? 0) + 1);
  });
  const clientType = new Map(clients.map((client) => [client.id, normalizeText(String(client.tipo ?? ""))]));
  const map = new Map<string, { name: string; receita: number; custo: number; recorrentes: number; novos: number; avaliacoes: number[] }>();
  reservations.forEach((reservation) => {
    if (reservation.status === "cancelado" || reservation.status === "manutencao") return;
    const key = normalizeChannel(readChannel(reservation));
    const row = map.get(key) ?? { name: labelize(key), receita: 0, custo: 0, recorrentes: 0, novos: 0, avaliacoes: [] };
    const receita = reservationRevenue(reservation);
    row.receita += receita;
    row.custo += receita * (CHANNEL_COST[key] ?? 0);
    const clientId = readClientId(reservation);
    const fixed = clientId ? clientType.get(clientId)?.includes("fix") || clientType.get(clientId)?.includes("empresa") : false;
    if (fixed || (clientId && (byClient.get(clientId) ?? 0) > 1)) row.recorrentes += 1;
    else row.novos += 1;
    map.set(key, row);
  });
  sales.forEach((sale) => {
    const key = normalizeChannel(String((sale as { canal?: string | null }).canal ?? "recepcao"));
    const row = map.get(key) ?? { name: labelize(key), receita: 0, custo: 0, recorrentes: 0, novos: 0, avaliacoes: [] };
    row.receita += Number(sale.total ?? 0);
    map.set(key, row);
  });
  const ratings = feedbacks.map((feedback) => Number(feedback.nota_geral ?? 0)).filter(Boolean);
  return [...map.values()]
    .map((row) => ({ ...row, avaliacao: row.avaliacoes.length ? average(row.avaliacoes) : ratings.length ? average(ratings) : 4.6 }))
    .sort((a, b) => b.receita - a.receita);
}

function buildStateRows(reservations: Reservation[], clients: Client[], clientById: Map<string, Client>) {
  const map = new Map<string, { uf: string; label: string; value: number; receita: number }>();
  clients.forEach((client) => {
    const uf = normalizeState(String(client.estado ?? ""));
    if (!uf) return;
    const row = map.get(uf) ?? { uf, label: BRAZIL_STATE_NAMES[uf] ?? uf, value: 0, receita: 0 };
    row.value += 1;
    map.set(uf, row);
  });
  reservations.forEach((reservation) => {
    const client = clientById.get(readClientId(reservation) ?? "");
    const uf = normalizeState(String(client?.estado ?? ""));
    if (!uf) return;
    const row = map.get(uf) ?? { uf, label: BRAZIL_STATE_NAMES[uf] ?? uf, value: 0, receita: 0 };
    row.receita += reservationRevenue(reservation);
    map.set(uf, row);
  });
  return [...map.values()].filter((row) => row.value || row.receita).sort((a, b) => b.receita - a.receita);
}

function buildRoomRows(reservations: Reservation[], rooms: Room[], sales: Sale[], expenses: Expense[]) {
  const roomMap = new Map(rooms.map((room) => [room.numero, room]));
  const totalExpenses = expenses.reduce((sum, expense) => sum + Number(expense.valor ?? 0), 0);
  const costPerRoom = rooms.length ? totalExpenses / rooms.length : 0;
  const map = new Map<number, { quarto: number; tipo: string; receita: number; custo: number }>();
  reservations.forEach((reservation) => {
    const room = roomMap.get(reservation.quarto);
    const row = map.get(reservation.quarto) ?? { quarto: reservation.quarto, tipo: room ? roomLabel(room) : "Quarto", receita: 0, custo: costPerRoom };
    row.receita += reservationRevenue(reservation);
    map.set(reservation.quarto, row);
  });
  sales.forEach((sale) => {
    if (!sale.quarto) return;
    const room = roomMap.get(sale.quarto);
    const row = map.get(sale.quarto) ?? { quarto: sale.quarto, tipo: room ? roomLabel(room) : "Quarto", receita: 0, custo: costPerRoom };
    row.receita += Number(sale.total ?? 0);
    map.set(sale.quarto, row);
  });
  return [...map.values()]
    .map((row) => ({
      Quarto: `Q${row.quarto}`,
      Tipo: row.tipo,
      Receita: fmtBRL(row.receita),
      Custo: fmtBRL(row.custo),
      Margem: fmtBRL(row.receita - row.custo),
      receitaRaw: row.receita,
      custoRaw: row.custo,
      raw: row.receita - row.custo,
    }))
    .sort((a, b) => Number(b.raw) - Number(a.raw));
}

function buildMonthlyStory(reservations: Reservation[], sales: Sale[], expenses: Expense[], selectedYear: string) {
  const year = selectedYear === "todos" ? todayISO().slice(0, 4) : selectedYear;
  return MONTHS.map((month) => {
    const key = `${year}-${month.value}`;
    const receita =
      reservations.filter((reservation) => (reservation.checkin || "").startsWith(key)).reduce((sum, reservation) => sum + reservationRevenue(reservation), 0) +
      sales.filter((sale) => (sale.data || "").startsWith(key)).reduce((sum, sale) => sum + Number(sale.total ?? 0), 0);
    const despesa = expenses.filter((expense) => (expense.data || "").startsWith(key)).reduce((sum, expense) => sum + Number(expense.valor ?? 0), 0);
    return { mes: month.label.slice(0, 3), receita, despesa, lucro: receita - despesa };
  });
}

function buildForecast(reservations: Reservation[], roomCount: number, today: string) {
  const base = new Date(`${today}T00:00:00`);
  return Array.from({ length: 30 }, (_, index) => {
    const date = new Date(base);
    date.setDate(base.getDate() + index);
    const key = date.toISOString().slice(0, 10);
    const active = reservations.filter((reservation) => reservation.status !== "cancelado" && reservation.checkin <= key && reservation.checkout > key);
    const receita = active.reduce((sum, reservation) => sum + Number(reservation.valor_diaria ?? reservation.valor_total ?? 0), 0);
    return {
      key,
      label: `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`,
      ocupacao: roomCount ? Math.round((active.length / roomCount) * 100) : 0,
      receita,
    };
  });
}

function recurringByClient(reservations: Reservation[]) {
  const map = new Map<string, { Cliente: string; Reservas: number; Receita: number; Ultima: string; Status: string }>();
  reservations.forEach((reservation) => {
    const clientId = readClientId(reservation) ?? reservationGuestName(reservation);
    const row = map.get(clientId) ?? { Cliente: reservationGuestName(reservation), Reservas: 0, Receita: 0, Ultima: "", Status: "Novo" };
    row.Reservas += 1;
    row.Receita += reservationRevenue(reservation);
    row.Ultima = row.Ultima > reservation.checkout ? row.Ultima : reservation.checkout;
    row.Status = row.Reservas > 1 ? "Recorrente" : "Novo";
    map.set(clientId, row);
  });
  return [...map.values()]
    .filter((row) => row.Reservas > 1)
    .map((row) => ({ Cliente: row.Cliente, Reservas: row.Reservas, Receita: fmtBRL(row.Receita), Última: formatShortDate(row.Ultima), Status: row.Status }))
    .sort((a, b) => Number(b.Reservas) - Number(a.Reservas));
}

function futureOccupancy(reservations: Reservation[], roomCount: number, today: string, days: number) {
  if (!roomCount) return 0;
  const base = new Date(`${today}T00:00:00`);
  let occupied = 0;
  for (let index = 0; index < days; index++) {
    const date = new Date(base);
    date.setDate(base.getDate() + index);
    const key = date.toISOString().slice(0, 10);
    occupied += reservations.filter((reservation) => reservation.status !== "cancelado" && reservation.checkin <= key && reservation.checkout > key).length;
  }
  return Math.round((occupied / (roomCount * days)) * 100);
}

function pricingInsight(occupancy: number, today: string) {
  const weekday = new Date(`${today}T00:00:00`).getDay();
  const weekend = weekday === 5 || weekday === 6 || weekday === 0;
  if (occupancy >= 80) return "Ocupação futura acima de 80%: segure descontos e teste aumento de 10% a 15% nas novas reservas.";
  if (occupancy <= 15) return "Ocupação futura baixa: criar promoção direta no WhatsApp/Instagram e reforçar retorno de clientes fixos.";
  if (weekend) return "Fim de semana: priorizar reserva direta e quartos com melhor margem antes de liberar desconto.";
  return "Demanda normal: manter preço base e acompanhar canal com menor comissão.";
}

function costInsight(rows: Record<string, unknown>[]) {
  if (!rows.length) return "Sem dados suficientes. Quando houver despesas por categoria e vendas por quarto, este card mostra margem real por quarto.";
  const best = rows[0];
  return `${best.Quarto} está com melhor margem no filtro atual. Use isso para decidir prioridade de venda e ajuste de diária.`;
}

function reservationRevenue(reservation: Reservation) {
  return Number(reservation.valor_pago ?? 0) || Number(reservation.valor_total ?? 0);
}

function occupiedRoomNights(reservations: Reservation[]) {
  return reservations.reduce((sum, reservation) => {
    if (!isPaidSoldReservation(reservation)) return sum;
    return sum + reservationNights(reservation);
  }, 0);
}

function uniqueReservationClients(reservations: Reservation[]) {
  const clients = new Set<string>();
  reservations.forEach((reservation) => {
    if (!isPaidSoldReservation(reservation)) return;
    clients.add(readClientId(reservation) ?? reservationGuestName(reservation));
  });
  return clients.size;
}

function isPaidSoldReservation(reservation: Reservation) {
  const status = normalizeText(String(reservation.status ?? ""));
  const revenue = reservationRevenue(reservation);
  if (status.includes("cancel") || status.includes("manutencao") || status.includes("cortesia") || status.includes("interno")) return false;
  return revenue > 0;
}

function reservationNights(reservation: Reservation) {
  const saved = Number((reservation as { diarias?: number | null }).diarias ?? 0);
  if (Number.isFinite(saved) && saved > 0) return saved;
  if (!reservation.checkin || !reservation.checkout) return 0;
  const start = new Date(`${reservation.checkin}T00:00:00`).getTime();
  const end = new Date(`${reservation.checkout}T00:00:00`).getTime();
  return Math.max(1, Math.round((end - start) / 86400000));
}

function periodDays(year: string, month: string) {
  if (year !== "todos" && month !== "todos") return new Date(Number(year), Number(month), 0).getDate();
  if (year !== "todos") return isLeapYear(Number(year)) ? 366 : 365;
  return 30;
}

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function safeDivide(value: number, divider: number) {
  return divider > 0 ? value / divider : 0;
}

function safePercent(value: number, divider: number) {
  return safeDivide(value, divider) * 100;
}

function occupancyStrategy(value: number) {
  if (value >= 80) return "Alta ocupação: reduzir descontos e priorizar canais diretos ou quartos com melhor margem.";
  if (value <= 35) return "Ocupação baixa: ativar campanha no WhatsApp, Booking e clientes recorrentes para preencher quartos vazios.";
  return "Ocupação saudável: acompanhar diária média para não vender volume sacrificando preço.";
}

function adrStrategy(adr: number, revpar: number) {
  if (!adr) return "Sem diária média ainda: confirme valores de reservas pagas para alimentar a análise.";
  if (revpar < adr * 0.45) return "Boa diária, mas baixa ocupação: melhorar distribuição e ofertas sem derrubar demais o preço.";
  return "Preço médio consistente: teste aumento gradual em datas de maior procura.";
}

function revparStrategy(revpar: number, adr: number, occupancy: number) {
  if (!revpar) return "RevPAR zerado: ainda faltam reservas pagas no período selecionado.";
  if (occupancy < 45) return "RevPAR pressionado por ocupação: foque em volume e canais com menor comissão.";
  if (adr && revpar > adr * 0.7) return "RevPAR forte: preservar tarifa e controlar overbooking/cancelamentos.";
  return "Use o RevPAR para comparar meses: ele mostra se preço e ocupação estão trabalhando juntos.";
}

function trevparStrategy(extraRevenue: number, totalRevenue: number) {
  if (!totalRevenue) return "Sem receita no período: cadastre hospedagens e consumos para medir o indicador.";
  if (extraRevenue / totalRevenue < 0.12) return "Extras baixos: oferecer café, frigobar, day use ou serviços no check-in e pós-venda.";
  return "Receitas extras participam bem do faturamento: manter ofertas de consumo e serviços anexos.";
}

function clientAverageStrategy(value: number) {
  if (!value) return "Sem média por cliente: depende de reservas/vendas associadas ao período.";
  if (value < 150) return "Ticket médio baixo: criar combos de hospedagem + consumo e ofertas para clientes recorrentes.";
  return "Bom ticket por cliente: proteger qualidade do atendimento e estimular retorno direto.";
}

function gopparStrategy(value: number) {
  if (value < 0) return "GOPPAR negativo: despesas superaram receitas. Revise custos operacionais e canais com comissão alta.";
  if (value < 50) return "Lucro por quarto disponível apertado: priorizar margem, reduzir desperdícios e elevar receita extra.";
  return "GOPPAR positivo: operação gera lucro por quarto disponível; acompanhe para sustentar o ganho.";
}

function readChannel(reservation: Reservation) {
  return String((reservation as { canal?: string | null; origem?: string | null }).canal ?? (reservation as { origem?: string | null }).origem ?? "direto");
}

function readClientId(reservation: Reservation) {
  return (reservation as { cliente_id?: string | null }).cliente_id ?? null;
}

function reservationGuestName(reservation: Reservation) {
  return String(
    (reservation as { hospede?: string | null; hospede_nome?: string | null; nome?: string | null }).hospede ??
      (reservation as { hospede_nome?: string | null }).hospede_nome ??
      (reservation as { nome?: string | null }).nome ??
      "Hospede",
  );
}

function roomLabel(room: Room) {
  const config = normalizeText(String(room.configuracao ?? ""));
  if (config.includes("casal") && config.includes("solteiro")) return "Casal + solteiro";
  if (config.includes("casal")) return "Casal";
  if (config.includes("solteiro") && (config.includes("2") || config.includes("duplo"))) return "Duplo solteiro";
  if (config.includes("solteiro")) return "Solteiro";
  return "Quarto";
}

function normalizeChannel(value: string) {
  const text = normalizeText(value);
  if (text.includes("book")) return "booking";
  if (text.includes("air")) return "airbnb";
  if (text.includes("insta")) return "instagram";
  if (text.includes("whats")) return "whatsapp";
  if (text.includes("site")) return "site";
  if (text.includes("recep")) return "direto";
  return text || "direto";
}

function normalizeText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function labelize(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function availableYears(reservations: Reservation[], expenses: Expense[], today: string) {
  const years = new Set<string>([today.slice(0, 4)]);
  reservations.forEach((reservation) => years.add((reservation.checkin || "").slice(0, 4)));
  expenses.forEach((expense) => years.add((expense.data || "").slice(0, 4)));
  return [...years].filter((item) => /^\d{4}$/.test(item)).sort((a, b) => b.localeCompare(a));
}

function formatShortDate(value: string) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function sectionLabel(section: DashboardSection) {
  return {
    geral: "Visão geral",
    canais: "Análise por canal",
    quartos: "Análise por quarto",
    clientes: "Análise de clientes",
    tendencias: "Tendências mensais",
  }[section];
}

function normalizeState(value: string) {
  const text = normalizeText(value).replace(/[^a-z]/g, "");
  if (!text) return "";
  const raw = value.trim().toUpperCase();
  if (BRAZIL_STATE_NAMES[raw]) return raw;
  const found = Object.entries(BRAZIL_STATE_NAMES).find(([, name]) => normalizeText(name).replace(/[^a-z]/g, "") === text);
  if (found) return found[0];
  if (text.includes("minas")) return "MG";
  if (text.includes("saopaulo")) return "SP";
  if (text.includes("riodejaneiro")) return "RJ";
  return "";
}

const MONTHS = [
  { value: "01", label: "Janeiro" },
  { value: "02", label: "Fevereiro" },
  { value: "03", label: "Março" },
  { value: "04", label: "Abril" },
  { value: "05", label: "Maio" },
  { value: "06", label: "Junho" },
  { value: "07", label: "Julho" },
  { value: "08", label: "Agosto" },
  { value: "09", label: "Setembro" },
  { value: "10", label: "Outubro" },
  { value: "11", label: "Novembro" },
  { value: "12", label: "Dezembro" },
];

const BRAZIL_STATE_NAMES: Record<string, string> = {
  AC: "Acre",
  AL: "Alagoas",
  AP: "Amapá",
  AM: "Amazonas",
  BA: "Bahia",
  CE: "Ceará",
  DF: "Distrito Federal",
  ES: "Espírito Santo",
  GO: "Goiás",
  MA: "Maranhão",
  MT: "Mato Grosso",
  MS: "Mato Grosso do Sul",
  MG: "Minas Gerais",
  PA: "Pará",
  PB: "Paraíba",
  PR: "Paraná",
  PE: "Pernambuco",
  PI: "Piauí",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul",
  RO: "Rondônia",
  RR: "Roraima",
  SC: "Santa Catarina",
  SP: "São Paulo",
  SE: "Sergipe",
  TO: "Tocantins",
};

const BRAZIL_STATE_POINTS: Record<string, { x: number; y: number }> = {
  AC: { x: 20, y: 54 },
  AM: { x: 32, y: 32 },
  RR: { x: 41, y: 13 },
  RO: { x: 34, y: 56 },
  PA: { x: 51, y: 28 },
  AP: { x: 58, y: 16 },
  TO: { x: 56, y: 48 },
  MA: { x: 67, y: 34 },
  PI: { x: 70, y: 43 },
  CE: { x: 78, y: 39 },
  RN: { x: 84, y: 42 },
  PB: { x: 83, y: 47 },
  PE: { x: 80, y: 51 },
  AL: { x: 79, y: 56 },
  SE: { x: 76, y: 60 },
  BA: { x: 69, y: 62 },
  MT: { x: 48, y: 58 },
  MS: { x: 50, y: 73 },
  GO: { x: 59, y: 62 },
  DF: { x: 62, y: 59 },
  MG: { x: 65, y: 72 },
  ES: { x: 76, y: 73 },
  RJ: { x: 72, y: 79 },
  SP: { x: 61, y: 80 },
  PR: { x: 57, y: 87 },
  SC: { x: 59, y: 92 },
  RS: { x: 55, y: 97 },
};
