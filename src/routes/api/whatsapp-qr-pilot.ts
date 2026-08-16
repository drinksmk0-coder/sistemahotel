import { createFileRoute } from "@tanstack/react-router";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestWaWebVersion,
  useMultiFileAuthState,
  type WAMessage,
} from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import { rm } from "node:fs/promises";

export const Route = createFileRoute("/api/whatsapp-qr-pilot")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authorization = request.headers.get("authorization");
        const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const publishableKey =
          process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

        if (!authorization || !supabaseUrl || !publishableKey) {
          return Response.json({ error: "Sessão Supabase não identificada." }, { status: 401 });
        }

        const body = (await request.json().catch(() => ({}))) as { company_id?: string };
        const companyId = String(body.company_id ?? "").trim();
        if (!companyId) return Response.json({ error: "Empresa não informada." }, { status: 400 });

        const user = await getAuthenticatedUser({ supabaseUrl, publishableKey, authorization });
        if (!user?.id) return Response.json({ error: "Sessão inválida." }, { status: 401 });
        const allowed = await hasCompanyAccess({
          supabaseUrl,
          publishableKey,
          authorization,
          companyId,
          userId: user.id,
        });
        if (!allowed) return Response.json({ error: "Acesso negado a esta empresa." }, { status: 403 });

        const encoder = new TextEncoder();
        let closed = false;
        let cleanup: (() => Promise<void>) | null = null;

        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            const send = (payload: Record<string, unknown>) => {
              if (closed) return;
              try {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
              } catch {
                closed = true;
              }
            };
            const finish = async () => {
              if (closed) return;
              closed = true;
              try { await cleanup?.(); } catch { /* best effort */ }
              try { controller.close(); } catch { /* already closed */ }
            };

            void runQrPilot({
              companyId,
              userId: user.id,
              authorization,
              supabaseUrl,
              publishableKey,
              send,
              registerCleanup(fn) { cleanup = fn; },
              finish,
            }).catch(async (error) => {
              send({ type: "error", message: error instanceof Error ? error.message : String(error) });
              await finish();
            });
          },
          async cancel() {
            closed = true;
            try { await cleanup?.(); } catch { /* best effort */ }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
      },
    },
  },
});

type PilotArgs = {
  companyId: string;
  userId: string;
  authorization: string;
  supabaseUrl: string;
  publishableKey: string;
  send: (payload: Record<string, unknown>) => void;
  registerCleanup: (fn: () => Promise<void>) => void;
  finish: () => Promise<void>;
};

type RoomOption = {
  numero: number;
  preco: number;
  configuracao: string;
};

type Draft = {
  name?: string;
  checkin?: string;
  checkout?: string;
  people?: number;
  options?: RoomOption[];
  selected?: RoomOption;
  awaitingConfirmation?: boolean;
  reservationId?: string;
  history: Array<{ role: "user" | "assistant"; text: string }>;
};

