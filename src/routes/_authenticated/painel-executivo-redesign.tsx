import { createFileRoute } from "@tanstack/react-router";
import { ExecutiveBiDashboardPremium } from "@/components/executive/ExecutiveBiDashboardPremium";
import "@/components/executive/executive-dashboard-fixes.css";

export const Route = createFileRoute("/_authenticated/painel-executivo-redesign")({
  component: ExecutiveBiDashboardPremium,
});
