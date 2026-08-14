import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock3,
  ExternalLink,
  MessageCircle,
  Search,
  Send,
  Star,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppLayout";
import { EmptyState } from "@/components/ui-kit";
import {
  useClients,
  useCurrentCompany,
  useReservations,
  useSales,
  type Client,
  type Reservation,
} from "@/lib/data";
import { buildGuestAccount } from "@/lib/guest-account";
import { fmtDate, todayISO } from "@/lib/format";
import { createReviewMessage, whatsappPhone, whatsappUrl } from "@/lib/guest-messaging";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/mensagens")({
  component: WhatsappCrm,
});

type CrmKind = "checkin_confirmation" | "review_request";
type CrmStatus = "opened" | "sent" | "confirmed" | "replied";
type CrmEvent = {
  id: string;
  company_id: string;
  reservation_id: string;
  client_id: string | null;
  kind: CrmKind;
  status: CrmStatus;
  phone: string | null;
  message: string | null;
  metadata: Record<string, unknown>;
  occurred_at: string;
};
type CrmItem = {
  reservation: Reservation;
  client: Client;
  kind: CrmKind;
};

const KIND_META: Record<CrmKind, { title: string; description: string; icon: typeof MessageCircle }> = {
  checkin_confirmation: {
    title: "Confirmar check-in",
    description: "Reservas futuras com WhatsApp para confirmar chegada e horário aproximado.",
    icon: CheckCircle2,
  },
  review_request: {
    title: "Pedir avaliação",
    description: "Hospedagens finalizadas e quitadas que já podem receber o pedido de avaliação.",
    icon: Star,
  },
};

