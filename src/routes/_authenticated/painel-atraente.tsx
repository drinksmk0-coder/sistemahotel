import { createFileRoute } from "@tanstack/react-router";
import { PainelAtraenteDashboard } from "@/components/executive/PainelAtraenteDashboard";
import "./painel-atraente-v2.css";

export const Route = createFileRoute("/_authenticated/painel-atraente")({
  component: PainelAtraente,
});

function PainelAtraente() {
  return <PainelAtraenteDashboard />;
}
