import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Check,
  ClipboardCheck,
  CreditCard,
  ExternalLink,
  FileSignature,
  MessageCircle,
  RefreshCcw,
  Settings2,
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
import { buildGuestAccount, type GuestAccount } from "@/lib/guest-account";
import { fmtBRL, fmtDate, todayISO } from "@/lib/format";
import {
  createDebtMessage,
  createFnrhMessage,
  createReviewMessage,
  type GuestMessageKind,
  type GuestMessageSettings,
  whatsappPhone,
  whatsappUrl,
} from "@/lib/guest-messaging";

export const Route = createFileRoute("/_authenticated/mensagens")({
  component: GuestMessages,
});

type MessageLog = {
  reservationId: string;
  kind: GuestMessageKind;
  preparedAt: string;
};

type QueueItem = {
  reservation: Reservation;
  client: Client;
  account: GuestAccount;
  kind: GuestMessageKind;
};

const KIND_META: Record<
  GuestMessageKind,
  { title: string; description: string; icon: typeof MessageCircle; tone: string }
> = {
  fnrh: {
    title: "Enviar FNRH",
    description: "Reservas confirmadas, inclusive Booking, aguardando pré-check-in.",
    icon: FileSignature,
    tone: "text-primary bg-primary/10",
  },
  cobranca: {
    title: "Cobrar saldo",
    description: "Hóspedes em estadia ou check-out com hospedagem/consumos pendentes.",
    icon: CreditCard,
    tone: "text-brick bg-brick-bg",
  },
  avaliacao: {
    title: "Pedir avaliação",
    description: "Check-outs concluídos e totalmente quitados.",
    icon: Star,
    tone: "text-[oklch(0.48_0.12_78)] bg-brass-bg",
  },
};

