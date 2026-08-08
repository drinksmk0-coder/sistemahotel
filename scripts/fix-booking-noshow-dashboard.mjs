import { readFile, writeFile } from "node:fs/promises";

const file = "src/components/executive/ExecutiveDashboardReference.tsx";
let source = await readFile(file, "utf8");

function replaceOnce(from, to, label) {
  if (source.includes(to)) return;
  if (!source.includes(from)) throw new Error(`Falha ao aplicar ${label}: padrão não encontrado.`);
  source = source.replace(from, to);
}

replaceOnce(
  `  status: string | null;\n  checkin: string;`,
  `  status: string | null;\n  presence_status: string | null;\n  checkin: string;`,
  "presence_status no tipo de reserva",
);

replaceOnce(
  `.from("reservations").select("id,codigo_externo,status,checkin,checkout,quarto,valor_total,pagamento,pessoas,canal,cliente_id")`,
  `.from("reservations").select("id,codigo_externo,status,presence_status,checkin,checkout,quarto,valor_total,pagamento,pessoas,canal,cliente_id")`,
  "presence_status na consulta",
);

replaceOnce(
  `.from("booking_browser_events").select("booking_code,event_type,status,checkin_text,total_text,reservation_id").eq("company_id", companyId).eq("event_type", "cancellation_details"),`,
  `.from("booking_browser_events").select("booking_code,event_type,status,checkin_text,total_text,reservation_id").eq("company_id", companyId).in("event_type", ["cancellation_details", "no_show"]).eq("status", "processed"),`,
  "consulta de cancelamentos e no-show Booking",
);

source = source.replaceAll("isNoShow(row.status)", "isNoShow(row.status, row.presence_status)");

replaceOnce(
`  const cancelledReservationIds = new Set(bookingCancelled.map((row) => row.id));
  const allowExternalCancellations = (filters.channel === "all" || filters.channel === "Booking.com")
    && filters.payment === "all" && filters.state === "all" && filters.room === "all" && filters.category === "all";
  const externalCancellations = (allowExternalCancellations ? source.bookingEvents : [])
    .map((event) => ({ ...event, checkin: parseBookingEventDate(event.checkin_text), total: parseBookingMoney(event.total_text) }))
    .filter((event) => event.checkin && inDateRange(event.checkin, range) && matchesWeekday(event.checkin, filters.weekday) && (!event.reservation_id || !cancelledReservationIds.has(event.reservation_id)));
`,
`  const internalNoShows = arrivalReservations.filter((row) => isNoShow(row.status, row.presence_status));
  const allowExternalBookingEvents = (filters.channel === "all" || filters.channel === "Booking.com")
    && filters.payment === "all" && filters.state === "all" && filters.room === "all" && filters.category === "all";

  const externalBookingEvents = (eventType: "cancellation_details" | "no_show", internalRows: ReservationRow[]) => {
    const internalReservationIds = new Set(internalRows.map((row) => row.id));
    const internalBookingCodes = new Set(
      internalRows.map((row) => normalizeBookingCode(row.codigo_externo)).filter(Boolean),
    );
    const seen = new Set<string>();

    return (allowExternalBookingEvents ? source.bookingEvents : [])
      .filter((event) => event.event_type === eventType && normalize(event.status) === "processed")
      .map((event) => ({ ...event, checkin: parseBookingEventDate(event.checkin_text), total: parseBookingMoney(event.total_text) }))
      .filter((event) => event.checkin
        && inDateRange(event.checkin, range)
        && matchesWeekday(event.checkin, filters.weekday)
        && (!event.reservation_id || !internalReservationIds.has(event.reservation_id))
        && !internalBookingCodes.has(normalizeBookingCode(event.booking_code)))
      .filter((event) => {
        const code = normalizeBookingCode(event.booking_code);
        const key = `${eventType}:${code || event.reservation_id || event.checkin}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  };

  const externalCancellations = externalBookingEvents("cancellation_details", bookingCancelled);
  const externalNoShows = externalBookingEvents("no_show", internalNoShows);
`,
  "eventos externos Booking deduplicados",
);

replaceOnce(
  `    noShow: arrivalReservations.filter((row) => isNoShow(row.status, row.presence_status)).length,\n    daily: buildDaily(baseReservations, sales, selectedRooms.length, range, filters.weekday, externalCancellations),`,
  `    noShow: internalNoShows.length + externalNoShows.length,\n    daily: buildDaily(baseReservations, sales, selectedRooms.length, range, filters.weekday, externalCancellations, externalNoShows),`,
  "KPI e série diária de no-show",
);

replaceOnce(
  `function buildDaily(reservations: ReservationRow[], sales: SaleRow[], roomCount: number, range: Range, weekday: string, externalCancellations: Array<BookingEventRow & { checkin: string | null; total: number }>) {`,
  `function buildDaily(reservations: ReservationRow[], sales: SaleRow[], roomCount: number, range: Range, weekday: string, externalCancellations: Array<BookingEventRow & { checkin: string | null; total: number }>, externalNoShows: Array<BookingEventRow & { checkin: string | null; total: number }>) {`,
  "assinatura da série diária",
);

replaceOnce(
  `      noShow: arrivals.filter((row) => isNoShow(row.status, row.presence_status)).length,`,
  `      noShow: arrivals.filter((row) => isNoShow(row.status, row.presence_status)).length + externalNoShows.filter((event) => event.checkin === day).length,`,
  "no-show Booking no gráfico diário",
);

replaceOnce(
  `function parseBookingEventDate(value: string | null) {\n  const text = String(value ?? "").toLocaleLowerCase("pt-BR");`,
  `function parseBookingEventDate(value: string | null) {\n  const text = String(value ?? "").toLocaleLowerCase("pt-BR");\n  const isoMatch = text.match(/\\b(\\d{4})-(\\d{2})-(\\d{2})\\b/);\n  if (isoMatch) return \`${'${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}'}\`;`,
  "datas ISO dos eventos Booking",
);

replaceOnce(
  `function isNoShow(value: string | null) { const text = normalize(value).replace(/[\\s_-]+/g, ""); return text.includes("noshow") || text.includes("naocompareceu") || text.includes("naocomparecimento"); }`,
  `function isNoShow(value: string | null, presenceStatus: string | null = null) { const text = \`${'${normalize(value)} ${normalize(presenceStatus)}'}\`.replace(/[\\s_-]+/g, ""); return text.includes("noshow") || text.includes("naocompareceu") || text.includes("naocomparecimento"); }\nfunction normalizeBookingCode(value: string | null | undefined) { return String(value ?? "").replace(/\\D/g, ""); }`,
  "normalização de no-show e código Booking",
);

await writeFile(file, source, "utf8");
console.log("Dashboard executivo: cancelamentos e no-shows Booking sincronizados com KPI e gráfico.");
