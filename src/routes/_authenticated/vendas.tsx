import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PackagePlus, Plus, ShoppingCart } from "lucide-react";
import { activeReservationForRoom, useCurrentCompany, useProducts, useReservations, useRooms, useSales } from "@/lib/data";
import { PAYMENT_METHODS } from "@/lib/constants";
import { fmtBRL, fmtDate, todayISO } from "@/lib/format";
import { PageHeader } from "@/components/AppLayout";
import { EmptyState, Field, Modal } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/vendas")({ component: Vendas });

const UNITS = ["unidade", "caixa", "pacote", "fardo", "garrafa", "lata", "quilo", "litro"];

type Product = {
  id: string;
  company_id: string;
  nome: string;
  categoria: string;
  unidade?: string | null;
  preco: number;
  custo_unitario?: number | null;
  estoque_atual: number;
  estoque_minimo: number;
  ativo: boolean;
};

type Sale = {
  id: string;
  compra_id?: string | null;
  comprador_tipo?: string | null;
  comprador_nome?: string | null;
  quarto: number | null;
  data: string;
  item: string;
  qtd: number;
  valor_unit: number;
  total: number;
  pagamento: string;
};

type CartItem = {
  produto_id: string | null;
  item: string;
  categoria: string;
  qtd: number;
  valor_unit: number;
  estoque: number | null;
};

function errorText(error: unknown, fallback: string) {
  if (!error || typeof error !== "object") return fallback;
  const e = error as { message?: string; details?: string; hint?: string; code?: string };
  return [e.message, e.details, e.hint, e.code ? `código ${e.code}` : ""].filter(Boolean).join(" — ") || fallback;
}

function schemaMismatch(error: unknown) {
  const text = errorText(error, "").toLowerCase();
  return text.includes("pgrst204") || text.includes("42703") || text.includes("column") || text.includes("schema cache");
}

