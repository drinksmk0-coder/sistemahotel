import type { Reservation, Sale } from "@/lib/data";

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
  const lodgingTotal = positive(reservation.valor_total);
  const lodgingPaid = Math.min(lodgingTotal, positive(reservation.valor_pago));
  const extrasTotal = accountSales.reduce((sum, sale) => sum + positive(sale.total), 0);
  const extrasPaid = accountSales.reduce(
    (sum, sale) => sum + Math.min(positive(sale.total), positive(sale.valor_pago)),
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

function positive(value: unknown): number {
  return Math.max(0, Number(value) || 0);
}
