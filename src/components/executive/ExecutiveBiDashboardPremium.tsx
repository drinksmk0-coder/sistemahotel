import { BarChart3 } from "lucide-react";
import { ExecutiveBiDashboardReadable } from "@/components/executive/ExecutiveBiDashboardReadable";
import "@/components/executive/executive-dashboard-premium.css";

export function ExecutiveBiDashboardPremium() {
  return (
    <section className="executive-premium-shell h-full min-h-0 overflow-hidden">
      <main className="executive-premium-content">
        <div className="executive-premium-banner">
          <div className="executive-premium-heading">
            <span className="executive-premium-icon" aria-hidden="true"><BarChart3 /></span>
            <div>
              <strong>Painel Executivo — conceito visual</strong>
              <span>Mesmos dados reais, mesma lógica e gráfico principal temporal.</span>
            </div>
          </div>
          <span className="executive-premium-chip">Prévia isolada</span>
        </div>
        <ExecutiveBiDashboardReadable />
      </main>
    </section>
  );
}
