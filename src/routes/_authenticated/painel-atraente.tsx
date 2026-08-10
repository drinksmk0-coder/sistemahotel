import { createFileRoute } from "@tanstack/react-router";
import { PainelAtraenteDashboardV3 } from "@/components/executive/PainelAtraenteDashboardV3";
import "./painel-atraente-v2.css";

export const Route = createFileRoute("/_authenticated/painel-atraente")({
  component: PainelAtraente,
});

function PainelAtraente() {
  return <PainelAtraenteDashboardV3 />;
}
