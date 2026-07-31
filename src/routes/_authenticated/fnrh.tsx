import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/fnrh")({
  component: FnrhRedirect,
});

function FnrhRedirect() {
  return <Navigate to="/fichas-checkin" replace />;
}
