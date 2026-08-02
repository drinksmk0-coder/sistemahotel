import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  BarChart3,
  BedDouble,
  Building2,
  CalendarDays,
  ChevronRight,
  CreditCard,
  DollarSign,
  FileCheck2,
  FileWarning,
  Hotel,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  QrCode,
  Settings,
  Sparkles,
  Star,
  Users,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useRole, useProfile, type AppRole } from "@/hooks/use-auth";
import { setCurrentCompanyId, useCurrentCompany } from "@/lib/data";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCenter } from "@/components/AlertCenter";

const TABS = [
  { to: "/painel", label: "Visão geral", icon: BarChart3, roles: ["dono", "recepcao", "limpeza", "cafe"], group: "Operação" },
  { to: "/mapa", label: "Mapa de quartos", icon: BedDouble, roles: ["dono", "recepcao"], group: "Operação" },
  { to: "/reservas", label: "Reservas", icon: CalendarDays, roles: ["dono", "recepcao"], group: "Operação" },
  { to: "/fnrh", label: "FNRH e check-in", icon: FileCheck2, roles: ["dono", "recepcao"], group: "Operação" },
  { to: "/clientes", label: "Hóspedes", icon: Users, roles: ["dono", "recepcao"], group: "Operação" },
  { to: "/vendas", label: "Receitas", icon: DollarSign, roles: ["dono", "recepcao"], group: "Gestão" },
  { to: "/despesas", label: "Despesas", icon: FileWarning, roles: ["dono"], group: "Gestão" },
  { to: "/dashboard-estrategico", label: "Painel estratégico", icon: LayoutDashboard, roles: ["dono"], group: "Gestão" },
  { to: "/reclamacoes", label: "Ocorrências", icon: MessageSquare, roles: ["dono", "recepcao"], group: "Relacionamento" },
  { to: "/avaliacoes", label: "Avaliações", icon: Star, roles: ["dono", "recepcao"], group: "Relacionamento" },
  { to: "/qrcodes", label: "QR Codes", icon: QrCode, roles: ["dono", "recepcao"], group: "Relacionamento" },
  { to: "/integracoes", label: "Integrações", icon: Settings, roles: ["dono"], group: "Configurações" },
  { to: "/empresa", label: "Hotel e quartos", icon: Building2, roles: ["dono"], group: "Configurações" },
  { to: "/equipe", label: "Equipe", icon: Users, roles: ["dono"], group: "Configurações" },
] as const;

const MOBILE_PRIMARY_TABS = ["/painel", "/mapa", "/reservas", "/fnrh"] as const;
const GROUPS = ["Operação", "Gestão", "Relacionamento", "Configurações"] as const;

const ROLE_LABELS: Record<string, string> = {
  dono: "Proprietário",
  recepcao: "Recepção",
  limpeza: "Governança",
  cafe: "Café da manhã",
};

