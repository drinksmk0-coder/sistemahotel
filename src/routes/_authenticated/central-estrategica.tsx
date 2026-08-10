import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/central-estrategica")({
  component: CentralEstrategicaRedirect,
});

function CentralEstrategicaRedirect() {
  return <Navigate to="/painel-atraente" replace />;
}
