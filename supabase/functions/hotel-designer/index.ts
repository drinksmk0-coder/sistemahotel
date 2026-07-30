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
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Ambiente Supabase incompleto." }, 500);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization) return json({ error: "Login obrigatório." }, 401);

  const body = (await request.json().catch(() => ({}))) as {
    company_id?: string;
    current_settings?: RecordRow;
  };
  const companyId = String(body.company_id ?? "").trim();
  if (!companyId) return json({ error: "Empresa não informada." }, 400);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const jwt = authorization.replace(/^Bearer\s+/i, "");
  const { data: authData, error: authError } = await admin.auth.getUser(jwt);
  if (authError || !authData.user) {
    return json({ error: "Sessão inválida ou expirada." }, 401);
  }

  const { data: membership, error: membershipError } = await admin
    .from("company_members")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", authData.user.id)
    .eq("ativo", true)
    .maybeSingle();
  if (membershipError) return json({ error: membershipError.message }, 500);
  if (!membership || String(membership.role) !== "dono") {
    return json({ error: "Somente o dono pode alterar o design automático." }, 403);
  }

  const { data: vaultKey } = await admin.rpc("get_hotel_gemini_api_key");
  const geminiKey =
    Deno.env.get("GEMINI_API_KEY")?.trim() ||
    Deno.env.get("GOOGLE_GENERATIVE_AI_API_KEY")?.trim() ||
    (typeof vaultKey === "string" ? vaultKey.trim() : "");
  if (!geminiKey) {
    return json({ error: "A chave do Gemini não foi encontrada no servidor." }, 503);
  }

  const configuredModel = Deno.env.get("GEMINI_MODEL")?.trim();
  const retiredModels = new Set(["gemini-2.5-flash", "gemini-2.0-flash"]);
  const model =
    configuredModel && !retiredModels.has(configuredModel)
      ? configuredModel
      : "gemini-3.5-flash";
  const currentSettings = body.current_settings ?? {};

  let design: ReturnType<typeof fallbackVisualDesign>;
  let degraded = false;
  let warning = "";
  try {
    design = await generateVisualDesign(geminiKey, model, currentSettings);
  } catch (error) {
    degraded = true;
    warning =
      error instanceof Error
        ? error.message
        : "O Gemini não retornou uma proposta válida.";
    design = fallbackVisualDesign(currentSettings, warning);
  }

  return json({
    design,
    model,
    degraded,
    warning: degraded ? warning : undefined,
    generated_at: new Date().toISOString(),
    privacy: "Somente metadados visuais; nenhum dado de hóspede foi enviado.",
  });
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
                text: `Configuração visual atual:
${JSON.stringify(currentSettings)}

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
    throw new Error(
      apiMessage
        ? `Gemini (${response.status}): ${apiMessage}`
        : `Falha no designer Gemini (HTTP ${response.status}).`,
    );
  }

  const rawText = extractGeminiText(payload);
  if (!rawText) throw new Error("O Gemini não retornou conteúdo para o designer.");
  const jsonText = rawText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  let parsed: RecordRow;
  try {
    parsed = JSON.parse(jsonText) as RecordRow;
  } catch {
    throw new Error("O Gemini retornou uma proposta visual incompleta.");
  }
  return normalizeVisualDesign(parsed, currentSettings);
}

function fallbackVisualDesign(current: RecordRow, reason = "") {
  const theme = oneOf(current.theme, ["light", "soft", "dark"], "soft");
  const dark = theme === "dark";
  return normalizeVisualDesign(
    {
      system: {
        primaryColor: current.primaryColor,
        accentColor: current.accentColor,
        backgroundColor: current.backgroundColor,
        surfaceColor: current.surfaceColor,
        textColor: current.textColor,
        theme,
        backgroundStyle: current.backgroundStyle,
        surfaceOpacity: current.surfaceOpacity,
        chartSurfaceOpacity: current.chartSurfaceOpacity,
        borderRadius: current.borderRadius,
        uiScale: current.uiScale,
        glassEffect: current.glassEffect,
        shadows: current.shadows,
        chartPalette: current.chartPalette,
      },
      profile: {
        density: "compacta",
        kpi: { columns: 2, height: 104, fontSize: 88, contentScale: 100 },
        chart: { columns: 6, height: 284, fontSize: 92, contentScale: 100 },
        content: { columns: 6, height: 280, fontSize: 92, contentScale: 100 },
        chartTypes: {
          trend: "line",
          comparison: "composed",
          composition: "doughnut",
          ranking: "horizontalBar",
        },
        showLegend: true,
        showLabels: true,
        autoFit: true,
        diagnostics: reason
          ? [`Gemini indisponível: ${reason.slice(0, 220)}`]
          : ["Configuração visual segura aplicada."],
        explanation: dark
          ? "Tema escuro preservado com contraste e legibilidade."
          : "Tema claro preservado com contraste e legibilidade.",
      },
    },
    current,
  );
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
    palette.push(
      ["#2878e8", "#10b981", "#f59e0b", "#f43f5e", "#7c3aed", "#64748b"][
        palette.length
      ],
    );
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
      density: oneOf(
        profile.density,
        ["compacta", "equilibrada", "confortavel"],
        "compacta",
      ),
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
    contentScale: bounded(
      source.contentScale,
      60,
      130,
      Number(fallback.contentScale),
    ),
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

function nestedString(payload: RecordRow, path: string[]) {
  let current: unknown = payload;
  for (const key of path) {
    if (!current || typeof current !== "object") return "";
    current = (current as RecordRow)[key];
  }
  return typeof current === "string" ? current : "";
}

function isRecord(value: unknown): value is RecordRow {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
