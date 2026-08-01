import { createFileRoute } from "@tanstack/react-router";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from "ai";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authorization = request.headers.get("authorization");
        const companyId = request.headers.get("x-company-id");
        const assistantMode =
          request.headers.get("x-assistant-mode") === "reception"
            ? "reception"
            : "analysis";
        const supabaseUrl =
          process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const publishableKey =
          process.env.SUPABASE_PUBLISHABLE_KEY ||
          process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

        if (!authorization || !companyId || !supabaseUrl || !publishableKey) {
          return Response.json(
            { error: "Sessão ou empresa não identificada." },
            { status: 401 },
          );
        }

        const { messages }: { messages: UIMessage[] } = await request.json();
        const question = latestUserText(messages);
        if (!question) {
          return Response.json(
            { error: "Escreva uma pergunta." },
            { status: 400 },
          );
        }

        if (assistantMode === "analysis" && isReportRequest(question)) {
          const report = await createDeterministicReport({
            question,
            companyId,
            authorization,
            supabaseUrl,
            publishableKey,
          });
          if (report) return streamAnswer(messages, report);
        }

        const clarifiedQuestion = clarifyIntent(question, assistantMode);
        const response = await fetch(
          `${supabaseUrl}/functions/v1/hotel-assistant-v2`,
          {
            method: "POST",
            headers: {
              apikey: publishableKey,
              authorization,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              question: clarifiedQuestion,
              company_id: companyId,
              mode: assistantMode,
              conversation: extractConversation(messages),
            }),
          },
        );
        const payload = (await response.json().catch(() => ({}))) as {
          answer?: string;
          error?: string;
        };
        if (!response.ok || !payload.answer) {
          return Response.json(
            {
              error:
                payload.error || "Não foi possível consultar o HotelAI.",
            },
            { status: response.status || 502 },
          );
        }

        const answer = rejectWrongNavigationFallback(question, payload.answer);
        return streamAnswer(messages, answer);
      },
    },
  },
});

function clarifyIntent(question: string, mode: "analysis" | "reception") {
  const normalized = normalize(question);

  if (mode === "analysis" && isReportRequest(normalized)) {
    return [
      question,
      "INSTRUÇÃO OBRIGATÓRIA: produza o relatório solicitado diretamente usando apenas dados agregados do hotel. Não transforme o pedido em tutorial de reserva, check-in, check-out ou navegação. Quando um dado não existir, informe a ausência sem inventar.",
    ].join("\n\n");
  }

  if (mode === "reception") {
    return [
      question,
      "INSTRUÇÃO OBRIGATÓRIA: identifique se o pedido é uma explicação, uma mensagem pronta para o hóspede ou um passo a passo no sistema. Só ensine onde clicar quando isso for pedido explicitamente. Em reserva para duas pessoas no mesmo quarto, explique: uma reserva, um quarto, dois hóspedes; um titular e um acompanhante. Não crie duas reservas salvo se forem dois quartos.",
    ].join("\n\n");
  }

  return question;
}

async function createDeterministicReport({
  question,
  companyId,
  authorization,
  supabaseUrl,
  publishableKey,
}: {
  question: string;
  companyId: string;
  authorization: string;
  supabaseUrl: string;
  publishableKey: string;
}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/get_hotel_ai_snapshot`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      authorization,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_company_id: companyId }),
  });
  if (!response.ok) return "";

  const snapshot = (await response.json().catch(() => null)) as unknown;
  if (!snapshot || typeof snapshot !== "object") return "";

  const flattened = flattenSnapshot(snapshot);
  const financial = /financeir|receita|despesa|dre|gop|lucro|margem/.test(normalize(question));
  const title = financial ? "Relatório financeiro da empresa" : "Relatório gerencial da empresa";
  const metricLines = [
    metricLine(flattened, "Receita", ["revenue", "receita", "receita_total", "total_revenue"], true),
    metricLine(flattened, "Despesas", ["expenses", "despesas", "despesa_total", "total_expenses"], true),
    metricLine(flattened, "GOP / resultado operacional", ["gop", "resultado_operacional", "operating_profit"], true),
    metricLine(flattened, "Margem", ["margin", "margem", "margem_operacional"], false, "%"),
    metricLine(flattened, "Ocupação", ["occupancy_rate", "occupancy", "ocupacao", "taxa_ocupacao"], false, "%"),
    metricLine(flattened, "ADR / diária média", ["adr", "diaria_media"], true),
    metricLine(flattened, "RevPAR", ["revpar"], true),
    metricLine(flattened, "TRevPAR", ["trevpar"], true),
    metricLine(flattened, "GOPPAR", ["goppar"], true),
    metricLine(flattened, "Reservas", ["reservation_count", "reservas", "total_reservas"]),
    metricLine(flattened, "Hóspedes", ["guest_count", "hospedes", "total_hospedes"]),
  ].filter(Boolean) as string[];

  const evidence = metricLines.length
    ? metricLines.join("\n")
    : "Os indicadores agregados não foram disponibilizados pelo snapshot atual. Não vou inventar valores.";

  return [
    `# ${title}`,
    "",
    "## Indicadores disponíveis",
    evidence,
    "",
    "## Leitura executiva",
    "Compare receita, despesas, margem, ocupação e diária média no mesmo período. Crescimento de receita sem melhora de margem pode indicar aumento de custos; ocupação maior com ADR menor pode indicar desconto excessivo.",
    "",
    "## Ações recomendadas",
    "1. Conferir contas pendentes e despesas sem categoria.",
    "2. Comparar ocupação, ADR e RevPAR com o período anterior.",
    "3. Identificar canais, quartos e produtos com maior receita e margem.",
    "4. Priorizar ações somente onde os dados confirmarem impacto financeiro.",
    "",
    "**Fonte:** dados agregados atuais do SistemaHotel. Valores ausentes não foram estimados.",
  ].join("\n");
}

