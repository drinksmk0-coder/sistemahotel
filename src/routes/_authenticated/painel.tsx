import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { BedDouble, DollarSign, MessageSquareWarning, Star, Wifi, AlertTriangle } from "lucide-react";
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
} from "recharts";
import {
  useRooms,
  useReservations,
  useSales,
  useComplaints,
  useFeedbacks,
  useExpenses,
  roomStatusToday,
  type Reservation,
  type Sale,
} from "@/lib/data";
import { fmtBRL, todayISO } from "@/lib/format";
import { complaintLabel } from "@/lib/constants";
import { PageHeader } from "@/components/AppLayout";
import { Badge } from "@/components/ui-kit";

export const Route = createFileRoute("/_authenticated/painel")({
  component: Painel,
});

function Painel() {
  const today = todayISO();
  const month = today.slice(0, 7);
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
        <Stat icon={<BedDouble />} label="Ocupação hoje" value={`${ocupacao}%`} hint={`${ocupados} ocupados · ${reservados} reservados · ${livres} livres`} />
        <Stat icon={<DollarSign />} label="Receita do mês" value={fmtBRL(receitaMes)} hint={`A receber: ${fmtBRL(aReceber)}`} />
        <Stat icon={<MessageSquareWarning />} label="Reclamações abertas" value={String(abertas.length)} hint={`${wifiCount} sobre Wi-Fi`} />
        <Stat icon={<Star />} label="Avaliação média" value={media ? media.toFixed(1) : "—"} hint={`${feedbacks.length} avaliações`} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<DollarSign />} label="Diaria media" value={fmtBRL(diariaMedia)} hint="Reservas e quartos" />
        <Stat icon={<BedDouble />} label="Ocupantes" value={String(ocupantesHoje)} hint={`Capacidade: ${capacidadeTotal}`} />
        <Stat icon={<DollarSign />} label="Despesas" value={fmtBRL(despesasMes)} hint={`Margem: ${fmtBRL(margemMes)}`} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="card-surface p-5">
          <h3 className="section-title mb-3 text-lg">Receita ao longo do tempo (30 dias)</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={series} margin={{ left: -10, right: 8, top: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => fmtBRL(v)} />
              <Line type="monotone" dataKey="receita" name="Receita" stroke="var(--pine)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card-surface p-5">
          <h3 className="section-title mb-3 text-lg">Comparecimento x cancelamentos</h3>
          <ResponsiveContainer width="100%" height={240}>
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
        <h3 className="section-title mb-3 text-lg">Receita por quarto</h3>
        {receitaPorQuarto.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem receita registrada ainda.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={receitaPorQuarto} margin={{ left: -10, right: 8, top: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="quarto" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => fmtBRL(v)} />
              <Bar dataKey="receita" name="Receita" fill="var(--brass)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
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

function Stat({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="stat-card">
      <div className="mb-2 flex items-center gap-2 text-pine">
        <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      </div>
      <div className="font-serif text-2xl font-bold">{value}</div>
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
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
