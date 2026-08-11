import { createFileRoute, Link } from "@tanstack/react-router";
import { BarChart3, Calculator } from "lucide-react";
import { ExecutiveBiDashboardReadable } from "@/components/executive/ExecutiveBiDashboardReadable";
import { DecisionAudienceIntelligence } from "@/components/executive/DecisionAudienceIntelligence";
import "@/components/executive/executive-dashboard-fixes.css";

export const Route = createFileRoute("/_authenticated/painel-executivo")({ component: PainelExecutivoRoute });

function PainelExecutivoRoute() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2 px-2 pt-1 sm:px-3">
        <Link to="/investimentos" className="inline-flex items-center gap-2 rounded-lg border border-primary bg-card px-3 py-2 text-xs font-extrabold text-primary shadow-sm transition hover:bg-muted">
          <Calculator className="h-4 w-4" /> Analisar investimento
        </Link>
        <Link to="/painel-atraente" className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-extrabold text-primary-foreground shadow-sm transition hover:opacity-90">
          <BarChart3 className="h-4 w-4" /> Abrir BI Executivo
        </Link>
      </div>
      <div className="px-2 sm:px-3"><DecisionAudienceIntelligence /></div>
      <ExecutiveBiDashboardReadable />
    </div>
  );
}
