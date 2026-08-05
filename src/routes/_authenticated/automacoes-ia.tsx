import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bot, CheckCircle2, Clock3, ShieldCheck, XCircle } from "lucide-react";
import { PageHeader } from "@/components/AppLayout";
import { Badge, EmptyState } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/automacoes-ia")({
  component: AutomacoesIA,
});

type QueueStatus = "pending_review" | "approved" | "rejected" | "executed" | "failed";

type AutomationRow = {
  id: string;
  source: string;
  external_id: string | null;
  action_type: string;
  status: QueueStatus;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  payload: Record<string, unknown>;
  requires_human_confirmation: boolean;
  reviewed_at: string | null;
  executed_at: string | null;
  error: string | null;
  created_at: string;
};

function AutomacoesIA() {
  const company = useCurrentCompany();
  const queryClient = useQueryClient();

  const queue = useQuery({
    queryKey: ["ai-automation-queue", company.data?.id],
    enabled: !!company.data?.id,
    queryFn: async (): Promise<AutomationRow[]> => {
      const { data, error } = await supabase
        .from("ai_automation_queue" as never)
        .select("id,source,external_id,action_type,status,contact_name,contact_phone,contact_email,payload,requires_human_confirmation,reviewed_at,executed_at,error,created_at")
        .eq("company_id", company.data!.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as AutomationRow[];
    },
    refetchInterval: 30_000,
  });

  const review = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw authError ?? new Error("Usuário não autenticado");

      const { error } = await supabase
        .from("ai_automation_queue" as never)
        .update({
          status,
          reviewed_by: authData.user.id,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", id)
        .eq("company_id", company.data!.id)
        .eq("status", "pending_review");
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-automation-queue", company.data?.id] }),
  });

  const rows = queue.data ?? [];
  const pending = rows.filter((row) => row.status === "pending_review").length;
  const approved = rows.filter((row) => row.status === "approved").length;
  const executed = rows.filter((row) => row.status === "executed").length;
  const failed = rows.filter((row) => row.status === "failed").length;

  return (
    <div>
      <PageHeader
        title="Central de Automações com IA"
        subtitle="Revise ações sugeridas pela IA antes que reservas, cancelamentos ou alterações críticas sejam executados."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<Clock3 className="h-5 w-5" />} label="Aguardando revisão" value={pending} />
        <Metric icon={<CheckCircle2 className="h-5 w-5" />} label="Aprovadas" value={approved} />
        <Metric icon={<Bot className="h-5 w-5" />} label="Executadas" value={executed} />
        <Metric icon={<AlertTriangle className="h-5 w-5" />} label="Com falha" value={failed} />
      </div>

      <div className="mb-5 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="font-semibold">Confirmação humana obrigatória</p>
          <p className="text-sm">Aprovar apenas libera a ação para o orquestrador. Esta tela não exclui reservas, hóspedes, pagamentos ou histórico e não executa cancelamentos diretamente.</p>
        </div>
      </div>

      {queue.isLoading ? (
        <div className="card-surface p-6 text-sm text-muted-foreground">Carregando fila de automações...</div>
      ) : queue.error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Não foi possível carregar a fila: {queue.error instanceof Error ? queue.error.message : "erro desconhecido"}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState text="Nenhuma ação de IA recebida para esta empresa." />
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <article key={row.id} className="card-surface p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge>
                    <Badge tone="slate">{sourceLabel(row.source)}</Badge>
                    {row.requires_human_confirmation && <Badge tone="brass">Requer confirmação</Badge>}
                  </div>
                  <div>
                    <h2 className="text-base font-semibold">{actionLabel(row.action_type)}</h2>
                    <p className="text-sm text-muted-foreground">
                      {row.contact_name || "Contato não identificado"}
                      {row.contact_phone ? ` • ${row.contact_phone}` : ""}
                      {row.contact_email ? ` • ${row.contact_email}` : ""}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Recebido em {new Date(row.created_at).toLocaleString("pt-BR")}
                    {row.external_id ? ` • ID externo ${row.external_id}` : ""}
                  </p>
                  <details className="rounded-md border border-border bg-muted/20 p-3 text-sm">
                    <summary className="cursor-pointer font-medium">Ver dados recebidos</summary>
                    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(row.payload, null, 2)}</pre>
                  </details>
                  {row.error && <p className="text-sm text-red-700">Falha: {row.error}</p>}
                </div>

                {row.status === "pending_review" && (
                  <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
                    <button
                      type="button"
                      disabled={review.isPending}
                      onClick={() => review.mutate({ id: row.id, status: "approved" })}
                      className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-4 w-4" /> Aprovar
                    </button>
                    <button
                      type="button"
                      disabled={review.isPending}
                      onClick={() => review.mutate({ id: row.id, status: "rejected" })}
                      className="inline-flex items-center justify-center gap-2 rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      <XCircle className="h-4 w-4" /> Rejeitar
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="card-surface flex items-center gap-3 p-4">
      <div className="rounded-lg bg-muted p-2 text-foreground">{icon}</div>
      <div><p className="text-2xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>
    </div>
  );
}

function statusTone(status: QueueStatus): "sage" | "slate" | "brass" | "brick" {
  if (status === "executed" || status === "approved") return "sage";
  if (status === "pending_review") return "brass";
  if (status === "rejected") return "slate";
  return "brick";
}

function statusLabel(status: QueueStatus) {
  return ({ pending_review: "Aguardando revisão", approved: "Aprovada", rejected: "Rejeitada", executed: "Executada", failed: "Falhou" } as const)[status];
}

function sourceLabel(source: string) {
  return ({ whatsapp: "WhatsApp", gmail: "Gmail", booking: "Booking", n8n: "n8n", webchat: "Chat do site" } as Record<string, string>)[source] ?? source;
}

function actionLabel(action: string) {
  return ({
    qualify_lead: "Qualificar lead",
    check_availability: "Consultar disponibilidade",
    create_pre_reservation: "Criar pré-reserva",
    import_booking_reservation: "Importar reserva da Booking",
    request_cancellation: "Solicitação de cancelamento",
    request_change: "Solicitação de alteração",
    send_fnrh: "Enviar FNRH",
    send_checkin_reminder: "Enviar lembrete de check-in",
    send_checkout_reminder: "Enviar lembrete de check-out",
    request_review: "Solicitar avaliação",
    post_stay_followup: "Follow-up pós-estadia",
    recover_abandoned_reservation: "Recuperar reserva não concluída",
    handoff_human: "Encaminhar para atendimento humano",
    answer_question: "Responder pergunta do hóspede",
  } as Record<string, string>)[action] ?? action;
}