function Vendas() {
  const current = useCurrentCompany();
  const companyId = current.data?.id;
  const { data: rooms = [] } = useRooms();
  const { data: reservations = [] } = useReservations();
  const { data: productRows = [], refetch: refetchProducts } = useProducts();
  const { data: saleRows = [], refetch: refetchSales } = useSales();
  const products = productRows as unknown as Product[];
  const sales = saleRows as unknown as Sale[];
  const [productOpen, setProductOpen] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);

  const groups = useMemo(() => {
    const map = new Map<string, Sale[]>();
    for (const sale of sales) {
      const key = sale.compra_id || sale.id;
      map.set(key, [...(map.get(key) ?? []), sale]);
    }
    return [...map.entries()].map(([id, items]) => ({
      id,
      data: items[0]?.data,
      comprador: items[0]?.comprador_nome || (items[0]?.quarto ? `Quarto ${items[0].quarto}` : "Venda"),
      quarto: items[0]?.quarto,
      items,
      total: items.reduce((sum, item) => sum + Number(item.total), 0),
    }));
  }, [sales]);

  async function refresh() {
    await Promise.all([refetchProducts(), refetchSales()]);
  }

  async function saveProduct(input: ProductInput) {
    if (!companyId) throw new Error("Empresa não encontrada.");

    const complete = {
      company_id: companyId,
      nome: input.nome,
      categoria: input.categoria,
      unidade: input.unidade,
      preco: input.preco,
      custo_unitario: input.custo,
      estoque_atual: input.inicial,
      estoque_total_recebido: input.inicial,
      estoque_minimo: input.minimo,
      ativo: true,
    };

    const first = await (supabase as any).from("products").insert(complete).select("id").single();
    if (!first.error) return;
    if (!schemaMismatch(first.error)) throw first.error;

    const base = {
      company_id: companyId,
      nome: input.nome,
      categoria: input.categoria,
      preco: input.preco,
      estoque_atual: input.inicial,
      estoque_minimo: input.minimo,
      ativo: true,
    };
    const fallback = await (supabase as any).from("products").insert(base).select("id").single();
    if (fallback.error) throw fallback.error;
  }

  async function savePurchase(input: PurchaseInput) {
    if (!companyId || input.items.length === 0) throw new Error("Adicione ao menos um item à comanda.");
    const active = input.room != null ? activeReservationForRoom(reservations, input.room) : null;
    if (input.buyerType === "hospede" && !active) throw new Error("Selecione um quarto com hospedagem ativa.");
    if (input.buyerType === "funcionario" && !input.employeeName.trim()) throw new Error("Informe o funcionário.");

    for (const item of input.items) {
      if (item.estoque != null && item.qtd > item.estoque) throw new Error(`Estoque insuficiente para ${item.item}.`);
    }

    const rpc = await (supabase as any).rpc("create_sale_order", {
      _company_id: companyId,
      _tipo: input.buyerType,
      _quarto: input.buyerType === "hospede" ? input.room : null,
      _reserva_id: input.buyerType === "hospede" ? active?.id ?? null : null,
      _cliente_id: input.buyerType === "hospede" ? active?.cliente_id ?? null : null,
      _consumidor: input.buyerType === "hospede" ? active?.cliente_nome ?? null : input.employeeName.trim(),
      _pagamento: input.payment,
      _data: todayISO(),
      _itens: input.items.map((item) => ({
        produto_id: item.produto_id,
        item: item.item,
        categoria: item.categoria,
        qtd: item.qtd,
        valor_unit: item.valor_unit,
      })),
    });
    if (!rpc.error) return;

    const rpcText = errorText(rpc.error, "").toLowerCase();
    if (!rpcText.includes("create_sale_order") && !rpcText.includes("function") && !rpcText.includes("schema cache")) {
      throw rpc.error;
    }

    const rows = input.items.map((item) => ({
      company_id: companyId,
      quarto: input.buyerType === "hospede" ? input.room : null,
      reserva_id: input.buyerType === "hospede" ? active?.id ?? null : null,
      item: item.item,
      qtd: item.qtd,
      valor_unit: item.valor_unit,
      total: Number((item.qtd * item.valor_unit).toFixed(2)),
      pagamento: input.payment,
      data: todayISO(),
    }));
    const inserted = await (supabase as any).from("sales").insert(rows);
    if (inserted.error) throw inserted.error;

    for (const item of input.items) {
      if (!item.produto_id || item.estoque == null) continue;
      const next = item.estoque - item.qtd;
      if (next < 0) throw new Error(`Estoque insuficiente para ${item.item}.`);
      const updated = await (supabase as any)
        .from("products")
        .update({ estoque_atual: next })
        .eq("id", item.produto_id)
        .eq("company_id", companyId);
      if (updated.error) throw updated.error;
    }
  }

  return (
    <div>
      <PageHeader
        title="Vendas e estoque"
        subtitle="Produtos, comandas com vários itens e baixa automática de estoque."
        action={
          <div className="flex gap-2">
            <button className="btn-ghost flex items-center gap-1.5" onClick={() => setProductOpen(true)}>
              <PackagePlus className="h-4 w-4" /> Produto
            </button>
            <button className="btn-primary flex items-center gap-1.5" onClick={() => setPurchaseOpen(true)}>
              <ShoppingCart className="h-4 w-4" /> Nova comanda
            </button>
          </div>
        }
      />

      <section className="card-surface mb-5 overflow-x-auto">
        <div className="border-b border-border p-4"><h3 className="font-serif text-lg font-bold">Estoque de produtos</h3></div>
        {products.length === 0 ? <EmptyState text="Nenhum produto cadastrado." /> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left text-xs uppercase text-muted-foreground"><th className="p-3">Produto</th><th className="p-3">Preço</th><th className="p-3">Estoque</th><th className="p-3">Mínimo</th></tr></thead>
            <tbody>{products.map((p) => <tr key={p.id} className="border-b border-border/50"><td className="p-3"><strong>{p.nome}</strong><div className="text-xs text-muted-foreground">{p.categoria}</div></td><td className="p-3">{fmtBRL(p.preco)}</td><td className="p-3 font-bold">{p.estoque_atual}</td><td className="p-3">{p.estoque_minimo}</td></tr>)}</tbody>
          </table>
        )}
      </section>

      <section className="card-surface overflow-x-auto">
        <div className="border-b border-border p-4"><h3 className="font-serif text-lg font-bold">Comandas registradas</h3></div>
        {groups.length === 0 ? <EmptyState text="Nenhuma venda registrada." /> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left text-xs uppercase text-muted-foreground"><th className="p-3">Data</th><th className="p-3">Comprador</th><th className="p-3">Quarto</th><th className="p-3">Itens</th><th className="p-3">Total</th></tr></thead>
            <tbody>{groups.map((g) => <tr key={g.id} className="border-b border-border/50"><td className="p-3">{fmtDate(g.data)}</td><td className="p-3 font-semibold">{g.comprador}</td><td className="p-3">{g.quarto ?? "—"}</td><td className="p-3">{g.items.map((i) => `${i.qtd}× ${i.item}`).join(" · ")}</td><td className="p-3 font-semibold">{fmtBRL(g.total)}</td></tr>)}</tbody>
          </table>
        )}
      </section>

      {productOpen && <ProductModal onClose={() => setProductOpen(false)} onSave={async (input) => {
        try {
          await saveProduct(input);
          setProductOpen(false);
          await refresh();
          toast.success("Produto salvo.");
        } catch (error) {
          toast.error(errorText(error, "Erro ao salvar produto."));
        }
      }} />}

      {purchaseOpen && <PurchaseModal rooms={rooms as any[]} products={products.filter((p) => p.ativo)} onClose={() => setPurchaseOpen(false)} onSave={async (input) => {
        try {
          await savePurchase(input);
          setPurchaseOpen(false);
          await refresh();
          toast.success("Comanda salva.");
        } catch (error) {
          toast.error(errorText(error, "Erro ao salvar comanda."));
        }
      }} />}
    </div>
  );
}

