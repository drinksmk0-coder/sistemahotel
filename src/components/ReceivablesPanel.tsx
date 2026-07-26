import { AlertTriangle, CalendarClock, CircleDollarSign, MessageCircle } from "lucide-react";
import { type Client, type Reservation, type Sale } from "@/lib/data";
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
  lodgingTotal: number;
  extrasTotal: number;
  isPartial: boolean;
  isCheckoutPending: boolean;
  isOverdueSevenDays: boolean;
}

export function ReceivablesPanel({
  reservations,
  clients,
  sales,
  compact = false,
}: ReceivablesPanelProps) {
  const today = todayISO();
  const sevenDaysAgo = dateOffsetISO(today, -7);
  const clientsById = new Map(clients.map((client) => [client.id, client]));
  const rows = reservations
    .filter((reservation) => reservation.status !== "cancelado" && reservation.status !== "manutencao")
    .map((reservation): ReceivableRow => {
      const account = buildGuestAccount(reservation, sales);
      return {
        reservation,
        client: reservation.cliente_id ? clientsById.get(reservation.cliente_id) : undefined,
        total: account.total,
        paid: account.paid,
        balance: account.balance,
        lodgingTotal: account.lodgingTotal,
        extrasTotal: account.extrasTotal,
        isPartial: account.paid > 0 && account.balance > 0,
        isCheckoutPending: reservation.checkout <= today,
        isOverdueSevenDays: reservation.checkout < sevenDaysAgo,
      };
    })
    .filter((row) => row.balance > 0)
    .sort((a, b) => {
      if (a.isOverdueSevenDays !== b.isOverdueSevenDays) return a.isOverdueSevenDays ? -1 : 1;
      return a.reservation.checkout.localeCompare(b.reservation.checkout);
    });

  const totalContracted = reservations
    .filter((reservation) => !["cancelado", "manutencao"].includes(reservation.status))
    .reduce((sum, reservation) => sum + buildGuestAccount(reservation, sales).total, 0);
  const totalPaid = rows.reduce((sum, row) => sum + row.paid, 0);
  const totalBalance = rows.reduce((sum, row) => sum + row.balance, 0);
  const partialRows = rows.filter((row) => row.isPartial);
  const checkoutRows = rows.filter((row) => row.isCheckoutPending);
  const overdueRows = rows.filter((row) => row.isOverdueSevenDays);

  return (
    <section className="rounded-lg border border-brass/40 bg-card p-3 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-pine-dark">
            <CircleDollarSign className="h-4 w-4 text-brass" />
            Clientes com saldo pendente
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Checkouts sem quitação, pagamentos parciais e reservas vencidas há mais de 7 dias.
          </p>
        </div>
        <span className="rounded-full bg-brick-bg px-2.5 py-1 text-xs font-bold text-brick">
          {rows.length} pendência(s)
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <ReceivableKpi label="Total a receber" value={fmtBRL(totalBalance)} hint={`${fmtBRL(totalPaid)} já recebido`} tone="brick" />
        <ReceivableKpi label="Receita contratada total" value={fmtBRL(totalContracted)} hint="hospedagem + consumos" tone="pine" />
        <ReceivableKpi
          label="Pagamento parcial"
          value={fmtBRL(partialRows.reduce((sum, row) => sum + row.balance, 0))}
          hint={`${partialRows.length} reserva(s)`}
          tone="brass"
        />
        <ReceivableKpi
          label="Vencidas +7 dias"
          value={fmtBRL(overdueRows.reduce((sum, row) => sum + row.balance, 0))}
          hint={`${overdueRows.length} reserva(s)`}
          tone="brick"
        />
      </div>

      {rows.length === 0 ? (
        <p className="mt-3 rounded-md bg-sage-bg px-3 py-2 text-sm text-pine-dark">
          Nenhuma reserva com saldo pendente.
        </p>
      ) : (
        <div className={`mt-3 overflow-x-auto ${compact ? "max-h-72" : "max-h-[30rem]"} overflow-y-auto`}>
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
              {rows.map((row) => {
                const phone = normalizePhone(row.client?.telefone);
                const message = collectionMessage(row);
                return (
                  <tr key={row.reservation.id} className="border-b border-border/60">
                    <td className="py-2 pr-3">
                      <strong className="block text-pine-dark">{row.reservation.cliente_nome}</strong>
                      <span className="text-muted-foreground">{row.client?.telefone || "Sem telefone"}</span>
                    </td>
                    <td className="py-2 pr-3">
                      <span className="block font-semibold">Quarto {row.reservation.quarto}</span>
                      <span className="text-muted-foreground">checkout {fmtDate(row.reservation.checkout)}</span>
                      {row.extrasTotal > 0 && (
                        <span className="block text-[10px] text-muted-foreground">
                          Diárias {fmtBRL(row.lodgingTotal)} + consumos {fmtBRL(row.extrasTotal)}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-wrap gap-1">
                        {row.isOverdueSevenDays && <StatusChip icon={<AlertTriangle />} label="+7 dias" tone="brick" />}
                        {row.isCheckoutPending && <StatusChip icon={<CalendarClock />} label="checkout pendente" tone="brass" />}
                        {row.isPartial && <StatusChip label="pagamento parcial" tone="sage" />}
                        {!row.isPartial && !row.isCheckoutPending && <StatusChip label="reserva futura" tone="pine" />}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-right">{fmtBRL(row.total)}</td>
                    <td className="py-2 pr-3 text-right text-sage">{fmtBRL(row.paid)}</td>
                    <td className="py-2 pr-3 text-right font-bold text-brick">{fmtBRL(row.balance)}</td>
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

      {checkoutRows.length > 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {checkoutRows.length} checkout(s) concluído(s) ou vencido(s) ainda possuem saldo.
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
    <article className={`min-w-0 rounded-md border border-border border-t-4 px-2.5 py-2 ${toneClass}`}>
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
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${toneClass}`}>
      {icon && <span className="[&>svg]:h-3 [&>svg]:w-3">{icon}</span>}
      {label}
    </span>
  );
}

function normalizePhone(phone: string | null | undefined): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("55") ? digits : `55${digits}`;
}

function collectionMessage(row: ReceivableRow): string {
  return [
    `Olá, ${row.reservation.cliente_nome}!`,
    `Identificamos um saldo de ${fmtBRL(row.balance)} na conta do quarto ${row.reservation.quarto}, com checkout em ${fmtDate(row.reservation.checkout)}.`,
    `Conta total: ${fmtBRL(row.total)} (diárias ${fmtBRL(row.lodgingTotal)} + consumos ${fmtBRL(row.extrasTotal)}). Valor já pago: ${fmtBRL(row.paid)}.`,
    "Podemos ajudar com a regularização do pagamento?",
  ].join("\n\n");
}

function dateOffsetISO(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
