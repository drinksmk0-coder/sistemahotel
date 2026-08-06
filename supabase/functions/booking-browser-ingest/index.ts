import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-booking-connector-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const connectorToken = Deno.env.get("BOOKING_CONNECTOR_TOKEN") ?? "";

type BookingPayload = {
  source?: string;
  captured_at?: string;
  page_url?: string;
  page_title?: string;
  booking_code?: string;
  guest_name?: string | null;
  checkin_text?: string | null;
  checkout_text?: string | null;
  total_text?: string | null;
  guests_text?: string | null;
  room_type?: string | null;
  status_text?: string | null;
  raw_excerpt?: string | null;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return respond({ ok: true });
  if (request.method !== "POST") return respond({ ok: false, error: "Method not allowed" }, 405);

  const token = request.headers.get("x-booking-connector-token") ?? "";
  if (!connectorToken || token !== connectorToken) {
    return respond({ ok: false, error: "Invalid connector token" }, 401);
  }

  const body = await request.json().catch(() => null) as
    | { company_id?: string; payload?: BookingPayload }
    | null;
  const companyId = String(body?.company_id ?? "").trim();
  const payload = body?.payload;
  const bookingCode = String(payload?.booking_code ?? "").replace(/\D/g, "");

  if (!companyId || !bookingCode) {
    return respond({ ok: false, error: "company_id e booking_code são obrigatórios" }, 400);
  }
  if (!/^https:\/\/admin\.booking\.com\//i.test(String(payload?.page_url ?? ""))) {
    return respond({ ok: false, error: "Origem da página Booking inválida" }, 400);
  }

  const eventType = /cancel/i.test(String(payload?.status_text ?? ""))
    ? "cancellation_details"
    : "reservation_details";

  const safePayload = {
    ...payload,
    raw_excerpt: String(payload?.raw_excerpt ?? "").slice(0, 12000),
  };

  const { data, error } = await supabase
    .from("booking_browser_events")
    .upsert(
      {
        company_id: companyId,
        booking_code: bookingCode,
        source: "booking_extranet_chrome",
        status: "needs_review",
        event_type: eventType,
        guest_name: nullable(payload?.guest_name),
        checkin_text: nullable(payload?.checkin_text),
        checkout_text: nullable(payload?.checkout_text),
        total_text: nullable(payload?.total_text),
        guests_text: nullable(payload?.guests_text),
        room_type: nullable(payload?.room_type),
        booking_status_text: nullable(payload?.status_text),
        page_url: nullable(payload?.page_url),
        page_title: nullable(payload?.page_title),
        payload: safePayload,
        captured_at: payload?.captured_at || new Date().toISOString(),
      },
      { onConflict: "company_id,booking_code,event_type" },
    )
    .select("id,status,booking_code,event_type")
    .single();

  if (error) return respond({ ok: false, error: error.message }, 500);
  return respond({ ok: true, event_id: data.id, status: data.status, booking_code: data.booking_code });
});

function nullable(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
  });
}
