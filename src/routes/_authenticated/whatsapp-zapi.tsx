import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppLayout";
import { ZApiIntegrationPanel } from "@/components/ZApiIntegrationPanel";
import { useCurrentCompany } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/whatsapp-zapi")({
  component: WhatsAppZApiPage,
});

function WhatsAppZApiPage() {
  const current = useCurrentCompany();

  return (
    <div>
      <PageHeader
        title="WhatsApp Z-API"
        subtitle="Conecte o WhatsApp do hotel, gere o QR Code e prepare o atendimento automático pelo MAIVK."
      />
      <ZApiIntegrationPanel companyId={current.data?.id} />
    </div>
  );
}
