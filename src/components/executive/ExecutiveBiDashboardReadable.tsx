import { useState } from "react";
import { BarChart3, BedDouble, CircleDollarSign, MapPinned } from "lucide-react";
import { ExecutiveBiDashboard } from "@/components/executive/ExecutiveBiDashboard";

type DashboardTab = "overview" | "operations" | "market" | "revenue";

const TABS: Array<{ id: DashboardTab; label: string; icon: typeof BarChart3 }> = [
  { id: "overview", label: "Visão geral", icon: BarChart3 },
  { id: "operations", label: "Operação e quartos", icon: BedDouble },
  { id: "market", label: "Hóspedes e mercado", icon: MapPinned },
  { id: "revenue", label: "Receita e custos", icon: CircleDollarSign },
];

export function ExecutiveBiDashboardReadable() {
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");

  return (
    <div
      className="executive-readable-root h-full min-h-0 overflow-hidden"
      data-executive-dashboard
      data-dashboard-tab={activeTab}
    >
      <nav className="executive-dashboard-tabs" aria-label="Seções do dashboard executivo">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className="executive-dashboard-tab"
            data-active={activeTab === id}
            aria-pressed={activeTab === id}
            onClick={() => setActiveTab(id)}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <ExecutiveBiDashboard />
    </div>
  );
}
