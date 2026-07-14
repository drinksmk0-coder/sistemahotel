import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  BarChart3,
  BedDouble,
  Building2,
  CreditCard,
  DollarSign,
  FileWarning,
  LogOut,
  Menu,
  MessageSquare,
  QrCode,
  Settings,
  Star,
  Users,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useRole, useProfile, type AppRole } from "@/hooks/use-auth";
import { setCurrentCompanyId, useCurrentCompany } from "@/lib/data";
import { useQueryClient } from "@tanstack/react-query";

const TABS = [
  { to: "/painel", label: "Painel", icon: BarChart3, roles: ["dono", "recepcao", "limpeza", "cafe"] },
  { to: "/mapa", label: "Mapa", icon: BedDouble, roles: ["dono", "recepcao"] },
  { to: "/reservas", label: "Reservas", icon: CreditCard, roles: ["dono", "recepcao"] },
  { to: "/clientes", label: "Clientes", icon: Users, roles: ["dono", "recepcao"] },
  { to: "/vendas", label: "Vendas", icon: DollarSign, roles: ["dono", "recepcao"] },
  { to: "/despesas", label: "Despesas", icon: FileWarning, roles: ["dono"] },
  { to: "/reclamacoes", label: "Reclamacoes", icon: MessageSquare, roles: ["dono", "recepcao"] },
  { to: "/avaliacoes", label: "Avaliacoes", icon: Star, roles: ["dono", "recepcao"] },
  { to: "/qrcodes", label: "QR Codes", icon: QrCode, roles: ["dono", "recepcao"] },
  { to: "/integracoes", label: "Integracoes", icon: Settings, roles: ["dono"] },
  { to: "/empresa", label: "Empresa", icon: Building2, roles: ["dono"] },
  { to: "/equipe", label: "Equipe", icon: Users, roles: ["dono"] },
];

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
  const showCompanySelector = role === "dono" && currentCompany.companies.length > 1;
  const companyName = currentCompany.data?.nome ?? "Hotel Real";

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const sidebar = (
    <aside className="flex h-full w-[min(18rem,84vw)] flex-col border-r border-pine-dark/70 bg-pine-dark text-primary-foreground shadow-2xl xl:w-72">
      <div className="border-b border-white/15 p-4">
        <div className="flex items-center gap-3">
          <img
            src="/hotel-real-logo.png"
            alt="Hotel Real Cruzilia"
            className="h-12 w-12 rounded-md bg-white object-contain p-1 shadow"
          />
          <div className="min-w-0">
            <h1 className="truncate font-serif text-lg font-bold text-white">Hotel Real</h1>
            <p className="text-[11px] uppercase tracking-wider text-brass">
              {role ? ROLE_SUBTITLES[role] : "Aguardando acesso"}
            </p>
          </div>
        </div>

        {showCompanySelector ? (
          <label className="mt-4 block">
            <span className="mb-1 block text-[11px] font-semibold uppercase text-white/70">Empresa</span>
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
          <div className="mt-4 rounded-md border border-white/15 bg-white/10 px-3 py-2">
            <span className="block text-[11px] font-semibold uppercase text-white/65">Empresa</span>
            <span className="block truncate text-sm font-semibold text-white">{companyName}</span>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {visibleTabs.map((t) => {
          const active = path.startsWith(t.to);
          const Icon = t.icon;
          return (
            <Link
              key={t.to}
              to={t.to}
              onClick={() => setMenuOpen(false)}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition ${
                active ? "bg-brass text-pine-dark shadow" : "text-white/82 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/15 p-4">
        <Clock />
        <div className="mt-3">
          <div className="truncate text-xs font-semibold text-white">{profile?.nome ?? user?.email}</div>
          <div className="text-[11px] text-white/65">{role ? ROLE_LABELS[role] : "Aguardando liberacao"}</div>
        </div>
        <button onClick={signOut} className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-white/20 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10">
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen">
      <button
        className="fixed left-4 top-4 z-50 rounded-md bg-pine p-2 text-white shadow-lg xl:hidden"
        onClick={() => setMenuOpen(true)}
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="fixed inset-y-0 left-0 z-40 hidden xl:block">{sidebar}</div>

      {menuOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 xl:hidden" onClick={() => setMenuOpen(false)}>
          <div className="h-full" onClick={(e) => e.stopPropagation()}>
            <button
              className="absolute left-[min(18rem,84vw)] top-4 rounded-r-md bg-card p-2 shadow"
              onClick={() => setMenuOpen(false)}
              aria-label="Fechar menu"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </div>
        </div>
      )}

      <main className="min-w-0 px-3 pb-6 pt-16 sm:px-4 md:px-5 xl:ml-72 xl:px-7 xl:py-6">
        <div className="mx-auto w-full max-w-[1800px]">{children}</div>
      </main>
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="section-title text-xl sm:text-2xl">{title}</h2>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
