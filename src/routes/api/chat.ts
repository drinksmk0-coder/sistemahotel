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

        return streamAnswer(messages, payload.answer);
      },
    },
  },
});

function clarifyIntent(question: string, mode: "analysis" | "reception") {
  const normalized = question
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (mode === "analysis" && /relatorio financeiro|relatorio de receitas|dre|resultado financeiro/.test(normalized)) {
    return [
      question,
      "INSTRUÇÃO OBRIGATÓRIA: produza o relatório financeiro solicitado diretamente na resposta usando os dados do contexto do hotel. Organize em receita, despesas, GOP, margem, ocupação, ADR, RevPAR, TRevPAR, GOPPAR, contas pendentes, riscos e ações. Não mande o usuário para check-in, checkout ou outra página sem relação com o relatório. Quando algum dado não estiver disponível, declare claramente a ausência em vez de inventar.",
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
