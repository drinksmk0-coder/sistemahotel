import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RecordRow = Record<string, unknown>;
type ConversationMessage = { role: "user" | "assistant"; text: string };
type AssistantMode = "analysis" | "reception";
type ProviderResult = {
  ok: boolean;
  answer?: string;
  provider: "gemini" | "openai";
  model: string;
  status?: number;
  message?: string;
  attempts: number;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json({ ok: true });
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: "Ambiente Supabase incompleto." }, 500);
    }

    const authorization = request.headers.get("Authorization");
    if (!authorization) return json({ error: "Login obrigatório." }, 401);

    const body = (await request.json().catch(() => ({}))) as {
      mode?: AssistantMode;
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

    const mode: AssistantMode = body.mode === "reception" ? "reception" : "analysis";

    // Perguntas de navegação e tarefas básicas nunca dependem de um provedor externo.
    const localNavigation = localNavigationAnswer(question);
    if (localNavigation) {
      return json({
        answer: localNavigation,
        mode,
        source: "system",
        provider: "local",
        generated_at: new Date().toISOString(),
        privacy: "Resposta local; nenhum dado foi enviado a um provedor de IA.",
      });
    }

    const conversation = normalizeConversation(body.conversation);
    const adminContext = await loadOperationalContext(admin, companyId, question);

    // Consultas operacionais que exigem contexto real continuam funcionando sem IA externa.
    const deterministic = deterministicSystemAnswer(question, adminContext);
    if (deterministic) {
      return json({
        answer: deterministic,
        mode,
        source: "system",
        provider: "local",
        generated_at: new Date().toISOString(),
        privacy: "Consulta operacional sem envio de dados pessoais ao provedor de IA.",
      });
    }

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
    const promptText = [
      `PERGUNTA ATUAL:\n${safeQuestion}`,
      `HISTÓRICO RECENTE:\n${JSON.stringify(safeConversation)}`,
      `CONTEXTO OFICIAL DO SISTEMA:\n${JSON.stringify(adminContext)}`,
    ].join("\n\n");

    const geminiKey = await loadGeminiKey(admin);
    const geminiModels = buildGeminiModelChain();
    let lastFailure: ProviderResult | null = null;

    if (geminiKey) {
      for (const model of geminiModels) {
        const result = await callGeminiWithRetries({
          apiKey: geminiKey,
          model,
          systemPrompt,
          promptText,
        });
        if (result.ok && result.answer) {
          return json({
            answer: result.answer,
            mode,
            source: "ai",
            provider: result.provider,
            model: result.model,
            attempts: result.attempts,
            fallback_used: result.model !== geminiModels[0],
            generated_at: new Date().toISOString(),
            privacy:
              "Dados operacionais e agregados; nomes, CPF, telefone e e-mail são removidos antes do envio.",
          });
        }
        lastFailure = result;

        // Chave inválida/permissão negada não melhora tentando outro modelo Gemini.
        if (result.status === 401 || result.status === 403) break;
      }
    }

    // Segundo provedor opcional. Só é usado quando os segredos OPENAI_API_KEY e
    // OPENAI_MODEL estiverem configurados no Supabase.
    const openAiKey = Deno.env.get("OPENAI_API_KEY")?.trim();
    const openAiModel = Deno.env.get("OPENAI_MODEL")?.trim();
    if (openAiKey && openAiModel) {
      const result = await callOpenAIWithRetries({
        apiKey: openAiKey,
        model: openAiModel,
        systemPrompt,
        promptText,
      });
      if (result.ok && result.answer) {
        return json({
          answer: result.answer,
          mode,
          source: "ai",
          provider: result.provider,
          model: result.model,
          attempts: result.attempts,
          fallback_used: true,
          generated_at: new Date().toISOString(),
          privacy:
            "Dados operacionais e agregados; nomes, CPF, telefone e e-mail são removidos antes do envio.",
        });
      }
      lastFailure = result;
    }

    // Última camada: orientação local em vez de uma mensagem vazia ou genérica.
    return json({
      answer: offlineFallbackAnswer(question, adminContext, lastFailure),
      mode,
      source: "system",
      provider: "local",
      degraded: true,
      provider_status: lastFailure?.status,
      provider_message: safeProviderMessage(lastFailure?.message),
      generated_at: new Date().toISOString(),
      privacy: "Resposta local; os dados do hotel continuam preservados.",
    });
  } catch (error) {
    console.error("hotel-assistant error", error);
    return json(
      {
        error: "Não foi possível concluir a consulta.",
        detail: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});

function localNavigationAnswer(question: string) {
  const value = normalize(question);

  const asksWhereOrHow =
    /\b(onde|como|qual menu|em qual menu|aonde|localizo|encontro|acesso|abrir|faco|faço|crio|cadastrar|cadastra)\b/.test(
      value,
    );

  if (!asksWhereOrHow) return "";

  if (/\b(reserva|reservas|reservar|hospedagem)\b/.test(value)) {
    return [
      "Para criar uma reserva:",
      "",
      "1. Abra **Reservas** no menu lateral.",
      "2. Clique em **Nova reserva**.",
      "3. Informe hóspede, check-in, check-out, quantidade de pessoas, quarto, tarifa, canal e pagamento.",
      "4. Confira a disponibilidade e confirme.",
      "",
      "Para apenas consultar quartos livres por uma data, abra **Mapa**.",
    ].join("\n");
  }

  if (/\b(disponibilidade|quarto livre|quartos livres|mapa|ocupacao por data)\b/.test(value)) {
    return [
      "Abra **Mapa** no menu lateral.",
      "Selecione a data desejada para ver quartos disponíveis, ocupados, em limpeza ou bloqueados.",
      "Para registrar a hospedagem, depois abra **Reservas → Nova reserva**.",
    ].join("\n");
  }

  if (/\b(check ?in|entrada do hospede|entrada do hóspede)\b/.test(value)) {
    return [
      "Abra **Reservas**, localize a reserva e use a ação de **Check-in**.",
      "Na mesma linha você também pode enviar ou consultar a ficha de check-in online/FNRH.",
    ].join("\n");
  }

  if (/\b(check ?out|saida do hospede|saída do hóspede)\b/.test(value)) {
    return [
      "Abra **Reservas**, localize a hospedagem ativa e clique em **Check-out**.",
      "Antes de finalizar, confira hospedagem, consumo, pagamentos e eventual saldo pendente.",
    ].join("\n");
  }

  if (/\b(ficha|fnrh|formulario|formulário|assinatura)\b/.test(value)) {
    return [
      "Abra **Fichas de check-in** para ver formulários recebidos e assinaturas.",
      "Também é possível abrir a ficha pela linha correspondente em **Reservas**.",
    ].join("\n");
  }

  if (/\b(cliente|clientes|hospede|hóspede|cadastro)\b/.test(value)) {
    return "Abra **Clientes** no menu lateral para cadastrar, localizar, ativar ou consultar o histórico de hóspedes.";
  }

  if (/\b(venda|vendas|produto|produtos|consumo|servico|serviço)\b/.test(value)) {
    return "Abra **Vendas** para lançar produtos, serviços e consumos separados da receita de hospedagem.";
  }

  if (/\b(despesa|despesas|custo|custos|conta a pagar)\b/.test(value)) {
    return "Abra **Despesas** para registrar custos, vencimentos, pagamentos e categorias operacionais.";
  }

  if (/\b(reclamacao|reclamação|ocorrencia|ocorrência|problema do hospede)\b/.test(value)) {
    return "Abra **Reclamações** para registrar, priorizar, acompanhar e concluir ocorrências.";
  }

  if (/\b(avaliacao|avaliação|nota|feedback)\b/.test(value)) {
    return "Abra **Avaliações** para consultar notas e comentários dos hóspedes.";
  }

  if (/\b(mensagem|mensagens|whatsapp|cobranca|cobrança)\b/.test(value)) {
    return "Abra **Mensagens** para modelos de atendimento e comunicação. Para cobrar uma reserva específica, abra a reserva e confira primeiro o saldo real.";
  }

  if (/\b(indicador|indicadores|dashboard|grafico|gráfico|pulso|resultado|kpi)\b/.test(value)) {
    return "Abra **Pulso do Hotel** para acompanhar ocupação, ADR, RevPAR, receitas, despesas, produtos, hóspedes e ações recomendadas.";
  }

  if (/\b(integracao|integração|booking|channel manager)\b/.test(value)) {
    return "Abra **Integrações** para cadastrar Booking.com, WhatsApp e outros serviços. O cadastro interno não substitui a ativação oficial do provedor.";
  }

  if (/\b(cor|cores|tema|logo|aparencia|aparência)\b/.test(value)) {
    return "Abra **Aparência do sistema** para ajustar tema, cores, logo e identidade visual.";
  }

  if (/\b(equipe|usuario|usuário|permissao|permissão|funcionario|funcionário)\b/.test(value)) {
    return "Abra **Equipe** para gerenciar usuários, funções e permissões.";
  }

  return "";
}

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
  if (error) return { unavailable: true, reason: error.message };
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

  if (error) return { unavailable: true, reason: error.message };

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
      "As fichas ficam em guest_checkins, vinculadas à reserva. A tela Fichas de check-in reúne as recebidas e a tela Reservas também abre a ficha vinculada.",
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
  const instructions = String(configuration.instructions ?? "")
    .trim()
    .slice(0, 12_000);
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

function buildGeminiModelChain() {
  const configured = Deno.env.get("GEMINI_MODEL")?.trim();
  const candidates = [
    configured,
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
  ].filter((value): value is string => Boolean(value));

  const retired = new Set([
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-2.5-flash",
  ]);

  return [...new Set(candidates)].filter((model) => !retired.has(model));
}

async function callGeminiWithRetries(args: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  promptText: string;
}): Promise<ProviderResult> {
  const delays = [0, 700, 1800];
  let lastStatus = 0;
  let lastMessage = "";
  let attempts = 0;

  for (let index = 0; index < delays.length; index += 1) {
    attempts = index + 1;
    if (delays[index]) await sleep(delays[index]);

    try {
      const response = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(args.model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": args.apiKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: args.systemPrompt }] },
            contents: [
              {
                role: "user",
                parts: [{ text: args.promptText }],
              },
            ],
            generationConfig: {
              maxOutputTokens: 4096,
            },
          }),
        },
        22_000,
      );

      const payload = (await response.json().catch(() => ({}))) as RecordRow;
      if (response.ok) {
        const answer = extractGeminiText(payload);
        if (answer) {
          return {
            ok: true,
            answer,
            provider: "gemini",
            model: args.model,
            attempts,
          };
        }
        lastStatus = 502;
        lastMessage = "Resposta vazia do Gemini.";
      } else {
        lastStatus = response.status;
        lastMessage = nestedString(payload, ["error", "message"]);
      }
    } catch (error) {
      lastStatus = 503;
      lastMessage = error instanceof Error ? error.message : String(error);
    }

    if (!isRetryableStatus(lastStatus)) break;
  }

  return {
    ok: false,
    provider: "gemini",
    model: args.model,
    status: lastStatus,
    message: lastMessage,
    attempts,
  };
}

