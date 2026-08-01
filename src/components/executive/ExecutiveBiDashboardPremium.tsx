import { BarChart3, CalendarDays, CircleDollarSign, FileBarChart, Home, Settings, Users } from "lucide-react";
import { ExecutiveBiDashboardReadable } from "@/components/executive/ExecutiveBiDashboardReadable";
import "@/components/executive/executive-dashboard-premium.css";

const NAV_ITEMS = [
  { label: "Visão geral", icon: Home, active: true },
  { label: "Receita", icon: CircleDollarSign },
  { label: "Reservas", icon: CalendarDays },
  { label: "Hóspedes", icon: Users },
  { label: "Relatórios", icon: FileBarChart },
  { label: "Configurações", icon: Settings },
];

export function ExecutiveBiDashboardPremium() {
  return (
    <section className="executive-premium-shell h-full min-h-0 overflow-hidden">
      <aside className="executive-premium-nav" aria-label="Navegação da prévia premium">
        <div className="executive-premium-brand"><BarChart3 /></div>
        <nav>
          {NAV_ITEMS.map(({ label, icon: Icon, active }) => (
            <button key={label} type="button" className={active ? "is-active" : ""} title={label}>
              <Icon />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="executive-premium-content">
        <div className="executive-premium-banner">
          <div>
            <strong>Redesign premium do Painel Executivo</strong>
            <span>Mesmos dados reais, mesma lógica e gráfico principal temporal.</span>
          </div>
          <span className="executive-premium-chip">Prévia isolada</span>
        </div>
        <ExecutiveBiDashboardReadable />
      </main>
    </section>
  );
}
