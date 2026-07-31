import fs from "node:fs";

const path = "src/routes/_authenticated/vendas.tsx";
let source = fs.readFileSync(path, "utf8");

function replaceOnce(before, after) {
  if (source.includes(after)) return;
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`Trecho esperado uma vez, encontrado ${count}: ${before.slice(0, 120)}`);
  }
  source = source.replace(before, after);
}

replaceOnce(
  'import { useState } from "react";\n',
  'import { useState } from "react";\nimport { useQueryClient } from "@tanstack/react-query";\n',
);
replaceOnce(
  'import { Pencil, Plus, Trash2 } from "lucide-react";\n',
  'import { Pencil, Plus, Trash2, Upload } from "lucide-react";\n',
);
replaceOnce(
  '  useProducts,\n  useInsert,',
  '  useProducts,\n  useCurrentCompany,\n  useInsert,',
);
replaceOnce(
  'import { ExportPeriodButton, type ExportScope } from "@/components/ExportPeriodButton";\n',
  'import { ExportPeriodButton, type ExportScope } from "@/components/ExportPeriodButton";\nimport { supabase } from "@/integrations/supabase/client";\nimport {\n  SaleImportModal,\n  type ImportedSaleRow,\n  type SaleImportResult,\n} from "@/components/SaleImportModal";\n',
);
replaceOnce(
  '  const { data: products = [] } = useProducts();\n  const insert = useInsert("sales", ["sales", "products"]);',
  '  const { data: products = [] } = useProducts();\n  const currentCompany = useCurrentCompany();\n  const queryClient = useQueryClient();\n  const insert = useInsert("sales", ["sales", "products"]);',
);
replaceOnce(
  '  const [editingProduct, setEditingProduct] = useState<Product | null>(null);\n',
  '  const [editingProduct, setEditingProduct] = useState<Product | null>(null);\n  const [importOpen, setImportOpen] = useState(false);\n',
);
replaceOnce(
  '  const lowStockText = lowStock\n',
  `  async function importSales(rows: ImportedSaleRow[]): Promise<SaleImportResult> {\n    const companyId = currentCompany.data?.id;\n    if (!companyId) return { imported: 0, duplicates: 0, errors: ["Empresa não encontrada."] };\n\n    const { data: knownRows, error: knownError } = await (supabase as any)\n      .from("sales")\n      .select("import_source,external_code")\n      .eq("company_id", companyId)\n      .not("import_source", "is", null)\n      .not("external_code", "is", null);\n    if (knownError) {\n      return { imported: 0, duplicates: 0, errors: [knownError.message] };\n    }\n\n    const keyOf = (row: { import_source?: string | null; external_code?: string | null }) =>\n      String(row.import_source ?? "").trim().toLowerCase() +\n      "|" +\n      String(row.external_code ?? "").trim().toLowerCase();\n    const existing = new Set((knownRows ?? []).map(keyOf));\n    const uniqueRows: ImportedSaleRow[] = [];\n    let duplicates = 0;\n    for (const row of rows) {\n      const key = keyOf(row);\n      if (existing.has(key)) {\n        duplicates += 1;\n      } else {\n        existing.add(key);\n        uniqueRows.push(row);\n      }\n    }\n\n    const errors: string[] = [];\n    let imported = 0;\n    const chunkSize = 100;\n    for (let index = 0; index < uniqueRows.length; index += chunkSize) {\n      const chunk = uniqueRows.slice(index, index + chunkSize);\n      const payload = chunk.map((row) => ({ ...row, company_id: companyId }));\n      const { error } = await (supabase as any).from("sales").insert(payload);\n      if (!error) {\n        imported += chunk.length;\n        continue;\n      }\n\n      // Isola uma linha inválida ou uma duplicidade concorrente sem perder o restante do lote.\n      for (const row of payload) {\n        const { error: rowError } = await (supabase as any).from("sales").insert(row);\n        if (!rowError) {\n          imported += 1;\n        } else if (rowError.code === "23505") {\n          duplicates += 1;\n        } else {\n          errors.push(\n            String(row.data) +\n              " · UH " +\n              String(row.quarto) +\n              " · " +\n              String(row.item) +\n              ": " +\n              rowError.message,\n          );\n        }\n      }\n    }\n\n    await queryClient.invalidateQueries({ queryKey: ["sales"] });\n    await queryClient.invalidateQueries({ queryKey: ["products"] });\n    if (imported > 0) toast.success(imported + " venda(s) extra(s) importada(s).");\n    if (duplicates > 0) toast.info(duplicates + " linha(s) duplicada(s) foram ignoradas.");\n    return { imported, duplicates, errors };\n  }\n\n  const lowStockText = lowStock\n`,
);
replaceOnce(
  '          <div className="flex gap-2">\n            <ExportPeriodButton onExport={exportCSV} />',
  '          <div className="flex flex-wrap gap-2">\n            <ExportPeriodButton onExport={exportCSV} />\n            <button\n              type="button"\n              onClick={() => setImportOpen(true)}\n              className="btn-ghost flex items-center gap-1.5"\n            >\n              <Upload className="h-4 w-4" /> Importar\n            </button>',
);
replaceOnce(
  '      {productOpen && (\n        <ProductForm',
  '      {importOpen && (\n        <SaleImportModal\n          rooms={rooms}\n          reservations={reservations}\n          onClose={() => setImportOpen(false)}\n          onImport={importSales}\n        />\n      )}\n\n      {productOpen && (\n        <ProductForm',
);

fs.writeFileSync(path, source);
console.log("Importador integrado à tela de vendas.");
