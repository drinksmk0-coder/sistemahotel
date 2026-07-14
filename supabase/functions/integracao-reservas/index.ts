import { createClient } from "@supabase/supabase-js";

type Draft = {
  nome?: string;
  cpf?: string;
  telefone?: string;
  quarto?: number;
  checkin?: string;
  checkout?: string;
  pessoas?: number;
  source?: string;
  externalId?: string;
  companyId?: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-integration-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const webhookToken = Deno.env.get("INTEGRATION_WEBHOOK_TOKEN") ?? "";
const wahaBaseUrl = Deno.env.get("WAHA_BASE_URL") ?? "";
const wahaApiKey = Deno.env.get("WAHA_API_KEY") ?? "";
const wahaSession = Deno.env.get("WAHA_SESSION") ?? "default";

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const url = new URL(req.url);
  const receivedToken = req.headers.get("x-integration-token") ?? url.searchParams.get("token") ?? "";
  if (!webhookToken || receivedToken !== webhookToken) {
    return json({ ok: false, error: "Webhook token not configured or invalid" }, 401);
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return json({ ok: false, error: "Invalid JSON body" }, 400);

  const source = detectSource(body);
  const externalId = externalEventId(body, source);
  const companyId = url.searchParams.get("empresa") ?? stringValue((body as Record<string, unknown>).company_id);
  if (!companyId) return json({ ok: false, error: "Empresa nao informada no webhook" }, 400);

  const event = await createEvent(source, externalId, body, companyId);
  if (event?.status === "duplicated") return json({ ok: true, duplicated: true });

  try {
    const result = source === "waha" ? await handleWaha(body, companyId) : await handleStructuredReservation(body, source, companyId);
    if (event?.id) {
      await supabase
        .from("integration_events")
        .update({ status: result.created ? "created" : "processed", reservation_id: result.reservationId ?? null })
        .eq("id", event.id);
    }
    return json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    if (event?.id) {
      await supabase.from("integration_events").update({ status: "error", error: message }).eq("id", event.id);
    }
    return json({ ok: false, error: message }, 400);
  }
});

async function handleWaha(body: Record<string, unknown>, companyId: string) {
  const payload = (body.payload ?? body) as Record<string, unknown>;
  const chatId = String(payload.from ?? payload.chatId ?? "");
  const text = String(payload.body ?? payload.text ?? "").trim();
  if (!chatId || !text) return { created: false, reply: "Mensagem ignorada." };

  const phone = chatId.replace(/\D/g, "");
  const current = await getSession(phone, companyId);
  const draft = mergeDraft(current?.draft as Draft | null, parseMessage(text, current?.stage, current?.draft as Draft | null));
  draft.telefone = phone;
  draft.source = "WhatsApp";
  draft.externalId = externalEventId(body, "waha");
  draft.companyId = companyId;

  const missing = firstMissingField(draft);
  if (missing) {
    const reply = questionFor(missing);
    await upsertSession(phone, chatId, companyId, missing, draft, text, reply);
    await sendWahaText(chatId, reply);
    return { created: false, reply };
  }

  const created = await createReservation(draft);
  const reply = `Pre-reserva criada no quarto ${created.quarto}, de ${formatDateBR(created.checkin)} ate ${formatDateBR(created.checkout)}. Nome: ${created.nome}.`;
  await upsertSession(phone, chatId, companyId, "done", {}, text, reply);
  await sendWahaText(chatId, reply);
  return { created: true, reservationId: created.reservationId, reply };
}

async function handleStructuredReservation(body: Record<string, unknown>, source: string, companyId: string) {
  const raw = ((body.reservation ?? body.reserva ?? body) as Record<string, unknown>) ?? {};
  const draft: Draft = {
    nome: stringValue(raw.nome ?? raw.name ?? raw.guest_name ?? raw.cliente_nome),
    cpf: stringValue(raw.cpf ?? raw.document ?? raw.documento),
    telefone: stringValue(raw.telefone ?? raw.phone ?? raw.whatsapp),
    quarto: numberValue(raw.quarto ?? raw.room ?? raw.room_number),
    checkin: normalizeDate(stringValue(raw.checkin ?? raw.check_in ?? raw.arrival)),
    checkout: normalizeDate(stringValue(raw.checkout ?? raw.check_out ?? raw.departure)),
    pessoas: numberValue(raw.pessoas ?? raw.guests ?? raw.hospedes ?? raw.adults) ?? 1,
    source: source === "booking" ? "Booking" : source,
    externalId: stringValue(raw.external_id ?? raw.id ?? raw.booking_id ?? body.external_id),
    companyId,
  };

  const missing = firstMissingField(draft);
  if (missing) throw new Error(`Payload incompleto. Campo faltando: ${missing}`);

  const created = await createReservation(draft);
  return { created: true, reservationId: created.reservationId };
}

