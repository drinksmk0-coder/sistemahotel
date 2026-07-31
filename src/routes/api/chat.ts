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
              question,
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
