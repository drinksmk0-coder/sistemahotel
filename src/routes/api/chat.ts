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
          request.headers.get("x-assistant-mode") === "reception" ? "reception" : "analysis";
        const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const publishableKey =
          process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        if (!authorization || !companyId || !supabaseUrl || !publishableKey) {
          return Response.json(
            { error: "Sessão ou empresa não identificada." },
            { status: 401 },
          );
        }

        const { messages }: { messages: UIMessage[] } = await request.json();
        const question = latestUserText(messages);
        if (!question) {
          return Response.json({ error: "Escreva uma pergunta." }, { status: 400 });
        }

        const response = await fetch(`${supabaseUrl}/functions/v1/hotel-analyst`, {
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
            reception_context:
              assistantMode === "reception" ? extractReceptionContext(messages) : undefined,
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          answer?: string;
          error?: string;
        };
        if (!response.ok || !payload.answer) {
          return Response.json(
            { error: payload.error || "Não foi possível consultar o analista." },
            { status: response.status || 502 },
          );
        }

        const textId = crypto.randomUUID();
        const stream = createUIMessageStream({
          originalMessages: messages,
          execute: ({ writer }) => {
            writer.write({ type: "text-start", id: textId });
            writer.write({ type: "text-delta", id: textId, delta: payload.answer! });
            writer.write({ type: "text-end", id: textId });
          },
          onError: () => "Não foi possível apresentar a análise.",
        });
        return createUIMessageStreamResponse({ stream });
      },
    },
  },
});

function latestUserText(messages: UIMessage[]) {
  const message = [...messages].reverse().find((item) => item.role === "user");
  if (!message) return "";
  return message.parts
    .filter((part): part is Extract<(typeof message.parts)[number], { type: "text" }> =>
      part.type === "text",
    )
    .map((part) => part.text)
    .join("\n")
    .trim()
    .slice(0, 2000);
}


function extractReceptionContext(messages: UIMessage[]) {
  const text = messages
    .filter((message) => message.role === "user")
    .slice(-12)
    .flatMap((message) =>
      message.parts
        .filter((part): part is Extract<(typeof message.parts)[number], { type: "text" }> =>
          part.type === "text",
        )
        .map((part) => part.text),
    )
    .join("\n")
    .slice(-8000);

  const dates = text.match(/\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b/g) ?? [];
  const peopleMatches = [...text.matchAll(/\b(\d{1,2})\s*(?:pessoas?|h[oó]spedes?|adultos?)\b/gi)];
  const lastPeople = peopleMatches.at(-1)?.[1];

  return {
    checkin: dates.length >= 2 ? dates.at(-2) : dates.at(-1),
    checkout: dates.length >= 2 ? dates.at(-1) : undefined,
    pessoas: lastPeople ? Number(lastPeople) : undefined,
  };
}
