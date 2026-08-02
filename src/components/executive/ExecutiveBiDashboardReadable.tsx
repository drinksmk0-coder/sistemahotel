import { ExecutiveCancellationImpact } from "@/components/executive/ExecutiveCancellationImpact";
import { ExecutiveDashboardInteractions } from "@/components/executive/ExecutiveDashboardInteractions";
import { ExecutiveDashboardReference } from "@/components/executive/ExecutiveDashboardReference";
import { ExecutiveDashboardUiGuard } from "@/components/executive/ExecutiveDashboardUiGuard";
import { ExecutiveExpenseCategoryFrequency } from "@/components/executive/ExecutiveExpenseCategoryFrequency";
import { ExecutiveRevenueExpenseGopChart } from "@/components/executive/ExecutiveRevenueExpenseGopChart";
import "@/components/executive/executive-dashboard-reference-enhancements.css";
import "@/components/executive/executive-dashboard-responsive.css";
import "@/components/executive/executive-dashboard-financial-map.css";

export function ExecutiveBiDashboardReadable() {
  return (
    <div
      className="executive-readable-root h-full min-h-0 overflow-hidden"
      data-executive-dashboard
    >
      <ExecutiveDashboardReference />
      <ExecutiveDashboardInteractions />
      <ExecutiveRevenueExpenseGopChart />
      <ExecutiveCancellationImpact />
      <ExecutiveExpenseCategoryFrequency />
      <ExecutiveDashboardUiGuard />
    </div>
  );
}
