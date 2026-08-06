import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { MessageCircle, Plus } from "lucide-react";
import { useRooms, useComplaints, useCurrentCompany, useInsert, useUpdate } from "@/lib/data";
import { fmtDate, todayISO, downloadExcel } from "@/lib/format";
import { COMPLAINT_CATEGORIES, COMPLAINT_SEVERITY, COMPLAINT_STATUS, WIFI_DEVICES, complaintLabel, complaintSeverityLabel, complaintStatusLabel } from "@/lib/constants";
import { PageHeader } from "@/components/AppLayout";
import { Modal, Field, Badge, EmptyState } from "@/components/ui-kit";
import { ExportPeriodButton, type ExportScope } from "@/components/ExportPeriodButton";

export const Route = createFileRoute("/_authenticated/reclamacoes")({
  component: Reclamacoes,
});

const sevTone: Record<string, string> = { baixa: "sage", media: "brass", alta: "brick" };
const STOP_WORDS = new Set([
  "para", "com", "uma", "que", "não", "nao", "dos", "das", "por", "sem", "está",
  "esta", "muito", "mais", "foi", "tem", "de", "da", "do", "no", "na", "em",
  "solicitado", "solicitada", "relatado", "relatada", "avaliacao", "hospede",
  "quarto", "problema", "cliente", "informou", "pedido", "reclamacao",
]);

