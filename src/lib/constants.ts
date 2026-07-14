// Shared option lists for the whole app.

export const PAYMENT_METHODS = [
  "dinheiro",
  "pix",
  "cartão",
  "crédito",
  "débito",
  "pendente/fiado",
] as const;

export const CLIENT_TYPES = ["hóspede", "cliente fixo", "empresa"] as const;

export const RESERVATION_STATUS = [
  "reservado",
  "ocupado",
  "finalizado",
  "cancelado",
  "manutencao",
] as const;

export const COMPLAINT_CATEGORIES = [
  { value: "wifi", label: "Wi-Fi / Internet" },
  { value: "chuveiro_frio", label: "Chuveiro frio / água quente" },
  { value: "limpeza", label: "Limpeza do quarto" },
  { value: "barulho", label: "Barulho / ruído" },
  { value: "ar_ventilacao", label: "Ar-condicionado / ventilação" },
  { value: "energia", label: "Energia / iluminação" },
  { value: "cama_colchao", label: "Cama / colchão" },
  { value: "cheiro_mofo", label: "Cheiro / mofo / umidade" },
  { value: "tv", label: "TV / controle" },
  { value: "atendimento", label: "Atendimento" },
  { value: "outros", label: "Outros" },
] as const;

export function complaintLabel(v: string): string {
  return COMPLAINT_CATEGORIES.find((c) => c.value === v)?.label ?? v;
}

export const COMPLAINT_SEVERITY = [
  { value: "baixa", label: "Baixa" },
  { value: "media", label: "Média" },
  { value: "alta", label: "Alta" },
] as const;

export const WIFI_DEVICES = [
  "Celular Android",
  "iPhone",
  "Notebook / PC",
  "Tablet",
  "Smart TV",
  "Não sei",
] as const;

export const COMPLAINT_STATUS = [
  { value: "aberto", label: "Aberto" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "resolvido", label: "Resolvido" },
] as const;

export function complaintStatusLabel(v: string): string {
  return COMPLAINT_STATUS.find((s) => s.value === v)?.label ?? v;
}

// Reasons a room may be blocked when a guest is moved out.
export const ROOM_BLOCK_REASONS = [
  { value: "limpeza", label: "Quarto sujo / precisa de limpeza" },
  { value: "chuveiro_frio", label: "Chuveiro frio / sem água quente" },
  { value: "wifi", label: "Wi-Fi sem sinal" },
  { value: "ar_ventilacao", label: "Ar-condicionado com defeito" },
  { value: "manutencao", label: "Manutenção geral" },
  { value: "outros", label: "Outro motivo" },
] as const;

// Sales channels (how the reservation arrived) — editable per reservation.
export const SALES_CHANNELS = [
  "Balcão / Direto",
  "Google",
  "Booking",
  "WhatsApp",
  "Indicação",
  "Instagram",
  "Telefone",
  "Outro",
] as const;

// Manual room situation set from the map (independent of reservations).
export const ROOM_SITUATIONS = [
  { value: "limpeza", label: "Em limpeza" },
  { value: "manutencao", label: "Em manutenção" },
] as const;

export function roomSituationLabel(v: string): string {
  return ROOM_SITUATIONS.find((s) => s.value === v)?.label ?? v;
}

export const BR_STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;
