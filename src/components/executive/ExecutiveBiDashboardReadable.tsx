import { ExecutiveDashboardReference } from "@/components/executive/ExecutiveDashboardReference";

export function ExecutiveBiDashboardReadable() {
  return (
    <div
      className="executive-readable-root h-full min-h-0 overflow-hidden"
      data-executive-dashboard
    >
      <ExecutiveDashboardReference />
    </div>
  );
}