function Reclamacoes() {
  const { data: rooms = [] } = useRooms();
  const { data: complaints = [] } = useComplaints();
  const currentCompany = useCurrentCompany();
  const insert = useInsert("complaints", ["complaints"]);
  const update = useUpdate("complaints", ["complaints"]);
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState("todas");
  const [statusFilter, setStatusFilter] = useState("abertas");

  const filtered = useMemo(
    () =>
      complaints.filter((c) => {
        if (cat !== "todas" && c.categoria !== cat) return false;
        if (statusFilter === "abertas") return c.status !== "resolvido";
        if (statusFilter === "todas") return true;
        return c.status === statusFilter;
      }),
    [complaints, cat, statusFilter],
  );
  const frequentWords = useMemo(() => {
    const counts = new Map<string, number>();
    filtered.forEach((complaint) => {
      normalizeWords(complaint.descricao ?? "").forEach((word) =>
        counts.set(word, (counts.get(word) ?? 0) + 1),
      );
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([palavra, ocorrencias]) => ({ palavra, ocorrencias }));
  }, [filtered]);
  const categoryHeat = useMemo(
    () =>
      COMPLAINT_CATEGORIES.map((category) => ({
        label: category.label,
        values: ["baixa", "media", "alta"].map(
          (severity) =>
            filtered.filter(
              (complaint) =>
                complaint.categoria === category.value && complaint.gravidade === severity,
            ).length,
        ),
      })).filter((row) => row.values.some(Boolean)),
    [filtered],
  );

  function exportCSV(scope: ExportScope) {
    const exportedComplaints =
      scope.mode === "date"
        ? complaints.filter((complaint) => complaint.created_at.slice(0, 10) === scope.date)
        : complaints;
    const suffix = scope.mode === "date" ? scope.date : "historico-completo";
    downloadExcel(`reclamacoes-${suffix}.xls`, [
      ["Data", "Quarto", "Categoria", "Gravidade", "Origem", "Aparelho", "Hóspede", "Status", "Descrição"],
      ...exportedComplaints.map((c) => [
        c.created_at.slice(0, 10),
        c.quarto,
        complaintLabel(c.categoria),
        c.gravidade,
        c.origem,
        c.dispositivo,
        c.hospede_nome,
        c.status,
        c.descricao,
      ]),
    ]);
  }

  return (
    <div>
      <PageHeader
        title="Ocorrências e reclamações"
        subtitle="Notas 1 e 2 geram ocorrências automáticas; nota 3 permanece neutra para acompanhamento de tendência."
        action={
          <div className="flex gap-2">
            <ExportPeriodButton onExport={exportCSV} />
            <button onClick={() => setOpen(true)} className="btn-primary flex items-center gap-1.5">
              <Plus className="h-4 w-4" /> Nova reclamação
            </button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select className="field max-w-xs" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="todas">Todas as categorias</option>
          {COMPLAINT_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <select className="field max-w-xs" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="abertas">Não resolvidas</option>
          {COMPLAINT_STATUS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
          <option value="todas">Todos os status</option>
        </select>
      </div>

      {filtered.length > 0 && frequentWords.length > 0 && (
        <section className="card-surface mb-4 p-3">
          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <div>
              <h3 className="text-sm font-extrabold text-pine-dark">Assuntos recorrentes</h3>
              <p className="text-[10px] text-muted-foreground">
                Tamanho e intensidade mostram as causas mais repetidas.
              </p>
              <ComplaintWordHeatmap rows={frequentWords} />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-pine-dark">Mapa de risco</h3>
              <p className="text-[10px] text-muted-foreground">
                Concentração das reclamações por assunto e nível de urgência.
              </p>
              <ComplaintSeverityHeatmap rows={categoryHeat} />
            </div>
          </div>
        </section>
      )}

      {filtered.length === 0 ? (
        <EmptyState text="Nenhuma reclamação neste filtro." />
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <div key={c.id} className="card-surface flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-serif text-base font-bold">
                    {c.quarto ? `Quarto ${c.quarto}` : "Sem quarto"}
                  </span>
                  <Badge tone="slate">{complaintLabel(c.categoria)}</Badge>
                  <Badge tone={sevTone[c.gravidade]}>{complaintSeverityLabel(c.gravidade)}</Badge>
                  <Badge tone={c.origem === "qrcode" ? "brass" : "sage"}>{c.origem}</Badge>
                  <Badge tone={c.status === "resolvido" ? "sage" : c.status === "em_andamento" ? "brass" : "brick"}>
                    {complaintStatusLabel(c.status)}
                  </Badge>
                </div>
                {c.descricao && <p className="mt-1 text-sm text-muted-foreground">{c.descricao}</p>}
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {fmtDate(c.created_at)}
                  {c.dispositivo && ` · aparelho: ${c.dispositivo}`}
                  {c.hospede_nome && ` · ${c.hospede_nome}`}
                </p>
              </div>
              <div className="flex gap-1.5">
                {currentCompany.data?.whatsapp && (
                  <a
                    href={complaintWhatsappUrl(currentCompany.data.whatsapp, c)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary"
                    title="Abrir mensagem pronta no WhatsApp"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    Avisar no WhatsApp
                  </a>
                )}
                {c.status === "aberto" && (
                  <button
                    className="rounded-md bg-brass-bg px-2.5 py-1 text-xs font-semibold text-[oklch(0.4_0.06_74)]"
                    onClick={() => update.mutate({ id: c.id, patch: { status: "em_andamento" } })}
                  >
                    Em andamento
                  </button>
                )}
                {c.status !== "resolvido" ? (
                  <button
                    className="rounded-md bg-sage-bg px-2.5 py-1 text-xs font-semibold text-pine-dark"
                    onClick={() =>
                      update.mutate({ id: c.id, patch: { status: "resolvido", resolved_at: new Date().toISOString() } })
                    }
                  >
                    Resolver
                  </button>
                ) : (
                  <button
                    className="rounded-md bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground"
                    onClick={() => update.mutate({ id: c.id, patch: { status: "aberto", resolved_at: null } })}
                  >
                    Reabrir
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <ComplaintForm
          rooms={rooms}
          onClose={() => setOpen(false)}
          onSave={(row) =>
            insert.mutate(row, {
              onSuccess: () => {
                toast.success("Reclamação registrada");
                setOpen(false);
              },
              onError: (e) => toast.error(e.message),
            })
          }
        />
      )}
    </div>
  );
}

function complaintWhatsappUrl(
  phone: string,
  complaint: {
    quarto: number | null;
    categoria: string;
    gravidade: string;
    descricao: string | null;
  },
) {
  const localDigits = phone.replace(/\D/g, "").replace(/^0+/, "");
  const destination = localDigits.startsWith("55") ? localDigits : `55${localDigits}`;
  const message = [
    `⚠️ Ocorrência ${complaintSeverityLabel(complaint.gravidade)}`,
    complaint.quarto ? `Quarto ${complaint.quarto}` : "Sem quarto informado",
    complaintLabel(complaint.categoria),
    complaint.descricao,
  ]
    .filter(Boolean)
    .join("\n");
  return `https://wa.me/${destination}?text=${encodeURIComponent(message)}`;
}

function ComplaintWordHeatmap({
  rows,
}: {
  rows: { palavra: string; ocorrencias: number }[];
}) {
  const max = Math.max(1, ...rows.map((row) => row.ocorrencias));
  return (
    <div className="mt-2 grid auto-rows-[58px] grid-cols-2 gap-1.5 sm:grid-cols-6">
      {rows.map((row, index) => {
        const intensity = row.ocorrencias / max;
        return (
          <div
            key={row.palavra}
            className={`flex min-w-0 flex-col justify-between rounded-lg border p-2 transition hover:-translate-y-0.5 hover:shadow-md ${
              index === 0
                ? "sm:col-span-3 sm:row-span-2"
                : intensity >= 0.55
                  ? "sm:col-span-2"
                  : "sm:col-span-1"
            }`}
            style={{
              background: `color-mix(in srgb, var(--primary) ${30 + intensity * 70}%, var(--card))`,
              borderColor: `color-mix(in srgb, var(--primary) ${50 + intensity * 45}%, var(--border))`,
              color: intensity >= 0.42 ? "white" : "var(--pine-dark)",
            }}
            title={`${row.palavra}: ${row.ocorrencias} ocorrência(s)`}
          >
            <strong className="truncate text-xs capitalize sm:text-sm">{row.palavra}</strong>
            <span className="text-[10px] font-bold opacity-85">
              {row.ocorrencias} ocorrência(s)
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ComplaintSeverityHeatmap({
  rows,
}: {
  rows: { label: string; values: number[] }[];
}) {
  const max = Math.max(1, ...rows.flatMap((row) => row.values));
  return (
    <div className="mt-3 overflow-x-auto">
      <div className="grid min-w-[390px] grid-cols-[minmax(130px,1fr)_repeat(3,72px)] gap-1.5 text-[10px]">
        <span />
        {["Monitorar", "Relevante", "Urgente"].map((label) => (
          <strong key={label} className="py-1 text-center text-muted-foreground">
            {label}
          </strong>
        ))}
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <strong className="truncate py-3 text-pine-dark" title={row.label}>
              {row.label}
            </strong>
            {row.values.map((value, index) => {
              const intensity = value / max;
              const color =
                index === 2 ? "var(--brick)" : index === 1 ? "var(--brass)" : "var(--sage)";
              return (
                <div
                  key={`${row.label}-${index}`}
                  className="grid min-h-10 place-items-center rounded-md border font-extrabold"
                  style={{
                    background: value
                      ? `color-mix(in srgb, ${color} ${35 + intensity * 65}%, var(--card))`
                      : "var(--muted)",
                    color: value && intensity >= 0.45 ? "white" : "var(--pine-dark)",
                  }}
                  title={`${row.label} · ${["monitorar", "relevante", "urgente"][index]}: ${value}`}
                >
                  {value}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function normalizeWords(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .match(/[a-z]{3,}/g)
      ?.filter((word) => !STOP_WORDS.has(word)) ?? []
  );
}

function ComplaintForm({
  rooms,
  onClose,
  onSave,
}: {
  rooms: ReturnType<typeof useRooms>["data"];
  onClose: () => void;
  onSave: (row: {
    quarto: number | null;
    categoria: string;
    gravidade: string;
    descricao: string | null;
    dispositivo: string | null;
    hospede_nome: string | null;
    origem: string;
    status: string;
  }) => void;
}) {
  const [quarto, setQuarto] = useState<string>(rooms?.[0] ? String(rooms[0].numero) : "");
  const [categoria, setCategoria] = useState<string>(COMPLAINT_CATEGORIES[0].value);
  const [gravidade, setGravidade] = useState<string>(COMPLAINT_SEVERITY[1].value);
  const [descricao, setDescricao] = useState("");
  const [dispositivo, setDispositivo] = useState("");
  const [hospede, setHospede] = useState("");

  return (
    <Modal open onClose={onClose} title="Nova reclamação">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            quarto: quarto ? Number(quarto) : null,
            categoria,
            gravidade,
            descricao: descricao.trim() || null,
            dispositivo: categoria === "wifi" && dispositivo ? dispositivo : null,
            hospede_nome: hospede.trim() || null,
            origem: "recepcao",
            status: "aberto",
          });
        }}
        className="space-y-3"
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quarto">
            <select className="field" value={quarto} onChange={(e) => setQuarto(e.target.value)}>
              <option value="">Sem quarto</option>
              {rooms?.map((r) => (
                <option key={r.numero} value={r.numero}>
                  {r.numero}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Gravidade">
            <select className="field" value={gravidade} onChange={(e) => setGravidade(e.target.value)}>
              {COMPLAINT_SEVERITY.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Categoria">
          <select className="field" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            {COMPLAINT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        {categoria === "wifi" && (
          <Field label="Aparelho do hóspede (ajuda a diagnosticar)">
            <select className="field" value={dispositivo} onChange={(e) => setDispositivo(e.target.value)}>
              <option value="">Não informado</option>
              {WIFI_DEVICES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Hóspede (opcional)">
          <input className="field" value={hospede} onChange={(e) => setHospede(e.target.value)} maxLength={80} />
        </Field>
        <Field label="Descrição">
          <textarea className="field min-h-20" value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={500} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancelar
          </button>
          <button type="submit" className="btn-primary">
            Salvar
          </button>
        </div>
      </form>
    </Modal>
  );
}
