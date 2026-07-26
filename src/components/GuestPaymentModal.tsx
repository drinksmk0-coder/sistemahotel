import { useState } from "react";
import { CreditCard, ShoppingBasket } from "lucide-react";
import { toast } from "sonner";
import { PAYMENT_METHODS } from "@/lib/constants";
import { useRegisterGuestPayment } from "@/lib/data";
import type { GuestAccount } from "@/lib/guest-account";
import { fmtBRL } from "@/lib/format";
import { Field, Modal } from "@/components/ui-kit";

export function GuestPaymentModal({
  account,
  onClose,
}: {
  account: GuestAccount;
  onClose: () => void;
}) {
  const payment = useRegisterGuestPayment();
  const [amount, setAmount] = useState(account.balance);
  const [method, setMethod] = useState<string>(PAYMENT_METHODS[0]);
  const [notes, setNotes] = useState("");
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
                    ? `Pagamento parcial registrado. Falta ${fmtBRL(remaining)}.`
                    : "Conta completa quitada.",
                );
                onClose();
              },
              onError: (error: Error) => toast.error(error.message),
            },
          );
        }}
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label="Diárias" value={account.lodgingTotal} />
          <Metric label="Consumos" value={account.extrasTotal} />
          <Metric label="Recebido" value={account.paid} />
          <Metric label="Saldo total" value={account.balance} attention />
        </div>

        {account.sales.length > 0 && (
          <div className="max-h-40 overflow-y-auto rounded-lg border border-border">
            <div className="sticky top-0 flex items-center gap-2 bg-card px-3 py-2 text-xs font-bold uppercase text-muted-foreground">
              <ShoppingBasket className="h-3.5 w-3.5" />
              Produtos e serviços da conta
            </div>
            <ul className="divide-y divide-border/60 text-sm">
              {account.sales.map((sale) => (
                <li key={sale.id} className="flex justify-between gap-3 px-3 py-2">
                  <span>{sale.qtd}× {sale.item}</span>
                  <strong>{fmtBRL(sale.total)}</strong>
                </li>
              ))}
            </ul>
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
          <select className="field" value={method} onChange={(event) => setMethod(event.target.value)}>
            {PAYMENT_METHODS.map((item) => <option key={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="Observação">
          <textarea
            className="field min-h-16"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Ex.: segunda parcela recebida no check-out"
          />
        </Field>

        <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm">
          <span>Saldo após o pagamento</span>
          <strong className={remaining > 0 ? "text-brick" : "text-pine"}>
            {fmtBRL(remaining)}
          </strong>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary flex items-center gap-2" disabled={payment.isPending}>
            <CreditCard className="h-4 w-4" />
            {payment.isPending ? "Registrando…" : remaining > 0 ? "Registrar parcial" : "Quitar conta"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Metric({
  label,
  value,
  attention = false,
}: {
  label: string;
  value: number;
  attention?: boolean;
}) {
  return (
    <div className={`rounded-lg border px-2.5 py-2 ${attention ? "border-brick/35 bg-brick-bg" : "border-border bg-muted/40"}`}>
      <p className="text-[10px] font-bold uppercase text-muted-foreground">{label}</p>
      <p className={`font-serif font-bold ${attention ? "text-brick" : "text-pine-dark"}`}>
        {fmtBRL(value)}
      </p>
    </div>
  );
}
