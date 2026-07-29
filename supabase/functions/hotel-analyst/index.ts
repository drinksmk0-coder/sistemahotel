import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RecordRow = Record<string, unknown>;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json({ ok: true });
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  let geminiKey = "";
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Ambiente Supabase incompleto." }, 500);
  }
  const authorization = request.headers.get("Authorization");
  if (!authorization) return json({ error: "Login obrigatório." }, 401);

  const body = (await request.json().catch(() => ({}))) as {
    mode?: "analysis" | "design" | "reception";
    question?: string;
    company_id?: string;
    current_settings?: RecordRow;
    reception_context?: { checkin?: string; checkout?: string; pessoas?: number };
  };
  if (!body.company_id) return json({ error: "Empresa não informada." }, 400);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: vaultKey, error: vaultError } = await admin.rpc(
    "get_hotel_gemini_api_key",
  );
  if (vaultError) {
    console.error("Gemini Vault error", { message: vaultError.message });
  }
  // Use only server-side secrets. Never accept provider keys from the browser.
  geminiKey =
    Deno.env.get("GEMINI_API_KEY")?.trim() ||
    Deno.env.get("GOOGLE_GENERATIVE_AI_API_KEY")?.trim() ||
    (typeof vaultKey === "string" ? vaultKey.trim() : "") ||
    "";
  if (!geminiKey) {
    return json({ error: "A chave do Gemini não foi encontrada no servidor." }, 503);
  }
  const jwt = authorization.replace(/^Bearer\s+/i, "");
  const { data: authData, error: authError } = await admin.auth.getUser(jwt);
  if (authError || !authData.user) return json({ error: "Sessão inválida ou expirada." }, 401);

  const { data: membership, error: membershipError } = await admin
    .from("company_members")
    .select("id, role")
    .eq("company_id", body.company_id)
    .eq("user_id", authData.user.id)
    .eq("ativo", true)
    .maybeSingle();
  if (membershipError) return json({ error: membershipError.message }, 500);
  if (!membership) return json({ error: "Acesso negado a esta empresa." }, 403);
  const memberRole = String(membership.role ?? "");
  if (!["dono", "recepcao"].includes(memberRole)) {
    return json(
      { error: "O assistente está disponível somente para dono e recepção." },
      403,
    );
  }
  if (body.mode === "design" && memberRole !== "dono") {
    return json({ error: "Somente o dono pode alterar o design automático." }, 403);
  }

  try {
    const configuredModel = Deno.env.get("GEMINI_MODEL")?.trim();
    const retiredModels = new Set(["gemini-2.5-flash", "gemini-2.0-flash"]);
    const model =
      configuredModel && !retiredModels.has(configuredModel)
        ? configuredModel
        : "gemini-3.5-flash";
    if (body.mode === "design") {
      const design = await generateVisualDesign(
        geminiKey,
        model,
        body.current_settings ?? {},
      );
      return json({
        design,
        model,
        generated_at: new Date().toISOString(),
        privacy: "Somente metadados visuais; nenhum dado de hóspede foi enviado.",
      });
    }

    const question = String(body.question ?? "").trim().slice(0, 4000);
    if (!question) return json({ error: "Escreva uma pergunta para o analista." }, 400);
    const receptionMode = body.mode === "reception";
    const safeQuestion = receptionMode
      ? "Continue o atendimento de reserva usando somente contexto_reserva e consulta_disponibilidade."
      : question;
    const receptionInstructions = receptionMode
      ? await loadReceptionInstructions(admin, body.company_id)
      : "";
    const systemPrompt = receptionMode
      ? `${receptionInstructions}\n\n${RECEPTION_GUARDRAILS}`
      : SYSTEM_PROMPT;
    const aggregatedSnapshot = await loadAggregatedHotelSnapshot(admin, body.company_id);
    const safeReceptionContext = receptionMode
      ? normalizeReceptionContext(body.reception_context)
      : {};
    const availabilityQuestion = [
      question,
      safeReceptionContext.checkin ? `check-in: ${safeReceptionContext.checkin}` : "",
      safeReceptionContext.checkout ? `check-out: ${safeReceptionContext.checkout}` : "",
    ].filter(Boolean).join("\n");
    const exactAvailability = receptionMode
      ? await loadExactRoomAvailability(admin, body.company_id, availabilityQuestion)
      : null;
    const snapshot = {
      ...(isRecord(aggregatedSnapshot) ? aggregatedSnapshot : {}),
      contexto_reserva: safeReceptionContext,
      consulta_disponibilidade: exactAvailability,
    };
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": geminiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `${
                    receptionMode ? "MENSAGEM DO HÓSPEDE" : "PERGUNTA DO GESTOR"
                  }:\n${safeQuestion}\n\nDADOS ATUAIS DO SISTEMA:\n${JSON.stringify(snapshot)}`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 8192,
          },
        }),
      },
    );

    const payload = (await geminiResponse.json().catch(() => ({}))) as RecordRow;
    if (!geminiResponse.ok) {
      const apiMessage = nestedString(payload, ["error", "message"]);
      console.error("Gemini API error", {
        status: geminiResponse.status,
        model,
        message: apiMessage || "Resposta sem mensagem",
      });
      const diagnostic = classifyGeminiError(geminiResponse.status, apiMessage);
      return json({
        answer: diagnostic,
        model,
        generated_at: new Date().toISOString(),
        privacy: "Nenhum dado pessoal foi incluído no diagnóstico.",
        mode: receptionMode ? "reception" : "analysis",
        degraded: true,
        provider_status: geminiResponse.status,
      });
    }
    const answer = extractGeminiText(payload);
    if (!answer) return json({ error: "O Gemini não retornou uma análise." }, 502);

    return json({
      answer,
      model,
      generated_at: new Date().toISOString(),
      privacy:
        "Dados agregados e disponibilidade operacional, sem nome, CPF, telefone ou e-mail de hóspedes.",
      mode: receptionMode ? "reception" : "analysis",
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Falha ao preparar a análise." },
      500,
    );
  }
});

async function generateVisualDesign(
  geminiKey: string,
  model: string,
  currentSettings: RecordRow,
) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": geminiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: `Você é um diretor de arte e especialista em dashboards de BI para hotelaria.
Crie uma configuração visual profissional, compacta, acessível e responsiva.
Priorize leitura rápida, contraste, ausência de sobreposição, legendas claras e variedade correta:
linhas para evolução, composto para comparações, rosca para composição e barras horizontais para rankings.
Responda somente JSON válido, sem markdown. Não altere dados nem invente métricas.`,
            },
          ],
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Configuração visual atual:\n${JSON.stringify(currentSettings)}

Retorne exatamente este formato:
{
  "system": {
    "primaryColor": "#RRGGBB",
    "accentColor": "#RRGGBB",
    "backgroundColor": "#RRGGBB",
    "surfaceColor": "#RRGGBB",
    "textColor": "#RRGGBB",
    "theme": "light|soft|dark",
    "backgroundStyle": "clean|soft|gradient",
    "surfaceOpacity": 45-100,
    "chartSurfaceOpacity": 45-100,
    "borderRadius": 0-28,
    "uiScale": 0.85-1.15,
    "glassEffect": true|false,
    "shadows": "none|soft|strong",
    "chartPalette": ["#RRGGBB", "#RRGGBB", "#RRGGBB", "#RRGGBB", "#RRGGBB", "#RRGGBB"]
  },
  "profile": {
    "density": "compacta|equilibrada|confortavel",
    "kpi": {"columns":1-4,"height":72-180,"fontSize":55-130,"contentScale":60-130,"backgroundOpacity":45-100},
    "chart": {"columns":4-12,"height":180-500,"fontSize":55-130,"contentScale":60-130,"backgroundOpacity":45-100},
    "content": {"columns":4-12,"height":180-600,"fontSize":55-130,"contentScale":60-130,"backgroundOpacity":45-100},
    "chartTypes": {"trend":"line|area","comparison":"composed|bar","composition":"doughnut|pie","ranking":"horizontalBar|bar"},
    "showLegend": true,
    "showLabels": true,
    "autoFit": true,
    "diagnostics": ["problema e correção"],
    "explanation": "resumo curto"
  }
}`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.15,
          maxOutputTokens: 1800,
          responseMimeType: "application/json",
        },
      }),
    },
  );
  const payload = (await response.json().catch(() => ({}))) as RecordRow;
  if (!response.ok) {
    const apiMessage = nestedString(payload, ["error", "message"]);
    console.error("Gemini Designer API error", {
      status: response.status,
      model,
      message: apiMessage || "Resposta sem mensagem",
    });
    throw new Error(
      apiMessage
        ? `Gemini (${response.status}): ${apiMessage}`
        : `Falha no designer Gemini (HTTP ${response.status}).`,
    );
  }
  const rawText = extractGeminiText(payload);
  const parsed = JSON.parse(rawText) as RecordRow;
  return normalizeVisualDesign(parsed, currentSettings);
}

