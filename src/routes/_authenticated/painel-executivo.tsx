import { createFileRoute } from "@tanstack/react-router";
import { ExecutiveBiDashboard } from "@/components/executive/ExecutiveBiDashboard";
import "@/components/executive/executive-dashboard-fixes.css";

export const Route = createFileRoute("/_authenticated/painel-executivo")({
  component: ExecutiveBiDashboard,
});
