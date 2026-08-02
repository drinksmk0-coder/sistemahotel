import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useInsert, useReservations, useRooms, useUpdate } from "@/lib/data";
import { DEFAULT_CHECKIN_TIME, DEFAULT_CHECKOUT_TIME, hotelOperationalDateISO, nightsBetween } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/importar-email-booking")({
  component: ImportarEmailBooking,
});

type ParsedBookingEmail = {
  kind: "new" | "cancel" | "unknown";
  code: string;
  checkin: string;
  hotelId: string;
};

function parsePtBrDate(raw: string) {
  const months: Record<string, string> = {
    janeiro: "01",
    fevereiro: "02",
    marco: "03",
    março: "03",
    abril: "04",
    maio: "05",
    junho: "06",
    julho: "07",
    agosto: "08",
    setembro: "09",
    outubro: "10",
    novembro: "11",
    dezembro: "12",
  };
  const match = raw.toLowerCase().match(/(\d{1,2})\s+de\s+([a-zç]+)\s+de\s+(\d{4})/i);
  if (!match) return "";
  const month = months[match[2]];
  if (!month) return "";
  return `${match[3]}-${month}-${match[1].padStart(2, "0")}`;
}

function parseBookingEmail(raw: string): ParsedBookingEmail {
  const normalized = raw.replace(/\u00a0/g, " ");
  const subject = normalized.match(/Subject:\s*(.+)/i)?.[1] ?? normalized.split("\n")[0] ?? "";
  const code =
    subject.match(/\((\d{8,12}),/)?.[1] ??
    normalized.match(/(?:Booking confirmation|Cancellation)\s*[—-]\s*(\d{8,12})/i)?.[1] ??
    normalized.match(/res_id=(\d{8,12})/i)?.[1] ??
    "";
  const hotelId = normalized.match(/hotel_id=(\d+)/i)?.[1] ?? "";
  const kind = /cancelamento|cancellation/i.test(subject + normalized)
    ? "cancel"
    : /nova reserva|booking confirmation/i.test(subject + normalized)
      ? "new"
      : "unknown";
  return { kind, code, checkin: parsePtBrDate(subject), hotelId };
}

function ImportarEmailBooking() {
  const { data: rooms = [] } = useRooms();
  const { data: reservations = [] } = useReservations();
  const insert = useInsert("reservations", ["reservations"]);
  const update = useUpdate("reservations", ["reservations"]);
  const [raw, setRaw] = useState("");
  const parsed = useMemo(() => parseBookingEmail(raw), [raw]);
  const [guest, setGuest] = useState("");
  const [room, setRoom] = useState("");
  const [checkout, setCheckout] = useState("");
  const [people, setPeople] = useState("1");
  const [total, setTotal] = useState("");
  const [busy, setBusy] = useState(false);

  const existing = reservations.find((item) => item.codigo_externo === parsed.code);

  async function confirm() {
    if (!parsed.code || parsed.kind === "unknown") {
      toast.error("Não foi possível identificar o código ou o tipo do e-mail.");
      return;
    }
    setBusy(true);
    try {
      if (parsed.kind === "cancel") {
        if (!existing) throw new Error("Não existe reserva com esse código no sistema.");
        await update.mutateAsync({
          id: existing.id,
          patch: { status: "cancelado", observacoes_importacao: "Cancelamento recebido por e-mail da Booking.com" },
        });
        toast.success(`Reserva ${parsed.code} cancelada`);
        return;
      }

      if (existing) throw new Error("Essa reserva da Booking já foi importada.");
      const roomNumber = Number(room);
      const selectedRoom = rooms.find((item) => item.numero === roomNumber);
      if (!guest.trim() || !selectedRoom || !parsed.checkin || !checkout || checkout <= parsed.checkin) {
        throw new Error("Confira hóspede, quarto, entrada e saída.");
      }
      const diarias = Math.max(1, nightsBetween(parsed.checkin, checkout));
      const totalValue = Number(total.replace(",", ".")) || Number(selectedRoom.preco) * diarias;
      await insert.mutateAsync({
        quarto: roomNumber,
        cliente_id: null,
        cliente_nome: guest.trim(),
        data_reserva: hotelOperationalDateISO(),
        checkin: parsed.checkin,
        checkout,
        horario_reserva: null,
        horario_checkin: DEFAULT_CHECKIN_TIME,
        horario_checkout: DEFAULT_CHECKOUT_TIME,
        diarias,
        valor_diaria: totalValue / diarias,
        valor_total: totalValue,
        valor_pago: 0,
        desconto: 0,
        pessoas: Math.max(1, Number(people) || 1),
        canal: "Booking",
        motivo_estadia: null,
        pagamento: "Pendente",
        pago: false,
        status: "reservado",
        checkin_at: null,
        codigo_externo: parsed.code,
        origem_importacao: "Booking e-mail",
        observacoes_importacao: `MVP por e-mail. hotel_id=${parsed.hotelId || "não informado"}`,
      });
      toast.success(`Reserva ${parsed.code} importada`);
      setRaw("");
      setGuest("");
      setRoom("");
      setCheckout("");
      setPeople("1");
      setTotal("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao importar e-mail.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-8">
      <div>
        <h1 className="text-xl font-bold">Importar e-mail da Booking</h1>
        <p className="text-sm text-muted-foreground">
          Cole o e-mail encaminhado. O sistema identifica código, tipo e data; a recepção confere os dados ausentes antes de gravar.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <label className="text-sm font-semibold">Conteúdo do e-mail</label>
        <textarea
          className="field mt-2 min-h-56 w-full"
          value={raw}
          onChange={(event) => setRaw(event.target.value)}
          placeholder="Cole aqui o assunto e o corpo do e-mail encaminhado pela Booking.com"
        />
      </section>

      {raw && (
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-3">
            <div><span className="text-xs text-muted-foreground">Evento</span><strong className="block">{parsed.kind === "new" ? "Nova reserva" : parsed.kind === "cancel" ? "Cancelamento" : "Não identificado"}</strong></div>
            <div><span className="text-xs text-muted-foreground">Código Booking</span><strong className="block">{parsed.code || "Não encontrado"}</strong></div>
            <div><span className="text-xs text-muted-foreground">Check-in informado</span><strong className="block">{parsed.checkin || "Não encontrado"}</strong></div>
          </div>

          {parsed.kind === "new" && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input className="field" placeholder="Nome do hóspede" value={guest} onChange={(e) => setGuest(e.target.value)} />
              <select className="field" value={room} onChange={(e) => setRoom(e.target.value)}>
                <option value="">Selecione o quarto</option>
                {rooms.map((item) => <option key={item.numero} value={item.numero}>UH {item.numero} · {item.configuracao || "Quarto"}</option>)}
              </select>
              <input className="field" type="date" value={checkout} onChange={(e) => setCheckout(e.target.value)} />
              <input className="field" inputMode="numeric" placeholder="Pessoas" value={people} onChange={(e) => setPeople(e.target.value.replace(/\D/g, ""))} />
              <input className="field sm:col-span-2" inputMode="decimal" placeholder="Valor total (opcional)" value={total} onChange={(e) => setTotal(e.target.value)} />
            </div>
          )}

          {existing && (
            <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3 text-sm">
              Já existe uma reserva com esse código: UH {existing.quarto}, {existing.cliente_nome}, status {existing.status}.
            </div>
          )}

          <button className="btn-primary mt-4" disabled={busy || parsed.kind === "unknown"} onClick={confirm}>
            {busy ? "Processando..." : parsed.kind === "cancel" ? "Confirmar cancelamento" : "Importar reserva"}
          </button>
        </section>
      )}
    </div>
  );
}
