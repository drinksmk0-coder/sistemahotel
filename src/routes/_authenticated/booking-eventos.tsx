import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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

type RoomOption = { numero: number; configuracao: string | null };

function BookingEventos() {
  const current = useCurrentCompany();
  const queryClient = useQueryClient();
  const [selectedRooms, setSelectedRooms] = useState<Record<string, string>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);

  const { data: rooms = [] } = useQuery({
    queryKey: ["booking-events-rooms", current.data?.id],
    enabled: !!current.data?.id,
    queryFn: async (): Promise<RoomOption[]> => {
      const { data, error } = await (supabase as any)
        .from("rooms")
        .select("numero,configuracao")
        .eq("company_id", current.data!.id)
        .order("numero");
      if (error) throw error;
      return (data ?? []) as RoomOption[];
    },
  });

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
          .select("id,booking_code,status,event_type,reservation_id,previous_status,new_status,error,guest_name,checkin_text,checkout_text,total_text,guests_text,room_type,booking_status_text,captured_at")
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
        reservation_id: event.reservation_id,
        previous_status: event.previous_status,
        new_status: event.new_status,
        error: event.error,
        received_at: event.captured_at,
        guest_name: event.guest_name,
        room_type: event.room_type,
        checkin_text: event.checkin_text,
        checkout_text: event.checkout_text,
        total_text: event.total_text,
        guests_text: event.guests_text,
        booking_status_text: event.booking_status_text,
      }));

      const allEvents = [...emailEvents, ...browserEvents];
      const reservationIds = [...new Set(allEvents.map((event: any) => event.reservation_id).filter(Boolean))] as string[];
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
      const combined: PortalRow[] = allEvents.map((event: any) => ({
        ...event,
        reservation: event.reservation_id ? byId.get(event.reservation_id) ?? null : null,
      }));

      return combined.sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime());
    },
    refetchInterval: 30_000,
  });

  async function createReservation(event: PortalRow) {
    if (!current.data?.id || event.source !== "chrome" || event.event_type !== "reservation_details") return;
    const roomNumber = Number(selectedRooms[event.id]);
    if (!Number.isFinite(roomNumber)) {
      window.alert("Selecione o quarto antes de criar a reserva.");
      return;
    }

    const checkin = parseBookingDate(event.checkin_text);
    const checkout = parseBookingDate(event.checkout_text);
    if (!checkin || !checkout || !event.guest_name) {
      window.alert("A Booking não forneceu todos os dados necessários para criar a reserva.");
      return;
    }

    setProcessingId(event.id);
    try {
      const companyId = current.data.id;
      const { data: existing } = await (supabase as any)
        .from("reservations")
        .select("id,status")
        .eq("company_id", companyId)
        .eq("codigo_externo", event.booking_code)
        .maybeSingle();

      if (existing?.id) {
        await (supabase as any)
          .from("booking_browser_events")
          .update({ status: "processed", reservation_id: existing.id, processed_at: new Date().toISOString(), error: null })
          .eq("id", event.id)
          .eq("company_id", companyId);
        await queryClient.invalidateQueries({ queryKey: ["booking-events-portal", companyId] });
        return;
      }

      const { data: conflicts, error: conflictError } = await (supabase as any)
        .from("reservations")
        .select("id,cliente_nome,checkin,checkout,status")
        .eq("company_id", companyId)
        .eq("quarto", roomNumber)
        .in("status", ["reservado", "ocupado"])
        .lt("checkin", checkout)
        .gt("checkout", checkin);
      if (conflictError) throw conflictError;
      if ((conflicts ?? []).length > 0) {
        window.alert("Esse quarto já possui uma reserva no período. Escolha outro quarto.");
        return;
      }

      const days = Math.max(1, Math.round((Date.parse(`${checkout}T12:00:00`) - Date.parse(`${checkin}T12:00:00`)) / 86400000));
      const total = parseMoney(event.total_text);
      const people = parsePeople(event.guests_text);
      const { data: auth } = await supabase.auth.getUser();

      const { data: reservation, error: reservationError } = await (supabase as any)
        .from("reservations")
        .insert({
          quarto: roomNumber,
          cliente_nome: event.guest_name,
          checkin,
          checkout,
          diarias: days,
          valor_diaria: total / days,
          valor_total: total,
          pagamento: "-",
          pago: false,
          valor_pago: 0,
          pessoas: people,
          desconto: 0,
          status: "reservado",
          canal: "Booking",
          company_id: companyId,
          created_by: auth.user?.id ?? null,
          presence_status: "aguardando",
          codigo_externo: event.booking_code,
          origem_importacao: "booking_chrome_extension",
          observacoes_importacao: event.room_type ? `Acomodação Booking: ${event.room_type}` : "Reserva importada da Booking pela extensão Chrome.",
        })
        .select("id")
        .single();
      if (reservationError) throw reservationError;

      await (supabase as any)
        .from("booking_browser_events")
        .update({
          status: "processed",
          reservation_id: reservation.id,
          previous_status: null,
          new_status: "reservado",
          processed_at: new Date().toISOString(),
          reviewed_at: new Date().toISOString(),
          reviewed_by: auth.user?.id ?? null,
          error: null,
        })
        .eq("id", event.id)
        .eq("company_id", companyId);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["booking-events-portal", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["reservations"] }),
      ]);
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : "Não foi possível criar a reserva.");
    } finally {
      setProcessingId(null);
    }
  }

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
          <p className="text-sm">Cancelamentos seguros são aplicados sem excluir reservas, hóspedes, pagamentos ou histórico. Reservas novas exigem apenas a escolha do quarto quando a Booking não informa um número específico.</p>
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
          <table className="w-full min-w-[1320px] text-sm">
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
                <th className="p-3">Resultado / ação</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((event) => (
                <tr key={`${event.source}-${event.id}`} className="border-b border-border/50 align-top">
                  <td className="p-3">{sourceBadge(event.source)}</td>
                  <td className="whitespace-nowrap p-3">{fmtDate(event.received_at.slice(0, 10))}</td>
                  <td className="p-3 font-semibold">{event.guest_name ?? event.reservation?.cliente_nome ?? "Reserva não localizada"}</td>
                  <td className="p-3">{event.reservation?.quarto ?? event.room_type ?? "—"}</td>
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
                  <td className="max-w-[420px] p-3 text-muted-foreground">
                    {event.source === "chrome" && event.event_type === "reservation_details" && event.status === "needs_review" ? (
                      <div className="flex min-w-[300px] items-center gap-2">
                        <select
                          className="h-9 min-w-[150px] rounded-md border border-border bg-background px-2 text-foreground"
                          value={selectedRooms[event.id] ?? ""}
                          onChange={(e) => setSelectedRooms((currentRooms) => ({ ...currentRooms, [event.id]: e.target.value }))}
                        >
                          <option value="">Escolher quarto</option>
                          {rooms.map((room) => (
                            <option key={room.numero} value={room.numero}>Quarto {room.numero}{room.configuracao ? ` · ${room.configuracao}` : ""}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="h-9 rounded-md bg-primary px-3 font-semibold text-primary-foreground disabled:opacity-50"
                          disabled={processingId === event.id}
                          onClick={() => createReservation(event)}
                        >
                          {processingId === event.id ? "Criando..." : "Criar reserva"}
                        </button>
                      </div>
                    ) : (
                      resultLabel(event)
                    )}
                  </td>
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
  if (event.error) return event.error;
  if (event.source === "chrome") {
    if (event.status === "processed" && event.event_type === "cancellation_details") return "Cancelamento aplicado no HospedaMais e histórico preservado.";
    if (event.status === "processed" && event.event_type === "reservation_details") return "Reserva vinculada ao HospedaMais.";
    if (event.event_type === "cancellation_details") return "Cancelamento recebido; revisão manual necessária.";
    return "Reserva capturada pela extensão e aguardando escolha do quarto.";
  }
  if (event.status === "processed") {
    return `Reserva alterada de ${event.previous_status ?? "reservado"} para ${event.new_status ?? "cancelado"}.`;
  }
  if (event.status === "already_cancelled") return "A reserva já estava cancelada; nenhuma alteração adicional foi feita.";
  if (event.status === "needs_review") return "O evento foi preservado e aguarda conferência manual; nenhum registro foi excluído.";
  return "Evento recebido, sem resultado confirmado.";
}

function parseBookingDate(value: string | null) {
  const text = String(value ?? "").toLocaleLowerCase("pt-BR");
  const match = text.match(/(\d{1,2})\s+de\s+([a-zç.]+)\s+de\s+(\d{4})/i);
  if (!match) return null;
  const months: Record<string, string> = {
    jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
    jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
  };
  const month = months[match[2].replace(/\./g, "").slice(0, 3)];
  if (!month) return null;
  return `${match[3]}-${month}-${match[1].padStart(2, "0")}`;
}

function parseMoney(value: string | null) {
  const cleaned = String(value ?? "0").replace(/[^0-9,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
}

function parsePeople(value: string | null) {
  const match = String(value ?? "").match(/\d+/);
  return Math.max(1, Number(match?.[0] ?? 1));
}
