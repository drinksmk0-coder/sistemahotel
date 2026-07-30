import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Field, Modal } from "@/components/ui-kit";
import { hasActiveOverlap, type RateRule, type Reservation, type Room } from "@/lib/data";
import { SALES_CHANNELS } from "@/lib/constants";
import {
  addDaysISO,
  DEFAULT_CHECKIN_TIME,
  DEFAULT_CHECKOUT_TIME,
  fmtBRL,
  hotelLocalTime,
  hotelOperationalDateISO,
  nightsBetween,
} from "@/lib/format";
import { quoteStay } from "@/lib/rates";

type GroupRoom = {
  key: number;
  roomNumber: number;
  guests: number;
};

export type GroupReservationPayload = {
  group: {
    nome: string;
    responsavel_nome: string;
    responsavel_telefone: string | null;
    checkin: string;
    checkout: string;
    canal: string;
    observacoes: string | null;
    status: "ativo";
  };
  reservations: {
    quarto: number;
    cliente_id: null;
    cliente_nome: string;
    data_reserva: string;
    checkin: string;
    checkout: string;
    horario_reserva: string;
    horario_checkin: string;
    horario_checkout: string;
    diarias: number;
    valor_diaria: number;
    valor_total: number;
    valor_pago: number;
    desconto: number;
    pessoas: number;
    canal: string;
    pagamento: string;
    pago: boolean;
    status: string;
  }[];
};

