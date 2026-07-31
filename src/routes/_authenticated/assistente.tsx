import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  Bot,
  Brain,
  CheckCircle2,
  Copy,
  Droplets,
  MessageSquareWarning,
  Printer,
  Save,
  Send,
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
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
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
    "Gere o relatório de consumo de água deste mês.",
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
  const { user } = useSession();
  const { data: workspaceRole } = useRole(user);
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
        toast.success("Instruções da recepção virtual salvas para esta empresa.");
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
        subtitle="Análises do hotel, relatórios e recepção virtual."
        action={
          workspaceRole === "dono" ? (
            <div className="flex flex-wrap gap-2">
              <Link
                to="/memoria-ia"
                className="btn-ghost inline-flex items-center gap-1.5 text-xs"
              >
                <Brain className="h-4 w-4" /> Memória
              </Link>
              <Link
                to="/relatorio-consumo-agua"
                className="btn-ghost inline-flex items-center gap-1.5 text-xs"
              >
                <Droplets className="h-4 w-4" /> Relatório de água
              </Link>
            </div>
          ) : undefined
        }
      />

      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
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

      <div className="grid min-h-0 items-start gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(20rem,0.6fr)]">
        <section className="card-surface flex h-[clamp(34rem,72dvh,48rem)] min-h-0 flex-col overflow-hidden">
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
                ? "Usa dados agregados e a memória ativa da empresa. Dados atuais sempre prevalecem."
                : "Mantém o contexto da conversa sem consultar nem expor dados pessoais de outros hóspedes."}
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
                      ? "Pergunte por resultados, pendências, consumo de água ou ações para melhorar o hotel."
                      : "Teste o atendimento antes de ativá-lo no WhatsApp e confira se as respostas seguem as regras do hotel."
                  }
                />
              ) : (
                messages.map((message) => (
                  <Message key={message.id} from={message.role}>
                    <MessageContent>
                      {message.parts.map((part, index) =>
                        part.type === "text" ? (
                          <div key={`${message.id}-${index}`} className="select-text">
                            <MessageResponse className="select-text">
                              {part.text}
                            </MessageResponse>
                            {message.role === "assistant" && (
                              <MessageActions className="mt-1">
                                <MessageAction
                                  tooltip="Copiar resposta"
                                  label="Copiar resposta"
                                  className="h-8 w-8"
                                  onClick={() => {
                                    void navigator.clipboard.writeText(part.text).then(
                                      () => toast.success("Resposta copiada."),
                                      () => toast.error("Não foi possível copiar a resposta."),
                                    );
                                  }}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </MessageAction>
                                <MessageAction
                                  tooltip="Imprimir resposta como relatório"
                                  label="Imprimir resposta"
                                  className="h-8 w-8"
                                  onClick={() => printHotelAiAnswer(part.text)}
                                >
                                  <Printer className="h-3.5 w-3.5" />
                                </MessageAction>
                              </MessageActions>
                            )}
                          </div>
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

          <div className="flex shrink-0 flex-wrap gap-1.5 border-t border-border px-3 py-2">
            {SUGGESTIONS[assistantMode].map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
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
                  ? "Ex.: gere o relatório de água deste mês…"
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

        <div className="space-y-3">
          <section className="card-surface p-3">
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="font-bold text-pine-dark">Instruções da recepção virtual</h2>
            </div>
            <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
              Digite regras, preços, tom de voz, Pix, FNRH e procedimentos. Essas instruções ficam
              salvas para esta empresa e orientam as respostas da recepção virtual.
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
                Salvar instruções
              </button>
            </div>
          </section>

          <details className="card-surface group p-4">
            <summary className="cursor-pointer list-none font-bold text-pine-dark">
              Registrar problema
              <span className="float-right text-xs text-muted-foreground group-open:hidden">
                Abrir
              </span>
            </summary>
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
          </details>

          <details className="card-surface group overflow-hidden">
            <summary className="cursor-pointer list-none border-b border-border px-4 py-3 font-bold text-pine-dark">
              Acompanhamento
              <span className="float-right text-xs text-muted-foreground group-open:hidden">
                {issues.length} registro(s)
              </span>
            </summary>
            {issues.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">
                Nenhum incidente registrado.
              </p>
            ) : (
              <ul className="divide-y divide-border/60">
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
          </details>
        </div>
      </div>
    </div>
  );
}

function printHotelAiAnswer(text: string) {
  const popup = window.open("", "_blank", "width=900,height=760");
  if (!popup) {
    toast.error("O navegador bloqueou a janela de impressão.");
    return;
  }
  popup.opener = null;
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br />");
  popup.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Relatório do HotelAI</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 32px; color: #1f2937; line-height: 1.55; }
    header { border-bottom: 2px solid #24453a; margin-bottom: 22px; padding-bottom: 12px; }
    h1 { font-size: 22px; margin: 0; }
    .meta { color: #6b7280; font-size: 12px; margin-top: 5px; }
    main { font-size: 14px; white-space: normal; }
    footer { border-top: 1px solid #d1d5db; color: #6b7280; font-size: 10px; margin-top: 28px; padding-top: 10px; }
    @media print { body { margin: 16mm; } }
  </style>
</head>
<body>
  <header>
    <h1>Relatório do HotelAI</h1>
    <div class="meta">Emitido em ${new Date().toLocaleString("pt-BR")}</div>
  </header>
  <main>${escaped}</main>
  <footer>Relatório gerencial gerado pelo sistema. Confira os lançamentos originais antes de decisões financeiras.</footer>
</body>
</html>`);
  popup.document.close();
  popup.focus();
  window.setTimeout(() => popup.print(), 250);
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
