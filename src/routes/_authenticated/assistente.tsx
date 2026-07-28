import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Bot, CheckCircle2, MessageSquareWarning, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany, useInsert, useSystemIssues, useUpdate } from "@/lib/data";
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

export const Route = createFileRoute("/_authenticated/assistente")({
  component: Assistente,
});

const SUGGESTIONS = [
  "Por que a receita deste mês melhorou ou piorou?",
  "Quais canais trazem mais receita e quais devo priorizar?",
  "Analise ocupação, ADR, RevPAR, TRevPAR e GOPPAR.",
  "Quais despesas e reclamações exigem ação primeiro?",
];

function Assistente() {
  const currentCompany = useCurrentCompany();
  const { data: issues = [] } = useSystemIssues();
  const insertIssue = useInsert("system_issues", ["system_issues"]);
  const updateIssue = useUpdate("system_issues", ["system_issues"]);
  const [input, setInput] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<"baixa" | "media" | "alta" | "critica">("media");

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
          return headers;
        },
      }),
    [currentCompany.data?.id],
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

  return (
    <div>
      <PageHeader
        title="Assistente e Central 24h"
        subtitle="Tire dúvidas sobre o sistema e acompanhe falhas registradas automaticamente ou pela equipe."
      />

      <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
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

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <section className="card-surface flex min-h-[34rem] flex-col overflow-hidden">
          <div className="border-b border-border px-4 py-3">
            <h2 className="flex items-center gap-2 font-bold text-pine-dark">
              <Bot className="h-5 w-5 text-brass" />
              HotelAI — analista estratégico do hotel
            </h2>
            <p className="text-xs text-muted-foreground">
              Usa dados agregados da empresa. Não envia nomes, CPF, telefone ou e-mail ao Gemini.
            </p>
          </div>

          <Conversation className="h-[25rem]">
            <ConversationContent>
              {messages.length === 0 ? (
                <ConversationEmptyState
                  icon={<Bot className="h-8 w-8" />}
                  title="Como posso ajudar?"
                  description="Pergunte por que o hotel melhorou ou piorou e quais ações aumentam lucro, ocupação e satisfação."
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

          <div className="flex flex-wrap gap-1.5 border-t border-border px-3 py-2">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => submitMessage(suggestion)}
                disabled={busy}
              >
                {suggestion}
              </button>
            ))}
          </div>

          {error && (
            <p className="mx-3 mt-2 rounded-md bg-brick-bg px-3 py-2 text-xs text-brick">
              Não foi possível consultar o Gemini. Confirme o segredo GEMINI_API_KEY no Supabase.
            </p>
          )}

          <form
            className="flex gap-2 border-t border-border p-3"
            onSubmit={(event) => {
              event.preventDefault();
              submitMessage(input);
            }}
          >
            <input
              className="field flex-1"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ex.: por que a ocupação caiu e o que devo fazer?"
              maxLength={2000}
            />
            <button type="submit" className="btn-primary" disabled={busy || !input.trim()}>
              <Send className="h-4 w-4" />
              <span className="sr-only">Enviar pergunta</span>
            </button>
          </form>
        </section>

        <div className="space-y-4">
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
