import { useState } from "react";
import { toast } from "sonner";
import {
  hasPaidOverlap,
  roomBlock,
  statusFromPayment,
  type Reservation,
  type Client,
  type Room,
  type Complaint,
} from "@/lib/data";
import { fmtBRL, todayISO, nightsBetween } from "@/lib/format";
import { PAYMENT_METHODS, SALES_CHANNELS, complaintLabel } from "@/lib/constants";
import { Modal, Field } from "@/components/ui-kit";

export type ReservaRow = {
  quarto: number;
  cliente_id: string | null;
  cliente_nome: string;
  checkin: string;
  checkout: string;
  horario_reserva: string | null;
  horario_checkin: string | null;
  horario_checkout: string | null;
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
  checkin_at: string | null;
};

export function ReservaForm({
  rooms,
  clients,
  reservations,
  complaints,
  editing,
  fixedRoom,
  onClose,
  onSave,
}: {
  rooms: Room[];
  clients: Client[];
  reservations: Reservation[];
  complaints: Complaint[];
  editing?: Reservation | null;
  fixedRoom?: number;
  onClose: () => void;
  onSave: (row: ReservaRow) => void;
}) {
  const numberInput = (value: number | null | undefined, fallback = "") =>
    value == null || Number(value) === 0 ? fallback : String(value);
  const parseNumber = (value: string) => {
    const normalized = value.replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const parseIntNumber = (value: string, fallback = 0) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const initRoom = editing?.quarto ?? fixedRoom ?? rooms[0]?.numero ?? 0;
  const [quarto, setQuarto] = useState<number>(initRoom);
  const [clienteId, setClienteId] = useState(editing?.cliente_id ?? "");
  const [nome, setNome] = useState(editing && !editing.cliente_id ? editing.cliente_nome : "");
  const [checkin, setCheckin] = useState(editing?.checkin ?? todayISO());
  const [checkout, setCheckout] = useState(editing?.checkout ?? "");
  const [horarioReserva, setHorarioReserva] = useState(
    editing?.horario_reserva?.slice(0, 5) ?? new Date().toTimeString().slice(0, 5),
  );
  const [horarioCheckin, setHorarioCheckin] = useState(editing?.horario_checkin?.slice(0, 5) ?? "14:00");
  const [horarioCheckout, setHorarioCheckout] = useState(editing?.horario_checkout?.slice(0, 5) ?? "12:00");
  const [diarias, setDiarias] = useState<string>(
    String(editing?.diarias ?? nightsBetween(editing?.checkin ?? todayISO(), editing?.checkout ?? "")),
  );
  const [valorDiaria, setValorDiaria] = useState<string>(
    numberInput(editing?.valor_diaria ?? rooms.find((r) => r.numero === initRoom)?.preco ?? 0),
  );
  const [pagamento, setPagamento] = useState<string>(editing?.pagamento ?? PAYMENT_METHODS[0]);
  const [valorPago, setValorPago] = useState<string>(numberInput(editing?.valor_pago));
  const [desconto, setDesconto] = useState<string>(numberInput(editing?.desconto));
  const [pessoas, setPessoas] = useState<string>(String(editing?.pessoas ?? 1));
  const [canal, setCanal] = useState<string>(editing?.canal ?? SALES_CHANNELS[0]);
  const [override, setOverride] = useState(false);

  const nights = Math.max(0, parseIntNumber(diarias));
  const diariaValor = parseNumber(valorDiaria);
  const descontoValor = parseNumber(desconto);
  const valorPagoNumber = parseNumber(valorPago);
  const bruto = nights * diariaValor;
  const total = Math.max(0, bruto - descontoValor);
  const overlap =
    quarto && checkin && checkout && hasPaidOverlap(reservations, quarto, checkin, checkout, editing?.id);
  const block = roomBlock(complaints, quarto);
  const blocked = !!block && !override;
  const status = statusFromPayment(total, valorPagoNumber);

  function applyDateChange(nextCheckin: string, nextCheckout: string) {
    const calculated = nightsBetween(nextCheckin, nextCheckout);
    setDiarias(calculated > 0 ? String(calculated) : "");
  }

  function setPaymentShortcut(amount: number, label: string) {
    if (!checkout || nights <= 0 || total <= 0) {
      toast.error("Informe check-in, check-out e valor da diária antes de aplicar pagamento.");
      return;
    }
    setValorPago(String(Math.min(total, Math.max(0, amount))));
    toast.success(label);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!checkout || nights <= 0) return toast.error("Informe um período válido");
    if (overlap) return toast.error("Já existe reserva ativa para este quarto no período");
    if (blocked) return toast.error("Quarto bloqueado — libere abaixo para continuar");
    const cli = clients.find((c) => c.id === clienteId);
    const wasOccupied = editing?.status === "ocupado";
    onSave({
      quarto,
      cliente_id: clienteId || null,
      cliente_nome: cli?.nome ?? nome.trim(),
      checkin,
      checkout,
      horario_reserva: horarioReserva || null,
      horario_checkin: horarioCheckin || null,
      horario_checkout: horarioCheckout || null,
      diarias: nights,
      valor_diaria: diariaValor,
      valor_total: total,
      valor_pago: valorPagoNumber,
      desconto: descontoValor,
      pessoas: Math.max(1, parseIntNumber(pessoas, 1)),
      canal,
      pagamento,
      pago: total > 0 && valorPagoNumber >= total,
      status,
      checkin_at:
        status === "ocupado"
          ? (wasOccupied ? editing?.checkin_at ?? new Date().toISOString() : new Date().toISOString())
          : editing?.checkin_at ?? null,
    });
  }

  return (
    <Modal open onClose={onClose} title={editing ? `Editar reserva — Quarto ${editing.quarto}` : "Nova reserva"}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quarto">
            <select
              className="field"
              value={quarto}
              disabled={fixedRoom != null && !editing}
              onChange={(e) => {
                const num = Number(e.target.value);
                setQuarto(num);
                setOverride(false);
                const room = rooms.find((r) => r.numero === num);
                if (room) setValorDiaria(numberInput(room.preco));
              }}
            >
              {rooms.map((r) => (
                <option key={r.numero} value={r.numero}>
                  {r.numero} — {fmtBRL(r.preco)} ({r.andar}º)
                </option>
              ))}
            </select>
          </Field>
          <Field label="Valor da diária">
            <input
              type="text"
              inputMode="decimal"
              className="field"
              value={valorDiaria}
              placeholder="0,00"
              onChange={(e) => setValorDiaria(e.target.value.replace(/[^\d,.]/g, ""))}
            />
          </Field>
        </div>

        <Field label="Cliente cadastrado (opcional)">
          <select className="field" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
            <option value="">— digitar nome manualmente —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </Field>
        {!clienteId && (
          <Field label="Nome do hóspede">
            <input className="field" value={nome} onChange={(e) => setNome(e.target.value)} required maxLength={80} />
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Check-in">
            <input
              type="date"
              className="field"
              value={checkin}
              onChange={(e) => {
                setCheckin(e.target.value);
                applyDateChange(e.target.value, checkout);
              }}
              required
            />
          </Field>
          <Field label="Check-out">
            <input
              type="date"
              className="field"
              value={checkout}
              onChange={(e) => {
                setCheckout(e.target.value);
                applyDateChange(checkin, e.target.value);
              }}
              required
            />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Horário da reserva">
            <input
              type="time"
              className="field"
              value={horarioReserva}
              onChange={(e) => setHorarioReserva(e.target.value)}
            />
          </Field>
          <Field label="Horário do check-in">
            <input
              type="time"
              className="field"
              value={horarioCheckin}
              onChange={(e) => setHorarioCheckin(e.target.value)}
            />
          </Field>
          <Field label="Horário do check-out">
            <input
              type="time"
              className="field"
              value={horarioCheckout}
              onChange={(e) => setHorarioCheckout(e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <Field label="Diárias">
            <input
              type="text"
              inputMode="numeric"
              className="field"
              value={diarias}
              placeholder="0"
              onChange={(e) => setDiarias(e.target.value.replace(/\D/g, ""))}
            />
          </Field>
          <Field label="Pessoas">
            <input
              type="text"
              inputMode="numeric"
              className="field"
              value={pessoas}
              onChange={(e) => setPessoas(e.target.value.replace(/\D/g, ""))}
            />
          </Field>
          <Field label="Desconto (R$)">
            <input
              type="text"
              inputMode="decimal"
              className="field"
              value={desconto}
              placeholder="0,00"
              onChange={(e) => setDesconto(e.target.value.replace(/[^\d,.]/g, ""))}
            />
          </Field>
          <Field label="Canal de vendas">
            <select className="field" value={canal} onChange={(e) => setCanal(e.target.value)}>
              {SALES_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Forma de pagamento">
            <select className="field" value={pagamento} onChange={(e) => setPagamento(e.target.value)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Valor já pago">
            <input
              type="text"
              inputMode="decimal"
              className="field"
              value={valorPago}
              placeholder="0,00"
              onChange={(e) => setValorPago(e.target.value.replace(/[^\d,.]/g, ""))}
            />
          </Field>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-ghost text-xs"
            onClick={() => setPaymentShortcut(Math.round((total / 2) * 100) / 100, "Metade do valor aplicada")}
          >
            Pagar metade (reserva)
          </button>
          <button
            type="button"
            className="btn-ghost text-xs"
            onClick={() => setPaymentShortcut(total, "Pagamento total aplicado")}
          >
            Pagar total (ocupado)
          </button>
        </div>

        {overlap && (
          <p className="rounded-lg bg-brick-bg px-3 py-2 text-sm text-brick">
            ⚠ Este quarto já tem reserva ativa que se sobrepõe a este período.
          </p>
        )}

        {block && (
          <div className="rounded-lg bg-brick-bg px-3 py-2 text-sm">
            <p className="font-semibold text-brick">
              ⚠ Quarto bloqueado: {complaintLabel(block.categoria)}
              {block.descricao ? ` — ${block.descricao}` : ""}
            </p>
            <p className="mt-1 text-brick">O hóspede ainda quer este quarto?</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setOverride(true)}
                className={`rounded-md px-3 py-1 text-xs font-semibold ${override ? "bg-pine text-primary-foreground" : "bg-sage-bg text-pine-dark"}`}
              >
                Sim, liberar
              </button>
              <button
                type="button"
                onClick={() => setOverride(false)}
                className={`rounded-md px-3 py-1 text-xs font-semibold ${!override ? "bg-brick text-white" : "bg-muted text-muted-foreground"}`}
              >
                Não
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2">
          <span className="text-sm text-muted-foreground">
            {nights} diária(s){descontoValor > 0 ? ` · desconto ${fmtBRL(descontoValor)}` : ""} ·{" "}
            {status === "ocupado" ? "ficará ocupado" : "ficará reservado"}
          </span>
          <span className="font-serif text-lg font-bold">
            {fmtBRL(diariaValor)} x {nights} = {fmtBRL(bruto)}
            {descontoValor > 0 ? ` · Total ${fmtBRL(total)}` : ""}
          </span>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={!!overlap || blocked}>
            {editing ? "Salvar alterações" : "Salvar reserva"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
