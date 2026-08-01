import { createFileRoute } from "@tanstack/react-router";
import { ExecutiveBiDashboardReadable } from "@/components/executive/ExecutiveBiDashboardReadable";
import "@/components/executive/executive-dashboard-fixes.css";
import "@/components/executive/windows11-dashboard-preview.css";

export const Route = createFileRoute("/_authenticated/painel-executivo-windows11")({
  component: Windows11DashboardPreview,
});

function Windows11DashboardPreview() {
  return (
    <section className="windows11-dashboard-preview h-full min-h-0 overflow-y-auto">
      <div className="windows11-preview-banner">
        <div>
          <strong>Prévia visual — Windows 11</strong>
          <span className="ml-2">Mesmos dados, textos e gráficos do painel oficial.</span>
        </div>
        <span>Esta rota não substitui o dashboard atual.</span>
      </div>
      <ExecutiveBiDashboardReadable />
    </section>
  );
}
