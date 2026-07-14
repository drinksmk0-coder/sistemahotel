import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Download, Pencil } from "lucide-react";
import {
  useRooms,
  useReservations,
  useSales,
  useProducts,
  useInsert,
  useUpdate,
  activeReservationForRoom,
  type Product,
} from "@/lib/data";
import { fmtBRL, fmtDate, todayISO, downloadCSV } from "@/lib/format";
import { PAYMENT_METHODS } from "@/lib/constants";
import { PageHeader } from "@/components/AppLayout";
import { Modal, Field, EmptyState } from "@/components/ui-kit";

export const Route = createFileRoute("/_authenticated/vendas")({
  component: Vendas,
});

function Vendas() {
  const { data: rooms = [] } = useRooms();
  const { data: reservations = [] } = useReservations();
  const { data: sales = [] } = useSales();
  const { data: products = [] } = useProducts();
  const insert = useInsert("sales", ["sales", "products"]);
  const insertProduct = useInsert("products", ["products"]);
  const updateProduct = useUpdate("products", ["products"]);
  const [open, setOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const today = todayISO();
  const totalHoje = sales.filter((s) => s.data === today).reduce((a, s) => a + Number(s.total), 0);
  const totalMes = sales
    .filter((s) => (s.data || "").slice(0, 7) === today.slice(0, 7))
    .reduce((a, s) => a + Number(s.total), 0);
  const categoryTotals = useMemo(() => {
    const m = new Map<string, number>();
    sales.forEach((s) => {
      const key = s.categoria || "Geral";
      m.set(key, (m.get(key) ?? 0) + Number(s.total));
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [sales]);
  const lowStock = products.filter((p) => p.ativo && p.estoque_atual <= p.estoque_minimo);

  function exportCSV() {
    downloadCSV(`vendas-${today}.csv`, [
      ["Data", "Quarto", "Categoria", "Item", "Qtd", "Unitário", "Total", "Pagamento"],
      ...sales.map((s) => [s.data, s.quarto, s.categoria ?? "Geral", s.item, s.qtd, s.valor_unit, s.total, s.pagamento]),
    ]);
  }

  return (
    <div>
      <PageHeader
        title="Vendas extras"
        subtitle="Bebidas, lavanderia e outros consumos. Cada venda é vinculada à hospedagem ativa do quarto."
        action={
          <div className="flex gap-2">
            <button onClick={exportCSV} className="btn-ghost flex items-center gap-1.5">
              <Download className="h-4 w-4" /> CSV
            </button>
            <button onClick={() => setProductOpen(true)} className="btn-ghost flex items-center gap-1.5">
              <Plus className="h-4 w-4" /> Produto
            </button>
            <button onClick={() => setOpen(true)} className="btn-primary flex items-center gap-1.5">
              <Plus className="h-4 w-4" /> Nova venda
            </button>
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="stat-card">
          <p className="text-xs uppercase text-muted-foreground">Hoje</p>
          <p className="font-serif text-xl font-bold">{fmtBRL(totalHoje)}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs uppercase text-muted-foreground">Este mês</p>
          <p className="font-serif text-xl font-bold">{fmtBRL(totalMes)}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs uppercase text-muted-foreground">Produtos</p>
          <p className="font-serif text-xl font-bold">{products.filter((p) => p.ativo).length}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs uppercase text-muted-foreground">Estoque baixo</p>
          <p className="font-serif text-xl font-bold">{lowStock.length}</p>
        </div>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="card-surface overflow-x-auto">
          <div className="border-b border-border px-3 py-2">
            <h3 className="font-semibold">Estoque de produtos</h3>
          </div>
          {products.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">Cadastre produtos para vender com baixa automática.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="p-3">Produto</th>
                  <th className="p-3">Categoria</th>
                  <th className="p-3">Preço</th>
                  <th className="p-3">Estoque</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-b border-border/50">
                    <td className="p-3 font-semibold">{p.nome}</td>
                    <td className="p-3 text-muted-foreground">{p.categoria}</td>
                    <td className="p-3">{fmtBRL(p.preco)}</td>
                    <td className={`p-3 font-semibold ${p.estoque_atual <= p.estoque_minimo ? "text-brick" : ""}`}>
                      {p.estoque_atual}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        className="rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground"
                        onClick={() => {
                          setEditingProduct(p);
                          setProductOpen(true);
                        }}
                        title="Editar produto"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card-surface">
          <div className="border-b border-border px-3 py-2">
            <h3 className="font-semibold">Vendas por categoria</h3>
          </div>
          {categoryTotals.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">Sem vendas segmentadas ainda.</div>
          ) : (
            <ul className="divide-y divide-border/60 text-sm">
              {categoryTotals.map(([categoria, total]) => (
                <li key={categoria} className="flex justify-between px-3 py-2">
                  <span>{categoria}</span>
                  <strong>{fmtBRL(total)}</strong>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {sales.length === 0 ? (
        <EmptyState text="Nenhuma venda registrada." />
      ) : (
        <div className="card-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="p-3">Data</th>
                <th className="p-3">Quarto</th>
                <th className="p-3">Categoria</th>
                <th className="p-3">Item</th>
                <th className="p-3">Qtd</th>
                <th className="p-3">Total</th>
                <th className="p-3">Pgto</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id} className="border-b border-border/50">
                  <td className="p-3 text-muted-foreground">{fmtDate(s.data)}</td>
                  <td className="p-3 font-semibold">{s.quarto}</td>
                  <td className="p-3 text-muted-foreground">{s.categoria ?? "Geral"}</td>
                  <td className="p-3">{s.item}</td>
                  <td className="p-3">{s.qtd}</td>
                  <td className="p-3">{fmtBRL(s.total)}</td>
                  <td className="p-3 text-muted-foreground">{s.pagamento}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <SaleForm
          rooms={rooms}
          products={products.filter((p) => p.ativo)}
          onClose={() => setOpen(false)}
          onSave={(quarto, row) => {
            const active = activeReservationForRoom(reservations, quarto);
            insert.mutate(
              { ...row, quarto, reserva_id: active?.id ?? null },
              {
                onSuccess: () => {
                  toast.success("Venda registrada");
                  setOpen(false);
                },
                onError: (e) => toast.error(e.message),
              },
            );
          }}
        />
      )}

      {productOpen && (
        <ProductForm
          editing={editingProduct}
          onClose={() => {
            setProductOpen(false);
            setEditingProduct(null);
          }}
          onSave={(row) => {
            if (editingProduct) {
              updateProduct.mutate(
                { id: editingProduct.id, patch: row },
                {
                  onSuccess: () => {
                    toast.success("Produto atualizado");
                    setProductOpen(false);
                    setEditingProduct(null);
                  },
                  onError: (e) => toast.error(e.message),
                },
              );
            } else {
              insertProduct.mutate(row as never, {
                onSuccess: () => {
                  toast.success("Produto cadastrado");
                  setProductOpen(false);
                },
                onError: (e) => toast.error(e.message),
              });
            }
          }}
        />
      )}
    </div>
  );
}

function SaleForm({
  rooms,
  products,
  onClose,
  onSave,
}: {
  rooms: ReturnType<typeof useRooms>["data"];
  products: Product[];
  onClose: () => void;
  onSave: (
    quarto: number,
    row: {
      item: string;
      categoria: string;
      produto_id: string | null;
      qtd: number;
      valor_unit: number;
      total: number;
      pagamento: string;
      data: string;
    },
  ) => void;
}) {
  const [quarto, setQuarto] = useState<number>(rooms?.[0]?.numero ?? 0);
  const [produtoId, setProdutoId] = useState("");
  const [item, setItem] = useState("");
  const [categoria, setCategoria] = useState("Geral");
  const [qtd, setQtd] = useState(1);
  const [valor, setValor] = useState(0);
  const [pagamento, setPagamento] = useState<string>(PAYMENT_METHODS[0]);
  const selectedProduct = products.find((p) => p.id === produtoId);
  const total = qtd * valor;

  return (
    <Modal open onClose={onClose} title="Nova venda">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const saleItem = selectedProduct?.nome ?? item.trim();
          const saleCategory = selectedProduct?.categoria ?? (categoria.trim() || "Geral");
          if (!saleItem) return toast.error("Informe o item");
          if (selectedProduct && qtd > selectedProduct.estoque_atual) return toast.error("Estoque insuficiente");
          onSave(quarto, {
            item: saleItem,
            categoria: saleCategory,
            produto_id: selectedProduct?.id ?? null,
            qtd,
            valor_unit: valor,
            total,
            pagamento,
            data: todayISO(),
          });
        }}
        className="space-y-3"
      >
        <Field label="Quarto">
          <select className="field" value={quarto} onChange={(e) => setQuarto(Number(e.target.value))}>
            {rooms?.map((r) => (
              <option key={r.numero} value={r.numero}>
                {r.numero}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Produto cadastrado">
          <select
            className="field"
            value={produtoId}
            onChange={(e) => {
              const id = e.target.value;
              setProdutoId(id);
              const p = products.find((prod) => prod.id === id);
              if (p) {
                setItem("");
                setCategoria(p.categoria);
                setValor(Number(p.preco));
              }
            }}
          >
            <option value="">— venda avulsa —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome} · {p.categoria} · estoque {p.estoque_atual}
              </option>
            ))}
          </select>
        </Field>
        {!selectedProduct && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Item avulso">
              <input
                className="field"
                value={item}
                onChange={(e) => setItem(e.target.value)}
                required={!selectedProduct}
                maxLength={60}
                placeholder="Ex.: Lavanderia"
              />
            </Field>
            <Field label="Categoria">
              <input
                className="field"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                required
                maxLength={40}
                placeholder="Ex.: Bebidas"
              />
            </Field>
          </div>
        )}
        {selectedProduct && selectedProduct.estoque_atual <= selectedProduct.estoque_minimo && (
          <p className="rounded-lg bg-brick-bg px-3 py-2 text-sm text-brick">Atenção: estoque baixo para este produto.</p>
        )}
        {selectedProduct && (
          <p className="text-xs text-muted-foreground">
            Categoria {selectedProduct.categoria} · estoque disponível {selectedProduct.estoque_atual}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantidade">
            <input type="number" min={1} className="field" value={qtd} onChange={(e) => setQtd(Number(e.target.value))} />
          </Field>
          <Field label="Valor unitário">
            <input type="number" min={0} step="0.01" className="field" value={valor} onChange={(e) => setValor(Number(e.target.value))} />
          </Field>
        </div>
        <Field label="Pagamento">
          <select className="field" value={pagamento} onChange={(e) => setPagamento(e.target.value)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="font-serif text-lg font-bold">{fmtBRL(total)}</span>
        </div>
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

function ProductForm({
  editing,
  onClose,
  onSave,
}: {
  editing: Product | null;
  onClose: () => void;
  onSave: (row: {
    nome: string;
    categoria: string;
    preco: number;
    estoque_atual: number;
    estoque_minimo: number;
    ativo: boolean;
  }) => void;
}) {
  const [nome, setNome] = useState(editing?.nome ?? "");
  const [categoria, setCategoria] = useState(editing?.categoria ?? "Geral");
  const [preco, setPreco] = useState<number>(editing?.preco ?? 0);
  const [estoque, setEstoque] = useState<number>(editing?.estoque_atual ?? 0);
  const [minimo, setMinimo] = useState<number>(editing?.estoque_minimo ?? 0);
  const [ativo, setAtivo] = useState(editing?.ativo ?? true);

  return (
    <Modal open onClose={onClose} title={editing ? "Editar produto" : "Novo produto"}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!nome.trim()) return toast.error("Informe o produto");
          onSave({
            nome: nome.trim(),
            categoria: categoria.trim() || "Geral",
            preco: Number(preco) || 0,
            estoque_atual: Math.max(0, Number(estoque) || 0),
            estoque_minimo: Math.max(0, Number(minimo) || 0),
            ativo,
          });
        }}
        className="space-y-3"
      >
        <Field label="Produto">
          <input className="field" value={nome} onChange={(e) => setNome(e.target.value)} required maxLength={80} />
        </Field>
        <Field label="Categoria">
          <input className="field" value={categoria} onChange={(e) => setCategoria(e.target.value)} required maxLength={40} />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Preço">
            <input type="number" min={0} step="0.01" className="field" value={preco} onChange={(e) => setPreco(Number(e.target.value))} />
          </Field>
          <Field label="Estoque atual">
            <input type="number" min={0} className="field" value={estoque} onChange={(e) => setEstoque(Number(e.target.value))} />
          </Field>
          <Field label="Estoque mínimo">
            <input type="number" min={0} className="field" value={minimo} onChange={(e) => setMinimo(Number(e.target.value))} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
          Produto ativo para venda
        </label>
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