function WhatsappCrm() {
  const company = useCurrentCompany();
  const companyId = company.data?.id;
  const { data: reservations = [] } = useReservations();
  const { data: clients = [] } = useClients();
  const { data: sales = [] } = useSales();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<CrmKind>("checkin_confirmation");
  const [search, setSearch] = useState("");
  const [showDone, setShowDone] = useState(false);

  const eventsQuery = useQuery({
    queryKey: ["whatsapp-crm-events", companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("whatsapp_crm_events")
        .select("id,company_id,reservation_id,client_id,kind,status,phone,message,metadata,occurred_at")
        .eq("company_id", companyId)
        .order("occurred_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as CrmEvent[];
    },
  });

  const logEvent = useMutation({
    mutationFn: async ({ item, status, message }: { item: CrmItem; status: CrmStatus; message?: string }) => {
      const phone = whatsappPhone(item.client.telefone);
      const { error } = await (supabase as any).from("whatsapp_crm_events").insert({
        company_id: item.reservation.company_id,
        reservation_id: item.reservation.id,
        client_id: item.client.id,
        kind: item.kind,
        status,
        phone: phone || null,
        message: message || null,
        metadata: {
          room: item.reservation.quarto,
          checkin: item.reservation.checkin,
          checkout: item.reservation.checkout,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["whatsapp-crm-events", companyId] }),
  });

  const clientById = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients]);
  const latestByKey = useMemo(() => {
    const map = new Map<string, CrmEvent>();
    for (const event of eventsQuery.data ?? []) {
      const key = `${event.reservation_id}:${event.kind}`;
      if (!map.has(key)) map.set(key, event);
    }
    return map;
  }, [eventsQuery.data]);

  const queues = useMemo(() => {
    const result: Record<CrmKind, CrmItem[]> = { checkin_confirmation: [], review_request: [] };
    const today = todayISO();
    for (const reservation of reservations) {
      if (["cancelado", "manutencao"].includes(reservation.status)) continue;
      const client = reservation.cliente_id
        ? clientById.get(reservation.cliente_id)
        : clients.find((candidate) => candidate.nome === reservation.cliente_nome);
      if (!client || !whatsappPhone(client.telefone)) continue;

      if (reservation.status === "reservado" && reservation.checkin >= today) {
        result.checkin_confirmation.push({ reservation, client, kind: "checkin_confirmation" });
      }

      const account = buildGuestAccount(reservation, sales);
      if (reservation.status === "finalizado" && account.balance <= 0.009) {
        result.review_request.push({ reservation, client, kind: "review_request" });
      }
    }
    result.checkin_confirmation.sort((a, b) => a.reservation.checkin.localeCompare(b.reservation.checkin));
    result.review_request.sort((a, b) => b.reservation.checkout.localeCompare(a.reservation.checkout));
    return result;
  }, [clientById, clients, reservations, sales]);

  const counts = useMemo(() => {
    return {
      checkin_confirmation: queues.checkin_confirmation.filter((item) => !isDone(item, latestByKey)).length,
      review_request: queues.review_request.filter((item) => !isDone(item, latestByKey)).length,
    };
  }, [latestByKey, queues]);

  const visible = queues[kind].filter((item) => {
    if (!showDone && isDone(item, latestByKey)) return false;
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return true;
    return [item.client.nome, item.client.telefone, item.reservation.quarto, item.reservation.canal]
      .some((value) => String(value ?? "").toLocaleLowerCase("pt-BR").includes(term));
  });

  async function openWhatsApp(item: CrmItem) {
    const phone = whatsappPhone(item.client.telefone);
    if (!phone) return toast.error("O hóspede está sem WhatsApp válido.");
    const message = item.kind === "checkin_confirmation"
      ? createCheckinConfirmationMessage(item.reservation, item.client)
      : createReviewMessage(item.reservation, item.client, "");
    window.open(whatsappUrl(phone, message), "_blank", "noopener");
    try {
      await logEvent.mutateAsync({ item, status: "opened", message });
      toast.success("WhatsApp aberto com a mensagem pronta.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "WhatsApp abriu, mas o histórico não foi salvo.");
    }
  }

  async function mark(item: CrmItem, status: CrmStatus) {
    try {
      await logEvent.mutateAsync({ item, status });
      toast.success(status === "confirmed" ? "Check-in confirmado no CRM." : "Mensagem marcada como enviada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o CRM.");
    }
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title="CRM WhatsApp"
        subtitle="Confirmação de chegada e avaliação pós-hospedagem, organizadas por reserva."
      />

      <section className="grid gap-2 sm:grid-cols-2">
        {(Object.keys(KIND_META) as CrmKind[]).map((key) => {
          const meta = KIND_META[key];
          const Icon = meta.icon;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setKind(key)}
              className={`surface-card flex items-center gap-3 p-4 text-left transition ${kind === key ? "ring-2 ring-primary" : "hover:border-primary/40"}`}
            >
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${key === "checkin_confirmation" ? "bg-primary/10 text-primary" : "bg-brass-bg text-[oklch(0.48_0.12_78)]"}`}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block text-sm">{meta.title}</strong>
                <span className="mt-0.5 block text-xs text-muted-foreground">{meta.description}</span>
              </span>
              <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-black text-primary-foreground">{counts[key]}</span>
            </button>
          );
        })}
      </section>

      <section className="surface-card p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input className="field pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar hóspede, telefone ou quarto..." />
          </label>
          <button type="button" className="btn-ghost whitespace-nowrap" onClick={() => setShowDone((value) => !value)}>
            {showDone ? "Ocultar concluídos" : "Ver concluídos"}
          </button>
        </div>
      </section>

      <section className="space-y-2">
        {visible.length === 0 ? (
          <EmptyState text={showDone ? "Nenhum hóspede nesta fila." : "Tudo em dia nesta fila do CRM."} />
        ) : visible.map((item) => {
          const event = latestByKey.get(`${item.reservation.id}:${item.kind}`);
          const done = isDone(item, latestByKey);
          return (
            <article key={`${item.kind}-${item.reservation.id}`} className={`surface-card p-4 ${done ? "opacity-75" : ""}`}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="truncate text-base">{item.client.nome}</strong>
                    <StatusBadge kind={item.kind} event={event} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    UH {item.reservation.quarto} · {fmtDate(item.reservation.checkin)} → {fmtDate(item.reservation.checkout)} · {item.reservation.canal || "Direto"}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-pine-dark">{item.client.telefone}</p>
                  {event && (
                    <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Clock3 className="h-3 w-3" /> Última ação: {new Date(event.occurred_at).toLocaleString("pt-BR")}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-primary inline-flex items-center gap-1.5" onClick={() => void openWhatsApp(item)}>
                    <MessageCircle className="h-4 w-4" /> Abrir WhatsApp <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                  {event?.status !== "sent" && event?.status !== "confirmed" && (
                    <button type="button" className="btn-ghost inline-flex items-center gap-1.5" onClick={() => void mark(item, "sent")}>
                      <Send className="h-4 w-4" /> Marcar enviada
                    </button>
                  )}
                  {item.kind === "checkin_confirmation" && event?.status !== "confirmed" && (
                    <button type="button" className="btn-ghost inline-flex items-center gap-1.5" onClick={() => void mark(item, "confirmed")}>
                      <CheckCircle2 className="h-4 w-4" /> Check-in confirmado
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <section className="rounded-xl border border-primary/15 bg-primary/[0.04] p-3 text-xs text-muted-foreground">
        O CRM registra o que foi aberto, enviado e confirmado. Sem a API oficial do WhatsApp, o sistema não consegue provar sozinho que o clique em “Enviar” aconteceu dentro do WhatsApp; por isso esse status continua sob controle da recepção. A próxima camada pode interpretar respostas e horários com IA sem deixar a IA conversar livremente com o hóspede.
      </section>
    </div>
  );
}

function createCheckinConfirmationMessage(reservation: Reservation, client: Client) {
  const firstName = (client.nome || reservation.cliente_nome).trim().split(/\s+/)[0] || "hóspede";
  return [
    `Olá, ${firstName}! Tudo bem?`,
    `Sua reserva no Hotel Real Cruzília está prevista de ${fmtDate(reservation.checkin)} a ${fmtDate(reservation.checkout)}.`,
    "Podemos confirmar sua chegada? Se possível, informe também o horário aproximado em que pretende chegar.",
    "Se houver qualquer mudança, pode nos avisar por aqui. Até breve!",
  ].join("\n\n");
}

function isDone(item: CrmItem, latest: Map<string, CrmEvent>) {
  const event = latest.get(`${item.reservation.id}:${item.kind}`);
  if (!event) return false;
  if (item.kind === "checkin_confirmation") return event.status === "confirmed";
  return event.status === "sent" || event.status === "confirmed";
}

function StatusBadge({ kind, event }: { kind: CrmKind; event?: CrmEvent }) {
  if (!event) return <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">Pendente</span>;
  if (event.status === "confirmed") return <span className="rounded-full bg-sage-bg px-2 py-0.5 text-[11px] font-bold text-pine-dark">Confirmado</span>;
  if (event.status === "sent") return <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">Enviada</span>;
  if (event.status === "replied") return <span className="rounded-full bg-sage-bg px-2 py-0.5 text-[11px] font-bold text-pine-dark">Respondeu</span>;
  return <span className="rounded-full bg-brass-bg px-2 py-0.5 text-[11px] font-bold text-[oklch(0.45_0.09_75)]">WhatsApp aberto</span>;
}