async function callOpenAIWithRetries(args: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  promptText: string;
}): Promise<ProviderResult> {
  const delays = [0, 900];
  let lastStatus = 0;
  let lastMessage = "";
  let attempts = 0;

  for (let index = 0; index < delays.length; index += 1) {
    attempts = index + 1;
    if (delays[index]) await sleep(delays[index]);

    try {
      const response = await fetchWithTimeout(
        "https://api.openai.com/v1/responses",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${args.apiKey}`,
          },
          body: JSON.stringify({
            model: args.model,
            instructions: args.systemPrompt,
            input: args.promptText,
            max_output_tokens: 4096,
          }),
        },
        22_000,
      );

      const payload = (await response.json().catch(() => ({}))) as RecordRow;
      if (response.ok) {
        const answer = extractOpenAIText(payload);
        if (answer) {
          return {
            ok: true,
            answer,
            provider: "openai",
            model: args.model,
            attempts,
          };
        }
        lastStatus = 502;
        lastMessage = "Resposta vazia do provedor reserva.";
      } else {
        lastStatus = response.status;
        lastMessage =
          nestedString(payload, ["error", "message"]) ||
          String(payload.message ?? "");
      }
    } catch (error) {
      lastStatus = 503;
      lastMessage = error instanceof Error ? error.message : String(error);
    }

    if (!isRetryableStatus(lastStatus)) break;
  }

  return {
    ok: false,
    provider: "openai",
    model: args.model,
    status: lastStatus,
    message: lastMessage,
    attempts,
  };
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
  const checkin = isRecord(context.checkin_online)
    ? context.checkin_online
    : {};
  const availability = isRecord(context.availability)
    ? context.availability
    : {};

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
        "O fluxo correto é: **Reservas → enviar check-in/FNRH → hóspede preenche e assina → Fichas de check-in**.",
        "",
        "Se a tela do hóspede mostrou sucesso, mas nada aparece aqui, o link pode ter sido criado em outro deployment, pertencer a outra empresa ou o envio pode não ter sido concluído. Gere um novo link pela própria reserva e teste novamente.",
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
      "Abra **Fichas de check-in** para conferir. A ficha também permanece vinculada à reserva.",
    ].join("\n");
  }

  if (
    /\b(disponibilidade|quarto livre|quartos livres|disponivel|disponiveis)\b/.test(
      normalized,
    ) &&
    availability.consultada
  ) {
    const count = Number(availability.quantidade_disponivel ?? 0);
    const rooms = Array.isArray(availability.quartos_disponiveis)
      ? availability.quartos_disponiveis
      : [];
    const roomLabels = rooms
      .slice(0, 12)
      .map((row) => {
        const item = isRecord(row) ? row : {};
        return item.numero ?? item.quarto ?? item.room ?? "";
      })
      .filter(Boolean);

    return [
      `Disponibilidade consultada para ${availability.checkin} a ${availability.checkout}.`,
      `Quartos disponíveis: **${count}**.`,
      roomLabels.length ? `Opções: ${roomLabels.join(", ")}.` : "",
      "",
      "Para confirmar, abra **Reservas → Nova reserva**.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (/\b(booking|channel manager|servico de conectividade)\b/.test(normalized)) {
    const integrations = Array.isArray(context.integrations)
      ? context.integrations
      : [];
    const booking = integrations.find((item) => {
      const row = isRecord(item) ? item : {};
      return /booking/i.test(`${row.tipo ?? ""} ${row.nome ?? ""}`);
    }) as RecordRow | undefined;

    return [
      booking?.ativo
        ? "A integração Booking.com aparece como ativa no cadastro interno do sistema."
        : "Não encontrei uma integração Booking.com ativa no cadastro desta empresa.",
      "",
      "A conexão oficial precisa ser solicitada na Extranet da Booking.com em **Serviço de conectividade/Channel Manager**, seguida do mapeamento das categorias de quarto.",
      "",
      "Apenas informar o ID da propriedade no PMS não ativa a sincronização oficial.",
    ].join("\n");
  }

  if (/\b(sinal|entrada de 50|cinquenta por cento|50%)\b/.test(normalized)) {
    return [
      "O sinal de 50% funciona como confirmação da reserva.",
      "Registre o valor recebido na própria reserva e deixe o restante como saldo pendente.",
      "O check-in online/FNRH serve para antecipar os dados e a assinatura do hóspede; ele não substitui o pagamento nem confirma a quitação.",
    ].join("\n");
  }

  return "";
}

function offlineFallbackAnswer(
  question: string,
  context: RecordRow,
  failure: ProviderResult | null,
) {
  const value = normalize(question);
  const providerReason = providerFailureLabel(failure);

  if (/\b(cobranca|cobrança|saldo pendente)\b/.test(value)) {
    return [
      "O provedor de IA não respondeu agora, mas você pode usar esta mensagem:",
      "",
      "Olá! Tudo bem? Identificamos um saldo pendente referente à sua hospedagem. Poderia, por gentileza, verificar a regularização? Caso o pagamento já tenha sido realizado, desconsidere esta mensagem e nos envie o comprovante. Agradecemos!",
      "",
      "Antes de enviar, abra a reserva e substitua pelo valor real do saldo.",
      providerReason,
    ].join("\n");
  }

  if (/\b(reserva|reservar)\b/.test(value)) {
    return [
      "Abra **Reservas → Nova reserva**.",
      "Informe hóspede, datas, pessoas, quarto, tarifa, canal e pagamento; depois confirme a disponibilidade.",
      providerReason,
    ].join("\n");
  }

  const snapshot = isRecord(context.hotel_snapshot)
    ? context.hotel_snapshot
    : {};
  const snapshotAvailable = !snapshot.unavailable;

  return [
    "O assistente externo não conseguiu concluir esta resposta agora.",
    snapshotAvailable
      ? "Os dados operacionais do hotel continuam disponíveis no sistema."
      : "A consulta agregada também não estava disponível neste momento.",
    "Perguntas de navegação, reservas, fichas, check-in e checkout continuam sendo respondidas localmente.",
    providerReason,
  ].join("\n");
}

function buildSystemPrompt(
  mode: AssistantMode,
  customInstructions: string,
) {
  const common = `
Você é o HotelAI, assistente operacional e analista do sistema de gestão hoteleira.
Responda em português do Brasil e trate o CONTEXTO OFICIAL DO SISTEMA como fonte de verdade.

REGRAS CENTRAIS:
- Identifique primeiro a intenção. Não transforme toda pergunta em pedido de reserva.
- Responda exatamente ao que foi perguntado antes de oferecer próximos passos.
- Não repita saudação em todas as mensagens.
- Não peça datas quando a pergunta for sobre cobrança, sinal, navegação, formulário, integração ou funcionamento.
- Para telas e funcionalidades, informe o caminho no menu e onde o dado fica salvo.
- Para disponibilidade, use apenas availability.
- Para FNRH/check-in online, use apenas checkin_online.
- Para Booking.com, diferencie cadastro interno de conexão oficial.
- Não invente valores, links, pagamentos, reservas, documentos, integrações ou status.
- Se os dados não existirem, diga claramente o que está ausente.
- Nunca revele CPF, telefone, e-mail, assinatura ou nome de outros hóspedes.
`.trim();

  if (mode === "analysis") {
    return `${common}

MODO ANALISTA:
- Explique o que aconteceu, por que aconteceu, como afeta o hotel e o que fazer.
- Separe causas comprovadas de hipóteses.
- Use os dados agregados de hotel_snapshot.
- Priorize conclusão curta, evidências, ações e nível de confiança.`;
  }

  return `${common}

MODO RECEPÇÃO:
- Redija mensagens específicas quando o usuário pedir resposta, cobrança ou explicação.
- Para cobrança, entregue uma cobrança cordial; não peça datas.
- Para sinal, explique a regra; não reinicie o atendimento.
- Para pedido de reserva sem datas, peça somente os campos ausentes.
- Para disponibilidade com datas, responda diretamente com o resultado.
- Cumprimente somente quando fizer sentido como primeira mensagem.

INSTRUÇÕES PERSONALIZADAS DA EMPRESA:
${customInstructions}`;
}

function normalizeConversation(value: unknown): ConversationMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((item) => ({
      role: (item.role === "assistant" ? "assistant" : "user") as ConversationMessage["role"],
      text: String(item.text ?? "").trim().slice(0, 2000),
    }))
    .filter((item) => item.text)
    .slice(-12);
}

function normalizeDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = value.match(
    /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/,
  );
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
  const today = new Date(
    `${parts.year}-${parts.month}-${parts.day}T12:00:00-03:00`,
  );

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

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
  };
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
  const candidates = Array.isArray(payload.candidates)
    ? payload.candidates
    : [];

  return candidates
    .flatMap((candidate) => {
      const content = (candidate as RecordRow).content as
        | RecordRow
        | undefined;
      return Array.isArray(content?.parts) ? content.parts : [];
    })
    .map((part) => String((part as RecordRow).text ?? ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function extractOpenAIText(payload: RecordRow) {
  if (typeof payload.output_text === "string") {
    return payload.output_text.trim();
  }

  const output = Array.isArray(payload.output) ? payload.output : [];
  return output
    .flatMap((item) => {
      const row = isRecord(item) ? item : {};
      return Array.isArray(row.content) ? row.content : [];
    })
    .map((item) => {
      const row = isRecord(item) ? item : {};
      return typeof row.text === "string" ? row.text : "";
    })
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

function isRetryableStatus(status: number) {
  return status === 408 ||
    status === 409 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function providerFailureLabel(failure: ProviderResult | null) {
  if (!failure) {
    return "O provedor externo não está configurado ou não respondeu.";
  }

  if (failure.status === 429) {
    return "O limite temporário do provedor foi atingido; o sistema tentou novamente e acionou os fallbacks.";
  }

  if (failure.status === 401 || failure.status === 403) {
    return "A chave do provedor precisa ser revisada nas configurações seguras do servidor.";
  }

  if ((failure.status ?? 0) >= 500) {
    return "O provedor apresentou indisponibilidade temporária mesmo após novas tentativas.";
  }

  return "O provedor externo não conseguiu concluir a resposta.";
}

function safeProviderMessage(message?: string) {
  if (!message) return undefined;
  return message.replace(/AIza[\w-]+/g, "[chave removida]").slice(0, 240);
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
  {
    menu: "Pulso do Hotel",
    purpose:
      "KPIs, hospedagem, produtos, hóspedes, marketing, custos e ações.",
  },
  {
    menu: "Mapa",
    purpose: "Situação e disponibilidade dos quartos por data.",
  },
  {
    menu: "Reservas",
    purpose:
      "Reserva, pagamento, check-in, checkout, FNRH online, recibo e NFS-e.",
  },
  {
    menu: "Fichas de check-in",
    purpose:
      "Formulários recebidos, assinatura, status e conferência da recepção.",
  },
  {
    menu: "Clientes",
    purpose: "Cadastro, status e histórico de hóspedes.",
  },
  {
    menu: "Vendas",
    purpose:
      "Produtos, serviços, consumo, pagamento e receita adicional.",
  },
  {
    menu: "Despesas",
    purpose: "Custos operacionais e categorias financeiras.",
  },
  {
    menu: "Reclamações",
    purpose: "Ocorrências, prioridade, acompanhamento e resolução.",
  },
  {
    menu: "Mensagens",
    purpose: "Comunicação e modelos de atendimento.",
  },
  {
    menu: "Avaliações",
    purpose: "Notas e comentários internos dos hóspedes.",
  },
  {
    menu: "Integrações",
    purpose: "Booking.com, WhatsApp e outros canais/serviços.",
  },
  {
    menu: "Aparência do sistema",
    purpose: "Tema, cores, logo e identidade visual.",
  },
  {
    menu: "Equipe",
    purpose: "Usuários, papéis e permissões.",
  },
  {
    menu: "Assistente 24h",
    purpose: "Dúvidas do sistema, análise e recepção virtual.",
  },
];

const OPERATIONAL_FLOWS = {
  online_checkin: [
    "Na tela Reservas, a recepção envia o link de check-in/FNRH.",
    "O link abre /checkin-online com um token público.",
    "Ao enviar, submit_guest_checkin grava dados, consentimento, assinatura e status preenchido.",
    "A ficha fica em guest_checkins vinculada à reserva.",
    "A tela Fichas de check-in mostra as fichas recebidas para conferência.",
  ],
  pending_balance: [
    "O saldo é o total da hospedagem e consumo menos os pagamentos registrados.",
    "A cobrança deve usar o valor real da reserva/conta.",
    "O checkout deve exigir recebimento quando houver saldo pendente.",
  ],
  reservation: [
    "Abrir Reservas e selecionar Nova reserva.",
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
