import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CalendarRange, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppLayout";
import { Field, Modal, EmptyState } from "@/components/ui-kit";
import { useDelete, useInsert, useRateRules, useRooms, useUpdate, type RateRule } from "@/lib/data";
import { fmtBRL, fmtDate, todayISO } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/tarifario")({
  component: Tarifario,
});

type RateRuleForm = Omit<
  RateRule,
  "id" | "company_id" | "created_by" | "created_at" | "updated_at"
>;

function Tarifario() {
  const { data: rules = [] } = useRateRules();
  const { data: rooms = [] } = useRooms();
  const insert = useInsert("rate_rules", ["rate_rules"]);
  const update = useUpdate("rate_rules", ["rate_rules"]);
  const remove = useDelete("rate_rules", ["rate_rules"]);
  const [editing, setEditing] = useState<RateRule | null>(null);
  const [open, setOpen] = useState(false);

  const configurations = useMemo(
    () => [...new Set(rooms.map((room) => room.configuracao).filter(Boolean))].sort(),
    [rooms],
  );
  const activeRules = rules.filter((rule) => rule.ativo);
  const averageRate = rooms.length
    ? rooms.reduce((sum, room) => sum + Number(room.preco ?? 0), 0) / rooms.length
    : 0;
  const maximumRate = Math.max(
    0,
    ...rooms.map((room) => Number(room.preco ?? 0)),
    ...rules.map((rule) => Number(rule.valor_base ?? 0)),
  );
  const categoryRows = useMemo(
    () =>
      configurations.map((configuration) => {
        const categoryRooms = rooms.filter((room) => room.configuracao === configuration);
        return {
          configuration,
          rooms: categoryRooms.map((room) => room.numero).join(", "),
          base: categoryRooms.length
            ? categoryRooms.reduce((sum, room) => sum + Number(room.preco ?? 0), 0) /
              categoryRooms.length
            : 0,
        };
      }),
    [configurations, rooms],
  );

  return (
    <div>
      <PageHeader
        title="Tarifário dinâmico"
        subtitle="Defina preços para alta e baixa temporada, feriados, eventos e categorias de quarto. Na reserva, o sistema escolhe automaticamente a regra de maior prioridade."
        action={
          <button className="btn-primary flex items-center gap-2" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            Nova tarifa
          </button>
        }
      />

      <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <div className="stat-card">
          <p className="text-[9px] font-bold uppercase text-muted-foreground">Categorias</p>
          <strong className="text-lg text-pine-dark">{configurations.length}</strong>
        </div>
        <div className="stat-card">
          <p className="text-[9px] font-bold uppercase text-muted-foreground">Temporadas ativas</p>
          <strong className="text-lg text-pine-dark">{activeRules.length}</strong>
        </div>
        <div className="stat-card">
          <p className="text-[9px] font-bold uppercase text-muted-foreground">Diária média</p>
          <strong className="text-lg text-pine-dark">{fmtBRL(averageRate)}</strong>
        </div>
        <div className="stat-card">
          <p className="text-[9px] font-bold uppercase text-muted-foreground">Diária máxima</p>
          <strong className="text-lg text-pine-dark">{fmtBRL(maximumRate)}</strong>
        </div>
      </div>

      {rules.length === 0 ? (
        <EmptyState text="Nenhuma tarifa especial cadastrada. Os quartos continuam usando o preço padrão." />
      ) : (
        <section className="card-surface mb-3 p-3">
          <h3 className="mb-2 text-sm font-extrabold text-pine-dark">Temporadas</h3>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {rules.map((rule, index) => (
            <article
              key={rule.id}
              className={`rounded-lg border p-3 ${rule.ativo ? "" : "opacity-55"}`}
              style={{
                borderColor: `var(--chart-${(index % 6) + 1})`,
                background: `color-mix(in srgb, var(--chart-${(index % 6) + 1}) 9%, var(--card))`,
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[9px] font-bold uppercase text-muted-foreground">
                    {fmtDate(rule.inicio)} a {fmtDate(rule.fim)}
                  </p>
                  <h4 className="mt-1 truncate text-sm font-extrabold text-pine-dark">{rule.nome}</h4>
                </div>
                <CalendarRange className="h-4 w-4 text-primary" />
              </div>
              <p className="mt-2 text-lg font-extrabold text-primary">{fmtBRL(rule.valor_base)}</p>
              <p className="truncate text-[9px] text-muted-foreground">
                {rule.configuracao_quarto || "Todas as categorias"} · mínimo {rule.minimo_diarias} diária(s)
              </p>
              <div className="mt-2 flex justify-end gap-1">
                <button
                  className="btn-ghost flex h-7 items-center gap-1 px-2 text-[9px]"
                  onClick={() =>
                    update.mutate(
                      { id: rule.id, patch: { ativo: !rule.ativo } },
                      {
                        onSuccess: () =>
                          toast.success(rule.ativo ? "Tarifa desativada" : "Tarifa ativada"),
                        onError: (error: Error) => toast.error(error.message),
                      },
                    )
                  }
                >
                  <Power className="h-3.5 w-3.5" />
                  {rule.ativo ? "Desativar" : "Ativar"}
                </button>
                <button className="btn-ghost p-1.5" onClick={() => setEditing(rule)} title="Editar">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  className="rounded-md bg-brick-bg p-1.5 text-brick"
                  title="Excluir"
                  onClick={() => {
                    if (!window.confirm(`Excluir a tarifa “${rule.nome}”?`)) return;
                    remove.mutate(rule.id, {
                      onSuccess: () => toast.success("Tarifa excluída"),
                      onError: (error: Error) => toast.error(error.message),
                    });
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </article>
            ))}
          </div>
        </section>
      )}

      {categoryRows.length > 0 && (
        <section className="card-surface overflow-x-auto">
          <div className="border-b border-border px-3 py-2">
            <h3 className="text-sm font-extrabold text-pine-dark">Tarifas por categoria</h3>
            <p className="text-[9px] text-muted-foreground">
              Valores médios das UHs e regras especiais aplicáveis.
            </p>
          </div>
          <table className="w-full min-w-[720px] text-xs">
            <thead className="bg-muted/55 text-left text-[9px] uppercase text-muted-foreground">
              <tr>
                <th className="p-2.5">Categoria</th>
                <th className="p-2.5">UHs</th>
                <th className="p-2.5">Capacidade</th>
                <th className="p-2.5">Diária base</th>
                {activeRules.slice(0, 4).map((rule) => (
                  <th key={rule.id} className="p-2.5">{rule.nome}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categoryRows.map((row) => (
                <tr key={row.configuration} className="border-t border-border/70">
                  <td className="p-2.5 font-bold text-pine-dark">{row.configuration}</td>
                  <td className="p-2.5 text-muted-foreground">{row.rooms}</td>
                  <td className="p-2.5 text-muted-foreground">Definida na reserva</td>
                  <td className="p-2.5 font-bold">{fmtBRL(row.base)}</td>
                  {activeRules.slice(0, 4).map((rule) => (
                    <td key={rule.id} className="p-2.5 font-semibold text-primary">
                      {!rule.configuracao_quarto || rule.configuracao_quarto === row.configuration
                        ? fmtBRL(rule.valor_base)
                        : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {(open || editing) && (
        <RateModal
          editing={editing}
          configurations={configurations}
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
                    toast.success("Tarifa atualizada");
                    setEditing(null);
                  },
                  onError: (error: Error) => toast.error(error.message),
                },
              );
              return;
            }
            insert.mutate(row, {
              onSuccess: () => {
                toast.success("Tarifa criada");
                setOpen(false);
              },
              onError: (error: Error) => toast.error(error.message),
            });
          }}
        />
      )}
    </div>
  );
}

function RateModal({
  editing,
  configurations,
  onClose,
  onSave,
}: {
  editing: RateRule | null;
  configurations: string[];
  onClose: () => void;
  onSave: (row: RateRuleForm) => void;
}) {
  const [nome, setNome] = useState(editing?.nome ?? "");
  const [inicio, setInicio] = useState(editing?.inicio ?? todayISO());
  const [fim, setFim] = useState(editing?.fim ?? todayISO());
  const [configuracao, setConfiguracao] = useState(editing?.configuracao_quarto ?? "");
  const [valorBase, setValorBase] = useState(String(editing?.valor_base ?? ""));
  const [hospedesInclusos, setHospedesInclusos] = useState(String(editing?.hospedes_inclusos ?? 1));
  const [adicionalHospede, setAdicionalHospede] = useState(String(editing?.adicional_hospede ?? 0));
  const [minimoDiarias, setMinimoDiarias] = useState(String(editing?.minimo_diarias ?? 1));
  const [prioridade, setPrioridade] = useState(String(editing?.prioridade ?? 0));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (fim < inicio) {
      toast.error("A data final deve ser igual ou posterior à data inicial.");
      return;
    }
    onSave({
      nome: nome.trim(),
      inicio,
      fim,
      configuracao_quarto: configuracao || null,
      valor_base: parseMoney(valorBase),
      hospedes_inclusos: Math.max(1, Number(hospedesInclusos) || 1),
      adicional_hospede: parseMoney(adicionalHospede),
      minimo_diarias: Math.max(1, Number(minimoDiarias) || 1),
      prioridade: Number(prioridade) || 0,
      ativo: editing?.ativo ?? true,
    });
  }

  return (
    <Modal open onClose={onClose} title={editing ? "Editar tarifa" : "Nova tarifa"}>
      <form className="space-y-3" onSubmit={submit}>
        <Field label="Nome da tarifa">
          <input
            className="field"
            value={nome}
            onChange={(event) => setNome(event.target.value)}
            placeholder="Ex.: Réveillon, baixa temporada"
            required
            maxLength={80}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Início">
            <input
              type="date"
              className="field"
              value={inicio}
              onChange={(event) => setInicio(event.target.value)}
              required
            />
          </Field>
          <Field label="Fim">
            <input
              type="date"
              className="field"
              value={fim}
              onChange={(event) => setFim(event.target.value)}
              required
            />
          </Field>
        </div>
        <Field label="Categoria de quarto">
          <select
            className="field"
            value={configuracao}
            onChange={(event) => setConfiguracao(event.target.value)}
          >
            <option value="">Todos os quartos</option>
            {configurations.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Diária base (R$)">
            <input
              className="field"
              inputMode="decimal"
              value={valorBase}
              onChange={(event) => setValorBase(event.target.value)}
              required
            />
          </Field>
          <Field label="Adicional por pessoa (R$)">
            <input
              className="field"
              inputMode="decimal"
              value={adicionalHospede}
              onChange={(event) => setAdicionalHospede(event.target.value)}
            />
          </Field>
          <Field label="Hóspedes inclusos">
            <input
              type="number"
              min={1}
              className="field"
              value={hospedesInclusos}
              onChange={(event) => setHospedesInclusos(event.target.value)}
            />
          </Field>
          <Field label="Mínimo de diárias">
            <input
              type="number"
              min={1}
              className="field"
              value={minimoDiarias}
              onChange={(event) => setMinimoDiarias(event.target.value)}
            />
          </Field>
        </div>
        <Field label="Prioridade">
          <input
            type="number"
            className="field"
            value={prioridade}
            onChange={(event) => setPrioridade(event.target.value)}
          />
        </Field>
        <p className="rounded-lg bg-sage-bg p-3 text-xs text-pine-dark">
          Quando duas tarifas servirem para a mesma data, vence a de maior prioridade. Em empate,
          vence a tarifa específica da categoria.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary">
            Salvar tarifa
          </button>
        </div>
      </form>
    </Modal>
  );
}

function parseMoney(value: string) {
  const normalized = value.trim().replace(/\s/g, "");
  const decimal =
    normalized.includes(",") && normalized.includes(".")
      ? normalized.replace(/\./g, "").replace(",", ".")
      : normalized.replace(",", ".");
  const parsed = Number(decimal);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}
