import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Bot, CheckCircle2, MessageCircle, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppLayout";
import { Badge, EmptyState } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/whatsapp-ia")({ component: MetaInbox });

type Status = {
  ready?: boolean;
  connected?: boolean;
  app_id?: string | null;
  config_id?: string | null;
  graph_version?: string;
  phone_number_id?: string | null;
  waba_id?: string | null;
  webhook_verified?: boolean;
  updated_at?: string | null;
  missing_platform_config?: string[];
};

type Conversation = {
  id: string;
  channel: "whatsapp" | "instagram" | "messenger";
  contact_id: string;
  contact_name: string | null;
  status: "bot" | "human" | "closed";
  handoff_reason: string | null;
  last_message_at: string;
};

type SessionInfo = { waba_id?: string; phone_number_id?: string; business_id?: string };

function MetaInbox() {
  const current = useCurrentCompany();
  const companyId = current.data?.id;
  const [status, setStatus] = useState<Status>({});
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const sessionInfoRef = useRef<SessionInfo>({});

  useEffect(() => { if (companyId) void loadAll(); }, [companyId]);

  async function invoke(action: "config" | "status" | "complete", extra: Record<string, unknown> = {}) {
    if (!companyId) throw new Error("Empresa não identificada.");
    const { data, error } = await supabase.functions.invoke("meta-embedded-signup-preview", {
      body: { action, company_id: companyId, ...extra },
    });
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error ?? "A operação não foi concluída.");
    return data;
  }

  async function loadAll() {
    if (!companyId) return;
    setLoading(true);
    try {
      const data = await invoke("status");
      setStatus(data as Status);
      const { data: rows, error } = await (supabase as any)
        .from("meta_conversations")
        .select("id,channel,contact_id,contact_name,status,handoff_reason,last_message_at")
        .eq("company_id", companyId)
        .order("last_message_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      setConversations((rows ?? []) as Conversation[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar o WhatsApp.");
    } finally { setLoading(false); }
  }

  async function connectWhatsApp() {
    if (!companyId) return;
    setConnecting(true);
    sessionInfoRef.current = {};
    let listener: ((event: MessageEvent) => void) | null = null;
    try {
      const config = await invoke("config");
      setStatus(config as Status);
      if (!config.ready || !config.app_id || !config.config_id) {
        throw new Error("A configuração única da Plataforma Comercial da Meta ainda precisa ser concluída pelo administrador do HospedaMais.");
      }
      await loadFacebookSdk();
      const FB = (window as any).FB;
      if (!FB) throw new Error("Não foi possível abrir a conexão da Meta neste navegador.");

      FB.init({ appId: config.app_id, cookie: true, xfbml: false, version: config.graph_version || "v23.0" });
      listener = (event: MessageEvent) => {
        if (!["https://www.facebook.com", "https://web.facebook.com"].includes(event.origin)) return;
        const payload = parseMetaEvent(event.data);
        if (payload) sessionInfoRef.current = { ...sessionInfoRef.current, ...payload };
      };
      window.addEventListener("message", listener);

      await new Promise<void>((resolve, reject) => {
        FB.login(async (response: any) => {
          try {
            const code = String(response?.authResponse?.code ?? "").trim();
            if (!code) return reject(new Error("A conexão foi cancelada ou não foi autorizada."));
            await waitForSessionInfo(sessionInfoRef);
            const session = sessionInfoRef.current;
            if (!session.waba_id || !session.phone_number_id) {
              return reject(new Error("A Meta não informou a conta/número. Conclua todas as etapas da janela de conexão."));
            }
            const result = await invoke("complete", {
              code,
              waba_id: session.waba_id,
              phone_number_id: session.phone_number_id,
              business_id: session.business_id,
            });
            toast.success(result.display_phone_number ? `WhatsApp ${result.display_phone_number} conectado.` : "WhatsApp conectado com sucesso.");
            resolve();
          } catch (error) { reject(error); }
        }, {
          config_id: config.config_id,
          response_type: "code",
          override_default_response_type: true,
          extras: { feature: "whatsapp_embedded_signup", sessionInfoVersion: "3" },
        });
      });
      await loadAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível conectar o WhatsApp.");
    } finally {
      if (listener) window.removeEventListener("message", listener);
      setConnecting(false);
    }
  }

  const whatsappConversations = conversations.filter((c) => c.channel === "whatsapp");
  const human = whatsappConversations.filter((c) => c.status === "human").length;

  return (
    <div>
      <PageHeader title="WhatsApp + CRM" subtitle="Conexão oficial com a Plataforma Comercial do WhatsApp, sem copiar token ou IDs manualmente." action={<a href="/integracoes" className="btn-ghost">Integrações</a>} />

      <section className="mb-5 overflow-hidden rounded-2xl border border-emerald-200 bg-card shadow-sm">
        <div className="grid gap-5 p-5 lg:grid-cols-[1.25fr_.75fr] lg:p-6">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><MessageCircle className="h-5 w-5" /></span>
              <Badge tone={status.connected ? "sage" : status.ready ? "brass" : "slate"}>{status.connected ? "WhatsApp conectado" : status.ready ? "Pronto para conectar" : "Configuração da plataforma"}</Badge>
            </div>
            <h2 className="font-serif text-2xl font-bold text-pine-dark">Conectar WhatsApp Business</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              O hotel não precisa preencher App ID, token, WABA ID nem Phone Number ID. Clique no botão, autorize sua empresa na Meta e conclua a seleção do número. Quando o fluxo de coexistência estiver disponível para essa conta, a própria Meta pode apresentar a confirmação pelo celular/QR.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="btn-primary inline-flex items-center gap-2" disabled={connecting || loading} onClick={connectWhatsApp}>
                <Smartphone className="h-4 w-4" /> {connecting ? "Conectando…" : status.connected ? "Reconectar WhatsApp" : "Conectar WhatsApp"}
              </button>
              <button type="button" className="btn-ghost inline-flex items-center gap-2" disabled={loading || connecting} onClick={loadAll}><RefreshCw className="h-4 w-4" /> Atualizar status</button>
            </div>
            {!status.ready && (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Falta apenas a configuração única da aplicação Meta do HospedaMais. Isso é feito uma vez pela plataforma; cada hotel continuará vendo somente o botão de conexão.
              </p>
            )}
          </div>
          <div className="rounded-xl border border-border bg-muted/25 p-4">
            <h3 className="text-sm font-black text-pine-dark">O que fica automático</h3>
            <div className="mt-3 space-y-2 text-sm">
              <Step done={status.connected === true} text="Autorizar conta comercial" />
              <Step done={status.connected === true} text="Identificar WABA e número" />
              <Step done={status.connected === true} text="Guardar token cifrado no servidor" />
              <Step done={status.webhook_verified === true} text="Vincular webhook ao CRM" />
              <Step done={status.connected === true} text="Liberar mensagens para as automações" />
            </div>
          </div>
        </div>
      </section>

      <div className="mb-5 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
        <div><p className="font-semibold">Credenciais fora da tela</p><p className="text-sm">O código de autorização é trocado por token no backend e o token fica cifrado. A recepção não vê nem copia segredos da Meta.</p></div>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Metric label="Conversas WhatsApp" value={whatsappConversations.length} />
        <Metric label="Aguardando humano" value={human} />
        <Metric label="Conexão" value={status.connected ? 1 : 0} suffix={status.connected ? "ativa" : "pendente"} />
      </div>

      <section className="card-surface overflow-x-auto">
        <div className="flex items-center justify-between border-b border-border p-4"><div><h2 className="font-serif text-lg font-bold">Caixa de Entrada WhatsApp</h2><p className="text-sm text-muted-foreground">As mensagens recebidas pela API oficial continuam alimentando o CRM e os encaminhamentos para atendimento humano.</p></div><Bot className="h-5 w-5 text-primary" /></div>
        {whatsappConversations.length === 0 ? <EmptyState text={status.connected ? "WhatsApp conectado. As novas conversas aparecerão aqui." : "Conecte o WhatsApp para começar a receber conversas."} /> : <table className="w-full min-w-[720px] text-sm"><thead><tr className="border-b border-border text-left text-xs uppercase text-muted-foreground"><th className="p-3">Contato</th><th className="p-3">Atendimento</th><th className="p-3">Motivo</th><th className="p-3">Última mensagem</th></tr></thead><tbody>{whatsappConversations.map((c) => <tr key={c.id} className="border-b border-border/50"><td className="p-3 font-semibold">{c.contact_name || `•••• ${c.contact_id.slice(-4)}`}</td><td className="p-3"><Badge tone={c.status === "bot" ? "sage" : c.status === "human" ? "brass" : "slate"}>{c.status === "bot" ? "IA" : c.status === "human" ? "Humano" : "Encerrado"}</Badge></td><td className="p-3">{reasonLabel(c.handoff_reason)}</td><td className="p-3">{new Date(c.last_message_at).toLocaleString("pt-BR")}</td></tr>)}</tbody></table>}
      </section>
    </div>
  );
}

