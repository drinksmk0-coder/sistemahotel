import { useState } from "react";
import { BarChart3, BedDouble, CircleDollarSign, MapPinned } from "lucide-react";
import { ExecutiveBiDashboard } from "@/components/executive/ExecutiveBiDashboard";
import { ReservationStatusOverview } from "@/components/executive/ReservationStatusOverview";

type DashboardTab = "overview" | "operations" | "market" | "revenue";

const TABS = [
  { id: "overview" as const, label: "Visão geral", icon: BarChart3 },
  { id: "operations" as const, label: "Operação e reservas", icon: BedDouble },
  { id: "market" as const, label: "Hóspedes e mercado", icon: MapPinned },
  { id: "revenue" as const, label: "Receita e custos", icon: CircleDollarSign },
];

const TAB_STYLES = `
.executive-dashboard-tabs{position:sticky;top:0;z-index:35;display:flex;gap:.35rem;padding:.45rem;margin-bottom:.5rem;overflow-x:auto;border:1px solid var(--border);border-radius:.85rem;background:color-mix(in srgb,var(--card) 96%,transparent);backdrop-filter:blur(14px);box-shadow:0 5px 18px rgb(15 23 42/.06)}
.executive-dashboard-tab{display:inline-flex;align-items:center;justify-content:center;gap:.4rem;min-height:2.15rem;padding:.4rem .8rem;white-space:nowrap;border:1px solid transparent;border-radius:.65rem;color:var(--muted-foreground);font-size:.72rem;font-weight:800}
.executive-dashboard-tab svg{width:.9rem;height:.9rem}.executive-dashboard-tab[data-active="true"]{border-color:color-mix(in srgb,var(--primary) 24%,var(--border));background:color-mix(in srgb,var(--primary) 12%,var(--card));color:var(--primary)}
.executive-readable-root .executive-dashboard-grid>section:nth-of-type(1)>article,.executive-readable-root .executive-dashboard-grid>section:nth-of-type(2)>article{display:none}
.executive-readable-root[data-dashboard-tab="overview"] .executive-dashboard-grid>section:nth-of-type(1)>article:nth-child(1),.executive-readable-root[data-dashboard-tab="overview"] .executive-dashboard-grid>section:nth-of-type(1)>article:nth-child(5),.executive-readable-root[data-dashboard-tab="overview"] .executive-dashboard-grid>section:nth-of-type(1)>article:nth-child(6),.executive-readable-root[data-dashboard-tab="overview"] .executive-dashboard-grid>section:nth-of-type(1)>article:nth-child(7),.executive-readable-root[data-dashboard-tab="overview"] .executive-dashboard-grid>section:nth-of-type(1)>article:nth-child(11),.executive-readable-root[data-dashboard-tab="overview"] .executive-dashboard-grid>section:nth-of-type(1)>article:nth-child(12),.executive-readable-root[data-dashboard-tab="overview"] .executive-dashboard-grid>section:nth-of-type(2)>article:nth-child(1),.executive-readable-root[data-dashboard-tab="overview"] .executive-dashboard-grid>section:nth-of-type(2)>article:nth-child(3){display:block}
.executive-readable-root[data-dashboard-tab="operations"] .executive-dashboard-grid>section:nth-of-type(1)>article:nth-child(5),.executive-readable-root[data-dashboard-tab="operations"] .executive-dashboard-grid>section:nth-of-type(1)>article:nth-child(6),.executive-readable-root[data-dashboard-tab="operations"] .executive-dashboard-grid>section:nth-of-type(1)>article:nth-child(7),.executive-readable-root[data-dashboard-tab="operations"] .executive-dashboard-grid>section:nth-of-type(1)>article:nth-child(10),.executive-readable-root[data-dashboard-tab="operations"] .executive-dashboard-grid>section:nth-of-type(1)>article:nth-child(11),.executive-readable-root[data-dashboard-tab="operations"] .executive-dashboard-grid>section:nth-of-type(1)>article:nth-child(12),.executive-readable-root[data-dashboard-tab="operations"] .executive-dashboard-grid>section:nth-of-type(2)>article:nth-child(1),.executive-readable-root[data-dashboard-tab="operations"] .executive-dashboard-grid>section:nth-of-type(2)>article:nth-child(3),.executive-readable-root[data-dashboard-tab="operations"] .executive-dashboard-grid>section:nth-of-type(2)>article:nth-child(6){display:block}
.executive-readable-root[data-dashboard-tab="market"] .executive-dashboard-grid>section:nth-of-type(1)>article:nth-child(10),.executive-readable-root[data-dashboard-tab="market"] .executive-dashboard-grid>section:nth-of-type(1)>article:nth-child(11),.executive-readable-root[data-dashboard-tab="market"] .executive-dashboard-grid>section:nth-of-type(1)>article:nth-child(12),.executive-readable-root[data-dashboard-tab="market"] .executive-dashboard-grid>section:nth-of-type(2)>article:nth-child(4),.executive-readable-root[data-dashboard-tab="market"] .executive-dashboard-grid>section:nth-of-type(2)>article:nth-child(5),.executive-readable-root[data-dashboard-tab="market"] .executive-dashboard-grid>section:nth-of-type(2)>article:nth-child(7),.executive-readable-root[data-dashboard-tab="market"] .executive-dashboard-grid>section:nth-of-type(2)>article:nth-child(8){display:block}
.executive-readable-root[data-dashboard-tab="revenue"] .executive-dashboard-grid>section:nth-of-type(1)>article:nth-child(1),.executive-readable-root[data-dashboard-tab="revenue"] .executive-dashboard-grid>section:nth-of-type(1)>article:nth-child(2),.executive-readable-root[data-dashboard-tab="revenue"] .executive-dashboard-grid>section:nth-of-type(1)>article:nth-child(3),.executive-readable-root[data-dashboard-tab="revenue"] .executive-dashboard-grid>section:nth-of-type(1)>article:nth-child(4),.executive-readable-root[data-dashboard-tab="revenue"] .executive-dashboard-grid>section:nth-of-type(1)>article:nth-child(8),.executive-readable-root[data-dashboard-tab="revenue"] .executive-dashboard-grid>section:nth-of-type(1)>article:nth-child(9),.executive-readable-root[data-dashboard-tab="revenue"] .executive-dashboard-grid>section:nth-of-type(2)>article:nth-child(2),.executive-readable-root[data-dashboard-tab="revenue"] .executive-dashboard-grid>section:nth-of-type(2)>article:nth-child(6),.executive-readable-root[data-dashboard-tab="revenue"] .executive-dashboard-grid>section:nth-of-type(2)>article:nth-child(9),.executive-readable-root[data-dashboard-tab="revenue"] .executive-dashboard-grid>section:nth-of-type(2)>article:nth-child(10){display:block}
.executive-readable-root[data-dashboard-tab="overview"] .executive-dashboard-grid>section:nth-of-type(1),.executive-readable-root[data-dashboard-tab="operations"] .executive-dashboard-grid>section:nth-of-type(1),.executive-readable-root[data-dashboard-tab="revenue"] .executive-dashboard-grid>section:nth-of-type(1){grid-template-columns:repeat(6,minmax(0,1fr))}.executive-readable-root[data-dashboard-tab="market"] .executive-dashboard-grid>section:nth-of-type(1){grid-template-columns:repeat(3,minmax(0,1fr))}
.executive-readable-root svg[aria-label*="Mapa do Brasil"] path{fill-opacity:revert!important}
@media(max-width:900px){.executive-dashboard-tabs{position:relative}.executive-readable-root .executive-dashboard-grid>section:nth-of-type(1){grid-template-columns:repeat(2,minmax(0,1fr))!important}.executive-readable-root .executive-dashboard-grid>section:nth-of-type(2)>article{grid-column:1/-1!important}}
`;

export function ExecutiveBiDashboardReadable() {
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const showReservationStatus = activeTab === "overview" || activeTab === "operations";

  return (
    <div className="executive-readable-root h-full min-h-0 overflow-hidden" data-executive-dashboard data-dashboard-tab={activeTab}>
      <style>{TAB_STYLES}</style>
      <nav className="executive-dashboard-tabs" aria-label="Seções do dashboard executivo">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" className="executive-dashboard-tab" data-active={activeTab === id} aria-pressed={activeTab === id} onClick={() => setActiveTab(id)}>
            <Icon aria-hidden="true" /><span>{label}</span>
          </button>
        ))}
      </nav>
      {showReservationStatus && <ReservationStatusOverview />}
      <ExecutiveBiDashboard />
    </div>
  );
}