type ProductInput = { nome: string; categoria: string; unidade: string; preco: number; custo: number; inicial: number; minimo: number };
function ProductModal({ onClose, onSave }: { onClose: () => void; onSave: (input: ProductInput) => Promise<void> }) {
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState("Geral");
  const [unidade, setUnidade] = useState("unidade");
  const [preco, setPreco] = useState(0);
  const [custo, setCusto] = useState(0);
  const [inicial, setInicial] = useState(0);
  const [minimo, setMinimo] = useState(0);
  const [saving, setSaving] = useState(false);
  return <Modal open onClose={onClose} title="Novo produto"><form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); if (!nome.trim()) return toast.error("Informe o produto."); setSaving(true); try { await onSave({ nome: nome.trim(), categoria: categoria.trim() || "Geral", unidade, preco, custo, inicial, minimo }); } finally { setSaving(false); } }}>
    <Field label="Produto"><input className="field" value={nome} onChange={(e) => setNome(e.target.value)} /></Field>
    <div className="grid grid-cols-2 gap-3"><Field label="Categoria"><input className="field" value={categoria} onChange={(e) => setCategoria(e.target.value)} /></Field><Field label="Unidade"><select className="field" value={unidade} onChange={(e) => setUnidade(e.target.value)}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></Field></div>
    <div className="grid grid-cols-2 gap-3"><Field label="Preço"><input type="number" min="0" step="0.01" className="field" value={preco} onChange={(e) => setPreco(Number(e.target.value))} /></Field><Field label="Custo"><input type="number" min="0" step="0.01" className="field" value={custo} onChange={(e) => setCusto(Number(e.target.value))} /></Field></div>
    <div className="grid grid-cols-2 gap-3"><Field label="Estoque inicial"><input type="number" min="0" className="field" value={inicial} onChange={(e) => setInicial(Number(e.target.value))} /></Field><Field label="Estoque mínimo"><input type="number" min="0" className="field" value={minimo} onChange={(e) => setMinimo(Number(e.target.value))} /></Field></div>
    <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</button></div>
  </form></Modal>;
}

