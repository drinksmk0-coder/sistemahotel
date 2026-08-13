import { createFileRoute } from "@tanstack/react-router";
import { UnifiedHotelExecutiveDashboard } from "@/components/executive/UnifiedHotelExecutiveDashboard";

export const Route = createFileRoute("/_authenticated/painel-executivo")({ component: PainelExecutivoRoute });

function PainelExecutivoRoute() {
  return (
    <div className="space-y-3">
      <UnifiedHotelExecutiveDashboard />
    </div>
  );
}
