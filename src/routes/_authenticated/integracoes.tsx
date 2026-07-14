import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, MessageCircle, Plus, Webhook } from "lucide-react";
import { PageHeader } from "@/components/AppLayout";
import { Badge, EmptyState, Field, Modal } from "@/components/ui-kit";
import {
  useCompanyIntegrations,
  useCurrentCompany,
  useInsert,
  useIntegrationEvents,
  useUpdate,
  useWhatsappReservationSessions,
  type CompanyIntegration,
} from "@/lib/data";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/integracoes")({
  component: Integracoes,
});

const TYPES = [
  { value: "waha", label: "WhatsApp / WAHA" },
  { value: "booking", label: "Booking" },
  { value: "airbnb", label: "Airbnb" },
  { value: "google", label: "Google Hotel" },
  { value: "channel_manager", label: "Channel Manager" },
];

function Integracoes() {
  const current = useCurrentCompany();
  const { data: events = [] } = useIntegrationEvents();
  const { data: sessions = [] } = useWhatsappReservationSessions();
  const { data: integrations = [] } = useCompanyIntegrations();
  const insert = useInsert("company_integrations", ["company_integrations"]);
  const update = useUpdate("company_integrations", ["company_integrations"]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CompanyIntegration | null>(null);

  const webhookUrl = useMemo(() => {
    const base = "https://xjdqjjfnpcnywrkxentv.supabase.co/functions/v1/integracao-reservas";
    return current.data ? `${base}?empresa=${current.data.id}&token=SEU_TOKEN` : base;
  }, [current.data]);

  return (
    <div>
      <PageHeader
        title="Integracoes"
        subtitle="Cadastre canais externos por empresa: WhatsApp/WAHA, Booking, Airbnb, Google e channel managers."
        action={
          <button onClick={() => setOpen(true)} className="btn-primary flex items-center gap-1.5">
            <Plus className="h-4 w-4" /> Canal
          </button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card-surface p-4">
          <div className="mb-3 flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-pine" />
            <h3 className="font-serif text-lg font-bold">WhatsApp / WAHA</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Use este webhook no WAHA. O token fica nos secrets do Supabase, nao no navegador.
          </p>
          <code className="mt-3 block break-all rounded-md bg-muted p-3 text-xs">{webhookUrl}</code>
          <div className="mt-3 rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            QR do WAHA aparece aqui quando a URL/API key do WAHA estiver conectada no backend.
          </div>
        </section>

        <section className="card-surface p-4">
          <div className="mb-3 flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-pine" />
            <h3 className="font-serif text-lg font-bold">Canais cadastrados</h3>
          </div>
          <p className="font-serif text-3xl font-bold">{integrations.length}</p>
          <p className="text-sm text-muted-foreground">Booking, Airbnb, Google, WhatsApp e outros provedores.</p>
        </section>

        <section className="card-surface p-4">
          <div className="mb-3 flex items-center gap-2">
            <Webhook className="h-4 w-4 text-pine" />
            <h3 className="font-serif text-lg font-bold">Conversas ativas</h3>
          </div>
          <p className="font-serif text-3xl font-bold">{sessions.length}</p>
          <p className="text-sm text-muted-foreground">Atendimentos iniciados pelo WhatsApp.</p>
        </section>
      </div>

      <section className="mt-5 card-surface overflow-x-auto">
        <div className="border-b border-border p-4">
          <h3 className="font-serif text-lg font-bold">Canais da empresa</h3>
        </div>
        {integrations.length === 0 ? (
          <EmptyState text="Nenhum canal cadastrado." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="p-3">Tipo</th>
                <th className="p-3">Nome</th>
                <th className="p-3">Identificador</th>
                <th className="p-3">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {integrations.map((item) => (
                <tr key={item.id} className="border-b border-border/50">
                  <td className="p-3">{labelType(item.tipo)}</td>
                  <td className="p-3 font-semibold">{item.nome}</td>
                  <td className="p-3 text-muted-foreground">{item.identificador ?? "-"}</td>
                  <td className="p-3"><Badge tone={item.ativo ? "sage" : "slate"}>{item.ativo ? "ativo" : "inativo"}</Badge></td>
                  <td className="p-3 text-right">
                    <button className="btn-ghost py-1 text-xs" onClick={() => { setEditing(item); setOpen(true); }}>
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mt-5 card-surface overflow-x-auto">
        <div className="border-b border-border p-4">
          <h3 className="font-serif text-lg font-bold">Ultimos eventos recebidos</h3>
        </div>
        {events.length === 0 ? (
          <EmptyState text="Nenhuma integracao recebida ainda." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="p-3">Data</th>
                <th className="p-3">Origem</th>
                <th className="p-3">Status</th>
                <th className="p-3">Reserva</th>
                <th className="p-3">Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} className="border-b border-border/50">
                  <td className="p-3">{fmtDate(event.created_at.slice(0, 10))}</td>
                  <td className="p-3">{event.source}</td>
                  <td className="p-3">
                    <Badge tone={event.status === "created" ? "sage" : event.status === "error" ? "brick" : "brass"}>
                      {event.status}
                    </Badge>
                  </td>
                  <td className="p-3 font-mono text-xs">{event.reservation_id ?? "-"}</td>
                  <td className="max-w-[420px] truncate p-3 text-muted-foreground">{event.error ?? eventSummary(event)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {open && (
        <IntegrationForm
          editing={editing}
          onClose={() => {
            setOpen(false);
            setEditing(null);
          }}
          onSave={(row) => {
            if (editing) {
              update.mutate(
                { id: editing.id, patch: row },
                {
                  onSuccess: () => {
                    toast.success("Canal atualizado");
                    setOpen(false);
                    setEditing(null);
                  },
                  onError: (e) => toast.error(e.message),
                },
              );
            } else {
              insert.mutate(row, {
                onSuccess: () => {
                  toast.success("Canal cadastrado");
                  setOpen(false);
                },
                onError: (e) => toast.error(e.message),
              });
            }
          }}
        />
      )}
    </div>
  );
}

function labelType(type: string) {
  return TYPES.find((item) => item.value === type)?.label ?? type;
}

function eventSummary(event: { payload?: unknown; source: string }) {
  const payload = event.payload as Record<string, unknown> | undefined;
  if (!payload || typeof payload !== "object") return "-";

  const nome = text(payload.nome ?? payload.name ?? payload.guest_name);
  const telefone = text(payload.telefone ?? payload.phone ?? payload.whatsapp);
  const checkin = text(payload.checkin ?? payload.check_in ?? payload.arrival);
  const checkout = text(payload.checkout ?? payload.check_out ?? payload.departure);
  const pessoas = text(payload.pessoas ?? payload.guests ?? payload.hospedes ?? payload.adults);

  const parts = [
    nome && `Nome: ${nome}`,
    telefone && `WhatsApp: ${telefone}`,
    checkin && checkout && `Periodo: ${checkin} a ${checkout}`,
    pessoas && `Pessoas: ${pessoas}`,
  ].filter(Boolean);

  return parts.length ? parts.join(" | ") : event.source;
}

function text(value: unknown) {
  const result = String(value ?? "").trim();
  return result || null;
}

function IntegrationForm({
  editing,
  onClose,
  onSave,
}: {
  editing: CompanyIntegration | null;
  onClose: () => void;
  onSave: (row: Record<string, unknown>) => void;
}) {
  const [tipo, setTipo] = useState(editing?.tipo ?? "booking");
  const [nome, setNome] = useState(editing?.nome ?? "");
  const [identificador, setIdentificador] = useState(editing?.identificador ?? "");
  const [webhookUrl, setWebhookUrl] = useState(editing?.webhook_url ?? "");
  const [observacoes, setObservacoes] = useState(editing?.observacoes ?? "");
  const [ativo, setAtivo] = useState(editing?.ativo ?? true);

  return (
    <Modal open onClose={onClose} title={editing ? "Editar canal" : "Novo canal"}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            tipo,
            nome,
            identificador: identificador || null,
            webhook_url: webhookUrl || null,
            observacoes: observacoes || null,
            ativo,
            configuracao: {},
          });
        }}
      >
        <Field label="Tipo">
          <select className="field" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TYPES.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Nome no painel">
          <input className="field" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Booking Hotel Real" required />
        </Field>
        <Field label="ID / conta / propriedade">
          <input className="field" value={identificador} onChange={(e) => setIdentificador(e.target.value)} />
        </Field>
        <Field label="Webhook / URL do provedor">
          <input className="field" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} />
        </Field>
        <Field label="Observacoes">
          <input className="field" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
          Canal ativo
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
          <button type="submit" className="btn-primary">Salvar</button>
        </div>
      </form>
    </Modal>
  );
}