type PurchaseInput = { buyerType: "hospede" | "funcionario"; room: number | null; employeeName: string; payment: string; items: CartItem[] };
function PurchaseModal({ rooms, products, onClose, onSave }: { rooms: any[]; products: Product[]; onClose: () => void; onSave: (input: PurchaseInput) => Promise<void> }) {
  const [buyerType, setBuyerType] = useState<"hospede" | "funcionario">("hospede");
  const [room, setRoom] = useState<number | null>(rooms[0]?.numero ?? null);
  const [employeeName, setEmployeeName] = useState("");
  const [payment, setPayment] = useState(PAYMENT_METHODS[0]);
  const [productId, setProductId] = useState("");
  const [qtd, setQtd] = useState(1);
  const [items, setItems] = useState<CartItem[]>([]);
  const [saving, setSaving] = useState(false);
  const selected = products.find((p) => p.id === productId);
  const total = items.reduce((sum, item) => sum + item.qtd * item.valor_unit, 0);
  function add() {
    if (!selected) return toast.error("Selecione um produto.");
    if (qtd <= 0) return toast.error("Quantidade inválida.");
    const already = items.filter((i) => i.produto_id === selected.id).reduce((sum, i) => sum + i.qtd, 0);
    if (already + qtd > selected.estoque_atual) return toast.error("Estoque insuficiente.");
    setItems((prev) => [...prev, { produto_id: selected.id, item: selected.nome, categoria: selected.categoria, qtd, valor_unit: Number(selected.preco), estoque: Number(selected.estoque_atual) }]);
    setProductId(""); setQtd(1);
  }
  return <Modal open onClose={onClose} title="Nova comanda"><form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); setSaving(true); try { await onSave({ buyerType, room, employeeName, payment, items }); } finally { setSaving(false); } }}>
    <div className="grid grid-cols-2 gap-3"><Field label="Tipo"><select className="field" value={buyerType} onChange={(e) => setBuyerType(e.target.value as "hospede" | "funcionario")}><option value="hospede">Hóspede</option><option value="funcionario">Funcionário</option></select></Field>{buyerType === "hospede" ? <Field label="Quarto"><select className="field" value={room ?? ""} onChange={(e) => setRoom(Number(e.target.value))}>{rooms.map((r) => <option key={r.numero} value={r.numero}>{r.numero}</option>)}</select></Field> : <Field label="Funcionário"><input className="field" value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} /></Field>}</div>
    <div className="grid grid-cols-[1fr_100px_auto] items-end gap-2"><Field label="Produto"><select className="field" value={productId} onChange={(e) => setProductId(e.target.value)}><option value="">Selecione</option>{products.map((p) => <option key={p.id} value={p.id}>{p.nome} · estoque {p.estoque_atual}</option>)}</select></Field><Field label="Qtd"><input type="number" min="1" className="field" value={qtd} onChange={(e) => setQtd(Number(e.target.value))} /></Field><button type="button" className="btn-ghost flex items-center gap-1" onClick={add}><Plus className="h-4 w-4" /> Adicionar</button></div>
    {items.length > 0 && <ul className="divide-y divide-border rounded-lg border border-border">{items.map((item, index) => <li key={`${item.produto_id}-${index}`} className="flex justify-between p-2 text-sm"><span>{item.qtd}× {item.item}</span><strong>{fmtBRL(item.qtd * item.valor_unit)}</strong></li>)}</ul>}
    <Field label="Pagamento"><select className="field" value={payment} onChange={(e) => setPayment(e.target.value)}>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</select></Field>
    <div className="flex justify-between rounded-lg bg-muted p-3"><span>Total</span><strong>{fmtBRL(total)}</strong></div>
    <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={saving || items.length === 0}>{saving ? "Salvando..." : "Salvar comanda"}</button></div>
  </form></Modal>;
}
