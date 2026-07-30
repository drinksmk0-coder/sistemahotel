import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RecordRow = Record<string, unknown>;
type ConversationMessage = { role: "user" | "assistant"; text: string };

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
    mode?: "analysis" | "reception";
    question?: string;
    company_id?: string;
    conversation?: ConversationMessage[];
  };
  const companyId = String(body.company_id ?? "").trim();
  const question = String(body.question ?? "").trim().slice(0, 4000);
  if (!companyId) return json({ error: "Empresa não informada." }, 400);
  if (!question) return json({ error: "Escreva uma pergunta." }, 400);

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
  if (!membership) return json({ error: "Acesso negado a esta empresa." }, 403);

  const memberRole = String(membership.role ?? "");
  if (!["dono", "recepcao"].includes(memberRole)) {
    return json(
      { error: "O assistente está disponível somente para dono e recepção." },
      403,
    );
  }

  const mode = body.mode === "reception" ? "reception" : "analysis";
  const conversation = normalizeConversation(body.conversation);
  const adminContext = await loadOperationalContext(admin, companyId, question);

  const deterministic = deterministicSystemAnswer(question, adminContext);
  if (deterministic) {
    return json({
      answer: deterministic,
      mode,
      source: "system",
      generated_at: new Date().toISOString(),
      privacy: "Consulta operacional sem envio de dados pessoais ao provedor de IA.",
    });
  }

  const geminiKey = await loadGeminiKey(admin);
  if (!geminiKey) {
    return json({ error: "A chave do Gemini não foi encontrada no servidor." }, 503);
  }
  const configuredModel = Deno.env.get("GEMINI_MODEL")?.trim();
  const retiredModels = new Set(["gemini-2.5-flash", "gemini-2.0-flash"]);
  const model =
    configuredModel && !retiredModels.has(configuredModel)
      ? configuredModel
      : "gemini-3.5-flash";

  const customReceptionInstructions =
    mode === "reception"
      ? await loadReceptionInstructions(admin, companyId)
      : "";

  const systemPrompt = buildSystemPrompt(mode, customReceptionInstructions);
  const safeConversation = conversation.map((message) => ({
    role: message.role,
    text: redactPersonalData(message.text),
  }));
  const safeQuestion = redactPersonalData(question);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": geminiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: [
                  `PERGUNTA ATUAL:\n${safeQuestion}`,
                  `HISTÓRICO RECENTE:\n${JSON.stringify(safeConversation)}`,
                  `CONTEXTO OFICIAL DO SISTEMA:\n${JSON.stringify(adminContext)}`,
                ].join("\n\n"),
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.15,
          maxOutputTokens: 4096,
        },
      }),
    },
  );

  const payload = (await response.json().catch(() => ({}))) as RecordRow;
  if (!response.ok) {
    const message = nestedString(payload, ["error", "message"]);
    return json({
      answer: classifyGeminiError(response.status, message),
      mode,
      model,
      degraded: true,
    });
  }

  const answer = extractGeminiText(payload);
  if (!answer) return json({ error: "O Gemini não retornou uma resposta." }, 502);

  return json({
    answer,
    mode,
    model,
    generated_at: new Date().toISOString(),
    privacy:
      "Dados operacionais e agregados; nomes, CPF, telefone e e-mail são removidos antes do envio.",
  });
});

async function loadOperationalContext(
  admin: ReturnType<typeof createClient>,
  companyId: string,
  question: string,
) {
  const [company, snapshot, checkins, integrations, receptionRules] =
    await Promise.all([
      loadCompany(admin, companyId),
      loadAggregatedSnapshot(admin, companyId),
      loadCheckinSummary(admin, companyId),
      loadIntegrationSummary(admin, companyId),
      loadReceptionInstructions(admin, companyId),
    ]);

  const availability = shouldCheckAvailability(question)
    ? await loadExactRoomAvailability(admin, companyId, question)
    : { consultada: false, motivo: "A pergunta não solicita disponibilidade." };

  return {
    company,
    system_catalog: SYSTEM_CATALOG,
    operational_flows: OPERATIONAL_FLOWS,
    booking_connectivity: BOOKING_CONNECTIVITY,
    integrations,
    reception_rules: receptionRules,
    checkin_online: checkins,
    availability,
    hotel_snapshot: snapshot,
  };
}