async function runQrPilot(args: PilotArgs) {
  const sessionPath = `/tmp/hospedamais-wa-pilot-${args.companyId}-${Date.now()}`;
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const drafts = new Map<string, Draft>();
  let socketClosed = false;
  let sock: ReturnType<typeof makeWASocket> | null = null;
  let restartCount = 0;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const { version: waVersion } = await fetchLatestWaWebVersion();
  console.info("whatsapp-qr-pilot using WA Web version", waVersion.join("."));

  const createSocket = () => {
    const activeSock = makeWASocket({
      version: waVersion,
      auth: state,
      printQRInTerminal: false,
      browser: Browsers.ubuntu("HospedaMais Teste"),
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });
    sock = activeSock;
    bindSocket(activeSock);
    return activeSock;
  };

  const cleanup = async () => {
    if (socketClosed) return;
    socketClosed = true;
    if (timeout) clearTimeout(timeout);
    if (heartbeat) clearInterval(heartbeat);
    try { sock?.end(undefined); } catch { /* best effort */ }
    await rm(sessionPath, { recursive: true, force: true }).catch(() => undefined);
  };
  args.registerCleanup(cleanup);

  args.send({
    type: "started",
    message: "Piloto iniciado. O QR é temporário e a sessão dura até 4min30s.",
    expires_in_seconds: 270,
  });

  heartbeat = setInterval(() => args.send({ type: "heartbeat", at: new Date().toISOString() }), 15_000);
  timeout = setTimeout(async () => {
    args.send({ type: "expired", message: "Tempo do piloto encerrado. Gere um novo QR para continuar." });
    await cleanup();
    await args.finish();
  }, 270_000);

  function bindSocket(activeSock: ReturnType<typeof makeWASocket>) {
    activeSock.ev.on("creds.update", saveCreds);
    activeSock.ev.on("connection.update", async (update) => {
    if (update.qr) {
      const dataUrl = await QRCode.toDataURL(update.qr, { width: 360, margin: 2 });
      args.send({ type: "qr", qr: dataUrl });
    }
    if (update.connection === "open") {
      args.send({ type: "connected", message: "WhatsApp conectado. Envie uma mensagem de outro número para testar a IA." });
    }
    if (update.connection === "close" && !socketClosed) {
      const code = Number((update.lastDisconnect?.error as any)?.output?.statusCode ?? 0);
      if (code === DisconnectReason.loggedOut) {
        args.send({ type: "disconnected", message: "O dispositivo foi desconectado do WhatsApp." });
        await cleanup();
        await args.finish();
      } else if (code === 515 && restartCount < 2) {
        restartCount += 1;
        args.send({ type: "restarting", message: "QR aceito. Finalizando a conexão do WhatsApp…" });
        try { activeSock.end(undefined); } catch { /* best effort */ }
        setTimeout(() => { if (!socketClosed) createSocket(); }, 700);
      } else {
        args.send({ type: "warning", message: "A sessão QR foi interrompida. Encerre o teste e gere um novo QR." });
      }
    }
  });

    activeSock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const message of messages) {
      if (!message.message || message.key.fromMe) continue;
      const jid = String(message.key.remoteJid ?? "");
      if (!jid || jid.endsWith("@g.us") || jid.endsWith("@broadcast")) continue;
      const text = extractMessageText(message).trim();
      if (!text) continue;

      args.send({
        type: "incoming",
        contact: maskContact(jid),
        text: text.slice(0, 240),
      });

      try {
        const reply = await handleGuestMessage({
          args,
          jid,
          message,
          text,
          draft: drafts.get(jid) ?? { history: [] },
        });
        drafts.set(jid, reply.draft);
        if (reply.text) {
          await activeSock.sendMessage(jid, { text: reply.text });
          reply.draft.history.push({ role: "assistant", text: reply.text });
          reply.draft.history = reply.draft.history.slice(-10);
          args.send({ type: "outgoing", contact: maskContact(jid), text: reply.text.slice(0, 320) });
        }
        if (reply.reservation) {
          args.send({ type: "reservation_created", ...reply.reservation });
        }
      } catch (error) {
        const fallback = "Tive uma falha ao consultar o sistema agora. Vou pedir que a recepção continue este atendimento.";
        await activeSock.sendMessage(jid, { text: fallback }).catch(() => undefined);
        args.send({ type: "error", message: error instanceof Error ? error.message : String(error) });
      }
    }
  });
  }

  createSocket();
}

