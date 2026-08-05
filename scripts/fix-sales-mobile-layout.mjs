import fs from "node:fs";

const path = "src/routes/_authenticated/vendas.tsx";
let source = fs.readFileSync(path, "utf8");

const marker = '    <section className="card-surface mb-5 overflow-x-auto">';

if (source.includes(marker) && !source.includes('data-mobile-product-cards')) {
  const mobileCards = `    <section data-mobile-product-cards className="mb-5 space-y-3 md:hidden">
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <h3 className="font-serif text-lg font-bold">Estoque de produtos</h3>
        <p className="mt-1 text-sm text-muted-foreground">Informações completas e ações de estoque no celular.</p>
      </div>
      {products.length === 0 ? <EmptyState text="Nenhum produto cadastrado." /> : products.map((p) => (
        <article key={p.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h4 className="truncate text-base font-bold text-foreground">{p.nome}</h4>
              <p className="text-xs text-muted-foreground">{p.categoria} · {p.unidade ?? "unidade"}</p>
            </div>
            <span className={\`rounded-full px-2 py-1 text-xs font-bold \${p.estoque_atual <= p.estoque_minimo ? "bg-brick-bg text-brick" : "bg-sage-bg text-pine-dark"}\`}>
              {p.estoque_atual} {shortUnit(p.unidade)}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <MobileMetric label="Preço de venda" value={fmtBRL(p.preco)} />
            <MobileMetric label="Custo unitário" value={fmtBRL(p.custo_unitario ?? 0)} />
            <MobileMetric label="Total recebido" value={\`${p.estoque_total_recebido ?? p.estoque_atual} \${shortUnit(p.unidade)}\`} />
            <MobileMetric label="Estoque mínimo" value={\`${p.estoque_minimo} \${shortUnit(p.unidade)}\`} />
            <MobileMetric label="Valor em estoque" value={fmtBRL(p.estoque_atual * Number(p.custo_unitario ?? 0))} wide />
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <button className="btn-ghost min-h-11 text-xs" onClick={() => { setStockProduct(p); setStockMode("reposicao"); }}>Repor</button>
            <button className="btn-ghost min-h-11 text-xs" onClick={() => { setStockProduct(p); setStockMode("contagem"); }}>Contagem</button>
            <button className="btn-ghost min-h-11 text-xs" onClick={() => { setEditingProduct(p); setProductOpen(true); }}><Pencil className="mx-auto h-4 w-4" /><span className="sr-only">Editar</span></button>
          </div>
        </article>
      ))}
    </section>

`;
  source = source.replace(marker, mobileCards + '    <section className="card-surface mb-5 hidden overflow-x-auto md:block">');
}

if (!source.includes('function MobileMetric(')) {
  const insertBefore = '\nfunction Stat(';
  const component = `\nfunction MobileMetric({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={\`rounded-lg bg-muted/40 p-2.5 \${wide ? "col-span-2" : ""}\`}>
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold text-foreground">{value}</p>
    </div>
  );
}\n`;
  if (source.includes(insertBefore)) source = source.replace(insertBefore, component + insertBefore);
}

fs.writeFileSync(path, source);
console.log("Layout móvel de vendas e estoque aplicado.");