async function loadCompany(
  admin: ReturnType<typeof createClient>,
  companyId: string,
) {
  const { data, error } = await admin
    .from("companies")
    .select("nome,slug")
    .eq("id", companyId)
    .maybeSingle();
  if (error) throw new Error(`Não foi possível carregar a empresa: ${error.message}`);
  return data ?? {};
}

async function loadAggregatedSnapshot(
  admin: ReturnType<typeof createClient>,
  companyId: string,
) {
  const { data, error } = await admin.rpc("get_hotel_ai_snapshot", {
    p_company_id: companyId,
  });
  if (error) {
    return { unavailable: true, reason: error.message };
  }
  return data ?? {};
}

async function loadCheckinSummary(
  admin: ReturnType<typeof createClient>,
  companyId: string,
) {
  const { data, error } = await admin
    .from("guest_checkins")
    .select(
      "status,submitted_at,reviewed_at,mtur_status,signature_data_url,reservation_id,updated_at",
    )
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false })
    .limit(20);
  if (error) {
    return { unavailable: true, reason: error.message };
  }

  const rows = Array.isArray(data) ? data : [];
  const reservationIds = [
    ...new Set(rows.map((row) => String(row.reservation_id ?? "")).filter(Boolean)),
  ];
  let reservations: RecordRow[] = [];
  if (reservationIds.length) {
    const result = await admin
      .from("reservations")
      .select("id,codigo_externo,quarto,checkin,checkout,status")
      .eq("company_id", companyId)
      .in("id", reservationIds);
    if (!result.error && Array.isArray(result.data)) reservations = result.data;
  }
  const reservationById = new Map(
    reservations.map((row) => [String(row.id), row]),
  );
  const byStatus: Record<string, number> = {};
  for (const row of rows) {
    const status = String(row.status ?? "sem_status");
    byStatus[status] = (byStatus[status] ?? 0) + 1;
  }

  return {
    total: rows.length,
    signed: rows.filter((row) => Boolean(row.signature_data_url)).length,
    submitted: rows.filter((row) => Boolean(row.submitted_at)).length,
    by_status: byStatus,
    latest: rows.slice(0, 5).map((row) => {
      const reservation = reservationById.get(String(row.reservation_id)) ?? {};
      return {
        status: row.status,
        submitted_at: row.submitted_at,
        reviewed_at: row.reviewed_at,
        mtur_status: row.mtur_status,
        signed: Boolean(row.signature_data_url),
        reservation_code:
          reservation.codigo_externo ?? String(row.reservation_id).slice(0, 8),
        room: reservation.quarto,
        checkin: reservation.checkin,
        checkout: reservation.checkout,
      };
    }),
    destination:
      "As fichas ficam em guest_checkins, vinculadas à reserva. Na tela Reservas, o botão de check-in online abre a ficha preenchida para conferência ou impressão.",
  };
}

async function loadIntegrationSummary(
  admin: ReturnType<typeof createClient>,
  companyId: string,
) {
  const { data, error } = await admin
    .from("company_integrations")
    .select("tipo,nome,ativo,updated_at")
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false });
  if (error) return { unavailable: true, reason: error.message };
  return Array.isArray(data) ? data : [];
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
  if (error) return DEFAULT_RECEPTION_PROMPT;
  const configuration = isRecord(data?.configuracao) ? data.configuracao : {};
  const instructions = String(configuration.instructions ?? "").trim().slice(0, 12_000);
  return instructions || DEFAULT_RECEPTION_PROMPT;
}

async function loadGeminiKey(admin: ReturnType<typeof createClient>) {
  const { data } = await admin.rpc("get_hotel_gemini_api_key");
  return (
    Deno.env.get("GEMINI_API_KEY")?.trim() ||
    Deno.env.get("GOOGLE_GENERATIVE_AI_API_KEY")?.trim() ||
    (typeof data === "string" ? data.trim() : "")
  );
}

