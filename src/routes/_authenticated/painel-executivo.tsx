import { createFileRoute } from "@tanstack/react-router";
import { ExecutiveBiDashboard } from "@/components/executive/ExecutiveBiDashboard";

export const Route = createFileRoute("/_authenticated/painel-executivo")({
  component: ExecutiveBiDashboard,
});
