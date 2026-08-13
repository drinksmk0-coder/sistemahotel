import { createFileRoute, Link } from "@tanstack/react-router";
import { Calculator } from "lucide-react";
import { UnifiedHotelExecutiveDashboard } from "@/components/executive/UnifiedHotelExecutiveDashboard";

export const Route = createFileRoute("/_authenticated/painel-executivo")({ component: PainelExecutivoRoute });

function PainelExecutivoRoute() {
  return (
    <div className="space-y-3">
      <div className="flex justify-end px-2 pt-1 sm:px-3">
        <Link to="/investimentos" className="inline-flex items-center gap-2 rounded-lg border border-primary bg-card px-3 py-2 text-xs font-extrabold text-primary shadow-sm transition hover:bg-muted">
          <Calculator className="h-4 w-4" /> Analisar investimento
        </Link>
      </div>
      <UnifiedHotelExecutiveDashboard />
    </div>
  );
}
