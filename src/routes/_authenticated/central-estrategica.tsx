import { createFileRoute } from "@tanstack/react-router";
import { PulsoHotelDashboard } from "@/components/PulsoHotelDashboard";

export const Route = createFileRoute("/_authenticated/central-estrategica")({
  component: PulsoHotelDashboard,
});
