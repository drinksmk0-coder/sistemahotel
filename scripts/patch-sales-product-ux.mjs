import fs from "node:fs";

const filePath = "src/routes/_authenticated/vendas.tsx";
let source = fs.readFileSync(filePath, "utf8");

function ensureReplace(search, replacement, label) {
  if (source.includes(replacement)) return;
  if (!source.includes(search)) throw new Error(`Trecho não encontrado: ${label}`);
  source = source.replace(search, replacement);
}

ensureReplace(
  'import { ClipboardList, PackagePlus, Pencil, Plus, RefreshCw, ShoppingCart, Trash2, UserRound, UsersRound, Warehouse } from "lucide-react";',
  'import { ClipboardList, PackagePlus, Pencil, Plus, RefreshCw, Search, ShoppingCart, Trash2, UserRound, UsersRound, Warehouse } from "lucide-react";',
  "ícone de busca",
);

ensureReplace(
  '  const [historyOpen, setHistoryOpen] = useState(false);',
  '  const [historyOpen, setHistoryOpen] = useState(false);\n  const [productSearch, setProductSearch] = useState("");',
  "estado da busca no estoque",
);

ensureReplace(
  '  const groups = useMemo(() => groupSales(sales), [sales]);',
  '  const groups = useMemo(() => groupSales(sales), [sales]);\n  const productSearchTerm = normalizeSearch(productSearch);\n  const filteredProducts = useMemo(() => {\n    if (!productSearchTerm) return products;\n    return products.filter((product) =>\n      normalizeSearch(`${product.nome} ${product.categoria} ${product.unidade ?? ""}`).includes(productSearchTerm),\n    );\n  }, [products, productSearchTerm]);',
  "filtro de produtos",
);

ensureReplace(
  '  async function saveProduct(input: ProductFormInput) {\n    if (!companyId) throw new Error("Empresa não encontrada.");',
  '  async function saveProduct(input: ProductFormInput) {\n    if (!companyId) throw new Error("Empresa não encontrada.");\n    const wasEditing = Boolean(editingProduct);',
  "controle de edição",
);

ensureReplace(
`    if (editingProduct) {
      let { error } = await (supabase as any).from("products").update(base).eq("id", editingProduct.id).eq("company_id", companyId);
      if (error) {
        const legacy = await (supabase as any).from("products").update({
          nome: input.nome,
          categoria: input.categoria,
          preco: input.preco,
          estoque_minimo: input.minimo,
          ativo: input.ativo,
        }).eq("id", editingProduct.id);
        error = legacy.error;
      }
      if (error) throw error;
    } else {`,
`    if (editingProduct) {
      let { error } = await (supabase as any).from("products").update(base).eq("id", editingProduct.id).eq("company_id", companyId);
      if (error) {
        const legacy = await (supabase as any).from("products").update({
          nome: input.nome,
          categoria: input.categoria,
          preco: input.preco,
          estoque_minimo: input.minimo,
          ativo: input.ativo,
        }).eq("id", editingProduct.id).eq("company_id", companyId);
        error = legacy.error;
      }
      if (error) throw error;

      const requestedStock = Math.max(0, Math.round(input.inicial));
      if (requestedStock !== Number(editingProduct.estoque_atual)) {
        let stockResult = await (supabase as any).rpc("register_stock_count", {
          _company_id: companyId,
          _product_id: editingProduct.id,
          _counted_quantity: requestedStock,
          _reason: "Ajuste feito na edição do produto",
        });
        if (stockResult.error) {
          stockResult = await (supabase as any)
            .from("products")
            .update({ estoque_atual: requestedStock, updated_at: new Date().toISOString() })
            .eq("id", editingProduct.id)
            .eq("company_id", companyId);
        }
        if (stockResult.error) throw stockResult.error;
      }
    } else {`,
  "edição do estoque atual",
);

ensureReplace(
  '    setProductOpen(false); setEditingProduct(null); await refresh(); toast.success("Produto e estoque inicial salvos.");',
  '    setProductOpen(false); setEditingProduct(null); await refresh(); toast.success(wasEditing ? "Produto e estoque atualizados." : "Produto e estoque inicial salvos.");',
  "mensagem de produto salvo",
);

ensureReplace(
  '      `Excluir a comanda de ${group.comprador} no valor de ${fmtBRL(group.total)}? O estoque será devolvido e o histórico ficará preservado como cancelado.`,',
  '      `Excluir definitivamente a comanda de ${group.comprador} no valor de ${fmtBRL(group.total)}? Ela sairá do histórico e dos relatórios/CSV, e o estoque será devolvido.`,',
  "confirmação de exclusão definitiva",
);

ensureReplace(
  '    toast.success("Comanda excluída, estoque devolvido e histórico preservado.");',
  '    toast.success("Comanda excluída definitivamente e estoque devolvido.");',
  "mensagem de exclusão",
);

ensureReplace(
  '    <section data-mobile-product-cards className="mb-5 space-y-3 md:hidden">',
`    <div className="mb-4 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-sm">
      <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
      <input
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        value={productSearch}
        onChange={(event) => setProductSearch(event.target.value)}
        placeholder="Digite o nome do produto para localizar"
        aria-label="Pesquisar produto no estoque"
      />
      {productSearch && <button type="button" className="text-xs font-bold text-primary" onClick={() => setProductSearch("")}>Limpar</button>}
    </div>

    <section data-mobile-product-cards className="mb-5 space-y-3 md:hidden">`,
  "campo de busca do estoque",
);

