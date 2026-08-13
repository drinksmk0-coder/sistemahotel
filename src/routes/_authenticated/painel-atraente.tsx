import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/painel-atraente")({
  component: PainelAtraenteRedirect,
});

function PainelAtraenteRedirect() {
  return <Navigate to="/painel-executivo" replace />;
}
