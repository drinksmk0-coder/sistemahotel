import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/AppLayout";
import { ChartHtmlLegend } from "@/components/DashboardKit";
import { EmptyState, Field, Modal } from "@/components/ui-kit";
import { useDelete, useExpenses, useInsert, useUpdate, type Expense } from "@/lib/data";
import { downloadExcel, fmtBRL, fmtDate, todayISO } from "@/lib/format";
import { ExportPeriodButton, type ExportScope } from "@/components/ExportPeriodButton";
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
  const insert = useInsert("expenses", ["expenses"]);
  const update = useUpdate("expenses", ["expenses"]);
  const remove = useDelete("expenses", ["expenses"]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const totalMes = expenses
    .filter((e) => (e.data || "").slice(0, 7) === todayISO().slice(0, 7))
    .reduce((sum, e) => sum + Number(e.valor), 0);
  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    expenses.forEach((expense) => map.set(expense.categoria, (map.get(expense.categoria) ?? 0) + Number(expense.valor)));
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

  function exportCSV(scope: ExportScope) {
    const exportedExpenses =
      scope.mode === "date" ? expenses.filter((expense) => expense.data === scope.date) : expenses;
    const suffix = scope.mode === "date" ? scope.date : "historico-completo";
    downloadExcel(`despesas-${suffix}.xls`, [
      ["Data", "Categoria", "Descricao", "Fornecedor", "Pagamento", "Valor", "Observacoes"],
      ...exportedExpenses.map((e) => [e.data, e.categoria, e.descricao, e.fornecedor ?? "", e.pagamento ?? "", e.valor, e.observacoes ?? ""]),
    ]);
  }

  return (
    <div>
      <PageHeader
        title="Despesas"
        subtitle="Controle de gastos por categoria para comparar receita, custos e margem."
        action={
          <div className="flex gap-2">
            <ExportPeriodButton onExport={exportCSV} />
            <button onClick={() => setOpen(true)} className="btn-primary flex items-center gap-1.5">
              <Plus className="h-4 w-4" /> Nova despesa
            </button>
          </div>
        }
      />

      <div className="mb-3 grid grid-cols-3 gap-2">
        <div className="stat-card">
          <p className="text-[9px] font-bold uppercase text-muted-foreground">Despesas do mês</p>
          <p className="text-base font-extrabold text-pine-dark">{fmtBRL(totalMes)}</p>
        </div>
        <div className="stat-card">
          <p className="text-[9px] font-bold uppercase text-muted-foreground">Lançamentos</p>
          <p className="text-base font-extrabold text-pine-dark">{expenses.length}</p>
        </div>
        <div className="stat-card">
          <p className="text-[9px] font-bold uppercase text-muted-foreground">Categorias</p>
          <p className="text-base font-extrabold text-pine-dark">{byCategory.length}</p>
        </div>
      </div>

      {(categoryChart.length > 0 || monthlyChart.length > 0) && (
        <div className="mb-3 grid gap-3 lg:grid-cols-2">
          <section className="card-surface p-3">
            <h3 className="text-sm font-extrabold text-pine-dark">Despesas por categoria</h3>
            <p className="text-[9px] text-muted-foreground">Principais centros de custo.</p>
            <ChartHtmlLegend items={[{ label: "Despesa", color: "var(--brick)" }]} />
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={categoryChart}
                  margin={{ top: 18, right: 14, left: 0, bottom: 24 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="categoria"
                    angle={-20}
                    textAnchor="end"
                    interval={0}
                    height={55}
                  />
                  <YAxis tick={{ fontSize: 9 }} tickFormatter={formatCompactCurrency} />
                  <Tooltip formatter={(value) => fmtBRL(Number(value))} />
                  <Bar
                    dataKey="valor"
                    name="Despesa"
                    fill="var(--brick)"
                    radius={[5, 5, 0, 0]}
                  >
                    <LabelList
                      dataKey="valor"
                      position="top"
                      fontSize={9}
                      formatter={(value: number) => formatCompactCurrency(value)}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className="card-surface p-3">
            <h3 className="text-sm font-extrabold text-pine-dark">Evolução das despesas</h3>
            <p className="text-[9px] text-muted-foreground">Comparação mensal do histórico.</p>
            <ChartHtmlLegend items={[{ label: "Despesa mensal", color: "var(--brick)" }]} />
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyChart} margin={{ top: 18, right: 18, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" />
                  <YAxis tick={{ fontSize: 9 }} tickFormatter={formatCompactCurrency} />
                  <Tooltip formatter={(value) => fmtBRL(Number(value))} />
                  <Line
                    type="monotone"
                    dataKey="valor"
                    name="Despesa mensal"
                    stroke="var(--brick)"
                    strokeWidth={3}
                    dot={{ r: 4 }}
                  >
                    <LabelList
                      dataKey="valor"
                      position="top"
                      fontSize={9}
                      formatter={(value: number) => formatCompactCurrency(value)}
                    />
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>
      )}

      {expenses.length === 0 ? (
        <EmptyState text="Nenhuma despesa cadastrada." />
      ) : (
        <div className="card-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="p-3">Data</th>
                <th className="p-3">Categoria</th>
                <th className="p-3">Descricao</th>
                <th className="p-3">Fornecedor</th>
                <th className="p-3">Pagamento</th>
                <th className="p-3">Valor</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => (
                <tr key={expense.id} className="border-b border-border/50">
                  <td className="p-3">{fmtDate(expense.data)}</td>
                  <td className="p-3">{expense.categoria}</td>
                  <td className="p-3">{expense.descricao}</td>
                  <td className="p-3 text-muted-foreground">{expense.fornecedor ?? "-"}</td>
                  <td className="p-3 text-muted-foreground">{expense.pagamento ?? "-"}</td>
                  <td className="p-3 font-semibold">{fmtBRL(expense.valor)}</td>
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
                            onSuccess: () => toast.success("Despesa excluída"),
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
          onSave({ data, categoria, descricao, valor, pagamento: pagamento || null, fornecedor: fornecedor || null, observacoes: observacoes || null });
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
        <Field label="Descricao">
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
        <Field label="Observacoes">
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