const ROLE_SUBTITLES: Record<AppRole, string> = {
  dono: "Gestão completa",
  recepcao: "Operação da recepção",
  limpeza: "Rotina de quartos",
  cafe: "Serviço de café",
};

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div>
      <div className="text-xs font-semibold capitalize text-white/80">
        {now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
      </div>
      <div className="mt-0.5 font-mono text-[11px] text-white/45">{now.toLocaleTimeString("pt-BR")}</div>
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
  const mobileTabs = visibleTabs.filter((tab) => MOBILE_PRIMARY_TABS.includes(tab.to as (typeof MOBILE_PRIMARY_TABS)[number])).slice(0, 4);
  const showCompanySelector = role === "dono" && currentCompany.companies.length > 1;
  const companyName = currentCompany.data?.nome ?? "Hotel Real Cruzília";
  const activeTab = visibleTabs.find((tab) => path.startsWith(tab.to));

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const sidebar = (
    <aside className="premium-panel flex h-full w-[min(17rem,88vw)] flex-col text-white xl:w-[17rem]">
      <div className="px-5 pb-4 pt-5">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white shadow-[0_10px_30px_rgba(0,0,0,.16)]">
            <img src="/hotel-real-logo.png" alt="Hotel Real Cruzília" className="h-10 w-10 object-contain" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.18em] text-white/45">
              <Sparkles className="h-3 w-3 text-brass" /> SistemaHotel
            </div>
            <h1 className="mt-1 truncate text-base font-extrabold tracking-tight">{companyName}</h1>
          </div>
        </div>

        {showCompanySelector ? (
          <label className="mt-4 block">
            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.14em] text-white/45">Empresa ativa</span>
            <select
              className="w-full rounded-xl border border-white/12 bg-white/10 px-3 py-2.5 text-sm font-semibold text-white outline-none backdrop-blur focus:border-white/30"
              value={currentCompany.data?.id ?? ""}
              onChange={(e) => setCurrentCompanyId(user?.id, e.target.value)}
            >
              {currentCompany.companies.map((company) => <option className="text-foreground" key={company.id} value={company.id}>{company.nome}</option>)}
            </select>
          </label>
        ) : (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/[.07] px-3 py-2.5">
            <div className="text-[10px] font-bold uppercase tracking-[.14em] text-white/40">Ambiente</div>
            <div className="mt-1 flex items-center gap-2 text-xs font-semibold text-white/85">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,.12)]" /> Operação online
            </div>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-3">
        {GROUPS.map((group) => {
          const items = visibleTabs.filter((tab) => tab.group === group);
          if (!items.length) return null;
          return (
            <div key={group} className="mb-4">
              <div className="mb-1.5 px-3 text-[9px] font-black uppercase tracking-[.2em] text-white/30">{group}</div>
              <div className="space-y-1">
                {items.map((tab) => {
                  const active = path.startsWith(tab.to);
                  const Icon = tab.icon;
                  return (
                    <Link
                      key={tab.to}
                      to={tab.to}
                      onClick={() => setMenuOpen(false)}
                      className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all ${
                        active
                          ? "bg-white text-pine-dark shadow-[0_9px_25px_rgba(0,0,0,.18)]"
                          : "text-white/68 hover:bg-white/[.08] hover:text-white"
                      }`}
                    >
                      <span className={`grid h-8 w-8 place-items-center rounded-lg transition ${active ? "bg-pine/10 text-pine" : "bg-white/[.06] text-white/60 group-hover:bg-white/10 group-hover:text-white"}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{tab.label}</span>
                      {active && <ChevronRight className="h-3.5 w-3.5 text-pine/55" />}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-4">
        <Clock />
        <div className="mt-4 flex items-center gap-3 rounded-xl bg-white/[.06] p-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/12 text-sm font-black">
            {(profile?.nome ?? user?.email ?? "U").slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-bold text-white">{profile?.nome ?? user?.email}</div>
            <div className="mt-0.5 text-[10px] text-white/45">{role ? ROLE_LABELS[role] : "Aguardando acesso"}</div>
          </div>
          <button onClick={signOut} className="grid h-8 w-8 place-items-center rounded-lg text-white/45 transition hover:bg-white/10 hover:text-white" aria-label="Sair">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen">
      <div className="fixed inset-y-0 left-0 z-40 hidden xl:block">{sidebar}</div>

      <header className="fixed inset-x-0 top-0 z-30 border-b border-border/70 bg-white/80 backdrop-blur-xl xl:left-[17rem]">
        <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
          <button className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-white text-pine shadow-sm xl:hidden" onClick={() => setMenuOpen(true)} aria-label="Abrir menu">
            <Menu className="h-5 w-5" />
          </button>
          <div className="hidden h-9 w-9 place-items-center rounded-xl bg-pine/10 text-pine sm:grid">
            {activeTab ? <activeTab.icon className="h-4.5 w-4.5" /> : <Hotel className="h-4.5 w-4.5" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-extrabold tracking-tight text-[#18362b]">{activeTab?.label ?? "SistemaHotel"}</div>
            <div className="hidden truncate text-[11px] text-muted-foreground sm:block">{role ? ROLE_SUBTITLES[role] : "Gestão hoteleira integrada"} · {companyName}</div>
          </div>
          <div className="mr-14 hidden items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-800 md:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Dados sincronizados
          </div>
        </div>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-50 bg-[#07150f]/55 backdrop-blur-sm xl:hidden" onClick={() => setMenuOpen(false)}>
          <div className="h-full" onClick={(e) => e.stopPropagation()}>
            {sidebar}
            <button className="absolute left-[min(17rem,88vw)] top-4 grid h-10 w-10 place-items-center rounded-r-xl bg-white text-pine-dark shadow-xl" onClick={() => setMenuOpen(false)} aria-label="Fechar menu">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      <main className="min-w-0 px-3 pb-24 pt-20 sm:px-5 lg:px-7 xl:ml-[17rem] xl:pb-8 xl:pt-20">
        <div className="mx-auto w-full max-w-[1680px]">
          {role === "dono" && <AlertCenter showDashboardCard={path === "/painel"} />}
          {children}
        </div>
      </main>

      {mobileTabs.length > 0 && (
        <nav className="fixed inset-x-3 bottom-3 z-40 rounded-2xl border border-white/70 bg-white/92 p-1.5 shadow-[0_18px_55px_rgba(18,47,35,.22)] backdrop-blur-xl xl:hidden">
          <div className="grid grid-cols-4 gap-1">
            {mobileTabs.map((tab) => {
              const Icon = tab.icon;
              const active = path.startsWith(tab.to);
              return (
                <Link key={tab.to} to={tab.to} className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[9px] font-bold transition ${active ? "bg-pine text-white shadow-md" : "text-slate hover:bg-muted"}`}>
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

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="mb-1.5 flex items-center gap-2 text-[10px] font-black uppercase tracking-[.18em] text-pine/55">
          <span className="h-px w-5 bg-pine/35" /> Hotel Real Cruzília
        </div>
        <h2 className="section-title text-2xl sm:text-[1.75rem]">{title}</h2>
        {subtitle && <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

void CreditCard;
