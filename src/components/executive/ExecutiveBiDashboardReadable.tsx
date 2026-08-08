import { ExecutiveCancellationImpact } from "@/components/executive/ExecutiveCancellationImpact";
import { ExecutiveDashboardFinalPolish } from "@/components/executive/ExecutiveDashboardFinalPolish";
import { ExecutiveDashboardInteractions } from "@/components/executive/ExecutiveDashboardInteractions";
import { ExecutiveDashboardReference } from "@/components/executive/ExecutiveDashboardReference";
import { ExecutiveDashboardUiGuard } from "@/components/executive/ExecutiveDashboardUiGuard";
import { ExecutiveDonutLegendStandardizer } from "@/components/executive/ExecutiveDonutLegendStandardizer";
import { ExecutiveRevenueExpenseGopChart } from "@/components/executive/ExecutiveRevenueExpenseGopChart";
import { ExecutiveStrategyScorecardPortal } from "@/components/executive/ExecutiveStrategyScorecardPortal";
import "@/components/executive/executive-dashboard-reference-enhancements.css";
import "@/components/executive/executive-dashboard-responsive.css";
import "@/components/executive/executive-dashboard-mobile.css";
import "@/components/executive/executive-dashboard-print-a4.css";
import "@/components/executive/executive-dashboard-financial-map.css";
import "@/components/executive/executive-dashboard-donut-legend.css";
import "@/components/executive/executive-dashboard-final-polish.css";
import "@/components/executive/executive-dashboard-desktop-compact.css";
import "@/components/executive/executive-dashboard-hotel-pc.css";

export function ExecutiveBiDashboardReadable() {
  return (
    <div
      className="executive-readable-root h-full min-h-0 overflow-x-hidden overflow-y-auto"
      data-executive-dashboard
    >
      <ExecutiveDashboardReference />
      <ExecutiveStrategyScorecardPortal />
      <ExecutiveDashboardInteractions />
      <ExecutiveRevenueExpenseGopChart />
      <ExecutiveCancellationImpact />
      <ExecutiveDonutLegendStandardizer />
      <ExecutiveDashboardFinalPolish />
      <ExecutiveDashboardUiGuard />
    </div>
  );
}
