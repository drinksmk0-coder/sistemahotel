import { createFileRoute } from "@tanstack/react-router";
import { PainelAtraenteDashboardV4 } from "@/components/executive/PainelAtraenteDashboardV4";
import "./painel-atraente-v2.css";
import "./painel-atraente-v4-legend.css";

export const Route = createFileRoute("/_authenticated/painel-atraente")({
  component: PainelAtraente,
});

function PainelAtraente() {
  return <PainelAtraenteDashboardV4 />;
}
