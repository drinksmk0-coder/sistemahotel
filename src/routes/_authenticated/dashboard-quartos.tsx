import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import {
  roomStatusToday,
  useComplaints,
  useReservations,
  useRooms,
  type Reservation,
  type Room,
} from "@/lib/data";
import { fmtBRL, todayISO } from "@/lib/format";
import {
  addDays,
  inRange,
  lastMonths,
  percent,
  periodRange,
  rangeDays,
  reservationRevenue,
  roomNights,
  type DashboardPeriod,
} from "@/lib/dashboard-utils";
import {
  AlertBanner,
  ChartPanel,
  DashboardHeader,
  DashboardTabs,
  FunnelRow,
  FunnelStage,
  ShortList,
} from "@/components/DashboardKit";

export const Route = createFileRoute("/_authenticated/dashboard-quartos")({
  component: DashboardQuartos,
});

type RoomTab = "andar" | "configuracao" | "preco";

const STATUS_COLORS: Record<string, string> = {
  ocupado: "var(--brick)",
  reservado: "var(--brass)",
  limpeza: "#7c9b89",
  manutencao: "#6b7280",
  livre: "var(--sage)",
};

function DashboardQuartos() {
  const today = todayISO();
  const [period, setPeriod] = useState<DashboardPeriod>("mes");
  const [tab, setTab] = useState<RoomTab>("andar");
  const { data: rooms = [] } = useRooms();
  const { data: reservations = [] } = useReservations();
  const { data: complaints = [] } = useComplaints();
  const range = periodRange(period, today);
  const periodReservations = reservations.filter(
    (reservation) =>
      reservation.status !== "cancelado" &&
      reservation.status !== "manutencao" &&
      inRange(reservation.checkin, range),
  );
  const statusRows = rooms.map((room) => ({
    room,
    status: roomStatusToday(reservations, room.numero, today, room.situacao),
  }));
  const statusCount = (status: string) => statusRows.filter((row) => row.status === status).length;

  const roomMetrics = useMemo(
    () =>
      rooms.map((room) => {
        const rows = periodReservations.filter((reservation) => reservation.quarto === room.numero);
        const revenue = rows.reduce((sum, reservation) => sum + reservationRevenue(reservation), 0);
        const nights = rows.reduce((sum, reservation) => sum + roomNights(reservation, range), 0);
        const split = rows.reduce(
          (acc, reservation) => {
            const values = splitRevenueByDayType(reservation, range);
            acc.weekend += values.weekend;
            acc.weekday += values.weekday;
            return acc;
          },
          { weekend: 0, weekday: 0 },
        );
        return {
          room,
          revenue,
          nights,
          reservations: rows.length,
          adr: nights ? revenue / nights : 0,
          weekend: split.weekend,
          weekday: split.weekday,
        };
      }),
    [periodReservations, range, rooms],
  );

  const revenueMedian = median(roomMetrics.map((row) => row.revenue));
  const volumeMedian = median(roomMetrics.map((row) => row.nights));
  const topRevenue = roomMetrics.slice().sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  const topVolume = roomMetrics.slice().sort((a, b) => b.nights - a.nights).slice(0, 5);
  const topRevenueIds = new Set(topRevenue.map((row) => row.room.numero));
  const topVolumeIds = new Set(topVolume.map((row) => row.room.numero));

  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; revenue: number; nights: number }>();
    roomMetrics.forEach((row) => {
      const key = roomGroupLabel(row.room, tab);
      const current = map.get(key) ?? { name: key, revenue: 0, nights: 0 };
      current.revenue += row.revenue;
      current.nights += row.nights;
      map.set(key, current);
    });
    return [...map.values()].sort((a, b) => b.revenue - a.revenue);
  }, [roomMetrics, tab]);

  const monthly = useMemo(
    () =>
      lastMonths(today).map((month) => {
        const monthStart = `${month.key}-01`;
        const base = new Date(`${monthStart}T12:00:00`);
        const monthEnd = `${month.key}-${String(new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()).padStart(2, "0")}`;
        const monthRange = { start: monthStart, end: monthEnd };
        const used = reservations.reduce((sum, reservation) => sum + roomNights(reservation, monthRange), 0);
        const available = rooms.length * rangeDays(monthRange);
        return { ...month, ocupado: used, disponivel: Math.max(0, available - used) };
      }),
    [reservations, rooms.length, today],
  );

  const recurringComplaints = useMemo(() => {
    const map = new Map<number, number>();
    complaints
      .filter((complaint) => complaint.status !== "resolvido" && complaint.quarto != null)
      .forEach((complaint) => map.set(complaint.quarto!, (map.get(complaint.quarto!) ?? 0) + 1));
    return [...map].map(([room, count]) => ({ room, count })).filter((row) => row.count >= 2).sort((a, b) => b.count - a.count);
  }, [complaints]);

  const highVolumeLowRevenue = roomMetrics
    .filter((row) => row.nights > volumeMedian && row.revenue < revenueMedian)
    .sort((a, b) => b.nights - a.nights)[0];
  const lowVolumeHighRevenue = roomMetrics
    .filter((row) => row.nights < volumeMedian && row.revenue > revenueMedian)
    .sort((a, b) => b.revenue - a.revenue)[0];

  const statusComposition = ["ocupado", "reservado", "limpeza", "manutencao", "livre"]
    .map((status) => ({ name: statusLabel(status), value: statusCount(status), status }))
    .filter((row) => row.value > 0);

  return (
    <div className="space-y-3 pb-6">
      <DashboardHeader
        title="Dashboard de Quartos"
        subtitle="Disponibilidade agora e desempenho de receita versus volume."
        period={period}
        onPeriodChange={setPeriod}
      />

      {recurringComplaints.length > 0 && (
        <AlertBanner title="Quartos com reclamação recorrente">
          Priorize a inspeção dos quartos {recurringComplaints.slice(0, 4).map((row) => row.room).join(", ")}.
        </AlertBanner>
      )}

      <FunnelRow>
        <FunnelStage label="Reservado" value={String(statusCount("reservado"))} tone="brass" />
        <FunnelStage label="Ocupado" value={String(statusCount("ocupado"))} percentValue={percent(statusCount("ocupado"), rooms.length)} tone="brick" />
        <FunnelStage label="Check-out hoje" value={String(reservations.filter((reservation) => reservation.checkout === today && reservation.status !== "cancelado").length)} />
        <FunnelStage label="Aguardando limpeza" value={String(statusCount("limpeza"))} tone="brass" />
        <FunnelStage label="Disponível" value={String(statusCount("livre"))} percentValue={percent(statusCount("livre"), rooms.length)} tone="sage" />
        <FunnelStage label="Manutenção" value={String(statusCount("manutencao"))} tone={statusCount("manutencao") ? "brick" : "sage"} />
      </FunnelRow>

      <DashboardTabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "andar", label: "Por andar" },
          { value: "configuracao", label: "Por configuração" },
          { value: "preco", label: "Por faixa de preço" },
        ]}
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <ChartPanel title="Status dos quartos agora" span={6}>
          <ResponsiveContainer width="100%" height={210}>
            <PieChart>
              <Pie data={statusComposition} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={2}>
                {statusComposition.map((row) => <Cell key={row.status} fill={STATUS_COLORS[row.status]} />)}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title={`Receita x volume ${tabLabel(tab)}`} span={6}>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={grouped} layout="vertical" margin={{ left: 28, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis type="number" tick={{ fontSize: 9 }} />
              <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 9 }} />
              <Tooltip formatter={(value: number, name: string) => name === "Receita" ? fmtBRL(value) : value} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="revenue" name="Receita" fill="var(--pine)" />
              <Bar dataKey="nights" name="Diárias" fill="var(--sage)" />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Ocupação mensal — 12 meses" span={6}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 9 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="ocupado" name="UHs ocupadas" stackId="rooms" fill="var(--pine)" />
              <Bar dataKey="disponivel" name="UHs disponíveis" stackId="rooms" fill="var(--sage)" />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Mapa dos quartos por andar" span={6}>
          <RoomFloorGrid rows={statusRows} />
        </ChartPanel>

        <ChartPanel
          title="Receita x volume por quarto"
          subtitle="Linhas tracejadas mostram as medianas e separam os quatro quadrantes de decisão."
          span={12}
        >
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart margin={{ left: 10, right: 20, top: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis type="number" dataKey="nights" name="Diárias" tick={{ fontSize: 10 }} />
              <YAxis type="number" dataKey="revenue" name="Receita" tick={{ fontSize: 10 }} tickFormatter={(value) => `R$${Math.round(value)}`} />
              <ZAxis dataKey="reservations" range={[60, 220]} name="Reservas" />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} formatter={(value: number, name: string) => name === "Receita" ? fmtBRL(value) : value} />
              <ReferenceLine x={volumeMedian} stroke="var(--brass)" strokeDasharray="5 5" />
              <ReferenceLine y={revenueMedian} stroke="var(--brass)" strokeDasharray="5 5" />
              <Scatter
                name="Quartos"
                data={roomMetrics.map((row) => ({ ...row, name: `Q${row.room.numero}` }))}
                fill="var(--pine)"
              />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartPanel>
      </div>

      {(highVolumeLowRevenue || lowVolumeHighRevenue) && (
        <AlertBanner title="Ação sugerida pelos quadrantes" tone="brass">
          {highVolumeLowRevenue && `Quarto ${highVolumeLowRevenue.room.numero} tem alto volume e receita abaixo da mediana — considere reajustar a diária. `}
          {lowVolumeHighRevenue && `Quarto ${lowVolumeHighRevenue.room.numero} tem receita alta com poucas diárias — aumente a divulgação.`}
        </AlertBanner>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <ShortList
          title="Top 5 em receita total"
          rows={topRevenue.map((row) => ({
            label: `Quarto ${row.room.numero}`,
            value: fmtBRL(row.revenue),
            hint: `${row.nights} diária(s) · ADR ${fmtBRL(row.adr)}`,
            highlight: !topVolumeIds.has(row.room.numero),
          }))}
        />
        <ShortList
          title="Top 5 em volume de diárias"
          rows={topVolume.map((row) => ({
            label: `Quarto ${row.room.numero}`,
            value: `${row.nights} diária(s)`,
            hint: `${fmtBRL(row.revenue)} de receita`,
            highlight: !topRevenueIds.has(row.room.numero),
          }))}
        />
        <ShortList
          title="Fim de semana x dia útil"
          rows={roomMetrics
            .slice()
            .sort((a, b) => b.weekend + b.weekday - (a.weekend + a.weekday))
            .map((row) => ({
              label: `Quarto ${row.room.numero}`,
              value: fmtBRL(row.weekend),
              hint: `dia útil: ${fmtBRL(row.weekday)}`,
            }))}
        />
        <ShortList
          title="Reclamações recorrentes"
          rows={recurringComplaints.map((row) => ({
            label: `Quarto ${row.room}`,
            value: `${row.count} abertas`,
            highlight: true,
          }))}
        />
      </div>
    </div>
  );
}

function RoomFloorGrid({
  rows,
}: {
  rows: { room: Room; status: string }[];
}) {
  const floors = [...new Set(rows.map((row) => row.room.andar))].sort((a, b) => a - b);
  return (
    <div className="max-h-[220px] space-y-2 overflow-y-auto rounded-md bg-sage-bg/45 p-3">
      {floors.map((floor) => (
        <div key={floor}>
          <p className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">{floor}º andar</p>
          <div className="flex flex-wrap gap-1.5">
            {rows.filter((row) => row.room.andar === floor).map((row) => (
              <span
                key={row.room.numero}
                className="rounded-md px-2 py-1 text-[10px] font-bold text-white shadow-sm"
                style={{ backgroundColor: STATUS_COLORS[row.status] ?? "var(--pine)" }}
                title={`${row.room.configuracao} · ${statusLabel(row.status)}`}
              >
                Q{row.room.numero}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function splitRevenueByDayType(reservation: Reservation, range: { start: string; end: string }) {
  const start = reservation.checkin < range.start ? range.start : reservation.checkin;
  const rangeEndExclusive = addDays(range.end, 1);
  const end = reservation.checkout > rangeEndExclusive ? rangeEndExclusive : reservation.checkout;
  const nights = roomNights(reservation, range);
  const dailyValue = nights ? reservationRevenue(reservation) / nights : 0;
  let weekend = 0;
  let weekday = 0;
  for (let day = start; day < end; day = addDays(day, 1)) {
    const weekdayNumber = new Date(`${day}T12:00:00`).getDay();
    if (weekdayNumber === 0 || weekdayNumber === 6) weekend += dailyValue;
    else weekday += dailyValue;
  }
  return { weekend, weekday };
}

function roomGroupLabel(room: Room, tab: RoomTab) {
  if (tab === "andar") return `${room.andar}º andar`;
  if (tab === "configuracao") return room.configuracao || "Não informado";
  if (room.preco < 100) return "Até R$ 99";
  if (room.preco < 150) return "R$ 100–149";
  return "R$ 150+";
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    ocupado: "Ocupado",
    reservado: "Reservado",
    limpeza: "Limpeza",
    manutencao: "Manutenção",
    livre: "Disponível",
  };
  return labels[status] ?? status;
}

function tabLabel(tab: RoomTab) {
  if (tab === "andar") return "por andar";
  if (tab === "configuracao") return "por configuração";
  return "por faixa de preço";
}

function median(values: number[]) {
  const sorted = values.slice().sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
