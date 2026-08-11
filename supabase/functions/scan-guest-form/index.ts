import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.2";

const STATIC_ALLOWED_ORIGINS = new Set([
  "https://sistemahotel-two.vercel.app",
  "https://sistemahotel-sdk13.vercel.app",
  "https://sistemahotel-git-main-sdk13.vercel.app",
  "https://sistemahotel-git-security-fnrh-hardening-sdk13.vercel.app",
  "http://localhost:3000",
  "http://localhost:5173",
]);

const MAX_REQUEST_BYTES = 10_000_000;
const MAX_BASE64_CHARS = 8_000_000;

type RecordRow = Record<string, unknown>;

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");

  if (request.method === "OPTIONS") {
    if (origin && !isAllowedOrigin(origin)) {
      return json(request, { error: "Origem não autorizada." }, 403);
    }
    return json(request, { ok: true });
  }

  if (request.method !== "POST") {
    return json(request, { error: "Método não permitido." }, 405);
  }

  if (origin && !isAllowedOrigin(origin)) {
    return json(request, { error: "Origem não autorizada." }, 403);
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return json(request, { error: "A foto ficou grande demais." }, 413);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = request.headers.get("Authorization");
    if (!supabaseUrl || !serviceRoleKey) {
      return json(request, { error: "Ambiente Supabase incompleto." }, 500);
    }
    if (!authorization || !/^Bearer\s+\S+/i.test(authorization)) {
      return json(request, { error: "Login obrigatório." }, 401);
    }

    const body = (await request.json().catch(() => ({}))) as {
      company_id?: string;
      image_data_url?: string;
    };
    const companyId = String(body.company_id ?? "").trim();
    const imageDataUrl = String(body.image_data_url ?? "");
    if (!isUuid(companyId)) {
      return json(request, { error: "Empresa inválida." }, 400);
    }

    const match = imageDataUrl.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/i);
    if (!match) {
      return json(request, { error: "Envie uma foto JPG, PNG ou WebP válida." }, 400);
    }
    if (match[2].length > MAX_BASE64_CHARS) {
      return json(request, { error: "A foto ficou grande demais. Tente novamente aproximando a ficha." }, 413);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const jwt = authorization.replace(/^Bearer\s+/i, "");
    const { data: authData, error: authError } = await admin.auth.getUser(jwt);
    if (authError || !authData.user) {
      return json(request, { error: "Sessão inválida." }, 401);
    }

    const { data: membership, error: membershipError } = await admin
      .from("company_members")
      .select("role")
      .eq("company_id", companyId)
      .eq("user_id", authData.user.id)
      .eq("ativo", true)
      .maybeSingle();
    if (membershipError) {
      return json(request, { error: "Não foi possível validar a permissão." }, 500);
    }
    if (!membership || !["dono", "recepcao"].includes(String(membership.role))) {
      return json(request, { error: "Acesso negado." }, 403);
    }

    const apiKey = await loadGeminiKey(admin);
    if (!apiKey) {
      return json(request, { error: "Leitura por câmera ainda não está configurada no servidor." }, 503);
    }

    const prompt = `
Leia esta foto de uma ficha de cadastro/hospedagem. Extraia somente dados que estejam realmente legíveis. Não adivinhe nem complete campos ausentes.
Responda EXCLUSIVAMENTE com JSON válido, sem markdown, usando estas chaves:
{
  "nome": string|null,
  "cpf": string|null,
  "telefone": string|null,
  "email": string|null,
  "data_nascimento": "YYYY-MM-DD"|null,
  "profissao": string|null,
  "cidade": string|null,
  "estado": "AC"|"AL"|"AP"|"AM"|"BA"|"CE"|"DF"|"ES"|"GO"|"MA"|"MT"|"MS"|"MG"|"PA"|"PB"|"PR"|"PE"|"PI"|"RJ"|"RN"|"RS"|"RO"|"RR"|"SC"|"SP"|"SE"|"TO"|null,
  "pais": string|null,
  "cep": string|null,
  "bairro": string|null,
  "estado_civil": "solteiro"|"casado"|"divorciado"|"viuvo"|"uniao_estavel"|null,
  "sexo": "feminino"|"masculino"|"outro"|null,
  "quarto": number|null,
  "data_checkin": "YYYY-MM-DD"|null,
  "horario_checkin": "HH:MM"|null,
  "horario_checkin_confiavel": boolean,
  "pagamento": "pix"|"crédito"|"débito"|"dinheiro"|"transferência"|null,
  "pagamento_confiavel": boolean,
  "valor_pago": number|null,
  "valor_pago_confiavel": boolean
}
Observe também papéis, recibos ou comprovantes visíveis sobre/ao lado da ficha. Se estiver claramente escrito Pix, crédito ou débito, extraia a forma de pagamento; extraia o valor somente se ele estiver inequivocamente associado ao pagamento da hospedagem.
Marque *_confiavel como true SOMENTE quando o campo estiver claramente legível e sem ambiguidade. Horário como 08:00/18:00 duvidoso deve ser null ou confiavel=false.
Se houver CPF, copie os 11 dígitos exatamente como aparecem. Se a imagem estiver ilegível, use null no campo.
`.trim();

    const models = [...new Set([
      Deno.env.get("GEMINI_MODEL")?.trim(),
      "gemini-3.5-flash",
      "gemini-3.5-flash-lite",
    ].filter((value): value is string => Boolean(value)))];

    let providerUnavailable = false;
    for (const model of models) {
      let response: Response;
      try {
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey,
            },
            body: JSON.stringify({
              contents: [{
                role: "user",
                parts: [
                  { text: prompt },
                  { inlineData: { mimeType: normalizeMime(match[1]), data: match[2] } },
                ],
              }],
              generationConfig: {
                temperature: 0,
                maxOutputTokens: 1400,
                responseMimeType: "application/json",
              },
            }),
            signal: AbortSignal.timeout(30_000),
          },
        );
      } catch {
        providerUnavailable = true;
        continue;
      }

      const payload = (await response.json().catch(() => ({}))) as RecordRow;
      if (!response.ok) {
        providerUnavailable = true;
        if ([401, 403].includes(response.status)) break;
        continue;
      }

      const text = extractGeminiText(payload);
      const guest = parseGuest(text);
      if (guest) {
        const reservationUpdate = await applyReservationScan(admin, companyId, guest);
        return json(request, {
          guest,
          reservation_updated: reservationUpdate.updated,
          reservation_id: reservationUpdate.reservation_id,
          applied_fields: reservationUpdate.applied_fields,
          provider: "gemini",
          model,
          image_stored_by_hospedamais: false,
          warning: "Confira os campos extraídos antes de salvar.",
        });
      }
    }

    return json(
      request,
      { error: providerUnavailable ? "O provedor de leitura está temporariamente indisponível." : "A imagem não retornou campos legíveis." },
      502,
    );
  } catch (error) {
    console.error("scan-guest-form", error instanceof Error ? error.name : "unknown");
    return json(request, { error: "Não foi possível ler a ficha agora." }, 500);
  }
});

