import type { Client, Reservation, Sale } from "@/lib/data";

export type GuestAccount = {
  reservation: Reservation;
  sales: Sale[];
  lodgingTotal: number;
  lodgingPaid: number;
  extrasTotal: number;
  extrasPaid: number;
  total: number;
  paid: number;
  balance: number;
};

export type LoyaltyTier = "Ouro" | "Prata" | "Bronze";

export type ClientInsight = {
  client: Client;
  reservations: Reservation[];
  sales: Sale[];
  visits: number;
  totalCharged: number;
  totalPaid: number;
  averageSpend: number;
  favoritePayment: string;
  favoriteRoom: string;
  favoriteProduct: string;
  favoriteWeekday: string;
  tier: LoyaltyTier;
};

export function salesForReservation(sales: Sale[], reservation: Reservation): Sale[] {
  return sales.filter(
    (sale) =>
      sale.reserva_id === reservation.id ||
      (sale.reserva_id == null &&
        sale.quarto === reservation.quarto &&
        sale.data >= reservation.checkin &&
        sale.data <= reservation.checkout),
  );
}

export function buildGuestAccount(reservation: Reservation, sales: Sale[]): GuestAccount {
  const accountSales = salesForReservation(sales, reservation);
  const lodgingTotal = positiveNumber(reservation.valor_total);
  const lodgingPaid = Math.min(lodgingTotal, positiveNumber(reservation.valor_pago));
  const extrasTotal = accountSales.reduce((sum, sale) => sum + positiveNumber(sale.total), 0);
  const extrasPaid = accountSales.reduce(
    (sum, sale) => sum + Math.min(positiveNumber(sale.total), positiveNumber(sale.valor_pago)),
    0,
  );
  const total = lodgingTotal + extrasTotal;
  const paid = lodgingPaid + extrasPaid;

  return {
    reservation,
    sales: accountSales,
    lodgingTotal,
    lodgingPaid,
    extrasTotal,
    extrasPaid,
    total,
    paid,
    balance: Math.max(0, total - paid),
  };
}

export function buildClientInsights(
  clients: Client[],
  reservations: Reservation[],
  sales: Sale[],
): Map<string, ClientInsight> {
  const reservationById = new Map(reservations.map((reservation) => [reservation.id, reservation]));
  const activeReservations = reservations.filter(
    (reservation) => reservation.status !== "cancelado" && reservation.status !== "manutencao",
  );
  const base = clients.map((client) => {
    const clientReservations = activeReservations.filter(
      (reservation) => reservation.cliente_id === client.id,
    );
    const clientReservationIds = new Set(clientReservations.map((reservation) => reservation.id));
    const clientSales = sales.filter((sale) => {
      if (sale.cliente_id === client.id) return true;
      if (!sale.reserva_id) return false;
      return clientReservationIds.has(sale.reserva_id);
    });
    const lodgingCharged = clientReservations.reduce(
      (sum, reservation) => sum + positiveNumber(reservation.valor_total),
      0,
    );
    const lodgingPaid = clientReservations.reduce(
      (sum, reservation) =>
        sum +
        Math.min(positiveNumber(reservation.valor_total), positiveNumber(reservation.valor_pago)),
      0,
    );
    const extrasCharged = clientSales.reduce((sum, sale) => sum + positiveNumber(sale.total), 0);
    const extrasPaid = clientSales.reduce(
      (sum, sale) => sum + Math.min(positiveNumber(sale.total), positiveNumber(sale.valor_pago)),
      0,
    );
    const visits = clientReservations.length;
    const payments = [
      ...clientReservations.map((reservation) => reservation.pagamento),
      ...clientSales.map((sale) => sale.pagamento),
    ];
    const rooms = clientReservations.map((reservation) => String(reservation.quarto));
    const products = clientSales.flatMap((sale) =>
      Array.from({ length: Math.max(1, Number(sale.qtd) || 1) }, () => sale.item),
    );
    const weekdays = clientReservations.map((reservation) => weekdayLabel(reservation.checkin));

    return {
      client,
      reservations: clientReservations,
      sales: clientSales,
      visits,
      totalCharged: lodgingCharged + extrasCharged,
      totalPaid: lodgingPaid + extrasPaid,
      averageSpend: visits > 0 ? (lodgingCharged + extrasCharged) / visits : 0,
      favoritePayment: mostFrequent(payments) || "Não identificado",
      favoriteRoom: mostFrequent(rooms) || "Sem preferência",
      favoriteProduct: mostFrequent(products) || "Sem consumo registrado",
      favoriteWeekday: mostFrequent(weekdays) || "Sem histórico",
      tier: "Bronze" as LoyaltyTier,
    };
  });

  const ranked = [...base].sort(
    (a, b) =>
      b.totalCharged + b.visits * 100 - (a.totalCharged + a.visits * 100) ||
      a.client.nome.localeCompare(b.client.nome),
  );
  const activeCount = ranked.filter(
    (insight) => insight.visits > 0 || insight.totalCharged > 0,
  ).length;
  const goldLimit = activeCount > 0 ? Math.max(1, Math.ceil(activeCount * 0.2)) : 0;
  const silverLimit = activeCount > 0 ? Math.max(goldLimit + 1, Math.ceil(activeCount * 0.5)) : 0;
  const tierByClient = new Map<string, LoyaltyTier>();
  ranked.forEach((insight, index) => {
    const hasHistory = insight.visits > 0 || insight.totalCharged > 0;
    const tier: LoyaltyTier =
      hasHistory && index < goldLimit
        ? "Ouro"
        : hasHistory && index < silverLimit
          ? "Prata"
          : "Bronze";
    tierByClient.set(insight.client.id, tier);
  });

  return new Map(
    base.map((insight) => [
      insight.client.id,
      { ...insight, tier: tierByClient.get(insight.client.id) ?? "Bronze" },
    ]),
  );
}

export function saleClientId(sale: Sale, reservationById: Map<string, Reservation>): string | null {
  return (
    sale.cliente_id ??
    (sale.reserva_id ? reservationById.get(sale.reserva_id)?.cliente_id : null) ??
    null
  );
}

function positiveNumber(value: unknown): number {
  return Math.max(0, Number(value) || 0);
}

function mostFrequent(values: Array<string | null | undefined>): string {
  const counts = new Map<string, number>();
  values.forEach((value) => {
    const normalized = String(value ?? "").trim();
    if (!normalized || normalized === "-") return;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  });
  return (
    [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? ""
  );
}

function weekdayLabel(iso: string): string {
  const labels = [
    "domingo",
    "segunda-feira",
    "terça-feira",
    "quarta-feira",
    "quinta-feira",
    "sexta-feira",
    "sábado",
  ];
  return labels[new Date(`${iso}T12:00:00`).getDay()] ?? "";
}
