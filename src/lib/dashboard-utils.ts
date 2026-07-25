import { type Expense, type Reservation, type Room, type Sale } from "@/lib/data";

export type DashboardPeriod = "dia" | "mes" | "ano";

export interface DateRange {
  start: string;
  end: string;
}

export interface HotelKpis {
  operationalRooms: number;
  periodDays: number;
  availableRoomNights: number;
  soldRoomNights: number;
  lodgingRevenue: number;
  extraRevenue: number;
  totalRevenue: number;
  operatingExpenses: number;
  grossOperatingProfit: number;
  occupancyRate: number;
  adr: number;
  revpar: number;
  trevpar: number;
  goppar: number;
}

export function periodRange(period: DashboardPeriod, today: string, offset = 0): DateRange {
  const date = new Date(`${today}T12:00:00`);
  if (period === "dia") date.setDate(date.getDate() + offset);
  if (period === "mes") date.setMonth(date.getMonth() + offset);
  if (period === "ano") date.setFullYear(date.getFullYear() + offset);

  if (period === "dia") {
    const key = localISO(date);
    return { start: key, end: key };
  }
  if (period === "mes") {
    const start = new Date(date.getFullYear(), date.getMonth(), 1, 12);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 12);
    return { start: localISO(start), end: localISO(end) };
  }
  return {
    start: `${date.getFullYear()}-01-01`,
    end: `${date.getFullYear()}-12-31`,
  };
}

export function rangeDays(range: DateRange): number {
  return Math.max(
    1,
    Math.round(
      (new Date(`${range.end}T12:00:00`).getTime() -
        new Date(`${range.start}T12:00:00`).getTime()) /
        86_400_000,
    ) + 1,
  );
}

export function inRange(value: string | null | undefined, range: DateRange): boolean {
  const key = String(value ?? "").slice(0, 10);
  return Boolean(key && key >= range.start && key <= range.end);
}

export function reservationOverlapsRange(reservation: Reservation, range: DateRange): boolean {
  if (!reservation.checkin || !reservation.checkout) return false;
  return reservation.checkin <= range.end && reservation.checkout > range.start;
}

export function calculateHotelKpis({
  rooms,
  reservations,
  sales,
  expenses,
  range,
}: {
  rooms: Room[];
  reservations: Reservation[];
  sales: Sale[];
  expenses: Expense[];
  range: DateRange;
}): HotelKpis {
  const operationalRooms = rooms.filter(
    (room) => normalizeText(String(room.situacao ?? "")) !== "manutencao",
  ).length;
  const periodDays = rangeDays(range);
  const availableRoomNights = operationalRooms * periodDays;

  const soldReservations = reservations.filter(
    (reservation) =>
      isCommercialReservation(reservation) && reservationOverlapsRange(reservation, range),
  );
  const soldRoomNights = soldReservations.reduce(
    (sum, reservation) => sum + roomNights(reservation, range),
    0,
  );
  const lodgingRevenue = soldReservations.reduce((sum, reservation) => {
    const totalNights = roomNights(reservation);
    const nightsInRange = roomNights(reservation, range);
    const reservationValue = Math.max(0, Number(reservation.valor_total) || 0);
    return sum + (totalNights > 0 ? reservationValue * (nightsInRange / totalNights) : 0);
  }, 0);
  const extraRevenue = sales
    .filter((sale) => inRange(sale.data, range))
    .reduce((sum, sale) => sum + saleRevenue(sale), 0);
  const totalRevenue = lodgingRevenue + extraRevenue;
  const operatingExpenses = expenses
    .filter((expense) => inRange(expense.data, range))
    .reduce((sum, expense) => sum + Math.max(0, Number(expense.valor) || 0), 0);
  const grossOperatingProfit = totalRevenue - operatingExpenses;

  return {
    operationalRooms,
    periodDays,
    availableRoomNights,
    soldRoomNights,
    lodgingRevenue,
    extraRevenue,
    totalRevenue,
    operatingExpenses,
    grossOperatingProfit,
    occupancyRate: percent(soldRoomNights, availableRoomNights),
    adr: safeDivide(lodgingRevenue, soldRoomNights),
    revpar: safeDivide(lodgingRevenue, availableRoomNights),
    trevpar: safeDivide(totalRevenue, availableRoomNights),
    goppar: safeDivide(grossOperatingProfit, availableRoomNights),
  };
}

