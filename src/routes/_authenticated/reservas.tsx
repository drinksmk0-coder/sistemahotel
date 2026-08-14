import { createFileRoute } from "@tanstack/react-router";
import { ReservasModern } from "@/components/ReservasModern";

export const Route = createFileRoute("/_authenticated/reservas")({
  component: ReservasModern,
});
