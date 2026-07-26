import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Download } from "lucide-react";
import { useRooms, useComplaints, useInsert, useUpdate } from "@/lib/data";
import { fmtDate, todayISO, downloadExcel } from "@/lib/format";
import { COMPLAINT_CATEGORIES, COMPLAINT_SEVERITY, COMPLAINT_STATUS, WIFI_DEVICES, complaintLabel, complaintStatusLabel } from "@/lib/constants";
import { PageHeader } from "@/components/AppLayout";
import { Modal, Field, Badge, EmptyState } from "@/components/ui-kit";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const Route = createFileRoute("/_authenticated/reclamacoes")({
  component: Reclamacoes,
});

const sevTone: Record<string, string> = { baixa: "sage", media: "brass", alta: "brick" };
const STOP_WORDS = new Set(["para", "com", "uma", "que", "não", "nao", "dos", "das", "por", "sem", "está", "esta", "muito", "mais", "foi", "tem", "de", "da", "do", "e", "o", "a", "no", "na", "em"]);

function Reclamacoes() {
  const { data: rooms = [] } = useRooms();
  const { data: complaints = [] } = useComplaints();
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
    complaints.forEach((complaint) => {
      normalizeWords(complaint.descricao ?? "").forEach((word) => counts.set(word, (counts.get(word) ?? 0) + 1));
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([palavra, ocorrencias]) => ({ palavra, ocorrencias }));
  }, [complaints]);

  function exportCSV() {
    downloadExcel(`reclamacoes-${todayISO()}.xls`, [
      ["Data", "Quarto", "Categoria", "Gravidade", "Origem", "Aparelho", "Hóspede", "Status", "Descrição"],
      ...complaints.map((c) => [
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
        title="Reclamações"
        subtitle="Registre e acompanhe problemas por quarto. Para Wi-Fi, guarde o aparelho para saber se é do quarto ou do hóspede."
        action={
          <div className="flex gap-2">
            <button onClick={exportCSV} className="btn-ghost flex items-center gap-1.5">
              <Download className="h-4 w-4" /> Excel
            </button>
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

      {frequentWords.length > 0 && (
        <section className="card-surface mb-4 p-4">
          <div className="mb-3">
            <h3 className="font-serif text-lg font-bold">Assuntos mais citados</h3>
            <p className="text-xs text-muted-foreground">Palavras recorrentes nas descrições ajudam a revelar problemas sistêmicos.</p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={frequentWords} layout="vertical" margin={{ left: 8, right: 38 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="palavra" width={90} />
                <Tooltip />
                <Bar dataKey="ocorrencias" name="Ocorrências" fill="var(--pine)" radius={[0, 5, 5, 0]}>
                  <LabelList dataKey="ocorrencias" position="right" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
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
                  <Badge tone={sevTone[c.gravidade]}>{c.gravidade}</Badge>
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

function normalizeWords(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .match(/[a-z]{3,}/g)
    ?.filter((word) => !STOP_WORDS.has(word)) ?? [];
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
