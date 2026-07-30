import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Building2,
  CalendarCheck2,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/AppLayout";
import { Badge } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";

export const Route = createFileRoute("/_authenticated/admin-plataforma")({
  component: PlatformAdminPage,
});

type MemberOverview = {
  membership_id: string;
  user_id: string;
  name: string;
  email: string | null;
  role: "dono" | "recepcao" | "limpeza" | "cafe";
  active: boolean;
  is_platform_admin: boolean;
  first_seen_at: string | null;
  last_seen_at: string | null;
  last_path: string | null;
  session_count: number;
};

type CompanyOverview = {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
  setup: {
    company_fields_completed: number;
    company_fields_total: number;
    rooms_total: number;
    rooms_profiled: number;
    booking_status: string;
  };
  usage: {
    members_total: number;
    members_active: number;
    active_last_7_days: number;
    reservations_total: number;
    last_reservation_at: string | null;
    sales_total: number;
    expenses_total: number;
  };
  members: MemberOverview[];
  pending_invites: {
    email: string;
    name: string | null;
    role: string;
    status: string;
    created_at: string;
  }[];
};

type PlatformOverview = {
  generated_at: string;
  companies: CompanyOverview[];
};

function PlatformAdminPage() {
  const platformAdmin = usePlatformAdmin();
  const overview = useQuery({
    queryKey: ["platform-admin-overview"],
    enabled: platformAdmin.data === true,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc(
        "platform_admin_overview",
      );
      if (error) throw error;
      return data as PlatformOverview;
    },
  });

  if (platformAdmin.isLoading) {
    return <Loading text="Verificando acesso administrativo…" />;
  }

  if (!platformAdmin.data) {
    return (
      <div className="rounded-xl border border-brick/35 bg-brick-bg p-6 text-sm text-brick">
        Esta área é exclusiva do administrador da plataforma HospedaMais.
      </div>
    );
  }

  if (overview.isLoading) {
    return <Loading text="Carregando uso e implantação dos hotéis…" />;
  }

  if (overview.error || !overview.data) {
    return (
      <div className="rounded-xl border border-brick/35 bg-brick-bg p-6 text-sm text-brick">
        Não foi possível carregar o painel administrativo.
      </div>
    );
  }

  const companies = overview.data.companies ?? [];
  const members = companies.flatMap((company) => company.members ?? []);
  const activeLastWeek = companies.reduce(
    (sum, company) => sum + Number(company.usage.active_last_7_days || 0),
    0,
  );
  const totalReservations = companies.reduce(
    (sum, company) => sum + Number(company.usage.reservations_total || 0),
    0,
  );

  return (
    <div className="space-y-4 pb-8">
      <PageHeader
        title="Administração HospedaMais"
        subtitle="Acompanhe implantação e uso do sistema sem acessar senhas ou conteúdo digitado pelos usuários."
        action={
          <button
            type="button"
            className="btn-ghost inline-flex items-center gap-1.5"
            onClick={() => overview.refetch()}
            disabled={overview.isFetching}
          >
            <RefreshCw
              className={`h-4 w-4 ${overview.isFetching ? "animate-spin" : ""}`}
            />
            Atualizar
          </button>
        }
      />

      <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Metric
          icon={<Building2 />}
          label="Hotéis"
          value={companies.length}
        />
        <Metric icon={<Users />} label="Usuários" value={members.length} />
        <Metric
          icon={<Activity />}
          label="Ativos em 7 dias"
          value={activeLastWeek}
        />
        <Metric
          icon={<CalendarCheck2 />}
          label="Reservas registradas"
          value={totalReservations}
        />
      </section>

      {companies.map((company) => (
        <CompanySection key={company.id} company={company} />
      ))}

      {!companies.length && (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Nenhum hotel cadastrado.
        </div>
      )}
    </div>
  );
}

