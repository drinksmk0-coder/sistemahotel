import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  useClients,
  useExpenses,
  useReservations,
  useSales,
  type Reservation,
} from "@/lib/data";
import { fmtBRL, todayISO } from "@/lib/format";
import {
  expensesTotal,
  inRange,
  isOtaChannel,
  lastMonths,
  normalizeChannel,
  normalizeLabel,
  otaCommissionRate,
  percent,
  periodRange,
  reservationReceived,
  reservationRevenue,
  saleReceived,
  saleRevenue,
  type DashboardPeriod,
} from "@/lib/dashboard-utils";
import {
  AlertBanner,
  ChartPanel,
  DashboardHeader,
  DashboardTabs,
  FunnelRow,
  FunnelStage,
} from "@/components/DashboardKit";
import { ReceivablesPanel } from "@/components/ReceivablesPanel";

export const Route = createFileRoute("/_authenticated/financeiro")({
  component: Financeiro,
});

type FinancialTab = "pagamento" | "despesa" | "canal";

const COLORS = ["var(--pine)", "var(--sage)", "var(--brass)", "var(--brick)", "#6f8f7a", "#c7a94c"];

function Financeiro() {
  const today = todayISO();
  const [period, setPeriod] = useState<DashboardPeriod>("mes");
  const [tab, setTab] = useState<FinancialTab>("pagamento");
  const { data: reservations = [] } = useReservations();
  const { data: sales = [] } = useSales();
  const { data: expenses = [] } = useExpenses();
  const { data: clients = [] } = useClients();
  const range = periodRange(period, today);

  const periodReservations = reservations.filter((reservation) => inRange(reservation.checkin, range));
  const periodSales = sales.filter((sale) => inRange(sale.data, range));
  const periodExpenses = expenses.filter((expense) => inRange(expense.data, range));

  const gross =
    periodReservations.reduce((sum, reservation) => sum + reservationRevenue(reservation), 0) +
    periodSales.reduce((sum, sale) => sum + saleRevenue(sale), 0);
  const received =
    periodReservations.reduce((sum, reservation) => sum + reservationReceived(reservation), 0) +
    periodSales.reduce((sum, sale) => sum + saleReceived(sale), 0);
  const pending = Math.max(0, gross - received);
  const expenseTotal = expensesTotal(periodExpenses);
  const profit = received - expenseTotal;
  const overdueReservations = reservations.filter(
    (reservation) =>
      reservation.status !== "cancelado" &&
      reservation.checkout < today &&
      reservationRevenue(reservation) > reservationReceived(reservation),
  );
  const overdue = overdueReservations.reduce(
    (sum, reservation) => sum + reservationRevenue(reservation) - reservationReceived(reservation),
    0,
  );

  const composition = useMemo(() => {
    if (tab === "despesa") return groupValues(periodExpenses, (expense) => normalizeLabel(expense.categoria), (expense) => Number(expense.valor));
    if (tab === "canal") return groupValues(periodReservations, (reservation) => normalizeChannel(reservation.canal), reservationRevenue);
    const reservationPayments = groupValues(
      periodReservations,
      (reservation) => normalizeLabel(reservation.pagamento),
      reservationReceived,
    );
    const salePayments = groupValues(periodSales, (sale) => normalizeLabel(sale.pagamento), saleReceived);
    return mergeGroups(reservationPayments, salePayments);
  }, [periodExpenses, periodReservations, periodSales, tab]);

  const channelRows = useMemo(
    () =>
      groupReservations(periodReservations, (reservation) => normalizeChannel(reservation.canal)).map((row) => ({
        name: row.name,
        pago: row.rows.reduce((sum, reservation) => sum + reservationReceived(reservation), 0),
        pendente: row.rows.reduce(
          (sum, reservation) => sum + Math.max(0, reservationRevenue(reservation) - reservationReceived(reservation)),
          0,
        ),
      })),
    [periodReservations],
  );

  const monthly = useMemo(
    () =>
      lastMonths(today).map((month) => {
        const monthReservations = reservations.filter((reservation) => reservation.checkin.startsWith(month.key));
        const monthSales = sales.filter((sale) => sale.data.startsWith(month.key));
        const monthExpenses = expenses.filter((expense) => expense.data.startsWith(month.key));
        const receita =
          monthReservations.reduce((sum, reservation) => sum + reservationReceived(reservation), 0) +
          monthSales.reduce((sum, sale) => sum + saleReceived(sale), 0);
        const despesas = expensesTotal(monthExpenses);
        return { ...month, receita, despesas, lucro: receita - despesas };
      }),
    [expenses, reservations, sales, today],
  );

  const ota = useMemo(() => {
    const otaRevenue = periodReservations
      .filter((reservation) => isOtaChannel(reservation.canal))
      .reduce((sum, reservation) => sum + reservationRevenue(reservation), 0);
    const reservationTotal = periodReservations.reduce((sum, reservation) => sum + reservationRevenue(reservation), 0);
    const commission = periodReservations.reduce(
      (sum, reservation) => sum + reservationRevenue(reservation) * otaCommissionRate(reservation.canal),
      0,
    );
    return { revenue: otaRevenue, share: percent(otaRevenue, reservationTotal), commission };
  }, [periodReservations]);

  const otaTrend = useMemo(
    () =>
      lastMonths(today).map((month) => {
        const rows = reservations.filter((reservation) => reservation.checkin.startsWith(month.key));
        const total = rows.reduce((sum, reservation) => sum + reservationRevenue(reservation), 0);
        const otaValue = rows
          .filter((reservation) => isOtaChannel(reservation.canal))
          .reduce((sum, reservation) => sum + reservationRevenue(reservation), 0);
        return { ...month, ota: percent(otaValue, total), direto: 100 - percent(otaValue, total) };
      }),
    [reservations, today],
  );

  const stateRows = useMemo(() => {
    const clientsById = new Map(clients.map((client) => [client.id, client]));
    const map = new Map<string, number>();
    periodReservations.forEach((reservation) => {
      const state = normalizeLabel(
        reservation.cliente_id ? clientsById.get(reservation.cliente_id)?.estado : null,
        "N/I",
      ).toUpperCase();
      map.set(state, (map.get(state) ?? 0) + reservationRevenue(reservation));
    });
    return [...map].map(([state, value]) => ({ state, value })).sort((a, b) => b.value - a.value);
  }, [clients, periodReservations]);

  const recentOta = otaTrend.slice(-3);
  const otaDirection =
    recentOta.length > 1 ? recentOta[recentOta.length - 1].ota - recentOta[0].ota : 0;

  return (
    <div className="space-y-3 pb-6">
      <DashboardHeader
        title="Financeiro"
        subtitle="Recebimentos, custos, lucro e decisões de canal em uma tela."
        period={period}
        onPeriodChange={setPeriod}
      />

      {overdue > 0 && (
        <AlertBanner title={`${fmtBRL(overdue)} vencidos aguardando cobrança`}>
          Existem {overdueReservations.length} checkout(s) com saldo. Use os botões de WhatsApp na lista abaixo.
        </AlertBanner>
      )}

      <FunnelRow>
        <FunnelStage label="Receita bruta" value={fmtBRL(gross)} hint="hospedagem + produtos" />
        <FunnelStage label="Recebido" value={fmtBRL(received)} percentValue={percent(received, gross)} tone="sage" />
        <FunnelStage label="A receber" value={fmtBRL(pending)} percentValue={percent(pending, gross)} tone="brass" />
        <FunnelStage label="Despesas" value={fmtBRL(expenseTotal)} percentValue={percent(expenseTotal, received)} tone="brick" />
        <FunnelStage label="Lucro líquido" value={fmtBRL(profit)} percentValue={percent(profit, received)} tone={profit >= 0 ? "sage" : "brick"} />
        <FunnelStage label="Vencidos" value={fmtBRL(overdue)} hint={`${overdueReservations.length} reserva(s)`} tone="brick" />
      </FunnelRow>

      <DashboardTabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "pagamento", label: "Por forma de pagamento" },
          { value: "despesa", label: "Por categoria de despesa" },
          { value: "canal", label: "Por canal" },
        ]}
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <ChartPanel title={`Composição — ${tabLabel(tab)}`} span={6}>
          <ResponsiveContainer width="100%" height={210}>
            <PieChart>
              <Pie data={composition} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={2}>
                {composition.map((row, index) => <Cell key={row.name} fill={COLORS[index % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(value: number) => fmtBRL(value)} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Pago x pendente por canal" span={6}>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={channelRows} layout="vertical" margin={{ left: 20, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" width={76} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(value: number) => fmtBRL(value)} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="pago" name="Pago" fill="var(--pine)" radius={[0, 3, 3, 0]} />
              <Bar dataKey="pendente" name="Pendente" fill="var(--sage)" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Receita, despesa e lucro — 12 meses" span={6}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 9 }} />
              <Tooltip formatter={(value: number) => fmtBRL(value)} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="receita" name="Receita" stackId="financeiro" fill="var(--pine)" />
              <Bar dataKey="despesas" name="Despesas" stackId="financeiro" fill="var(--brick)" />
              <Line type="monotone" dataKey="lucro" name="Lucro" stroke="var(--brass)" strokeWidth={2} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Receita por estado" span={6}>
          <StateBubbleGrid rows={stateRows} />
        </ChartPanel>
      </div>

      {tab === "canal" && (
        <>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
            <ChartPanel title="% OTA x canais diretos — 12 meses" span={6}>
              <ResponsiveContainer width="100%" height={210}>
                <LineChart data={otaTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 9 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                  <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line dataKey="ota" name="OTAs" stroke="var(--brick)" strokeWidth={2} />
                  <Line dataKey="direto" name="Diretos" stroke="var(--pine)" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </ChartPanel>
            <ChartPanel title="Custo da dependência de OTA" span={6}>
              <div className="grid h-[210px] place-content-center gap-3 text-center">
                <div>
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Receita via OTA</p>
                  <p className="font-serif text-2xl font-bold text-pine-dark">{fmtBRL(ota.revenue)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Comissão perdida</p>
                  <p className="font-serif text-2xl font-bold text-brick">{fmtBRL(ota.commission)}</p>
                  <p className="text-xs text-muted-foreground">Esse valor ficaria no hotel em reservas diretas.</p>
                </div>
              </div>
            </ChartPanel>
          </div>
          <AlertBanner title={`${ota.share.toFixed(1)}% da receita de hospedagem vem de OTAs`} tone="brass">
            A dependência {otaDirection > 0 ? "subiu" : otaDirection < 0 ? "caiu" : "ficou estável"}{" "}
            {Math.abs(otaDirection).toFixed(1)} ponto(s) nos últimos 3 meses. A comissão estimada no período é{" "}
            {fmtBRL(ota.commission)}. Reforce WhatsApp, Instagram e site para hóspedes recorrentes.
          </AlertBanner>
        </>
      )}

      <ReceivablesPanel reservations={reservations} clients={clients} sales={sales} />
    </div>
  );
}

function StateBubbleGrid({ rows }: { rows: { state: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div className="grid min-h-[210px] grid-cols-3 place-items-center gap-2 rounded-md bg-[linear-gradient(135deg,var(--paper),var(--sage-bg))] p-3 sm:grid-cols-5">
      {rows.length ? rows.slice(0, 10).map((row) => {
        const size = 38 + (row.value / max) * 38;
        return (
          <div
            key={row.state}
            className="grid place-items-center rounded-full border-4 border-white bg-pine text-[10px] font-bold text-white shadow"
            style={{ width: size, height: size }}
            title={`${row.state}: ${fmtBRL(row.value)}`}
          >
            {row.state}
          </div>
        );
      }) : <p className="col-span-full text-xs text-muted-foreground">Cadastre o estado dos clientes para visualizar o mapa.</p>}
    </div>
  );
}

function groupValues<T>(rows: T[], label: (row: T) => string, value: (row: T) => number) {
  const map = new Map<string, number>();
  rows.forEach((row) => {
    const key = label(row);
    map.set(key, (map.get(key) ?? 0) + value(row));
  });
  return [...map].map(([name, amount]) => ({ name, value: amount })).filter((row) => row.value > 0);
}

function mergeGroups(...groups: { name: string; value: number }[][]) {
  const map = new Map<string, number>();
  groups.flat().forEach((row) => map.set(row.name, (map.get(row.name) ?? 0) + row.value));
  return [...map].map(([name, value]) => ({ name, value })).filter((row) => row.value > 0);
}

function groupReservations(rows: Reservation[], group: (reservation: Reservation) => string) {
  const map = new Map<string, Reservation[]>();
  rows.forEach((reservation) => {
    const key = group(reservation);
    map.set(key, [...(map.get(key) ?? []), reservation]);
  });
  return [...map].map(([name, groupedRows]) => ({ name, rows: groupedRows }));
}

function tabLabel(tab: FinancialTab) {
  if (tab === "despesa") return "categorias de despesa";
  if (tab === "canal") return "canais";
  return "formas de pagamento";
}