function Step({ done, text }: { done: boolean; text: string }) {
  return <div className="flex items-center gap-2"><CheckCircle2 className={`h-4 w-4 shrink-0 ${done ? "text-emerald-600" : "text-slate-300"}`} /><span className={done ? "font-semibold text-foreground" : "text-muted-foreground"}>{text}</span></div>;
}
function Metric({ label, value, suffix }: { label: string; value: number; suffix?: string }) { return <div className="rounded-xl border border-border bg-card p-4 shadow-sm"><p className="text-xs uppercase text-muted-foreground">{label}</p><p className="mt-1 font-serif text-2xl font-bold">{suffix ?? value}</p></div>; }
function reasonLabel(reason: string | null) { const labels: Record<string, string> = { emergency: "Emergência", complaint: "Reclamação", reservation_change: "Alterar/cancelar reserva", payment: "Pagamento", human_requested: "Pediu atendente" }; return reason ? labels[reason] ?? reason : "—"; }

async function loadFacebookSdk() {
  if ((window as any).FB) return;
  await new Promise<void>((resolve, reject) => {
    const existing = document.getElementById("facebook-jssdk") as HTMLScriptElement | null;
    if (existing) { existing.addEventListener("load", () => resolve(), { once: true }); existing.addEventListener("error", () => reject(new Error("Falha ao carregar a Meta.")), { once: true }); return; }
    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.src = "https://connect.facebook.net/pt_BR/sdk.js";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Falha ao carregar a Meta."));
    document.head.appendChild(script);
  });
}

function parseMetaEvent(raw: unknown): SessionInfo | null {
  try {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!data || typeof data !== "object") return null;
    const event = data as any;
    if (event.type !== "WA_EMBEDDED_SIGNUP") return null;
    const info = event.data ?? {};
    if (!["FINISH", "FINISH_ONLY_WABA", "PHONE_NUMBER_SELECTED"].includes(String(event.event ?? "")) && !info.waba_id && !info.phone_number_id) return null;
    return { waba_id: info.waba_id ? String(info.waba_id) : undefined, phone_number_id: info.phone_number_id ? String(info.phone_number_id) : undefined, business_id: info.business_id ? String(info.business_id) : undefined };
  } catch { return null; }
}

async function waitForSessionInfo(ref: React.MutableRefObject<SessionInfo>) {
  for (let i = 0; i < 20; i += 1) {
    if (ref.current.waba_id && ref.current.phone_number_id) return;
    await new Promise((resolve) => window.setTimeout(resolve, 150));
  }
}
