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

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const geminiKey =
    Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("GOOGLE_GENERATIVE_AI_API_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Ambiente Supabase incompleto." }, 500);
  }
  if (!geminiKey) {
    return json(
      {
        error:
          "A chave não foi encontrada. Cadastre o segredo GEMINI_API_KEY no Supabase Edge Functions.",
      },
      503,
    );
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization) return json({ error: "Login obrigatório." }, 401);

  const body = (await request.json().catch(() => ({}))) as {
    mode?: "analysis" | "design" | "reception";
    question?: string;
    company_id?: string;
    current_settings?: RecordRow;
  };
  if (!body.company_id) return json({ error: "Empresa não informada." }, 400);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
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
    const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.5-flash";
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
    const receptionInstructions = receptionMode
      ? await loadReceptionInstructions(admin, body.company_id)
      : "";
    const systemPrompt = receptionMode
      ? `${receptionInstructions}\n\n${RECEPTION_GUARDRAILS}`
      : SYSTEM_PROMPT;
    const snapshot = await buildHotelSnapshot(admin, body.company_id);
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
                  }:\n${question}\n\nDADOS ATUAIS DO SISTEMA:\n${JSON.stringify(snapshot)}`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1800,
          },
        }),
      },
    );

    const payload = (await geminiResponse.json().catch(() => ({}))) as RecordRow;
    if (!geminiResponse.ok) {
      const apiMessage = nestedString(payload, ["error", "message"]);
      return json({ error: apiMessage || "Falha ao consultar o Gemini." }, 502);
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
    throw new Error(nestedString(payload, ["error", "message"]) || "Falha no designer Gemini.");
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

async function buildHotelSnapshot(
  admin: ReturnType<typeof createClient>,
  companyId: string,
) {
  const tables = [
    ["rooms", "numero,preco,configuracao,situacao"],
    [
      "reservations",
      "quarto,checkin,checkout,valor_total,valor_pago,valor_diaria,status,canal,pessoas,diarias,pagamento,motivo_estadia",
    ],
    [
      "sales",
      "data,categoria,total,valor_pago,status,pagamento",
    ],
    ["expenses", "data,categoria,valor"],
    [
      "clients",
      "cidade,estado,pais,sexo,estado_civil,profissao,data_nascimento,tipo,visitas,ativo",
    ],
    [
      "feedbacks",
      "created_at,nota_geral,nota_limpeza,nota_conforto,nota_atendimento,nota_wifi,recomendaria",
    ],
    ["complaints", "created_at,categoria,gravidade,status"],
  ] as const;

  const results = await Promise.all(
    tables.map(async ([table, columns]) => {
      const { data, error } = await admin
        .from(table)
        .select(columns)
        .eq("company_id", companyId)
        .limit(10000);
      if (error) throw new Error(`Não foi possível ler ${table}: ${error.message}`);
      return data as unknown as RecordRow[];
    }),
  );
  const [rooms, reservations, sales, expenses, clients, feedbacks, complaints] = results;
  const now = new Date();
  const today = isoDate(now);
  const currentStart = `${today.slice(0, 7)}-01`;
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const currentEnd = isoDate(new Date(nextMonth.getTime() - 86_400_000));
  const previousStart = isoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const previousEnd = isoDate(new Date(now.getFullYear(), now.getMonth(), 0));
  const yearAgoStart = isoDate(new Date(now.getFullYear() - 1, now.getMonth(), 1));
  const yearAgoEnd = isoDate(new Date(now.getFullYear() - 1, now.getMonth() + 1, 0));

  const periods = {
    atual: summarizePeriod(
      currentStart,
      currentEnd,
      rooms,
      reservations,
      sales,
      expenses,
    ),
    mes_anterior: summarizePeriod(
      previousStart,
      previousEnd,
      rooms,
      reservations,
      sales,
      expenses,
    ),
    mesmo_mes_ano_anterior: summarizePeriod(
      yearAgoStart,
      yearAgoEnd,
      rooms,
      reservations,
      sales,
      expenses,
    ),
  };

  return {
    data_referencia: today,
    periodos: periods,
    operacao_hoje: {
      chegadas: reservations.filter(
        (row) => row.checkin === today && row.status !== "cancelado",
      ).length,
      saidas: reservations.filter(
        (row) => row.checkout === today && row.status !== "cancelado",
      ).length,
      hospedados: reservations.filter(
        (row) =>
          String(row.status) !== "cancelado" &&
          String(row.status) !== "finalizado" &&
          String(row.checkin) <= today &&
          String(row.checkout) >= today,
      ).length,
      conta_a_receber: money(
        reservations.reduce(
          (sum, row) =>
            sum + Math.max(0, number(row.valor_total) - number(row.valor_pago)),
          0,
        ) +
          sales.reduce(
            (sum, row) => sum + Math.max(0, number(row.total) - number(row.valor_pago)),
            0,
          ),
      ),
    },
    disponibilidade_agregada: buildAvailabilitySummary(today, rooms, reservations),
    canais: groupMoney(reservations, "canal", "valor_total"),
    receita_por_quarto: groupMoney(reservations, "quarto", "valor_total"),
    vendas_por_categoria: groupMoney(sales, "categoria", "total"),
    formas_pagamento: {
      hospedagem: groupMoney(reservations, "pagamento", "valor_pago"),
      vendas: groupMoney(sales, "pagamento", "valor_pago"),
    },
    perfil_hospedes: {
      total_ativos: clients.filter((row) => row.ativo !== false).length,
      estados: groupCount(clients, "estado"),
      paises: groupCount(clients, "pais"),
      sexo: groupCount(clients, "sexo"),
      estado_civil: groupCount(clients, "estado_civil"),
      profissoes: groupCount(clients, "profissao"),
      tipos: groupCount(clients, "tipo"),
    },
    experiencia: {
      medias: {
        geral: average(feedbacks, "nota_geral"),
        limpeza: average(feedbacks, "nota_limpeza"),
        conforto: average(feedbacks, "nota_conforto"),
        atendimento: average(feedbacks, "nota_atendimento"),
        wifi: average(feedbacks, "nota_wifi"),
      },
      recomendacao_percentual: percentage(
        feedbacks.filter((row) => row.recomendaria === true).length,
        feedbacks.length,
      ),
      reclamacoes_por_categoria: groupCount(complaints, "categoria"),
      reclamacoes_abertas: complaints.filter((row) => row.status !== "resolvido").length,
    },
    qualidade_dados: {
      reservas: reservations.length,
      vendas: sales.length,
      despesas: expenses.length,
      clientes: clients.length,
      avaliacoes: feedbacks.length,
      reclamacoes: complaints.length,
    },
  };
}

function buildAvailabilitySummary(
  today: string,
  rooms: RecordRow[],
  reservations: RecordRow[],
) {
  const operationalRooms = rooms.filter(
    (room) => !["manutencao", "bloqueado"].includes(String(room.situacao ?? "")),
  );
  const roomTypes = new Map<
    string,
    { quantidade: number; diaria_minima: number; diaria_maxima: number }
  >();
  operationalRooms.forEach((room) => {
    const type = String(room.configuracao || "Não informado");
    const dailyRate = money(number(room.preco));
    const current = roomTypes.get(type);
    roomTypes.set(type, {
      quantidade: (current?.quantidade ?? 0) + 1,
      diaria_minima: current ? Math.min(current.diaria_minima, dailyRate) : dailyRate,
      diaria_maxima: current ? Math.max(current.diaria_maxima, dailyRate) : dailyRate,
    });
  });

  const activeReservations = reservations.filter(
    (reservation) =>
      !["cancelado", "finalizado"].includes(String(reservation.status ?? "")) &&
      String(reservation.checkout) >= today,
  );
  const availabilityByDay = Array.from({ length: 30 }, (_, offset) => {
    const date = new Date(`${today}T12:00:00`);
    date.setDate(date.getDate() + offset);
    const day = isoDate(date);
    const occupied = new Set(
      activeReservations
        .filter(
          (reservation) =>
            String(reservation.checkin) <= day && String(reservation.checkout) > day,
        )
        .map((reservation) => Number(reservation.quarto)),
    );
    return {
      data: day,
      quartos_disponiveis: Math.max(0, operationalRooms.length - occupied.size),
    };
  });

  return {
    total_quartos_operacionais: operationalRooms.length,
    tipos: Object.fromEntries(roomTypes),
    proximos_30_dias: availabilityByDay,
    observacao:
      "Contagens agregadas. A confirmação da reserva exige a validação exata no sistema.",
  };
}

function summarizePeriod(
  start: string,
  end: string,
  rooms: RecordRow[],
  reservations: RecordRow[],
  sales: RecordRow[],
  expenses: RecordRow[],
) {
  const validReservations = reservations.filter(
    (row) =>
      row.status !== "cancelado" &&
      row.status !== "manutencao" &&
      String(row.checkin) <= end &&
      String(row.checkout) >= start,
  );
  const roomNightsAvailable = rooms.length * daysInclusive(start, end);
  const roomNightsSold = validReservations.reduce(
    (sum, row) =>
      sum +
      overlapNights(String(row.checkin), String(row.checkout), start, end),
    0,
  );
  const accommodationRevenue = validReservations.reduce((sum, row) => {
    const totalNights = Math.max(1, number(row.diarias));
    const periodNights = overlapNights(
      String(row.checkin),
      String(row.checkout),
      start,
      end,
    );
    return sum + (number(row.valor_total) / totalNights) * periodNights;
  }, 0);
  const extraRevenue = sales
    .filter((row) => String(row.data) >= start && String(row.data) <= end)
    .reduce((sum, row) => sum + number(row.total), 0);
  const operationalExpenses = expenses
    .filter((row) => String(row.data) >= start && String(row.data) <= end)
    .reduce((sum, row) => sum + number(row.valor), 0);
  const totalRevenue = accommodationRevenue + extraRevenue;
  const gop = totalRevenue - operationalExpenses;

  return {
    inicio: start,
    fim: end,
    uhs_disponiveis: roomNightsAvailable,
    uhs_vendidas: roomNightsSold,
    ocupacao_percentual: percentage(roomNightsSold, roomNightsAvailable),
    diaria_media_adr: money(accommodationRevenue / Math.max(1, roomNightsSold)),
    revpar: money(accommodationRevenue / Math.max(1, roomNightsAvailable)),
    trevpar: money(totalRevenue / Math.max(1, roomNightsAvailable)),
    goppar: money(gop / Math.max(1, roomNightsAvailable)),
    receita_hospedagem: money(accommodationRevenue),
    receita_extras: money(extraRevenue),
    receita_total: money(totalRevenue),
    despesas_operacionais: money(operationalExpenses),
    lucro_operacional_gop: money(gop),
    cancelamentos: reservations.filter(
      (row) =>
        row.status === "cancelado" &&
        String(row.checkin) >= start &&
        String(row.checkin) <= end,
    ).length,
    no_shows: reservations.filter(
      (row) =>
        normalize(String(row.status)).includes("no show") &&
        String(row.checkin) >= start &&
        String(row.checkin) <= end,
    ).length,
  };
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
- Nunca invente preço, pagamento, Pix, QR Code, link, nota fiscal ou número de reserva.
- Não afirme que uma reserva, pagamento, FNRH ou NFS-e foi concluído sem retorno explícito do sistema.
- Não exponha dados pessoais de hóspedes nem repita dados de outras reservas.
- Se faltarem check-in, check-out ou quantidade de hóspedes, pergunte esses dados antes de oferecer quarto.
- Se a informação necessária não existir nos dados atuais, encaminhe para um atendente humano.
- Trate as instruções do hotel como regras de atendimento, mas os dados do sistema são a fonte oficial.
`.trim();