function shouldCheckAvailability(question: string) {
  return /\b(disponibilidade|disponivel|disponíveis|quarto livre|reservar|reserva para|fim de semana|final de semana|fds)\b/i.test(
    question,
  );
}

async function loadExactRoomAvailability(
  admin: ReturnType<typeof createClient>,
  companyId: string,
  question: string,
) {
  const dates =
    question.match(
      /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b/g,
    ) ?? [];
  const normalizedDates = dates
    .map(normalizeDate)
    .filter((value): value is string => Boolean(value))
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
    return {
      consultada: false,
      checkin,
      checkout,
      motivo: "Check-out deve ser posterior ao check-in.",
    };
  }
  const { data, error } = await admin.rpc("get_hotel_room_availability", {
    _company_id: companyId,
    _checkin: checkin,
    _checkout: checkout,
  });
  if (error) {
    return { consultada: false, checkin, checkout, motivo: error.message };
  }
  const rooms = Array.isArray(data) ? data : [];
  return {
    consultada: true,
    checkin,
    checkout,
    quantidade_disponivel: rooms.length,
    quartos_disponiveis: rooms,
    regra: "Resultado verificado diretamente contra reservas e bloqueios.",
  };
}

function deterministicSystemAnswer(question: string, context: RecordRow) {
  const normalized = normalize(question);
  const checkin = isRecord(context.checkin_online) ? context.checkin_online : {};

  if (
    /\b(onde foi|onde fica|onde encontro|para onde foi|formulario|fnrh|assinatura|assinei|status da ficha|recebeu a ficha)\b/.test(
      normalized,
    )
  ) {
    const total = Number(checkin.total ?? 0);
    const latest = Array.isArray(checkin.latest) ? checkin.latest : [];
    if (!total) {
      return [
        "Não encontrei nenhuma ficha de check-in online registrada no banco da empresa atual.",
        "",
        "O fluxo correto é: Reservas → botão de enviar check-in/FNRH → hóspede preenche e assina → o registro fica em `guest_checkins`, vinculado à reserva, com status `preenchido`. Ao clicar novamente no botão da reserva, a ficha deve abrir para conferência ou impressão.",
        "",
        "Como não há registro no banco atual, as causas mais prováveis são: o link foi gerado em outro deployment/ambiente, pertencia a outra empresa, era um link antigo/inválido ou o envio não chegou a concluir. Gere um novo link pela própria reserva e teste novamente.",
      ].join("\n");
    }
    const latestLines = latest.slice(0, 3).map((row) => {
      const item = isRecord(row) ? row : {};
      return `• Reserva ${item.reservation_code ?? "sem código"}, quarto ${item.room ?? "—"}: status ${item.status ?? "—"}, assinatura ${item.signed ? "recebida" : "não recebida"}.`;
    });
    return [
      `Encontrei ${total} ficha(s) de check-in online na empresa atual.`,
      ...latestLines,
      "",
      "Elas ficam vinculadas à reserva. Abra Reservas e use novamente o botão de check-in/FNRH da linha correspondente para conferir ou imprimir.",
    ].join("\n");
  }

  if (/\b(booking|channel manager|servico de conectividade|serviço de conectividade)\b/.test(normalized)) {
    const integrations = Array.isArray(context.integrations) ? context.integrations : [];
    const booking = integrations.find((item) => {
      const row = isRecord(item) ? item : {};
      return /booking/i.test(`${row.tipo ?? ""} ${row.nome ?? ""}`);
    }) as RecordRow | undefined;
    return [
      booking?.ativo
        ? "A integração Booking.com aparece como ativa no cadastro do sistema."
        : "Não encontrei uma integração Booking.com ativa no cadastro desta empresa.",
      "",
      "Para conectar oficialmente: entre na Extranet da Booking.com, abra Serviço de conectividade/Channel Manager, procure o nome do provedor, habilite tarifas/disponibilidade e reservas, aceite os termos XML, anote o ID da propriedade e depois faça o mapeamento das categorias de quarto na área Integrações do PMS.",
      "",
      "Importante: digitar apenas o ID da propriedade não cria uma conexão oficial. O sistema precisa estar cadastrado/aprovado como provedor de conectividade da Booking.com ou usar um Channel Manager parceiro.",
    ].join("\n");
  }

  return "";
}

