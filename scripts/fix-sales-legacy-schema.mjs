import fs from "node:fs";

const path = "src/routes/_authenticated/vendas.tsx";
let source = fs.readFileSync(path, "utf8");

source = source.replace(
  'import { useMemo, useState } from "react";',
  'import { useEffect, useMemo, useState } from "react";',
);

source = source.replace(
  /  const \[purchaseOpen, setPurchaseOpen\] = useState\(false\);/,
  `  const [initialRoom, setInitialRoom] = useState<number | null>(null);
  const [purchaseOpen, setPurchaseOpen] = useState(false);

  useEffect(() => {
    const rawRoom = new URLSearchParams(window.location.search).get("quarto");
    const parsedRoom = rawRoom ? Number(rawRoom) : null;
    if (parsedRoom && Number.isFinite(parsedRoom)) {
      setInitialRoom(parsedRoom);
      setPurchaseOpen(true);
    }
  }, []);`,
);

source = source.replace(
  `      if (error) throw error;
      return data ?? [];
    },
  });

  const employees`,
  `      if (error) {
        const message = String(error.message ?? "");
        if (message.includes("stock_movements") || message.includes("schema cache")) return [];
        throw error;
      }
      return data ?? [];
    },
  });

  const employees`,
);

source = source.replace(
  `      const { data: members, error } = await (supabase as any).from("company_members").select("user_id").eq("company_id", companyId).eq("ativo", true);
      if (error) throw error;`,
  `      const { data: members, error } = await (supabase as any).from("company_members").select("user_id").eq("company_id", companyId).eq("ativo", true);
      if (error) return [];`,
);

source = source.replace(
  `      if (profileError) throw profileError;`,
  `      if (profileError) return [];`,
);

source = source.replace(
  `    const { error } = await (supabase as any).from("sales").insert(rows);
    if (error) throw error;
    await refresh();`,
  `    let { error } = await (supabase as any).from("sales").insert(rows);
    if (error) {
      const legacyRows = rows.map((row) => ({
        quarto: row.quarto,
        reserva_id: row.reserva_id,
        item: row.item,
        categoria: row.categoria,
        produto_id: row.produto_id,
        qtd: row.qtd,
        valor_unit: row.valor_unit,
        total: row.total,
        valor_pago: row.valor_pago,
        status: row.status,
        pagamento: row.pagamento,
        data: row.data,
      }));
      if (input.buyerType === "funcionario") {
        throw new Error("O banco atual ainda exige quarto em toda venda. A venda para funcionário será liberada após a atualização do Supabase.");
      }
      const legacyInsert = await (supabase as any).from("sales").insert(legacyRows);
      error = legacyInsert.error;
    }
    if (error) throw error;

    for (const item of input.items) {
      if (!item.produto_id || item.estoque == null) continue;
      const nextStock = Math.max(0, Number(item.estoque) - Number(item.qtd));
      const stockUpdate = await (supabase as any)
        .from("products")
        .update({ estoque_atual: nextStock })
        .eq("id", item.produto_id);
      if (stockUpdate.error) {
        throw new Error(\`Venda salva, mas não foi possível baixar o estoque de \${item.item}: \${stockUpdate.error.message}\`);
      }
    }
    await refresh();`,
);

source = source.replace(
  `      const { error } = await (supabase as any).from("products").update(base).eq("id", editingProduct.id).eq("company_id", companyId);
      if (error) throw error;`,
  `      let { error } = await (supabase as any).from("products").update(base).eq("id", editingProduct.id).eq("company_id", companyId);
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
      if (error) throw error;`,
);

source = source.replace(
  `      const { data, error } = await (supabase as any).from("products").insert({
        company_id: companyId, ...base, estoque_atual: 0, estoque_total_recebido: 0,
      }).select("id").single();
      if (error) throw error;
      if (input.inicial > 0) {
        const { error: rpcError } = await (supabase as any).rpc("register_stock_restock", {
          _company_id: companyId, _product_id: data.id, _quantity: input.inicial,
          _unit_cost: input.custo, _reason: \`Estoque inicial: \${input.inicial} \${input.unidade}(s)\`,
        });
        if (rpcError) throw rpcError;
      }`,
  `      let result = await (supabase as any).from("products").insert({
        company_id: companyId, ...base, estoque_atual: input.inicial, estoque_total_recebido: input.inicial,
      }).select("id").single();
      if (result.error) {
        result = await (supabase as any).from("products").insert({
          nome: input.nome,
          categoria: input.categoria,
          preco: input.preco,
          estoque_atual: input.inicial,
          estoque_minimo: input.minimo,
          ativo: input.ativo,
        }).select("id").single();
      }
      if (result.error) throw result.error;`,
);

source = source.replace(
  `    const { error } = await (supabase as any).rpc(rpc, args);
    if (error) throw error;
    setStockProduct(null);`,
  `    let { error } = await (supabase as any).rpc(rpc, args);
    if (error) {
      const currentStock = Number(stockProduct.estoque_atual ?? 0);
      const nextStock = stockMode === "reposicao"
        ? currentStock + Number(input.quantity)
        : Number(input.quantity);
      const fallback = await (supabase as any)
        .from("products")
        .update({ estoque_atual: Math.max(0, nextStock) })
        .eq("id", stockProduct.id);
      error = fallback.error;
    }
    if (error) throw error;
    setStockProduct(null);`,
);

source = source.replace(
  '{purchaseOpen && <PurchaseModal rooms={rooms as any[]}',
  '{purchaseOpen && <PurchaseModal initialRoom={initialRoom} rooms={rooms as any[]}',
);
source = source.replace(
  'function PurchaseModal({ rooms, reservations, products, employees, onClose, onSave }: { rooms: any[];',
  'function PurchaseModal({ initialRoom, rooms, reservations, products, employees, onClose, onSave }: { initialRoom?: number | null; rooms: any[];',
);
source = source.replace(
  '  const [room, setRoom] = useState<number | null>(rooms[0]?.numero ?? null);',
  `  const [room, setRoom] = useState<number | null>(initialRoom ?? rooms[0]?.numero ?? null);

  useEffect(() => {
    if (initialRoom != null) setRoom(initialRoom);
  }, [initialRoom]);`,
);

fs.writeFileSync(path, source);
console.log("Compatibilidade de vendas e estoque aplicada.");
