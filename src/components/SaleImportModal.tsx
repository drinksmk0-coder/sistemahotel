import { useMemo, useState } from "react";
import { AlertTriangle, FileSpreadsheet, Upload } from "lucide-react";
import { readSheet } from "read-excel-file/browser";
import { Modal } from "@/components/ui-kit";
import { fmtBRL } from "@/lib/format";
import type { Reservation, Room } from "@/lib/data";

type Cell = string | number | boolean | Date | null;

export type ImportedSaleRow = {
  quarto: number;
  reserva_id: string | null;
  cliente_id: string | null;
  item: string;
  categoria: string;
  produto_id: null;
  qtd: number;
  valor_unit: number;
  total: number;
  valor_pago: number;
  status: "pago" | "parcial" | "pendente";
  pagamento: string;
  data: string;
  observacoes: string | null;
  import_source: string;
  external_code: string;
};

export type SaleImportResult = {
  imported: number;
  duplicates: number;
  errors: string[];
};

type ParseSummary = {
  expenses: number;
  lodging: number;
  blank: number;
  unsafe: number;
};

const aliases: Record<string, string[]> = {
  type: ["tipo", "tipo de lancamento", "tipo de lançamento"],
  completed: ["concluido?", "concluído?", "concluido", "concluído", "status"],
  category: ["categoria", "grupo"],
  item: ["item", "produto", "servico", "serviço", "consumo", "descricao", "descrição"],
  room: ["quarto", "uh", "numero do quarto", "número do quarto"],
  reservationCode: ["codigo reserva", "código reserva", "codigo da reserva", "código da reserva", "reserva"],
  date: ["data", "vencimento", "data da venda", "data do consumo"],
  quantity: ["qtd", "quantidade", "qtde"],
  unitValue: ["valor unitario", "valor unitário", "preco", "preço"],
  total: ["valor", "total", "valor total"],
  paid: ["valor pago", "pago", "recebido"],
  payment: ["forma", "pagamento", "forma de pagamento"],
  createdAt: ["criado em", "data de criacao", "data de criação"],
  updatedAt: ["atualizado em", "data de atualizacao", "data de atualização"],
};

const PORTUGUESE_MONTHS: Record<string, string> = {
  janeiro: "01",
  fevereiro: "02",
  marco: "03",
  março: "03",
  abril: "04",
  maio: "05",
  junho: "06",
  julho: "07",
  agosto: "08",
  setembro: "09",
  outubro: "10",
  novembro: "11",
  dezembro: "12",
};

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00a0/g, " ")
    .trim()
    .toLowerCase();
}

function column(headers: Cell[], key: string) {
  const names = aliases[key].map(normalize);
  return headers.findIndex((header) => names.includes(normalize(header)));
}

function cell(source: Cell[], headers: Cell[], key: string) {
  const index = column(headers, key);
  return index >= 0 ? source[index] : undefined;
}

function text(value: Cell | undefined) {
  return value == null ? "" : String(value).replace(/\u00a0/g, " ").trim();
}

