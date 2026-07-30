import { createFileRoute } from "@tanstack/react-router";
import { StrategicManagerDashboard } from "@/components/StrategicManagerDashboard";

export const Route = createFileRoute("/_authenticated/central-estrategica")({
  component: StrategicManagerDashboard,
});
