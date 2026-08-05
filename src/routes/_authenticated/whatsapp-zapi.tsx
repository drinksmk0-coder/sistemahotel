import { createFileRoute, Link } from "@tanstack/react-router";
import { MessageCircleOff, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/AppLayout";

export const Route = createFileRoute("/_authenticated/whatsapp-zapi")({
  component: WhatsAppZApiPage,
});

function WhatsAppZApiPage() {
  return (
    <div>
      <PageHeader
        title="WhatsApp"
        subtitle="Integração opcional, sem bloquear o uso e a publicação do HospedaMais."
      />

      <section className="card-surface mx-auto max-w-3xl p-6">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
            <MessageCircleOff className="h-6 w-6" />
          </div>
          <div>
            <h2 className="font-serif text-xl font-bold text-pine-dark">
              Z-API pausada
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              A Z-API exige ativação paga da instância. Por isso, ela foi retirada do caminho crítico do sistema e não interfere em reservas, check-in, vendas, financeiro, checkout, limpeza, dashboards ou MAIVK.
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-primary/25 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <strong className="text-sm text-pine-dark">Estrutura preservada</strong>
              <p className="mt-1 text-sm text-muted-foreground">
                O conector poderá ser reativado futuramente com Z-API, WhatsApp Cloud API ou Evolution API sem alterar os dados operacionais do hotel.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link to="/integracoes" className="btn-primary">
            Voltar para Integrações
          </Link>
          <Link to="/central-estrategica" className="btn-ghost">
            Abrir Pulso do Hotel
          </Link>
        </div>
      </section>
    </div>
  );
}