async function loadGeminiKey(admin: ReturnType<typeof createClient>) {
  const { data } = await admin.rpc("get_hotel_gemini_api_key");
  return Deno.env.get("GEMINI_API_KEY")?.trim()
    || Deno.env.get("GOOGLE_GENERATIVE_AI_API_KEY")?.trim()
    || (typeof data === "string" ? data.trim() : "");
}

function isAllowedOrigin(origin: string) {
  if (STATIC_ALLOWED_ORIGINS.has(origin)) return true;
  return /^https:\/\/sistemahotel-[a-z0-9-]+-sdk13\.vercel\.app$/i.test(origin);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function responseHeaders(request: Request) {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
    "Pragma": "no-cache",
    "Vary": "Origin",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Content-Type": "application/json; charset=utf-8",
  };
  const origin = request.headers.get("Origin");
  if (origin && isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function extractGeminiText(payload: RecordRow) {
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  return candidates.flatMap((candidate) => {
    const content = (candidate as RecordRow).content as RecordRow | undefined;
    return Array.isArray(content?.parts) ? content.parts : [];
  }).map((part) => String((part as RecordRow).text ?? "")).filter(Boolean).join("\n").trim();
}

function parseGuest(text: string) {
  if (!text) return null;
  const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    const raw = JSON.parse(clean) as RecordRow;
    const value = (key: string) => {
      const item = raw[key];
      return typeof item === "string" && item.trim() ? item.trim() : null;
    };
    return {
      nome: value("nome"), cpf: value("cpf"), telefone: value("telefone"), email: value("email"),
      data_nascimento: normalizeDate(value("data_nascimento")), profissao: value("profissao"),
      cidade: value("cidade"), estado: normalizeState(value("estado")), pais: value("pais"),
      cep: value("cep"), bairro: value("bairro"), estado_civil: normalizeCivil(value("estado_civil")),
      sexo: normalizeSex(value("sexo")),
      quarto: normalizeRoom(raw.quarto),
      data_checkin: normalizeDate(value("data_checkin")),
      horario_checkin: normalizeTime(value("horario_checkin")),
      horario_checkin_confiavel: raw.horario_checkin_confiavel === true,
      pagamento: normalizePayment(value("pagamento")),
      pagamento_confiavel: raw.pagamento_confiavel === true,
      valor_pago: normalizeMoney(raw.valor_pago),
      valor_pago_confiavel: raw.valor_pago_confiavel === true,
    };
  } catch {
    return null;
  }
}

async function applyReservationScan(admin: ReturnType<typeof createClient>, companyId: string, guest: RecordRow) {
  const room = Number(guest.quarto);
  if (!Number.isInteger(room) || room <= 0) return { updated: false, reservation_id: null, applied_fields: [] as string[] };

  let query = admin
    .from("reservations")
    .select("id,cliente_nome,quarto,checkin,valor_total,valor_pago,status")
    .eq("company_id", companyId)
    .eq("quarto", room)
    .in("status", ["reservado", "ocupado"])
    .order("checkin", { ascending: false })
    .limit(8);
  if (guest.data_checkin) query = query.eq("checkin", String(guest.data_checkin));
  const { data, error } = await query;
  if (error || !data?.length) return { updated: false, reservation_id: null, applied_fields: [] as string[] };

  const scannedName = normalizeName(String(guest.nome ?? ""));
  const candidates = scannedName
    ? data.filter((row) => normalizeName(String(row.cliente_nome ?? "")) === scannedName)
    : data;
  if (candidates.length !== 1) return { updated: false, reservation_id: null, applied_fields: [] as string[] };

  const reservation = candidates[0] as RecordRow;
  const patch: RecordRow = {};
  const applied: string[] = [];
  if (guest.horario_checkin_confiavel === true && guest.horario_checkin) {
    patch.horario_checkin = guest.horario_checkin;
    patch.status = "ocupado";
    patch.presence_status = "no_hotel";
    patch.checkin_at = new Date().toISOString();
    applied.push("horario_checkin", "checkin");
  }
  if (guest.pagamento_confiavel === true && guest.pagamento) {
    patch.pagamento = guest.pagamento;
    applied.push("pagamento");
  }
  if (guest.valor_pago_confiavel === true && typeof guest.valor_pago === "number") {
    const paid = Math.max(0, guest.valor_pago);
    patch.valor_pago = paid;
    patch.pago = Number(reservation.valor_total ?? 0) > 0 && paid >= Number(reservation.valor_total ?? 0);
    applied.push("valor_pago");
  }
  if (!applied.length) return { updated: false, reservation_id: reservation.id, applied_fields: [] as string[] };

  const updated = await admin.from("reservations").update(patch).eq("id", reservation.id).eq("company_id", companyId);
  if (updated.error) return { updated: false, reservation_id: reservation.id, applied_fields: [] as string[] };
  if (patch.status === "ocupado") {
    await admin.from("rooms").update({ situacao: "ocupado" }).eq("company_id", companyId).eq("numero", room);
  }
  return { updated: true, reservation_id: reservation.id, applied_fields: applied };
}

function normalizeName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
}
function normalizeRoom(value: unknown) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}
function normalizeTime(value: string | null) {
  if (!value) return null;
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return match ? match[0] : null;
}
function normalizePayment(value: string | null) {
  const clean = String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  if (clean === "pix") return "pix";
  if (clean.includes("credito")) return "crédito";
  if (clean.includes("debito")) return "débito";
  if (clean.includes("dinheiro")) return "dinheiro";
  if (clean.includes("transfer")) return "transferência";
  return null;
}
function normalizeMoney(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 100) / 100;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

function normalizeMime(value: string) {
  return value.toLowerCase() === "image/jpg" ? "image/jpeg" : value.toLowerCase();
}
function normalizeDate(value: string | null) {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}
function normalizeState(value: string | null) {
  const state = String(value ?? "").toUpperCase();
  return /^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/.test(state) ? state : null;
}
function normalizeCivil(value: string | null) {
  const clean = String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_|_$/g, "");
  return ["solteiro", "casado", "divorciado", "viuvo", "uniao_estavel"].includes(clean) ? clean : null;
}
function normalizeSex(value: string | null) {
  const clean = String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  return ["feminino", "masculino", "outro"].includes(clean) ? clean : null;
}
function json(request: Request, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: responseHeaders(request),
  });
}