async function handleGuestMessage({
  args,
  jid,
  message,
  text,
  draft,
}: {
  args: PilotArgs;
  jid: string;
  message: WAMessage;
  text: string;
  draft: Draft;
}) {
  draft.history.push({ role: "user", text });
  draft.history = draft.history.slice(-10);
  const normalized = normalize(text);

  if (/^(cancelar|recomecar|recomeçar|limpar teste)$/.test(normalized)) {
    return { draft: { history: draft.history }, text: "Certo. Zerei os dados desta conversa. Qual hospedagem você deseja consultar?" };
  }

  if (draft.reservationId) {
    return {
      draft,
      text: `Sua reserva de teste já foi criada no sistema (${draft.reservationId.slice(0, 8)}). Para iniciar outra, envie “recomeçar”.`,
    };
  }

  const name = extractName(text) || (looksLikeName(message.pushName) ? String(message.pushName) : undefined);
  if (name) draft.name = name;
  const people = extractPeople(text);
  if (people) draft.people = people;
  const dates = extractDates(text, draft.checkin);
  if (dates.checkin) draft.checkin = dates.checkin;
  if (dates.checkout) draft.checkout = dates.checkout;

  if (draft.options && !draft.selected) {
    const choice = selectOption(text, draft.options);
    if (choice) {
      draft.selected = choice;
      draft.awaitingConfirmation = true;
    }
  }

  if (draft.awaitingConfirmation && draft.selected) {
    if (/^(confirmar|confirmo|sim|pode confirmar|pode reservar|fechado|ok)$/.test(normalized)) {
      const reservation = await createReservation(args, jid, message, draft);
      draft.reservationId = reservation.id;
      draft.awaitingConfirmation = false;
      return {
        draft,
        text: `Reserva confirmada ✅\nQuarto ${reservation.quarto} • ${formatDate(reservation.checkin)} a ${formatDate(reservation.checkout)} • ${reservation.pessoas} hóspede(s) • ${formatMoney(reservation.valor_total)}.\nCódigo: ${reservation.id.slice(0, 8)}.`,
        reservation,
      };
    }
    if (/^(nao|não|cancelar)$/.test(normalized)) {
      draft.selected = undefined;
      draft.options = undefined;
      draft.awaitingConfirmation = false;
      return { draft, text: "Tudo bem, não gravei nenhuma reserva. Posso buscar outras opções." };
    }
  }

  const reservationIntent =
    Boolean(draft.checkin || draft.checkout || draft.people || draft.options) ||
    /\b(reserv|quarto|hosped|diaria|diária|disponib|ficar|pernoit)\b/.test(normalized);

  if (!reservationIntent) {
    if (/^(oi|ola|olá|bom dia|boa tarde|boa noite|opa)(!|\.)?$/.test(normalized)) {
      return { draft, text: "Olá! 👋 Sou a assistente virtual do hotel. Posso consultar disponibilidade e montar sua reserva por aqui. Para qual data você precisa?" };
    }
    const ai = await askReceptionAI(args, text, draft.history);
    return { draft, text: ai || "Posso ajudar com disponibilidade e reservas. Informe a data de entrada, por favor." };
  }

  if (!draft.checkin) return { draft, text: "Qual é a data de entrada? Pode escrever, por exemplo, “amanhã” ou “20/08”." };
  if (!draft.checkout) return { draft, text: `Entrada em ${formatDate(draft.checkin)}. Qual é a data de saída?` };
  if (!draft.people) return { draft, text: "Quantas pessoas ficarão no quarto?" };
  if (!draft.name) return { draft, text: "Perfeito. Qual é o nome completo do titular da reserva?" };

  if (!draft.options && !draft.selected) {
    const options = await loadAvailableRooms(args, draft.checkin, draft.checkout, draft.people);
    if (!options.length) {
      return { draft, text: `Não encontrei quarto livre compatível de ${formatDate(draft.checkin)} a ${formatDate(draft.checkout)} para ${draft.people} pessoa(s). Posso tentar outras datas.` };
    }
    draft.options = options.slice(0, 3);
    if (draft.options.length === 1) {
      draft.selected = draft.options[0];
      draft.awaitingConfirmation = true;
      return { draft, text: confirmationText(draft) };
    }
    return { draft, text: optionText(draft.options, draft.checkin, draft.checkout) };
  }

  if (draft.selected && !draft.awaitingConfirmation) draft.awaitingConfirmation = true;
  if (draft.selected) return { draft, text: confirmationText(draft) };

  return { draft, text: "Responda com 1, 2 ou 3 para escolher uma das opções de quarto." };
}

