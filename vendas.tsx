import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, Plus } from "lucide-react";
import { PageHeader } from "@/components/AppLayout";
import { EmptyState, Field, Modal } from "@/components/ui-kit";
import { useExpenses, useInsert } from "@/lib/data";
import { downloadCSV, fmtBRL, fmtDate, todayISO } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/despesas")({
  component: Despesas,
});

function Despesas() {
  const { data: expenses = [] } = useExpenses();
  const insert = useInsert("expenses", ["expenses"]);
  const [open, setOpen] = useState(false);
  const totalMes = expenses
    .filter((e) => (e.data || "").slice(0, 7) === todayISO().slice(0, 7))
    .reduce((sum, e) => sum + Number(e.valor), 0);
  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    expenses.forEach((expense) => map.set(expense.categoria, (map.get(expense.categoria) ?? 0) + Number(expense.valor)));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  function exportCSV() {
    downloadCSV(`despesas-${todayISO()}.csv`, [
      ["Data", "Categoria", "Descricao", "Fornecedor", "Pagamento", "Valor", "Observacoes"],
      ...expenses.map((e) => [e.data, e.categoria, e.descricao, e.fornecedor ?? "", e.pagamento ?? "", e.valor, e.observacoes ?? ""]),
    ]);
  }

  return (
    <div>
      <PageHeader
        title="Despesas"
        subtitle="Controle de gastos por categoria para comparar receita, custos e margem."
        action={
          <div className="flex gap-2">
            <button onClick={exportCSV} className="btn-ghost flex items-center gap-1.5">
              <Download className="h-4 w-4" /> CSV
            </button>
            <button onClick={() => setOpen(true)} className="btn-primary flex items-center gap-1.5">
              <Plus className="h-4 w-4" /> Nova despesa
            </button>
          </div>
        }
      />

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <div className="stat-card">
          <p className="text-xs uppercase text-muted-foreground">Despesas do mes</p>
          <p className="font-serif text-2xl font-bold">{fmtBRL(totalMes)}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs uppercase text-muted-foreground">Lancamentos</p>
          <p className="font-serif text-2xl font-bold">{expenses.length}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs uppercase text-muted-foreground">Categorias</p>
          <p className="font-serif text-2xl font-bold">{byCategory.length}</p>
        </div>
      </div>

      <div className="mb-4 card-surface p-4">
        <h3 className="mb-2 font-serif text-lg font-bold">Por categoria</h3>
        {byCategory.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem despesas ainda.</p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
            {byCategory.map(([category, total]) => (
              <div key={category} className="rounded-md border border-border p-3">
                <p className="text-xs uppercase text-muted-foreground">{category}</p>
                <p className="font-serif text-lg font-bold">{fmtBRL(total)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <ExpenseForm
          onClose={() => setOpen(false)}
          onSave={(row) =>
            insert.mutate(row, {
              onSuccess: () => {
                toast.success("Despesa cadastrada");
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

function ExpenseForm({ onClose, onSave }: { onClose: () => void; onSave: (row: Record<string, unknown>) => void }) {
  const [data, setData] = useState(todayISO());
  const [categoria, setCategoria] = useState("Geral");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState(0);
  const [pagamento, setPagamento] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [observacoes, setObservacoes] = useState("");

  return (
    <Modal open onClose={onClose} title="Nova despesa">
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
