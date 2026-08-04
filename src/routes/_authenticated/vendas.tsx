import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ClipboardList,
  PackagePlus,
  Pencil,
  Plus,
  RefreshCw,
  ShoppingCart,
  UserRound,
  UsersRound,
  Warehouse,
} from "lucide-react";
import {
  activeReservationForRoom,
  useCurrentCompany,
  useProducts,
  useReservations,
  useRooms,
  useSales,
} from "@/lib/data";
import { PAYMENT_METHODS } from "@/lib/constants";
import { fmtBRL, fmtDate, todayISO } from "@/lib/format";
import { PageHeader } from "@/components/AppLayout";
import { EmptyState, Field, Modal } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/vendas")({ component: Vendas });

type ProductRow = {
  id: string;
  company_id: string;
  nome: string;
  categoria: string;
  preco: number;
  custo_unitario?: number | null;
  estoque_atual: number;
  estoque_total_recebido?: number | null;
  estoque_minimo: number;
  ativo: boolean;
};

type SaleRow = {
  id: string;
  compra_id?: string | null;
  comprador_tipo?: "hospede" | "funcionario" | null;
  comprador_nome?: string | null;
  cliente_id?: string | null;
  reserva_id?: string | null;
  quarto: number | null;
  data: string;
  item: string;
  categoria?: string | null;
  produto_id?: string | null;
  qtd: number;
  valor_unit: number;
  total: number;
  valor_pago?: number | null;
  status?: string | null;
  pagamento: string;
  created_at: string;
};

type StockMovement = {
  id: string;
  produto_id: string;
  tipo: string;
  quantidade: number;
  estoque_anterior: number;
  estoque_posterior: number;
  custo_unitario: number;
  motivo: string | null;
  created_at: string;
  produto?: { nome?: string | null } | null;
};

type Employee = { id: string; nome: string; role: string };

type CartItem = {
  key: string;
  produto_id: string | null;
  item: string;
  categoria: string;
  qtd: number;
  valor_unit: number;
  estoque_disponivel: number | null;
};

type PurchaseGroup = {
  id: string;
  comprador: string;
  tipo: string;
  quarto: number | null;
  data: string;
  pagamento: string;
  total: number;
  pago: number;
  itens: SaleRow[];
};

