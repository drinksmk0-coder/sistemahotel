import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BedDouble,
  Bot,
  CalendarRange,
  ChartNoAxesCombined,
  CreditCard,
  DollarSign,
  FileWarning,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  MessagesSquare,
  Settings,
  Sparkles,
  Star,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, useRole, useSession, type AppRole } from "@/hooks/use-auth";
import { setCurrentCompanyId, useCurrentCompany } from "@/lib/data";
import { applySystemSettings, getSystemSettings } from "@/lib/system-settings";
import { SystemMonitor } from "@/components/SystemMonitor";

type NavigationItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: AppRole[];
};

const TABS: NavigationItem[] = [
  {
    to: "/central-estrategica",
    label: "Pulso do Hotel",
    icon: ChartNoAxesCombined,
    roles: ["dono"],
  },
  {
    to: "/painel",
    label: "Painel",
    icon: LayoutDashboard,
    roles: ["recepcao", "limpeza", "cafe"],
  },
  { to: "/mapa", label: "Mapa", icon: BedDouble, roles: ["dono", "recepcao"] },
  { to: "/reservas", label: "Reservas", icon: CreditCard, roles: ["dono", "recepcao"] },
  { to: "/tarifario", label: "Tarifário", icon: CalendarRange, roles: ["dono"] },
  { to: "/clientes", label: "Clientes", icon: Users, roles: ["dono", "recepcao"] },
  { to: "/vendas", label: "Vendas", icon: DollarSign, roles: ["dono", "recepcao"] },
  { to: "/despesas", label: "Despesas", icon: FileWarning, roles: ["dono"] },
  {
    to: "/reclamacoes",
    label: "Reclamações",
    icon: MessageSquare,
    roles: ["dono", "recepcao"],
  },
  {
    to: "/mensagens",
    label: "Mensagens",
    icon: MessagesSquare,
    roles: ["dono", "recepcao"],
  },
];

const SECONDARY_TABS: NavigationItem[] = [
  {
    to: "/assistente",
    label: "Assistente 24h",
    icon: Bot,
    roles: ["dono", "recepcao"],
  },
  {
    to: "/avaliacoes",
    label: "Avaliações",
    icon: Star,
    roles: ["dono", "recepcao"],
  },
  { to: "/integracoes", label: "Integrações", icon: Settings, roles: ["dono"] },
  { to: "/empresa", label: "Aparência do sistema", icon: Settings, roles: ["dono"] },
  { to: "/equipe", label: "Equipe", icon: Users, roles: ["dono"] },
];

const MOBILE_PRIMARY_TABS = new Set([
  "/central-estrategica",
  "/painel",
  "/mapa",
  "/reservas",
  "/clientes",
  "/vendas",
]);

const ROLE_LABELS: Record<AppRole, string> = {
  dono: "Dono - acesso total",
  recepcao: "Recepção",
  limpeza: "Limpeza",
  cafe: "Café",
};

const ROLE_SUBTITLES: Record<AppRole, string> = {
  dono: "Gestão do hotel",
  recepcao: "Recepção",
  limpeza: "Limpeza",
  cafe: "Café da manhã",
};

