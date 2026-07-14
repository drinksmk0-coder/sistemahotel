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
import { useSession, useRole, useProfile } from "@/hooks/use-auth";
import { setCurrentCompanyId, useCurrentCompany } from "@/lib/data";
import { useQueryClient } from "@tanstack/react-query";

const TABS = [
  { to: "/painel", label: "Painel", icon: BarChart3 },
  { to: "/mapa", label: "Mapa", icon: BedDouble },
  { to: "/reservas", label: "Reservas", icon: CreditCard },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/vendas", label: "Vendas", icon: DollarSign },
  { to: "/despesas", label: "Despesas", icon: FileWarning },
  { to: "/reclamacoes", label: "Reclamacoes", icon: MessageSquare },
  { to: "/avaliacoes", label: "Avaliacoes", icon: Star },
  { to: "/qrcodes", label: "QR Codes", icon: QrCode },
  { to: "/integracoes", label: "Integracoes", icon: Settings },
  { to: "/empresa", label: "Empresa", icon: Building2 },
  { to: "/equipe", label: "Equipe", icon: Users },
];

const ROLE_LABELS: Record<string, string> = {
  dono: "Dono - acesso total",
  recepcao: "Recepcao",
  limpeza: "Limpeza",
  cafe: "Cafe",
};

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="font-mono text-xs text-muted-foreground">
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

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const sidebar = (
    <aside className="flex h-full w-72 flex-col border-r border-border bg-card">
      <div className="border-b border-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brass font-serif text-lg font-bold text-pine-dark">
            PR
          </div>
          <div className="min-w-0">
            <h1 className="truncate font-serif text-lg font-bold">Hotel Real SaaS</h1>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Painel multiempresa</p>
          </div>
        </div>

        <label className="mt-4 block">
          <span className="mb-1 block text-[11px] font-semibold uppercase text-muted-foreground">Empresa</span>
          <select
            className="field text-sm"
            value={currentCompany.data?.id ?? ""}
            onChange={(e) => setCurrentCompanyId(user?.id, e.target.value)}
          >
            {currentCompany.companies.length === 0 ? (
              <option value="">Sem empresa</option>
            ) : (
              currentCompany.companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.nome}
                </option>
              ))
            )}
          </select>
        </label>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {TABS.map((t) => {
          const active = path.startsWith(t.to);
          const Icon = t.icon;
          return (
            <Link
              key={t.to}
              to={t.to}
              onClick={() => setMenuOpen(false)}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition ${
                active ? "bg-pine text-primary-foreground" : "text-foreground hover:bg-muted"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-4">
        <Clock />
        <div className="mt-3">
          <div className="truncate text-xs font-semibold">{profile?.nome ?? user?.email}</div>
          <div className="text-[11px] text-muted-foreground">{role ? ROLE_LABELS[role] : "Aguardando liberacao"}</div>
        </div>
        <button onClick={signOut} className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-semibold hover:bg-muted">
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen">
      <button
        className="fixed left-4 top-4 z-50 rounded-md bg-pine p-2 text-white shadow-lg lg:hidden"
        onClick={() => setMenuOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="fixed inset-y-0 left-0 z-40 hidden lg:block">{sidebar}</div>

      {menuOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 lg:hidden" onClick={() => setMenuOpen(false)}>
          <div className="h-full" onClick={(e) => e.stopPropagation()}>
            <button className="absolute left-72 top-4 rounded-md bg-card p-2 shadow" onClick={() => setMenuOpen(false)}>
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </div>
        </div>
      )}

      <main className="px-4 py-6 lg:ml-72 lg:px-7">{children}</main>
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="section-title text-2xl">{title}</h2>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
