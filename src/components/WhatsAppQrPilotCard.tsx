import { useEffect, useRef, useState } from "react";
import { Bot, CheckCircle2, Clock3, QrCode, RefreshCw, Square, Smartphone, TestTube2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type PilotEvent = {
  type?: string;
  message?: string;
  qr?: string;
  contact?: string;
  text?: string;
  id?: string;
  quarto?: number;
  checkin?: string;
  checkout?: string;
  pessoas?: number;
  valor_total?: number;
  expires_in_seconds?: number;
};

type LogItem = {
  id: string;
  kind: "system" | "incoming" | "outgoing" | "reservation";
  text: string;
};

export function WhatsAppQrPilotCard({ companyId }: { companyId?: string }) {
  const abortRef = useRef<AbortController | null>(null);
  const [running, setRunning] = useState(false);
  const [connected, setConnected] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [status, setStatus] = useState("Piloto parado");
  const [expiresIn, setExpiresIn] = useState(0);
  const [logs, setLogs] = useState<LogItem[]>([]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (!running || expiresIn <= 0) return;
    const timer = window.setInterval(() => setExpiresIn((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [running, expiresIn > 0]);

  function append(kind: LogItem["kind"], text: string) {
    setLogs((items) => [...items.slice(-11), { id: crypto.randomUUID(), kind, text }]);
  }

  async function startPilot() {
    if (!companyId || running) return;
    setRunning(true);
    setConnected(false);
    setQr(null);
    setLogs([]);
    setStatus("Abrindo sessão QR…");
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Sua sessão expirou. Entre novamente no sistema.");

      const response = await fetch("/api/whatsapp-qr-pilot", {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ company_id: companyId }),
      });

      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Não foi possível iniciar o piloto QR.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const dataLine = chunk.split("\n").find((line) => line.startsWith("data: "));
          if (!dataLine) continue;
          const event = JSON.parse(dataLine.slice(6)) as PilotEvent;
          handleEvent(event);
        }
      }
    } catch (error) {
      if ((error as Error)?.name !== "AbortError") {
        const message = error instanceof Error ? error.message : "Falha no piloto QR.";
        toast.error(message);
        append("system", message);
      }
    } finally {
      setRunning(false);
      setConnected(false);
      setQr(null);
      setExpiresIn(0);
      abortRef.current = null;
    }
  }

  function handleEvent(event: PilotEvent) {
    switch (event.type) {
      case "started":
        setStatus(event.message || "Piloto iniciado");
        setExpiresIn(Number(event.expires_in_seconds ?? 270));
        append("system", event.message || "Piloto iniciado.");
        break;
      case "qr":
        setQr(event.qr || null);
        setStatus("Escaneie o QR no WhatsApp");
        break;
      case "connected":
        setConnected(true);
        setQr(null);
        setStatus("WhatsApp conectado — envie uma mensagem de outro número");
        append("system", event.message || "WhatsApp conectado.");
        toast.success("WhatsApp conectado para o teste.");
        break;
      case "incoming":
        append("incoming", `${event.contact || "Contato"}: ${event.text || "mensagem"}`);
        break;
      case "outgoing":
        append("outgoing", `IA → ${event.contact || "contato"}: ${event.text || "resposta"}`);
        break;
      case "reservation_created":
        append("reservation", `Reserva criada: quarto ${event.quarto} • ${event.checkin} → ${event.checkout} • R$ ${Number(event.valor_total || 0).toFixed(2)}`);
        toast.success(`Reserva criada no quarto ${event.quarto}.`);
        break;
      case "warning":
      case "error":
      case "disconnected":
      case "expired":
        setStatus(event.message || "Sessão encerrada");
        append("system", event.message || "Sessão encerrada.");
        break;
      default:
        break;
    }
  }

  function stopPilot() {
    abortRef.current?.abort();
    setStatus("Piloto encerrado manualmente");
    setRunning(false);
    setConnected(false);
    setQr(null);
    setExpiresIn(0);
  }

  const mm = String(Math.floor(expiresIn / 60)).padStart(2, "0");
  const ss = String(expiresIn % 60).padStart(2, "0");

  return (
    <section className="mb-5 overflow-hidden rounded-2xl border border-violet-200 bg-card shadow-sm">
      <div className="grid gap-5 p-5 lg:grid-cols-[.9fr_1.1fr] lg:p-6">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 text-violet-700"><TestTube2 className="h-5 w-5" /></span>
            <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-800">TESTE TEMPORÁRIO</span>
            {running && <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs"><Clock3 className="h-3.5 w-3.5" /> {mm}:{ss}</span>}
          </div>
          <h2 className="font-serif text-2xl font-bold text-pine-dark">WhatsApp por QR — piloto da IA</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Este modo serve somente para provar o fluxo ponta a ponta. Ele conecta como um dispositivo WhatsApp por alguns minutos, recebe mensagens, deixa a IA responder e só cria a reserva depois de confirmação explícita do hóspede.
          </p>

          <div className="mt-4 rounded-xl border border-border bg-muted/25 p-4 text-sm">
            <p className="font-bold text-foreground">Como testar</p>
            <ol className="mt-2 space-y-1.5 text-muted-foreground">
              <li>1. Clique em <strong>Gerar QR de teste</strong>.</li>
              <li>2. No WhatsApp do hotel: <strong>Dispositivos conectados → Conectar dispositivo</strong>.</li>
              <li>3. Escaneie o QR exibido aqui.</li>
              <li>4. De outro número, envie: “Quero reservar amanhã para 2 pessoas”.</li>
              <li>5. Complete nome/datas, escolha um quarto e responda <strong>CONFIRMAR</strong>.</li>
              <li>6. Confira a nova reserva no Mapa/Reservas.</li>
            </ol>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {!running ? (
              <button type="button" className="btn-primary inline-flex items-center gap-2" disabled={!companyId} onClick={startPilot}>
                <QrCode className="h-4 w-4" /> Gerar QR de teste
              </button>
            ) : (
              <button type="button" className="btn-ghost inline-flex items-center gap-2" onClick={stopPilot}>
                <Square className="h-4 w-4" /> Encerrar teste
              </button>
            )}
            {!running && logs.length > 0 && (
              <button type="button" className="btn-ghost inline-flex items-center gap-2" onClick={startPilot}>
                <RefreshCw className="h-4 w-4" /> Novo QR
              </button>
            )}
          </div>

          <div className="mt-3 flex items-center gap-2 text-sm">
            {connected ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : running ? <Smartphone className="h-4 w-4 text-violet-600" /> : <Bot className="h-4 w-4 text-muted-foreground" />}
            <span className={connected ? "font-semibold text-emerald-700" : "text-muted-foreground"}>{status}</span>
          </div>
        </div>

        <div className="min-h-[300px] rounded-xl border border-border bg-muted/20 p-4">
          {qr ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <img src={qr} alt="QR temporário do WhatsApp" className="w-full max-w-[300px] rounded-xl border bg-white p-3 shadow-sm" />
              <p className="mt-3 text-sm font-semibold">Escaneie pelo WhatsApp do número que será usado no teste.</p>
              <p className="mt-1 text-xs text-muted-foreground">Não fotografe nem compartilhe este QR. Ele dá acesso temporário à sessão.</p>
            </div>
          ) : logs.length > 0 ? (
            <div>
              <div className="mb-3 flex items-center justify-between"><p className="font-bold">Eventos do teste</p><span className="text-xs text-muted-foreground">sem exibir telefone completo</span></div>
              <div className="space-y-2">
                {logs.map((item) => (
                  <div key={item.id} className={`rounded-lg border px-3 py-2 text-sm ${item.kind === "reservation" ? "border-emerald-200 bg-emerald-50" : item.kind === "incoming" ? "border-sky-200 bg-sky-50" : item.kind === "outgoing" ? "border-violet-200 bg-violet-50" : "border-border bg-card"}`}>
                    <p className="text-xs font-bold uppercase text-muted-foreground">{item.kind === "incoming" ? "Recebido" : item.kind === "outgoing" ? "Resposta da IA" : item.kind === "reservation" ? "Reserva" : "Sistema"}</p>
                    <p className="mt-1 whitespace-pre-wrap">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-[270px] flex-col items-center justify-center text-center text-muted-foreground">
              <QrCode className="mb-3 h-10 w-10" />
              <p className="font-semibold text-foreground">O QR aparecerá aqui</p>
              <p className="mt-1 max-w-sm text-sm">A sessão é descartável: ao encerrar ou expirar, as credenciais temporárias são apagadas e um novo QR será necessário.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
