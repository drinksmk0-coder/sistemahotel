import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, MessageCircle, QrCode, RefreshCw, Save, ShieldCheck, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge, Field } from "@/components/ui-kit";

type ZApiState = {
  configured: boolean;
  instance_id?: string;
  phone_number?: string | null;
  connected?: boolean;
  smartphone_connected?: boolean;
  last_status?: string | null;
  webhook_configured?: boolean;
};

export function ZApiIntegrationPanel({ companyId }: { companyId?: string }) {
  const [state, setState] = useState<ZApiState>({ configured: false });
  const [instanceId, setInstanceId] = useState("");
  const [instanceToken, setInstanceToken] = useState("");
  const [clientToken, setClientToken] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const qrAttempts = useRef(0);
  const qrTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!companyId) return;
    void loadConfig();
    return stopQrRefresh;
  }, [companyId]);

  async function invoke(action: string, extra: Record<string, unknown> = {}) {
    const { data, error } = await supabase.functions.invoke("zapi-admin", {
      body: { action, company_id: companyId, ...extra },
    });
    if (error) throw new Error(error.message);
    if (!data?.ok) throw new Error(data?.error ?? "Falha na integração Z-API.");
    return data;
  }

  async function loadConfig() {
    try {
      const data = await invoke("get");
      const next = data as ZApiState;
      setState(next);
      if (next.instance_id) setInstanceId(next.instance_id);
      if (next.phone_number) setPhoneNumber(next.phone_number);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar a Z-API.");
    }
  }

  async function saveCredentials() {
    if (!instanceId.trim() || !instanceToken.trim() || !clientToken.trim()) {
      toast.error("Informe Instance ID, Token e Client Token.");
      return;
    }
    setLoading(true);
    try {
      await invoke("save", {
        instance_id: instanceId.trim(),
        instance_token: instanceToken.trim(),
        client_token: clientToken.trim(),
        phone_number: phoneNumber.trim(),
      });
      setInstanceToken("");
      setClientToken("");
      toast.success("Credenciais salvas com segurança.");
      await loadConfig();
      await checkStatus(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setLoading(false);
    }
  }

  async function checkStatus(showToast = true) {
    setLoading(true);
    try {
      const data = await invoke("status");
      setState((current) => ({
        ...current,
        configured: true,
        connected: data.connected,
        smartphone_connected: data.smartphone_connected,
        last_status: data.detail,
      }));
      if (data.connected) {
        stopQrRefresh();
        setQrCode(null);
      }
      if (showToast) toast.success(data.connected ? "WhatsApp conectado." : "Instância ainda desconectada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao consultar status.");
    } finally {
      setLoading(false);
    }
  }

  async function configureWebhook() {
    setLoading(true);
    try {
      await invoke("configure_webhook");
      setState((current) => ({ ...current, webhook_configured: true }));
      toast.success("Webhook de mensagens configurado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao configurar webhook.");
    } finally {
      setLoading(false);
    }
  }

  async function requestQr() {
    if (!state.configured) {
      toast.error("Salve as credenciais antes de gerar o QR Code.");
      return;
    }
    setQrLoading(true);
    try {
      const data = await invoke("qr");
      setQrCode(data.qr_code);
      qrAttempts.current += 1;
      if (qrAttempts.current < 3) {
        if (qrTimer.current) window.clearTimeout(qrTimer.current);
        qrTimer.current = window.setTimeout(() => void requestQr(), 15000);
      } else {
        stopQrRefresh(false);
        toast.info("QR pausado após 3 atualizações. Gere outro quando estiver com o celular do hotel.");
      }
    } catch (error) {
      stopQrRefresh();
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o QR Code.");
    } finally {
      setQrLoading(false);
    }
  }

  function startQrRefresh() {
    stopQrRefresh();
    qrAttempts.current = 0;
    void requestQr();
  }

  function stopQrRefresh(clear = true) {
    if (qrTimer.current) window.clearTimeout(qrTimer.current);
    qrTimer.current = null;
    if (clear) qrAttempts.current = 0;
  }

  const statusTone = state.connected ? "sage" : state.configured ? "brass" : "slate";
  const statusLabel = state.connected ? "Conectado" : state.configured ? "Aguardando conexão" : "Não configurado";

  return (
    <section className="mb-5 overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-slate-50 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-emerald-100 p-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-emerald-600 p-2.5 text-white"><MessageCircle className="h-5 w-5" /></div>
          <div>
            <h2 className="font-serif text-xl font-bold text-pine-dark">WhatsApp Z-API</h2>
            <p className="mt-1 text-sm text-muted-foreground">Conecte o número do hotel, mostre o QR Code aqui e prepare o atendimento do MAIVK.</p>
          </div>
        </div>
        <Badge tone={statusTone}>{statusLabel}</Badge>
      </div>

      <div className="grid gap-5 p-5 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Instance ID">
              <input className="field" value={instanceId} onChange={(event) => setInstanceId(event.target.value)} placeholder="ID da instância Z-API" />
            </Field>
            <Field label="Número do hotel (opcional)">
              <input className="field" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} placeholder="5535..." />
            </Field>
            <Field label="Token da instância">
              <input className="field" type="password" autoComplete="new-password" value={instanceToken} onChange={(event) => setInstanceToken(event.target.value)} placeholder={state.configured ? "Digite apenas para substituir" : "Token"} />
            </Field>
            <Field label="Client Token">
              <input className="field" type="password" autoComplete="new-password" value={clientToken} onChange={(event) => setClientToken(event.target.value)} placeholder={state.configured ? "Digite apenas para substituir" : "Client Token"} />
            </Field>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={saveCredentials} disabled={loading || !companyId} className="btn-primary inline-flex items-center gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar e testar
            </button>
            <button type="button" onClick={() => void checkStatus()} disabled={loading || !state.configured} className="btn-ghost inline-flex items-center gap-2">
              <RefreshCw className="h-4 w-4" /> Atualizar status
            </button>
            <button type="button" onClick={() => void configureWebhook()} disabled={loading || !state.configured} className="btn-ghost inline-flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> Configurar mensagens
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <StatusItem icon={<CheckCircle2 />} label="Instância" value={state.connected ? "Online" : "Desconectada"} ok={state.connected === true} />
            <StatusItem icon={<Smartphone />} label="Celular" value={state.smartphone_connected ? "Com internet" : "Não confirmado"} ok={state.smartphone_connected === true} />
            <StatusItem icon={<ShieldCheck />} label="Webhook" value={state.webhook_configured ? "Configurado" : "Pendente"} ok={state.webhook_configured === true} />
          </div>
        </div>

        <div className="rounded-xl border border-dashed border-emerald-300 bg-white p-4 text-center">
          <div className="mb-3 flex items-center justify-center gap-2 font-semibold text-pine-dark"><QrCode className="h-5 w-5" /> Conectar WhatsApp</div>
          {qrCode ? (
            <img src={qrCode} alt="QR Code para conectar o WhatsApp do hotel" className="mx-auto aspect-square w-full max-w-[280px] rounded-lg border bg-white p-2" />
          ) : (
            <div className="mx-auto flex aspect-square w-full max-w-[280px] items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">
              {state.connected ? "WhatsApp já conectado" : "O QR Code aparecerá aqui"}
            </div>
          )}
          <button type="button" onClick={startQrRefresh} disabled={qrLoading || state.connected || !state.configured} className="btn-primary mt-4 inline-flex items-center gap-2">
            {qrLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />} Gerar novo QR Code
          </button>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Quando estiver com o celular do hotel, abra WhatsApp → Dispositivos conectados → Conectar dispositivo e leia este código.</p>
        </div>
      </div>
    </section>
  );
}

function StatusItem({ icon, label, value, ok }: { icon: React.ReactNode; label: string; value: string; ok: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-white p-3">
      <div className={`mb-1 flex items-center gap-2 text-xs font-bold uppercase ${ok ? "text-emerald-700" : "text-muted-foreground"}`}>
        <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>{label}
      </div>
      <p className="text-sm font-semibold text-pine-dark">{value}</p>
    </div>
  );
}
