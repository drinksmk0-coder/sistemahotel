import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Bell,
  CalendarCheck,
  CheckCircle2,
  CircleAlert,
  Info,
  MessageSquareWarning,
  WalletCards,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  useComplaints,
  useCurrentCompany,
  useFeedbacks,
  useReservations,
} from "@/lib/data";
import { fmtBRL, todayISO } from "@/lib/format";

type Priority = "urgent" | "attention" | "info";
type AlertRoute = "/integracoes" | "/reclamacoes" | "/reservas" | "/avaliacoes";

type HotelAlert = {
  id: string;
  priority: Priority;
  title: string;
  description: string;
  route: AlertRoute;
  source: "Booking" | "Reservas" | "Ocorrências" | "Avaliações";
};

type BookingEmailEvent = {
  id: string;
  booking_code: string;
  status: string;
  error: string | null;
  created_at: string;
};

const PRIORITY_META: Record<Priority, { label: string; icon: typeof AlertTriangle; className: string }> = {
  urgent: {
    label: "Urgente",
    icon: CircleAlert,
    className: "border-red-200 bg-red-50 text-red-900",
  },
  attention: {
    label: "Atenção",
    icon: AlertTriangle,
    className: "border-amber-200 bg-amber-50 text-amber-900",
  },
  info: {
    label: "Informativo",
    icon: Info,
    className: "border-sky-200 bg-sky-50 text-sky-900",
  },
};