export function GroupReservationForm({
  rooms,
  reservations,
  rateRules,
  onClose,
  onSave,
  busy,
}: {
  rooms: Room[];
  reservations: Reservation[];
  rateRules: RateRule[];
  onClose: () => void;
  onSave: (payload: GroupReservationPayload) => void;
  busy?: boolean;
}) {
  const operationalDate = hotelOperationalDateISO();
  const reservationTime = hotelLocalTime();
  const [nomeGrupo, setNomeGrupo] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [telefone, setTelefone] = useState("");
  const [checkin, setCheckin] = useState(operationalDate);
  const [checkout, setCheckout] = useState(addDaysISO(operationalDate, 1));
  const [canal, setCanal] = useState<string>(SALES_CHANNELS[0]);
  const [observacoes, setObservacoes] = useState("");
  const [roomRows, setRoomRows] = useState<GroupRoom[]>([
    { key: 1, roomNumber: rooms[0]?.numero ?? 0, guests: 1 },
  ]);

  const nights = nightsBetween(checkin, checkout);
  const quotedRows = useMemo(
    () =>
      roomRows.map((row) => {
        const room = rooms.find((item) => item.numero === row.roomNumber);
        const quote = quoteStay(room, rateRules, checkin, checkout, row.guests);
        const overlap = hasActiveOverlap(reservations, row.roomNumber, checkin, checkout);
        const duplicated = roomRows.filter((item) => item.roomNumber === row.roomNumber).length > 1;
        return { ...row, room, quote, overlap, duplicated };
      }),
    [checkin, checkout, rateRules, reservations, roomRows, rooms],
  );

  const total = quotedRows.reduce((sum, row) => sum + row.quote.total, 0);
  const hasConflict = quotedRows.some((row) => !row.room || row.overlap || row.duplicated);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const cleanResponsible = responsavel.trim();
    if (nights <= 0) {
      toast.error("Informe um período válido.");
      return;
    }
    if (!cleanResponsible || cleanResponsible.split(/\s+/).length < 2) {
      toast.error("Informe o nome completo do responsável.");
      return;
    }
    if (hasConflict) {
      toast.error("Corrija os quartos repetidos ou indisponíveis.");
      return;
    }

    onSave({
      group: {
        nome: nomeGrupo.trim() || `Grupo ${cleanResponsible}`,
        responsavel_nome: cleanResponsible,
        responsavel_telefone: telefone.trim() || null,
        checkin,
        checkout,
        canal,
        observacoes: observacoes.trim() || null,
        status: "ativo",
      },
      reservations: quotedRows.map((row) => ({
        quarto: row.roomNumber,
        cliente_id: null,
        cliente_nome: cleanResponsible,
        data_reserva: operationalDate,
        checkin,
        checkout,
        horario_reserva: reservationTime,
        horario_checkin: DEFAULT_CHECKIN_TIME,
        horario_checkout: DEFAULT_CHECKOUT_TIME,
        diarias: nights,
        valor_diaria: roundMoney(row.quote.averageNightly),
        valor_total: roundMoney(row.quote.total),
        valor_pago: 0,
        desconto: 0,
        pessoas: row.guests,
        canal,
        pagamento: "pendente",
        pago: false,
        status: "reservado",
      })),
    });
  }

  return (
    <Modal open onClose={onClose} title="Nova reserva em grupo">
      <form className="space-y-4" onSubmit={submit}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome do grupo">
            <input
              className="field"
              value={nomeGrupo}
              onChange={(event) => setNomeGrupo(event.target.value)}
              placeholder="Ex.: Excursão São Paulo"
              maxLength={80}
            />
          </Field>
          <Field label="Responsável pelo grupo">
            <input
              className="field"
              value={responsavel}
              onChange={(event) => setResponsavel(event.target.value.replace(/[0-9]/g, ""))}
              required
              maxLength={80}
            />
          </Field>
          <Field label="WhatsApp do responsável">
            <input
              className="field"
              value={telefone}
              onChange={(event) => setTelefone(event.target.value)}
              maxLength={20}
            />
          </Field>
          <Field label="Canal">
            <select
              className="field"
              value={canal}
              onChange={(event) => setCanal(event.target.value)}
            >
              {SALES_CHANNELS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Check-in">
            <input
              type="date"
              className="field"
              value={checkin}
              onChange={(event) => setCheckin(event.target.value)}
              required
            />
          </Field>
          <Field label="Check-out">
            <input
              type="date"
              className="field"
              value={checkout}
              onChange={(event) => setCheckout(event.target.value)}
              required
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs sm:grid-cols-4">
          <div>
            <span className="block text-muted-foreground">Data da reserva</span>
            <strong>{operationalDate}</strong>
          </div>
          <div>
            <span className="block text-muted-foreground">Horário</span>
            <strong>{reservationTime}</strong>
          </div>
          <div>
            <span className="block text-muted-foreground">Check-in padrão</span>
            <strong>{DEFAULT_CHECKIN_TIME}</strong>
          </div>
          <div>
            <span className="block text-muted-foreground">Check-out padrão</span>
            <strong>{DEFAULT_CHECKOUT_TIME}</strong>
          </div>
          <p className="col-span-2 leading-relaxed text-muted-foreground sm:col-span-4">
            Entre 00:00 e 05:59, a data operacional continua sendo a do dia anterior. A mudança ocorre às 06:00.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-muted/30 p-3">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="font-bold">Quartos do grupo</h3>
              <p className="text-xs text-muted-foreground">
                A tarifa é calculada por quarto, data e quantidade de hóspedes.
              </p>
            </div>
            <button
              type="button"
              className="btn-ghost flex items-center gap-1 text-xs"
              onClick={() =>
                setRoomRows((current) => [
                  ...current,
                  {
                    key: Math.max(0, ...current.map((item) => item.key)) + 1,
                    roomNumber:
                      rooms.find((room) => !current.some((item) => item.roomNumber === room.numero))
                        ?.numero ??
                      rooms[0]?.numero ??
                      0,
                    guests: 1,
                  },
                ])
              }
            >
              <Plus className="h-3.5 w-3.5" />
              Adicionar quarto
            </button>
          </div>

          <div className="space-y-2">
            {quotedRows.map((row, index) => (
              <div
                key={row.key}
                className={`grid items-end gap-2 rounded-lg border bg-card p-2 sm:grid-cols-[1fr_110px_1fr_auto] ${
                  row.overlap || row.duplicated ? "border-brick" : "border-border"
                }`}
              >
                <Field label={`Quarto ${index + 1}`}>
                  <select
                    className="field"
                    value={row.roomNumber}
                    onChange={(event) =>
                      updateRoom(row.key, { roomNumber: Number(event.target.value) })
                    }
                  >
                    {rooms.map((room) => (
                      <option key={`${room.company_id}-${room.numero}`} value={room.numero}>
                        {room.numero} — {room.configuracao}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Pessoas">
                  <input
                    type="number"
                    min={1}
                    className="field"
                    value={row.guests}
                    onChange={(event) =>
                      updateRoom(row.key, {
                        guests: Math.max(1, Number(event.target.value) || 1),
                      })
                    }
                  />
                </Field>
                <div className="pb-2 text-sm">
                  <strong>{fmtBRL(row.quote.total)}</strong>
                  <span className="block text-xs text-muted-foreground">
                    {row.overlap
                      ? "Indisponível no período"
                      : row.duplicated
                        ? "Quarto repetido"
                        : `${nights} diária(s) · média ${fmtBRL(row.quote.averageNightly)}`}
                  </span>
                </div>
                <button
                  type="button"
                  className="mb-1 rounded-md bg-brick-bg p-2 text-brick disabled:opacity-40"
                  disabled={roomRows.length === 1}
                  onClick={() =>
                    setRoomRows((current) => current.filter((item) => item.key !== row.key))
                  }
                  title="Remover quarto"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <Field label="Observações">
          <textarea
            className="field min-h-20"
            value={observacoes}
            onChange={(event) => setObservacoes(event.target.value)}
            maxLength={500}
          />
        </Field>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-sage-bg p-3">
          <div>
            <span className="block text-xs text-muted-foreground">Total do grupo</span>
            <strong className="font-serif text-xl text-pine-dark">{fmtBRL(total)}</strong>
          </div>
          <span className="text-sm font-semibold text-pine-dark">
            {roomRows.length} quarto(s) · {nights} diária(s)
          </span>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={busy || hasConflict || nights <= 0}
          >
            {busy ? "Salvando..." : "Criar reservas do grupo"}
          </button>
        </div>
      </form>
    </Modal>
  );

  function updateRoom(key: number, patch: Partial<GroupRoom>) {
    setRoomRows((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  }
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