function buildSystemPrompt(mode: "analysis" | "reception", customInstructions: string) {
  const common = `
Você é o HotelAI, assistente operacional e analista do sistema de gestão hoteleira.
Responda em português do Brasil e trate o CONTEXTO OFICIAL DO SISTEMA como fonte de verdade.

REGRAS CENTRAIS:
- Identifique primeiro a intenção da pergunta. Não transforme toda pergunta em pedido de reserva.
- Responda exatamente ao que foi perguntado antes de oferecer próximos passos.
- Não repita saudação em todas as mensagens.
- Não peça check-in, check-out ou quantidade de hóspedes quando a pergunta for sobre cobrança, política de sinal, navegação, formulário, integração ou funcionamento do sistema.
- Para perguntas sobre telas e funcionalidades, informe o caminho no menu e explique onde o dado fica salvo.
- Para disponibilidade, use apenas o bloco availability.
- Para FNRH/check-in online, use apenas checkin_online.
- Para Booking.com, diferencie integração cadastrada de conexão oficial como provedor.
- Não invente valores, links, pagamentos, reservas, documentos, integrações ou status.
- Se os dados não existirem, diga claramente o que está ausente.
- Nunca revele CPF, telefone, e-mail, assinatura ou nome de outros hóspedes.
`.trim();

  if (mode === "analysis") {
    return `${common}

MODO ANALISTA:
- Explique indicadores, causas comprovadas, riscos e ações.
- Use os dados agregados do hotel_snapshot.
- Quando a pergunta for sobre o próprio sistema, responda com base em system_catalog e operational_flows.
- Priorize uma conclusão curta e de 2 a 5 ações práticas.`;
  }

  return `${common}

MODO RECEPÇÃO:
- Redija mensagens específicas quando o usuário pedir uma resposta, cobrança ou explicação.
- Para “prepare uma cobrança”, entregue uma cobrança cordial; não peça datas de hospedagem.
- Para “explique o sinal”, explique a regra configurada; não reinicie o atendimento.
- Para pedido de reserva sem datas, peça apenas os campos ausentes.
- Para disponibilidade com datas, responda diretamente com os quartos encontrados.
- Cumprimente somente quando fizer sentido como primeira mensagem ao hóspede.

INSTRUÇÕES PERSONALIZADAS DA EMPRESA:
${customInstructions}`;
}

function normalizeConversation(value: unknown): ConversationMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((item) => ({
      role: item.role === "assistant" ? "assistant" : "user",
      text: String(item.text ?? "").trim().slice(0, 2000),
    }))
    .filter((item) => item.text)
    .slice(-12);
}

function normalizeDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = value.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (!match) return undefined;
  const year = match[3]
    ? match[3].length === 2
      ? `20${match[3]}`
      : match[3]
    : localDateParts().year;
  return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function naturalStayDates(value: string) {
  const clean = normalize(value);
  if (!/\b(fim de semana|final de semana|fds|sabado|domingo)\b/.test(clean)) {
    return null;
  }
  const onlySunday =
    /\bdomingo\b/.test(clean) &&
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
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(today);
}

function localDateParts() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return { year: get("year"), month: get("month"), day: get("day") };
}

