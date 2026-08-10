export type FnrhPrintData = {
  status: string;
  submitted_at: string | null;
  form_data: Record<string, string>;
  signature_data_url: string | null;
  company_name: string;
  company_document?: string | null;
  company_email?: string | null;
  company_phone?: string | null;
  company_address?: string | null;
  company_city?: string | null;
  company_state?: string | null;
  reservation_code: string;
  room: number;
  checkin: string;
  checkout: string;
  adults: number;
  children: number;
  guest?: Record<string, string | null>;
};

type StoredFnrhPrintSession = {
  saved_at: number;
  data: FnrhPrintData;
};

const STORAGE_KEY = "hospedamais:fnrh-print:v1";
const MAX_AGE_MS = 15 * 60 * 1000;

export function saveFnrhPrintSession(data: FnrhPrintData) {
  if (typeof window === "undefined") return false;

  try {
    const stored: StoredFnrhPrintSession = {
      saved_at: Date.now(),
      data,
    };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    return true;
  } catch {
    return false;
  }
}

export function loadFnrhPrintSession(): FnrhPrintData | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const stored = JSON.parse(raw) as Partial<StoredFnrhPrintSession>;
    if (
      typeof stored.saved_at !== "number" ||
      Date.now() - stored.saved_at > MAX_AGE_MS ||
      !stored.data ||
      stored.data.status !== "preenchido" ||
      typeof stored.data.company_name !== "string" ||
      typeof stored.data.form_data !== "object" ||
      !stored.data.form_data ||
      typeof stored.data.signature_data_url !== "string" ||
      !stored.data.signature_data_url.startsWith("data:image/png;base64,")
    ) {
      clearFnrhPrintSession();
      return null;
    }

    return stored.data;
  } catch {
    clearFnrhPrintSession();
    return null;
  }
}

export function clearFnrhPrintSession() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Falha fechada: a rota de impressão não usa token público como fallback.
  }
}
