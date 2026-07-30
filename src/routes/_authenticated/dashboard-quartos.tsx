import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, BedDouble, CheckCircle2, Search, Sparkles } from "lucide-react";
import {
  roomStatusToday,
  useComplaints,
  useReservations,
  useRooms,
  type Room,
} from "@/lib/data";
import { PageHeader } from "@/components/AppLayout";
import { fmtBRL, todayISO } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard-quartos")({
  component: DashboardQuartos,
});

type RoomStatus = "todos" | "livre" | "ocupado" | "reservado" | "limpeza" | "manutencao";

const STATUS_VISUAL: Record<Exclude<RoomStatus, "todos">, { label: string; className: string }> = {
  livre: { label: "Livre", className: "border-sage/45 bg-sage-bg text-pine-dark" },
  ocupado: { label: "Ocupado", className: "border-pine/45 bg-pine/10 text-pine-dark" },
  reservado: { label: "Reservado", className: "border-brass/55 bg-brass/15 text-pine-dark" },
  limpeza: { label: "Limpeza", className: "border-sky-400/55 bg-sky-100 text-sky-950" },
  manutencao: { label: "Manutenção", className: "border-brick/55 bg-brick-bg text-brick" },
};

function DashboardQuartos() {
  const today = todayISO();
  const { data: rooms = [] } = useRooms();
  const { data: reservations = [] } = useReservations();
  const { data: complaints = [] } = useComplaints();
  const [status, setStatus] = useState<RoomStatus>("todos");
  const [search, setSearch] = useState("");

  const roomRows = useMemo(
    () =>
      rooms.map((room) => {
        const currentStatus = roomStatusToday(
          reservations,
          room.numero,
          today,
          room.situacao,
        ) as Exclude<RoomStatus, "todos">;
        const openProblems = complaints.filter(
          (complaint) => complaint.quarto === room.numero && complaint.status !== "resolvido",
        ).length;
        const activeReservation = reservations.find(
          (reservation) =>
            reservation.quarto === room.numero &&
            !["cancelado", "finalizado", "manutencao"].includes(reservation.status) &&
            reservation.checkin <= today &&
            reservation.checkout >= today,
        );
        return { room, status: currentStatus, openProblems, activeReservation };
      }),
    [complaints, reservations, rooms, today],
  );

  const visibleRows = roomRows.filter((row) => {
    const matchesStatus = status === "todos" || row.status === status;
    const query = search.trim().toLocaleLowerCase("pt-BR");
    const matchesSearch =
      !query ||
      String(row.room.numero).includes(query) ||
      String(row.room.configuracao ?? "").toLocaleLowerCase("pt-BR").includes(query);
    return matchesStatus && matchesSearch;
  });
  const count = (value: Exclude<RoomStatus, "todos">) =>
    roomRows.filter((row) => row.status === value).length;
  const roomsWithProblems = roomRows
    .filter((row) => row.openProblems > 0)
    .sort((left, right) => right.openProblems - left.openProblems);

  return (
    <div className="space-y-4 pb-6">
      <PageHeader
        title="Gestão de quartos"
        subtitle="Situação operacional das UHs. Análises e gráficos ficam no Dashboard Estratégico."
        action={
          <Link to="/mapa" className="btn-primary flex items-center gap-2">
            <BedDouble className="h-4 w-4" />
            Abrir mapa de reservas
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <OperationalMetric label="Total de UHs" value={rooms.length} tone="neutral" />
        <OperationalMetric label="Livres" value={count("livre")} tone="good" />
        <OperationalMetric label="Ocupados" value={count("ocupado")} tone="primary" />
        <OperationalMetric label="Reservados" value={count("reservado")} tone="attention" />
        <OperationalMetric label="Limpeza" value={count("limpeza")} tone="info" />
        <OperationalMetric label="Manutenção" value={count("manutencao")} tone="danger" />
      </div>

      <section className="card-surface p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <label className="relative block w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className="field pl-9"
              placeholder="Buscar quarto ou configuração"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {(["todos", "livre", "ocupado", "reservado", "limpeza", "manutencao"] as const).map(
              (value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatus(value)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                    status === value
                      ? "bg-pine text-white"
                      : "border border-border bg-card text-muted-foreground hover:bg-sage-bg"
                  }`}
                >
                  {value === "todos" ? "Todos" : STATUS_VISUAL[value].label}
                </button>
              ),
            )}
          </div>
        </div>
      </section>

      <section className="card-surface p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h2 className="font-serif text-lg font-bold text-pine-dark">Unidades habitacionais</h2>
            <p className="text-xs text-muted-foreground">
              {visibleRows.length} de {rooms.length} quarto(s) exibidos
            </p>
          </div>
          <Sparkles className="h-5 w-5 text-brass" aria-hidden="true" />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {visibleRows.map((row) => (
            <RoomOperationalCard key={row.room.numero} row={row} />
          ))}
          {!visibleRows.length && (
            <p className="col-span-full rounded-lg bg-muted/45 px-4 py-10 text-center text-sm text-muted-foreground">
              Nenhum quarto corresponde ao filtro.
            </p>
          )}
        </div>
      </section>

      <section className="card-surface p-4">
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-brick" />
          <h2 className="font-serif text-base font-bold text-pine-dark">Atenção operacional</h2>
        </div>
        {roomsWithProblems.length ? (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {roomsWithProblems.map((row) => (
              <div
                key={row.room.numero}
                className="flex items-center justify-between rounded-lg border border-brick/35 bg-brick-bg px-3 py-2"
              >
                <span className="font-semibold text-pine-dark">Quarto {row.room.numero}</span>
                <span className="text-xs font-bold text-brick">
                  {row.openProblems} problema(s) aberto(s)
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-sage" />
            Nenhum problema aberto nos quartos.
          </p>
        )}
      </section>
    </div>
  );
}

function OperationalMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "good" | "primary" | "attention" | "info" | "danger";
}) {
  const toneClass = {
    neutral: "border-border",
    good: "border-sage",
    primary: "border-pine",
    attention: "border-brass",
    info: "border-sky-400",
    danger: "border-brick",
  }[tone];
  return (
    <article className={`stat-card border-t-4 ${toneClass}`}>
      <p className="truncate text-[10px] font-bold uppercase text-muted-foreground">{label}</p>
      <p className="font-serif text-xl font-bold text-pine-dark">{value}</p>
    </article>
  );
}

function RoomOperationalCard({
  row,
}: {
  row: {
    room: Room;
    status: Exclude<RoomStatus, "todos">;
    openProblems: number;
    activeReservation?: { cliente_nome: string; checkout: string } | null;
  };
}) {
  const visual = STATUS_VISUAL[row.status] ?? STATUS_VISUAL.livre;
  return (
    <Link
      to="/mapa"
      search={{ quarto: String(row.room.numero) } as never}
      className={`group rounded-xl border p-3 transition hover:-translate-y-0.5 hover:shadow-md ${visual.className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] opacity-65">Quarto</p>
          <p className="font-serif text-2xl font-bold leading-none">{row.room.numero}</p>
        </div>
        <span className="rounded-full bg-white/60 px-2 py-1 text-[9px] font-bold uppercase">
          {visual.label}
        </span>
      </div>
      <p className="mt-2 truncate text-xs font-semibold">
        {row.room.configuracao || "Configuração não informada"}
      </p>
      <p className="mt-0.5 text-[10px] opacity-75">
        {row.room.andar}º andar · {fmtBRL(row.room.preco)}
      </p>
      {row.activeReservation && (
        <p className="mt-2 truncate rounded-md bg-white/55 px-2 py-1 text-[10px]">
          {row.activeReservation.cliente_nome}
        </p>
      )}
      {row.openProblems > 0 && (
        <p className="mt-2 text-[10px] font-bold text-brick">
          {row.openProblems} problema(s) aberto(s)
        </p>
      )}
    </Link>
  );
}
