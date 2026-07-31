import { useState } from "react";
import { Building2 } from "lucide-react";
import { toast } from "sonner";
import { Modal, Field } from "@/components/ui-kit";
import { addDaysISO, fmtBRL, todayISO } from "@/lib/format";
import type { Reservation } from "@/lib/data";

export type CompanyBillingCheckout = {
  billing_responsibility: "company";
  billing_company_name: string;
  billing_company_document: string | null;
  billing_company_email: string | null;
  billing_due_date: string;
  billing_status: "pending";
};

export function CompanyBillingCheckoutModal({
  reservation,
  balance,
  onClose,
  onConfirm,
  busy,
}: {
  reservation: Reservation;
  balance: number;
  onClose: () => void;
  onConfirm: (billing: CompanyBillingCheckout) => void;
  busy: boolean;
}) {
  const saved = reservation as Reservation & {
    billing_company_name?: string | null;
    billing_company_document?: string | null;
    billing_company_email?: string | null;
    billing_due_date?: string | null;
  };
  const [companyName, setCompanyName] = useState(saved.billing_company_name ?? "");
  const [document, setDocument] = useState(saved.billing_company_document ?? "");
  const [email, setEmail] = useState(saved.billing_company_email ?? "");
  const [dueDate, setDueDate] = useState(
    saved.billing_due_date ?? addDaysISO(todayISO(), 30),
  );
  const [confirmed, setConfirmed] = useState(false);

  return (
    <Modal open onClose={onClose} title="Faturar saldo para empresa">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (companyName.trim().length < 3) {
            toast.error("Informe o nome da empresa responsável pelo pagamento.");
            return;
          }
          if (!dueDate || dueDate < todayISO()) {
            toast.error("Informe uma data de vencimento válida.");
            return;
          }
          if (!confirmed) {
            toast.error("Confirme que a empresa autorizou o faturamento.");
            return;
          }
          onConfirm({
            billing_responsibility: "company",
            billing_company_name: companyName.trim(),
            billing_company_document: document.trim() || null,
            billing_company_email: email.trim() || null,
            billing_due_date: dueDate,
            billing_status: "pending",
          });
        }}
      >
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="font-bold text-foreground">Saldo a faturar: {fmtBRL(balance)}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                O check-out será concluído e o quarto seguirá para limpeza. O saldo não será marcado
                como pago: continuará em “A receber da empresa” até a baixa financeira.
              </p>
            </div>
          </div>
        </div>

        <Field label="Empresa responsável">
          <input
            className="field"
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
            maxLength={120}
            placeholder="Razão social ou nome da empresa"
            required
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="CNPJ / documento">
            <input
              className="field"
              value={document}
              onChange={(event) => setDocument(event.target.value)}
              maxLength={30}
              placeholder="Opcional"
            />
          </Field>
          <Field label="Vencimento">
            <input
              className="field"
              type="date"
              value={dueDate}
              min={todayISO()}
              onChange={(event) => setDueDate(event.target.value)}
              required
            />
          </Field>
        </div>

        <Field label="E-mail para cobrança">
          <input
            className="field"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            maxLength={160}
            placeholder="financeiro@empresa.com.br"
          />
        </Field>

        <label className="flex items-start gap-2 rounded-lg border border-border bg-muted/50 p-3 text-sm">
          <input
            className="mt-1"
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span>
            Confirmo que a empresa autorizou o faturamento e que os dados acima serão usados para
            cobrança. Esta ação não registra pagamento.
          </span>
        </label>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "Concluindo…" : "Faturar e fazer check-out"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