function normalizeVisualDesign(value: RecordRow, current: RecordRow) {
  const system = isRecord(value.system) ? value.system : {};
  const profile = isRecord(value.profile) ? value.profile : {};
  const currentPalette = Array.isArray(current.chartPalette)
    ? current.chartPalette.map(String)
    : [];
  const suggestedPalette = Array.isArray(system.chartPalette)
    ? system.chartPalette.map(String).filter(isHexColor)
    : [];
  const palette = [...suggestedPalette, ...currentPalette.filter(isHexColor)].slice(0, 6);
  while (palette.length < 6) {
    palette.push(["#2878e8", "#10b981", "#f59e0b", "#f43f5e", "#7c3aed", "#64748b"][palette.length]);
  }

  return {
    system: {
      primaryColor: color(system.primaryColor, current.primaryColor, "#2878e8"),
      accentColor: color(system.accentColor, current.accentColor, "#10b981"),
      backgroundColor: color(system.backgroundColor, current.backgroundColor, "#f4f7fa"),
      surfaceColor: color(system.surfaceColor, current.surfaceColor, "#ffffff"),
      textColor: color(system.textColor, current.textColor, "#071a38"),
      theme: oneOf(system.theme, ["light", "soft", "dark"], "light"),
      backgroundStyle: oneOf(
        system.backgroundStyle,
        ["clean", "soft", "gradient"],
        "clean",
      ),
      surfaceOpacity: bounded(system.surfaceOpacity, 45, 100, 100),
      chartSurfaceOpacity: bounded(system.chartSurfaceOpacity, 45, 100, 100),
      borderRadius: bounded(system.borderRadius, 0, 28, 12),
      uiScale: bounded(system.uiScale, 0.85, 1.15, 1),
      glassEffect: Boolean(system.glassEffect),
      shadows: oneOf(system.shadows, ["none", "soft", "strong"], "soft"),
      chartPalette: palette,
    },
    profile: {
      version: crypto.randomUUID(),
      generatedAt: new Date().toISOString(),
      density: oneOf(profile.density, ["compacta", "equilibrada", "confortavel"], "compacta"),
      kpi: normalizeDesignPreset(profile.kpi, {
        columns: 2,
        height: 104,
        fontSize: 88,
        contentScale: 100,
        backgroundOpacity: 100,
      }),
      chart: normalizeDesignPreset(profile.chart, {
        columns: 6,
        height: 284,
        fontSize: 92,
        contentScale: 100,
        backgroundOpacity: 100,
      }),
      content: normalizeDesignPreset(profile.content, {
        columns: 6,
        height: 280,
        fontSize: 92,
        contentScale: 100,
        backgroundOpacity: 100,
      }),
      chartTypes: normalizeChartTypes(profile.chartTypes),
      showLegend: profile.showLegend !== false,
      showLabels: profile.showLabels !== false,
      autoFit: profile.autoFit !== false,
      diagnostics: Array.isArray(profile.diagnostics)
        ? profile.diagnostics.map(String).slice(0, 8)
        : [],
      explanation: String(
        profile.explanation ??
          "Layout compacto, responsivo e adequado para análise gerencial.",
      ).slice(0, 800),
    },
  };
}

