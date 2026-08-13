import { createClient } from "@supabase/supabase-js";
import { XMLParser } from "npm:fast-xml-parser@4.5.3";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const bookingClientId = Deno.env.get("BOOKING_CLIENT_ID") ?? "";
const bookingClientSecret = Deno.env.get("BOOKING_CLIENT_SECRET") ?? "";
const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", parseTagValue: false, trimValues: true });

const AUTH_URL = "https://connectivity-authentication.booking.com/token-based-authentication/exchange";
const NEW_URL = "https://secure-supply-xml.booking.com/hotels/ota/OTA_HotelResNotif";
const MODIFY_URL = "https://secure-supply-xml.booking.com/hotels/ota/OTA_HotelResModifyNotif";

type Config = { company_id: string; property_id: string; enabled: boolean };
type Unit = { unitKey: string; roomTypeCode: string; checkin: string; checkout: string; adults: number; children: number; total: number };
type ParsedReservation = { bookingId: string; status: string; guestName: string; phone?: string; email?: string; units: Unit[]; raw: unknown };

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  const supplied = req.headers.get("x-booking-sync-secret") ?? "";
  const { data: control } = await supabase.from("booking_sync_internal").select("sync_secret").eq("id", true).maybeSingle();
  if (!control?.sync_secret || supplied !== control.sync_secret) return json({ ok: false, error: "Unauthorized" }, 401);

  const { data: configs, error } = await supabase.from("booking_connectivity_config").select("company_id,property_id,enabled").eq("enabled", true);
  if (error) return json({ ok: false, error: error.message }, 500);
  if (!configs?.length) return json({ ok: true, state: "waiting_configuration", processed: 0 });
  if (!bookingClientId || !bookingClientSecret) return json({ ok: true, state: "waiting_credentials", processed: 0 });

  let token: string;
  try { token = await getToken(); }
  catch (e) { return json({ ok: false, error: message(e) }, 502); }

  const results: unknown[] = [];
  for (const cfg of configs as Config[]) {
    if (!cfg.property_id) continue;
    try {
      const newResult = await pollEndpoint(cfg, token, "new");
      const modResult = await pollEndpoint(cfg, token, "modified");
      await supabase.from("booking_connectivity_config").update({ last_success_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq("company_id", cfg.company_id);
      results.push({ company_id: cfg.company_id, new: newResult, modified: modResult });
    } catch (e) {
      const err = message(e);
      await supabase.from("booking_connectivity_config").update({ last_error: err, updated_at: new Date().toISOString() }).eq("company_id", cfg.company_id);
      results.push({ company_id: cfg.company_id, error: err });
    }
  }
  return json({ ok: true, results });
});

async function getToken() {
  const r = await fetch(AUTH_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: bookingClientId, client_secret: bookingClientSecret }) });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || !body?.jwt) throw new Error(`Booking auth ${r.status}: ${body?.message ?? "token indisponível"}`);
  return String(body.jwt);
}

async function pollEndpoint(cfg: Config, token: string, kind: "new" | "modified") {
  const base = kind === "new" ? NEW_URL : MODIFY_URL;
  const url = `${base}?hotel_ids=${encodeURIComponent(cfg.property_id)}&limit=200`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/xml" } });
  const xml = await r.text();
  if (!r.ok) throw new Error(`Booking ${kind} GET ${r.status}: ${xml.slice(0, 350)}`);
  const parsed = parser.parse(xml);
  const reservations = extractReservations(parsed, kind);
  let acknowledged = 0, errors = 0;
  for (const reservation of reservations) {
    try {
      const eventKey = await hash(`${kind}|${reservation.bookingId}|${JSON.stringify(reservation.raw)}`);
      const event = await registerEvent(cfg.company_id, eventKey, reservation, kind);
      if (event.duplicate && event.status === "acknowledged") {
        await acknowledge(token, kind, reservation.bookingId);
        acknowledged++;
        continue;
      }
      const reservationIds = await applyReservation(cfg.company_id, reservation, kind);
      await supabase.from("booking_sync_events").update({ status: "processed", reservation_id: reservationIds[0] ?? null, processed_at: new Date().toISOString(), attempts: (event.attempts ?? 0) + 1, last_error: null }).eq("id", event.id);
      await acknowledge(token, kind, reservation.bookingId);
      await supabase.from("booking_sync_events").update({ status: "acknowledged", acknowledged_at: new Date().toISOString() }).eq("id", event.id);
      acknowledged++;
    } catch (e) {
      errors++;
      const err = message(e);
      await supabase.from("booking_sync_events").update({ status: "error", last_error: err, attempts: 1 }).eq("company_id", cfg.company_id).eq("booking_reservation_id", reservation.bookingId).order("received_at", { ascending: false }).limit(1);
    }
  }
  return { received: reservations.length, acknowledged, errors };
}

