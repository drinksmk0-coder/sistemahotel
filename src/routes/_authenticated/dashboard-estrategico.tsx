import { createFileRoute } from "@tanstack/react-router";
import { StrategicForecastDashboard } from "@/components/strategy/StrategicForecastDashboard";

export const Route = createFileRoute("/_authenticated/dashboard-estrategico")({
  component: StrategicForecastDashboard,
});