function CompanySection({ company }: { company: CompanyOverview }) {
  const companyProgress = percent(
    company.setup.company_fields_completed,
    company.setup.company_fields_total,
  );
  const roomsProgress = percent(
    company.setup.rooms_profiled,
    company.setup.rooms_total,
  );

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-serif text-xl font-bold text-pine-dark">
              {company.name}
            </h2>
            <Badge tone={company.active ? "sage" : "slate"}>
              {company.active ? "ativo" : "inativo"}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Ambiente criado em {formatDateTime(company.created_at)}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-pine-dark">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Dados isolados por empresa
        </div>
      </header>

      <div className="grid gap-3 p-4 lg:grid-cols-2 xl:grid-cols-4">
        <ProgressCard
          label="Cadastro do hotel"
          value={companyProgress}
          detail={`${company.setup.company_fields_completed} de ${company.setup.company_fields_total} campos principais`}
        />
        <ProgressCard
          label="Quartos caracterizados"
          value={roomsProgress}
          detail={`${company.setup.rooms_profiled} de ${company.setup.rooms_total} quartos`}
        />
        <InfoCard
          label="Uso da equipe"
          value={`${company.usage.active_last_7_days}/${company.usage.members_active}`}
          detail="usuários ativos nos últimos 7 dias"
        />
        <InfoCard
          label="Booking"
          value={bookingLabel(company.setup.booking_status)}
          detail="sincronização permanece bloqueada sem conexão oficial"
        />
      </div>

      <div className="grid gap-3 border-t border-border bg-muted/20 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <SmallStat label="Reservas" value={company.usage.reservations_total} />
        <SmallStat label="Vendas" value={company.usage.sales_total} />
        <SmallStat label="Despesas" value={company.usage.expenses_total} />
        <SmallStat
          label="Última reserva alterada"
          value={formatRelative(company.usage.last_reservation_at)}
        />
      </div>

      <div className="overflow-x-auto border-t border-border">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/35 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="p-3">Usuário</th>
              <th className="p-3">Função</th>
              <th className="p-3">Status</th>
              <th className="p-3">Último uso</th>
              <th className="p-3">Última tela</th>
              <th className="p-3 text-right">Sessões</th>
            </tr>
          </thead>
          <tbody>
            {company.members.map((member) => (
              <tr key={member.membership_id} className="border-b border-border/60">
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <div>
                      <p className="font-semibold text-foreground">
                        {member.name || "Usuário"}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {member.email || "E-mail ainda não informado"}
                      </p>
                    </div>
                    {member.is_platform_admin && (
                      <Badge tone="pine">Admin HospedaMais</Badge>
                    )}
                  </div>
                </td>
                <td className="p-3">{roleLabel(member.role)}</td>
                <td className="p-3">
                  <Badge tone={member.active ? "sage" : "slate"}>
                    {member.active ? "ativo" : "inativo"}
                  </Badge>
                </td>
                <td className="p-3">
                  <span className="font-semibold">
                    {formatRelative(member.last_seen_at)}
                  </span>
                  {member.last_seen_at && (
                    <span className="block text-[10px] text-muted-foreground">
                      {formatDateTime(member.last_seen_at)}
                    </span>
                  )}
                </td>
                <td className="p-3 text-xs text-muted-foreground">
                  {pathLabel(member.last_path)}
                </td>
                <td className="p-3 text-right font-mono font-bold tabular-nums">
                  {member.session_count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {company.pending_invites.length > 0 && (
        <div className="border-t border-border p-4">
          <h3 className="text-sm font-bold text-pine-dark">
            Convites aguardando conclusão
          </h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {company.pending_invites.map((invite) => (
              <span
                key={`${invite.email}-${invite.created_at}`}
                className="rounded-lg border border-brass/35 bg-brass-bg px-3 py-2 text-xs"
              >
                <strong>{invite.name || invite.email}</strong>
                <span className="ml-1 text-muted-foreground">
                  · {roleLabel(invite.role)} · {invite.status}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <article className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center gap-2 text-primary">
        <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
      </div>
      <p className="mt-2 text-2xl font-black tabular-nums text-pine-dark">
        {value}
      </p>
    </article>
  );
}

function ProgressCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <article className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-pine-dark">{label}</p>
        <strong className="text-sm text-primary">{value}%</strong>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${value}%` }}
        />
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">{detail}</p>
    </article>
  );
}

function InfoCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="rounded-xl border border-border bg-background p-3">
      <p className="text-xs font-bold text-pine-dark">{label}</p>
      <p className="mt-2 text-lg font-black text-primary">{value}</p>
      <p className="mt-1 text-[10px] text-muted-foreground">{detail}</p>
    </article>
  );
}

function SmallStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}

function Loading({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function percent(value: number, total: number) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}

function roleLabel(role: string) {
  const labels: Record<string, string> = {
    dono: "Proprietário / Gestor",
    recepcao: "Recepcionista",
    limpeza: "Camareira / Governança",
    cafe: "Atendente de A&B — Café",
  };
  return labels[role] ?? role;
}

function bookingLabel(status: string) {
  const labels: Record<string, string> = {
    active: "Ativa",
    confirmed: "Confirmada",
    awaiting_provider: "Aguardando provedor",
    inactive: "Inativa",
    not_configured: "Não configurada",
  };
  return labels[status] ?? status;
}

function pathLabel(path: string | null) {
  if (!path) return "Ainda não acessou";
  const labels: Record<string, string> = {
    "/central-estrategica": "Pulso do Hotel",
    "/painel": "Painel operacional",
    "/mapa": "Quadro de quartos",
    "/reservas": "Reservas",
    "/clientes": "Clientes",
    "/vendas": "Vendas",
    "/despesas": "Despesas",
    "/reclamacoes": "Reclamações",
    "/mensagens": "Mensagens",
    "/avaliacoes": "Avaliações",
    "/integracoes": "Integrações",
    "/equipe": "Equipe",
    "/ajuda-sistema": "Ajuda do sistema",
    "/assistente": "HotelAI",
    "/fichas-checkin": "Fichas de check-in",
    "/admin-plataforma": "Administração HospedaMais",
  };
  const key = Object.keys(labels).find((item) => path.startsWith(item));
  return key ? labels[key] : path;
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function formatRelative(value: string | null) {
  if (!value) return "Ainda não acessou";
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  if (!Number.isFinite(diff)) return "—";
  const minutes = Math.max(0, Math.floor(diff / 60_000));
  if (minutes < 2) return "Agora";
  if (minutes < 60) return `Há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `Há ${days} dia(s)`;
  return formatDateTime(value);
}
