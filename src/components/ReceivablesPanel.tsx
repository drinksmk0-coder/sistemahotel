import { useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  MessageCircle,
} from "lucide-react";
import {
  type Client,
  type Reservation,
  type ReservationFinancialState,
  type Sale,
} from "@/lib/data";
import { fmtBRL, fmtDate, todayISO } from "@/lib/format";
import { buildGuestAccount } from "@/lib/guest-account";

interface ReceivablesPanelProps {
  reservations: Reservation[];
  clients: Client[];
  sales: Sale[];
  compact?: boolean;
}

interface ReceivableRow {
  reservation: Reservation;
  client?: Client;
  total: number;
  paid: number;
  balance: number;
  daysOverdue: number;
  state: ReservationFinancialState;
  lodgingTotal: number;
  extrasTotal: number;
}

export function ReceivablesPanel({
  reservations,
  clients,
  sales,
  compact = false,
}: ReceivablesPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const today = todayISO();
  const clientsById = new Map(clients.map((client) => [client.id, client]));
  const rows = reservations
    .filter(
      (reservation) => reservation.status !== "cancelado" && reservation.status !== "manutencao",
    )
    .map((reservation): ReceivableRow => {
      const account = buildGuestAccount(reservation, sales);
      const daysOverdue =
        reservation.checkout < today ? differenceInCalendarDays(today, reservation.checkout) : 0;
      const state = accountState(reservation, account.paid, account.balance, today);
      return {
        reservation,
        client: reservation.cliente_id ? clientsById.get(reservation.cliente_id) : undefined,
        total: account.total,
        paid: account.paid,
        balance: account.balance,
        daysOverdue,
        state,
        lodgingTotal: account.lodgingTotal,
        extrasTotal: account.extrasTotal,
      };
    })
    .filter((row) => row.balance > 0)
    .sort((a, b) => {
      if (a.daysOverdue !== b.daysOverdue) return b.daysOverdue - a.daysOverdue;
      return a.reservation.checkout.localeCompare(b.reservation.checkout);
    });

  const totalPaid = rows.reduce((sum, row) => sum + row.paid, 0);
  const totalBalance = rows.reduce((sum, row) => sum + row.balance, 0);
  const partialRows = rows.filter((row) => row.state === "pagamento_parcial");
  const expiredStayRows = rows.filter((row) => row.state === "estadia_vencida");
  const checkoutDebtRows = rows.filter((row) => row.state === "checkout_com_saldo");
  const expiredBookingRows = rows.filter((row) => row.state === "reserva_vencida");
  const visibleRows = compact && !expanded ? rows.slice(0, 5) : rows;
  const statusCards = [
    {
      label: "Pagamento parcial",
      rows: partialRows,
      hint: `${partialRows.length} reserva(s)`,
      tone: "brass" as const,
    },
    {
      label: "Estadia vencida",
      rows: expiredStayRows,
      hint: `${expiredStayRows.length} ainda ocupada(s)`,
      tone: "brick" as const,
    },
    {
      label: "Checkout com saldo",
      rows: checkoutDebtRows,
      hint: `${checkoutDebtRows.length} encerrada(s)`,
      tone: "brick" as const,
    },
    {
      label: "Reserva vencida",
      rows: expiredBookingRows,
      hint: `${expiredBookingRows.length} sem check-in`,
      tone: "pine" as const,
    },
  ].filter((card) => card.rows.length > 0);

  return (
    <section className="rounded-lg border border-brass/40 bg-card p-3 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-pine-dark">
            <CircleDollarSign className="h-4 w-4 text-brass" />
            Clientes com saldo pendente
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Pagamentos parciais, estadias vencidas e checkouts concluídos sem quitação.
          </p>
        </div>
        <span className="rounded-full bg-brick-bg px-2.5 py-1 text-xs font-bold text-brick">
          {rows.length} pendência(s)
        </span>
      </div>

      <div
        className="grid grid-cols-2 gap-2 lg:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]"
      >
        <ReceivableKpi
          label="Total a receber"
          value={fmtBRL(totalBalance)}
          hint={`${fmtBRL(totalPaid)} já recebido`}
          tone="brick"
        />
        {statusCards.map((card) => (
          <ReceivableKpi
            key={card.label}
            label={card.label}
            value={fmtBRL(card.rows.reduce((sum, row) => sum + row.balance, 0))}
            hint={card.hint}
            tone={card.tone}
          />
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="mt-3 rounded-md bg-sage-bg px-3 py-2 text-sm text-pine-dark">
          Nenhuma reserva com saldo pendente.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[760px] text-xs">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-3 font-semibold">Cliente</th>
                <th className="py-2 pr-3 font-semibold">Reserva</th>
                <th className="py-2 pr-3 font-semibold">Situação</th>
                <th className="py-2 pr-3 text-right font-semibold">Total</th>
                <th className="py-2 pr-3 text-right font-semibold">Pago</th>
                <th className="py-2 pr-3 text-right font-semibold">Saldo</th>
                <th className="py-2 text-right font-semibold">Cobrança</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const phone = normalizePhone(row.client?.telefone);
                const message = collectionMessage(row);
                return (
                  <tr key={row.reservation.id} className="border-b border-border/60">
                    <td className="py-2 pr-3">
                      <strong className="block text-pine-dark">
                        {row.reservation.cliente_nome}
                      </strong>
                      <span className="text-muted-foreground">
                        {row.client?.telefone || "Sem telefone"}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <span className="block font-semibold">Quarto {row.reservation.quarto}</span>
                      <span className="text-muted-foreground">
                        checkout {fmtDate(row.reservation.checkout)}
                      </span>
                      <span className="block text-[10px] text-muted-foreground">
                        Diárias {fmtBRL(row.lodgingTotal)} + consumo {fmtBRL(row.extrasTotal)}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-wrap gap-1">
                        <FinancialStatusChip state={row.state} />
                        {row.daysOverdue >= 7 && (
                          <StatusChip
                            icon={<AlertTriangle />}
                            label={`${row.daysOverdue} dias vencida`}
                            tone="brick"
                          />
                        )}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-right">{fmtBRL(row.total)}</td>
                    <td className="py-2 pr-3 text-right text-sage">{fmtBRL(row.paid)}</td>
                    <td className="py-2 pr-3 text-right font-bold text-brick">
                      {fmtBRL(row.balance)}
                    </td>
                    <td className="py-2 text-right">
                      {phone ? (
                        <a
                          href={`https://wa.me/${phone}?text=${encodeURIComponent(message)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-md bg-[#25D366] px-2 py-1.5 font-bold text-white hover:brightness-95"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          Cobrar
                        </a>
                      ) : (
                        <span className="text-muted-foreground">Cadastre o telefone</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {compact && rows.length > 5 && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mx-auto mt-2 flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-[10px] font-bold text-pine-dark shadow-sm hover:bg-muted"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" /> Mostrar somente as primeiras
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" /> Ver todas as {rows.length} pendências
            </>
          )}
        </button>
      )}

      {expiredStayRows.length + checkoutDebtRows.length + expiredBookingRows.length > 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Reservas vencidas permanecem visíveis até a baixa do pagamento. Finalizar o checkout não
          elimina o saldo a receber.
        </p>
      )}
    </section>
  );
}

function ReceivableKpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "pine" | "brass" | "brick";
}) {
  const toneClass = {
    pine: "border-t-pine bg-pine/5",
    brass: "border-t-brass bg-brass/10",
    brick: "border-t-brick bg-brick/10",
  }[tone];
  return (
    <article
      className={`min-w-0 rounded-md border border-border border-t-4 px-2.5 py-2 ${toneClass}`}
    >
      <p className="truncate text-[10px] font-bold uppercase text-muted-foreground">{label}</p>
      <p className="truncate font-serif text-base font-bold text-pine-dark">{value}</p>
      <p className="truncate text-[10px] text-muted-foreground">{hint}</p>
    </article>
  );
}

function StatusChip({
  icon,
  label,
  tone,
}: {
  icon?: React.ReactNode;
  label: string;
  tone: "pine" | "sage" | "brass" | "brick";
}) {
  const toneClass = {
    pine: "bg-pine/10 text-pine",
    sage: "bg-sage-bg text-pine-dark",
    brass: "bg-brass/15 text-pine-dark",
    brick: "bg-brick-bg text-brick",
  }[tone];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${toneClass}`}
    >
      {icon && <span className="[&>svg]:h-3 [&>svg]:w-3">{icon}</span>}
      {label}
    </span>
  );
}

function FinancialStatusChip({ state }: { state: ReservationFinancialState }) {
  const statuses: Record<
    ReservationFinancialState,
    { label: string; tone: "pine" | "sage" | "brass" | "brick"; icon?: React.ReactNode }
  > = {
    quitada: { label: "quitada", tone: "sage" },
    reserva_futura: { label: "reserva futura", tone: "pine" },
    pagamento_parcial: { label: "pagamento parcial", tone: "sage" },
    reserva_vencida: {
      label: "reserva vencida sem check-in",
      tone: "brass",
      icon: <CalendarClock />,
    },
    estadia_vencida: {
      label: "estadia vencida / ainda ocupada",
      tone: "brick",
      icon: <AlertTriangle />,
    },
    checkout_com_saldo: {
      label: "checkout concluído com saldo",
      tone: "brick",
      icon: <CircleDollarSign />,
    },
  };
  const status = statuses[state];
  return <StatusChip {...status} />;
}

function normalizePhone(phone: string | null | undefined): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("55") ? digits : `55${digits}`;
}

function collectionMessage(row: ReceivableRow): string {
  const context = {
    quitada: "",
    reserva_futura: "referente à sua reserva",
    pagamento_parcial: "restante do pagamento parcial da sua hospedagem",
    reserva_vencida: "referente à reserva cuja data de saída já venceu",
    estadia_vencida: "referente à hospedagem com diária vencida",
    checkout_com_saldo: "pendente após a conclusão do checkout",
  }[row.state];
  return [
    `Olá, ${row.reservation.cliente_nome}!`,
    `Identificamos um saldo de ${fmtBRL(row.balance)} ${context}, no quarto ${row.reservation.quarto}, com checkout em ${fmtDate(row.reservation.checkout)}.`,
    `Conta total: ${fmtBRL(row.total)} (diárias ${fmtBRL(row.lodgingTotal)} + consumo ${fmtBRL(row.extrasTotal)}). Valor já pago: ${fmtBRL(row.paid)}.`,
    "Podemos ajudar com a regularização do pagamento?",
  ].join("\n\n");
}

function accountState(
  reservation: Reservation,
  paid: number,
  balance: number,
  today: string,
): ReservationFinancialState {
  if (balance <= 0) return "quitada";
  if (reservation.status === "finalizado") return "checkout_com_saldo";
  if (reservation.status === "ocupado" && reservation.checkout < today) return "estadia_vencida";
  if (reservation.status === "reservado" && reservation.checkout < today) return "reserva_vencida";
  if (paid > 0) return "pagamento_parcial";
  return "reserva_futura";
}

function differenceInCalendarDays(laterISO: string, earlierISO: string): number {
  const later = new Date(`${laterISO}T12:00:00`);
  const earlier = new Date(`${earlierISO}T12:00:00`);
  return Math.max(0, Math.round((later.getTime() - earlier.getTime()) / 86_400_000));
}