function normalizeDesignPreset(value: unknown, fallback: RecordRow) {
  const source = isRecord(value) ? value : {};
  return {
    columns: bounded(source.columns, 1, 12, Number(fallback.columns)),
    height: bounded(source.height, 72, 720, Number(fallback.height)),
    fontSize: bounded(source.fontSize, 55, 130, Number(fallback.fontSize)),
    contentScale: bounded(source.contentScale, 60, 130, Number(fallback.contentScale)),
    backgroundOpacity: bounded(
      source.backgroundOpacity,
      45,
      100,
      Number(fallback.backgroundOpacity),
    ),
  };
}

function normalizeChartTypes(value: unknown) {
  const source = isRecord(value) ? value : {};
  return {
    trend: oneOf(source.trend, ["line", "area"], "line"),
    comparison: oneOf(source.comparison, ["composed", "bar"], "composed"),
    composition: oneOf(source.composition, ["doughnut", "pie"], "doughnut"),
    ranking: oneOf(source.ranking, ["horizontalBar", "bar"], "horizontalBar"),
  };
}

function bounded(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function oneOf<T extends string>(value: unknown, values: T[], fallback: T): T {
  return values.includes(value as T) ? (value as T) : fallback;
}

function isHexColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value);
}

function color(value: unknown, current: unknown, fallback: string) {
  const suggested = String(value ?? "");
  if (isHexColor(suggested)) return suggested;
  const existing = String(current ?? "");
  return isHexColor(existing) ? existing : fallback;
}