function confirmationText(draft: Draft) {
  const room = draft.selected!;
  const nights = nightsBetween(draft.checkin!, draft.checkout!);
  const total = room.preco * nights;
  return [
    "Posso gravar esta reserva no sistema?",
    `• Titular: ${draft.name}`,
    `• Quarto: ${room.numero} (${room.configuracao || "configuração padrão"})`,
    `• Período: ${formatDate(draft.checkin!)} a ${formatDate(draft.checkout!)} (${nights} diária(s))`,
    `• Pessoas: ${draft.people}`,
    `• Total estimado: ${formatMoney(total)}`,
    "",
    "Responda *CONFIRMAR* para criar a reserva. Antes de gravar, vou conferir a disponibilidade novamente.",
  ].join("\n");
}

function optionText(options: RoomOption[], checkin: string, checkout: string) {
  const nights = nightsBetween(checkin, checkout);
  return [
    `Encontrei estas opções para ${formatDate(checkin)} a ${formatDate(checkout)}:`,
    ...options.map((room, index) => `${index + 1}. Quarto ${room.numero} — ${room.configuracao || "padrão"} — ${formatMoney(room.preco * nights)} total`),
    "",
    "Responda com 1, 2 ou 3 para escolher.",
  ].join("\n");
}

async function loadAvailableRooms(args: PilotArgs, checkin: string, checkout: string, people: number) {
  const headers = apiHeaders(args);
  const company = encodeURIComponent(args.companyId);
  const [roomsResponse, reservationsResponse] = await Promise.all([
    fetch(`${args.supabaseUrl}/rest/v1/rooms?company_id=eq.${company}&select=numero,preco,situacao,configuracao&order=preco.asc`, { headers }),
    fetch(`${args.supabaseUrl}/rest/v1/reservations?company_id=eq.${company}&select=quarto,checkin,checkout,status`, { headers }),
  ]);
  if (!roomsResponse.ok || !reservationsResponse.ok) throw new Error("Não foi possível consultar quartos e reservas.");
  const rooms = (await roomsResponse.json()) as Array<Record<string, unknown>>;
  const reservations = (await reservationsResponse.json()) as Array<Record<string, unknown>>;
  const blocked = new Set(
    reservations
      .filter((row) => !["cancelado", "finalizado"].includes(String(row.status)))
      .filter((row) => String(row.checkin) < checkout && String(row.checkout) > checkin)
      .map((row) => Number(row.quarto)),
  );

  return rooms
    .filter((room) => String(room.situacao ?? "") !== "manutencao")
    .filter((room) => !blocked.has(Number(room.numero)))
    .map((room) => ({
      numero: Number(room.numero),
      preco: Math.max(0, Number(room.preco) || 0),
      configuracao: String(room.configuracao ?? ""),
    }))
    .filter((room) => room.numero > 0 && room.preco > 0)
    .filter((room) => estimatedCapacity(room.configuracao) >= people)
    .sort((a, b) => a.preco - b.preco || a.numero - b.numero);
}

