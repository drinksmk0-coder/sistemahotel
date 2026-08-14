import { createFileRoute } from "@tanstack/react-router";
import { ReservasModernV2 } from "@/components/ReservasModernV2";
import "./reservas-responsive-v2.css";

export const Route = createFileRoute("/_authenticated/reservas")({
  component: ReservasResponsiveRoute,
});

function ReservasResponsiveRoute() {
  return (
    <div className="reservas-responsive-shell">
      <ReservasModernV2 />
    </div>
  );
}