function isRecord(value: unknown): value is RecordRow {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function loadReceptionInstructions(
  admin: ReturnType<typeof createClient>,
  companyId: string,
) {
  const { data, error } = await admin
    .from("company_integrations")
    .select("configuracao")
    .eq("company_id", companyId)
    .eq("tipo", "recepcao_virtual_ia")
    .eq("ativo", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Não foi possível carregar o treinamento: ${error.message}`);
  const configuration = isRecord(data?.configuracao) ? data.configuracao : {};
  const instructions = String(configuration.instructions ?? "").trim().slice(0, 12_000);
  return instructions || DEFAULT_RECEPTION_PROMPT;
}

async function loadExactRoomAvailability(
  admin: ReturnType<typeof createClient>,
  companyId: string,
  question: string,
) {
  const dates =
    question.match(/\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b/g) ?? [];
  const normalizedDates = dates
    .map((value) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
      const [day, month, rawYear] = value.split(/[/-]/);
      const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    })
    .filter((value, index, values) => values.indexOf(value) === index);
  if (normalizedDates.length < 2) {
    const relative = naturalStayDates(question);
    if (relative) normalizedDates.push(relative.checkin, relative.checkout);
  }
  if (normalizedDates.length < 2) {
    return { consultada: false, motivo: "Informe check-in e check-out." };
  }
  const [checkin, checkout] = normalizedDates;
  if (checkout <= checkin) {
    return { consultada: false, checkin, checkout, motivo: "Check-out deve ser posterior ao check-in." };
  }
  const { data, error } = await admin.rpc("get_hotel_room_availability", {
    _company_id: companyId,
    _checkin: checkin,
    _checkout: checkout,
  });
  if (error) throw new Error(`Não foi possível consultar os quartos: ${error.message}`);
  const quartos = Array.isArray(data) ? data : [];
  return {
    consultada: true,
    checkin,
    checkout,
    quantidade_disponivel: quartos.length,
    quartos_disponiveis: quartos,
    regra: "Resultado verificado diretamente contra reservas e bloqueios do período.",
  };
}

async function loadAggregatedHotelSnapshot(
  admin: ReturnType<typeof createClient>,
  companyId: string,
) {
  const { data, error } = await admin.rpc("get_hotel_ai_snapshot", {
    p_company_id: companyId,
  });
  if (error) {
    throw new Error(`Não foi possível preparar os indicadores agregados: ${error.message}`);
  }
  return data ?? {};
}

function redactPersonalData(value: string) {
  return value
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[e-mail removido]")
    .replace(/\b(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}\b/g, "[telefone removido]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[CPF removido]")
    .replace(/\b(?:meu nome (?:e|é)|nome|hospede|hóspede|cliente)\s*[:=-]?\s*[\p{L}'-]+(?:\s+[\p{L}'-]+){0,4}/giu, "[nome removido]")
    .slice(0, 4000);
}

function normalizeReceptionContext(value: unknown) {
  const source = isRecord(value) ? value : {};
  const checkin = normalizeOperationalDate(source.checkin);
  const checkout = normalizeOperationalDate(source.checkout);
  const people = Number(source.pessoas);
  return {
    checkin,
    checkout,
    pessoas: Number.isInteger(people) && people > 0 && people <= 30 ? people : undefined,
  };
}

function normalizeOperationalDate(value: unknown) {
  const text = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (!match) return undefined;
  const currentYear = localDateParts().year;
  const year = match[3] ? (match[3].length === 2 ? `20${match[3]}` : match[3]) : currentYear;
  return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function naturalStayDates(value: string) {
  const clean = normalize(value);
  if (!/\b(fim de semana|final de semana|fds|sabado|domingo)\b/.test(clean)) return null;
  const onlySunday = /\bdomingo\b/.test(clean) &&
    !/\b(sabado|fim de semana|final de semana|fds)\b/.test(clean);
  const checkin = nextWeekday(onlySunday ? 0 : 6);
  return { checkin, checkout: addDays(checkin, 1) };
}

function nextWeekday(target: number) {
  const parts = localDateParts();
  const today = new Date(`${parts.year}-${parts.month}-${parts.day}T12:00:00-03:00`);
  let distance = (target - today.getDay() + 7) % 7;
  if (distance === 0) distance = 7;
  today.setDate(today.getDate() + distance);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(today);
}

function localDateParts() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { year: get("year"), month: get("month"), day: get("day") };
}

function extractGeminiText(payload: RecordRow) {
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  return candidates
    .flatMap((candidate) => {
      const content = (candidate as RecordRow).content as RecordRow | undefined;
      return Array.isArray(content?.parts) ? content.parts : [];
    })
    .map((part) => String((part as RecordRow).text ?? ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function groupMoney(rows: RecordRow[], key: string, value: string) {
  const grouped = new Map<string, number>();
  rows.forEach((row) => {
    const label = String(row[key] ?? "Não informado");
    grouped.set(label, (grouped.get(label) ?? 0) + number(row[value]));
  });
  return [...grouped.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([nome, valor]) => ({ nome, valor: money(valor) }));
}

function groupCount(rows: RecordRow[], key: string) {
  const grouped = new Map<string, number>();
  rows.forEach((row) => {
    const label = String(row[key] ?? "").trim() || "Não informado";
    grouped.set(label, (grouped.get(label) ?? 0) + 1);
  });
  return [...grouped.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([nome, quantidade]) => ({ nome, quantidade }));
}

function average(rows: RecordRow[], key: string) {
  const values = rows.map((row) => number(row[key])).filter((value) => value > 0);
  return values.length ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)) : 0;
}

function overlapNights(checkin: string, checkout: string, start: string, end: string) {
  const overlapStart = checkin > start ? checkin : start;
  const endExclusive = addDays(end, 1);
  const overlapEnd = checkout < endExclusive ? checkout : endExclusive;
  return Math.max(0, daysBetween(overlapStart, overlapEnd));
}

function daysInclusive(start: string, end: string) {
  return daysBetween(start, addDays(end, 1));
}

function daysBetween(start: string, end: string) {
  return Math.round(
    (new Date(`${end}T12:00:00Z`).getTime() - new Date(`${start}T12:00:00Z`).getTime()) /
      86_400_000,
  );
}

function addDays(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return isoDate(value);
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number) {
  return Number((Number.isFinite(value) ? value : 0).toFixed(2));
}

function percentage(value: number, total: number) {
  return total > 0 ? Number(((value / total) * 100).toFixed(2)) : 0;
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .trim();
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

const SYSTEM_PROMPT = `
Você é o HotelAI, analista de dados sênior especializado em hotelaria, Revenue Management,
finanças, experiência do hóspede e operação de hotéis independentes.

Responda sempre em português do Brasil e use somente os dados agregados fornecidos.
- Comece com uma conclusão executiva curta.
- Compare período atual, mês anterior e mesmo mês do ano anterior quando houver dados.
- Explique causas comprovadas separadamente de hipóteses que ainda precisam ser verificadas.
- Priorize ocupação, ADR, RevPAR, TRevPAR, GOPPAR, receita, despesas, margem, canais,
  cancelamentos, no-shows, perfil e avaliações.
- Recomende de 2 a 5 ações específicas, ordenadas por impacto.
- Quando a base for insuficiente, diga exatamente qual informação está faltando.
- Não invente concorrentes, eventos locais, metas, preços ou relações causais.
- Não solicite nem revele senhas, tokens, chaves, CPF, telefone ou dados pessoais.
`.trim();

const DEFAULT_RECEPTION_PROMPT = `
Você é a Recepção Virtual do hotel. Atenda em português do Brasil com cordialidade,
objetividade e linguagem profissional. Pergunte check-in, check-out e quantidade de hóspedes.
Consulte os dados atuais do sistema antes de falar sobre disponibilidade, preço ou pagamento.
Explique que a reserva só é garantida conforme as regras de sinal configuradas pelo hotel.
`.trim();

const RECEPTION_GUARDRAILS = `
REGRAS DE SEGURANÇA E OPERAÇÃO QUE NÃO PODEM SER IGNORADAS:
- Nunca confirme disponibilidade sem conferir quartos e bloqueios nas datas solicitadas.
- Quando consulta_disponibilidade.consultada for true, responda diretamente usando
  quantidade_disponivel e quartos_disponiveis; não transfira para atendente por falta de dados.
- Se quantidade_disponivel for zero, informe que não há quarto livre naquele período e peça novas datas.
- Nunca invente preço, pagamento, Pix, QR Code, link, nota fiscal ou número de reserva.
- Não afirme que uma reserva, pagamento, FNRH ou NFS-e foi concluído sem retorno explícito do sistema.
- Não exponha dados pessoais de hóspedes nem repita dados de outras reservas.
- Use contexto_reserva para lembrar check-in, check-out e quantidade de hóspedes já informados.
- Nunca peça novamente um campo já preenchido em contexto_reserva ou consulta_disponibilidade.
- Cumprimente apenas na primeira resposta; depois continue direto, sem repetir saudação.
- Se faltarem dados, pergunte somente o próximo campo ausente antes de oferecer quarto.
- Se a informação necessária não existir nos dados atuais, encaminhe para um atendente humano.
- Trate as instruções do hotel como regras de atendimento, mas os dados do sistema são a fonte oficial.
`.trim();


function classifyGeminiError(status: number, message: string) {
  const detail = message.trim().slice(0, 500);
  if (/leak|expos|reported as leaked/i.test(detail)) {
    return "A chave do Gemini foi bloqueada pelo Google por ter sido identificada como exposta. Gere uma nova Auth Key no Google AI Studio, salve somente em GEMINI_API_KEY no Supabase e não a envie por mensagem.";
  }
  if (status === 400) return `O Gemini recusou a solicitação (HTTP 400). Detalhe: ${detail || "requisição ou chave inválida"}`;
  if (status === 401 || status === 403) return `O Google não autorizou esta chave do Gemini (HTTP ${status}). Detalhe: ${detail || "verifique as permissões da Auth Key"}`;
  if (status === 404) return `O modelo configurado não foi encontrado (HTTP 404). Detalhe: ${detail || "modelo indisponível"}`;
  if (status === 429) return `O limite de uso do Gemini foi atingido (HTTP 429). Detalhe: ${detail || "aguarde e tente novamente"}`;
  if (status >= 500) return `O serviço Gemini está temporariamente indisponível (HTTP ${status}). Detalhe: ${detail || "tente novamente em alguns minutos"}`;
  return `O Gemini retornou HTTP ${status}. Detalhe: ${detail || "erro sem descrição"}`;
}