async function createReservation(args: PilotArgs, jid: string, message: WAMessage, draft: Draft) {
  const selected = draft.selected!;
  const stillAvailable = (await loadAvailableRooms(args, draft.checkin!, draft.checkout!, draft.people!))
    .some((room) => room.numero === selected.numero);
  if (!stillAvailable) throw new Error(`O quarto ${selected.numero} acabou de ficar indisponível. A reserva não foi gravada.`);

  const externalCode = `waqr:${String(message.key.id ?? crypto.randomUUID())}`;
  const headers = apiHeaders(args);
  const duplicateResponse = await fetch(
    `${args.supabaseUrl}/rest/v1/reservations?company_id=eq.${encodeURIComponent(args.companyId)}&codigo_externo=eq.${encodeURIComponent(externalCode)}&select=id&limit=1`,
    { headers },
  );
  const duplicate = duplicateResponse.ok ? ((await duplicateResponse.json()) as Array<{ id: string }>) : [];
  if (duplicate[0]?.id) {
    return {
      id: duplicate[0].id,
      quarto: selected.numero,
      checkin: draft.checkin!,
      checkout: draft.checkout!,
      pessoas: draft.people!,
      valor_total: selected.preco * nightsBetween(draft.checkin!, draft.checkout!),
    };
  }

  const nights = nightsBetween(draft.checkin!, draft.checkout!);
  const total = selected.preco * nights;
  const response = await fetch(`${args.supabaseUrl}/rest/v1/reservations`, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      company_id: args.companyId,
      created_by: args.userId,
      quarto: selected.numero,
      cliente_nome: draft.name,
      checkin: draft.checkin,
      checkout: draft.checkout,
      diarias: nights,
      valor_diaria: selected.preco,
      valor_total: total,
      valor_pago: 0,
      pago: false,
      pagamento: "-",
      status: "reservado",
      pessoas: draft.people,
      adultos: draft.people,
      canal: "WhatsApp",
      codigo_externo: externalCode,
      origem_importacao: "whatsapp_qr_pilot",
      observacoes_importacao: `Piloto QR WhatsApp IA; contato ${maskContact(jid)}`,
    }),
  });
  const payload = await response.json().catch(() => []);
  if (!response.ok) throw new Error(`Falha ao criar reserva: ${extractError(payload)}`);
  const row = Array.isArray(payload) ? payload[0] : payload;
  if (!row?.id) throw new Error("A reserva foi enviada ao banco, mas o ID não retornou.");
  return {
    id: String(row.id),
    quarto: Number(row.quarto),
    checkin: String(row.checkin),
    checkout: String(row.checkout),
    pessoas: Number(row.pessoas),
    valor_total: Number(row.valor_total),
  };
}

async function askReceptionAI(args: PilotArgs, question: string, history: Draft["history"]) {
  const response = await fetch(`${args.supabaseUrl}/functions/v1/hotel-assistant-v2`, {
    method: "POST",
    headers: { ...apiHeaders(args), "Content-Type": "application/json" },
    body: JSON.stringify({
      company_id: args.companyId,
      mode: "reception",
      question: [
        "Você está falando diretamente com um hóspede por WhatsApp em um teste do atendimento.",
        "Responda em português, de forma curta e natural, no máximo 3 frases.",
        "Não invente preço, disponibilidade ou confirmação de reserva.",
        `Mensagem do hóspede: ${question}`,
      ].join("\n"),
      conversation: history.slice(-6),
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as { answer?: string };
  return response.ok ? String(payload.answer ?? "").trim() : "";
}

async function getAuthenticatedUser({ supabaseUrl, publishableKey, authorization }: { supabaseUrl: string; publishableKey: string; authorization: string }) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: publishableKey, authorization },
  });
  if (!response.ok) return null;
  return (await response.json()) as { id?: string };
}

async function hasCompanyAccess({ supabaseUrl, publishableKey, authorization, companyId, userId }: { supabaseUrl: string; publishableKey: string; authorization: string; companyId: string; userId: string }) {
  const url = `${supabaseUrl}/rest/v1/company_members?company_id=eq.${encodeURIComponent(companyId)}&user_id=eq.${encodeURIComponent(userId)}&ativo=eq.true&select=role&limit=1`;
  const response = await fetch(url, { headers: { apikey: publishableKey, authorization } });
  if (!response.ok) return false;
  const rows = (await response.json()) as Array<{ role?: string }>;
  return ["dono", "recepcao"].includes(String(rows[0]?.role ?? ""));
}

function apiHeaders(args: PilotArgs) {
  return { apikey: args.publishableKey, authorization: args.authorization };
}

function extractMessageText(message: WAMessage) {
  const payload: any = message.message;
  return String(
    payload?.conversation ??
    payload?.extendedTextMessage?.text ??
    payload?.imageMessage?.caption ??
    payload?.videoMessage?.caption ??
    payload?.buttonsResponseMessage?.selectedDisplayText ??
    payload?.listResponseMessage?.title ??
    "",
  );
}

