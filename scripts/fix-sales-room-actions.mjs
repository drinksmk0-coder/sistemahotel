import fs from 'node:fs';

function replaceOnce(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`Trecho não encontrado: ${label}`);
  return source.replace(from, to);
}

const mapPath = 'src/components/MapaQuartos.tsx';
let map = fs.readFileSync(mapPath, 'utf8');
map = replaceOnce(
  map,
`          <div className="flex flex-wrap gap-2">
            
            {stay && (
              <a
                className="btn-ghost inline-flex items-center gap-1"
                href={\`/vendas?quarto=${room.numero}\`}
                title={\`Lançar venda para ${stay.cliente_nome} no quarto ${room.numero}\`}
              >
                <ShoppingCart className="h-4 w-4" /> Lançar venda
              </a>
            )}
            {stay && (
              <a className="btn-ghost" href={\`/reservas?editar=${stay.id}\`}>Editar hospedagem</a>
            )}
            {whatsapp && (`,
`          <div className="flex flex-wrap gap-2">
            {stay && (
              <a
                className="btn-ghost"
                href={\`/reservas?editar=${stay.id}\`}
              >
                Editar hospedagem
              </a>
            )}
            {stay && (
              <a
                className="btn-primary inline-flex items-center gap-1"
                href={\`/vendas?quarto=${room.numero}&reserva=${stay.id}\`}
                title={\`Lançar venda para ${stay.cliente_nome} no quarto ${room.numero}\`}
              >
                <ShoppingCart className="h-4 w-4" /> Lançar venda
              </a>
            )}
            {whatsapp && (`,
  'primeiro bloco duplicado do mapa',
);
map = replaceOnce(
  map,
`            {stay && (
              <>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    window.location.href = \`/reservas?editar=${stay.id}\`;
                  }}
                >
                  Editar hospedagem
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    window.location.href = \`/vendas?quarto=${room.numero}&reserva=${stay.id}\`;
                  }}
                >
                  Lançar venda
                </button>
              </>
            )}
`,
'',
  'segundo bloco duplicado do mapa',
);
map = map.replace('      <div className="space-y-4">', '      <div className="space-y-3">');
map = map.replace('        <div className="grid gap-4 md:grid-cols-2">', '        <div className="grid gap-3 md:grid-cols-2">');
map = map.replaceAll('className="rounded-xl border border-border p-3"', 'className="rounded-xl border border-border bg-background/40 p-3 shadow-sm"');
fs.writeFileSync(mapPath, map);

const salesPath = 'src/routes/_authenticated/vendas.tsx';
let sales = fs.readFileSync(salesPath, 'utf8');
sales = replaceOnce(
  sales,
'import { ClipboardList, PackagePlus, Pencil, Plus, RefreshCw, ShoppingCart, UserRound, UsersRound, Warehouse } from "lucide-react";',
'import { ClipboardList, PackagePlus, Pencil, Plus, RefreshCw, ShoppingCart, Trash2, UserRound, UsersRound, Warehouse } from "lucide-react";',
  'import Trash2',
);
sales = replaceOnce(
  sales,
' type Sale = { id: string; compra_id?: string | null; comprador_tipo?: string | null; comprador_nome?: string | null; cliente_id?: string | null; reserva_id?: string | null; quarto: number | null; data: string; item: string; categoria?: string | null; produto_id?: string | null; qtd: number; valor_unit: number; total: number; valor_pago?: number | null; pagamento: string; created_at: string };',
' type Sale = { id: string; compra_id?: string | null; comprador_tipo?: string | null; comprador_nome?: string | null; cliente_id?: string | null; reserva_id?: string | null; quarto: number | null; data: string; item: string; categoria?: string | null; produto_id?: string | null; qtd: number; valor_unit: number; total: number; valor_pago?: number | null; pagamento: string; status?: string | null; created_at: string };',
  'status da venda',
);
sales = replaceOnce(
  sales,
'  const sales = saleRows as unknown as Sale[];',
'  const sales = (saleRows as unknown as Sale[]).filter((sale) => sale.status !== "cancelado");',
  'filtro de vendas canceladas',
);
sales = replaceOnce(
  sales,
`  async function saveProduct(input: ProductFormInput) {`,
`  async function cancelSaleGroup(group: { id: string; itens: Sale[]; comprador: string; total: number }) {
    const confirmed = window.confirm(
      \`Excluir a comanda de ${group.comprador} no valor de ${fmtBRL(group.total)}? O estoque será devolvido e o histórico ficará preservado como cancelado.\`,
    );
    if (!confirmed) return;

    for (const item of group.itens) {
      if (item.produto_id) {
        const product = products.find((row) => row.id === item.produto_id);
        if (product) {
          const restored = Number(product.estoque_atual ?? 0) + Number(item.qtd ?? 0);
          const stockResult = await (supabase as any)
            .from("products")
            .update({ estoque_atual: restored })
            .eq("id", product.id)
            .eq("company_id", companyId);
          if (stockResult.error) throw stockResult.error;
        }
      }

      const cancelResult = await (supabase as any)
        .from("sales")
        .update({ status: "cancelado", valor_pago: 0 })
        .eq("id", item.id);
      if (cancelResult.error) throw cancelResult.error;
    }

    await refresh();
    toast.success("Comanda excluída, estoque devolvido e histórico preservado.");
  }

  async function saveProduct(input: ProductFormInput) {`,
  'função excluir/estornar comanda',
);
sales = replaceOnce(
  sales,
'<th className="p-3">Pendente</th></tr></thead>',
'<th className="p-3">Pendente</th><th className="p-3 text-right">Ações</th></tr></thead>',
  'coluna ações',
);
sales = replaceOnce(
  sales,
`<td className={\`p-3 font-semibold ${g.total > g.pago ? "text-brick" : "text-muted-foreground"}\`}>{fmtBRL(Math.max(0, g.total - g.pago))}</td></tr>)}`,
`<td className={\`p-3 font-semibold ${g.total > g.pago ? "text-brick" : "text-muted-foreground"}\`}>{fmtBRL(Math.max(0, g.total - g.pago))}</td><td className="p-3 text-right"><button type="button" className="inline-flex items-center gap-1 rounded-lg border border-brick/30 bg-brick-bg/40 px-2.5 py-1.5 text-xs font-bold text-brick transition hover:bg-brick-bg" onClick={() => void cancelSaleGroup(g)}><Trash2 className="h-3.5 w-3.5" /> Excluir</button></td></tr>)}`,
  'botão excluir comanda',
);
sales = sales.replace('return <Modal open onClose={onClose} title="Nova comanda"><form className="space-y-4"', 'return <Modal open onClose={onClose} title="Nova comanda"><form className="space-y-3"');
sales = sales.replaceAll('rounded-lg border border-border p-3', 'rounded-xl border border-border bg-background/40 p-3 shadow-sm');
fs.writeFileSync(salesPath, sales);

console.log('Correções aplicadas com sucesso.');
