import { useMemo, useState } from "react";
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
import { BR_STATES, CLIENT_TYPES, PAYMENT_METHODS, SALES_CHANNELS, complaintLabel, stateFromPhone } from "@/lib/constants";
import { Modal, Field } from "@/components/ui-kit";

export type ReservaRow = {
  quarto: number;
  cliente_id: string | null;
  cliente_nome: string;
  cliente_telefone?: string | null;
  cliente_email?: string | null;
  cliente_cpf?: string | null;
  cliente_tipo?: string | null;
  cliente_data_nascimento?: string | null;
  cliente_sexo?: string | null;
  cliente_profissao?: string | null;
  cliente_cidade?: string | null;
  cliente_estado?: string | null;
  cliente_cep?: string | null;
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
  const [email, setEmail] = useState("");
  const [cpf, setCpf] = useState("");
  const [tipoCliente, setTipoCliente] = useState<string>("hóspede normal");
  const [nascimento, setNascimento] = useState("");
  const [sexo, setSexo] = useState("");
  const [profissao, setProfissao] = useState("");
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("MG");
  const [cep, setCep] = useState("");
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
  const effectiveStatus = editing?.status === "ocupado" ? "ocupado" : status;
  const selectedClient = clients.find((c) => c.id === clienteId);
  const clientSuggestions = useMemo(() => {
    const query = nome.trim().toLowerCase();
    if (clienteId || query.length < 2) return [];
    return clients
      .filter((client) => client.nome.toLowerCase().includes(query))
      .slice(0, 8);
  }, [clients, clienteId, nome]);

  function selectClient(client: Client) {
    setClienteId(client.id);
    setNome(client.nome);
    setTelefone(client.telefone ?? "");
    setEmail((client as Client & { email?: string | null }).email ?? "");
    setCpf(client.cpf ?? "");
    setProfissao(client.profissao ?? "");
    setCidade(client.cidade ?? "");
    setEstado(client.estado ?? stateFromPhone(client.telefone ?? "") ?? "MG");
    setCep((client as Client & { cep?: string | null }).cep ?? "");
    setBairro(client.bairro ?? "");
    setNascimento(client.data_nascimento ?? "");
    setSexo(client.sexo ?? "");
    setEstadoCivil(client.estado_civil ?? "");
    setTemFilhos(Boolean(client.tem_filhos));
    setQuantidadeFilhos(client.quantidade_filhos != null ? String(client.quantidade_filhos) : "0");
    if ((client.tipo ?? "").toLowerCase().includes("empresa")) setPagamento("transferência");
  }

  function handlePhoneChange(value: string) {
    setTelefone(formatPhoneBR(value));
    const uf = stateFromPhone(value);
    if (uf) setEstado(uf);
  }

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
    const cli = selectedClient;
    const cleanName = normalizePersonName(cli?.nome ?? nome);
    const cleanPhone = formatPhoneBR(cli?.telefone ?? telefone);
    const cleanCpf = formatCpfBR(cli?.cpf ?? cpf);
    const requiredNascimento = cli?.data_nascimento ?? nascimento;
    const requiredEstado = cli?.estado ?? estado;
    const requiredEstadoCivil = cli?.estado_civil ?? estadoCivil;
    if (!cleanName || hasNumber(cleanName) || cleanName.split(" ").length < 2) {
      return toast.error("Informe o nome completo do hóspede, sem números.");
    }
    if (onlyDigits(cleanCpf).length !== 11) return toast.error("CPF obrigatório. Informe os 11 dígitos.");
    if (onlyDigits(cleanPhone).length < 10) return toast.error("Telefone obrigatório. Informe DDD e número.");
    if (!requiredNascimento) return toast.error("Data de nascimento obrigatória.");
    if (!requiredEstado) return toast.error("Estado obrigatório.");
    if (!requiredEstadoCivil) return toast.error("Estado civil obrigatório.");
    const wasOccupied = editing?.status === "ocupado";
    onSave({
      quarto,
      cliente_id: clienteId || null,
      cliente_nome: cleanName,
      cliente_telefone: clienteId ? null : cleanPhone || null,
      cliente_email: clienteId ? null : email.trim() || null,
      cliente_cpf: clienteId ? null : cleanCpf || null,
      cliente_tipo: clienteId ? null : tipoCliente,
      cliente_data_nascimento: clienteId ? null : requiredNascimento || null,
      cliente_sexo: clienteId ? null : sexo || null,
      cliente_profissao: clienteId ? null : profissao.trim() || null,
      cliente_cidade: clienteId ? null : cidade.trim() || null,
      cliente_estado: clienteId ? null : requiredEstado || null,
      cliente_cep: clienteId ? null : cep.trim() || null,
      cliente_bairro: clienteId ? null : bairro.trim() || null,
      cliente_estado_civil: clienteId ? null : requiredEstadoCivil || null,
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
      status: effectiveStatus,
      checkin_at:
        effectiveStatus === "ocupado"
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

        <Field label="Cliente">
          <div className="relative">
            <input
              className="field"
              value={nome}
              onChange={(e) => {
                setNome(e.target.value.replace(/[0-9]/g, ""));
                if (clienteId) setClienteId("");
              }}
              placeholder="Digite as primeiras letras do nome"
              required
              maxLength={80}
            />
            {clienteId && (
              <button
                type="button"
                className="mt-1 text-xs font-semibold text-pine"
                onClick={() => setClienteId("")}
              >
                Trocar cliente
              </button>
            )}
            {clientSuggestions.length > 0 && (
              <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-card shadow-lg">
                {clientSuggestions.map((client) => (
                  <button
                    key={client.id}
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => selectClient(client)}
                  >
                    <span className="font-semibold">{client.nome}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {[client.telefone, client.estado, client.profissao].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </Field>
        {!selectedClient && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Telefone">
                <input className="field" value={telefone} onChange={(e) => handlePhoneChange(e.target.value)} maxLength={17} required />
              </Field>
              <Field label="E-mail">
                <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} />
              </Field>
            </div>
            <Field label="CPF">
              <input className="field" value={cpf} onChange={(e) => setCpf(formatCpfBR(e.target.value))} maxLength={14} required />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Tipo de hóspede">
                <select
                  className="field"
                  value={tipoCliente}
                  onChange={(e) => {
                    setTipoCliente(e.target.value);
                    if (e.target.value.toLowerCase().includes("empresa")) setPagamento("transferência");
                  }}
                >
                  {CLIENT_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </Field>
              <Field label="Nascimento">
                <input type="date" className="field" value={nascimento} onChange={(e) => setNascimento(e.target.value)} required />
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
            <Field label="Profissão">
              <input className="field" value={profissao} onChange={(e) => setProfissao(e.target.value)} maxLength={60} />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Cidade">
                <input className="field" value={cidade} onChange={(e) => setCidade(e.target.value)} maxLength={60} />
              </Field>
              <Field label="UF">
                <select className="field" value={estado} onChange={(e) => setEstado(e.target.value)} required>
                  {BR_STATES.map((uf) => (
                    <option key={uf} value={uf}>{uf}</option>
                  ))}
                </select>
              </Field>
              <Field label="Bairro">
                <input className="field" value={bairro} onChange={(e) => setBairro(e.target.value)} maxLength={80} />
              </Field>
            </div>
            <Field label="CEP">
              <input className="field" value={cep} onChange={(e) => setCep(e.target.value)} maxLength={10} placeholder="Opcional" />
            </Field>
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
            {effectiveStatus === "ocupado" ? "ficará ocupado" : "ficará reservado"}
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

function onlyDigits(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

function hasNumber(value: string) {
  return /\d/.test(value);
}

function normalizePersonName(value: string | null | undefined) {
  return (value ?? "")
    .replace(/[0-9]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR")
    .replace(/(^|\s)(\p{L})/gu, (match) => match.toLocaleUpperCase("pt-BR"));
}

function formatCpfBR(value: string | null | undefined) {
  const digits = onlyDigits(value).slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
}

function formatPhoneBR(value: string | null | undefined) {
  const digits = onlyDigits(value).replace(/^55(?=\d{10,11}$)/, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}
