import { useState } from "react";
import { toast } from "sonner";
import {
  hasActiveOverlap,
  roomBlock,
  statusFromPayment,
  type Reservation,
  type Client,
  type Room,
  type Complaint,
} from "@/lib/data";
import { fmtBRL, todayISO, nightsBetween } from "@/lib/format";
import { BR_STATES, CLIENT_TYPES, PAYMENT_METHODS, SALES_CHANNELS, complaintLabel } from "@/lib/constants";
import { Modal, Field } from "@/components/ui-kit";

export type ReservaRow = {
  quarto: number;
  cliente_id: string | null;
  cliente_nome: string;
  cliente_telefone?: string | null;
  cliente_tipo?: string | null;
  cliente_data_nascimento?: string | null;
  cliente_sexo?: string | null;
  cliente_cidade?: string | null;
  cliente_estado?: string | null;
  cliente_bairro?: string | null;
  cliente_estado_civil?: string | null;
  cliente_tem_filhos?: boolean | null;
  cliente_quantidade_filhos?: number | null;
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
  motivo_estadia: string | null;
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
  initialCheckin,
  onClose,
  onSave,
}: {
  rooms: Room[];
  clients: Client[];
  reservations: Reservation[];
  complaints: Complaint[];
  editing?: Reservation | null;
  fixedRoom?: number;
  initialCheckin?: string;
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
  const initialCheckinValue = editing?.checkin ?? initialCheckin ?? todayISO();
  const initialCheckoutValue = editing?.checkout ?? (initialCheckin ? addDaysISO(initialCheckin, 1) : "");
  const [quarto, setQuarto] = useState<number>(initRoom);
  const [clienteId, setClienteId] = useState(editing?.cliente_id ?? "");
  const [nome, setNome] = useState(editing && !editing.cliente_id ? editing.cliente_nome : "");
  const [telefone, setTelefone] = useState("");
  const [tipoCliente, setTipoCliente] = useState<string>("hóspede normal");
  const [nascimento, setNascimento] = useState("");
  const [sexo, setSexo] = useState("");
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("MG");
  const [bairro, setBairro] = useState("");
  const [estadoCivil, setEstadoCivil] = useState("");
  const [temFilhos, setTemFilhos] = useState(false);
  const [quantidadeFilhos, setQuantidadeFilhos] = useState("0");
  const [checkin, setCheckin] = useState(initialCheckinValue);
  const [checkout, setCheckout] = useState(initialCheckoutValue);
  const [horarioReserva, setHorarioReserva] = useState(editing?.horario_reserva?.slice(0, 5) ?? "");
  const [horarioCheckin, setHorarioCheckin] = useState(editing?.horario_checkin?.slice(0, 5) ?? "");
  const [horarioCheckout, setHorarioCheckout] = useState(editing?.horario_checkout?.slice(0, 5) ?? "");
  const [diarias, setDiarias] = useState<string>(
    String(editing?.diarias ?? nightsBetween(initialCheckinValue, initialCheckoutValue)),
  );
  const [valorDiaria, setValorDiaria] = useState<string>(
    numberInput(editing?.valor_diaria ?? rooms.find((r) => r.numero === initRoom)?.preco ?? 0),
  );
  const [pagamento, setPagamento] = useState<string>(editing?.pagamento ?? PAYMENT_METHODS[0]);
  const [valorPago, setValorPago] = useState<string>(numberInput(editing?.valor_pago));
  const [desconto, setDesconto] = useState<string>(numberInput(editing?.desconto));
  const [pessoas, setPessoas] = useState<string>(String(editing?.pessoas ?? 1));
  const [canal, setCanal] = useState<string>(editing?.canal ?? SALES_CHANNELS[0]);
  const [motivoEstadia, setMotivoEstadia] = useState(editing?.motivo_estadia ?? "");
  const [override, setOverride] = useState(false);

  const nights = Math.max(0, parseIntNumber(diarias));
  const diariaValor = parseNumber(valorDiaria);
  const descontoValor = parseNumber(desconto);
  const valorPagoNumber = parseNumber(valorPago);
  const bruto = nights * diariaValor;
  const total = Math.max(0, bruto - descontoValor);
  const overlap =
    quarto && checkin && checkout && hasActiveOverlap(reservations, quarto, checkin, checkout, editing?.id);
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
      cliente_telefone: clienteId ? null : telefone.trim() || null,
      cliente_tipo: clienteId ? null : tipoCliente,
      cliente_data_nascimento: clienteId ? null : nascimento || null,
      cliente_sexo: clienteId ? null : sexo || null,
      cliente_cidade: clienteId ? null : cidade.trim() || null,
      cliente_estado: clienteId ? null : estado || null,
      cliente_bairro: clienteId ? null : bairro.trim() || null,
      cliente_estado_civil: clienteId ? null : estadoCivil || null,
      cliente_tem_filhos: clienteId ? null : temFilhos,
      cliente_quantidade_filhos: clienteId || !temFilhos ? null : parseIntNumber(quantidadeFilhos),
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
      motivo_estadia: motivoEstadia.trim() || null,
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
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nome do hóspede">
                <input className="field" value={nome} onChange={(e) => setNome(e.target.value)} required maxLength={80} />
              </Field>
              <Field label="Telefone">
                <input className="field" value={telefone} onChange={(e) => setTelefone(e.target.value)} maxLength={30} />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Tipo de hóspede">
                <select className="field" value={tipoCliente} onChange={(e) => setTipoCliente(e.target.value)}>
                  {CLIENT_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </Field>
              <Field label="Nascimento">
                <input type="date" className="field" value={nascimento} onChange={(e) => setNascimento(e.target.value)} />
              </Field>
              <Field label="Sexo">
                <select className="field" value={sexo} onChange={(e) => setSexo(e.target.value)}>
                  <option value="">—</option>
                  <option value="feminino">Feminino</option>
                  <option value="masculino">Masculino</option>
                  <option value="outro">Outro</option>
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Cidade">
                <input className="field" value={cidade} onChange={(e) => setCidade(e.target.value)} maxLength={60} />
              </Field>
              <Field label="UF">
                <select className="field" value={estado} onChange={(e) => setEstado(e.target.value)}>
                  {BR_STATES.map((uf) => (
                    <option key={uf} value={uf}>{uf}</option>
                  ))}
                </select>
              </Field>
              <Field label="Bairro">
                <input className="field" value={bairro} onChange={(e) => setBairro(e.target.value)} maxLength={80} />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Estado civil">
                <select className="field" value={estadoCivil} onChange={(e) => setEstadoCivil(e.target.value)}>
                  <option value="">—</option>
                  <option value="solteiro">Solteiro(a)</option>
                  <option value="casado">Casado(a)</option>
                  <option value="divorciado">Divorciado(a)</option>
                  <option value="viuvo">Viúvo(a)</option>
                  <option value="uniao_estavel">União estável</option>
                </select>
              </Field>
              <Field label="Tem filhos?">
                <select className="field" value={temFilhos ? "sim" : "nao"} onChange={(e) => setTemFilhos(e.target.value === "sim")}>
                  <option value="nao">Não</option>
                  <option value="sim">Sim</option>
                </select>
              </Field>
              <Field label="Qtd. filhos">
                <input
                  className="field"
                  inputMode="numeric"
                  value={quantidadeFilhos}
                  disabled={!temFilhos}
                  onChange={(e) => setQuantidadeFilhos(e.target.value.replace(/\D/g, ""))}
                />
              </Field>
            </div>
          </>
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

        <Field label="Motivo da estadia">
          <select className="field" value={motivoEstadia} onChange={(e) => setMotivoEstadia(e.target.value)}>
            <option value="">—</option>
            <option value="trabalho">Trabalho</option>
            <option value="lazer">Lazer</option>
            <option value="familia">Família</option>
            <option value="evento">Evento</option>
            <option value="saude">Saúde</option>
            <option value="outro">Outro</option>
          </select>
        </Field>

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

function addDaysISO(date: string, days: number) {
  const current = new Date(`${date}T00:00:00`);
  current.setDate(current.getDate() + days);
  return current.toISOString().slice(0, 10);
}
