import { createFileRoute } from "@tanstack/react-router";
import { ExecutiveBiDashboardReadable } from "@/components/executive/ExecutiveBiDashboardReadable";
import "@/components/executive/executive-dashboard-fixes.css";

export const Route = createFileRoute("/_authenticated/painel-executivo")({
  component: ExecutiveBiDashboardReadable,
});
