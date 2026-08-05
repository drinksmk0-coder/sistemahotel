import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ShieldCheck, XCircle } from "lucide-react";
import { PageHeader } from "@/components/AppLayout";
import { Badge, EmptyState } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany } from "@/lib/data";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/booking-eventos")({
  component: BookingEventos,
});

type BookingEmailEvent = {
  id: string;
  booking_code: string;
  status: string;
  reservation_id: string | null;
  previous_status: string | null;
  new_status: string | null;
  error: string | null;
  received_at: string | null;
  created_at: string;
};

type ReservationSummary = {
  id: string;
  cliente_nome: string;
  quarto: number | string;
  checkin: string;
  checkout: string;
  status: string;
};

type PortalRow = BookingEmailEvent & { reservation: ReservationSummary | null };

function BookingEventos() {
  const current = useCurrentCompany();
  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: ["booking-events-portal", current.data?.id],
    enabled: !!current.data?.id,
    queryFn: async (): Promise<PortalRow[]> => {
      const companyId = current.data!.id;
      const { data: eventData, error: eventError } = await (supabase as any)
        .from("booking_email_events")
        .select("id,booking_code,status,reservation_id,previous_status,new_status,error,received_at,created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (eventError) throw eventError;

      const events = (eventData ?? []) as unknown as BookingEmailEvent[];
      const reservationIds = [...new Set(events.map((event) => event.reservation_id).filter(Boolean))] as string[];
      let reservations: ReservationSummary[] = [];

      if (reservationIds.length > 0) {
        const { data: reservationData, error: reservationError } = await (supabase as any)
          .from("reservations")
          .select("id,cliente_nome,quarto,checkin,checkout,status")
          .eq("company_id", companyId)
          .in("id", reservationIds);
        if (reservationError) throw reservationError;
        reservations = (reservationData ?? []) as unknown as ReservationSummary[];
      }

      const byId = new Map(reservations.map((reservation) => [reservation.id, reservation]));
      return events.map((event) => ({
        ...event,
        reservation: event.reservation_id ? byId.get(event.reservation_id) ?? null : null,
      }));
    },
    refetchInterval: 60_000,
  });

  return (
    <div>
      <PageHeader
        title="Portal de Eventos da Booking"
        subtitle="Consulta autenticada e somente leitura dos eventos recebidos para a empresa atual."
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
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="p-3">Recebido</th>
                <th className="p-3">Hóspede</th>
                <th className="p-3">Quarto</th>
                <th className="p-3">Check-in</th>
                <th className="p-3">Checkout</th>
                <th className="p-3">Código Booking</th>
                <th className="p-3">Status</th>
                <th className="p-3">Resultado do cancelamento</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((event) => (
                <tr key={event.id} className="border-b border-border/50 align-top">
                  <td className="whitespace-nowrap p-3">{fmtDate((event.received_at ?? event.created_at).slice(0, 10))}</td>
                  <td className="p-3 font-semibold">{event.reservation?.cliente_nome ?? "Reserva não localizada"}</td>
                  <td className="p-3">{event.reservation?.quarto ?? "—"}</td>
                  <td className="whitespace-nowrap p-3">{event.reservation?.checkin ? fmtDate(event.reservation.checkin) : "—"}</td>
                  <td className="whitespace-nowrap p-3">{event.reservation?.checkout ? fmtDate(event.reservation.checkout) : "—"}</td>
                  <td className="p-3 font-mono text-xs">{event.booking_code}</td>
                  <td className="p-3">
                    <span className="inline-flex items-center gap-1.5">
                      {statusIcon(event.status)}
                      <Badge tone={statusTone(event.status)}>{statusLabel(event.status)}</Badge>
                    </span>
                  </td>
                  <td className="max-w-[360px] p-3 text-muted-foreground">{cancelResult(event)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
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

function cancelResult(event: BookingEmailEvent) {
  if (event.error) return event.error;
  if (event.status === "processed") {
    return `Reserva alterada de ${event.previous_status ?? "reservado"} para ${event.new_status ?? "cancelado"}.`;
  }
  if (event.status === "already_cancelled") return "A reserva já estava cancelada; nenhuma alteração adicional foi feita.";
  if (event.status === "needs_review") return "O evento foi preservado e aguarda conferência manual; nenhum registro foi excluído.";
  return "Evento recebido, sem resultado de cancelamento confirmado.";
}
