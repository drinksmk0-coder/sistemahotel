import { createFileRoute } from "@tanstack/react-router";
import { FilteredHotelExecutiveDashboard } from "@/components/executive/FilteredHotelExecutiveDashboard";

export const Route = createFileRoute("/_authenticated/painel-executivo")({ component: PainelExecutivoRoute });

function PainelExecutivoRoute() {
  return (
    <div className="space-y-3">
      <FilteredHotelExecutiveDashboard />
    </div>
  );
}
