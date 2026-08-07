import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Bot, CheckCircle2, MessageCircle, QrCode, RefreshCw, ShieldCheck, UserRound, Webhook, XCircle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppLayout";
import { Badge, EmptyState, Field } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/whatsapp-ia")({ component: WhatsappIA });

type ZapiStatus = {
  configured: boolean;
  instance_id?: string;
  phone_number?: string | null;
  connected?: boolean;
  smartphone_connected?: boolean;
  webhook_configured?: boolean;
  auto_reply_enabled?: boolean;
  conversations?: number;
  human_handoffs?: number;
  last_status?: string | null;
};

type Conversation = {
  id: string;
  phone: string;
  contact_name: string | null;
  status: "bot" | "human" | "closed";
  handoff_reason: string | null;
  last_message_at: string;
};

function WhatsappIA() {
  const current = useCurrentCompany();
  const companyId = current.data?.id;
  const [status, setStatus] = useState<ZapiStatus>({ configured: false });
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [qr, setQr] = useState("");
  const [instanceId, setInstanceId] = useState("");
  const [instanceToken, setInstanceToken] = useState("");
  const [clientToken, setClientToken] = useState("");
  const [phone, setPhone] = useState("");

  const qrSrc = useMemo(() => {
    if (!qr) return "";
    return qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`;
  }, [qr]);

  useEffect(() => {
    if (companyId) void loadAll();
  }, [companyId]);

  async function invoke(action: string, extra: Record<string, unknown> = {}) {
    if (!companyId) throw new Error("Empresa não identificada.");
    const { data, error } = await supabase.functions.invoke("zapi-admin", {
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
      const data = await invoke("get");
      setStatus(data as ZapiStatus);
      if (data.instance_id) setInstanceId(String(data.instance_id));
      if (data.phone_number) setPhone(String(data.phone_number));

      const { data: rows, error } = await (supabase as any)
        .from("zapi_conversations")
        .select("id,phone,contact_name,status,handoff_reason,last_message_at")
        .eq("company_id", companyId)
        .order("last_message_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      setConversations((rows ?? []) as Conversation[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar o WhatsApp.");
    } finally {
      setLoading(false);
    }
  }

  async function saveCredentials() {
    if (!instanceId.trim() || !instanceToken.trim() || !clientToken.trim()) {
      toast.error("Preencha Instance ID, Token e Client Token.");
      return;
    }
    setLoading(true);
    try {
      await invoke("save", {
        instance_id: instanceId.trim(),
        instance_token: instanceToken.trim(),
        client_token: clientToken.trim(),
        phone_number: phone.trim(),
      });
      setInstanceToken("");
      setClientToken("");
      setQr("");
      toast.success("Credenciais salvas com segurança. A IA continua desligada.");
      await loadAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setLoading(false);
    }
  }

  async function checkStatus() {
    setLoading(true);
    try {
      const data = await invoke("status");
      toast.success(data.connected ? "WhatsApp conectado." : "WhatsApp ainda não está conectado.");
      await loadAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao consultar status.");
    } finally {
      setLoading(false);
    }
  }

  async function generateQr() {
    setLoading(true);
    try {
      const data = await invoke("qr");
      setQr(String(data.qr_code ?? ""));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o QR Code.");
    } finally {
      setLoading(false);
    }
  }

  async function configureWebhook() {
    setLoading(true);
    try {
      await invoke("webhook");
      toast.success("Webhook seguro configurado na Z-API.");
      await loadAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível configurar o webhook.");
    } finally {
      setLoading(false);
    }
  }

  async function toggleAutoReply() {
    setLoading(true);
    try {
      const next = !status.auto_reply_enabled;
      await invoke("auto_reply", { enabled: next });
      toast.success(next ? "Recepção automática ativada." : "Recepção automática pausada.");
      await loadAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível alterar a IA.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="WhatsApp com IA"
        subtitle="Conecte a Z-API, receba mensagens no HospedaMais e automatize apenas atendimentos seguros."
        action={<a href="/integracoes" className="btn-ghost">Voltar para Integrações</a>}
      />

      <div className="mb-5 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="font-semibold">Automação com trava humana</p>
          <p className="text-sm">Cancelamento, alteração de reserva, pagamento, reclamação, emergência ou pedido por atendente são encaminhados para uma pessoa. A IA não altera reservas nem pagamentos pelo WhatsApp.</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
        <section className="card-surface p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-serif text-xl font-bold">Conexão Z-API</h2>
              <p className="text-sm text-muted-foreground">Os tokens são enviados à função segura e nunca são exibidos novamente.</p>
            </div>
            <Badge tone={status.connected ? "sage" : "slate"}>{status.connected ? "conectado" : status.configured ? "configurado" : "não configurado"}</Badge>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Instance ID">
              <input className="input-field" value={instanceId} onChange={(e) => setInstanceId(e.target.value)} placeholder="ID da instância Z-API" />
            </Field>
            <Field label="Número do WhatsApp (opcional)">
              <input className="input-field" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="5535..." />
            </Field>
            <Field label="Token da instância">
              <input className="input-field" type="password" value={instanceToken} onChange={(e) => setInstanceToken(e.target.value)} placeholder={status.configured ? "Preencha somente para substituir" : "Token"} />
            </Field>
            <Field label="Client Token">
              <input className="input-field" type="password" value={clientToken} onChange={(e) => setClientToken(e.target.value)} placeholder={status.configured ? "Preencha somente para substituir" : "Client Token"} />
            </Field>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn-primary" disabled={loading} onClick={saveCredentials}>Salvar credenciais</button>
            <button type="button" className="btn-ghost inline-flex items-center gap-1.5" disabled={loading || !status.configured} onClick={checkStatus}><RefreshCw className="h-4 w-4" /> Verificar status</button>
            <button type="button" className="btn-ghost inline-flex items-center gap-1.5" disabled={loading || !status.configured} onClick={generateQr}><QrCode className="h-4 w-4" /> Gerar QR Code</button>
            <button type="button" className="btn-ghost inline-flex items-center gap-1.5" disabled={loading || !status.configured} onClick={configureWebhook}><Webhook className="h-4 w-4" /> Configurar webhook</button>
          </div>

          {qrSrc && (
            <div className="mt-5 rounded-xl border border-border p-4 text-center">
              <p className="mb-3 text-sm font-semibold">Leia este QR Code com o WhatsApp do hotel</p>
              <img src={qrSrc} alt="QR Code de conexão do WhatsApp" className="mx-auto h-64 w-64 object-contain" />
              <p className="mt-2 text-xs text-muted-foreground">Depois de conectar, clique em “Verificar status”.</p>
            </div>
          )}
        </section>

        <section className="card-surface p-5">
          <div className="mb-4 flex items-center gap-2"><Bot className="h-5 w-5 text-primary" /><h2 className="font-serif text-xl font-bold">Recepção automática</h2></div>
          <StatusLine label="WhatsApp" ok={status.connected === true} />
          <StatusLine label="Celular conectado" ok={status.smartphone_connected === true} />
          <StatusLine label="Webhook de mensagens" ok={status.webhook_configured === true} />

          <div className="mt-5 rounded-lg border border-border p-4">
            <p className="font-semibold">IA automática</p>
            <p className="mt-1 text-sm text-muted-foreground">Começa desligada. Só pode ser ativada depois de conexão e webhook confirmados.</p>
            <button
              type="button"
              onClick={toggleAutoReply}
              disabled={loading || !status.configured}
              className={status.auto_reply_enabled ? "mt-3 btn-ghost border border-red-200 text-red-700" : "mt-3 btn-primary"}
            >
              {status.auto_reply_enabled ? "Pausar respostas automáticas" : "Ativar respostas automáticas"}
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Metric label="Conversas" value={status.conversations ?? conversations.length} />
            <Metric label="Aguardando humano" value={status.human_handoffs ?? conversations.filter((c) => c.status === "human").length} />
          </div>
        </section>
      </div>

      <section className="mt-5 card-surface overflow-x-auto">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div><h2 className="font-serif text-lg font-bold">Conversas recentes</h2><p className="text-sm text-muted-foreground">Histórico por empresa, com indicação de quem deve continuar o atendimento.</p></div>
          <button type="button" className="btn-ghost" disabled={loading} onClick={loadAll}>Atualizar</button>
        </div>
        {conversations.length === 0 ? <EmptyState text="Nenhuma conversa recebida ainda." /> : (
          <table className="w-full min-w-[780px] text-sm">
            <thead><tr className="border-b border-border text-left text-xs uppercase text-muted-foreground"><th className="p-3">Contato</th><th className="p-3">Telefone</th><th className="p-3">Atendimento</th><th className="p-3">Motivo</th><th className="p-3">Última mensagem</th></tr></thead>
            <tbody>{conversations.map((conversation) => (
              <tr key={conversation.id} className="border-b border-border/50">
                <td className="p-3 font-semibold">{conversation.contact_name || "WhatsApp"}</td>
                <td className="p-3 text-muted-foreground">•••• {conversation.phone.slice(-4)}</td>
                <td className="p-3"><Badge tone={conversation.status === "bot" ? "sage" : conversation.status === "human" ? "brass" : "slate"}>{conversation.status === "bot" ? "IA" : conversation.status === "human" ? "Humano" : "Encerrado"}</Badge></td>
                <td className="p-3">{reasonLabel(conversation.handoff_reason)}</td>
                <td className="p-3">{new Date(conversation.last_message_at).toLocaleString("pt-BR")}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function StatusLine({ label, ok }: { label: string; ok: boolean }) {
  return <div className="flex items-center justify-between border-b border-border/60 py-2 text-sm"><span>{label}</span><span className="inline-flex items-center gap-1.5 font-semibold">{ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-slate-400" />}{ok ? "Pronto" : "Pendente"}</span></div>;
}
function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border border-border bg-muted/30 p-3"><p className="text-xs uppercase text-muted-foreground">{label}</p><p className="font-serif text-2xl font-bold">{value}</p></div>;
}
function reasonLabel(reason: string | null) {
  const labels: Record<string, string> = { emergency: "Emergência", complaint: "Reclamação", reservation_change: "Alterar/cancelar reserva", payment: "Pagamento", human_requested: "Pediu atendente" };
  return reason ? labels[reason] ?? reason : "—";
}