async function createReservation(draft: Draft) {
  if (!draft.companyId || !draft.nome || !draft.quarto || !draft.checkin || !draft.checkout) {
    throw new Error("Reserva incompleta.");
  }
  if (draft.checkout <= draft.checkin) throw new Error("Checkout precisa ser depois do check-in.");

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("numero, preco")
    .eq("company_id", draft.companyId)
    .eq("numero", draft.quarto)
    .maybeSingle();
  if (roomError) throw roomError;
  if (!room) throw new Error(`Quarto ${draft.quarto} nao encontrado.`);

  const { data: overlap, error: overlapError } = await supabase.rpc("reservation_has_overlap", {
    _company_id: draft.companyId,
    _quarto: draft.quarto,
    _checkin: draft.checkin,
    _checkout: draft.checkout,
  });
  if (overlapError) throw overlapError;
  if (overlap) throw new Error(`Quarto ${draft.quarto} ja possui reserva nesse periodo.`);

  let clientId: string | null = null;
  const cpfDigits = onlyDigits(draft.cpf);
  if (cpfDigits) {
    const { data: existingClient, error: clientLookupError } = await supabase
      .from("clients")
      .select("id")
      .eq("company_id", draft.companyId)
      .eq("cpf", cpfDigits)
      .maybeSingle();
    if (clientLookupError) throw clientLookupError;
    clientId = existingClient?.id ?? null;
  }

  if (!clientId) {
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .insert({
        nome: draft.nome,
        company_id: draft.companyId,
        cpf: cpfDigits || null,
        telefone: draft.telefone ?? null,
        tipo: "novo",
        visitas: 0,
      })
      .select("id")
      .single();
    if (clientError) throw clientError;
    clientId = client.id;
  }

  const diarias = daysBetween(draft.checkin, draft.checkout);
  const valorDiaria = Number(room.preco ?? 0);
  const valorTotal = Math.max(0, diarias * valorDiaria);
  const { data: reservation, error: reservationError } = await supabase
    .from("reservations")
    .insert({
      quarto: draft.quarto,
      company_id: draft.companyId,
      cliente_id: clientId,
      cliente_nome: draft.nome,
      checkin: draft.checkin,
      checkout: draft.checkout,
      diarias,
      pessoas: draft.pessoas ?? 1,
      valor_diaria: valorDiaria,
      valor_total: valorTotal,
      valor_pago: 0,
      pago: false,
      pagamento: "pendente",
      status: "reservado",
      canal: draft.source ?? "Integracao",
      horario_reserva: new Date().toTimeString().slice(0, 5),
    })
    .select("id")
    .single();
  if (reservationError) throw reservationError;

  return {
    reservationId: reservation.id,
    quarto: draft.quarto,
    checkin: draft.checkin,
    checkout: draft.checkout,
    nome: draft.nome,
  };
}

