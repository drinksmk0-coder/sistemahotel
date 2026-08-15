import { isCpfExportHeader } from "@/lib/privacy";

export const HOTEL_TIME_ZONE = "America/Sao_Paulo";
export const HOTEL_DAY_CUTOFF_HOUR = 6;
export const DEFAULT_CHECKIN_TIME = "15:00";
export const DEFAULT_CHECKOUT_TIME = "12:00";

export function fmtBRL(n: number | null | undefined): string {
  const v = Number(n) || 0;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function fmtTime(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 5);
}

export function todayISO(): string {
  return localDateParts(new Date()).date;
}

export function hotelOperationalDateISO(now = new Date()): string {
  const parts = localDateParts(now);
  if (parts.hour >= HOTEL_DAY_CUTOFF_HOUR) return parts.date;
  return addDaysISO(parts.date, -1);
}

export function hotelLocalTime(now = new Date()): string {
  const parts = localDateParts(now);
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

export function addDaysISO(date: string, days: number): string {
  if (!date) return "";
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return "";
  const value = new Date(Date.UTC(year, month - 1, day));
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function nightsBetween(a?: string, b?: string): number {
  if (!a || !b) return 0;
  const d1 = new Date(`${a}T12:00:00Z`).getTime();
  const d2 = new Date(`${b}T12:00:00Z`).getTime();
  return Math.max(0, Math.round((d2 - d1) / 86400000));
}

function localDateParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: HOTEL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

// CSV UTF-8 compatível com Excel/LibreOffice, com proteção contra formula injection.
function csvCell(value: unknown): string {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n;]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function csvFilename(filename: string) {
  const normalized = filename.trim() || "dados";
  return normalized.replace(/\.(xlsx?|csv)$/i, "") + ".csv";
}

function removeCpfColumns(rows: (string | number | null)[][]) {
  if (rows.length === 0) return rows;
  const blockedIndexes = new Set<number>();
  rows[0].forEach((header, index) => {
    if (isCpfExportHeader(header)) blockedIndexes.add(index);
  });
  if (blockedIndexes.size === 0) return rows;
  return rows.map((row) => row.filter((_, index) => !blockedIndexes.has(index)));
}

export function downloadCSV(filename: string, rows: (string | number | null)[][]) {
  const safeRows = removeCpfColumns(rows);
  const content = safeRows.map((r) => r.map(csvCell).join(";")).join("\r\n");
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = csvFilename(filename);
  a.click();
  URL.revokeObjectURL(url);
}

// Compatibilidade com telas antigas: chamadas que ainda usam downloadExcel ou nome .xls
// passam a gerar CSV moderno. Não geramos mais o formato Excel 97-2003 (.xls).
export function downloadExcel(filename: string, rows: (string | number | null)[][]) {
  downloadCSV(filename, rows);
}
