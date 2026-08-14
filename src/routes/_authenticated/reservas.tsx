import { createFileRoute } from "@tanstack/react-router";
import { ReservasModernV2 } from "@/components/ReservasModernV2";

export const Route = createFileRoute("/_authenticated/reservas")({
  component: ReservasModernV2,
});
