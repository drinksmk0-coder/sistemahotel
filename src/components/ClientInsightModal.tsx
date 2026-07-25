import { BedDouble, CalendarDays, CreditCard, Crown, ShoppingBasket } from "lucide-react";
import type { ClientInsight, LoyaltyTier } from "@/lib/guest-account";
import { fmtBRL, fmtDate } from "@/lib/format";
import { Modal } from "@/components/ui-kit";

interface ClientInsightModalProps {
  insight: ClientInsight;
  onClose: () => void;
}

export function ClientInsightModal({ insight, onClose }: ClientInsightModalProps) {
  return (
    <Modal open onClose={onClose} title={`Perfil 360º — ${insight.client.nome}`}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2">
          <div>
            <p className="text-xs font-bold uppercase text-muted-foreground">
              Segmento de relacionamento
            </p>
            <TierBadge tier={insight.tier} />
          </div>
          <p className="max-w-sm text-right text-xs text-muted-foreground">
            A classificação considera frequência e gasto em comparação com os demais clientes do
            próprio hotel.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <ProfileMetric label="Visitas" value={String(insight.visits)} />
          <ProfileMetric label="Valor consumido" value={fmtBRL(insight.totalCharged)} />
          <ProfileMetric label="Valor recebido" value={fmtBRL(insight.totalPaid)} />
          <ProfileMetric label="Média por visita" value={fmtBRL(insight.averageSpend)} />
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Preference
            icon={<CreditCard />}
            label="Pagamento preferido"
            value={insight.favoritePayment}
          />
          <Preference icon={<BedDouble />} label="Quarto preferido" value={insight.favoriteRoom} />
          <Preference
            icon={<ShoppingBasket />}
            label="Produto preferido"
            value={insight.favoriteProduct}
          />
          <Preference
            icon={<CalendarDays />}
            label="Dia mais frequente"
            value={insight.favoriteWeekday}
          />
        </div>

        <section className="rounded-lg border border-border">
          <h3 className="border-b border-border px-3 py-2 text-sm font-bold">
            Histórico recente de hospedagens
          </h3>
          {insight.reservations.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">Nenhuma hospedagem vinculada.</p>
          ) : (
            <ul className="max-h-44 divide-y divide-border/60 overflow-y-auto text-sm">
              {insight.reservations.slice(0, 12).map((reservation) => (
                <li key={reservation.id} className="flex justify-between gap-3 px-3 py-2">
                  <span>
                    Quarto {reservation.quarto} · {fmtDate(reservation.checkin)} até{" "}
                    {fmtDate(reservation.checkout)}
                  </span>
                  <strong>{fmtBRL(reservation.valor_total)}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-border">
          <h3 className="border-b border-border px-3 py-2 text-sm font-bold">
            Produtos e serviços consumidos
          </h3>
          {insight.sales.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">Nenhum consumo vinculado.</p>
          ) : (
            <ul className="max-h-44 divide-y divide-border/60 overflow-y-auto text-sm">
              {insight.sales.slice(0, 20).map((sale) => (
                <li key={sale.id} className="flex justify-between gap-3 px-3 py-2">
                  <span>
                    {sale.qtd}× {sale.item} · quarto {sale.quarto}
                  </span>
                  <strong>{fmtBRL(sale.total)}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  );
}

export function TierBadge({ tier }: { tier: LoyaltyTier }) {
  const tone = {
    Ouro: "border-[#a87900]/30 bg-[#f7e6a5] text-[#684a00]",
    Prata: "border-slate/25 bg-slate-bg text-slate",
    Bronze: "border-[#9a4d24]/25 bg-[#efd2c0] text-[#783615]",
  }[tier];
  return (
    <span
      className={`mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-bold ${tone}`}
    >
      <Crown className="h-3.5 w-3.5" />
      Cliente {tier}
    </span>
  );
}

function ProfileMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <p className="text-[10px] font-bold uppercase text-muted-foreground">{label}</p>
      <p className="font-serif text-lg font-bold text-pine-dark">{value}</p>
    </div>
  );
}

function Preference({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
      <span className="rounded-md bg-sage-bg p-2 text-pine-dark">{icon}</span>
      <div>
        <p className="text-[10px] font-bold uppercase text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}
