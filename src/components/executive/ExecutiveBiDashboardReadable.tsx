import { ExecutiveBiDashboard } from "@/components/executive/ExecutiveBiDashboard";
import { OccupancyReservationCombinedChart } from "@/components/executive/OccupancyReservationCombinedChart";

export function ExecutiveBiDashboardReadable() {
  return (
    <div
      className="executive-readable-root h-full min-h-0 overflow-hidden"
      data-executive-dashboard
    >
      <ExecutiveBiDashboard />
      <OccupancyReservationCombinedChart />
    </div>
  );
}