function Clock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="font-mono text-xs text-white/65">
      <div className="capitalize">
        {now.toLocaleDateString("pt-BR", {
          weekday: "long",
          day: "2-digit",
          month: "long",
        })}
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
  const queryClient = useQueryClient();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const [menuOpen, setMenuOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const visibleTabs = TABS.filter((tab) => !role || tab.roles.includes(role));
  const secondaryTabs = SECONDARY_TABS.filter((tab) => !role || tab.roles.includes(role));
  const mobileTabs = visibleTabs.filter((tab) => MOBILE_PRIMARY_TABS.has(tab.to)).slice(0, 4);
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
      const next =
        (event as CustomEvent).detail ?? getSystemSettings(currentCompany.data?.id);
      setSystemSettings(next);
      applySystemSettings(next);
    };
    window.addEventListener("hotelreal:settings", handleSettings);
    return () => window.removeEventListener("hotelreal:settings", handleSettings);
  }, [currentCompany.data?.id]);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const sidebar = (
    <aside
      className="app-sidebar flex h-full w-[min(13.5rem,86vw)] flex-col border-r border-white/8 text-primary-foreground shadow-2xl xl:w-[13.5rem]"
      style={{ "--sidebar-primary": systemSettings.primaryColor } as CSSProperties}
    >
      <div className="border-b border-white/10 px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <img
            src={systemSettings.logo}
            alt={companyName}
            className="h-8 w-8 rounded-lg bg-primary object-contain p-1 shadow-lg"
          />
          <div className="min-w-0">
            <h1 className="truncate text-sm font-extrabold text-white">{companyName}</h1>
            <p className="text-[8px] uppercase tracking-[0.13em] text-white/50">
              {role ? ROLE_SUBTITLES[role] : "Aguardando acesso"}
            </p>
          </div>
        </div>

        {showCompanySelector ? (
          <label className="mt-3 block">
            <span className="mb-1 block text-[11px] font-semibold uppercase text-white/70">
              Empresa
            </span>
            <select
              className="field border-white/20 bg-white/95 text-sm text-foreground"
              value={currentCompany.data?.id ?? ""}
              onChange={(event) => setCurrentCompanyId(user?.id, event.target.value)}
            >
              {currentCompany.companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.nome}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="mt-3 rounded-md border border-white/10 bg-white/[0.06] px-2.5 py-1.5">
            <span className="block text-[11px] font-semibold uppercase text-white/65">Empresa</span>
            <span className="block truncate text-sm font-semibold text-white">{companyName}</span>
          </div>
        )}
      </div>

      <nav className="app-sidebar-nav flex-1 space-y-0.5 overflow-y-auto px-2.5 py-2">
        {visibleTabs.map((tab) => (
          <NavigationLink
            key={tab.to}
            item={tab}
            active={path.startsWith(tab.to)}
            onNavigate={() => setMenuOpen(false)}
          />
        ))}
        {secondaryTabs.length > 0 && (
          <div className="mt-1 space-y-0.5 border-t border-white/10 pt-1">
            {secondaryTabs.map((tab) => (
              <NavigationLink
                key={tab.to}
                item={tab}
                active={path.startsWith(tab.to)}
                onNavigate={() => setMenuOpen(false)}
              />
            ))}
          </div>
        )}
      </nav>

      <div className="border-t border-white/10 p-3">
        <Clock />
        <div className="mt-2">
          <div className="truncate text-xs font-semibold text-white">
            {profile?.nome ?? user?.email}
          </div>
          <div className="text-[11px] text-white/65">
            {role ? ROLE_LABELS[role] : "Aguardando liberação"}
          </div>
        </div>
        <button
          type="button"
          onClick={signOut}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-white/20 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
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
        type="button"
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
          <div className="h-full" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
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

      <main className="app-main min-w-0 px-3 pb-24 pt-16 sm:px-5 md:px-7 xl:ml-[13.5rem] xl:px-6 xl:pb-8 xl:pt-5">
        <div className="mx-auto w-full max-w-[1880px]">{children}</div>
      </main>

      {(role === "dono" || role === "recepcao") && !path.startsWith("/assistente") && (
        <div className="fixed bottom-24 right-3 z-40 flex flex-col items-end gap-2 xl:bottom-4 xl:right-4">
          {assistantOpen && (
            <div className="w-[min(320px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-primary/20 bg-card/95 shadow-2xl backdrop-blur">
              <div className="bg-[linear-gradient(135deg,var(--primary),var(--accent))] p-3 text-primary-foreground">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/15">
                      <Bot className="h-5 w-5" />
                    </span>
                    <div>
                      <strong className="block text-sm">HotelAI</strong>
                      <span className="text-[10px] opacity-80">Assistente do hotel</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="rounded-full p-1 hover:bg-white/15"
                    onClick={() => setAssistantOpen(false)}
                    aria-label="Fechar assistente"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="space-y-3 p-3">
                <div className="rounded-xl rounded-tl-sm bg-muted p-3 text-xs leading-relaxed text-foreground">
                  Posso analisar ocupação, receita, despesas, reservas e oportunidades do hotel.
                </div>
                <Link
                  to="/assistente"
                  onClick={() => setAssistantOpen(false)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-xs font-bold text-primary-foreground shadow-sm"
                >
                  <Sparkles className="h-4 w-4" />
                  Conversar com o HotelAI
                </Link>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setAssistantOpen((open) => !open)}
            className="group relative grid h-11 w-11 place-items-center rounded-xl bg-[linear-gradient(135deg,var(--primary),var(--accent))] text-primary-foreground opacity-80 shadow-[0_8px_24px_color-mix(in_srgb,var(--primary)_30%,transparent)] transition hover:-translate-y-0.5 hover:scale-105 hover:opacity-100"
            aria-label={assistantOpen ? "Fechar HotelAI" : "Abrir HotelAI"}
            aria-expanded={assistantOpen}
          >
            <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-card bg-sage" />
            {assistantOpen ? <X className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
          </button>
        </div>
      )}

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

function NavigationLink({
  item,
  active,
  onNavigate,
}: {
  item: NavigationItem;
  active: boolean;
  onNavigate: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${
        active
          ? "bg-white/12 text-white shadow-sm"
          : "text-white/65 hover:bg-white/[0.07] hover:text-white"
      }`}
    >
      <Icon className={`h-4 w-4 ${active ? "text-white" : "text-white/55"}`} />
      {item.label}
    </Link>
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
        <h2 className="section-title text-base font-extrabold tracking-tight text-pine-dark sm:text-lg">
          {title}
        </h2>
        {subtitle && (
          <p className="max-w-3xl truncate text-[10px] text-muted-foreground" title={subtitle}>
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
