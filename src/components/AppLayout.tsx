import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  BarChart3,
  BedDouble,
  Bot,
  CalendarRange,
  CreditCard,
  DollarSign,
  FileWarning,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Lightbulb,
  PackageSearch,
  QrCode,
  Settings,
  Star,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useRole, useProfile, type AppRole } from "@/hooks/use-auth";
import { setCurrentCompanyId, useCurrentCompany } from "@/lib/data";
import { useQueryClient } from "@tanstack/react-query";
import { applySystemSettings, getSystemSettings } from "@/lib/system-settings";
import { SystemMonitor } from "@/components/SystemMonitor";

const TABS = [
  {
    to: "/painel",
    label: "Painel",
    icon: BarChart3,
    roles: ["dono", "recepcao", "limpeza", "cafe"],
  },
  { to: "/dashboard-estrategico", label: "Estratégico", icon: LayoutDashboard, roles: ["dono"] },
  { to: "/decisoes", label: "Decisões", icon: Lightbulb, roles: ["dono"] },
  { to: "/financeiro", label: "Financeiro", icon: WalletCards, roles: ["dono"] },
  { to: "/vendas-produtos", label: "Produtos", icon: PackageSearch, roles: ["dono", "recepcao"] },
  { to: "/dashboard-quartos", label: "Quartos", icon: BedDouble, roles: ["dono", "recepcao"] },
  { to: "/mapa", label: "Mapa", icon: BedDouble, roles: ["dono", "recepcao"] },
  { to: "/reservas", label: "Reservas", icon: CreditCard, roles: ["dono", "recepcao"] },
  { to: "/tarifario", label: "Tarifário", icon: CalendarRange, roles: ["dono"] },
  { to: "/clientes", label: "Clientes", icon: Users, roles: ["dono", "recepcao"] },
  { to: "/vendas", label: "Vendas", icon: DollarSign, roles: ["dono", "recepcao"] },
  { to: "/despesas", label: "Despesas", icon: FileWarning, roles: ["dono"] },
  { to: "/reclamacoes", label: "Reclamacoes", icon: MessageSquare, roles: ["dono", "recepcao"] },
  {
    to: "/assistente",
    label: "Assistente 24h",
    icon: Bot,
    roles: ["dono", "recepcao", "limpeza", "cafe"],
  },
  { to: "/avaliacoes", label: "Avaliacoes", icon: Star, roles: ["dono", "recepcao"] },
  { to: "/qrcodes", label: "QR Codes", icon: QrCode, roles: ["dono", "recepcao"] },
  { to: "/integracoes", label: "Integracoes", icon: Settings, roles: ["dono"] },
  { to: "/empresa", label: "Configurações", icon: Settings, roles: ["dono"] },
  { to: "/equipe", label: "Equipe", icon: Users, roles: ["dono"] },
];

const MOBILE_PRIMARY_TABS = ["/painel", "/mapa", "/reservas", "/clientes"] as const;

const ROLE_LABELS: Record<string, string> = {
  dono: "Dono - acesso total",
  recepcao: "Recepcao",
  limpeza: "Limpeza",
  cafe: "Cafe",
};

