import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bot, CheckCircle2, Copy, Facebook, Instagram, MessageCircle, RefreshCw, ShieldCheck, Webhook } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppLayout";
import { Badge, EmptyState, Field } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/whatsapp-ia")({ component: MetaInbox });

type Status = {
  configured: boolean;
  app_id?: string | null;
  whatsapp_phone_number_id?: string | null;
  whatsapp_business_account_id?: string | null;
  facebook_page_id?: string | null;
  instagram_account_id?: string | null;
  has_app_secret?: boolean;
  has_whatsapp_token?: boolean;
  has_page_token?: boolean;
  has_verify_token?: boolean;
  webhook_verified?: boolean;
  auto_reply_enabled?: boolean;
  webhook_url?: string;
  conversations?: number;
  human_handoffs?: number;
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

function MetaInbox() {
  const current = useCurrentCompany();
  const companyId = current.data?.id;
  const [status, setStatus] = useState<Status>({ configured: false });
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [verifyToken, setVerifyToken] = useState("");
  const [form, setForm] = useState({ app_id: "", app_secret: "", whatsapp_access_token: "", whatsapp_phone_number_id: "", whatsapp_business_account_id: "", page_access_token: "", facebook_page_id: "", instagram_account_id: "" });

  useEffect(() => { if (companyId) void loadAll(); }, [companyId]);

  async function invoke(action: string, extra: Record<string, unknown> = {}) {
    if (!companyId) throw new Error("Empresa não identificada.");
    const { data, error } = await supabase.functions.invoke("meta-admin", { body: { action, company_id: companyId, ...extra } });
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error ?? "A operação não foi concluída.");
    return data;
  }

  async function loadAll() {
    if (!companyId) return;
    setLoading(true);
    try {
      const data = await invoke("get");
      setStatus(data as Status);
      setForm((old) => ({
        ...old,
        app_id: data.app_id ?? "",
        whatsapp_phone_number_id: data.whatsapp_phone_number_id ?? "",
        whatsapp_business_account_id: data.whatsapp_business_account_id ?? "",
        facebook_page_id: data.facebook_page_id ?? "",
        instagram_account_id: data.instagram_account_id ?? "",
        app_secret: "",
        whatsapp_access_token: "",
        page_access_token: "",
      }));
      const { data: rows, error } = await (supabase as any)
        .from("meta_conversations")
        .select("id,channel,contact_id,contact_name,status,handoff_reason,last_message_at")
        .eq("company_id", companyId)
        .order("last_message_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      setConversations((rows ?? []) as Conversation[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar a Caixa de Entrada.");
    } finally { setLoading(false); }
  }

  async function save() {
    setLoading(true);
    try {
      await invoke("save", form);
      toast.success("Configuração Meta salva. A IA continua desligada.");
      await loadAll();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível salvar."); }
    finally { setLoading(false); }
  }

  async function generateVerifyToken() {
    setLoading(true);
    try {
      const data = await invoke("generate_verify_token");
      setVerifyToken(String(data.verify_token ?? ""));
      setStatus((old) => ({ ...old, webhook_url: data.webhook_url, has_verify_token: true }));
      toast.success("Token de verificação gerado. Copie agora para o painel da Meta.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível gerar o token."); }
    finally { setLoading(false); }
  }

  async function toggleAutoReply() {
    setLoading(true);
    try {
      const next = !status.auto_reply_enabled;
      await invoke("auto_reply", { enabled: next });
      toast.success(next ? "IA automática ativada." : "IA automática pausada.");
      await loadAll();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível alterar a IA."); }
    finally { setLoading(false); }
  }

  async function copy(value: string, label: string) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copiado.`);
  }

  return (
    <div>
      <PageHeader title="Caixa de Entrada com IA" subtitle="WhatsApp, Instagram e Facebook Messenger conectados diretamente às APIs oficiais da Meta." action={<a href="/integracoes" className="btn-ghost">Voltar para Integrações</a>} />

      <div className="mb-5 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
        <div><p className="font-semibold">Sem Z-API e com trava humana</p><p className="text-sm">A integração usa a Meta diretamente. Cancelamentos, pagamentos, reclamações, emergências e pedidos de atendente ficam para uma pessoa. A IA não altera reservas nem pagamentos por mensagem.</p></div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_.75fr]">
        <section className="card-surface p-5">
          <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-serif text-xl font-bold">Conexão oficial Meta</h2><p className="text-sm text-muted-foreground">Tokens e App Secret são cifrados no backend e não são exibidos novamente.</p></div><Badge tone={status.webhook_verified ? "sage" : status.configured ? "brass" : "slate"}>{status.webhook_verified ? "webhook validado" : status.configured ? "configurado" : "não configurado"}</Badge></div>

          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Meta App ID"><input className="input-field" value={form.app_id} onChange={(e) => setForm({ ...form, app_id: e.target.value })} /></Field>
            <Field label="Meta App Secret"><input className="input-field" type="password" value={form.app_secret} onChange={(e) => setForm({ ...form, app_secret: e.target.value })} placeholder={status.has_app_secret ? "Preencha apenas para substituir" : "App Secret"} /></Field>
            <Field label="WhatsApp Phone Number ID"><input className="input-field" value={form.whatsapp_phone_number_id} onChange={(e) => setForm({ ...form, whatsapp_phone_number_id: e.target.value })} /></Field>
            <Field label="WhatsApp Business Account ID"><input className="input-field" value={form.whatsapp_business_account_id} onChange={(e) => setForm({ ...form, whatsapp_business_account_id: e.target.value })} /></Field>
            <Field label="Token WhatsApp Cloud API"><input className="input-field" type="password" value={form.whatsapp_access_token} onChange={(e) => setForm({ ...form, whatsapp_access_token: e.target.value })} placeholder={status.has_whatsapp_token ? "Preencha apenas para substituir" : "Access Token"} /></Field>
            <Field label="Facebook Page ID"><input className="input-field" value={form.facebook_page_id} onChange={(e) => setForm({ ...form, facebook_page_id: e.target.value })} /></Field>
            <Field label="Instagram Account ID"><input className="input-field" value={form.instagram_account_id} onChange={(e) => setForm({ ...form, instagram_account_id: e.target.value })} /></Field>
            <Field label="Page Access Token (Facebook/Instagram)"><input className="input-field" type="password" value={form.page_access_token} onChange={(e) => setForm({ ...form, page_access_token: e.target.value })} placeholder={status.has_page_token ? "Preencha apenas para substituir" : "Page Access Token"} /></Field>
          </div>
          <div className="mt-4 flex flex-wrap gap-2"><button type="button" className="btn-primary" disabled={loading} onClick={save}>Salvar configuração</button><button type="button" className="btn-ghost inline-flex items-center gap-1.5" disabled={loading} onClick={generateVerifyToken}><Webhook className="h-4 w-4" /> Gerar webhook</button><button type="button" className="btn-ghost inline-flex items-center gap-1.5" disabled={loading} onClick={loadAll}><RefreshCw className="h-4 w-4" /> Atualizar status</button></div>

          {(status.webhook_url || verifyToken) && <div className="mt-5 rounded-xl border border-border bg-muted/20 p-4"><p className="font-semibold">Configuração do Webhook na Meta</p><p className="mt-3 text-xs font-semibold uppercase text-muted-foreground">Callback URL</p><div className="mt-1 flex gap-2"><input className="input-field" readOnly value={status.webhook_url ?? ""} /><button className="btn-ghost" type="button" onClick={() => copy(status.webhook_url ?? "", "Callback URL")}><Copy className="h-4 w-4" /></button></div>{verifyToken && <><p className="mt-3 text-xs font-semibold uppercase text-muted-foreground">Verify Token — exibido somente agora</p><div className="mt-1 flex gap-2"><input className="input-field" readOnly value={verifyToken} /><button className="btn-ghost" type="button" onClick={() => copy(verifyToken, "Verify Token")}><Copy className="h-4 w-4" /></button></div></>}</div>}
        </section>

        <section className="card-surface p-5">
          <div className="mb-4 flex items-center gap-2"><Bot className="h-5 w-5 text-primary" /><h2 className="font-serif text-xl font-bold">Canais e IA</h2></div>
          <ChannelStatus icon={<MessageCircle className="h-4 w-4" />} label="WhatsApp" configured={Boolean(status.has_whatsapp_token && status.whatsapp_phone_number_id)} />
          <ChannelStatus icon={<Facebook className="h-4 w-4" />} label="Messenger" configured={Boolean(status.has_page_token && status.facebook_page_id)} />
          <ChannelStatus icon={<Instagram className="h-4 w-4" />} label="Instagram" configured={Boolean(status.has_page_token && status.instagram_account_id)} />
          <ChannelStatus icon={<Webhook className="h-4 w-4" />} label="Webhook Meta" configured={status.webhook_verified === true} />
          <div className="mt-5 rounded-lg border border-border p-4"><p className="font-semibold">IA automática</p><p className="mt-1 text-sm text-muted-foreground">Permanece desligada até o webhook oficial ser validado.</p><button type="button" onClick={toggleAutoReply} disabled={loading || !status.configured} className={status.auto_reply_enabled ? "mt-3 btn-ghost border border-red-200 text-red-700" : "mt-3 btn-primary"}>{status.auto_reply_enabled ? "Pausar respostas automáticas" : "Ativar respostas automáticas"}</button></div>
          <div className="mt-4 grid grid-cols-2 gap-3"><Metric label="Conversas" value={status.conversations ?? conversations.length} /><Metric label="Aguardando humano" value={status.human_handoffs ?? conversations.filter((c) => c.status === "human").length} /></div>
        </section>
      </div>

      <section className="mt-5 card-surface overflow-x-auto">
        <div className="flex items-center justify-between border-b border-border p-4"><div><h2 className="font-serif text-lg font-bold">Caixa de Entrada unificada</h2><p className="text-sm text-muted-foreground">WhatsApp, Instagram e Messenger no mesmo histórico.</p></div><button type="button" className="btn-ghost" disabled={loading} onClick={loadAll}>Atualizar</button></div>
        {conversations.length === 0 ? <EmptyState text="Nenhuma conversa da Meta recebida ainda." /> : <table className="w-full min-w-[820px] text-sm"><thead><tr className="border-b border-border text-left text-xs uppercase text-muted-foreground"><th className="p-3">Canal</th><th className="p-3">Contato</th><th className="p-3">Atendimento</th><th className="p-3">Motivo</th><th className="p-3">Última mensagem</th></tr></thead><tbody>{conversations.map((c) => <tr key={c.id} className="border-b border-border/50"><td className="p-3"><Badge tone={c.channel === "whatsapp" ? "sage" : c.channel === "instagram" ? "brass" : "slate"}>{channelLabel(c.channel)}</Badge></td><td className="p-3 font-semibold">{c.contact_name || `•••• ${c.contact_id.slice(-4)}`}</td><td className="p-3"><Badge tone={c.status === "bot" ? "sage" : c.status === "human" ? "brass" : "slate"}>{c.status === "bot" ? "IA" : c.status === "human" ? "Humano" : "Encerrado"}</Badge></td><td className="p-3">{reasonLabel(c.handoff_reason)}</td><td className="p-3">{new Date(c.last_message_at).toLocaleString("pt-BR")}</td></tr>)}</tbody></table>}
      </section>
    </div>
  );
}

function ChannelStatus({ icon, label, configured }: { icon: React.ReactNode; label: string; configured: boolean }) { return <div className="flex items-center justify-between border-b border-border/60 py-2 text-sm"><span className="inline-flex items-center gap-2">{icon}{label}</span><span className="inline-flex items-center gap-1.5 font-semibold"><CheckCircle2 className={`h-4 w-4 ${configured ? "text-emerald-600" : "text-slate-300"}`} />{configured ? "Configurado" : "Pendente"}</span></div>; }
function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-lg border border-border bg-muted/30 p-3"><p className="text-xs uppercase text-muted-foreground">{label}</p><p className="font-serif text-2xl font-bold">{value}</p></div>; }
function channelLabel(channel: Conversation["channel"]) { return channel === "whatsapp" ? "WhatsApp" : channel === "instagram" ? "Instagram" : "Messenger"; }
function reasonLabel(reason: string | null) { const labels: Record<string, string> = { emergency: "Emergência", complaint: "Reclamação", reservation_change: "Alterar/cancelar reserva", payment: "Pagamento", human_requested: "Pediu atendente" }; return reason ? labels[reason] ?? reason : "—"; }
