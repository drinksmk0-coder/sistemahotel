import { useState } from "react";
import { toast } from "sonner";
import { CreditCard, ShoppingBasket } from "lucide-react";
import { PAYMENT_METHODS } from "@/lib/constants";
import { useRegisterGuestPayment } from "@/lib/data";
import type { GuestAccount } from "@/lib/guest-account";
import { fmtBRL } from "@/lib/format";
import { Field, Modal } from "@/components/ui-kit";

interface GuestPaymentModalProps {
  account: GuestAccount;
  onClose: () => void;
}

export function GuestPaymentModal({ account, onClose }: GuestPaymentModalProps) {
  const payment = useRegisterGuestPayment();
  const [amount, setAmount] = useState(account.balance);
  const [method, setMethod] = useState<string>(PAYMENT_METHODS[0]);
  const [notes, setNotes] = useState("");
  const dailySuggested = Math.min(
    account.balance,
    Math.max(0, Number(account.reservation.valor_diaria) || 0),
  );
  const received = Math.min(account.balance, Math.max(0, Number(amount) || 0));
  const remaining = Math.max(0, account.balance - received);

  return (
    <Modal open onClose={onClose} title={`Receber conta — ${account.reservation.cliente_nome}`}>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (received <= 0) return toast.error("Informe um valor maior que zero.");
          payment.mutate(
            {
              reservationId: account.reservation.id,
              amount: received,
              method,
              notes,
            },
            {
              onSuccess: () => {
                toast.success(
                  remaining > 0
                    ? `Pagamento registrado. Ainda faltam ${fmtBRL(remaining)}.`
                    : "Conta do hóspede quitada.",
                );
                onClose();
              },
              onError: (error: Error) => toast.error(error.message),
            },
          );
        }}
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <AccountMetric label="Diárias" value={account.lodgingTotal} />
          <AccountMetric label="Consumos" value={account.extrasTotal} />
          <AccountMetric label="Já recebido" value={account.paid} />
          <AccountMetric label="Saldo" value={account.balance} attention />
        </div>

        {account.sales.length > 0 && (
          <div className="max-h-40 overflow-y-auto rounded-lg border border-border">
            <div className="sticky top-0 flex items-center gap-2 bg-card px-3 py-2 text-xs font-bold uppercase text-muted-foreground">
              <ShoppingBasket className="h-3.5 w-3.5" />
              Consumos vinculados ao quarto
            </div>
            <ul className="divide-y divide-border/60 text-sm">
              {account.sales.map((sale) => (
                <li key={sale.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span>
                    {sale.qtd}× {sale.item}
                  </span>
                  <span className="font-semibold">{fmtBRL(sale.total)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {account.balance > 0 && (
          <div className="rounded-xl border border-border bg-muted/35 p-3">
            <div className="text-xs font-black uppercase tracking-wide text-muted-foreground">
              Hospedagem estendida / pagamento diário
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Registre somente o valor recebido hoje. O restante continua aberto para os próximos dias.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {dailySuggested > 0 && (
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  onClick={() => {
                    setAmount(dailySuggested);
                    if (!notes.trim()) setNotes("Pagamento parcial da hospedagem — parcela do dia");
                  }}
                >
                  Receber 1 diária · {fmtBRL(dailySuggested)}
                </button>
              )}
              <button
                type="button"
                className="btn-ghost text-xs"
                onClick={() => setAmount(account.balance)}
              >
                Usar saldo total · {fmtBRL(account.balance)}
              </button>
            </div>
          </div>
        )}

        <Field label="Valor recebido agora">
          <input
            type="number"
            min={0.01}
            max={account.balance}
            step="0.01"
            className="field"
            value={amount}
            onChange={(event) => setAmount(Number(event.target.value))}
            required
          />
        </Field>

        <Field label="Forma de pagamento">
          <select
            className="field"
            value={method}
            onChange={(event) => setMethod(event.target.value)}
          >
            {PAYMENT_METHODS.map((paymentMethod) => (
              <option key={paymentMethod} value={paymentMethod}>
                {paymentMethod}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Observação (opcional)">
          <textarea
            className="field min-h-16"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={300}
            placeholder="Ex.: parcela diária recebida na recepção"
          />
        </Field>

        <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm">
          <span className="text-muted-foreground">Saldo depois deste pagamento</span>
          <strong className={remaining > 0 ? "text-brick" : "text-pine-dark"}>
            {fmtBRL(remaining)}
          </strong>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            className="btn-primary flex items-center gap-2"
            disabled={payment.isPending}
          >
            <CreditCard className="h-4 w-4" />
            {payment.isPending
              ? "Registrando…"
              : remaining > 0
                ? "Registrar parcial"
                : "Quitar conta"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AccountMetric({
  label,
  value,
  attention = false,
}: {
  label: string;
  value: number;
  attention?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-2.5 py-2 ${attention ? "border-brick/35 bg-brick-bg" : "border-border bg-muted/40"}`}
    >
      <p className="text-[10px] font-bold uppercase text-muted-foreground">{label}</p>
      <p className={`font-serif font-bold ${attention ? "text-brick" : "text-pine-dark"}`}>
        {fmtBRL(value)}
      </p>
    </div>
  );
}
