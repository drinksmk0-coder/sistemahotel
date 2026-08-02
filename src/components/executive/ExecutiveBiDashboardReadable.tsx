import { ExecutiveBiDashboard } from "@/components/executive/ExecutiveBiDashboard";
import { ReservationStatusOverview } from "@/components/executive/ReservationStatusOverview";

export function ExecutiveBiDashboardReadable() {
  return (
    <div
      className="executive-readable-root h-full min-h-0 overflow-hidden"
      data-executive-dashboard
    >
      <ExecutiveBiDashboard />
      <ReservationStatusOverview />
    </div>
  );
}
