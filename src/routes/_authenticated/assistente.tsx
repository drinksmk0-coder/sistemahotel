import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  Bot,
  CheckCircle2,
  MessageSquareWarning,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  useCompanyIntegrations,
  useCurrentCompany,
  useInsert,
  useSystemIssues,
  useUpdate,
} from "@/lib/data";
import { PageHeader } from "@/components/AppLayout";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Field } from "@/components/ui-kit";
import { fmtDate } from "@/lib/format";
import {
  DEFAULT_RECEPTION_AI_PROMPT,
  RECEPTION_AI_INTEGRATION_TYPE,
  receptionAiPrompt,
} from "@/lib/reception-ai";
import { useRole, useSession } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/assistente")({
  component: Assistente,
});

type AssistantMode = "analysis" | "reception";

const SUGGESTIONS: Record<AssistantMode, string[]> = {
  analysis: [
    "Por que a receita deste mês melhorou ou piorou?",
    "Quais canais trazem mais receita e quais devo priorizar?",
    "Analise ocupação, ADR, RevPAR, TRevPAR e GOPPAR.",
    "Quais despesas e reclamações exigem ação primeiro?",
  ],
  reception: [
    "Consulte a disponibilidade para o próximo fim de semana.",
    "Como devo responder a um pedido de reserva para duas pessoas?",
    "Prepare uma cobrança cordial de saldo pendente.",
    "Explique o sinal de 50% e o check-in online.",
  ],
};

function Assistente() {
  const { user } = useSession();
  const { data: role } = useRole(user);
  if (!role) {
    return (
      <section className="card-surface p-6 text-sm text-muted-foreground">
        Carregando as permissões do assistente…
      </section>
    );
  }
  if (role !== "dono" && role !== "recepcao") {
    return <Navigate to="/painel" />;
  }
  return <AssistenteWorkspace />;
}

