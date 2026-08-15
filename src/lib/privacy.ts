export function maskCpf(value: string | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits ? "•••.•••.•••-••" : "não informado";
}

export function guestPrivacyId(id: string | null | undefined) {
  const compact = String(id ?? "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return compact ? `HSP-${compact.slice(0, 12)}` : "HSP-NÃO-GERADO";
}

export function isCpfExportHeader(value: unknown) {
  const normalized = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  return normalized === "cpf" || normalized.includes("cadastro de pessoa fisica");
}
