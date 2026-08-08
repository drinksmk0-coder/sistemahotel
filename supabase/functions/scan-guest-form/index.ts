import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RecordRow = Record<string, unknown>;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json({ ok: true });
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = request.headers.get("Authorization");
    if (!supabaseUrl || !serviceRoleKey) return json({ error: "Ambiente Supabase incompleto." }, 500);
    if (!authorization) return json({ error: "Login obrigatório." }, 401);

    const body = (await request.json().catch(() => ({}))) as {
      company_id?: string;
      image_data_url?: string;
    };
    const companyId = String(body.company_id ?? "").trim();
    const imageDataUrl = String(body.image_data_url ?? "");
    if (!companyId) return json({ error: "Empresa não informada." }, 400);

    const match = imageDataUrl.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/i);
    if (!match) return json({ error: "Envie uma foto JPG, PNG ou WebP válida." }, 400);
    if (match[2].length > 8_000_000) return json({ error: "A foto ficou grande demais. Tente novamente aproximando a ficha." }, 413);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const jwt = authorization.replace(/^Bearer\s+/i, "");
    const { data: authData, error: authError } = await admin.auth.getUser(jwt);
    if (authError || !authData.user) return json({ error: "Sessão inválida." }, 401);

    const { data: membership, error: membershipError } = await admin
      .from("company_members")
      .select("role")
      .eq("company_id", companyId)
      .eq("user_id", authData.user.id)
      .eq("ativo", true)
      .maybeSingle();
    if (membershipError) return json({ error: membershipError.message }, 500);
    if (!membership || !["dono", "recepcao"].includes(String(membership.role))) {
      return json({ error: "Acesso negado." }, 403);
    }

    const apiKey = await loadGeminiKey(admin);
    if (!apiKey) return json({ error: "Leitura por câmera ainda não está configurada no servidor." }, 503);

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
  "sexo": "feminino"|"masculino"|"outro"|null
}
Se houver CPF, copie os 11 dígitos exatamente como aparecem. Se a imagem estiver ilegível, use null no campo.
`.trim();

    const models = [...new Set([
      Deno.env.get("GEMINI_MODEL")?.trim(),
      "gemini-3.5-flash",
      "gemini-3.5-flash-lite",
    ].filter((value): value is string => Boolean(value)))];

    let lastMessage = "Não foi possível interpretar a ficha.";
    for (const model of models) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
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
        },
      );
      const payload = (await response.json().catch(() => ({}))) as RecordRow;
      if (!response.ok) {
        lastMessage = nestedString(payload, ["error", "message"]) || `Falha no modelo ${model}.`;
        if ([401, 403].includes(response.status)) break;
        continue;
      }

      const text = extractGeminiText(payload);
      const guest = parseGuest(text);
      if (guest) {
        return json({
          guest,
          provider: "gemini",
          model,
          image_stored_by_hospedamais: false,
          warning: "Confira os campos extraídos antes de salvar.",
        });
      }
      lastMessage = "A IA respondeu, mas não retornou campos utilizáveis.";
    }

    return json({ error: lastMessage.slice(0, 220) }, 502);
  } catch (error) {
    console.error("scan-guest-form", error instanceof Error ? error.message : "unknown");
    return json({ error: "Não foi possível ler a ficha agora." }, 500);
  }
});

async function loadGeminiKey(admin: ReturnType<typeof createClient>) {
  const { data } = await admin.rpc("get_hotel_gemini_api_key");
  return Deno.env.get("GEMINI_API_KEY")?.trim()
    || Deno.env.get("GOOGLE_GENERATIVE_AI_API_KEY")?.trim()
    || (typeof data === "string" ? data.trim() : "");
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
    };
  } catch {
    return null;
  }
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
function nestedString(payload: RecordRow, path: string[]) {
  let current: unknown = payload;
  for (const key of path) {
    if (!current || typeof current !== "object") return "";
    current = (current as RecordRow)[key];
  }
  return typeof current === "string" ? current : "";
}
function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