async function getSession(phone: string, companyId: string) {
  const { data, error } = await supabase
    .from("whatsapp_reservation_sessions")
    .select("*")
    .eq("company_id", companyId)
    .eq("phone", phone)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function upsertSession(phone: string, chatId: string, companyId: string, stage: string, draft: Draft, lastMessage: string, lastResponse: string) {
  const { error } = await supabase.from("whatsapp_reservation_sessions").upsert(
    {
      phone,
      company_id: companyId,
      chat_id: chatId,
      stage,
      draft,
      last_message: lastMessage,
      last_response: lastResponse,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id,phone" },
  );
  if (error) throw error;
}

async function sendWahaText(chatId: string, text: string) {
  if (!wahaBaseUrl || !wahaApiKey) return;
  await fetch(`${wahaBaseUrl.replace(/\/$/, "")}/api/sendText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": wahaApiKey,
    },
    body: JSON.stringify({ session: wahaSession, chatId, text }),
  }).catch(() => null);
}

async function createEvent(source: string, externalId: string | null, payload: Record<string, unknown>, companyId: string) {
  const { data, error } = await supabase
    .from("integration_events")
    .insert({ source, external_id: externalId, payload, company_id: companyId })
    .select("id, status")
    .single();
  if (error) {
    if (String(error.message).includes("duplicate key")) return { id: null, status: "duplicated" };
    throw error;
  }
  return data;
}

function detectSource(body: Record<string, unknown>) {
  const source = String(body.source ?? body.origem ?? "").toLowerCase();
  if (source.includes("booking")) return "booking";
  if (body.event || body.payload) return "waha";
  return source || "external";
}

function externalEventId(body: Record<string, unknown>, source: string) {
  const payload = (body.payload ?? body) as Record<string, unknown>;
  return stringValue(
    payload.id ?? body.id ?? body.external_id ?? body.booking_id ?? `${source}-${Date.now()}-${Math.random()}`,
  );
}

function parseMessage(text: string, stage?: string | null, previous?: Draft | null): Draft {
  const normalized = stripAccents(text);
  const parsed: Draft = {};
  parsed.quarto = numberFromRegex(normalized, /\b(?:quarto|ap|apto|apartamento)\s*[:#-]?\s*(\d{2,4})\b/i);
  parsed.cpf = stringFromRegex(normalized, /\bcpf\s*[:#-]?\s*([\d.\-\s]{11,18})/i)?.replace(/\s/g, "");
  parsed.pessoas = numberFromRegex(normalized, /\b(?:pessoas|hospedes|adultos)\s*[:#-]?\s*(\d{1,2})\b/i);
  parsed.checkin = normalizeDate(stringFromRegex(normalized, /\b(?:checkin|check-in|entrada)\s*[:#-]?\s*(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|\d{4}-\d{2}-\d{2})/i));
  parsed.checkout = normalizeDate(stringFromRegex(normalized, /\b(?:checkout|check-out|saida)\s*[:#-]?\s*(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|\d{4}-\d{2}-\d{2})/i));
  parsed.nome = cleanName(stringFromRegex(stripAccents(text), /\b(?:nome|hospede|cliente)\s*[:#-]?\s*([A-Za-z' ]{3,80})/i));

  if (stage && !text.includes(":")) {
    if (stage === "nome") parsed.nome = cleanName(text);
    if (stage === "cpf") parsed.cpf = onlyDigits(text);
    if (stage === "quarto") parsed.quarto = Number(onlyDigits(text));
    if (stage === "checkin") parsed.checkin = normalizeDate(text);
    if (stage === "checkout") parsed.checkout = normalizeDate(text);
    if (stage === "pessoas") parsed.pessoas = Number(onlyDigits(text));
  }

  if (!parsed.nome && !previous?.nome && /\breserva\b/i.test(normalized)) {
    parsed.nome = cleanName(text.replace(/reserva/gi, "").trim());
  }

  return parsed;
}

function mergeDraft(previous: Draft | null | undefined, next: Draft) {
  return Object.fromEntries(
    Object.entries({ ...(previous ?? {}), ...next }).filter(([, value]) => value !== undefined && value !== "" && !Number.isNaN(value)),
  ) as Draft;
}

function firstMissingField(draft: Draft) {
  if (!draft.nome) return "nome";
  if (!draft.cpf) return "cpf";
  if (!draft.quarto) return "quarto";
  if (!draft.checkin) return "checkin";
  if (!draft.checkout) return "checkout";
  if (!draft.pessoas) return "pessoas";
  return null;
}

function questionFor(field: string) {
  const questions: Record<string, string> = {
    nome: "Para iniciar a reserva, me informe o nome completo do hospede.",
    cpf: "Agora me envie o CPF do hospede.",
    quarto: "Qual quarto deseja reservar?",
    checkin: "Qual a data de entrada? Exemplo: 20/07/2026.",
    checkout: "Qual a data de saida? Exemplo: 22/07/2026.",
    pessoas: "Quantas pessoas ficarao hospedadas?",
  };
  return questions[field] ?? "Pode me enviar os dados da reserva?";
}

function normalizeDate(value?: string | null) {
  if (!value) return undefined;
  const clean = value.trim();
  const iso = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return clean;
  const br = clean.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (!br) return undefined;
  const day = br[1].padStart(2, "0");
  const month = br[2].padStart(2, "0");
  let year = br[3] ?? String(new Date().getFullYear());
  if (year.length === 2) year = `20${year}`;
  let isoDate = `${year}-${month}-${day}`;
  if (!br[3] && isoDate < new Date().toISOString().slice(0, 10)) {
    isoDate = `${Number(year) + 1}-${month}-${day}`;
  }
  return isoDate;
}

function daysBetween(checkin: string, checkout: string) {
  const start = new Date(`${checkin}T00:00:00Z`).getTime();
  const end = new Date(`${checkout}T00:00:00Z`).getTime();
  return Math.max(1, Math.round((end - start) / 86400000));
}

function formatDateBR(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function stripAccents(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function onlyDigits(value?: string | null) {
  return String(value ?? "").replace(/\D/g, "");
}

function stringValue(value: unknown) {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function numberFromRegex(text: string, regex: RegExp) {
  const match = text.match(regex);
  return match ? Number(match[1]) : undefined;
}

function stringFromRegex(text: string, regex: RegExp) {
  const match = text.match(regex);
  return match?.[1]?.trim();
}

function cleanName(value?: string | null) {
  const text = value?.trim().replace(/\s+/g, " ");
  if (!text || onlyDigits(text).length > 6) return undefined;
  return text.slice(0, 80);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
