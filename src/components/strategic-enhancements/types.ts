export type NumericRow = { name: string; value: number; share?: number; revenue?: number };
export type ProductRow = {
  name: string;
  quantity: number;
  revenue: number;
  averagePrice: number;
  share?: number;
};
export type FinancialRow = {
  label: string;
  date: string;
  receita: number;
  despesas: number;
  gop: number;
};
export type StrategicSummary = {
  occupancyRate: number;
  lodgingRevenue: number;
  salesRevenue: number;
  revenue: number;
  expenses: number;
  gop: number;
  margin: number;
  adr: number;
  revpar: number;
  cancellations: number;
  noShows: number;
  averageStay: number;
  averageRating: number;
  guestCount: number;
  recurringGuests: number;
  newGuests: number;
  retentionRate: number;
  recurringRevenue: number;
  newGuestRevenue: number;
  averageGuestRevenue: number;
  productTicket: number;
};
export type StrategicData = {
  summary: StrategicSummary;
  financialSeries: FinancialRow[];
  channelRows: NumericRow[];
  roomTypeRows: NumericRow[];
  expenseRows: NumericRow[];
  productRows: ProductRow[];
  productCategoryRows: NumericRow[];
  paymentRows: NumericRow[];
  revenueMixRows: NumericRow[];
  originRows: NumericRow[];
  ageRows: NumericRow[];
  reasonRows: NumericRow[];
};
export type ChannelRow = {
  name: string;
  reservations: number;
  cancellations: number;
  confirmedReservations: number;
  grossRevenue: number;
  receivedRevenue: number;
  commissionRate: number;
  estimatedCommission: number;
  netRevenue: number;
  averageTicket: number;
};
export type ChannelTotals = {
  totalReservations: number;
  bookingReservations: number;
  directReservations: number;
  cancellations: number;
  grossRevenue: number;
  bookingRevenue: number;
  directRevenue: number;
  estimatedCommission: number;
  bookingCommission: number;
  netRevenue: number;
  bookingDependencyReservations: number;
  bookingDependencyRevenue: number;
  bookingAverageTicket: number;
  directAverageTicket: number;
};
export type ChannelSeriesRow = {
  date: string;
  label: string;
  bookingRevenue: number;
  directRevenue: number;
  bookingReservations: number;
  directReservations: number;
};
export type ChannelData = {
  currentRange: { start: string; end: string };
  previousRange: { start: string; end: string };
  current: ChannelTotals;
  previous: ChannelTotals;
  currentRows: ChannelRow[];
  previousRows: ChannelRow[];
  series: ChannelSeriesRow[];
  commissionDisclosure: string;
};
export type Trend = {
  direction: "up" | "down" | "flat" | "unknown";
  percent: number | null;
  favorable: boolean | null;
};
export type Story = {
  trend: Trend;
  headline: string;
  why: string;
  impact: string;
  action: string;
  confidence: "alta" | "média" | "baixa";
  aiPrompt: string;
};
export type AiState = {
  title: string;
  answer: string;
  loading: boolean;
  error: string;
} | null;

export function emptyChannelData(): ChannelData {
  const totals: ChannelTotals = {
    totalReservations: 0,
    bookingReservations: 0,
    directReservations: 0,
    cancellations: 0,
    grossRevenue: 0,
    bookingRevenue: 0,
    directRevenue: 0,
    estimatedCommission: 0,
    bookingCommission: 0,
    netRevenue: 0,
    bookingDependencyReservations: 0,
    bookingDependencyRevenue: 0,
    bookingAverageTicket: 0,
    directAverageTicket: 0,
  };
  return {
    currentRange: { start: "", end: "" },
    previousRange: { start: "", end: "" },
    current: totals,
    previous: { ...totals },
    currentRows: [],
    previousRows: [],
    series: [],
    commissionDisclosure:
      "Comissão estimada: Booking 13% e Airbnb 3%. Substituir pelo valor real quando a integração oficial estiver ativa.",
  };
}