function extractReservations(doc: any, kind: "new" | "modified"): ParsedReservation[] {
  const root = kind === "new" ? doc?.OTA_HotelResNotifRQ : doc?.OTA_HotelResModifyNotifRQ;
  const raw = kind === "new" ? root?.HotelReservations?.HotelReservation : root?.HotelResModifies?.HotelResModify;
  return arr(raw).map((node: any) => parseReservation(node)).filter((x: ParsedReservation | null): x is ParsedReservation => !!x);
}

function parseReservation(node: any): ParsedReservation | null {
  const ids = arr(node?.ResGlobalInfo?.HotelReservationIDs?.HotelReservationID);
  const primary = ids.find((x: any) => /^\d+$/.test(String(x?.["@_ResID_Value"] ?? ""))) ?? ids[0];
  const bookingId = String(primary?.["@_ResID_Value"] ?? "").trim();
  if (!bookingId) return null;
  const status = String(node?.["@_ResStatus"] ?? node?.ResStatus ?? "").toLowerCase();
  const profile = firstProfile(node?.ResGlobalInfo?.Profiles);
  const guestName = profile.name || `Hóspede Booking ${bookingId}`;
  const stays = arr(node?.RoomStays?.RoomStay);
  const globalTotal = money(node?.ResGlobalInfo?.Total?.["@_AmountAfterTax"] ?? node?.ResGlobalInfo?.Total?.["@_AmountBeforeTax"]);
  const units = stays.map((stay: any, index: number) => {
    const rt = arr(stay?.RoomTypes?.RoomType)[0] ?? {};
    const span = stay?.TimeSpan ?? {};
    const counts = arr(stay?.GuestCounts?.GuestCount);
    const adults = counts.filter((g: any) => String(g?.["@_AgeQualifyingCode"] ?? "10") === "10").reduce((s: number, g: any) => s + Number(g?.["@_Count"] ?? 0), 0);
    const children = counts.filter((g: any) => String(g?.["@_AgeQualifyingCode"] ?? "") === "8").reduce((s: number, g: any) => s + Number(g?.["@_Count"] ?? 0), 0);
    const total = money(stay?.Total?.["@_AmountAfterTax"] ?? stay?.Total?.["@_AmountBeforeTax"]) || (stays.length ? globalTotal / stays.length : globalTotal);
    return { unitKey: String(stay?.["@_IndexNumber"] ?? index + 1), roomTypeCode: String(rt?.["@_RoomTypeCode"] ?? ""), checkin: String(span?.["@_Start"] ?? "").slice(0, 10), checkout: String(span?.["@_End"] ?? "").slice(0, 10), adults: adults || 1, children, total };
  }).filter((u: Unit) => u.roomTypeCode && u.checkin && u.checkout);
  return { bookingId, status, guestName, phone: profile.phone, email: profile.email, units, raw: node };
}

function firstProfile(profiles: any) {
  const p = arr(profiles?.ProfileInfo)[0]?.Profile?.Customer ?? arr(profiles?.Profile)[0]?.Customer ?? {};
  const pn = arr(p?.PersonName)[0] ?? p?.PersonName ?? {};
  const given = text(pn?.GivenName), surname = text(pn?.Surname);
  const phone = arr(p?.Telephone)[0]?.["@_PhoneNumber"];
  const email = text(arr(p?.Email)[0] ?? p?.Email);
  return { name: `${given} ${surname}`.trim(), phone: phone ? String(phone) : undefined, email: email || undefined };
}

