import { createFileRoute } from "@tanstack/react-router";
import {
  BarChart3,
  BedDouble,
  CalendarDays,
  CircleDollarSign,
  FileBarChart,
  Home,
  Maximize2,
  Minus,
  Settings,
  Users,
  X,
} from "lucide-react";
import { ExecutiveBiDashboardReadable } from "@/components/executive/ExecutiveBiDashboardReadable";
import "@/components/executive/executive-dashboard-fixes.css";
import "@/components/executive/windows11-dashboard-preview.css";

export const Route = createFileRoute("/_authenticated/painel-executivo-windows11")({
  component: Windows11DashboardPreview,
});

const NAV_ITEMS = [
  { label: "Início", icon: Home, active: true },
  { label: "Receitas", icon: CircleDollarSign },
  { label: "Reservas", icon: CalendarDays },
  { label: "Quartos", icon: BedDouble },
  { label: "Hóspedes", icon: Users },
  { label: "Relatórios", icon: FileBarChart },
  { label: "Configurações", icon: Settings },
];

function Windows11DashboardPreview() {
  return (
    <section className="windows11-dashboard-preview h-full min-h-0 overflow-hidden">
      <div className="win11-window-shell">
        <header className="win11-titlebar" aria-label="Barra da janela de demonstração">
          <div className="win11-titlebar-brand">
            <span className="win11-app-icon"><BarChart3 /></span>
            <div>
              <strong>HospedaMais</strong>
              <span>Painel Executivo BI — Fluent + Power BI</span>
            </div>
          </div>
          <div className="win11-window-controls" aria-hidden="true">
            <span><Minus /></span>
            <span><Maximize2 /></span>
            <span className="win11-close"><X /></span>
          </div>
        </header>

        <div className="win11-workspace">
          <aside className="win11-nav" aria-label="Navegação visual da prévia">
            <div className="win11-nav-brand"><BarChart3 /></div>
            <nav>
              {NAV_ITEMS.map(({ label, icon: Icon, active }) => (
                <button key={label} type="button" className={active ? "is-active" : ""} title={label}>
                  <Icon />
                  <span>{label}</span>
                </button>
              ))}
            </nav>
          </aside>

          <main className="win11-content">
            <div className="windows11-preview-banner">
              <div>
                <strong>Prévia híbrida de gestão</strong>
                <span>Leitura limpa, comparação rápida e gráfico financeiro temporal.</span>
              </div>
              <span className="win11-preview-chip">Painel oficial preservado</span>
            </div>
            <ExecutiveBiDashboardReadable />
          </main>
        </div>
      </div>
    </section>
  );
}
