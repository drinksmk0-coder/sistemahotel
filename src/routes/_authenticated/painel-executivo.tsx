import { createFileRoute } from "@tanstack/react-router";
import { ExecutiveDecisionDashboard } from "@/components/executive/ExecutiveDecisionDashboard";

export const Route = createFileRoute("/_authenticated/painel-executivo")({ component: PainelExecutivoRoute });

function PainelExecutivoRoute() {
  return (
    <div className="space-y-3">
      <ExecutiveDecisionDashboard />
    </div>
  );
}
