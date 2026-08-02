import { ExecutiveBiDashboard } from "@/components/executive/ExecutiveBiDashboard";
import { OccupancyReservationCombinedChart } from "@/components/executive/OccupancyReservationCombinedChart";

const OVERRIDE_STYLES = `
.executive-bi-card > div:first-child > span {
  display: none !important;
}
.executive-occupancy-combined > div:nth-child(2) {
  display: none !important;
}
.executive-occupancy-combined .occupancy-reservation-host {
  display: block !important;
}
`;

export function ExecutiveBiDashboardReadable() {
  return (
    <div
      className="executive-readable-root h-full min-h-0 overflow-hidden"
      data-executive-dashboard
    >
      <style>{OVERRIDE_STYLES}</style>
      <ExecutiveBiDashboard />
      <OccupancyReservationCombinedChart />
    </div>
  );
}
