import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, Pencil, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/AppLayout";
import { EmptyState, Field, Modal } from "@/components/ui-kit";
import {
  useCurrentCompany,
  useDelete,
  useExpenses,
  useInsert,
  useUpdate,
  type Expense,
} from "@/lib/data";
import { downloadExcel, fmtBRL, fmtDate, todayISO } from "@/lib/format";
import { ExportPeriodButton, type ExportScope } from "@/components/ExportPeriodButton";
import { supabase } from "@/integrations/supabase/client";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const Route = createFileRoute("/_authenticated/despesas")({
  component: Despesas,
});

function Despesas() {
  const { data: expenses = [] } = useExpenses();
  const currentCompany = useCurrentCompany();
  const queryClient = useQueryClient();
  const insert = useInsert("expenses", ["expenses"]);
  const update = useUpdate("expenses", ["expenses"]);
  const remove = useDelete("expenses", ["expenses"]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [filterDate, setFilterDate] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const currentMonthLabel = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${todayISO().slice(0, 7)}-01T12:00:00`));
  const totalMes = expenses
    .filter((e) => (e.data || "").slice(0, 7) === todayISO().slice(0, 7))
    .reduce((sum, e) => sum + Number(e.valor), 0);
  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    expenses.forEach((expense) =>
      map.set(expense.categoria, (map.get(expense.categoria) ?? 0) + Number(expense.valor)),
    );
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [expenses]);
  const categoryChart = useMemo(
    () => byCategory.slice(0, 10).map(([categoria, valor]) => ({ categoria, valor })),
    [byCategory],
  );
  const monthlyChart = useMemo(() => {
    const totals = new Map<string, number>();
    expenses.forEach((expense) => {
      const month = (expense.data || "").slice(0, 7);
      if (month) totals.set(month, (totals.get(month) ?? 0) + Number(expense.valor));
    });
    return [...totals.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([mes, valor]) => ({ mes: `${mes.slice(5)}/${mes.slice(2, 4)}`, valor }));
  }, [expenses]);
  const visibleExpenses = useMemo(
    () => (filterDate ? expenses.filter((expense) => expense.data === filterDate) : expenses),
    [expenses, filterDate],
  );
  const allVisibleSelected =
    visibleExpenses.length > 0 && visibleExpenses.every((expense) => selectedIds.has(expense.id));

  function exportCSV(scope: ExportScope) {
    const exportedExpenses =
      scope.mode === "date" ? expenses.filter((expense) => expense.data === scope.date) : expenses;
    const suffix = scope.mode === "date" ? scope.date : "historico-completo";
    downloadExcel(`despesas-${suffix}.xls`, [
      ["Data", "Categoria", "Descricao", "Fornecedor", "Pagamento", "Valor", "Observacoes"],
      ...exportedExpenses.map((e) => [
        e.data,
        e.categoria,
        e.descricao,
        e.fornecedor ?? "",
        e.pagamento ?? "",
        e.valor,
        e.observacoes ?? "",
      ]),
    ]);
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visibleExpenses.forEach((expense) => next.delete(expense.id));
      else visibleExpenses.forEach((expense) => next.add(expense.id));
      return next;
    });
  }

  async function deleteSelected() {
    const ids = [...selectedIds];
    const companyId = currentCompany.data?.id;
    if (!ids.length || !companyId) return;
    if (!window.confirm(`Excluir ${ids.length} despesa(s) selecionada(s)? Esta ação não pode ser desfeita.`)) {
      return;
    }

    setBulkDeleting(true);
    try {
      const { error } = await (supabase as any)
        .from("expenses")
        .delete()
        .eq("company_id", companyId)
        .in("id", ids);
      if (error) throw error;
      setSelectedIds(new Set());
      await queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast.success(`${ids.length} despesa(s) excluída(s)`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir as despesas.");
    } finally {
      setBulkDeleting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Despesas"
        subtitle="Controle de gastos por categoria para comparar receita, custos e margem."
        action={
          <div className="flex flex-wrap gap-2">
            <ExportPeriodButton onExport={exportCSV} />
            <button onClick={() => setOpen(true)} className="btn-primary flex items-center gap-1.5">
              <Plus className="h-4 w-4" /> Nova despesa
            </button>
          </div>
        }
      />

      <div className="mb-3 flex flex-wrap gap-2">
        <div className="stat-card w-full max-w-[230px] flex-1 basis-[170px]">
          <p className="text-[9px] font-bold uppercase text-muted-foreground">
            Despesas · {currentMonthLabel}
          </p>
          <p className="text-base font-extrabold text-pine-dark">{fmtBRL(totalMes)}</p>
        </div>
        <div className="stat-card w-full max-w-[230px] flex-1 basis-[170px]">
          <p className="text-[9px] font-bold uppercase text-muted-foreground">Lançamentos</p>
          <p className="text-base font-extrabold text-pine-dark">{expenses.length}</p>
        </div>
        <div className="stat-card w-full max-w-[230px] flex-1 basis-[170px]">
          <p className="text-[9px] font-bold uppercase text-muted-foreground">Categorias</p>
          <p className="text-base font-extrabold text-pine-dark">{byCategory.length}</p>
        </div>
      </div>

      {(categoryChart.length > 0 || monthlyChart.length > 0) && (
        <div className="mb-3 grid gap-3 lg:grid-cols-2">
          <section className="card-surface p-3">
            <h3 className="text-sm font-extrabold text-pine-dark">Despesas por categoria</h3>
            <p className="text-[9px] text-muted-foreground">Principais centros de custo.</p>
            <div className="mt-2 h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={categoryChart}
                  layout="vertical"
                  margin={{ top: 8, right: 78, left: 14, bottom: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 9 }}
                    tickFormatter={formatCompactCurrency}
                    height={34}
                  />
                  <YAxis
                    type="category"
                    dataKey="categoria"
                    interval={0}
                    width={156}
                    tick={{ fontSize: 9, fill: "var(--foreground)" }}
                  />
                  <Tooltip formatter={(value) => fmtBRL(Number(value))} />
                  <Bar dataKey="valor" name="Despesa" fill="var(--brick)" radius={[0, 5, 5, 0]}>
                    <LabelList
                      dataKey="valor"
                      position="right"
                      fontSize={9}
                      formatter={(value: number) => formatCompactCurrency(value).replace(" ", "\u00a0")}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className="card-surface p-3">
            <h3 className="text-sm font-extrabold text-pine-dark">Evolução das despesas</h3>
            <p className="text-[9px] text-muted-foreground">Comparação mensal do histórico.</p>
            <div className="mt-2 h-60">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyChart} margin={{ top: 12, right: 18, left: 26, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" />
                  <YAxis
                    tick={{ fontSize: 9 }}
                    tickFormatter={formatCompactCurrency}
                    width={84}
                  />
                  <Tooltip formatter={(value) => fmtBRL(Number(value))} />
                  <Line
                    type="monotone"
                    dataKey="valor"
                    name="Despesa mensal"
                    stroke="var(--brick)"
                    strokeWidth={3}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>
      )}

      <section className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-3 shadow-sm">
        <label className="min-w-[190px] text-[10px] font-bold uppercase text-muted-foreground">
          <span className="mb-1 flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 text-primary" /> Filtrar pelo calendário
          </span>
          <input
            type="date"
            className="field h-9 text-xs"
            value={filterDate}
            onChange={(event) => {
              setFilterDate(event.target.value);
              setSelectedIds(new Set());
            }}
          />
        </label>
        {filterDate && (
          <button
            type="button"
            className="btn-ghost h-9 text-xs"
            onClick={() => {
              setFilterDate("");
              setSelectedIds(new Set());
            }}
          >
            Mostrar todo o histórico
          </button>
        )}
        <span className="text-xs text-muted-foreground">
          {visibleExpenses.length} lançamento(s) exibido(s)
        </span>
        {selectedIds.size > 0 && (
          <button
            type="button"
            className="ml-auto flex h-9 items-center gap-1.5 rounded-md bg-brick px-3 text-xs font-bold text-white disabled:opacity-50"
            disabled={bulkDeleting}
            onClick={() => void deleteSelected()}
          >
            <Trash2 className="h-4 w-4" />
            {bulkDeleting ? "Excluindo…" : `Excluir selecionadas (${selectedIds.size})`}
          </button>
        )}
      </section>

      {visibleExpenses.length === 0 ? (
        <EmptyState text={filterDate ? "Nenhuma despesa nesta data." : "Nenhuma despesa cadastrada."} />
      ) : (
        <div className="card-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="w-10 p-3 text-center">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                    aria-label="Selecionar todas as despesas exibidas"
                  />
                </th>
                <th className="p-3">Data</th>
                <th className="p-3">Categoria</th>
                <th className="p-3">Descrição</th>
                <th className="p-3">Fornecedor</th>
                <th className="p-3">Pagamento</th>
                <th className="p-3">Valor</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {visibleExpenses.map((expense) => (
                <tr
                  key={expense.id}
                  className={`border-b border-border/50 ${selectedIds.has(expense.id) ? "bg-brick-bg/40" : ""}`}
                >
                  <td className="p-3 text-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(expense.id)}
                      onChange={() => toggleSelected(expense.id)}
                      aria-label={`Selecionar despesa ${expense.descricao}`}
                    />
                  </td>
                  <td className="p-3">{fmtDate(expense.data)}</td>
                  <td className="p-3">{expense.categoria}</td>
                  <td className="p-3">{expense.descricao}</td>
                  <td className="p-3 text-muted-foreground">{expense.fornecedor ?? "-"}</td>
                  <td className="p-3 text-muted-foreground">{expense.pagamento ?? "-"}</td>
                  <td className="p-3 font-semibold text-brick">{fmtBRL(expense.valor)}</td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        className="rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground"
                        onClick={() => setEditing(expense)}
                        title="Editar despesa"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className="rounded-md bg-brick-bg px-2 py-1 text-xs font-semibold text-brick"
                        onClick={() => {
                          if (!window.confirm(`Excluir despesa "${expense.descricao}"?`)) return;
                          remove.mutate(expense.id, {
                            onSuccess: () => {
                              setSelectedIds((current) => {
                                const next = new Set(current);
                                next.delete(expense.id);
                                return next;
                              });
                              toast.success("Despesa excluída");
                            },
                            onError: (e) => toast.error(e.message),
                          });
                        }}
                        title="Excluir despesa"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(open || editing) && (
        <ExpenseForm
          editing={editing}
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
                    toast.success("Despesa atualizada");
                    setEditing(null);
                  },
                  onError: (e) => toast.error(e.message),
                },
              );
              return;
            }
            insert.mutate(row, {
              onSuccess: () => {
                toast.success("Despesa cadastrada");
                setOpen(false);
              },
              onError: (e) => toast.error(e.message),
            });
          }}
        />
      )}
    </div>
  );
}

function formatCompactCurrency(value: number) {
  const absolute = Math.abs(Number(value));
  if (absolute >= 1_000_000) {
    return `R$ ${(Number(value) / 1_000_000).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} mi`;
  }
  if (absolute >= 1_000) {
    return `R$ ${(Number(value) / 1_000).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} mil`;
  }
  return fmtBRL(Number(value));
}

function ExpenseForm({
  editing,
  onClose,
  onSave,
}: {
  editing: Expense | null;
  onClose: () => void;
  onSave: (row: Record<string, unknown>) => void;
}) {
  const [data, setData] = useState(editing?.data ?? todayISO());
  const [categoria, setCategoria] = useState(editing?.categoria ?? "Geral");
  const [descricao, setDescricao] = useState(editing?.descricao ?? "");
  const [valor, setValor] = useState(Number(editing?.valor ?? 0));
  const [pagamento, setPagamento] = useState(editing?.pagamento ?? "");
  const [fornecedor, setFornecedor] = useState(editing?.fornecedor ?? "");
  const [observacoes, setObservacoes] = useState(editing?.observacoes ?? "");

  return (
    <Modal open onClose={onClose} title={editing ? "Editar despesa" : "Nova despesa"}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            data,
            categoria,
            descricao,
            valor,
            pagamento: pagamento || null,
            fornecedor: fornecedor || null,
            observacoes: observacoes || null,
          });
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data">
            <input className="field" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </Field>
          <Field label="Categoria">
            <input className="field" value={categoria} onChange={(e) => setCategoria(e.target.value)} required />
          </Field>
        </div>
        <Field label="Descrição">
          <input className="field" value={descricao} onChange={(e) => setDescricao(e.target.value)} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor">
            <input className="field" type="number" step="0.01" value={valor} onChange={(e) => setValor(Number(e.target.value))} />
          </Field>
          <Field label="Pagamento">
            <input className="field" value={pagamento} onChange={(e) => setPagamento(e.target.value)} />
          </Field>
        </div>
        <Field label="Fornecedor">
          <input className="field" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} />
        </Field>
        <Field label="Observações">
          <input className="field" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
          <button type="submit" className="btn-primary">Salvar</button>
        </div>
      </form>
    </Modal>
  );
}