function flattenSnapshot(value: unknown, prefix = "", result = new Map<string, unknown>()) {
  if (!value || typeof value !== "object") return result;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = normalizeKey(key);
    const path = prefix ? `${prefix}.${normalizedKey}` : normalizedKey;
    if (child && typeof child === "object" && !Array.isArray(child)) {
      flattenSnapshot(child, path, result);
    } else {
      result.set(path, child);
      if (!result.has(normalizedKey)) result.set(normalizedKey, child);
    }
  }
  return result;
}

function metricLine(
  values: Map<string, unknown>,
  label: string,
  aliases: string[],
  currency = false,
  suffix = "",
) {
  let found: unknown;
  for (const alias of aliases.map(normalizeKey)) {
    if (values.has(alias)) {
      found = values.get(alias);
      break;
    }
    const match = [...values.entries()].find(([key]) => key.endsWith(`.${alias}`));
    if (match) {
      found = match[1];
      break;
    }
  }
  const number = Number(found);
  if (found == null || found === "" || Number.isNaN(number)) return "";
  const formatted = currency
    ? number.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : `${number.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}${suffix}`;
  return `- **${label}:** ${formatted}`;
}

function rejectWrongNavigationFallback(question: string, answer: string) {
  if (!isReportRequest(question)) return answer;
  const normalizedAnswer = normalize(answer);
  if (/para criar uma reserva|abra reservas no menu|nova reserva/.test(normalizedAnswer)) {
    return "Não consegui gerar o relatório com dados suficientes nesta tentativa. A resposta de reserva foi descartada porque não corresponde ao seu pedido. Tente novamente após atualizar a página; nenhum valor será inventado.";
  }
  return answer;
}

function isReportRequest(value: string) {
  const normalized = normalize(value);
  return /\b(relatorio|relatório|analise|análise|diagnostico|diagnóstico|resumo executivo|dre)\b/.test(normalized) &&
    /\b(empresa|hotel|financeir|receita|despesa|resultado|gestao|gestão|gerencial|mensal|semanal|anual)\b/.test(normalized);
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeKey(value: string) {
  return normalize(value).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function streamAnswer(messages: UIMessage[], answer: string) {
  const textId = crypto.randomUUID();
  const stream = createUIMessageStream({
    originalMessages: messages,
    execute: ({ writer }) => {
      writer.write({ type: "text-start", id: textId });
      writer.write({ type: "text-delta", id: textId, delta: answer });
      writer.write({ type: "text-end", id: textId });
    },
    onError: () => "Não foi possível apresentar a resposta.",
  });
  return createUIMessageStreamResponse({ stream });
}

function latestUserText(messages: UIMessage[]) {
  const message = [...messages]
    .reverse()
    .find((item) => item.role === "user");
  if (!message) return "";
  return message.parts
    .filter(
      (
        part,
      ): part is Extract<(typeof message.parts)[number], { type: "text" }> =>
        part.type === "text",
    )
    .map((part) => part.text)
    .join("\n")
    .trim()
    .slice(0, 4000);
}

function extractConversation(messages: UIMessage[]) {
  return messages
    .filter(
      (
        message,
      ): message is UIMessage & { role: "user" | "assistant" } =>
        message.role === "user" || message.role === "assistant",
    )
    .slice(-12)
    .map((message) => ({
      role: message.role,
      text: message.parts
        .filter(
          (
            part,
          ): part is Extract<
            (typeof message.parts)[number],
            { type: "text" }
          > => part.type === "text",
        )
        .map((part) => part.text)
        .join("\n")
        .slice(0, 2000),
    }));
}
