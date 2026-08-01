import { createFileRoute } from "@tanstack/react-router";
import { ExecutiveBiDashboardSafe } from "@/components/executive/ExecutiveBiDashboardSafe";
import "@/components/executive/executive-dashboard-fixes.css";

export const Route = createFileRoute("/_authenticated/painel-executivo")({
  component: ExecutiveBiDashboardSafe,
});
