import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import {
  useRooms,
  useClients,
  useReservations,
  useSales,
  useComplaints,
  useInsert,
  useUpdate,
  roomStatusToday,
  activeReservationForRoom,
  futureReservationsForRoom,
  roomBlock,
  type Room,
} from "@/lib/data";
import { fmtBRL, fmtDate, fmtTime, todayISO } from "@/lib/format";
import { complaintLabel } from "@/lib/constants";
import { PageHeader } from "@/components/AppLayout";
import { Modal, Badge } from "@/components/ui-kit";
import { ReservaForm } from "@/components/ReservaForm";

export const Route = createFileRoute("/_authenticated/mapa")({
  component: Mapa,
});

const STATUS_STYLE: Record<string, { bg: string; label: string }> = {
  livre: { bg: "bg-sage-bg border-sage/40 text-pine-dark", label: "Livre" },
  ocupado: { bg: "bg-brick-bg border-brick/40 text-brick", label: "Ocupado" },
  reservado: { bg: "bg-brass-bg border-brass/50 text-[oklch(0.4_0.06_74)]", label: "Reservado" },
  limpeza: { bg: "bg-slate-bg border-slate/40 text-slate", label: "Em limpeza" },
  manutencao: { bg: "bg-slate-bg border-slate/40 text-slate", label: "Manutenção" },
};

