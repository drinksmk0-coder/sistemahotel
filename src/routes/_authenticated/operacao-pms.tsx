import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { AlertTriangle, BedDouble, CalendarCheck, CalendarClock, ClipboardList, Wallet } from "lucide-react";
import { useCurrentCompany, useReservations, useRooms, roomStatusToday } from "@/lib/data";
import { todayISO } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/operacao-pms")({
  component: OperacaoPms,
});

const inactive = new Set(["cancelado", "finalizado", "manutencao"]);
const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

function OperacaoPms() {
  const company = useCurrentCompany();
  const roomsQuery = useRooms();
  const reservationsQuery = useReservations();
  const rooms = roomsQuery.data ?? [];
  const reservations = reservationsQuery.data ?? [];
  const today = todayISO();
  const summary = useMemo(() => {
    const active = reservations.filter((r) => !inactive.has(r.status));
    const arrivals = active.filter((r) => r.checkin === today);
    const departures = active.filter((r) => r.checkout === today);
    const overdue = active.filter((r) => r.checkout < today && (r.status === "ocupado" || r.status === "saida_pendente"));
    const occupied = rooms.filter((room) => roomStatusToday(reservations, room.numero, today, room.situacao) === "ocupado");
    const blocked = rooms.filter((room) => ["manutencao", "limpeza"].includes(roomStatusToday(reservations, room.numero, today, room.situacao)));
    const pending = active.filter((r) => Number(r.valor_total ?? 0) - Number(r.valor_pago ?? 0) > 0.01);
    const balance = pending.reduce((sum, r) => sum + Math.max(0, Number(r.valor_total ?? 0) - Number(r.valor_pago ?? 0)), 0);
    return { arrivals, departures, overdue, occupied, blocked, pending, balance };
  }, [reservations, rooms, today]);

  const loading = company.isLoading || roomsQuery.isLoading || reservationsQuery.isLoading;
  const error = company.error || roomsQuery.error || reservationsQuery.error;
  const cards = [
    { label: "Quartos ocupados", value: summary.occupied.length, icon: BedDouble },
    { label: "Chegadas hoje", value: summary.arrivals.length, icon: CalendarCheck },
    { label: "Saídas previstas hoje", value: summary.departures.length, icon: CalendarClock },
    { label: "Limpeza / manutenção", value: summary.blocked.length, icon: ClipboardList },
    { label: "Saídas vencidas", value: summary.overdue.length, icon: AlertTriangle },
    { label: "Saldo em aberto (reservas ativas)", value: money(summary.balance), icon: Wallet },
  ];

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 pb-16 md:p-8">
      <header className="rounded-3xl bg-slate-950 p-6 text-white md:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Central operacional · PMS</p>
        <h1 className="mt-2 text-3xl font-bold">Bom dia, {company.data?.nome ?? "hotel"}</h1>
        <p className="mt-2 text-sm text-slate-300">Situação operacional em {new Date(today + "T12:00:00").toLocaleDateString("pt-BR")}. Dados da empresa selecionada, sem alterações automáticas.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link to="/mapa" className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-950">Mapa de quartos</Link>
          <Link to="/reservas" className="rounded-xl border border-white/30 px-4 py-2 text-sm font-semibold text-white">Gerenciar reservas</Link>
          <Link to="/fichas-checkin" className="rounded-xl border border-white/30 px-4 py-2 text-sm font-semibold text-white">Check-in / FNRH</Link>
        </div>
      </header>
      {loading ? <p role="status">Carregando dados do hotel...</p> : error ? (
        <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-800">Não foi possível carregar os dados. Verifique sua conexão e permissões.</p>
      ) : (
        <>
          <section aria-label="Indicadores da operação" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-600"><Icon className="h-4 w-4" />{label}</div>
                <div className="mt-3 text-3xl font-bold text-slate-950">{value}</div>
              </div>
            ))}
          </section>
          <section className="grid gap-4 lg:grid-cols-2">
            <Queue title="Chegadas de hoje" items={summary.arrivals} empty="Nenhuma chegada prevista." />
            <Queue title="Saídas de hoje" items={summary.departures} empty="Nenhuma saída prevista." />
            <Queue title="Atenção: saídas vencidas" items={summary.overdue} empty="Nenhuma saída vencida identificada." warning />
            <Queue title="Reservas com saldo pendente" items={summary.pending.slice(0, 20)} empty="Nenhum saldo pendente nas reservas ativas." showBalance />
          </section>
          <p className="text-xs text-slate-500">Os alertas são indicativos: saída vencida não comprova que o hóspede permaneceu no hotel. Os saldos vêm dos valores registrados nas reservas e não substituem conciliação financeira. Nenhum registro é regularizado automaticamente.</p>
        </>
      )}
    </main>
  );
}

type QueueReservation = { id: string; quarto: number; cliente_nome: string; checkin: string; checkout: string; valor_total: number | null; valor_pago: number | null };
function Queue({ title, items, empty, warning = false, showBalance = false }: { title: string; items: QueueReservation[]; empty: string; warning?: boolean; showBalance?: boolean }) {
  return <div className={`rounded-2xl border bg-white p-5 shadow-sm ${warning && items.length ? "border-amber-300" : "border-slate-200"}`}>
    <h2 className="mb-4 text-lg font-bold text-slate-900">{title} <span className="text-sm font-normal text-slate-500">({items.length})</span></h2>
    {!items.length ? <p className="text-sm text-slate-500">{empty}</p> : (
      <ul className="max-h-80 divide-y divide-slate-100 overflow-auto">
        {items.map((r) => <li key={r.id} className="flex items-center justify-between gap-3 py-3 text-sm">
          <div><strong className="text-slate-900">Quarto {r.quarto}</strong><div className="text-slate-600">{r.cliente_nome}</div><div className="text-xs text-slate-500">{r.checkin} a {r.checkout}</div></div>
          {showBalance ? <strong className="whitespace-nowrap text-amber-800">{money(Math.max(0, Number(r.valor_total ?? 0) - Number(r.valor_pago ?? 0)))}</strong> : null}
        </li>)}
      </ul>
    )}
  </div>;
}