export function AlertCenter({ showDashboardCard = false }: { showDashboardCard?: boolean }) {
  const company = useCurrentCompany();
  const { data: reservations = [] } = useReservations();
  const { data: complaints = [] } = useComplaints();
  const { data: feedbacks = [] } = useFeedbacks();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Priority | "all">("all");
  const today = todayISO();

  const { data: bookingEvents = [] } = useQuery({
    queryKey: ["booking_email_events_alert_center", company.data?.id],
    enabled: Boolean(company.data?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_email_events" as never)
        .select("id,booking_code,status,error,created_at")
        .eq("company_id", company.data!.id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data as unknown as BookingEmailEvent[];
    },
    refetchInterval: 60_000,
  });

  const alerts = useMemo<HotelAlert[]>(() => {
    const result: HotelAlert[] = [];

    bookingEvents.forEach((event) => {
      if (event.status === "needs_review" || event.status === "error") {
        result.push({
          id: `booking-${event.id}`,
          priority: "urgent",
          title: `Cancelamento Booking ${event.booking_code}`,
          description: event.error ?? "O cancelamento precisa de conferência manual.",
          route: "/integracoes",
          source: "Booking",
        });
      }
    });

    complaints
      .filter((item) => item.status !== "resolvido")
      .forEach((item) => {
        result.push({
          id: `complaint-${item.id}`,
          priority: item.gravidade === "alta" ? "urgent" : item.gravidade === "media" ? "attention" : "info",
          title: item.quarto ? `Ocorrência no quarto ${item.quarto}` : "Ocorrência sem quarto informado",
          description: item.descricao || `Categoria: ${item.categoria}`,
          route: "/reclamacoes",
          source: "Ocorrências",
        });
      });

    reservations
      .filter((item) => item.status !== "cancelado" && item.status !== "finalizado")
      .forEach((item) => {
        const total = Number(item.valor_total ?? 0);
        const paid = Number(item.valor_pago ?? 0);
        const balance = Math.max(0, total - paid);

        if (balance > 0 && item.checkout < today) {
          result.push({
            id: `overdue-${item.id}`,
            priority: "urgent",
            title: `Saldo vencido da reserva ${item.codigo_externo ?? item.id.slice(0, 8)}`,
            description: `${item.cliente_nome} · Quarto ${item.quarto} · Pendente ${fmtBRL(balance)}`,
            route: "/reservas",
            source: "Reservas",
          });
        } else if (paid > 0 && balance > 0) {
          result.push({
            id: `partial-${item.id}`,
            priority: "attention",
            title: `Pagamento parcial no quarto ${item.quarto}`,
            description: `${item.cliente_nome} · Pendente ${fmtBRL(balance)}`,
            route: "/reservas",
            source: "Reservas",
          });
        }

        if (item.checkin === today) {
          result.push({
            id: `arrival-${item.id}`,
            priority: "info",
            title: `Check-in previsto hoje · Quarto ${item.quarto}`,
            description: `${item.cliente_nome} · ${item.pessoas ?? 1} pessoa(s)`,
            route: "/reservas",
            source: "Reservas",
          });
        }

        if (item.checkout === today) {
          result.push({
            id: `departure-${item.id}`,
            priority: balance > 0 ? "attention" : "info",
            title: `Saída prevista hoje · Quarto ${item.quarto}`,
            description: balance > 0 ? `${item.cliente_nome} · Pendente ${fmtBRL(balance)}` : item.cliente_nome,
            route: "/reservas",
            source: "Reservas",
          });
        }
      });

    feedbacks
      .filter((item) => item.nota_geral != null && item.nota_geral <= 2)
      .slice(0, 10)
      .forEach((item) => {
        result.push({
          id: `feedback-${item.id}`,
          priority: item.nota_geral === 1 ? "urgent" : "attention",
          title: `Avaliação ${item.nota_geral}/5${item.quarto ? ` · Quarto ${item.quarto}` : ""}`,
          description: item.comentario || item.sugestao || "Avaliação baixa recebida; confira os detalhes.",
          route: "/avaliacoes",
          source: "Avaliações",
        });
      });

    return result.sort((a, b) => priorityOrder(a.priority) - priorityOrder(b.priority));
  }, [bookingEvents, complaints, feedbacks, reservations, today]);

  const counts = {
    urgent: alerts.filter((item) => item.priority === "urgent").length,
    attention: alerts.filter((item) => item.priority === "attention").length,
    info: alerts.filter((item) => item.priority === "info").length,
  };
  const actionableCount = counts.urgent + counts.attention;
  const filteredAlerts = filter === "all" ? alerts : alerts.filter((item) => item.priority === filter);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="fixed right-3 top-3 z-[70] grid h-11 w-11 place-items-center rounded-full border border-border bg-card text-pine-dark shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl sm:right-5 xl:top-5"
        aria-label={`Abrir centro de alertas. ${actionableCount} item(ns) exigem atenção.`}
      >
        <Bell className="h-5 w-5" />
        {actionableCount > 0 && (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-700 px-1 text-[10px] font-black text-white">
            {actionableCount > 99 ? "99+" : actionableCount}
          </span>
        )}
      </button>

      {showDashboardCard && (
        <section className="mb-4 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-pine" />
                <h2 className="font-serif text-lg font-bold text-pine-dark">Centro de Alertas</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Prioridades operacionais atualizadas com os dados do SistemaHotel.
              </p>
            </div>
            <button type="button" className="btn-ghost" onClick={() => setOpen(true)}>
              Ver todos
            </button>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <SummaryCount label="Urgentes" value={counts.urgent} className="border-red-200 bg-red-50 text-red-900" />
            <SummaryCount label="Atenção" value={counts.attention} className="border-amber-200 bg-amber-50 text-amber-900" />
            <SummaryCount label="Informativos" value={counts.info} className="border-sky-200 bg-sky-50 text-sky-900" />
          </div>

          <div className="mt-3 space-y-2">
            {alerts.length === 0 ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                <CheckCircle2 className="mr-2 inline h-4 w-4" /> Nenhum alerta ativo neste momento.
              </div>
            ) : (
              alerts.slice(0, 3).map((alert) => <CompactAlert key={alert.id} alert={alert} />)
            )}
          </div>
        </section>
      )}

      {open && (
        <div className="fixed inset-0 z-[80] bg-black/30" onClick={() => setOpen(false)}>
          <aside
            className="absolute right-0 top-0 flex h-full w-[min(28rem,94vw)] flex-col border-l border-border bg-card shadow-2xl"
            onClick={(event) => event.stopPropagation()}
            aria-label="Centro de alertas do hotel"
          >
            <header className="border-b border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 font-serif text-xl font-bold text-pine-dark">
                    <Bell className="h-5 w-5" /> Centro de Alertas
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Abra o item para resolver na tela responsável. Ele desaparece quando a origem for regularizada.
                  </p>
                </div>
                <button type="button" className="btn-ghost p-2" onClick={() => setOpen(false)} aria-label="Fechar alertas">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-4 grid grid-cols-4 gap-1 rounded-lg bg-muted p-1 text-xs">
                {(["all", "urgent", "attention", "info"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFilter(value)}
                    className={`rounded-md px-2 py-2 font-semibold transition ${filter === value ? "bg-card text-pine-dark shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {value === "all" ? `Todos ${alerts.length}` : `${PRIORITY_META[value].label} ${counts[value]}`}
                  </button>
                ))}
              </div>
            </header>

            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {filteredAlerts.length === 0 ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center text-sm text-emerald-900">
                  <CheckCircle2 className="mx-auto mb-2 h-6 w-6" />
                  Nenhum alerta nesta categoria.
                </div>
              ) : (
                filteredAlerts.map((alert) => <AlertItem key={alert.id} alert={alert} onOpen={() => setOpen(false)} />)
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

function AlertItem({ alert, onOpen }: { alert: HotelAlert; onOpen: () => void }) {
  const meta = PRIORITY_META[alert.priority];
  const Icon = alert.source === "Reservas" ? WalletCards : alert.source === "Booking" ? CalendarCheck : MessageSquareWarning;
  return (
    <Link
      to={alert.route}
      onClick={onOpen}
      className={`block rounded-xl border p-3 transition hover:-translate-y-0.5 hover:shadow-md ${meta.className}`}
    >
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/70">
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <strong className="text-sm">{alert.title}</strong>
            <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold uppercase">{meta.label}</span>
          </span>
          <span className="mt-1 block text-xs leading-relaxed opacity-80">{alert.description}</span>
          <span className="mt-2 block text-[11px] font-semibold">Abrir {alert.source} para resolver →</span>
        </span>
      </div>
    </Link>
  );
}

function CompactAlert({ alert }: { alert: HotelAlert }) {
  const meta = PRIORITY_META[alert.priority];
  return (
    <Link to={alert.route} className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${meta.className}`}>
      <meta.icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{alert.title}</span>
      <span className="text-[10px] font-bold uppercase">{meta.label}</span>
    </Link>
  );
}

function SummaryCount({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className={`rounded-lg border p-3 text-center ${className}`}>
      <strong className="block font-serif text-2xl">{value}</strong>
      <span className="text-[10px] font-bold uppercase tracking-wide">{label}</span>
    </div>
  );
}

function priorityOrder(priority: Priority) {
  if (priority === "urgent") return 0;
  if (priority === "attention") return 1;
  return 2;
}