function extractName(text: string) {
  const match = text.match(/(?:meu nome (?:e|é)|me chamo|sou)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' -]{2,70})/i);
  return match?.[1]?.trim().replace(/[.!?]+$/, "");
}

function looksLikeName(value: unknown) {
  const text = String(value ?? "").trim();
  return /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' -]{2,70}$/.test(text) && text.split(/\s+/).length >= 2;
}

function extractPeople(text: string) {
  const match = normalize(text).match(/\b(\d{1,2})\s*(?:pessoas?|hospedes?|hóspedes?|adultos?)\b/);
  if (match) return Math.min(12, Math.max(1, Number(match[1])));
  if (/\bcasal\b/.test(normalize(text))) return 2;
  if (/\bsozinh[oa]\b/.test(normalize(text))) return 1;
  return undefined;
}

function extractDates(text: string, existingCheckin?: string) {
  const value = normalize(text);
  const today = saoPauloToday();
  const range = value.match(/(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\s*(?:a|ate|até|-)\s*(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?/);
  if (range) {
    return {
      checkin: makeDate(Number(range[1]), Number(range[2]), range[3], today),
      checkout: makeDate(Number(range[4]), Number(range[5]), range[6], today),
    };
  }
  const one = value.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/);
  if (one) {
    const date = makeDate(Number(one[1]), Number(one[2]), one[3], today);
    if (existingCheckin && existingCheckin !== date) return { checkout: date };
    return { checkin: date };
  }
  if (/\bdepois de amanha\b|\bdepois de amanhã\b/.test(value)) return { checkin: addDays(today, 2) };
  if (/\bamanha\b|\bamanhã\b/.test(value)) return existingCheckin ? { checkout: addDays(existingCheckin, 1) } : { checkin: addDays(today, 1) };
  if (/\bhoje\b/.test(value)) return existingCheckin ? { checkout: addDays(existingCheckin, 1) } : { checkin: today };
  const nights = value.match(/\b(\d{1,2})\s*diarias?\b|\b(\d{1,2})\s*diárias?\b/);
  if (nights && existingCheckin) return { checkout: addDays(existingCheckin, Number(nights[1] || nights[2])) };
  return {} as { checkin?: string; checkout?: string };
}

function selectOption(text: string, options: RoomOption[]) {
  const normalized = normalize(text);
  if (/\b(mais barato|menor preco|menor preço)\b/.test(normalized)) return options[0];
  const match = normalized.match(/^([1-3])$/);
  if (match) return options[Number(match[1]) - 1];
  const roomMatch = normalized.match(/(?:quarto\s*)?(\d{2,4})/);
  if (roomMatch) return options.find((room) => room.numero === Number(roomMatch[1]));
  return undefined;
}

function estimatedCapacity(config: string) {
  const value = normalize(config);
  if (/quadru|4/.test(value)) return 4;
  if (/trip|3/.test(value)) return 3;
  let capacity = 0;
  if (/casal/.test(value)) capacity += 2;
  if (/beliche/.test(value)) capacity += 2;
  if (/solteir/.test(value)) capacity += 1;
  return Math.max(capacity, 2);
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
}

function saoPauloToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function makeDate(day: number, month: number, yearText: string | undefined, today: string) {
  let year = yearText ? Number(yearText) : Number(today.slice(0, 4));
  if (year < 100) year += 2000;
  let result = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (!yearText && result < today) result = `${year + 1}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return result;
}

function addDays(iso: string, amount: number) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function nightsBetween(checkin: string, checkout: string) {
  const start = Date.parse(`${checkin}T12:00:00Z`);
  const end = Date.parse(`${checkout}T12:00:00Z`);
  return Math.max(1, Math.round((end - start) / 86_400_000));
}

function formatDate(iso: string) {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function maskContact(jid: string) {
  const digits = jid.replace(/\D/g, "");
  return digits.length >= 4 ? `••••${digits.slice(-4)}` : "contato";
}

function extractError(payload: unknown) {
  if (payload && typeof payload === "object" && "message" in payload) return String((payload as any).message);
  return "erro desconhecido";
}