ensureReplace(
  '{products.length === 0 ? <EmptyState text="Nenhum produto cadastrado." /> : products.map((p) => (',
  '{filteredProducts.length === 0 ? <EmptyState text={products.length === 0 ? "Nenhum produto cadastrado." : "Nenhum produto encontrado na busca."} /> : filteredProducts.map((p) => (',
  "cards móveis filtrados",
);

ensureReplace(
  '{products.length === 0 ? <EmptyState text="Nenhum produto cadastrado." /> : <table className="w-full min-w-[1060px] text-sm"><thead>',
  '{filteredProducts.length === 0 ? <EmptyState text={products.length === 0 ? "Nenhum produto cadastrado." : "Nenhum produto encontrado na busca."} /> : <table className="w-full min-w-[1060px] text-sm"><thead>',
  "tabela filtrada vazia",
);

ensureReplace(
  '<tbody>{products.map((p) => <tr key={p.id}',
  '<tbody>{filteredProducts.map((p) => <tr key={p.id}',
  "linhas filtradas da tabela",
);

ensureReplace(
  '  const [productId, setProductId] = useState("");',
  '  const [productId, setProductId] = useState("");\n  const [productQuery, setProductQuery] = useState("");',
  "busca na nova comanda",
);

ensureReplace(
  '    setProductId(""); setManualItem(""); setCategory("Geral"); setQty(1); setUnit(0);',
  '    setProductId(""); setProductQuery(""); setManualItem(""); setCategory("Geral"); setQty(1); setUnit(0);',
  "limpeza da busca da comanda",
);

ensureReplace(
  '<div className="rounded-xl border border-border bg-background/40 p-3 shadow-sm"><Field label="Produto"><select className="field" value={productId} onChange={(e) => { setProductId(e.target.value); const p = products.find((row) => row.id === e.target.value); if (p) setUnit(Number(p.preco)); }}><option value="">Venda avulsa</option>{products.map((p) => <option key={p.id} value={p.id}>{p.nome} · estoque {p.estoque_atual} {shortUnit(p.unidade)} · {fmtBRL(p.preco)}</option>)}</select></Field>',
`<div className="rounded-xl border border-border bg-background/40 p-3 shadow-sm"><Field label="Produto"><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input list="sale-products-list" className="field pl-9" value={productQuery} onChange={(event) => { const value = event.target.value; setProductQuery(value); const term = normalizeSearch(value); const matches = products.filter((row) => normalizeSearch(row.nome).includes(term)); const selected = products.find((row) => normalizeSearch(row.nome) === term) ?? (term && matches.length === 1 ? matches[0] : undefined); setProductId(selected?.id ?? ""); if (selected) setUnit(Number(selected.preco)); }} placeholder="Digite o nome do produto" /><datalist id="sale-products-list">{products.map((p) => <option key={p.id} value={p.nome}>{`Estoque ${p.estoque_atual} ${shortUnit(p.unidade)} · ${fmtBRL(p.preco)}`}</option>)}</datalist></div></Field>`,
  "seletor pesquisável da comanda",
);

ensureReplace(
  '  const [inicial, setInicial] = useState(0);',
  '  const [inicial, setInicial] = useState(Number(editing?.estoque_atual ?? 0));',
  "valor inicial do estoque na edição",
);

ensureReplace(
  '{!editing ? <Field label="Quantidade inicial total"><input type="number" min={0} className="field text-lg font-bold" value={inicial} onChange={(e) => setInicial(Number(e.target.value))} placeholder="Ex.: 21" /><span className="mt-1 block text-[11px] text-muted-foreground">Essa quantidade vira o estoque atual e o total recebido.</span></Field> : <Field label="Estoque atual"><div className="field flex items-center bg-muted font-bold">{editing.estoque_atual} {shortUnit(unidade)}</div><span className="mt-1 block text-[11px] text-muted-foreground">Use Repor ou Contagem para alterar sem perder o histórico.</span></Field>}',
  '<Field label={editing ? "Estoque atual" : "Quantidade inicial total"}><input type="number" min={0} className="field text-lg font-bold" value={inicial} onChange={(e) => setInicial(Number(e.target.value))} placeholder="Ex.: 21" /><span className="mt-1 block text-[11px] text-muted-foreground">{editing ? "Ao salvar, a diferença será registrada como ajuste de estoque." : "Essa quantidade vira o estoque atual e o total recebido."}</span></Field>',
  "campo editável de estoque",
);

ensureReplace(
  'function movementLabel(type: string) { return ({ reposicao: "Reposição", venda: "Venda", ajuste_positivo: "Ajuste positivo", ajuste_negativo: "Ajuste negativo", estoque_inicial: "Estoque inicial" } as Record<string, string>)[type] ?? type; }',
  'function movementLabel(type: string) { return ({ reposicao: "Reposição", venda: "Venda", ajuste_positivo: "Ajuste positivo", ajuste_negativo: "Ajuste negativo", estoque_inicial: "Estoque inicial", exclusao_venda: "Exclusão de venda" } as Record<string, string>)[type] ?? type; }',
  "rótulo de exclusão no estoque",
);

if (!source.includes('function normalizeSearch(value: string)')) {
  source += '\nfunction normalizeSearch(value: string) { return value.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase().trim(); }\n';
}

fs.writeFileSync(filePath, source);
console.log("Busca de produtos, edição de estoque e exclusão definitiva aplicadas.");