async function registerEvent(companyId: string, eventKey: string, reservation: ParsedReservation, kind: "new" | "modified") {
  const messageType = reservation.status.includes("cancel") ? "cancelled" : kind;
  const { data: existing } = await supabase.from("booking_sync_events").select("id,status,attempts").eq("company_id", companyId).eq("event_key", eventKey).maybeSingle();
  if (existing) return { ...existing, duplicate: true };
  const { data, error } = await supabase.from("booking_sync_events").insert({ company_id: companyId, event_key: eventKey, booking_reservation_id: reservation.bookingId, message_type: messageType, raw_payload: reservation.raw, status: "received" }).select("id,status,attempts").single();
  if (error) throw error;
  return { ...data, duplicate: false };
}

async function applyReservation(companyId: string, res: ParsedReservation, kind: "new" | "modified") {
  const cancelled = res.status.includes("cancel");
  const { data: links } = await supabase.from("booking_reservation_links").select("unit_key,reservation_id,booking_room_type_code").eq("company_id", companyId).eq("booking_reservation_id", res.bookingId);
  if (cancelled) {
    const ids = (links ?? []).map((x: any) => x.reservation_id);
    if (ids.length) await supabase.from("reservations").update({ status: "cancelado", updated_at: new Date().toISOString() }).in("id", ids);
    else await supabase.from("reservations").update({ status: "cancelado", updated_at: new Date().toISOString() }).eq("company_id", companyId).eq("codigo_externo", res.bookingId);
    return ids;
  }
  if (!res.units.length) throw new Error(`Reserva ${res.bookingId} sem RoomStay utilizável`);
  const clientId = await ensureClient(companyId, res);
  const out: string[] = [];
  for (const unit of res.units) {
    const linked = (links ?? []).find((x: any) => String(x.unit_key) === unit.unitKey);
    const physicalRoom = linked ? await roomOfReservation(linked.reservation_id) : await allocateRoom(companyId, unit, undefined);
    if (!physicalRoom) throw new Error(`Sem mapeamento/disponibilidade para Booking room type ${unit.roomTypeCode}`);
    const diarias = days(unit.checkin, unit.checkout);
    const payload = { company_id: companyId, quarto: physicalRoom, cliente_id: clientId, cliente_nome: res.guestName, checkin: unit.checkin, checkout: unit.checkout, diarias, pessoas: unit.adults + unit.children, adultos: unit.adults, criancas: unit.children, valor_diaria: diarias ? unit.total / diarias : unit.total, valor_total: unit.total, valor_pago: 0, pago: false, pagamento: "Booking", status: "reservado", canal: "Booking", codigo_externo: res.bookingId, origem_importacao: "Booking Connectivity OTA", data_reserva: new Date().toISOString().slice(0, 10), horario_reserva: new Date().toISOString().slice(11, 16), observacoes_importacao: `Booking room type ${unit.roomTypeCode}; unit ${unit.unitKey}` };
    let reservationId: string;
    if (linked) {
      const conflict = await hasConflict(companyId, physicalRoom, unit.checkin, unit.checkout, linked.reservation_id);
      if (conflict) throw new Error(`Conflito de disponibilidade no quarto ${physicalRoom} ao atualizar ${res.bookingId}`);
      const { error } = await supabase.from("reservations").update(payload).eq("id", linked.reservation_id);
      if (error) throw error;
      reservationId = linked.reservation_id;
    } else {
      const conflict = await hasConflict(companyId, physicalRoom, unit.checkin, unit.checkout);
      if (conflict) throw new Error(`Conflito de disponibilidade no quarto ${physicalRoom}`);
      const { data, error } = await supabase.from("reservations").insert(payload).select("id").single();
      if (error) throw error;
      reservationId = data.id;
      const { error: linkError } = await supabase.from("booking_reservation_links").insert({ company_id: companyId, booking_reservation_id: res.bookingId, unit_key: unit.unitKey, booking_room_type_code: unit.roomTypeCode, reservation_id: reservationId });
      if (linkError) throw linkError;
    }
    out.push(reservationId);
  }
  return out;
}