function Vendas() {
  const currentCompany = useCurrentCompany();
  const companyId = currentCompany.data?.id;
  const { data: rooms = [] } = useRooms();
  const { data: reservations = [] } = useReservations();
  const { data: rawProducts = [] } = useProducts();
  const { data: rawSales = [] } = useSales();
  const queryClient = useQueryClient();

  const products = rawProducts as unknown as ProductRow[];
  const sales = rawSales as unknown as SaleRow[];
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductRow | null>(null);
  const [stockProduct, setStockProduct] = useState<ProductRow | null>(null);
  const [stockMode, setStockMode] = useState<"reposicao" | "contagem">("reposicao");
  const [historyOpen, setHistoryOpen] = useState(false);

  const movements = useQuery({
    queryKey: ["stock_movements", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<StockMovement[]> => {
      const { data, error } = await (supabase as any)
        .from("stock_movements")
        .select("id,produto_id,tipo,quantidade,estoque_anterior,estoque_posterior,custo_unitario,motivo,created_at,produto:products(nome)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as StockMovement[];
    },
  });

  const employees = useQuery({
    queryKey: ["sales_employees", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<Employee[]> => {
      const { data: members, error: membersError } = await (supabase as any)
        .from("company_members")
        .select("user_id,role")
        .eq("company_id", companyId)
        .eq("ativo", true);
      if (membersError) throw membersError;
      const ids = [...new Set((members ?? []).map((row: any) => row.user_id).filter(Boolean))];
      if (!ids.length) return [];
      const { data: profiles, error: profileError } = await (supabase as any)
        .from("profiles")
        .select("id,nome,email")
        .in("id", ids);
      if (profileError) throw profileError;
      const profileMap = new Map((profiles ?? []).map((row: any) => [row.id, row]));
      return (members ?? []).map((member: any) => {
        const profile = profileMap.get(member.user_id) as any;
        return {
          id: member.user_id,
          nome: profile?.nome || profile?.email || `Funcionário ${String(member.user_id).slice(0, 8)}`,
          role: member.role,
        };
      });
    },
  });

  const activeProducts = products.filter((product) => product.ativo);
  const lowStock = activeProducts.filter((product) => product.estoque_atual <= product.estoque_minimo);
  const quantityReceived = products.reduce(
    (sum, product) => sum + Number(product.estoque_total_recebido ?? product.estoque_atual ?? 0),
    0,
  );
  const quantityCurrent = products.reduce((sum, product) => sum + Number(product.estoque_atual ?? 0), 0);
  const inventoryValue = products.reduce(
    (sum, product) => sum + Number(product.estoque_atual ?? 0) * Number(product.custo_unitario ?? 0),
    0,
  );
  const salesToday = sales
    .filter((sale) => sale.data === todayISO())
    .reduce((sum, sale) => sum + Number(sale.total ?? 0), 0);

  const purchaseGroups = useMemo(() => groupPurchases(sales), [sales]);

  async function refreshAll() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["products"] }),
      queryClient.invalidateQueries({ queryKey: ["sales"] }),
      queryClient.invalidateQueries({ queryKey: ["stock_movements"] }),
    ]);
  }

  async function savePurchase(input: {
    buyerType: "hospede" | "funcionario";
    room: number | null;
    employeeName: string;
    payment: string;
    amountPaid: number;
    items: CartItem[];
  }) {
    if (!companyId) return toast.error("Empresa não encontrada.");
    if (!input.items.length) return toast.error("Adicione ao menos um item à comanda.");

    const activeReservation =
      input.buyerType === "hospede" && input.room != null
        ? activeReservationForRoom(reservations, input.room)
        : null;

    if (input.buyerType === "hospede" && !activeReservation) {
      return toast.error("Selecione um quarto com hóspede em hospedagem ativa.");
    }
    if (input.buyerType === "funcionario" && !input.employeeName.trim()) {
      return toast.error("Informe o funcionário responsável pela compra.");
    }

    for (const item of input.items) {
      if (item.estoque_disponivel != null && item.qtd > item.estoque_disponivel) {
        return toast.error(`Estoque insuficiente para ${item.item}.`);
      }
    }

    const purchaseId = crypto.randomUUID();
    const purchaseTotal = input.items.reduce((sum, item) => sum + item.qtd * item.valor_unit, 0);
    const paidTotal = Math.max(0, Math.min(purchaseTotal, Number(input.amountPaid) || 0));
    let paidRemaining = paidTotal;

    const rows = input.items.map((item, index) => {
      const itemTotal = roundMoney(item.qtd * item.valor_unit);
      const isLast = index === input.items.length - 1;
      const proportional = purchaseTotal > 0 ? roundMoney((itemTotal / purchaseTotal) * paidTotal) : 0;
      const itemPaid = isLast ? roundMoney(paidRemaining) : Math.min(itemTotal, proportional, paidRemaining);
      paidRemaining = roundMoney(paidRemaining - itemPaid);
      return {
        company_id: companyId,
        compra_id: purchaseId,
        comprador_tipo: input.buyerType,
        comprador_nome:
          input.buyerType === "hospede"
            ? activeReservation?.cliente_nome ?? "Hóspede"
            : input.employeeName.trim(),
        cliente_id: input.buyerType === "hospede" ? activeReservation?.cliente_id ?? null : null,
        reserva_id: input.buyerType === "hospede" ? activeReservation?.id ?? null : null,
        quarto: input.buyerType === "hospede" ? input.room : null,
        item: item.item,
        categoria: item.categoria,
        produto_id: item.produto_id,
        qtd: item.qtd,
        valor_unit: item.valor_unit,
        total: itemTotal,
        valor_pago: itemPaid,
        status: itemPaid >= itemTotal ? "pago" : itemPaid > 0 ? "parcial" : "pendente",
        pagamento: input.payment,
        data: todayISO(),
      };
    });

    const { error } = await (supabase as any).from("sales").insert(rows);
    if (error) throw error;
    await refreshAll();
    toast.success(`Comanda salva com ${rows.length} item(ns).`);
  }

  async function saveProduct(input: {
    nome: string;
    categoria: string;
    preco: number;
    custoUnitario: number;
    estoqueMinimo: number;
    estoqueInicial: number;
    ativo: boolean;
  }) {
    if (!companyId) return toast.error("Empresa não encontrada.");
    if (editingProduct) {
      const { error } = await (supabase as any)
        .from("products")
        .update({
          nome: input.nome,
          categoria: input.categoria,
          preco: input.preco,
          custo_unitario: input.custoUnitario,
          estoque_minimo: input.estoqueMinimo,
          ativo: input.ativo,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingProduct.id)
        .eq("company_id", companyId);
      if (error) throw error;
      toast.success("Produto atualizado.");
    } else {
      const { data, error } = await (supabase as any)
        .from("products")
        .insert({
          company_id: companyId,
          nome: input.nome,
          categoria: input.categoria,
          preco: input.preco,
          custo_unitario: input.custoUnitario,
          estoque_atual: 0,
          estoque_total_recebido: 0,
          estoque_minimo: input.estoqueMinimo,
          ativo: input.ativo,
        })
        .select("id")
        .single();
      if (error) throw error;
      if (input.estoqueInicial > 0) {
        const { error: restockError } = await (supabase as any).rpc("register_stock_restock", {
          _company_id: companyId,
          _product_id: data.id,
          _quantity: input.estoqueInicial,
          _unit_cost: input.custoUnitario,
          _reason: "Estoque inicial do produto",
        });
        if (restockError) throw restockError;
      }
      toast.success("Produto cadastrado.");
    }
    setProductOpen(false);
    setEditingProduct(null);
    await refreshAll();
  }

  async function saveStockMovement(input: { quantity: number; unitCost: number; reason: string }) {
    if (!companyId || !stockProduct) return;
    const rpc = stockMode === "reposicao" ? "register_stock_restock" : "register_stock_count";
    const args =
      stockMode === "reposicao"
        ? {
            _company_id: companyId,
            _product_id: stockProduct.id,
            _quantity: input.quantity,
            _unit_cost: input.unitCost,
            _reason: input.reason,
          }
        : {
            _company_id: companyId,
            _product_id: stockProduct.id,
            _counted_quantity: input.quantity,
            _reason: input.reason,
          };
    const { error } = await (supabase as any).rpc(rpc, args);
    if (error) throw error;
    toast.success(stockMode === "reposicao" ? "Reposição registrada." : "Contagem física registrada.");
    setStockProduct(null);
    await refreshAll();
  }

  return (
    <div>
      <PageHeader
        title="Vendas e estoque"
        subtitle="Comandas com vários itens para hóspedes ou funcionários, com baixa, reposição e ajuste físico auditáveis."
        action={
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost flex items-center gap-1.5" onClick={() => void refreshAll()}>
              <RefreshCw className="h-4 w-4" /> Atualizar
            </button>
            <button type="button" className="btn-ghost flex items-center gap-1.5" onClick={() => setHistoryOpen(true)}>
              <ClipboardList className="h-4 w-4" /> Movimentações
            </button>
            <button type="button" className="btn-ghost flex items-center gap-1.5" onClick={() => { setEditingProduct(null); setProductOpen(true); }}>
              <PackagePlus className="h-4 w-4" /> Produto
            </button>
            <button type="button" className="btn-primary flex items-center gap-1.5" onClick={() => setPurchaseOpen(true)}>
              <ShoppingCart className="h-4 w-4" /> Nova comanda
            </button>
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-5">
        <Stat label="Vendas hoje" value={fmtBRL(salesToday)} icon={<ShoppingCart />} />
        <Stat label="Total recebido" value={String(quantityReceived)} icon={<PackagePlus />} />
        <Stat label="Em estoque" value={String(quantityCurrent)} icon={<Warehouse />} />
        <Stat label="Valor do estoque" value={fmtBRL(inventoryValue)} icon={<Warehouse />} />
        <Stat label="Estoque baixo" value={String(lowStock.length)} icon={<RefreshCw />} alert={lowStock.length > 0} />
      </div>

      <section className="card-surface mb-5 overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
          <div>
            <h3 className="font-serif text-lg font-bold">Estoque de produtos</h3>
            <p className="text-sm text-muted-foreground">O saldo atual não é sobrescrito: reposições, vendas e divergências ficam no histórico.</p>
          </div>
        </div>
        {products.length === 0 ? (
          <EmptyState text="Nenhum produto cadastrado." />
        ) : (
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="p-3">Produto</th>
                <th className="p-3">Categoria</th>
                <th className="p-3">Preço venda</th>
                <th className="p-3">Custo</th>
                <th className="p-3">Total recebido</th>
                <th className="p-3">Estoque atual</th>
                <th className="p-3">Valor atual</th>
                <th className="p-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id} className="border-b border-border/50">
                  <td className="p-3 font-semibold">{product.nome}</td>
                  <td className="p-3 text-muted-foreground">{product.categoria}</td>
                  <td className="p-3">{fmtBRL(product.preco)}</td>
                  <td className="p-3">{fmtBRL(product.custo_unitario ?? 0)}</td>
                  <td className="p-3">{product.estoque_total_recebido ?? product.estoque_atual}</td>
                  <td className={`p-3 font-bold ${product.estoque_atual <= product.estoque_minimo ? "text-brick" : "text-pine-dark"}`}>
                    {product.estoque_atual}
                  </td>
                  <td className="p-3 font-semibold">{fmtBRL(product.estoque_atual * Number(product.custo_unitario ?? 0))}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1.5">
                      <button className="btn-ghost py-1 text-xs" onClick={() => { setStockProduct(product); setStockMode("reposicao"); }}>
                        Repor
                      </button>
                      <button className="btn-ghost py-1 text-xs" onClick={() => { setStockProduct(product); setStockMode("contagem"); }}>
                        Contagem
                      </button>
                      <button className="btn-ghost py-1 text-xs" onClick={() => { setEditingProduct(product); setProductOpen(true); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card-surface overflow-x-auto">
        <div className="border-b border-border p-4">
          <h3 className="font-serif text-lg font-bold">Comandas registradas</h3>
          <p className="text-sm text-muted-foreground">Cada linha reúne todos os produtos comprados pela mesma pessoa no mesmo lançamento.</p>
        </div>
        {purchaseGroups.length === 0 ? (
          <EmptyState text="Nenhuma venda registrada." />
        ) : (
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="p-3">Data</th>
                <th className="p-3">Comprador</th>
                <th className="p-3">Tipo</th>
                <th className="p-3">Quarto</th>
                <th className="p-3">Itens</th>
                <th className="p-3">Pagamento</th>
                <th className="p-3">Total</th>
                <th className="p-3">Pago</th>
                <th className="p-3">Pendente</th>
              </tr>
            </thead>
            <tbody>
              {purchaseGroups.map((group) => (
                <tr key={group.id} className="border-b border-border/50 align-top">
                  <td className="whitespace-nowrap p-3">{fmtDate(group.data)}</td>
                  <td className="p-3 font-semibold">{group.comprador}</td>
                  <td className="p-3">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-1 text-xs font-semibold">
                      {group.tipo === "funcionario" ? <UsersRound className="h-3.5 w-3.5" /> : <UserRound className="h-3.5 w-3.5" />}
                      {group.tipo === "funcionario" ? "Funcionário" : "Hóspede"}
                    </span>
                  </td>
                  <td className="p-3">{group.quarto ?? "Não se aplica"}</td>
                  <td className="max-w-[360px] p-3 text-muted-foreground">
                    {group.itens.map((item) => `${item.qtd}× ${item.item}`).join(" · ")}
                  </td>
                  <td className="p-3">{group.pagamento}</td>
                  <td className="p-3 font-semibold">{fmtBRL(group.total)}</td>
                  <td className="p-3">{fmtBRL(group.pago)}</td>
                  <td className={`p-3 font-semibold ${group.total > group.pago ? "text-brick" : "text-muted-foreground"}`}>
                    {fmtBRL(Math.max(0, group.total - group.pago))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {purchaseOpen && (
        <PurchaseModal
          rooms={rooms}
          reservations={reservations}
          products={activeProducts}
          employees={employees.data ?? []}
          onClose={() => setPurchaseOpen(false)}
          onSave={async (input) => {
            try {
              await savePurchase(input);
              setPurchaseOpen(false);
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Não foi possível salvar a comanda.");
            }
          }}
        />
      )}

      {productOpen && (
        <ProductModal
          editing={editingProduct}
          onClose={() => { setProductOpen(false); setEditingProduct(null); }}
          onSave={async (input) => {
            try {
              await saveProduct(input);
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Não foi possível salvar o produto.");
            }
          }}
        />
      )}

      {stockProduct && (
        <StockModal
          product={stockProduct}
          mode={stockMode}
          onClose={() => setStockProduct(null)}
          onSave={async (input) => {
            try {
              await saveStockMovement(input);
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Não foi possível registrar o estoque.");
            }
          }}
        />
      )}

      {historyOpen && (
        <StockHistoryModal
          rows={movements.data ?? []}
          loading={movements.isLoading}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </div>
  );
}

function Stat({ label, value, icon, alert = false }: { label: string; value: string; icon: React.ReactNode; alert?: boolean }) {
  return (
    <div className={`stat-card ${alert ? "border-brick/40 bg-brick-bg/40" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[9px] font-bold uppercase text-muted-foreground">{label}</p>
        <span className="text-primary [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      </div>
      <p className={`text-base font-extrabold ${alert ? "text-brick" : "text-pine-dark"}`}>{value}</p>
    </div>
  );
}

function PurchaseModal({
  rooms,
  reservations,
  products,
  employees,
  onClose,
  onSave,
}: {
  rooms: Array<{ numero: number }>;
  reservations: any[];
  products: ProductRow[];
  employees: Employee[];
  onClose: () => void;
  onSave: (input: {
    buyerType: "hospede" | "funcionario";
    room: number | null;
    employeeName: string;
    payment: string;
    amountPaid: number;
    items: CartItem[];
  }) => Promise<void>;
}) {
  const [buyerType, setBuyerType] = useState<"hospede" | "funcionario">("hospede");
  const [room, setRoom] = useState<number | null>(rooms[0]?.numero ?? null);
  const [employeeName, setEmployeeName] = useState("");
  const [payment, setPayment] = useState(PAYMENT_METHODS[0]);
  const [amountPaid, setAmountPaid] = useState<number | "">("");
  const [productId, setProductId] = useState("");
  const [manualItem, setManualItem] = useState("");
  const [manualCategory, setManualCategory] = useState("Geral");
  const [quantity, setQuantity] = useState(1);
  const [unitValue, setUnitValue] = useState(0);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [saving, setSaving] = useState(false);

  const product = products.find((row) => row.id === productId);
  const activeGuest = room == null ? null : activeReservationForRoom(reservations, room);
  const total = cart.reduce((sum, item) => sum + item.qtd * item.valor_unit, 0);
  const effectivePaid = amountPaid === "" ? total : Number(amountPaid) || 0;

  function addItem() {
    const itemName = product?.nome ?? manualItem.trim();
    const category = product?.categoria ?? manualCategory.trim() || "Geral";
    const value = product ? Number(product.preco) : Number(unitValue);
    if (!itemName) return toast.error("Selecione um produto ou informe o item avulso.");
    if (quantity <= 0) return toast.error("A quantidade deve ser maior que zero.");
    const alreadyInCart = product
      ? cart.filter((row) => row.produto_id === product.id).reduce((sum, row) => sum + row.qtd, 0)
      : 0;
    if (product && alreadyInCart + quantity > product.estoque_atual) {
      return toast.error(`Só existem ${product.estoque_atual} unidade(s) de ${product.nome}.`);
    }
    setCart((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        produto_id: product?.id ?? null,
        item: itemName,
        categoria: category,
        qtd: quantity,
        valor_unit: Math.max(0, value),
        estoque_disponivel: product?.estoque_atual ?? null,
      },
    ]);
    setProductId("");
    setManualItem("");
    setManualCategory("Geral");
    setQuantity(1);
    setUnitValue(0);
  }

  return (
    <Modal open onClose={onClose} title="Nova comanda">
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          try {
            await onSave({ buyerType, room, employeeName, payment, amountPaid: effectivePaid, items: cart });
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
          <button type="button" className={buyerType === "hospede" ? "btn-primary" : "btn-ghost"} onClick={() => setBuyerType("hospede")}>
            <UserRound className="h-4 w-4" /> Hóspede
          </button>
          <button type="button" className={buyerType === "funcionario" ? "btn-primary" : "btn-ghost"} onClick={() => setBuyerType("funcionario")}>
            <UsersRound className="h-4 w-4" /> Funcionário
          </button>
        </div>

        {buyerType === "hospede" ? (
          <>
            <Field label="Quarto do hóspede">
              <select className="field" value={room ?? ""} onChange={(event) => setRoom(Number(event.target.value))}>
                {rooms.map((row) => <option key={row.numero} value={row.numero}>Quarto {row.numero}</option>)}
              </select>
            </Field>
            <div className={`rounded-lg px-3 py-2 text-sm ${activeGuest ? "bg-sage-bg text-pine-dark" : "bg-brick-bg text-brick"}`}>
              {activeGuest ? `Compra de ${activeGuest.cliente_nome}` : "Este quarto não possui hospedagem ativa."}
            </div>
          </>
        ) : (
          <Field label="Funcionário">
            <input
              list="employees-list"
              className="field"
              value={employeeName}
              onChange={(event) => setEmployeeName(event.target.value)}
              placeholder="Selecione ou digite o nome"
              required
            />
            <datalist id="employees-list">
              {employees.map((employee) => <option key={employee.id} value={employee.nome}>{employee.role}</option>)}
            </datalist>
          </Field>
        )}

        <div className="rounded-lg border border-border p-3">
          <h4 className="mb-3 font-semibold">Adicionar item</h4>
          <Field label="Produto cadastrado">
            <select
              className="field"
              value={productId}
              onChange={(event) => {
                const id = event.target.value;
                setProductId(id);
                const selected = products.find((row) => row.id === id);
                if (selected) setUnitValue(Number(selected.preco));
              }}
            >
              <option value="">Venda avulsa</option>
              {products.map((row) => (
                <option key={row.id} value={row.id}>{row.nome} · estoque {row.estoque_atual} · {fmtBRL(row.preco)}</option>
              ))}
            </select>
          </Field>
          {!product && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Item avulso"><input className="field" value={manualItem} onChange={(event) => setManualItem(event.target.value)} /></Field>
              <Field label="Categoria"><input className="field" value={manualCategory} onChange={(event) => setManualCategory(event.target.value)} /></Field>
            </div>
          )}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Quantidade"><input type="number" min={1} className="field" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></Field>
            <Field label="Valor unitário"><input type="number" min={0} step="0.01" className="field" value={product ? product.preco : unitValue} onChange={(event) => setUnitValue(Number(event.target.value))} disabled={!!product} /></Field>
          </div>
          <button type="button" className="btn-ghost mt-3 flex w-full items-center justify-center gap-1.5" onClick={addItem}>
            <Plus className="h-4 w-4" /> Adicionar à comanda
          </button>
        </div>

        {cart.length === 0 ? (
          <div className="rounded-lg bg-muted p-3 text-center text-sm text-muted-foreground">Nenhum item adicionado.</div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            {cart.map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-3 border-b border-border/60 p-3 last:border-b-0">
                <div><strong>{item.qtd}× {item.item}</strong><p className="text-xs text-muted-foreground">{item.categoria} · {fmtBRL(item.valor_unit)} cada</p></div>
                <div className="flex items-center gap-2"><strong>{fmtBRL(item.qtd * item.valor_unit)}</strong><button type="button" className="text-xs font-bold text-brick" onClick={() => setCart((rows) => rows.filter((row) => row.key !== item.key))}>Remover</button></div>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Pagamento"><select className="field" value={payment} onChange={(event) => setPayment(event.target.value)}>{PAYMENT_METHODS.map((method) => <option key={method}>{method}</option>)}</select></Field>
          <Field label="Valor pago agora"><input type="number" min={0} step="0.01" className="field" value={amountPaid} placeholder={String(total)} onChange={(event) => setAmountPaid(event.target.value === "" ? "" : Number(event.target.value))} /></Field>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2">
          <span className="text-sm text-muted-foreground">{cart.length} item(ns) · pendente {fmtBRL(Math.max(0, total - effectivePaid))}</span>
          <strong className="font-serif text-xl">{fmtBRL(total)}</strong>
        </div>
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button type="submit" className="btn-primary" disabled={saving || !cart.length}>{saving ? "Salvando…" : "Salvar comanda"}</button></div>
      </form>
    </Modal>
  );
}

function ProductModal({ editing, onClose, onSave }: {
  editing: ProductRow | null;
  onClose: () => void;
  onSave: (input: { nome: string; categoria: string; preco: number; custoUnitario: number; estoqueMinimo: number; estoqueInicial: number; ativo: boolean }) => Promise<void>;
}) {
  const [nome, setNome] = useState(editing?.nome ?? "");
  const [categoria, setCategoria] = useState(editing?.categoria ?? "Geral");
  const [preco, setPreco] = useState(Number(editing?.preco ?? 0));
  const [custo, setCusto] = useState(Number(editing?.custo_unitario ?? 0));
  const [minimo, setMinimo] = useState(Number(editing?.estoque_minimo ?? 0));
  const [inicial, setInicial] = useState(0);
  const [ativo, setAtivo] = useState(editing?.ativo ?? true);
  const [saving, setSaving] = useState(false);
  return (
    <Modal open onClose={onClose} title={editing ? "Editar produto" : "Novo produto"}>
      <form className="space-y-3" onSubmit={async (event) => { event.preventDefault(); if (!nome.trim()) return toast.error("Informe o produto."); setSaving(true); try { await onSave({ nome: nome.trim(), categoria: categoria.trim() || "Geral", preco: Math.max(0, preco), custoUnitario: Math.max(0, custo), estoqueMinimo: Math.max(0, minimo), estoqueInicial: Math.max(0, inicial), ativo }); } finally { setSaving(false); } }}>
        <Field label="Produto"><input className="field" value={nome} onChange={(event) => setNome(event.target.value)} required /></Field>
        <Field label="Categoria"><input className="field" value={categoria} onChange={(event) => setCategoria(event.target.value)} required /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Preço de venda"><input type="number" min={0} step="0.01" className="field" value={preco} onChange={(event) => setPreco(Number(event.target.value))} /></Field>
          <Field label="Custo unitário"><input type="number" min={0} step="0.01" className="field" value={custo} onChange={(event) => setCusto(Number(event.target.value))} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Estoque mínimo"><input type="number" min={0} className="field" value={minimo} onChange={(event) => setMinimo(Number(event.target.value))} /></Field>
          {!editing && <Field label="Estoque inicial"><input type="number" min={0} className="field" value={inicial} onChange={(event) => setInicial(Number(event.target.value))} /></Field>}
        </div>
        {editing && <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">Para alterar o saldo use Repor ou Contagem. Assim a diferença fica registrada no histórico.</p>}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ativo} onChange={(event) => setAtivo(event.target.checked)} /> Produto ativo para venda</label>
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button type="submit" className="btn-primary" disabled={saving}>{saving ? "Salvando…" : "Salvar"}</button></div>
      </form>
    </Modal>
  );
}

function StockModal({ product, mode, onClose, onSave }: {
  product: ProductRow;
  mode: "reposicao" | "contagem";
  onClose: () => void;
  onSave: (input: { quantity: number; unitCost: number; reason: string }) => Promise<void>;
}) {
  const [quantity, setQuantity] = useState(mode === "contagem" ? product.estoque_atual : 1);
  const [unitCost, setUnitCost] = useState(Number(product.custo_unitario ?? 0));
  const [reason, setReason] = useState(mode === "contagem" ? "Contagem física" : "Reposição do proprietário");
  const [saving, setSaving] = useState(false);
  return (
    <Modal open onClose={onClose} title={mode === "reposicao" ? `Repor ${product.nome}` : `Contagem de ${product.nome}`}>
      <form className="space-y-3" onSubmit={async (event) => { event.preventDefault(); setSaving(true); try { await onSave({ quantity: Math.max(0, quantity), unitCost: Math.max(0, unitCost), reason }); } finally { setSaving(false); } }}>
        <div className="rounded-lg bg-muted p-3 text-sm">Saldo atual: <strong>{product.estoque_atual}</strong></div>
        <Field label={mode === "reposicao" ? "Quantidade recebida" : "Quantidade encontrada na contagem"}><input type="number" min={mode === "reposicao" ? 1 : 0} className="field" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} required /></Field>
        {mode === "reposicao" && <Field label="Custo unitário"><input type="number" min={0} step="0.01" className="field" value={unitCost} onChange={(event) => setUnitCost(Number(event.target.value))} /></Field>}
        <Field label="Motivo / observação"><input className="field" value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
        {mode === "contagem" && quantity !== product.estoque_atual && <p className="rounded-lg bg-brick-bg px-3 py-2 text-sm text-brick">Será registrado um ajuste de {Math.abs(quantity - product.estoque_atual)} unidade(s), sem apagar o saldo anterior.</p>}
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button type="submit" className="btn-primary" disabled={saving}>{saving ? "Registrando…" : "Registrar"}</button></div>
      </form>
    </Modal>
  );
}

function StockHistoryModal({ rows, loading, onClose }: { rows: StockMovement[]; loading: boolean; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title="Histórico de movimentações">
      {loading ? <p className="p-4 text-sm text-muted-foreground">Carregando…</p> : rows.length === 0 ? <EmptyState text="Nenhuma movimentação registrada." /> : (
        <div className="max-h-[65vh] overflow-auto rounded-lg border border-border">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="sticky top-0 border-b border-border bg-card text-left text-xs uppercase text-muted-foreground"><th className="p-3">Data</th><th className="p-3">Produto</th><th className="p-3">Tipo</th><th className="p-3">Qtd.</th><th className="p-3">Antes</th><th className="p-3">Depois</th><th className="p-3">Motivo</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.id} className="border-b border-border/50"><td className="whitespace-nowrap p-3">{new Date(row.created_at).toLocaleString("pt-BR")}</td><td className="p-3 font-semibold">{row.produto?.nome ?? "Produto"}</td><td className="p-3">{movementLabel(row.tipo)}</td><td className="p-3">{row.quantidade}</td><td className="p-3">{row.estoque_anterior}</td><td className="p-3 font-bold">{row.estoque_posterior}</td><td className="p-3 text-muted-foreground">{row.motivo ?? "—"}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

function groupPurchases(sales: SaleRow[]): PurchaseGroup[] {
  const groups = new Map<string, PurchaseGroup>();
  for (const sale of [...sales].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))) {
    const key = sale.compra_id || sale.id;
    const current = groups.get(key) ?? {
      id: key,
      comprador: sale.comprador_nome || (sale.quarto ? `Hóspede do quarto ${sale.quarto}` : "Comprador não identificado"),
      tipo: sale.comprador_tipo || (sale.quarto ? "hospede" : "funcionario"),
      quarto: sale.quarto,
      data: sale.data,
      pagamento: sale.pagamento,
      total: 0,
      pago: 0,
      itens: [],
    };
    current.total += Number(sale.total ?? 0);
    current.pago += Number(sale.valor_pago ?? sale.total ?? 0);
    current.itens.push(sale);
    groups.set(key, current);
  }
  return [...groups.values()].slice(0, 150);
}

function movementLabel(type: string) {
  if (type === "reposicao") return "Reposição";
  if (type === "venda") return "Venda";
  if (type === "ajuste_positivo") return "Ajuste positivo";
  if (type === "ajuste_negativo") return "Ajuste negativo";
  if (type === "estoque_inicial") return "Estoque inicial";
  return type;
}

function roundMoney(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}
