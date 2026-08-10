import { createFileRoute, Link } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";
import { ExecutiveBiDashboardReadable } from "@/components/executive/ExecutiveBiDashboardReadable";
import "@/components/executive/executive-dashboard-fixes.css";

export const Route = createFileRoute("/_authenticated/painel-executivo")({
  component: PainelExecutivoRoute,
});

function PainelExecutivoRoute() {
  return (
    <div className="space-y-2">
      <div className="flex justify-end px-2 pt-1 sm:px-3">
        <Link
          to="/painel-atraente"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-extrabold text-primary-foreground shadow-sm transition hover:opacity-90"
        >
          <BarChart3 className="h-4 w-4" />
          Abrir BI Executivo
        </Link>
      </div>
      <ExecutiveBiDashboardReadable />
    </div>
  );
}