async function ensureClient(companyId: string, res: ParsedReservation) {
  if (res.email) {
    const { data } = await supabase.from("clients").select("id").eq("company_id", companyId).eq("email", res.email).maybeSingle();
    if (data?.id) return data.id;
  }
  if (res.phone) {
    const { data } = await supabase.from("clients").select("id").eq("company_id", companyId).eq("telefone", res.phone).maybeSingle();
    if (data?.id) return data.id;
  }
  const { data, error } = await supabase.from("clients").insert({ company_id: companyId, nome: res.guestName, telefone: res.phone ?? null, email: res.email ?? null, tipo: "novo", visitas: 0, ativo: true }).select("id").single();
  if (error) throw error;
  return data.id;
}

async function roomOfReservation(id: string) {
  const { data } = await supabase.from("reservations").select("quarto").eq("id", id).maybeSingle();
  return data?.quarto ? Number(data.quarto) : null;
}

async function allocateRoom(companyId: string, unit: Unit, excludeReservationId?: string) {
  const { data: mapped, error } = await supabase.from("booking_room_type_inventory").select("quarto,priority").eq("company_id", companyId).eq("booking_room_type_code", unit.roomTypeCode).eq("active", true).order("priority").order("quarto");
  if (error) throw error;
  for (const item of mapped ?? []) if (!(await hasConflict(companyId, Number(item.quarto), unit.checkin, unit.checkout, excludeReservationId))) return Number(item.quarto);
  return null;
}

async function hasConflict(companyId: string, room: number, checkin: string, checkout: string, excludeId?: string) {
  let q = supabase.from("reservations").select("id").eq("company_id", companyId).eq("quarto", room).neq("status", "cancelado").lt("checkin", checkout).gt("checkout", checkin).limit(1);
  if (excludeId) q = q.neq("id", excludeId);
  const { data, error } = await q;
  if (error) throw error;
  return !!data?.length;
}

async function acknowledge(token: string, kind: "new" | "modified", bookingId: string) {
  const endpoint = kind === "new" ? NEW_URL : MODIFY_URL;
  const root = kind === "new" ? "OTA_HotelResNotifRS" : "OTA_HotelResModifyNotifRS";
  const container = kind === "new" ? `<HotelReservations><HotelReservation><ResGlobalInfo><HotelReservationIDs><HotelReservationID ResID_Value="${escapeXml(bookingId)}"/></HotelReservationIDs></ResGlobalInfo></HotelReservation></HotelReservations>` : `<HotelResModifies><HotelResModify><ResGlobalInfo><HotelReservationIDs><HotelReservationID ResID_Value="${escapeXml(bookingId)}"/></HotelReservationIDs></ResGlobalInfo></HotelResModify></HotelResModifies>`;
  const body = `<?xml version="1.0" encoding="UTF-8"?><${root} TimeStamp="${new Date().toISOString()}" Target="Production"><Success/>${container}</${root}>`;
  const r = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/xml" }, body });
  const txt = await r.text();
  if (!r.ok || !txt.includes("Success")) throw new Error(`Booking ACK ${r.status}: ${txt.slice(0, 350)}`);
}

const arr = <T>(v: T | T[] | undefined | null): T[] => v == null ? [] : Array.isArray(v) ? v : [v];
const text = (v: any) => typeof v === "string" ? v : String(v?.["#text"] ?? "");
const money = (v: any) => Number(String(v ?? "0").replace(",", ".")) || 0;
const message = (e: unknown) => e instanceof Error ? e.message : String(e);
const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function days(a: string, b: string) { return Math.max(1, Math.round((new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86400000)); }
async function hash(s: string) { const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, "0")).join(""); }
function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }); }
