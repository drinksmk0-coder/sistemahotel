// Shared option lists for the whole app.

export const PAYMENT_METHODS = [
  "dinheiro",
  "pix",
  "transferência",
  "cartão",
  "crédito",
  "débito",
  "pendente/fiado",
] as const;

export const CLIENT_TYPES = ["hóspede normal", "Potencial", "empresa", "cliente fixo", "outro"] as const;

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
  { value: "papel_higienico", label: "Papel higiênico / reposição" },
  { value: "sabonete", label: "Sabonete / reposição" },
  { value: "toalha", label: "Toalha / enxoval" },
  { value: "reposicao_quarto", label: "Reposição de quarto" },
  { value: "manutencao", label: "Manutenção" },
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

export const DDD_TO_STATE: Record<string, string> = {
  "11": "SP", "12": "SP", "13": "SP", "14": "SP", "15": "SP", "16": "SP", "17": "SP", "18": "SP", "19": "SP",
  "21": "RJ", "22": "RJ", "24": "RJ",
  "27": "ES", "28": "ES",
  "31": "MG", "32": "MG", "33": "MG", "34": "MG", "35": "MG", "37": "MG", "38": "MG",
  "41": "PR", "42": "PR", "43": "PR", "44": "PR", "45": "PR", "46": "PR",
  "47": "SC", "48": "SC", "49": "SC",
  "51": "RS", "53": "RS", "54": "RS", "55": "RS",
  "61": "DF",
  "62": "GO", "64": "GO",
  "63": "TO",
  "65": "MT", "66": "MT",
  "67": "MS",
  "68": "AC",
  "69": "RO",
  "71": "BA", "73": "BA", "74": "BA", "75": "BA", "77": "BA",
  "79": "SE",
  "81": "PE", "87": "PE",
  "82": "AL",
  "83": "PB",
  "84": "RN",
  "85": "CE", "88": "CE",
  "86": "PI", "89": "PI",
  "91": "PA", "93": "PA", "94": "PA",
  "92": "AM", "97": "AM",
  "95": "RR",
  "96": "AP",
  "98": "MA", "99": "MA",
};

export function stateFromPhone(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  const local = digits.startsWith("55") ? digits.slice(2) : digits;
  const ddd = local.slice(0, 2);
  return DDD_TO_STATE[ddd] ?? null;
}
