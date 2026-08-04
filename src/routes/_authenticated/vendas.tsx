import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ClipboardList, PackagePlus, Pencil, Plus, RefreshCw, ShoppingCart, UserRound, UsersRound, Warehouse } from "lucide-react";
import { activeReservationForRoom, useCurrentCompany, useProducts, useReservations, useRooms, useSales } from "@/lib/data";
import { PAYMENT_METHODS } from "@/lib/constants";
import { fmtBRL, fmtDate, todayISO } from "@/lib/format";
import { PageHeader } from "@/components/AppLayout";
import { EmptyState, Field, Modal } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/vendas")({ component: Vendas });

type Product = { id: string; company_id: string; nome: string; categoria: string; preco: number; custo_unitario?: number | null; estoque_atual: number; estoque_total_recebido?: number | null; estoque_minimo: number; ativo: boolean };
type Sale = { id: string; compra_id?: string | null; comprador_tipo?: string | null; comprador_nome?: string | null; cliente_id?: string | null; reserva_id?: string | null; quarto: number | null; data: string; item: string; categoria?: string | null; produto_id?: string | null; qtd: number; valor_unit: number; total: number; valor_pago?: number | null; pagamento: string; created_at: string };
type Movement = { id: string; tipo: string; quantidade: number; estoque_anterior: number; estoque_posterior: number; motivo: string | null; created_at: string; produto?: { nome?: string | null } | null };
type CartItem = { key: string; produto_id: string | null; item: string; categoria: string; qtd: number; valor_unit: number; estoque: number | null };

type PurchaseInput = { buyerType: "hospede" | "funcionario"; room: number | null; employeeName: string; payment: string; amountPaid: number; items: CartItem[] };

