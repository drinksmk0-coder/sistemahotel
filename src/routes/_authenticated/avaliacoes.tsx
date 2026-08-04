import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Pencil, Save } from "lucide-react";
import { useFeedbacks, useUpdate, type Feedback } from "@/lib/data";
import { fmtDate, downloadExcel } from "@/lib/format";
import { PageHeader } from "@/components/AppLayout";
import { Stars, Badge, EmptyState, Modal, Field } from "@/components/ui-kit";
import { ExportPeriodButton, type ExportScope } from "@/components/ExportPeriodButton";

export const Route = createFileRoute("/_authenticated/avaliacoes")({ component: Avaliacoes });

const CRITERIA = [
  { key: "nota_geral", label: "Geral" },
  { key: "nota_limpeza", label: "Limpeza" },
  { key: "nota_conforto", label: "Conforto" },
  { key: "nota_atendimento", label: "Atendimento" },
  { key: "nota_wifi", label: "Wi-Fi" },
  { key: "nota_chuveiro", label: "Chuveiro" },
] as const;

type CriterionKey = (typeof CRITERIA)[number]["key"];

function Avaliacoes() {
  const { data: feedbacks = [] } = useFeedbacks();
  const updateFb = useUpdate("feedbacks", ["feedbacks"]);
  const [editing, setEditing] = useState<Feedback | null>(null);
  const [quartoFiltro, setQuartoFiltro] = useState("");
  const [busca, setBusca] = useState("");

  const quartos = useMemo(
    () => Array.from(new Set(feedbacks.map((f) => f.quarto).filter((q): q is number => q != null))).sort((a, b) => a - b),
    [feedbacks],
  );

  const filtrados = useMemo(() => {
    const term = busca.trim().toLowerCase();
    return feedbacks.filter((feedback) => {
      if (quartoFiltro && String(feedback.quarto) !== quartoFiltro) return false;
      if (!term) return true;
      return [feedback.hospede_nome, feedback.comentario, feedback.sugestao, feedback.quarto]
        .some((value) => String(value ?? "").toLowerCase().includes(term));
    });
  }, [feedbacks, quartoFiltro, busca]);

  const averages = useMemo(() => CRITERIA.map((criterion) => {
    const values = filtrados.map((feedback) => feedback[criterion.key]).filter((value): value is number => value != null);
    return { ...criterion, avg: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0 };
  }), [filtrados]);

  const recommended = filtrados.filter((feedback) => feedback.recomendaria).length;
  const recommendationRate = filtrados.length ? Math.round((recommended / filtrados.length) * 100) : 0;

  function exportFeedbacks(scope: ExportScope) {
    const rows = scope.mode === "date"
      ? filtrados.filter((feedback) => feedback.created_at.slice(0, 10) === scope.date)
      : filtrados;
    const suffix = scope.mode === "date" ? scope.date : "historico-completo";
    downloadExcel(`avaliacoes-${suffix}.xls`, [
      ["Data", "Hóspede", "Quarto", "Geral", "Limpeza", "Conforto", "Atendimento", "Wi-Fi", "Chuveiro", "Recomenda", "Comentário", "Sugestão"],
      ...rows.map((feedback) => [
        feedback.created_at.slice(0, 10), feedback.hospede_nome, feedback.quarto,
        feedback.nota_geral, feedback.nota_limpeza, feedback.nota_conforto,
        feedback.nota_atendimento, feedback.nota_wifi, feedback.nota_chuveiro,
        feedback.recomendaria ? "sim" : "não", feedback.comentario, feedback.sugestao,
      ]),
    ]);
  }

  return (
    <div>
      <PageHeader
        title="Avaliações dos hóspedes"
        subtitle="Histórico completo com todas as notas respondidas por cada hóspede."
        action={<ExportPeriodButton onExport={exportFeedbacks} />}
      />

      <section className="mb-4 flex flex-wrap gap-2 rounded-xl border border-border bg-card p-3 shadow-sm">
        <input
          className="field min-w-[240px] flex-1"
          value={busca}
          onChange={(event) => setBusca(event.target.value)}
          placeholder="Pesquisar hóspede, comentário ou quarto"
        />
        <select className="field w-auto min-w-[170px]" value={quartoFiltro} onChange={(event) => setQuartoFiltro(event.target.value)}>
          <option value="">Todos os quartos</option>
          {quartos.map((quarto) => <option key={quarto} value={quarto}>Quarto {quarto}</option>)}
        </select>
      </section>

      <div className="mb-5 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
        <div className="stat-card"><p className="text-xs uppercase text-muted-foreground">Avaliações</p><p className="font-serif text-2xl font-bold">{filtrados.length}</p></div>
        <div className="stat-card"><p className="text-xs uppercase text-muted-foreground">Recomendariam</p><p className="font-serif text-2xl font-bold">{recommendationRate}%</p></div>
        {averages.map((item) => <div key={item.key} className="stat-card"><p className="text-xs uppercase text-muted-foreground">{item.label}</p><p className="font-serif text-2xl font-bold">{item.avg ? item.avg.toFixed(1) : "—"}</p></div>)}
      </div>

      {filtrados.length === 0 ? <EmptyState text="Nenhuma avaliação encontrada." /> : (
        <div className="space-y-3">
          {filtrados.map((feedback) => (
            <article key={feedback.id} className="card-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>{feedback.hospede_nome ?? "Anônimo"}</strong>
                    {feedback.quarto != null && <Badge tone="slate">Quarto {feedback.quarto}</Badge>}
                    <Stars value={feedback.nota_geral} />
                    {feedback.recomendaria != null && <Badge tone={feedback.recomendaria ? "sage" : "brick"}>{feedback.recomendaria ? "Recomenda" : "Não recomenda"}</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Recebida em {fmtDate(feedback.created_at)}</p>
                </div>
                <button className="btn-ghost flex items-center gap-1.5 py-1.5 text-xs" onClick={() => setEditing(feedback)}><Pencil className="h-3.5 w-3.5" /> Editar</button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {CRITERIA.map((criterion) => <ScoreBox key={criterion.key} label={criterion.label} value={feedback[criterion.key]} />)}
              </div>

              {feedback.wifi_problema && <p className="mt-3 rounded-lg bg-brick-bg px-3 py-2 text-sm text-brick">Problema de Wi-Fi{feedback.wifi_dispositivo ? ` no dispositivo ${feedback.wifi_dispositivo}` : ""}.</p>}
              {feedback.comentario && <p className="mt-3 text-sm"><strong>Comentário:</strong> {feedback.comentario}</p>}
              {feedback.sugestao && <p className="mt-2 rounded-lg bg-sage-bg/60 px-3 py-2 text-sm text-pine-dark"><strong>Sugestão:</strong> {feedback.sugestao}</p>}
            </article>
          ))}
        </div>
      )}

      {editing && <EditFeedbackModal feedback={editing} saving={updateFb.isPending} onClose={() => setEditing(null)} onSave={(patch) => updateFb.mutate({ id: editing.id, patch }, { onSuccess: () => setEditing(null) })} />}
    </div>
  );
}

function ScoreBox({ label, value }: { label: string; value: number | null }) {
  return <div className="rounded-lg border border-border bg-muted/35 p-2.5"><p className="text-[10px] font-bold uppercase text-muted-foreground">{label}</p><div className="mt-1 flex items-end gap-1"><strong className="text-xl">{value ?? "—"}</strong>{value != null && <span className="pb-0.5 text-xs text-muted-foreground">/5</span>}</div></div>;
}

function EditFeedbackModal({ feedback, saving, onClose, onSave }: { feedback: Feedback; saving: boolean; onClose: () => void; onSave: (patch: Partial<Feedback>) => void }) {
  const [form, setForm] = useState<Feedback>(feedback);
  function set<K extends keyof Feedback>(key: K, value: Feedback[K]) { setForm((current) => ({ ...current, [key]: value })); }
  return (
    <Modal open onClose={onClose} title="Editar avaliação">
      <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); onSave({ hospede_nome: form.hospede_nome, quarto: form.quarto, nota_geral: form.nota_geral, nota_limpeza: form.nota_limpeza, nota_conforto: form.nota_conforto, nota_atendimento: form.nota_atendimento, nota_wifi: form.nota_wifi, nota_chuveiro: form.nota_chuveiro, recomendaria: form.recomendaria, comentario: form.comentario, sugestao: form.sugestao }); }}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Hóspede"><input className="field" value={form.hospede_nome ?? ""} onChange={(event) => set("hospede_nome", event.target.value)} /></Field>
          <Field label="Quarto"><input type="number" className="field" value={form.quarto ?? ""} onChange={(event) => set("quarto", event.target.value ? Number(event.target.value) : null)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {CRITERIA.map((criterion) => <Field key={criterion.key} label={criterion.label}><select className="field" value={form[criterion.key] ?? ""} onChange={(event) => set(criterion.key as CriterionKey, event.target.value ? Number(event.target.value) as never : null as never)}><option value="">—</option>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}</select></Field>)}
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.recomendaria} onChange={(event) => set("recomendaria", event.target.checked)} /> Recomendaria o hotel</label>
        <Field label="Comentário"><textarea className="field min-h-[72px]" value={form.comentario ?? ""} onChange={(event) => set("comentario", event.target.value)} /></Field>
        <Field label="Sugestão"><textarea className="field min-h-[72px]" value={form.sugestao ?? ""} onChange={(event) => set("sugestao", event.target.value)} /></Field>
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button type="submit" className="btn-primary flex items-center gap-1.5" disabled={saving}><Save className="h-4 w-4" />{saving ? "Salvando..." : "Salvar"}</button></div>
      </form>
    </Modal>
  );
}