const ROLE_SUBTITLES: Record<AppRole, string> = {
  dono: "Gestao do hotel",
  recepcao: "Recepcao",
  limpeza: "Limpeza",
  cafe: "Cafe da manha",
};

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="font-mono text-xs text-white/65">
      <div className="capitalize">
        {now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
      </div>
      <div>{now.toLocaleTimeString("pt-BR")}</div>
    </div>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const { data: role } = useRole(user);
  const { data: profile } = useProfile(user);
  const currentCompany = useCurrentCompany();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [menuOpen, setMenuOpen] = useState(false);
  const visibleTabs = TABS.filter((tab) => !role || tab.roles.includes(role));
  const mobileTabs = visibleTabs
    .filter((tab) => MOBILE_PRIMARY_TABS.includes(tab.to as (typeof MOBILE_PRIMARY_TABS)[number]))
    .slice(0, 4);
  const showCompanySelector = role === "dono" && currentCompany.companies.length > 1;
  const companyName = currentCompany.data?.nome ?? "Hotel Real";
  const [systemSettings, setSystemSettings] = useState(() =>
    getSystemSettings(currentCompany.data?.id),
  );

  useEffect(() => {
    const settings = getSystemSettings(currentCompany.data?.id);
    setSystemSettings(settings);
    applySystemSettings(settings);
    const handleSettings = (event: Event) => {
      const next = (event as CustomEvent).detail ?? getSystemSettings(currentCompany.data?.id);
      setSystemSettings(next);
      applySystemSettings(next);
    };
    window.addEventListener("hotelreal:settings", handleSettings);
    return () => window.removeEventListener("hotelreal:settings", handleSettings);
  }, [currentCompany.data?.id]);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const sidebar = (
    <aside
      className="app-sidebar flex h-full w-[min(16rem,86vw)] flex-col border-r border-white/8 text-primary-foreground shadow-2xl xl:w-64"
      style={
        {
          "--sidebar-primary": systemSettings.primaryColor,
        } as CSSProperties
      }
    >
      <div className="border-b border-white/10 px-5 py-5">
        <div className="flex items-center gap-3">
          <img
            src={systemSettings.logo}
            alt={companyName}
            className="h-10 w-10 rounded-xl bg-primary object-contain p-1.5 shadow-lg"
          />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-extrabold text-white">{companyName}</h1>
            <p className="text-[10px] uppercase tracking-[0.15em] text-white/50">
              {role ? ROLE_SUBTITLES[role] : "Aguardando acesso"}
            </p>
          </div>
        </div>

        {showCompanySelector ? (
          <label className="mt-4 block">
            <span className="mb-1 block text-[11px] font-semibold uppercase text-white/70">
              Empresa
            </span>
            <select
              className="field border-white/20 bg-white/95 text-sm text-foreground"
              value={currentCompany.data?.id ?? ""}
              onChange={(e) => setCurrentCompanyId(user?.id, e.target.value)}
            >
              {currentCompany.companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.nome}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2">
            <span className="block text-[11px] font-semibold uppercase text-white/65">Empresa</span>
            <span className="block truncate text-sm font-semibold text-white">{companyName}</span>
          </div>
        )}
      </div>

      <nav className="app-sidebar-nav flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {visibleTabs.map((t) => {
          const active = path.startsWith(t.to);
          const Icon = t.icon;
          return (
            <Link
              key={t.to}
              to={t.to}
              onClick={() => setMenuOpen(false)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                active
                  ? "bg-white/12 text-white shadow-sm"
                  : "text-white/65 hover:bg-white/[0.07] hover:text-white"
              }`}
            >
              <Icon className={`h-4 w-4 ${active ? "text-white" : "text-white/55"}`} />
              {t.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-4">
        <Clock />
        <div className="mt-3">
          <div className="truncate text-xs font-semibold text-white">
            {profile?.nome ?? user?.email}
          </div>
          <div className="text-[11px] text-white/65">
            {role ? ROLE_LABELS[role] : "Aguardando liberacao"}
          </div>
        </div>
        <button
          onClick={signOut}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-white/20 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen">
      <SystemMonitor />
      <button
        className="fixed left-4 top-4 z-50 rounded-md bg-pine p-2 text-white shadow-lg xl:hidden"
        onClick={() => setMenuOpen(true)}
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="fixed inset-y-0 left-0 z-40 hidden xl:block">{sidebar}</div>

      {menuOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 xl:hidden"
          onClick={() => setMenuOpen(false)}
        >
          <div className="h-full" onClick={(e) => e.stopPropagation()}>
            <button
              className="absolute left-[min(15rem,84vw)] top-4 rounded-r-md bg-card p-2 shadow"
              onClick={() => setMenuOpen(false)}
              aria-label="Fechar menu"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </div>
        </div>
      )}

      <main className="app-main min-w-0 px-3 pb-24 pt-16 sm:px-5 md:px-7 xl:ml-64 xl:px-8 xl:pb-8 xl:pt-7">
        <div className="mx-auto w-full max-w-[1880px]">{children}</div>
      </main>

      {mobileTabs.length > 0 && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-pine-dark/15 bg-card/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_30px_rgba(42,33,24,0.12)] backdrop-blur xl:hidden">
          <div className="grid grid-cols-4 gap-1">
            {mobileTabs.map((tab) => {
              const Icon = tab.icon;
              const active = path.startsWith(tab.to);
              return (
                <Link
                  key={tab.to}
                  to={tab.to}
                  className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-md px-1 py-2 text-[10px] font-semibold transition ${
                    active ? "bg-pine text-white" : "text-pine-dark hover:bg-sage-bg"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="max-w-full truncate">{tab.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <h2 className="section-title text-lg font-extrabold tracking-tight text-pine-dark sm:text-xl">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-0.5 max-w-3xl truncate text-[11px] text-muted-foreground" title={subtitle}>
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