function AssistenteWorkspace() {
  const currentCompany = useCurrentCompany();
  const { data: issues = [] } = useSystemIssues();
  const { data: integrations = [] } = useCompanyIntegrations();
  const insertIntegration = useInsert("company_integrations", ["company_integrations"]);
  const updateIntegration = useUpdate("company_integrations", ["company_integrations"]);
  const insertIssue = useInsert("system_issues", ["system_issues"]);
  const updateIssue = useUpdate("system_issues", ["system_issues"]);
  const [assistantMode, setAssistantMode] = useState<AssistantMode>("analysis");
  const [input, setInput] = useState("");
  const [receptionPrompt, setReceptionPrompt] = useState(DEFAULT_RECEPTION_AI_PROMPT);
  const [promptDirty, setPromptDirty] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<"baixa" | "media" | "alta" | "critica">("media");
  const receptionConfig = useMemo(() => receptionAiPrompt(integrations), [integrations]);

  useEffect(() => {
    if (!promptDirty) setReceptionPrompt(receptionConfig.instructions);
  }, [promptDirty, receptionConfig.instructions]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        headers: async () => {
          const { data } = await supabase.auth.getSession();
          const headers: Record<string, string> = {};
          if (data.session) {
            headers.Authorization = `Bearer ${data.session.access_token}`;
          }
          if (currentCompany.data?.id) {
            headers["x-company-id"] = currentCompany.data.id;
          }
          headers["x-assistant-mode"] = assistantMode;
          return headers;
        },
      }),
    [assistantMode, currentCompany.data?.id],
  );
  const { messages, sendMessage, status, error } = useChat({ transport });
  const busy = status === "submitted" || status === "streaming";
  const openIssues = issues.filter((issue) => issue.status !== "resolvido");
  const criticalIssues = openIssues.filter(
    (issue) => issue.severity === "critica" || issue.severity === "alta",
  );

  const submitMessage = (text: string) => {
    const clean = text.trim();
    if (!clean || busy) return;
    void sendMessage({ text: clean });
    setInput("");
  };

  const saveReceptionPrompt = () => {
    const instructions = receptionPrompt.trim();
    if (instructions.length < 80) {
      toast.error("Escreva instruções mais completas para a recepção virtual.");
      return;
    }
    const configuration = {
      ...(receptionConfig.integration?.configuracao ?? {}),
      instructions,
      updated_at: new Date().toISOString(),
    };
    const callbacks = {
      onSuccess: () => {
        setPromptDirty(false);
        toast.success("Treinamento da recepção virtual salvo para esta empresa.");
      },
      onError: (saveError: Error) => toast.error(saveError.message),
    };
    if (receptionConfig.integration) {
      updateIntegration.mutate(
        {
          id: receptionConfig.integration.id,
          patch: { configuracao: configuration, ativo: true },
        },
        callbacks,
      );
      return;
    }
    insertIntegration.mutate(
      {
        tipo: RECEPTION_AI_INTEGRATION_TYPE,
        nome: "Recepção Virtual com IA",
        ativo: true,
        configuracao: configuration,
        observacoes: "Instruções operacionais usadas pelo Gemini e pelo atendimento virtual.",
      },
      callbacks,
    );
  };

  return (
    <div className="flex min-h-0 flex-col">
      <PageHeader
        title="Assistente 24h"
        subtitle="Análises do hotel e recepção virtual."
      />

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatusCard icon={<ShieldCheck />} label="Monitor do navegador" value="Ativo" tone="sage" />
        <StatusCard
          icon={<MessageSquareWarning />}
          label="Incidentes abertos"
          value={String(openIssues.length)}
          tone="brass"
        />
        <StatusCard
          icon={<MessageSquareWarning />}
          label="Alta prioridade"
          value={String(criticalIssues.length)}
          tone="brick"
        />
        <StatusCard
          icon={<CheckCircle2 />}
          label="Resolvidos"
          value={String(issues.filter((issue) => issue.status === "resolvido").length)}
          tone="pine"
        />
      </div>

      <div className="grid min-h-0 gap-3 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.55fr)]">
        <section className="card-surface flex h-[calc(100dvh-13rem)] min-h-[30rem] max-h-[52rem] flex-col overflow-hidden">
          <div className="shrink-0 border-b border-border px-3 py-2.5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-bold text-pine-dark">
                <Bot className="h-5 w-5 text-primary" />
                {assistantMode === "analysis"
                  ? "HotelAI — analista estratégico"
                  : "HotelAI — recepção virtual"}
              </h2>
              <div
                className="inline-flex rounded-lg border border-border bg-muted p-0.5"
                aria-label="Modo do assistente"
              >
                <button
                  type="button"
                  className={`rounded-md px-2.5 py-1 text-[11px] font-bold ${
                    assistantMode === "analysis"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground"
                  }`}
                  onClick={() => setAssistantMode("analysis")}
                >
                  Analista
                </button>
                <button
                  type="button"
                  className={`rounded-md px-2.5 py-1 text-[11px] font-bold ${
                    assistantMode === "reception"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground"
                  }`}
                  onClick={() => setAssistantMode("reception")}
                >
                  Recepção virtual
                </button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {assistantMode === "analysis"
                ? "Usa dados agregados da empresa. Não envia nomes, CPF, telefone ou e-mail ao Gemini."
                : "Responde seguindo o treinamento do hotel e consulta disponibilidade sem enviar dados pessoais ao Gemini."}
            </p>
          </div>

          <Conversation className="min-h-0 flex-1">
            <ConversationContent className="px-3 py-3">
              {messages.length === 0 ? (
                <ConversationEmptyState
                  icon={<Bot className="h-8 w-8" />}
                  title="Como posso ajudar?"
                  description={
                    assistantMode === "analysis"
                      ? "Pergunte por que o hotel melhorou ou piorou e quais ações aumentam lucro, ocupação e satisfação."
                      : "Teste o atendimento antes de ativá-lo no WhatsApp e confira se as respostas seguem as regras do hotel."
                  }
                />
              ) : (
                messages.map((message) => (
                  <Message key={message.id} from={message.role}>
                    <MessageContent>
                      {message.parts.map((part, index) =>
                        part.type === "text" ? (
                          <MessageResponse key={`${message.id}-${index}`}>
                            {part.text}
                          </MessageResponse>
                        ) : null,
                      )}
                    </MessageContent>
                  </Message>
                ))
              )}
              {busy && (
                <Message from="assistant">
                  <MessageContent>
                    <span className="text-sm text-muted-foreground">Analisando…</span>
                  </MessageContent>
                </Message>
              )}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>

          <div className="flex shrink-0 gap-1.5 overflow-x-auto border-t border-border px-3 py-2">
            {SUGGESTIONS[assistantMode].map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => submitMessage(suggestion)}
                disabled={busy}
              >
                {suggestion}
              </button>
            ))}
          </div>

          {error && (
            <p className="mx-3 mt-2 shrink-0 rounded-md bg-brick-bg px-3 py-2 text-xs text-brick">
              {error.message || "Não foi possível consultar o assistente. Tente novamente."}
            </p>
          )}

          <form
            className="sticky bottom-0 z-10 flex shrink-0 gap-2 border-t border-border bg-card/95 p-3 backdrop-blur"
            onSubmit={(event) => {
              event.preventDefault();
              submitMessage(input);
            }}
          >
            <input
              className="field flex-1"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={
                assistantMode === "analysis"
                  ? "Ex.: por que a ocupação caiu e o que devo fazer?"
                  : "Ex.: quero reservar um quarto para duas pessoas…"
              }
              maxLength={2000}
            />
            <button type="submit" className="btn-primary" disabled={busy || !input.trim()}>
              <Send className="h-4 w-4" />
              <span className="sr-only">Enviar pergunta</span>
            </button>
          </form>
        </section>

        <div className="max-h-[calc(100dvh-13rem)] space-y-3 overflow-y-auto pr-1">
          <section className="card-surface p-3">
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="font-bold text-pine-dark">Treinamento da recepção virtual</h2>
            </div>
            <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
              Digite regras, preços, tom de voz, Pix, FNRH e procedimentos. Essas instruções ficam
              salvas para esta empresa e orientam as respostas da IA.
            </p>
            <textarea
              className="field min-h-[12rem] resize-y font-mono text-xs leading-relaxed"
              value={receptionPrompt}
              onChange={(event) => {
                setReceptionPrompt(event.target.value);
                setPromptDirty(true);
              }}
              maxLength={12_000}
              aria-label="Instruções da recepção virtual"
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-[10px] text-muted-foreground">
                {receptionPrompt.length.toLocaleString("pt-BR")} / 12.000 caracteres
              </span>
              <button
                type="button"
                className="btn-primary inline-flex items-center gap-1.5 text-xs"
                onClick={saveReceptionPrompt}
                disabled={
                  insertIntegration.isPending ||
                  updateIntegration.isPending ||
                  !promptDirty
                }
              >
                <Save className="h-3.5 w-3.5" />
                Salvar treinamento
              </button>
            </div>
          </section>

          <section className="card-surface p-4">
            <h2 className="font-bold text-pine-dark">Registrar problema</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Informe o que aconteceu. Erros técnicos do navegador também são capturados
              automaticamente.
            </p>
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (!title.trim()) return toast.error("Informe um título.");
                insertIssue.mutate(
                  {
                    title: title.trim(),
                    description: description.trim() || null,
                    severity,
                    status: "aberto",
                    source: "manual",
                    page_url: window.location.href,
                    context: {},
                  },
                  {
                    onSuccess: () => {
                      toast.success("Problema registrado para acompanhamento.");
                      setTitle("");
                      setDescription("");
                      setSeverity("media");
                    },
                    onError: (issueError: Error) => toast.error(issueError.message),
                  },
                );
              }}
            >
              <Field label="Título">
                <input
                  className="field"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={160}
                />
              </Field>
              <Field label="Descrição">
                <textarea
                  className="field min-h-20"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={1500}
                />
              </Field>
              <Field label="Prioridade">
                <select
                  className="field"
                  value={severity}
                  onChange={(event) => setSeverity(event.target.value as typeof severity)}
                >
                  <option value="baixa">Baixa</option>
                  <option value="media">Média</option>
                  <option value="alta">Alta</option>
                  <option value="critica">Crítica</option>
                </select>
              </Field>
              <button type="submit" className="btn-primary w-full" disabled={insertIssue.isPending}>
                Registrar incidente
              </button>
            </form>
          </section>

          <section className="card-surface overflow-hidden">
            <h2 className="border-b border-border px-4 py-3 font-bold text-pine-dark">
              Acompanhamento
            </h2>
            {issues.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">
                Nenhum incidente registrado.
              </p>
            ) : (
              <ul className="max-h-[26rem] divide-y divide-border/60 overflow-y-auto">
                {issues.slice(0, 30).map((issue) => (
                  <li key={issue.id} className="px-4 py-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{issue.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {issue.source} · {fmtDate(issue.last_seen_at)}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${issue.status === "resolvido" ? "bg-sage-bg text-pine-dark" : "bg-brick-bg text-brick"}`}
                      >
                        {issue.status}
                      </span>
                    </div>
                    {issue.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {issue.description}
                      </p>
                    )}
                    {issue.status !== "resolvido" && (
                      <button
                        type="button"
                        className="mt-2 text-xs font-bold text-pine"
                        onClick={() =>
                          updateIssue.mutate(
                            {
                              id: issue.id,
                              patch: {
                                status: "resolvido",
                                resolved_at: new Date().toISOString(),
                              },
                            },
                            {
                              onSuccess: () => toast.success("Incidente marcado como resolvido."),
                              onError: (issueError: Error) => toast.error(issueError.message),
                            },
                          )
                        }
                      >
                        Marcar como resolvido
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function StatusCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "pine" | "sage" | "brass" | "brick";
}) {
  const toneClass = {
    pine: "border-t-pine",
    sage: "border-t-sage",
    brass: "border-t-brass",
    brick: "border-t-brick",
  }[tone];
  return (
    <article className={`card-surface border-t-4 p-3 ${toneClass}`}>
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-[10px] font-bold uppercase">{label}</span>
      </div>
      <p className="mt-1 font-serif text-xl font-bold text-pine-dark">{value}</p>
    </article>
  );
}