function Mapa() {
  const today = todayISO();
  const { data: rooms = [] } = useRooms();
  const { data: clients = [] } = useClients();
  const { data: reservations = [] } = useReservations();
  const { data: sales = [] } = useSales();
  const { data: complaints = [] } = useComplaints();
  const insert = useInsert("reservations", ["reservations"]);
  const updateRoom = useUpdate("rooms", ["rooms"]);
  const [selected, setSelected] = useState<Room | null>(null);
  const [newFor, setNewFor] = useState<number | null>(null);

  const complaintsByRoom = useMemo(() => {
    const m = new Map<number, number>();
    complaints
      .filter((c) => c.status !== "resolvido")
      .forEach((c) => c.quarto != null && m.set(c.quarto, (m.get(c.quarto) ?? 0) + 1));
    return m;
  }, [complaints]);

  const floors = useMemo(() => {
    const m = new Map<number, Room[]>();
    rooms.forEach((r) => {
      if (!m.has(r.andar)) m.set(r.andar, []);
      m.get(r.andar)!.push(r);
    });
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [rooms]);

  const maxComplaints = Math.max(1, ...complaintsByRoom.values());
  const revenueByRoom = useMemo(() => {
    const m = new Map<number, number>();
    reservations.forEach((r) => {
      if (r.status !== "cancelado") m.set(r.quarto, (m.get(r.quarto) ?? 0) + Number(r.valor_total));
    });
    sales.forEach((s) => m.set(s.quarto, (m.get(s.quarto) ?? 0) + Number(s.total)));
    return m;
  }, [reservations, sales]);

  return (
    <div>
      <PageHeader
        title="Mapa de quartos"
        subtitle="Situação de cada quarto hoje, com mapa de calor de reclamações sempre ativo. Clique num quarto para ver detalhes ou criar reserva."
      />

      <div className="mb-4 flex flex-wrap gap-3 text-xs">
        {Object.entries(STATUS_STYLE).map(([k, s]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={`inline-block h-3 w-3 rounded ${s.bg.split(" ")[0]}`} /> {s.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded bg-brick" /> intensidade = reclamações abertas
        </span>
      </div>

      <div className="space-y-6">
        {floors.map(([andar, list]) => (
          <div key={andar}>
            <h3 className="section-title mb-2 text-sm uppercase tracking-wide text-muted-foreground">
              {andar}º andar
            </h3>
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8">
              {list.map((r) => {
                const st = roomStatusToday(reservations, r.numero, today, r.situacao);
                const style = STATUS_STYLE[st] ?? STATUS_STYLE.livre;
                const n = complaintsByRoom.get(r.numero) ?? 0;
                const intensity = n / maxComplaints;
                const blocked = !!roomBlock(complaints, r.numero);
                const next = futureReservationsForRoom(reservations, r.numero, today)[0];
                const revenue = revenueByRoom.get(r.numero) ?? 0;
                return (
                  <button
                    key={r.numero}
                    onClick={() => setSelected(r)}
                    className={`relative aspect-square rounded-lg border p-2 text-left transition hover:scale-[1.03] ${n > 0 ? "border-brick" : style.bg}`}
                    style={n > 0 ? { backgroundColor: `rgba(200,60,40,${0.12 + intensity * 0.5})` } : undefined}
                  >
                    <div className="font-serif text-lg font-bold">{r.numero}</div>
                    <div className="text-[10px] opacity-80">{fmtBRL(r.preco)}</div>
                    <div className="mt-1 text-[10px] font-semibold">{style.label}</div>
                    {next && (
                      <div className="mt-1 text-[9px] leading-tight opacity-90">
                        {fmtDate(next.checkin)} {fmtTime(next.horario_checkin)}
                      </div>
                    )}
                    {revenue > 0 && <div className="mt-1 text-[9px] font-semibold">{fmtBRL(revenue)}</div>}
                    {n > 0 && (
                      <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brick px-1 text-[9px] font-bold text-white">
                        {n}
                      </span>
                    )}
                    {blocked && (
                      <span className="absolute bottom-1 right-1 text-[9px] font-bold text-brick">🔒</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <RoomModal
          room={selected}
          onClose={() => setSelected(null)}
          reservation={activeReservationForRoom(reservations, selected.numero)}
          futureReservations={futureReservationsForRoom(reservations, selected.numero, today).filter(
            (fr) => fr.id !== activeReservationForRoom(reservations, selected.numero)?.id,
          )}
          sales={sales.filter((s) => s.quarto === selected.numero)}
          complaints={complaints.filter((c) => c.quarto === selected.numero)}
          onNew={() => {
            setNewFor(selected.numero);
            setSelected(null);
          }}
          onSituacao={(situacao) => {
            updateRoom.mutate(
              { id: selected.numero, patch: { situacao } },
              {
                onSuccess: () => {
                  toast.success(situacao ? "Situação do quarto atualizada" : "Situação removida");
                  setSelected((prev) => (prev ? { ...prev, situacao } : prev));
                },
                onError: (e) => toast.error(e.message),
              },
            );
          }}
        />
      )}

      {newFor != null && (
        <ReservaForm
          rooms={rooms}
          clients={clients}
          reservations={reservations}
          complaints={complaints}
          fixedRoom={newFor}
          onClose={() => setNewFor(null)}
          onSave={(row) =>
            insert.mutate(row as never, {
              onSuccess: () => {
                toast.success("Reserva criada");
                setNewFor(null);
              },
              onError: (e) => toast.error(e.message),
            })
          }
        />
      )}
    </div>
  );
}

function RoomModal({
  room,
  onClose,
  reservation,
  futureReservations,
  sales,
  complaints,
  onNew,
  onSituacao,
}: {
  room: Room;
  onClose: () => void;
  reservation: ReturnType<typeof activeReservationForRoom>;
  futureReservations: ReturnType<typeof futureReservationsForRoom>;
  sales: { id: string; item: string; qtd: number; total: number; reserva_id: string | null; categoria: string | null }[];
  complaints: { id: string; categoria: string; descricao: string | null; status: string; created_at: string }[];
  onNew: () => void;
  onSituacao: (situacao: string | null) => void;
}) {
  const stayId = reservation?.id;
  const staySales = stayId ? sales.filter((s) => s.reserva_id === stayId || s.reserva_id == null) : sales;
  const salesTotal = staySales.reduce((s, v) => s + Number(v.total), 0);
  const diaria = reservation ? Number(reservation.valor_total) : 0;
  const totalHospedagem = diaria + salesTotal;

  return (
    <Modal open onClose={onClose} title={`Quarto ${room.numero} — ${room.andar}º andar`} wide>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onSituacao(room.situacao === "limpeza" ? null : "limpeza")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${room.situacao === "limpeza" ? "bg-slate text-white" : "bg-slate-bg text-slate"}`}
          >
            {room.situacao === "limpeza" ? "✓ Em limpeza" : "Marcar limpeza"}
          </button>
          <button
            type="button"
            onClick={() => onSituacao(room.situacao === "manutencao" ? null : "manutencao")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${room.situacao === "manutencao" ? "bg-slate text-white" : "bg-slate-bg text-slate"}`}
          >
            {room.situacao === "manutencao" ? "✓ Em manutenção" : "Marcar manutenção"}
          </button>
          {room.situacao && (
            <button
              type="button"
              onClick={() => onSituacao(null)}
              className="rounded-md bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground"
            >
              Liberar quarto
            </button>
          )}
        </div>
        <button onClick={onNew} className="btn-primary flex items-center gap-1.5">
          <Plus className="h-4 w-4" /> Nova reserva neste quarto
        </button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <section>
          <h4 className="mb-2 font-semibold">Hospedagem atual</h4>
          {reservation ? (
            <div className="space-y-1 text-sm">
              <p className="font-semibold">{reservation.cliente_nome}</p>
              <p className="text-muted-foreground">
                {fmtDate(reservation.checkin)} {fmtTime(reservation.horario_checkin)} →{" "}
                {fmtDate(reservation.checkout)} {fmtTime(reservation.horario_checkout)} · {reservation.diarias} diária(s)
              </p>
              <p>Diárias: {fmtBRL(reservation.valor_total)}</p>
              <p>
                Status:{" "}
                <Badge tone={reservation.pago ? "sage" : "brick"}>
                  {reservation.pago ? "Pago" : "A receber"}
                </Badge>
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sem reserva ativa.</p>
          )}

          <h4 className="mb-2 mt-4 font-semibold">Próximas reservas</h4>
          {futureReservations.length ? (
            <ul className="space-y-1 text-sm">
              {futureReservations.map((fr) => (
                <li key={fr.id} className="flex items-center justify-between border-b border-border/60 py-1">
                  <span>
                    {fr.cliente_nome} · {fmtDate(fr.checkin)} {fmtTime(fr.horario_checkin)} →{" "}
                    {fmtDate(fr.checkout)} {fmtTime(fr.horario_checkout)}
                  </span>
                  <Badge tone="brass">{fr.status}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma reserva futura — quarto livre para novas datas.</p>
          )}

          <h4 className="mb-2 mt-4 font-semibold">Vendas desta estadia</h4>
          {staySales.length ? (
            <ul className="space-y-1 text-sm">
              {staySales.map((s) => (
                <li key={s.id} className="flex justify-between border-b border-border/60 py-1">
                  <span>{s.item} ×{s.qtd}</span>
                  <span>{fmtBRL(s.total)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma venda registrada.</p>
          )}

          <div className="mt-3 rounded-lg bg-sage-bg/60 p-3">
            <div className="flex justify-between text-sm">
              <span>Diárias</span>
              <span>{fmtBRL(diaria)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Vendas</span>
              <span>{fmtBRL(salesTotal)}</span>
            </div>
            <div className="mt-1 flex justify-between border-t border-pine/20 pt-1 font-serif text-lg font-bold text-pine-dark">
              <span>Total da hospedagem</span>
              <span>{fmtBRL(totalHospedagem)}</span>
            </div>
          </div>
        </section>

        <section>
          <h4 className="mb-2 font-semibold">Histórico de reclamações</h4>
          {complaints.length ? (
            <ul className="space-y-2 text-sm">
              {complaints.map((c) => (
                <li key={c.id} className="rounded-lg border border-border p-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{complaintLabel(c.categoria)}</span>
                    <Badge tone={c.status === "resolvido" ? "sage" : "brick"}>{c.status}</Badge>
                  </div>
                  {c.descricao && <p className="mt-1 text-muted-foreground">{c.descricao}</p>}
                  <p className="mt-1 text-[11px] text-muted-foreground">{fmtDate(c.created_at)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma reclamação neste quarto. 👍</p>
          )}
        </section>
      </div>
    </Modal>
  );
}
