import { createFileRoute } from "@tanstack/react-router";
import { PainelAtraenteDashboardV5 } from "@/components/executive/PainelAtraenteDashboardV5";
import "./painel-atraente-v2.css";
import "./painel-atraente-v4-legend.css";

export const Route = createFileRoute("/_authenticated/painel-atraente")({
  component: PainelAtraente,
});

function PainelAtraente() {
  return <PainelAtraenteDashboardV5 />;
}