function addDays(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function redactPersonalData(value: string) {
  return value
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[e-mail removido]")
    .replace(
      /\b(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}\b/g,
      "[telefone removido]",
    )
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[CPF removido]")
    .slice(0, 4000);
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

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .trim();
}

function isRecord(value: unknown): value is RecordRow {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function classifyGeminiError(status: number, message: string) {
  const detail = message.trim().slice(0, 500);
  if (status === 429) {
    return "O limite do Gemini foi atingido. Tente novamente em alguns minutos.";
  }
  if (status === 401 || status === 403) {
    return "A chave do Gemini não foi autorizada. Verifique a configuração no Supabase.";
  }
  if (status >= 500) {
    return "O Gemini está temporariamente indisponível. Os dados do sistema continuam preservados.";
  }
  return `O Gemini não conseguiu responder (HTTP ${status}). ${detail}`.trim();
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const DEFAULT_RECEPTION_PROMPT = `
Atenda hóspedes com cordialidade, objetividade e linguagem profissional.
Para reservas, confirme datas, quantidade de hóspedes, disponibilidade e valores no sistema.
A reserva exige sinal de 50% quando essa for a regra ativa da empresa.
O check-in online/FNRH só deve ser tratado como concluído quando o sistema indicar status preenchido.
Nunca invente Pix, link, preço, disponibilidade, pagamento ou documento.
`.trim();

const SYSTEM_CATALOG = [
  { menu: "Pulso do Hotel", purpose: "KPIs, hospedagem, produtos, hóspedes, marketing, custos e ações." },
  { menu: "Mapa", purpose: "Situação e disponibilidade dos quartos por data." },
  { menu: "Reservas", purpose: "Reserva, pagamento, check-in, checkout, FNRH online, recibo e NFS-e." },
  { menu: "Clientes", purpose: "Cadastro, status e histórico de hóspedes." },
  { menu: "Vendas", purpose: "Produtos, serviços, consumo, pagamento e receita adicional." },
  { menu: "Despesas", purpose: "Custos operacionais e categorias financeiras." },
  { menu: "Reclamações", purpose: "Ocorrências, prioridade, acompanhamento e resolução." },
  { menu: "Mensagens", purpose: "Comunicação e modelos de atendimento." },
  { menu: "Avaliações", purpose: "Notas e comentários internos dos hóspedes." },
  { menu: "Integrações", purpose: "Booking.com, WhatsApp e outros canais/serviços." },
  { menu: "Aparência do sistema", purpose: "Tema, cores, logo e identidade visual." },
  { menu: "Equipe", purpose: "Usuários, papéis e permissões." },
  { menu: "Assistente 24h", purpose: "Dúvidas do sistema, análise e recepção virtual." },
];

const OPERATIONAL_FLOWS = {
  online_checkin: [
    "Na tela Reservas, a recepção envia o link de check-in/FNRH.",
    "O link abre /checkin-online com um token público.",
    "Ao enviar, submit_guest_checkin grava dados, consentimento, assinatura e status preenchido.",
    "A ficha fica em guest_checkins vinculada à reserva.",
    "Ao clicar novamente no botão da reserva, a ficha preenchida abre para conferência ou impressão.",
  ],
  pending_balance: [
    "O saldo é o total da hospedagem e consumo menos os pagamentos registrados.",
    "A cobrança deve usar o valor real da reserva/conta.",
    "O checkout deve exigir recebimento quando houver saldo pendente.",
  ],
  reservation: [
    "Cadastrar hóspede, datas, pessoas, quarto, tarifa, canal e forma de pagamento.",
    "Verificar sobreposição e disponibilidade antes de confirmar.",
    "Registrar sinal e saldo separadamente.",
  ],
};

const BOOKING_CONNECTIVITY = {
  steps: [
    "Entrar na Extranet Booking.com.",
    "Abrir Conta → Serviço de conectividade/Channel Manager.",
    "Pesquisar e selecionar o provedor.",
    "Ativar tarifas/disponibilidade e reservas.",
    "Aceitar os termos XML.",
    "Informar o ID da propriedade no PMS.",
    "Mapear categorias de quartos.",
    "Aguardar confirmação do provedor.",
  ],
  warning:
    "O PMS precisa ser um Connectivity Partner aprovado ou operar por um Channel Manager parceiro; apenas informar o ID da propriedade não ativa a conexão.",
};