function numeric(value: Cell | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = text(value);
  if (!raw) return 0;
  const cleaned = raw
    .replace(/R\$/gi, "")
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function integer(value: Cell | undefined) {
  const parsed = Math.round(numeric(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function isoDate(value: Cell | undefined) {
  if (value instanceof Date) {
    return [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, "0"),
      String(value.getDate()).padStart(2, "0"),
    ].join("-");
  }

  const raw = text(value);
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);

  const br = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (br) {
    const year = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${year}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  }

  const written = raw.match(/^(\d{1,2})\s+de\s+([A-Za-zÀ-ÿ]+)\s+de\s+(\d{4})/i);
  if (written) {
    const month = PORTUGUESE_MONTHS[normalize(written[2])];
    if (month) return `${written[3]}-${month}-${written[1].padStart(2, "0")}`;
  }

  return "";
}

function parseCsv(raw: string): Cell[][] {
  const lines = raw.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const delimiter = lines[0].includes(";") ? ";" : ",";
  return lines.map((line) => {
    const values: string[] = [];
    let current = "";
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (character === '"') {
        if (quoted && line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          quoted = !quoted;
        }
      } else if (character === delimiter && !quoted) {
        values.push(current);
        current = "";
      } else {
        current += character;
      }
    }
    values.push(current);
    return values;
  });
}

function reservationCode(description: string, explicit: string) {
  if (explicit) return explicit.trim();
  return description.match(/\b[A-Z]{2}:\d+\b/i)?.[0] ?? "";
}

function roomNumber(description: string, explicit: Cell | undefined) {
  const fromColumn = integer(explicit);
  if (fromColumn > 0) return fromColumn;
  const prefixed = description.match(/\b[A-Z]{2}:\d+\s*-\s*(\d{2,4})\s*-/i);
  if (prefixed) return Number.parseInt(prefixed[1], 10);
  const uh = description.match(/\b(?:UH|quarto)\s*(\d{2,4})\b/i);
  return uh ? Number.parseInt(uh[1], 10) : 0;
}

function findReservation(
  reservations: Reservation[],
  code: string,
  room: number,
  date: string,
) {
  const normalizedCode = normalize(code);
  const exact = normalizedCode
    ? reservations.find((reservation) => normalize(reservation.codigo_externo) === normalizedCode)
    : undefined;
  if (exact) return exact;
  return reservations
    .filter(
      (reservation) =>
        reservation.quarto === room &&
        reservation.status !== "cancelado" &&
        reservation.checkin <= date &&
        reservation.checkout >= date,
    )
    .sort((a, b) => b.checkin.localeCompare(a.checkin))[0];
}

function isLodgingCategory(value: string) {
  const category = normalize(value);
  return (
    category.includes("hospedagem") ||
    category === "diaria" ||
    category === "diarias" ||
    category.includes("diaria de quarto")
  );
}

function isPaid(value: Cell | undefined) {
  const status = normalize(value);
  return ["pago", "sim", "concluido", "quitado", "true", "ok"].some((term) =>
    status.includes(term),
  );
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function parseRows(sheet: Cell[][], rooms: Room[], reservations: Reservation[]) {
  if (sheet.length < 2) {
    throw new Error("A planilha precisa ter cabeçalho e pelo menos uma linha.");
  }

  const headers = sheet[0];
  const hasType = column(headers, "type") >= 0;
  const hasExplicitSaleItem = headers.some((header) =>
    ["item", "produto", "servico", "consumo"].includes(normalize(header)),
  );
  const hospedinFinancial =
    hasType &&
    column(headers, "item") >= 0 &&
    column(headers, "date") >= 0 &&
    column(headers, "total") >= 0;
  const genericSales =
    !hasType &&
    hasExplicitSaleItem &&
    column(headers, "date") >= 0 &&
    column(headers, "total") >= 0;

  if (!hospedinFinancial && !genericSales) {
    throw new Error(
      "Não reconheci uma planilha segura de vendas. No relatório financeiro do Hospedin mantenha as colunas Tipo, Categoria, Descrição, Vencimento, Valor e Forma. Uma planilha genérica precisa ter Item/Produto, Data, Valor e Quarto.",
    );
  }

  const source = hospedinFinancial ? "Hospedin financeiro" : "Planilha de vendas";
  const errors: string[] = [];
  const warnings: string[] = [];
  const summary: ParseSummary = { expenses: 0, lodging: 0, blank: 0, unsafe: 0 };
  const occurrences = new Map<string, number>();

  const rows = sheet.slice(1).flatMap((sourceRow, index) => {
    const line = index + 2;
    if (sourceRow.every((value) => !text(value))) {
      summary.blank += 1;
      return [];
    }

    const type = normalize(cell(sourceRow, headers, "type"));
    if (hasType && type && !type.includes("receita")) {
      summary.expenses += 1;
      return [];
    }

    const category = text(cell(sourceRow, headers, "category")) || "Geral";
    if (isLodgingCategory(category)) {
      summary.lodging += 1;
      return [];
    }

    const description = text(cell(sourceRow, headers, "item"));
    const date = isoDate(cell(sourceRow, headers, "date"));
    const total = numeric(cell(sourceRow, headers, "total"));
    const room = roomNumber(description, cell(sourceRow, headers, "room"));
    const code = reservationCode(
      description,
      text(cell(sourceRow, headers, "reservationCode")),
    );
    const roomExists = rooms.some((item) => item.numero === room);

    if (!description || !date || total <= 0 || !room || !roomExists) {
      errors.push(
        `Linha ${line}: confira item/descrição, data, valor e quarto existente. A linha não foi importada.`,
      );
      summary.unsafe += 1;
      return [];
    }

    const quantity = Math.max(1, integer(cell(sourceRow, headers, "quantity")) || 1);
    const explicitUnit = numeric(cell(sourceRow, headers, "unitValue"));
    const unitValue = explicitUnit > 0 ? explicitUnit : total / quantity;
    const completed = cell(sourceRow, headers, "completed");
    const explicitPaid = numeric(cell(sourceRow, headers, "paid"));
    const paid = Math.max(
      0,
      Math.min(total, explicitPaid > 0 ? explicitPaid : isPaid(completed) ? total : 0),
    );
    const status: ImportedSaleRow["status"] =
      paid >= total ? "pago" : paid > 0 ? "parcial" : "pendente";
    const reservation = findReservation(reservations, code, room, date);
    const createdAt = text(cell(sourceRow, headers, "createdAt"));
    const updatedAt = text(cell(sourceRow, headers, "updatedAt"));
    const payment = text(cell(sourceRow, headers, "payment")) || "Não informado";
    const signature = [
      source,
      code,
      room,
      date,
      normalize(category),
      normalize(description),
      total.toFixed(2),
      normalize(payment),
      normalize(text(completed)),
      normalize(createdAt),
      normalize(updatedAt),
    ].join("|");
    const occurrence = (occurrences.get(signature) ?? 0) + 1;
    occurrences.set(signature, occurrence);

    if (!reservation) {
      warnings.push(
        `Linha ${line}: venda da UH ${room} sem reserva correspondente no sistema; será preservada como venda histórica sem vínculo de hóspede.`,
      );
    }

    return [
      {
        quarto: room,
        reserva_id: reservation?.id ?? null,
        cliente_id: reservation?.cliente_id ?? null,
        item: description.slice(0, 160),
        categoria: category.slice(0, 80),
        produto_id: null,
        qtd: quantity,
        valor_unit: Number(unitValue.toFixed(2)),
        total: Number(total.toFixed(2)),
        valor_pago: Number(paid.toFixed(2)),
        status,
        pagamento: payment.slice(0, 80),
        data: date,
        observacoes: [
          `Importado de ${source}`,
          code ? `Reserva externa ${code}` : "",
          createdAt ? `Criado na origem em ${createdAt}` : "",
        ]
          .filter(Boolean)
          .join(" · ") || null,
        import_source: source,
        external_code: `${source === "Hospedin financeiro" ? "hospedin" : "planilha"}:${stableHash(`${signature}|${occurrence}`)}`,
      } satisfies ImportedSaleRow,
    ];
  });

  if (summary.lodging > 0) {
    warnings.unshift(
      `${summary.lodging} receita(s) de hospedagem foram ignoradas para não duplicar a receita das reservas.`,
    );
  }
  if (summary.expenses > 0) {
    warnings.unshift(`${summary.expenses} despesa(s) foram ignoradas; despesas não viram vendas.`);
  }
  if (rows.length === 0 && summary.lodging > 0) {
    warnings.push(
      "Este arquivo contém apenas receitas de hospedagem. Elas devem entrar pela importação de Reservas, não em Vendas extras.",
    );
  }

  return { rows, errors, warnings, summary, source };
}

export function SaleImportModal({
  rooms,
  reservations,
  onClose,
  onImport,
}: {
  rooms: Room[];
  reservations: Reservation[];
  onClose: () => void;
  onImport: (rows: ImportedSaleRow[]) => Promise<SaleImportResult>;
}) {
  const [rows, setRows] = useState<ImportedSaleRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [summary, setSummary] = useState<ParseSummary>({
    expenses: 0,
    lodging: 0,
    blank: 0,
    unsafe: 0,
  });
  const [source, setSource] = useState("");
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<SaleImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const preview = useMemo(() => rows.slice(0, 10), [rows]);
  const total = useMemo(() => rows.reduce((sum, row) => sum + row.total, 0), [rows]);

  async function choose(file?: File) {
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (extension === "xls") {
        throw new Error("Salve o arquivo .xls antigo como .xlsx antes de importar.");
      }
      const sheet =
        extension === "csv"
          ? parseCsv(await file.text())
          : ((await readSheet(file)) as Cell[][]);
      const parsed = parseRows(sheet, rooms, reservations);
      setRows(parsed.rows);
      setErrors(parsed.errors);
      setWarnings(parsed.warnings);
      setSummary(parsed.summary);
      setSource(parsed.source);
      setFileName(file.name);
    } catch (error) {
      setRows([]);
      setWarnings([]);
      setSummary({ expenses: 0, lodging: 0, blank: 0, unsafe: 0 });
      setSource("");
      setErrors([
        error instanceof Error ? error.message : "Não foi possível ler a planilha.",
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Importar vendas extras">
      <div className="space-y-4">
        <div className="rounded-xl border border-dashed border-border bg-muted/40 p-5 text-center">
          <FileSpreadsheet className="mx-auto mb-2 h-8 w-8 text-primary" />
          <p className="text-sm font-semibold">Relatório financeiro do Hospedin ou planilha de vendas</p>
          <p className="mx-auto mb-3 max-w-xl text-xs leading-relaxed text-muted-foreground">
            Importa somente receitas extras, como água, bebidas, lavanderia e serviços. Despesas são
            ignoradas. Receitas de hospedagem também são ignoradas para não duplicar o valor das reservas.
          </p>
          <label className="btn-ghost inline-flex cursor-pointer items-center gap-2">
            <Upload className="h-4 w-4" />
            {busy ? "Lendo…" : "Escolher .xlsx ou .csv"}
            <input
              type="file"
              accept=".xlsx,.csv,.xls"
              className="hidden"
              disabled={busy}
              onChange={(event) => void choose(event.target.files?.[0])}
            />
          </label>
          {fileName && (
            <p className="mt-2 text-xs text-muted-foreground">
              {fileName} · origem reconhecida: <strong>{source}</strong>
            </p>
          )}
        </div>

        {(summary.expenses > 0 || summary.lodging > 0 || summary.unsafe > 0) && (
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <Summary label="Despesas ignoradas" value={summary.expenses} />
            <Summary label="Hospedagens ignoradas" value={summary.lodging} />
            <Summary label="Linhas inválidas" value={summary.unsafe} />
          </div>
        )}

        {warnings.length > 0 && (
          <div className="max-h-40 overflow-auto rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
            <p className="mb-1 flex items-center gap-1 font-bold">
              <AlertTriangle className="h-4 w-4" /> Conferência da importação
            </p>
            {warnings.map((warning) => (
              <p key={warning} className="mt-1">{warning}</p>
            ))}
          </div>
        )}

        {errors.length > 0 && (
          <div className="max-h-36 overflow-auto rounded-lg bg-brick-bg p-3 text-xs text-brick">
            {errors.map((error) => (
              <p key={error} className="mt-1 first:mt-0">{error}</p>
            ))}
          </div>
        )}

        {preview.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted">
                <tr>
                  <th className="p-2 text-left">Data</th>
                  <th className="p-2">UH</th>
                  <th className="p-2 text-left">Categoria</th>
                  <th className="p-2 text-left">Item</th>
                  <th className="p-2 text-right">Total</th>
                  <th className="p-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row) => (
                  <tr key={row.external_code} className="border-t border-border">
                    <td className="p-2">{row.data}</td>
                    <td className="p-2 text-center font-semibold">{row.quarto}</td>
                    <td className="p-2">{row.categoria}</td>
                    <td className="max-w-64 truncate p-2" title={row.item}>{row.item}</td>
                    <td className="p-2 text-right">{fmtBRL(row.total)}</td>
                    <td className="p-2">{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between border-t border-border bg-muted/40 px-3 py-2 text-xs">
              <span>{rows.length} venda(s) extra(s) pronta(s)</span>
              <strong>Total: {fmtBRL(total)}</strong>
            </div>
          </div>
        )}

        {result && (
          <div className={`rounded-lg p-3 text-sm ${result.errors.length ? "bg-brass-bg" : "bg-sage-bg"}`}>
            <strong>{result.imported} venda(s) importada(s).</strong>
            {result.duplicates > 0 && (
              <p className="mt-1 text-xs">{result.duplicates} linha(s) já existiam e foram ignoradas.</p>
            )}
            {result.errors.map((error) => (
              <p key={error} className="mt-1 text-xs">{error}</p>
            ))}
          </div>
        )}

        <p className="rounded-lg bg-muted/50 p-3 text-[11px] leading-relaxed text-muted-foreground">
          Cada linha recebe um identificador estável da origem. Reimportar o mesmo relatório não duplica
          as vendas. Linhas históricas podem ficar sem vínculo de hóspede quando a reserva ainda não foi importada.
        </p>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Fechar</button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy || rows.length === 0}
            onClick={async () => {
              setBusy(true);
              try {
                setResult(await onImport(rows));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Importando…" : `Importar ${rows.length || ""} vendas extras`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-2">
      <strong className="block text-base">{value}</strong>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}
