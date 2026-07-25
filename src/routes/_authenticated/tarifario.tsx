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

      {rules.length === 0 ? (
        <EmptyState text="Nenhuma tarifa especial cadastrada. Os quartos continuam usando o preço padrão." />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {rules.map((rule) => (
            <article key={rule.id} className={`card-surface p-4 ${rule.ativo ? "" : "opacity-60"}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <CalendarRange className="h-4 w-4 text-pine" />
                    <h3 className="font-serif text-lg font-bold">{rule.nome}</h3>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {fmtDate(rule.inicio)} a {fmtDate(rule.fim)}
                  </p>
                </div>
                <span className="rounded-full bg-sage-bg px-2 py-1 text-xs font-bold text-pine-dark">
                  prioridade {rule.prioridade}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <Info label="Diária base" value={fmtBRL(rule.valor_base)} />
                <Info label="Categoria" value={rule.configuracao_quarto || "Todos os quartos"} />
                <Info label="Hóspedes inclusos" value={String(rule.hospedes_inclusos)} />
                <Info label="Adicional por pessoa" value={fmtBRL(rule.adicional_hospede)} />
                <Info label="Estadia mínima" value={`${rule.minimo_diarias} diária(s)`} />
                <Info label="Situação" value={rule.ativo ? "Ativa" : "Desativada"} />
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  className="btn-ghost flex items-center gap-1 text-xs"
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
                <button className="btn-ghost p-2" onClick={() => setEditing(rule)} title="Editar">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  className="rounded-md bg-brick-bg p-2 text-brick"
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="block text-xs text-muted-foreground">{label}</span>
      <strong className="block">{value}</strong>
    </div>
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