function GuestMessages() {
  const company = useCurrentCompany();
  const { data: reservations = [] } = useReservations();
  const { data: clients = [] } = useClients();
  const { data: sales = [] } = useSales();
  const companyId = company.data?.id ?? "default";
  const [activeKind, setActiveKind] = useState<GuestMessageKind>("cobranca");
  const [showSettings, setShowSettings] = useState(false);
  const [showPrepared, setShowPrepared] = useState(false);
  const [settings, setSettings] = useState<GuestMessageSettings>(() =>
    readSettings(companyId),
  );
  const [logs, setLogs] = useState<MessageLog[]>(() => readLogs(companyId));
  const clientById = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients]);

  const queues = useMemo(() => {
    const result: Record<GuestMessageKind, QueueItem[]> = {
      fnrh: [],
      cobranca: [],
      avaliacao: [],
    };
    const today = todayISO();

    reservations.forEach((reservation) => {
      if (reservation.status === "cancelado" || reservation.status === "manutencao") return;
      const client = reservation.cliente_id
        ? clientById.get(reservation.cliente_id)
        : clients.find((item) => item.nome === reservation.cliente_nome);
      if (!client || !whatsappPhone(client.telefone)) return;
      const account = buildGuestAccount(reservation, sales);
      const total = Math.max(0, Number(reservation.valor_total) || 0);
      const signalConfirmed = total > 0 && Number(reservation.valor_pago) >= total * 0.5;
      const bookingConfirmed = String(reservation.canal ?? "").toLocaleLowerCase("pt-BR").includes("booking");

      if (
        (signalConfirmed || bookingConfirmed) &&
        reservation.status === "reservado" &&
        reservation.checkin >= today
      ) {
        result.fnrh.push({ reservation, client, account, kind: "fnrh" });
      }
      if (
        account.balance > 0 &&
        (reservation.status === "ocupado" ||
          reservation.status === "finalizado" ||
          reservation.checkout <= today)
      ) {
        result.cobranca.push({ reservation, client, account, kind: "cobranca" });
      }
      if (reservation.status === "finalizado" && account.balance <= 0) {
        result.avaliacao.push({ reservation, client, account, kind: "avaliacao" });
      }
    });

    result.fnrh.sort((a, b) => a.reservation.checkin.localeCompare(b.reservation.checkin));
    result.cobranca.sort((a, b) => b.account.balance - a.account.balance);
    result.avaliacao.sort((a, b) => b.reservation.checkout.localeCompare(a.reservation.checkout));
    return result;
  }, [clientById, clients, reservations, sales]);

  const visibleItems = queues[activeKind].filter(
    (item) => showPrepared || !wasPrepared(logs, item.reservation.id, activeKind),
  );

  function saveSettings() {
    window.localStorage.setItem(settingsKey(companyId), JSON.stringify(settings));
    setShowSettings(false);
    toast.success("Configurações das mensagens salvas neste dispositivo.");
  }

  function registerPrepared(item: QueueItem) {
    const next = [
      ...logs.filter(
        (entry) =>
          !(entry.reservationId === item.reservation.id && entry.kind === item.kind),
      ),
      {
        reservationId: item.reservation.id,
        kind: item.kind,
        preparedAt: new Date().toISOString(),
      },
    ];
    setLogs(next);
    window.localStorage.setItem(logKey(companyId), JSON.stringify(next));
  }

  async function prepare(item: QueueItem) {
    const phone = whatsappPhone(item.client.telefone);
    if (!phone) {
      toast.error("O cliente está sem telefone válido.");
      return;
    }
    try {
      const message =
        item.kind === "fnrh"
          ? await createFnrhMessage(item.reservation, item.client)
          : item.kind === "cobranca"
            ? createDebtMessage(item.reservation, item.client, item.account, settings.pixKey)
            : createReviewMessage(item.reservation, item.client, settings.reviewUrl);
      window.open(whatsappUrl(phone, message), "_blank", "noopener");
      registerPrepared(item);
      toast.success("Conversa aberta com a mensagem pronta. Confirme o envio no WhatsApp.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível preparar a mensagem.");
    }
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title="Mensagens aos hóspedes"
        subtitle="Prepare FNRH, cobranças e avaliações usando os dados reais da hospedagem."
        action={
          <button className="btn-ghost flex items-center gap-2" onClick={() => setShowSettings((v) => !v)}>
            <Settings2 className="h-4 w-4" /> Configurar
          </button>
        }
      />

      {showSettings && (
        <section className="surface-card grid gap-3 p-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold">Chave Pix do hotel</span>
            <input
              className="field"
              value={settings.pixKey}
              onChange={(event) => setSettings((current) => ({ ...current, pixKey: event.target.value }))}
              placeholder="CPF, CNPJ, telefone, e-mail ou chave aleatória"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold">Link externo de avaliação (opcional)</span>
            <input
              className="field"
              value={settings.reviewUrl}
              onChange={(event) =>
                setSettings((current) => ({ ...current, reviewUrl: event.target.value }))
              }
              placeholder="Vazio = formulário de avaliação do sistema"
            />
          </label>
          <button className="btn-primary" onClick={saveSettings}>
            Salvar
          </button>
          <p className="text-xs text-muted-foreground md:col-span-3">
            Esses dados ficam neste navegador. A mensagem nunca marca pagamento como confirmado:
            o comprovante ainda precisa ser conferido pela recepção.
          </p>
        </section>
      )}

      <section className="grid gap-2 sm:grid-cols-3">
        {(Object.keys(KIND_META) as GuestMessageKind[]).map((kind) => {
          const meta = KIND_META[kind];
          const Icon = meta.icon;
          const pending = queues[kind].filter(
            (item) => !wasPrepared(logs, item.reservation.id, kind),
          ).length;
          return (
            <button
              key={kind}
              onClick={() => setActiveKind(kind)}
              className={`surface-card flex min-h-24 items-center gap-3 p-3 text-left transition ${
                activeKind === kind ? "ring-2 ring-primary" : "hover:border-primary/40"
              }`}
            >
              <span className={`rounded-xl p-2.5 ${meta.tone}`}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold">{meta.title}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{meta.description}</span>
                <span className="mt-1 block text-xs font-semibold text-primary">
                  {pending} pendente(s)
                </span>
              </span>
            </button>
          );
        })}
      </section>

      <section className="surface-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
          <div>
            <h2 className="font-bold">{KIND_META[activeKind].title}</h2>
            <p className="text-xs text-muted-foreground">
              O sistema apenas prepara a conversa; confirme o envio no WhatsApp.
            </p>
          </div>
          <button
            className="btn-ghost flex items-center gap-1.5 text-xs"
            onClick={() => setShowPrepared((value) => !value)}
          >
            {showPrepared ? <RefreshCcw className="h-3.5 w-3.5" /> : <ClipboardCheck className="h-3.5 w-3.5" />}
            {showPrepared ? "Ocultar preparadas" : "Ver preparadas"}
          </button>
        </div>

        {visibleItems.length === 0 ? (
          <EmptyState
            text={
              showPrepared
                ? "Nenhuma mensagem nesta fila."
                : "Nenhuma mensagem pendente. Os itens preparados ficam ocultos para evitar repetição."
            }
          />
        ) : (
          <div className="divide-y">
            {visibleItems.map((item) => {
              const prepared = wasPrepared(logs, item.reservation.id, item.kind);
              return (
                <article
                  key={`${item.kind}-${item.reservation.id}`}
                  className="grid gap-3 p-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="truncate">{item.client.nome}</strong>
                      {prepared && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-sage-bg px-2 py-0.5 text-[11px] font-semibold text-pine-dark">
                          <Check className="h-3 w-3" /> Preparada
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Quarto {item.reservation.quarto} · {fmtDate(item.reservation.checkin)} a{" "}
                      {fmtDate(item.reservation.checkout)} · {item.client.telefone}
                    </p>
                  </div>
                  <div className="text-xs">
                    {item.kind === "cobranca" ? (
                      <>
                        <strong className="block text-sm text-brick">{fmtBRL(item.account.balance)}</strong>
                        <span className="text-muted-foreground">
                          Hospedagem {fmtBRL(item.account.lodgingTotal - item.account.lodgingPaid)}
                          {" · "}Consumos {fmtBRL(item.account.extrasTotal - item.account.extrasPaid)}
                        </span>
                      </>
                    ) : item.kind === "fnrh" ? (
                      <span className="text-muted-foreground">
                        Sinal recebido: {fmtBRL(item.account.lodgingPaid)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Conta quitada · check-out concluído</span>
                    )}
                  </div>
                  <button
                    className="btn-primary flex items-center justify-center gap-1.5 whitespace-nowrap"
                    onClick={() => void prepare(item)}
                  >
                    <MessageCircle className="h-4 w-4" />
                    {prepared ? "Abrir novamente" : "Preparar"}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function settingsKey(companyId: string) {
  return `hotelreal.guestMessages.settings.${companyId}`;
}

function logKey(companyId: string) {
  return `hotelreal.guestMessages.log.${companyId}`;
}

function readSettings(companyId: string): GuestMessageSettings {
  if (typeof window === "undefined") return { pixKey: "", reviewUrl: "" };
  try {
    const value = JSON.parse(window.localStorage.getItem(settingsKey(companyId)) ?? "{}");
    return {
      pixKey: String(value.pixKey ?? ""),
      reviewUrl: String(value.reviewUrl ?? ""),
    };
  } catch {
    return { pixKey: "", reviewUrl: "" };
  }
}

function readLogs(companyId: string): MessageLog[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(logKey(companyId)) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function wasPrepared(logs: MessageLog[], reservationId: string, kind: GuestMessageKind) {
  return logs.some((entry) => entry.reservationId === reservationId && entry.kind === kind);
}