export function reservationRevenue(reservation: Reservation): number {
  if (reservation.status === "cancelado" || reservation.status === "manutencao") return 0;
  return Math.max(0, Number(reservation.valor_total) || 0);
}

export function reservationReceived(reservation: Reservation): number {
  if (reservation.status === "cancelado" || reservation.status === "manutencao") return 0;
  return Math.max(0, Number(reservation.valor_pago) || 0);
}

export function saleRevenue(sale: Sale): number {
  return Math.max(0, Number(sale.total) || 0);
}

export function saleReceived(sale: Sale): number {
  return Math.max(0, Number(sale.valor_pago) || 0);
}

export function expensesTotal(expenses: Expense[]): number {
  return expenses.reduce((sum, expense) => sum + Math.max(0, Number(expense.valor) || 0), 0);
}

export function percentChange(current: number, previous: number): number | null {
  if (!previous) return current ? 100 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function percent(part: number, total: number): number {
  return total > 0 ? (part / total) * 100 : 0;
}

export function normalizeLabel(
  value: string | null | undefined,
  fallback = "Não informado",
): string {
  const clean = String(value ?? "").trim();
  return clean || fallback;
}

export function normalizeChannel(value: string | null | undefined): string {
  const channel = normalizeText(value || "direto");
  if (channel.includes("booking")) return "Booking";
  if (channel.includes("airbnb")) return "Airbnb";
  if (channel.includes("whats")) return "WhatsApp";
  if (channel.includes("insta")) return "Instagram";
  if (channel.includes("site")) return "Site";
  if (channel.includes("boca")) return "Boca a boca";
  return "Direto";
}

export function isOtaChannel(value: string | null | undefined): boolean {
  const channel = normalizeChannel(value);
  return channel === "Booking" || channel === "Airbnb";
}

export function otaCommissionRate(value: string | null | undefined): number {
  const channel = normalizeChannel(value);
  if (channel === "Booking") return 0.13;
  if (channel === "Airbnb") return 0.03;
  return 0;
}

export function lastMonths(today: string, count = 12): { key: string; label: string }[] {
  const base = new Date(`${today.slice(0, 7)}-01T12:00:00`);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(base.getFullYear(), base.getMonth() - (count - 1 - index), 1, 12);
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
    };
  });
}

export function roomNights(reservation: Reservation, range?: DateRange): number {
  if (reservation.status === "cancelado" || reservation.status === "manutencao") return 0;
  const start = range && reservation.checkin < range.start ? range.start : reservation.checkin;
  const endBoundary = range ? addDays(range.end, 1) : reservation.checkout;
  const end = reservation.checkout > endBoundary ? endBoundary : reservation.checkout;
  if (!start || !end || end <= start) return 0;
  return Math.max(
    1,
    Math.round(
      (new Date(`${end}T12:00:00`).getTime() - new Date(`${start}T12:00:00`).getTime()) /
        86_400_000,
    ),
  );
}

function isCommercialReservation(reservation: Reservation): boolean {
  const status = normalizeText(String(reservation.status ?? ""));
  if (
    status.includes("cancel") ||
    status.includes("manutencao") ||
    status.includes("cortesia") ||
    status.includes("interno")
  ) {
    return false;
  }
  return Math.max(0, Number(reservation.valor_total) || 0) > 0;
}

function safeDivide(value: number, divider: number): number {
  return divider > 0 ? value / divider : 0;
}

export function localISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localISO(date);
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
