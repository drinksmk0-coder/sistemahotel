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
  UserRound,
  WalletCards,
  BedDouble,
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
import { fmtBRL, fmtDate, todayISO } from "@/lib/format";
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
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

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

  const counts = useMemo(() => ({
    checkin_confirmation: queues.checkin_confirmation.filter((item) => !isDone(item, latestByKey)).length,
    review_request: queues.review_request.filter((item) => !isDone(item, latestByKey)).length,
  }), [latestByKey, queues]);

  const visible = queues[kind].filter((item) => {
    if (!showDone && isDone(item, latestByKey)) return false;
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return true;
    return [item.client.nome, item.client.telefone, item.reservation.quarto, item.reservation.canal]
      .some((value) => String(value ?? "").toLocaleLowerCase("pt-BR").includes(term));
  });

  const selected = visible.find((item) => `${item.kind}-${item.reservation.id}` === selectedKey) ?? visible[0] ?? null;
  const selectedEvent = selected ? latestByKey.get(`${selected.reservation.id}:${selected.kind}`) : undefined;
  const selectedAccount = selected ? buildGuestAccount(selected.reservation, sales) : null;

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
      <PageHeader title="CRM WhatsApp" subtitle="Jornada do hóspede, confirmação de chegada e pós-estadia em uma única tela." />

      <section className="grid gap-3 xl:grid-cols-[230px_minmax(0,1fr)_340px]">
        <aside className="surface-card h-fit overflow-hidden xl:sticky xl:top-3">
          <div className="border-b p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Filas</p>
          </div>
          <div className="space-y-1 p-2">
            {(Object.keys(KIND_META) as CrmKind[]).map((key) => {
              const meta = KIND_META[key];
              const Icon = meta.icon;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setKind(key); setSelectedKey(null); }}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2.5 text-left transition ${kind === key ? "bg-primary text-primary-foreground" : "hover:bg-muted/60"}`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-xs">{meta.title}</strong>
                    <span className={`block truncate text-[10px] ${kind === key ? "text-primary-foreground/75" : "text-muted-foreground"}`}>{meta.description}</span>
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${kind === key ? "bg-white/20" : "bg-muted"}`}>{counts[key]}</span>
                </button>
              );
            })}
          </div>
          <div className="border-t p-3">
            <button type="button" className="btn-ghost w-full text-xs" onClick={() => setShowDone((value) => !value)}>
              {showDone ? "Ocultar concluídos" : "Ver concluídos"}
            </button>
          </div>
        </aside>

        <main className="min-w-0 space-y-2">
          <section className="surface-card p-3">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input className="field pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar hóspede, telefone, quarto ou canal..." />
            </label>
          </section>

          {visible.length === 0 ? (
            <EmptyState text={showDone ? "Nenhum hóspede nesta fila." : "Tudo em dia nesta fila do CRM."} />
          ) : (
            <section className="surface-card overflow-hidden divide-y">
              {visible.map((item) => {
                const event = latestByKey.get(`${item.reservation.id}:${item.kind}`);
                const key = `${item.kind}-${item.reservation.id}`;
                const active = selected ? key === `${selected.kind}-${selected.reservation.id}` : false;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedKey(key)}
                    className={`flex w-full items-center gap-3 p-3 text-left transition ${active ? "bg-primary/[0.07]" : "hover:bg-muted/35"}`}
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                      <UserRound className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <strong className="truncate text-sm">{item.client.nome}</strong>
                        <StatusBadge event={event} />
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        UH {item.reservation.quarto} · {fmtDate(item.reservation.checkin)} → {fmtDate(item.reservation.checkout)} · {item.reservation.canal || "Direto"}
                      </span>
                    </span>
                    <span className="hidden shrink-0 text-[10px] font-semibold text-muted-foreground sm:block">
                      {event ? new Date(event.occurred_at).toLocaleDateString("pt-BR") : "Pendente"}
                    </span>
                  </button>
                );
              })}
            </section>
          )}
        </main>

        <aside className="surface-card h-fit overflow-hidden xl:sticky xl:top-3">
          {selected ? (
            <>
              <div className="border-b p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Contato</p>
                    <h2 className="mt-1 truncate text-base font-black text-pine-dark">{selected.client.nome}</h2>
                    <p className="text-xs text-muted-foreground">{maskPhone(selected.client.telefone)}</p>
                  </div>
                  <StatusBadge event={selectedEvent} />
                </div>
              </div>

              <div className="space-y-3 p-4">
                <InfoRow icon={<BedDouble className="h-4 w-4" />} label="Reserva" value={`UH ${selected.reservation.quarto} · ${fmtDate(selected.reservation.checkin)} a ${fmtDate(selected.reservation.checkout)}`} />
                <InfoRow icon={<WalletCards className="h-4 w-4" />} label="Financeiro" value={selectedAccount ? `${fmtBRL(selectedAccount.paid)} pago · ${fmtBRL(selectedAccount.balance)} em aberto` : "Sem dados"} />
                <InfoRow icon={<Clock3 className="h-4 w-4" />} label="Última interação" value={selectedEvent ? new Date(selectedEvent.occurred_at).toLocaleString("pt-BR") : "Nenhuma interação registrada"} />

                <div className="rounded-xl border bg-muted/20 p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">Próxima ação</p>
                  <p className="mt-1 text-sm font-bold text-pine-dark">{selected.kind === "checkin_confirmation" ? "Confirmar chegada e horário" : "Solicitar avaliação da hospedagem"}</p>
                </div>

                <div className="grid gap-2">
                  <button type="button" className="btn-primary flex items-center justify-center gap-1.5" onClick={() => void openWhatsApp(selected)}>
                    <MessageCircle className="h-4 w-4" /> Abrir WhatsApp <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                  {selectedEvent?.status !== "sent" && selectedEvent?.status !== "confirmed" && (
                    <button type="button" className="btn-ghost flex items-center justify-center gap-1.5" onClick={() => void mark(selected, "sent")}>
                      <Send className="h-4 w-4" /> Marcar como enviada
                    </button>
                  )}
                  {selected.kind === "checkin_confirmation" && selectedEvent?.status !== "confirmed" && (
                    <button type="button" className="btn-ghost flex items-center justify-center gap-1.5" onClick={() => void mark(selected, "confirmed")}>
                      <CheckCircle2 className="h-4 w-4" /> Check-in confirmado
                    </button>
                  )}
                </div>

                <div className="border-t pt-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">Linha do tempo</p>
                  <div className="mt-2 space-y-2">
                    {(eventsQuery.data ?? [])
                      .filter((event) => event.reservation_id === selected.reservation.id && event.kind === selected.kind)
                      .slice(0, 5)
                      .map((event) => (
                        <div key={event.id} className="rounded-lg border bg-card p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <strong className="text-xs">{statusLabel(event.status)}</strong>
                            <span className="text-[10px] text-muted-foreground">{new Date(event.occurred_at).toLocaleString("pt-BR")}</span>
                          </div>
                        </div>
                      ))}
                    {!selectedEvent && <p className="text-xs text-muted-foreground">Nenhum evento registrado ainda.</p>}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="p-6 text-center text-sm text-muted-foreground">Selecione um contato para ver os detalhes.</div>
          )}
        </aside>
      </section>

      <section className="rounded-xl border border-primary/15 bg-primary/[0.04] p-3 text-xs text-muted-foreground">
        Preview: o CRM diferencia “WhatsApp aberto” de “mensagem enviada”. Sem API oficial, o envio continua sendo confirmado manualmente pela recepção.
      </section>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 text-primary">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-xs font-semibold text-pine-dark">{value}</p>
      </div>
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

function StatusBadge({ event }: { event?: CrmEvent }) {
  if (!event) return <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">Pendente</span>;
  if (event.status === "confirmed") return <span className="rounded-full bg-sage-bg px-2 py-0.5 text-[10px] font-bold text-pine-dark">Confirmado</span>;
  if (event.status === "sent") return <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">Enviada</span>;
  if (event.status === "replied") return <span className="rounded-full bg-sage-bg px-2 py-0.5 text-[10px] font-bold text-pine-dark">Respondeu</span>;
  return <span className="rounded-full bg-brass-bg px-2 py-0.5 text-[10px] font-bold text-[oklch(0.45_0.09_75)]">WhatsApp aberto</span>;
}

function statusLabel(status: CrmStatus) {
  if (status === "confirmed") return "Check-in confirmado";
  if (status === "sent") return "Mensagem marcada como enviada";
  if (status === "replied") return "Resposta registrada";
  return "WhatsApp aberto";
}

function maskPhone(value?: string | null) {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length < 8) return "Telefone protegido";
  return `(**) *****-${digits.slice(-4)}`;
}
