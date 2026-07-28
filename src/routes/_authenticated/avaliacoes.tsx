import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Pencil, Trash2, Save } from "lucide-react";
import { useFeedbacks, useUpdate, useDelete, type Feedback } from "@/lib/data";
import { fmtDate, todayISO, downloadExcel } from "@/lib/format";
import { PageHeader } from "@/components/AppLayout";
import { Stars, Badge, EmptyState, Modal, Field } from "@/components/ui-kit";
import { ExportPeriodButton, type ExportScope } from "@/components/ExportPeriodButton";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const Route = createFileRoute("/_authenticated/avaliacoes")({
  component: Avaliacoes,
});

const CRITERIA = [
  { key: "nota_geral", label: "Geral" },
  { key: "nota_atendimento", label: "Funcionários" },
  { key: "nota_chuveiro", label: "Comodidades" },
  { key: "nota_limpeza", label: "Limpeza" },
  { key: "nota_conforto", label: "Conforto" },
  { key: "nota_wifi", label: "Wi-Fi gratuito" },
] as const;

function Avaliacoes() {
  const { data: feedbacks = [] } = useFeedbacks();
  const updateFb = useUpdate("feedbacks", ["feedbacks"]);
  const deleteFb = useDelete("feedbacks", ["feedbacks"]);
  const [editing, setEditing] = useState<Feedback | null>(null);
  const [quartoFiltro, setQuartoFiltro] = useState<string>("");

  const quartos = useMemo(
    () =>
      Array.from(new Set(feedbacks.map((f) => f.quarto).filter((q): q is number => q != null))).sort(
        (a, b) => a - b,
      ),
    [feedbacks],
  );

  const filtrados = useMemo(
    () => (quartoFiltro ? feedbacks.filter((f) => String(f.quarto) === quartoFiltro) : feedbacks),
    [feedbacks, quartoFiltro],
  );

  const averages = useMemo(() => {
    return CRITERIA.map((c) => {
      const vals = filtrados.map((f) => f[c.key]).filter((v): v is number => v != null);
      const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      return { ...c, avg, count: vals.length };
    });
  }, [filtrados]);

  const recomendam = filtrados.filter((f) => f.recomendaria);
  const nps = filtrados.length ? Math.round((recomendam.length / filtrados.length) * 100) : 0;
  const overall = averages.find((item) => item.key === "nota_geral")?.avg ?? 0;
  const displayScore = overall ? (overall * 2).toFixed(1).replace(".", ",") : "—";
  const scoreLabel = overall >= 4.5 ? "Excepcional" : overall >= 4 ? "Fabuloso" : overall >= 3 ? "Muito bom" : overall ? "Em evolução" : "Sem avaliações";
  const positiveComments = filtrados
    .filter((feedback) => Number(feedback.nota_geral ?? 0) >= 4 && feedback.comentario)
    .slice(0, 3);
  const trend = useMemo(() => {
    const monthly = new Map<string, { total: number; count: number }>();
    filtrados.forEach((feedback) => {
      if (feedback.nota_geral == null) return;
      const month = feedback.created_at.slice(0, 7);
      const current = monthly.get(month) ?? { total: 0, count: 0 };
      current.total += Number(feedback.nota_geral);
      current.count += 1;
      monthly.set(month, current);
    });
    return [...monthly.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([month, item]) => ({
        mes: `${month.slice(5)}/${month.slice(2, 4)}`,
        media: Number((item.total / item.count).toFixed(2)),
      }));
  }, [filtrados]);

  function exportCSV(scope: ExportScope) {
    const exportedFeedbacks =
      scope.mode === "date"
        ? filtrados.filter((feedback) => feedback.created_at.slice(0, 10) === scope.date)
        : filtrados;
    const suffix = scope.mode === "date" ? scope.date : "historico-completo";
    downloadExcel(`avaliacoes-${suffix}.xls`, [
      ["Data", "Hóspede", "Quarto", "Geral", "Limpeza", "Conforto", "Atendimento", "WiFi", "Chuveiro", "Recomenda", "Comentário", "Sugestão"],
      ...exportedFeedbacks.map((f) => [
        f.created_at.slice(0, 10),
        f.hospede_nome,
        f.quarto,
        f.nota_geral,
        f.nota_limpeza,
        f.nota_conforto,
        f.nota_atendimento,
        f.nota_wifi,
        f.nota_chuveiro,
        f.recomendaria ? "sim" : "não",
        f.comentario,
        f.sugestao,
      ]),
    ]);
  }

  function cancelar(f: Feedback) {
    if (confirm(`Cancelar (excluir) a avaliação de ${f.hospede_nome ?? "Anônimo"}? Esta ação não pode ser desfeita.`)) {
      deleteFb.mutate(f.id);
    }
  }

  return (
    <div>
      <PageHeader
        title="Avaliações dos hóspedes"
        subtitle="Respostas recebidas pelo QR code dos quartos e pelo formulário impresso."
        action={
          <div className="flex items-center gap-2">
            <select
              value={quartoFiltro}
              onChange={(e) => setQuartoFiltro(e.target.value)}
              className="field h-9 py-0 text-sm"
            >
              <option value="">Todos os quartos</option>
              {quartos.map((q) => (
                <option key={q} value={String(q)}>
                  Quarto {q}
                </option>
              ))}
            </select>
            <ExportPeriodButton onExport={exportCSV} />
          </div>
        }
      />

      <section className="mb-5 overflow-hidden rounded-xl border border-pine/20 bg-[linear-gradient(135deg,var(--pine-dark),var(--pine))] p-4 text-white shadow-md">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-brass">Avaliações de hóspedes</p>
            <h3 className="mt-1 font-serif text-2xl font-bold">{scoreLabel}</h3>
            <p className="text-sm text-white/75">{filtrados.length} avaliação(ões) recebida(s)</p>
          </div>
          <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-brass font-serif text-3xl font-bold text-pine-dark">
            {displayScore}
          </div>
        </div>
      </section>

      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <div className="stat-card">
          <p className="text-xs uppercase text-muted-foreground">Recomendariam</p>
          <p className="font-serif text-2xl font-bold">{nps}%</p>
          <p className="text-[11px] text-muted-foreground">{filtrados.length} respostas</p>
        </div>
        {averages.map((a) => (
          <div key={a.key} className="stat-card">
            <p className="text-xs uppercase text-muted-foreground">{a.label}</p>
            <p className="font-serif text-2xl font-bold">{a.avg ? a.avg.toFixed(1) : "—"}</p>
            <Stars value={a.avg} />
          </div>
        ))}
      </div>

      {filtrados.length > 0 && (
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          <section className="card-surface p-4">
            <h3 className="font-serif text-lg font-bold">Notas por categoria</h3>
            <p className="text-xs text-muted-foreground">
              Rótulos mostram onde a experiência precisa melhorar.
            </p>
            <div className="mt-3 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={averages} margin={{ top: 18, right: 10, bottom: 28 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    angle={-18}
                    textAnchor="end"
                    interval={0}
                    height={55}
                  />
                  <YAxis domain={[0, 5]} />
                  <Tooltip formatter={(value) => Number(value).toFixed(1)} />
                  <Legend />
                  <Bar
                    dataKey="avg"
                    name="Nota média (0–5)"
                    fill="var(--pine)"
                    radius={[5, 5, 0, 0]}
                  >
                    <LabelList
                      dataKey="avg"
                      position="top"
                      formatter={(value: number) => value.toFixed(1)}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className="card-surface p-4">
            <h3 className="font-serif text-lg font-bold">Evolução da satisfação</h3>
            <p className="text-xs text-muted-foreground">
              Média geral ao longo do tempo para identificar melhora ou queda.
            </p>
            <div className="mt-3 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 18, right: 18 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" />
                  <YAxis domain={[0, 5]} />
                  <Tooltip formatter={(value) => Number(value).toFixed(1)} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="media"
                    name="Nota média"
                    stroke="var(--brass)"
                    strokeWidth={3}
                    dot={{ r: 4 }}
                  >
                    <LabelList
                      dataKey="media"
                      position="top"
                      formatter={(value: number) => value.toFixed(1)}
                    />
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>
      )}

      {positiveComments.length > 0 && (
        <section className="mb-6 rounded-xl border border-border bg-card p-4 shadow-sm">
          <h3 className="font-serif text-lg font-bold text-pine-dark">Veja o que os hóspedes mais gostaram</h3>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {positiveComments.map((feedback) => (
              <blockquote key={feedback.id} className="rounded-lg bg-sage-bg/60 p-3 text-sm text-pine-dark">
                “{feedback.comentario}”
                <footer className="mt-2 text-xs font-semibold text-muted-foreground">
                  {feedback.hospede_nome ?? "Hóspede"}{feedback.quarto ? ` · Quarto ${feedback.quarto}` : ""}
                </footer>
              </blockquote>
            ))}
          </div>
        </section>
      )}

      {filtrados.length === 0 ? (
        <EmptyState text="Nenhuma avaliação recebida ainda. Divulgue o QR code nos quartos!" />
      ) : (
        <div className="space-y-3">
          {filtrados.map((f) => (
            <div key={f.id} className="card-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{f.hospede_nome ?? "Anônimo"}</span>
                  {f.quarto && <Badge tone="slate">Quarto {f.quarto}</Badge>}
                  <Stars value={f.nota_geral} />
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  {f.recomendaria != null && (
                    <Badge tone={f.recomendaria ? "sage" : "brick"}>
                      {f.recomendaria ? "Recomenda" : "Não recomenda"}
                    </Badge>
                  )}
                  {fmtDate(f.created_at)}
                  <button
                    onClick={() => setEditing(f)}
                    className="rounded-md p-1 hover:bg-muted"
                    title="Editar avaliação"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => cancelar(f)}
                    className="rounded-md p-1 text-brick hover:bg-muted"
                    title="Cancelar avaliação"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {f.wifi_problema && (
                <p className="mt-2 text-xs text-brick">
                  ⚠ Relatou problema de Wi-Fi{f.wifi_dispositivo ? ` (aparelho: ${f.wifi_dispositivo})` : ""}
                </p>
              )}
              {f.comentario && <p className="mt-2 text-sm">{f.comentario}</p>}
              {f.sugestao && (
                <p className="mt-2 rounded-lg bg-sage-bg/50 px-3 py-2 text-sm text-pine-dark">
                  💡 Sugestão: {f.sugestao}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <EditFeedbackModal
          feedback={editing}
          saving={updateFb.isPending}
          onClose={() => setEditing(null)}
          onSave={(patch) =>
            updateFb.mutate(
              { id: editing.id, patch },
              { onSuccess: () => setEditing(null) },
            )
          }
        />
      )}
    </div>
  );
}

function EditFeedbackModal({
  feedback,
  saving,
  onClose,
  onSave,
}: {
  feedback: Feedback;
  saving: boolean;
  onClose: () => void;
  onSave: (patch: Partial<Feedback>) => void;
}) {
  const [form, setForm] = useState<Feedback>(feedback);

  function set<K extends keyof Feedback>(key: K, value: Feedback[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function nota(value: number | null) {
    return value == null ? "" : String(value);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      hospede_nome: form.hospede_nome,
      quarto: form.quarto,
      nota_geral: form.nota_geral,
      nota_limpeza: form.nota_limpeza,
      nota_conforto: form.nota_conforto,
      nota_atendimento: form.nota_atendimento,
      nota_wifi: form.nota_wifi,
      nota_chuveiro: form.nota_chuveiro,
      recomendaria: form.recomendaria,
      comentario: form.comentario,
      sugestao: form.sugestao,
    });
  }

  return (
    <Modal open onClose={onClose} title="Editar avaliação">
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Hóspede">
            <input
              className="field"
              value={form.hospede_nome ?? ""}
              onChange={(e) => set("hospede_nome", e.target.value)}
            />
          </Field>
          <Field label="Quarto">
            <input
              type="number"
              className="field"
              value={form.quarto ?? ""}
              onChange={(e) => set("quarto", e.target.value ? Number(e.target.value) : null)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {CRITERIA.map((c) => (
            <Field key={c.key} label={c.label}>
              <select
                className="field"
                value={nota(form[c.key])}
                onChange={(e) =>
                  set(c.key, e.target.value ? Number(e.target.value) : (null as never))
                }
              >
                <option value="">—</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </Field>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!form.recomendaria}
            onChange={(e) => set("recomendaria", e.target.checked)}
          />
          Recomendaria o hotel
        </label>

        <Field label="Comentário">
          <textarea
            className="field min-h-[70px]"
            value={form.comentario ?? ""}
            onChange={(e) => set("comentario", e.target.value)}
          />
        </Field>
        <Field label="Sugestão">
          <textarea
            className="field min-h-[70px]"
            value={form.sugestao ?? ""}
            onChange={(e) => set("sugestao", e.target.value)}
          />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost">
            Voltar
          </button>
          <button type="submit" disabled={saving} className="btn-primary flex items-center gap-1.5">
            <Save className="h-4 w-4" /> {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
