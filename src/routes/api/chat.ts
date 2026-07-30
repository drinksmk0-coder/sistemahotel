import { createFileRoute } from "@tanstack/react-router";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from "ai";

type RoomFeatureRow = {
  numero: number;
  andar: number;
  configuracao: string;
  preco: number;
  frigobar?: boolean;
  tv_smart?: boolean;
  vista?: string;
  nivel_ruido?: string;
  ventilacao?: string;
  tamanho_banheiro?: string;
  prioridade_venda?: number;
  observacoes_quarto?: string | null;
};

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
          return Response.json({ error: "Escreva uma pergunta." }, { status: 400 });
        }

        const localRoomAnswer = await answerRoomFeatureQuestion({
          question,
          companyId,
          supabaseUrl,
          publishableKey,
          authorization,
        });
        if (localRoomAnswer) return streamAnswer(messages, localRoomAnswer);

        const response = await fetch(
          `${supabaseUrl}/functions/v1/hotel-assistant`,
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
            { error: payload.error || "Não foi possível consultar o assistente." },
            { status: response.status || 502 },
          );
        }

        return streamAnswer(messages, payload.answer);
      },
    },
  },
});

async function answerRoomFeatureQuestion({
  question,
  companyId,
  supabaseUrl,
  publishableKey,
  authorization,
}: {
  question: string;
  companyId: string;
  supabaseUrl: string;
  publishableKey: string;
  authorization: string;
}) {
  const value = normalize(question);
  const matcher = roomFeatureMatcher(value);
  if (!matcher) return "";

  const columns = [
    "numero",
    "andar",
    "configuracao",
    "preco",
    "frigobar",
    "tv_smart",
    "vista",
    "nivel_ruido",
    "ventilacao",
    "tamanho_banheiro",
    "prioridade_venda",
    "observacoes_quarto",
  ].join(",");
  const url = new URL(`${supabaseUrl}/rest/v1/rooms`);
  url.searchParams.set("select", columns);
  url.searchParams.set("company_id", `eq.${companyId}`);
  url.searchParams.set("numero", "lt.900");
  url.searchParams.set("order", "numero.asc");

  const response = await fetch(url, {
    headers: {
      apikey: publishableKey,
      authorization,
      Accept: "application/json",
    },
  });
  if (!response.ok) return "";

  const rows = (await response.json().catch(() => [])) as RoomFeatureRow[];
  const matches = rows.filter(matcher.test);
  const unknownCount = rows.filter(matcher.unknown).length;

  if (!matches.length) {
    return [
      `Não encontrei nenhum quarto cadastrado como **${matcher.label}**.`,
      unknownCount
        ? `${unknownCount} quarto(s) ainda têm essa característica como não informada.`
        : "Todos os quartos já possuem essa característica classificada.",
      "",
      "Para atualizar: **Mapa → clique no quarto → Características do quarto → Salvar características**.",
      "Não vou afirmar que um quarto possui esse item enquanto ele não estiver confirmado no cadastro.",
    ].join("\n");
  }

  const lines = matches.slice(0, 20).map((room) => {
    const notes = roomNotes(room);
    return `• **Quarto ${room.numero}** — ${room.configuracao}, ${room.andar}º andar, ${currency(room.preco)}${notes ? ` · ${notes}` : ""}`;
  });

  return [
    `Quartos cadastrados como **${matcher.label}**:`,
    "",
    ...lines,
    matches.length > 20 ? `• Mais ${matches.length - 20} quarto(s).` : "",
    "",
    "A lista mostra características confirmadas, mas não garante disponibilidade para uma data específica. Para isso, informe check-in e check-out ou consulte o **Mapa**.",
    unknownCount
      ? `${unknownCount} quarto(s) ainda estão sem essa classificação; complete o cadastro para a resposta ficar mais precisa.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function roomFeatureMatcher(value: string) {
  if (/\b(frigobar|mini ?bar|minibar)\b/.test(value)) {
    return {
      label: "com frigobar",
      test: (room: RoomFeatureRow) => room.frigobar === true,
      unknown: (_room: RoomFeatureRow) => false,
    };
  }
  if (/\b(smart ?tv|tv smart|televisao smart|televisão smart)\b/.test(value)) {
    return {
      label: "com Smart TV",
      test: (room: RoomFeatureRow) => room.tv_smart === true,
      unknown: (_room: RoomFeatureRow) => false,
    };
  }
  if (/\b(silencioso|silenciosa|menos barulho|pouco barulho|tranquilo|tranquila)\b/.test(value)) {
    return {
      label: "mais silenciosos",
      test: (room: RoomFeatureRow) => room.nivel_ruido === "silencioso",
      unknown: (room: RoomFeatureRow) => !room.nivel_ruido || room.nivel_ruido === "nao_informado",
    };
  }
  if (/\b(frente (da|para a) rua|de frente (da|para a) rua|vista (da|para a) rua|quarto.*rua)\b/.test(value)) {
    return {
      label: "de frente para a rua",
      test: (room: RoomFeatureRow) => room.vista === "rua",
      unknown: (room: RoomFeatureRow) => !room.vista || room.vista === "nao_informada",
    };
  }
  if (/\b(fundos|fundo do hotel|nos fundos)\b/.test(value)) {
    return {
      label: "nos fundos do hotel",
      test: (room: RoomFeatureRow) => room.vista === "fundos",
      unknown: (room: RoomFeatureRow) => !room.vista || room.vista === "nao_informada",
    };
  }
  if (/\b(banheiro pequeno|banheiro apertado|banheiro maior|banheiro amplo)\b/.test(value)) {
    const wantsLarge = /\b(maior|amplo)\b/.test(value);
    return {
      label: wantsLarge ? "com banheiro amplo" : "com banheiro pequeno",
      test: (room: RoomFeatureRow) => room.tamanho_banheiro === (wantsLarge ? "amplo" : "pequeno"),
      unknown: (room: RoomFeatureRow) => !room.tamanho_banheiro || room.tamanho_banheiro === "nao_informado",
    };
  }
  if (/\b(arejado|arejada|ventilado|ventilada|abafado|abafada)\b/.test(value)) {
    const wantsAiry = /\b(arejado|arejada|ventilado|ventilada)\b/.test(value);
    return {
      label: wantsAiry ? "mais arejados" : "mais abafados",
      test: (room: RoomFeatureRow) => room.ventilacao === (wantsAiry ? "arejada" : "abafada"),
      unknown: (room: RoomFeatureRow) => !room.ventilacao || room.ventilacao === "nao_informada",
    };
  }
  if (/\b(vender por ultimo|vender por último|ultima opcao|última opção|prioridade de venda)\b/.test(value)) {
    return {
      label: "marcados para vender por último",
      test: (room: RoomFeatureRow) => room.prioridade_venda === 3,
      unknown: (_room: RoomFeatureRow) => false,
    };
  }
  return null;
}

function roomNotes(room: RoomFeatureRow) {
  const notes: string[] = [];
  if (room.frigobar) notes.push("frigobar");
  if (room.tv_smart) notes.push("Smart TV");
  if (room.vista === "rua") notes.push("frente para rua");
  if (room.vista === "fundos") notes.push("fundos");
  if (room.nivel_ruido === "silencioso") notes.push("mais silencioso");
  if (room.nivel_ruido === "barulhento") notes.push("mais barulhento");
  if (room.ventilacao === "arejada") notes.push("mais arejado");
  if (room.ventilacao === "abafada") notes.push("mais abafado");
  if (room.tamanho_banheiro === "pequeno") notes.push("banheiro pequeno");
  if (room.tamanho_banheiro === "amplo") notes.push("banheiro amplo");
  if (room.prioridade_venda === 3) notes.push("vender por último");
  return notes.join(", ");
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
  const message = [...messages].reverse().find((item) => item.role === "user");
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
          ): part is Extract<(typeof message.parts)[number], { type: "text" }> =>
            part.type === "text",
        )
        .map((part) => part.text)
        .join("\n")
        .trim()
        .slice(0, 2000),
    }))
    .filter((message) => message.text);
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .trim();
}

function currency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}
