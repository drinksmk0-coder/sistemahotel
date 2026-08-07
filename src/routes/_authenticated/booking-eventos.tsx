import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Chrome, Mail, ShieldCheck, XCircle } from "lucide-react";
import { PageHeader } from "@/components/AppLayout";
import { Badge, EmptyState } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany } from "@/lib/data";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/booking-eventos")({
  component: BookingEventos,
});

type ReservationSummary = {
  id: string;
  cliente_nome: string;
  quarto: number | string;
  checkin: string;
  checkout: string;
  status: string;
};

type PortalRow = {
  id: string;
  source: "email" | "chrome";
  booking_code: string;
  status: string;
  event_type: string | null;
  reservation_id: string | null;
  previous_status: string | null;
  new_status: string | null;
  error: string | null;
  received_at: string;
  guest_name: string | null;
  room_type: string | null;
  checkin_text: string | null;
  checkout_text: string | null;
  total_text: string | null;
  guests_text: string | null;
  booking_status_text: string | null;
  reservation: ReservationSummary | null;
};

function BookingEventos() {
  const current = useCurrentCompany();
  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: ["booking-events-portal", current.data?.id],
    enabled: !!current.data?.id,
    queryFn: async (): Promise<PortalRow[]> => {
      const companyId = current.data!.id;

      const [{ data: emailData, error: emailError }, { data: browserData, error: browserError }] = await Promise.all([
        (supabase as any)
          .from("booking_email_events")
          .select("id,booking_code,status,reservation_id,previous_status,new_status,error,received_at,created_at")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false }),
        (supabase as any)
          .from("booking_browser_events")
          .select("id,booking_code,status,event_type,guest_name,checkin_text,checkout_text,total_text,guests_text,room_type,booking_status_text,captured_at")
          .eq("company_id", companyId)
          .order("captured_at", { ascending: false }),
      ]);

      if (emailError) throw emailError;
      if (browserError) throw browserError;

      const emailEvents = (emailData ?? []).map((event: any) => ({
        id: event.id,
        source: "email" as const,
        booking_code: event.booking_code,
        status: event.status,
        event_type: null,
        reservation_id: event.reservation_id,
        previous_status: event.previous_status,
        new_status: event.new_status,
        error: event.error,
        received_at: event.received_at ?? event.created_at,
        guest_name: null,
        room_type: null,
        checkin_text: null,
        checkout_text: null,
        total_text: null,
        guests_text: null,
        booking_status_text: null,
      }));

      const browserEvents = (browserData ?? []).map((event: any) => ({
        id: event.id,
        source: "chrome" as const,
        booking_code: event.booking_code,
        status: event.status,
        event_type: event.event_type,
        reservation_id: null,
        previous_status: null,
        new_status: null,
        error: null,
        received_at: event.captured_at,
        guest_name: event.guest_name,
        room_type: event.room_type,
        checkin_text: event.checkin_text,
        checkout_text: event.checkout_text,
        total_text: event.total_text,
        guests_text: event.guests_text,
        booking_status_text: event.booking_status_text,
      }));

      const reservationIds = [...new Set(emailEvents.map((event: any) => event.reservation_id).filter(Boolean))] as string[];
      let reservations: ReservationSummary[] = [];

      if (reservationIds.length > 0) {
        const { data: reservationData, error: reservationError } = await (supabase as any)
          .from("reservations")
          .select("id,cliente_nome,quarto,checkin,checkout,status")
          .eq("company_id", companyId)
          .in("id", reservationIds);
        if (reservationError) throw reservationError;
        reservations = (reservationData ?? []) as ReservationSummary[];
      }

      const byId = new Map(reservations.map((reservation) => [reservation.id, reservation]));
      const combined: PortalRow[] = [...emailEvents, ...browserEvents].map((event: any) => ({
        ...event,
        reservation: event.reservation_id ? byId.get(event.reservation_id) ?? null : null,
      }));

      return combined.sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime());
    },
    refetchInterval: 30_000,
  });

  return (
    <div>
      <PageHeader
        title="Portal de Eventos da Booking"
        subtitle="Eventos recebidos por e-mail e pela extensão do Chrome para a empresa atual."
      />

      <div className="mb-5 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="font-semibold">Histórico protegido</p>
          <p className="text-sm">Este portal não possui ações para excluir reservas, hóspedes, pagamentos ou histórico.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="card-surface p-6 text-sm text-muted-foreground">Carregando eventos da Booking...</div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Não foi possível carregar os eventos: {error instanceof Error ? error.message : "erro desconhecido"}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState text="Nenhum evento da Booking encontrado para esta empresa." />
      ) : (
        <div className="card-surface overflow-x-auto">
          <table className="w-full min-w-[1180px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="p-3">Origem</th>
                <th className="p-3">Recebido</th>
                <th className="p-3">Hóspede</th>
                <th className="p-3">Quarto/Acomodação</th>
                <th className="p-3">Check-in</th>
                <th className="p-3">Checkout</th>
                <th className="p-3">Código Booking</th>
                <th className="p-3">Valor</th>
                <th className="p-3">Status</th>
                <th className="p-3">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((event) => (
                <tr key={`${event.source}-${event.id}`} className="border-b border-border/50 align-top">
                  <td className="p-3">{sourceBadge(event.source)}</td>
                  <td className="whitespace-nowrap p-3">{fmtDate(event.received_at.slice(0, 10))}</td>
                  <td className="p-3 font-semibold">{event.guest_name ?? event.reservation?.cliente_nome ?? "Reserva não localizada"}</td>
                  <td className="p-3">{event.room_type ?? event.reservation?.quarto ?? "—"}</td>
                  <td className="whitespace-nowrap p-3">{event.checkin_text ?? (event.reservation?.checkin ? fmtDate(event.reservation.checkin) : "—")}</td>
                  <td className="whitespace-nowrap p-3">{event.checkout_text ?? (event.reservation?.checkout ? fmtDate(event.reservation.checkout) : "—")}</td>
                  <td className="p-3 font-mono text-xs">{event.booking_code}</td>
                  <td className="p-3">{event.total_text ?? "—"}</td>
                  <td className="p-3">
                    <span className="inline-flex items-center gap-1.5">
                      {statusIcon(event.status)}
                      <Badge tone={statusTone(event.status)}>{event.booking_status_text ?? statusLabel(event.status)}</Badge>
                    </span>
                  </td>
                  <td className="max-w-[360px] p-3 text-muted-foreground">{resultLabel(event)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function sourceBadge(source: PortalRow["source"]) {
  if (source === "chrome") {
    return <Badge tone="sage"><span className="inline-flex items-center gap-1"><Chrome className="h-3.5 w-3.5" />Extensão Chrome</span></Badge>;
  }
  return <Badge tone="slate"><span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" />E-mail</span></Badge>;
}

function statusIcon(status: string) {
  if (status === "processed") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (status === "already_cancelled") return <CheckCircle2 className="h-4 w-4 text-slate-500" />;
  if (status === "needs_review") return <AlertTriangle className="h-4 w-4 text-amber-600" />;
  return <XCircle className="h-4 w-4 text-red-600" />;
}

function statusTone(status: string): "sage" | "slate" | "brass" | "brick" {
  if (status === "processed") return "sage";
  if (status === "already_cancelled") return "slate";
  if (status === "needs_review") return "brass";
  return "brick";
}

function statusLabel(status: string) {
  if (status === "processed") return "Processado";
  if (status === "already_cancelled") return "Já cancelada";
  if (status === "needs_review") return "Revisão manual";
  return "Erro";
}

function resultLabel(event: PortalRow) {
  if (event.source === "chrome") {
    if (event.event_type === "cancellation_details") return "Cancelamento capturado pela extensão e aguardando conferência.";
    return "Reserva capturada pela extensão e aguardando conferência.";
  }
  if (event.error) return event.error;
  if (event.status === "processed") {
    return `Reserva alterada de ${event.previous_status ?? "reservado"} para ${event.new_status ?? "cancelado"}.`;
  }
  if (event.status === "already_cancelled") return "A reserva já estava cancelada; nenhuma alteração adicional foi feita.";
  if (event.status === "needs_review") return "O evento foi preservado e aguarda conferência manual; nenhum registro foi excluído.";
  return "Evento recebido, sem resultado de cancelamento confirmado.";
}