function Vendas() {
  const current = useCurrentCompany();
  const companyId = current.data?.id;
  const { data: rooms = [] } = useRooms();
  const { data: reservations = [] } = useReservations();
  const { data: productRows = [] } = useProducts();
  const { data: saleRows = [] } = useSales();
  const products = productRows as unknown as Product[];
  const sales = saleRows as unknown as Sale[];
  const qc = useQueryClient();
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [stockMode, setStockMode] = useState<"reposicao" | "contagem">("reposicao");
  const [historyOpen, setHistoryOpen] = useState(false);

  const movements = useQuery({
    queryKey: ["stock_movements", companyId], enabled: !!companyId,
    queryFn: async (): Promise<Movement[]> => {
      const { data, error } = await (supabase as any).from("stock_movements")
        .select("id,tipo,quantidade,estoque_anterior,estoque_posterior,motivo,created_at,produto:products(nome)")
        .eq("company_id", companyId).order("created_at", { ascending: false }).limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });

  const employees = useQuery({
    queryKey: ["sales_employees", companyId], enabled: !!companyId,
    queryFn: async (): Promise<string[]> => {
      const { data: members, error } = await (supabase as any).from("company_members").select("user_id").eq("company_id", companyId).eq("ativo", true);
      if (error) throw error;
      const ids = [...new Set((members ?? []).map((row: any) => row.user_id).filter(Boolean))];
      if (!ids.length) return [];
      const { data: profiles, error: profileError } = await (supabase as any).from("profiles").select("id,nome,email").in("id", ids);
      if (profileError) throw profileError;
      return (profiles ?? []).map((row: any) => row.nome || row.email || `Funcionário ${String(row.id).slice(0, 8)}`);
    },
  });

  const activeProducts = products.filter((p) => p.ativo);
  const lowStock = activeProducts.filter((p) => p.estoque_atual <= p.estoque_minimo);
  const received = products.reduce((sum, p) => sum + Number(p.estoque_total_recebido ?? p.estoque_atual), 0);
  const currentQty = products.reduce((sum, p) => sum + Number(p.estoque_atual), 0);
  const inventoryValue = products.reduce((sum, p) => sum + Number(p.estoque_atual) * Number(p.custo_unitario ?? 0), 0);
  const salesToday = sales.filter((s) => s.data === todayISO()).reduce((sum, s) => sum + Number(s.total), 0);
  const groups = useMemo(() => groupSales(sales), [sales]);

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["products"] }),
      qc.invalidateQueries({ queryKey: ["sales"] }),
      qc.invalidateQueries({ queryKey: ["stock_movements"] }),
    ]);
  }

  async function savePurchase(input: PurchaseInput) {
    if (!companyId || !input.items.length) throw new Error("Adicione ao menos um item à comanda.");
    const active = input.buyerType === "hospede" && input.room != null ? activeReservationForRoom(reservations, input.room) : null;
    if (input.buyerType === "hospede" && !active) throw new Error("Selecione um quarto com hospedagem ativa.");
    if (input.buyerType === "funcionario" && !input.employeeName.trim()) throw new Error("Informe o funcionário.");
    for (const item of input.items) if (item.estoque != null && item.qtd > item.estoque) throw new Error(`Estoque insuficiente para ${item.item}.`);

    const compraId = crypto.randomUUID();
    const total = input.items.reduce((sum, item) => sum + item.qtd * item.valor_unit, 0);
    const paidTotal = Math.max(0, Math.min(total, input.amountPaid));
    let remaining = paidTotal;
    const rows = input.items.map((item, index) => {
      const itemTotal = money(item.qtd * item.valor_unit);
      const paid = index === input.items.length - 1 ? money(remaining) : Math.min(itemTotal, money(total ? (itemTotal / total) * paidTotal : 0), remaining);
      remaining = money(remaining - paid);
      return {
        company_id: companyId, compra_id: compraId, comprador_tipo: input.buyerType,
        comprador_nome: input.buyerType === "hospede" ? active?.cliente_nome : input.employeeName.trim(),
        cliente_id: input.buyerType === "hospede" ? active?.cliente_id ?? null : null,
        reserva_id: input.buyerType === "hospede" ? active?.id ?? null : null,
        quarto: input.buyerType === "hospede" ? input.room : null,
        item: item.item, categoria: item.categoria, produto_id: item.produto_id,
        qtd: item.qtd, valor_unit: item.valor_unit, total: itemTotal, valor_pago: paid,
        status: paid >= itemTotal ? "pago" : paid > 0 ? "parcial" : "pendente",
        pagamento: input.payment, data: todayISO(),
      };
    });
    const { error } = await (supabase as any).from("sales").insert(rows);
    if (error) throw error;
    await refresh();
    toast.success(`Comanda salva com ${rows.length} item(ns).`);
  }

  async function saveProduct(input: any) {
    if (!companyId) throw new Error("Empresa não encontrada.");
    if (editingProduct) {
      const { error } = await (supabase as any).from("products").update({ nome: input.nome, categoria: input.categoria, preco: input.preco, custo_unitario: input.custo, estoque_minimo: input.minimo, ativo: input.ativo, updated_at: new Date().toISOString() }).eq("id", editingProduct.id).eq("company_id", companyId);
      if (error) throw error;
    } else {
      const { data, error } = await (supabase as any).from("products").insert({ company_id: companyId, nome: input.nome, categoria: input.categoria, preco: input.preco, custo_unitario: input.custo, estoque_atual: 0, estoque_total_recebido: 0, estoque_minimo: input.minimo, ativo: input.ativo }).select("id").single();
      if (error) throw error;
      if (input.inicial > 0) {
        const { error: rpcError } = await (supabase as any).rpc("register_stock_restock", { _company_id: companyId, _product_id: data.id, _quantity: input.inicial, _unit_cost: input.custo, _reason: "Estoque inicial do produto" });
        if (rpcError) throw rpcError;
      }
    }
    setProductOpen(false); setEditingProduct(null); await refresh(); toast.success("Produto salvo.");
  }

  async function saveStock(input: { quantity: number; cost: number; reason: string }) {
    if (!companyId || !stockProduct) return;
    const rpc = stockMode === "reposicao" ? "register_stock_restock" : "register_stock_count";
    const args = stockMode === "reposicao"
      ? { _company_id: companyId, _product_id: stockProduct.id, _quantity: input.quantity, _unit_cost: input.cost, _reason: input.reason }
      : { _company_id: companyId, _product_id: stockProduct.id, _counted_quantity: input.quantity, _reason: input.reason };
    const { error } = await (supabase as any).rpc(rpc, args);
    if (error) throw error;
    setStockProduct(null); await refresh(); toast.success(stockMode === "reposicao" ? "Reposição registrada." : "Contagem registrada.");
  }

  return <div>
    <PageHeader title="Vendas e estoque" subtitle="Comandas com vários itens para hóspedes ou funcionários, com baixa, reposição e ajuste físico auditáveis." action={<div className="flex flex-wrap gap-2">
      <button className="btn-ghost flex items-center gap-1.5" onClick={() => void refresh()}><RefreshCw className="h-4 w-4" /> Atualizar</button>
      <button className="btn-ghost flex items-center gap-1.5" onClick={() => setHistoryOpen(true)}><ClipboardList className="h-4 w-4" /> Movimentações</button>
      <button className="btn-ghost flex items-center gap-1.5" onClick={() => { setEditingProduct(null); setProductOpen(true); }}><PackagePlus className="h-4 w-4" /> Produto</button>
      <button className="btn-primary flex items-center gap-1.5" onClick={() => setPurchaseOpen(true)}><ShoppingCart className="h-4 w-4" /> Nova comanda</button>
    </div>} />

    <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-5">
      <Stat label="Vendas hoje" value={fmtBRL(salesToday)} icon={<ShoppingCart />} />
      <Stat label="Total recebido" value={String(received)} icon={<PackagePlus />} />
      <Stat label="Em estoque" value={String(currentQty)} icon={<Warehouse />} />
      <Stat label="Valor do estoque" value={fmtBRL(inventoryValue)} icon={<Warehouse />} />
      <Stat label="Estoque baixo" value={String(lowStock.length)} icon={<RefreshCw />} alert={lowStock.length > 0} />
    </div>

    <section className="card-surface mb-5 overflow-x-auto"><div className="border-b border-border p-4"><h3 className="font-serif text-lg font-bold">Estoque de produtos</h3><p className="text-sm text-muted-foreground">Reposições, vendas e diferenças da contagem ficam registradas.</p></div>
      {products.length === 0 ? <EmptyState text="Nenhum produto cadastrado." /> : <table className="w-full min-w-[980px] text-sm"><thead><tr className="border-b border-border text-left text-xs uppercase text-muted-foreground"><th className="p-3">Produto</th><th className="p-3">Preço</th><th className="p-3">Custo</th><th className="p-3">Total recebido</th><th className="p-3">Atual</th><th className="p-3">Valor atual</th><th className="p-3">Ações</th></tr></thead><tbody>{products.map((p) => <tr key={p.id} className="border-b border-border/50"><td className="p-3"><strong>{p.nome}</strong><div className="text-xs text-muted-foreground">{p.categoria}</div></td><td className="p-3">{fmtBRL(p.preco)}</td><td className="p-3">{fmtBRL(p.custo_unitario ?? 0)}</td><td className="p-3">{p.estoque_total_recebido ?? p.estoque_atual}</td><td className={`p-3 font-bold ${p.estoque_atual <= p.estoque_minimo ? "text-brick" : "text-pine-dark"}`}>{p.estoque_atual}</td><td className="p-3 font-semibold">{fmtBRL(p.estoque_atual * Number(p.custo_unitario ?? 0))}</td><td className="p-3"><div className="flex gap-1.5"><button className="btn-ghost py-1 text-xs" onClick={() => { setStockProduct(p); setStockMode("reposicao"); }}>Repor</button><button className="btn-ghost py-1 text-xs" onClick={() => { setStockProduct(p); setStockMode("contagem"); }}>Contagem</button><button className="btn-ghost py-1 text-xs" onClick={() => { setEditingProduct(p); setProductOpen(true); }}><Pencil className="h-3.5 w-3.5" /></button></div></td></tr>)}</tbody></table>}
    </section>

    <section className="card-surface overflow-x-auto"><div className="border-b border-border p-4"><h3 className="font-serif text-lg font-bold">Comandas registradas</h3><p className="text-sm text-muted-foreground">Vários itens aparecem juntos para o mesmo comprador.</p></div>
      {groups.length === 0 ? <EmptyState text="Nenhuma venda registrada." /> : <table className="w-full min-w-[980px] text-sm"><thead><tr className="border-b border-border text-left text-xs uppercase text-muted-foreground"><th className="p-3">Data</th><th className="p-3">Comprador</th><th className="p-3">Tipo</th><th className="p-3">Quarto</th><th className="p-3">Itens</th><th className="p-3">Total</th><th className="p-3">Pago</th><th className="p-3">Pendente</th></tr></thead><tbody>{groups.map((g) => <tr key={g.id} className="border-b border-border/50 align-top"><td className="p-3">{fmtDate(g.data)}</td><td className="p-3 font-semibold">{g.comprador}</td><td className="p-3"><span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs font-semibold">{g.tipo === "funcionario" ? <UsersRound className="h-3.5 w-3.5" /> : <UserRound className="h-3.5 w-3.5" />}{g.tipo === "funcionario" ? "Funcionário" : "Hóspede"}</span></td><td className="p-3">{g.quarto ?? "Não se aplica"}</td><td className="max-w-[360px] p-3 text-muted-foreground">{g.itens.map((i: Sale) => `${i.qtd}× ${i.item}`).join(" · ")}</td><td className="p-3 font-semibold">{fmtBRL(g.total)}</td><td className="p-3">{fmtBRL(g.pago)}</td><td className={`p-3 font-semibold ${g.total > g.pago ? "text-brick" : "text-muted-foreground"}`}>{fmtBRL(Math.max(0, g.total - g.pago))}</td></tr>)}</tbody></table>}
    </section>

    {purchaseOpen && <PurchaseModal rooms={rooms as any[]} reservations={reservations as any[]} products={activeProducts} employees={employees.data ?? []} onClose={() => setPurchaseOpen(false)} onSave={async (input) => { try { await savePurchase(input); setPurchaseOpen(false); } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao salvar comanda."); } }} />}
    {productOpen && <ProductModal editing={editingProduct} onClose={() => { setProductOpen(false); setEditingProduct(null); }} onSave={async (input) => { try { await saveProduct(input); } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao salvar produto."); } }} />}
    {stockProduct && <StockModal product={stockProduct} mode={stockMode} onClose={() => setStockProduct(null)} onSave={async (input) => { try { await saveStock(input); } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao registrar estoque."); } }} />}
    {historyOpen && <HistoryModal rows={movements.data ?? []} loading={movements.isLoading} onClose={() => setHistoryOpen(false)} />}
  </div>;
}

function Stat({ label, value, icon, alert = false }: { label: string; value: string; icon: React.ReactNode; alert?: boolean }) {
  return <div className={`stat-card ${alert ? "border-brick/40 bg-brick-bg/40" : ""}`}><div className="flex justify-between"><p className="text-[9px] font-bold uppercase text-muted-foreground">{label}</p><span className="text-primary [&>svg]:h-4 [&>svg]:w-4">{icon}</span></div><p className={`text-base font-extrabold ${alert ? "text-brick" : "text-pine-dark"}`}>{value}</p></div>;
}

function PurchaseModal({ rooms, reservations, products, employees, onClose, onSave }: { rooms: any[]; reservations: any[]; products: Product[]; employees: string[]; onClose: () => void; onSave: (input: PurchaseInput) => Promise<void> }) {
  const [buyerType, setBuyerType] = useState<"hospede" | "funcionario">("hospede");
  const [room, setRoom] = useState<number | null>(rooms[0]?.numero ?? null);
  const [employeeName, setEmployeeName] = useState("");
  const [payment, setPayment] = useState(PAYMENT_METHODS[0]);
  const [paid, setPaid] = useState<number | "">("");
  const [productId, setProductId] = useState("");
  const [manualItem, setManualItem] = useState("");
  const [category, setCategory] = useState("Geral");
  const [qty, setQty] = useState(1);
  const [unit, setUnit] = useState(0);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [saving, setSaving] = useState(false);
  const product = products.find((p) => p.id === productId);
  const active = room == null ? null : activeReservationForRoom(reservations, room);
  const total = cart.reduce((sum, item) => sum + item.qtd * item.valor_unit, 0);
  const effectivePaid = paid === "" ? total : Number(paid) || 0;

  function addItem() {
    const name = product?.nome ?? manualItem.trim();
    const itemCategory = product?.categoria ?? (category.trim() || "Geral");
    const price = product ? Number(product.preco) : Number(unit);
    if (!name || qty <= 0) return toast.error("Informe um item e uma quantidade válida.");
    const already = product ? cart.filter((i) => i.produto_id === product.id).reduce((s, i) => s + i.qtd, 0) : 0;
    if (product && already + qty > product.estoque_atual) return toast.error(`Só existem ${product.estoque_atual} unidade(s) de ${product.nome}.`);
    setCart((items) => [...items, { key: crypto.randomUUID(), produto_id: product?.id ?? null, item: name, categoria: itemCategory, qtd: qty, valor_unit: Math.max(0, price), estoque: product?.estoque_atual ?? null }]);
    setProductId(""); setManualItem(""); setCategory("Geral"); setQty(1); setUnit(0);
  }

  return <Modal open onClose={onClose} title="Nova comanda"><form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); setSaving(true); try { await onSave({ buyerType, room, employeeName, payment, amountPaid: effectivePaid, items: cart }); } finally { setSaving(false); } }}>
    <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1"><button type="button" className={buyerType === "hospede" ? "btn-primary" : "btn-ghost"} onClick={() => setBuyerType("hospede")}><UserRound className="h-4 w-4" /> Hóspede</button><button type="button" className={buyerType === "funcionario" ? "btn-primary" : "btn-ghost"} onClick={() => setBuyerType("funcionario")}><UsersRound className="h-4 w-4" /> Funcionário</button></div>
    {buyerType === "hospede" ? <><Field label="Quarto"><select className="field" value={room ?? ""} onChange={(e) => setRoom(Number(e.target.value))}>{rooms.map((r) => <option key={r.numero} value={r.numero}>Quarto {r.numero}</option>)}</select></Field><div className={`rounded-lg px-3 py-2 text-sm ${active ? "bg-sage-bg text-pine-dark" : "bg-brick-bg text-brick"}`}>{active ? `Compra de ${active.cliente_nome}` : "Este quarto não possui hospedagem ativa."}</div></> : <Field label="Funcionário"><input list="employees-list" className="field" value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} placeholder="Selecione ou digite o nome" required /><datalist id="employees-list">{employees.map((name) => <option key={name} value={name} />)}</datalist></Field>}
    <div className="rounded-lg border border-border p-3"><Field label="Produto"><select className="field" value={productId} onChange={(e) => { setProductId(e.target.value); const p = products.find((row) => row.id === e.target.value); if (p) setUnit(Number(p.preco)); }}><option value="">Venda avulsa</option>{products.map((p) => <option key={p.id} value={p.id}>{p.nome} · estoque {p.estoque_atual} · {fmtBRL(p.preco)}</option>)}</select></Field>{!product && <div className="mt-3 grid grid-cols-2 gap-3"><Field label="Item avulso"><input className="field" value={manualItem} onChange={(e) => setManualItem(e.target.value)} /></Field><Field label="Categoria"><input className="field" value={category} onChange={(e) => setCategory(e.target.value)} /></Field></div>}<div className="mt-3 grid grid-cols-2 gap-3"><Field label="Quantidade"><input type="number" min={1} className="field" value={qty} onChange={(e) => setQty(Number(e.target.value))} /></Field><Field label="Valor unitário"><input type="number" min={0} step="0.01" className="field" value={product ? product.preco : unit} onChange={(e) => setUnit(Number(e.target.value))} disabled={!!product} /></Field></div><button type="button" className="btn-ghost mt-3 flex w-full justify-center gap-1.5" onClick={addItem}><Plus className="h-4 w-4" /> Adicionar à comanda</button></div>
    {cart.length === 0 ? <div className="rounded-lg bg-muted p-3 text-center text-sm text-muted-foreground">Nenhum item adicionado.</div> : <div className="rounded-lg border border-border">{cart.map((item) => <div key={item.key} className="flex items-center justify-between border-b border-border/50 p-3 last:border-0"><div><strong>{item.qtd}× {item.item}</strong><p className="text-xs text-muted-foreground">{fmtBRL(item.valor_unit)} cada</p></div><div className="flex gap-2"><strong>{fmtBRL(item.qtd * item.valor_unit)}</strong><button type="button" className="text-xs font-bold text-brick" onClick={() => setCart((items) => items.filter((row) => row.key !== item.key))}>Remover</button></div></div>)}</div>}
    <div className="grid grid-cols-2 gap-3"><Field label="Pagamento"><select className="field" value={payment} onChange={(e) => setPayment(e.target.value)}>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</select></Field><Field label="Valor pago agora"><input type="number" min={0} step="0.01" className="field" value={paid} placeholder={String(total)} onChange={(e) => setPaid(e.target.value === "" ? "" : Number(e.target.value))} /></Field></div>
    <div className="flex justify-between rounded-lg bg-muted px-3 py-2"><span className="text-sm text-muted-foreground">Pendente {fmtBRL(Math.max(0, total - effectivePaid))}</span><strong className="font-serif text-xl">{fmtBRL(total)}</strong></div><div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button type="submit" className="btn-primary" disabled={saving || !cart.length}>{saving ? "Salvando…" : "Salvar comanda"}</button></div>
  </form></Modal>;
}

function ProductModal({ editing, onClose, onSave }: { editing: Product | null; onClose: () => void; onSave: (input: any) => Promise<void> }) {
  const [nome, setNome] = useState(editing?.nome ?? ""); const [categoria, setCategoria] = useState(editing?.categoria ?? "Geral"); const [preco, setPreco] = useState(Number(editing?.preco ?? 0)); const [custo, setCusto] = useState(Number(editing?.custo_unitario ?? 0)); const [minimo, setMinimo] = useState(Number(editing?.estoque_minimo ?? 0)); const [inicial, setInicial] = useState(0); const [ativo, setAtivo] = useState(editing?.ativo ?? true); const [saving, setSaving] = useState(false);
  return <Modal open onClose={onClose} title={editing ? "Editar produto" : "Novo produto"}><form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); setSaving(true); try { await onSave({ nome: nome.trim(), categoria: categoria.trim() || "Geral", preco: Math.max(0, preco), custo: Math.max(0, custo), minimo: Math.max(0, minimo), inicial: Math.max(0, inicial), ativo }); } finally { setSaving(false); } }}><Field label="Produto"><input className="field" value={nome} onChange={(e) => setNome(e.target.value)} required /></Field><Field label="Categoria"><input className="field" value={categoria} onChange={(e) => setCategoria(e.target.value)} /></Field><div className="grid grid-cols-2 gap-3"><Field label="Preço de venda"><input type="number" min={0} step="0.01" className="field" value={preco} onChange={(e) => setPreco(Number(e.target.value))} /></Field><Field label="Custo unitário"><input type="number" min={0} step="0.01" className="field" value={custo} onChange={(e) => setCusto(Number(e.target.value))} /></Field></div><div className="grid grid-cols-2 gap-3"><Field label="Estoque mínimo"><input type="number" min={0} className="field" value={minimo} onChange={(e) => setMinimo(Number(e.target.value))} /></Field>{!editing && <Field label="Estoque inicial"><input type="number" min={0} className="field" value={inicial} onChange={(e) => setInicial(Number(e.target.value))} /></Field>}</div>{editing && <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">Altere o saldo somente por Repor ou Contagem para preservar o histórico.</p>}<label className="flex gap-2 text-sm"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Produto ativo</label><div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button type="submit" className="btn-primary" disabled={saving}>Salvar</button></div></form></Modal>;
}

function StockModal({ product, mode, onClose, onSave }: { product: Product; mode: "reposicao" | "contagem"; onClose: () => void; onSave: (input: { quantity: number; cost: number; reason: string }) => Promise<void> }) {
  const [quantity, setQuantity] = useState(mode === "contagem" ? product.estoque_atual : 1); const [cost, setCost] = useState(Number(product.custo_unitario ?? 0)); const [reason, setReason] = useState(mode === "contagem" ? "Contagem física" : "Reposição do proprietário"); const [saving, setSaving] = useState(false);
  return <Modal open onClose={onClose} title={mode === "reposicao" ? `Repor ${product.nome}` : `Contagem de ${product.nome}`}><form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); setSaving(true); try { await onSave({ quantity: Math.max(0, quantity), cost: Math.max(0, cost), reason }); } finally { setSaving(false); } }}><div className="rounded-lg bg-muted p-3 text-sm">Saldo atual: <strong>{product.estoque_atual}</strong></div><Field label={mode === "reposicao" ? "Quantidade recebida" : "Quantidade encontrada"}><input type="number" min={mode === "reposicao" ? 1 : 0} className="field" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} /></Field>{mode === "reposicao" && <Field label="Custo unitário"><input type="number" min={0} step="0.01" className="field" value={cost} onChange={(e) => setCost(Number(e.target.value))} /></Field>}<Field label="Motivo"><input className="field" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>{mode === "contagem" && quantity !== product.estoque_atual && <p className="rounded-lg bg-brick-bg p-3 text-sm text-brick">Diferença de {Math.abs(quantity - product.estoque_atual)} unidade(s) será registrada.</p>}<div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button type="submit" className="btn-primary" disabled={saving}>Registrar</button></div></form></Modal>;
}

function HistoryModal({ rows, loading, onClose }: { rows: Movement[]; loading: boolean; onClose: () => void }) {
  return <Modal open onClose={onClose} title="Histórico de movimentações">{loading ? <p className="p-4 text-sm text-muted-foreground">Carregando…</p> : rows.length === 0 ? <EmptyState text="Nenhuma movimentação registrada." /> : <div className="max-h-[65vh] overflow-auto rounded-lg border border-border"><table className="w-full min-w-[700px] text-sm"><thead><tr className="border-b border-border text-left text-xs uppercase text-muted-foreground"><th className="p-3">Data</th><th className="p-3">Produto</th><th className="p-3">Tipo</th><th className="p-3">Qtd.</th><th className="p-3">Antes</th><th className="p-3">Depois</th><th className="p-3">Motivo</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id} className="border-b border-border/50"><td className="p-3">{new Date(r.created_at).toLocaleString("pt-BR")}</td><td className="p-3 font-semibold">{r.produto?.nome ?? "Produto"}</td><td className="p-3">{movementLabel(r.tipo)}</td><td className="p-3">{r.quantidade}</td><td className="p-3">{r.estoque_anterior}</td><td className="p-3 font-bold">{r.estoque_posterior}</td><td className="p-3 text-muted-foreground">{r.motivo ?? "—"}</td></tr>)}</tbody></table></div>}</Modal>;
}

function groupSales(sales: Sale[]) {
  const map = new Map<string, any>();
  for (const sale of [...sales].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))) {
    const id = sale.compra_id || sale.id;
    const group = map.get(id) ?? { id, comprador: sale.comprador_nome || (sale.quarto ? `Hóspede do quarto ${sale.quarto}` : "Comprador"), tipo: sale.comprador_tipo || (sale.quarto ? "hospede" : "funcionario"), quarto: sale.quarto, data: sale.data, total: 0, pago: 0, itens: [] };
    group.total += Number(sale.total); group.pago += Number(sale.valor_pago ?? sale.total); group.itens.push(sale); map.set(id, group);
  }
  return [...map.values()].slice(0, 150);
}
function movementLabel(type: string) { return ({ reposicao: "Reposição", venda: "Venda", ajuste_positivo: "Ajuste positivo", ajuste_negativo: "Ajuste negativo", estoque_inicial: "Estoque inicial" } as Record<string, string>)[type] ?? type; }
function money(value: number) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100; }
