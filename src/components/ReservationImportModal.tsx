import { useMemo, useState } from "react";
import { AlertTriangle, FileSpreadsheet, Upload } from "lucide-react";
import { readSheet } from "read-excel-file/browser";
import { Modal } from "@/components/ui-kit";
import {
  DEFAULT_CHECKIN_TIME,
  DEFAULT_CHECKOUT_TIME,
  hotelOperationalDateISO,
  nightsBetween,
} from "@/lib/format";
import type { Room } from "@/lib/data";
import type { ReservaRow } from "@/components/ReservaForm";

type Cell = string | number | boolean | Date | null;
type ImportedReservationRow = ReservaRow & {
  codigo_externo?: string | null;
  origem_importacao?: string | null;
  observacoes_importacao?: string | null;
  group_id?: string | null;
};

export type ReservationImportResult = { imported: number; errors: string[] };

const aliases: Record<string, string[]> = {
  quarto: [
    "quarto",
    "uh",
    "unidade habitacional",
    "acomodacao",
    "acomodação",
    "numero da uh",
    "número da uh",
  ],
  nome: [
    "cliente",
    "hospede",
    "hóspede",
    "nome",
    "nome do hospede",
    "nome do hóspede",
    "nome completo",
  ],
  telefone: ["telefone", "celular", "whatsapp", "telefone do hospede", "telefone do hóspede"],
  cpf: ["cpf", "documento", "cpf/documento"],
  email: ["email", "e-mail"],
  checkin: ["checkin", "check-in", "entrada", "data de entrada"],
  checkout: ["checkout", "check-out", "saida", "saída", "data de saida", "data de saída"],
  pessoas: ["pessoas", "hospedes", "hóspedes", "quantidade de pessoas", "adultos"],
  diaria: ["valor diaria", "valor diária", "diaria", "diária", "tarifa"],
  total: ["valor total", "total", "total reserva", "valor da reserva"],
  pago: ["valor pago", "pago", "recebido"],
  pagamento: ["pagamento", "forma de pagamento"],
  canal: ["canal", "origem", "canal de venda", "canal de vendas"],
  status: ["status", "situacao", "situação"],
  codigo: ["codigo da reserva", "código da reserva", "codigo", "código", "reserva"],
  observacoes: ["observacoes", "observações", "observacao", "observação", "notas"],
  estado: ["estado", "uf"],
  cidade: ["cidade"],
  profissao: ["profissao", "profissão"],
  sexo: ["sexo", "genero", "gênero"],
  estadoCivil: ["estado civil"],
};

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function column(headers: Cell[], key: string) {
  const names = aliases[key].map(normalize);
  return headers.findIndex((header) => names.includes(normalize(header)));
}

function text(value: Cell | undefined) {
  return value == null ? "" : String(value).trim();
}

function numeric(value: Cell | undefined) {
  if (typeof value === "number") return value;
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

function firstInteger(value: Cell | undefined) {
  if (typeof value === "number") return Math.round(value);
  const match = text(value).match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : 0;
}

function isoDate(value: Cell | undefined) {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!match) return "";
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function parseCsv(raw: string): Cell[][] {
  return raw
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => {
      const delimiter = line.includes(";") ? ";" : ",";
      const cells: string[] = [];
      let value = "";
      let quoted = false;
      for (let index = 0; index < line.length; index += 1) {
        const character = line[index];
        if (character === '"') {
          if (quoted && line[index + 1] === '"') {
            value += '"';
            index += 1;
          } else {
            quoted = !quoted;
          }
        } else if (character === delimiter && !quoted) {
          cells.push(value);
          value = "";
        } else {
          value += character;
        }
      }
      cells.push(value);
      return cells;
    });
}

function internalStatus(value: Cell | undefined, valorPago: number, valorTotal: number) {
  const status = normalize(value);
  if (status.includes("cancel")) return "cancelado";
  if (status.includes("no show") || status.includes("noshow") || status.includes("nao compareceu")) {
    return "cancelado";
  }
  if (status.includes("final") || status.includes("conclu") || status.includes("checkout")) {
    return "finalizado";
  }
  if (status.includes("ocup") || status.includes("hosped") || status.includes("in house")) {
    return "ocupado";
  }
  if (status.includes("manut")) return "manutencao";
  if (status.includes("confirm") || status.includes("reserv")) return "reservado";
  return valorTotal > 0 && valorPago >= valorTotal ? "ocupado" : "reservado";
}

function parseRows(sheet: Cell[][], rooms: Room[]) {
  if (sheet.length < 2) {
    throw new Error("A planilha precisa ter cabeçalho e pelo menos uma reserva.");
  }

  const headers = sheet[0];
  const missing = ["quarto", "nome", "checkin", "checkout"].filter(
    (key) => column(headers, key) < 0,
  );
  if (missing.length) {
    throw new Error(
      `Colunas obrigatórias ausentes: ${missing.join(", ")}. No Hospedin, o nome pode estar em “Nome completo” e o quarto em “UH”.`,
    );
  }

  const get = (source: Cell[], key: string) => {
    const index = column(headers, key);
    return index >= 0 ? source[index] : undefined;
  };
  const errors: string[] = [];
  const warnings: string[] = [];
  const seenExternalStays = new Set<string>();
  const dataReserva = hotelOperationalDateISO();
  const isHospedin = ["codigo da reserva", "situacao", "nome completo", "uh"].every((name) =>
    headers.some((header) => normalize(header) === name),
  );

  const rows = sheet.slice(1).flatMap((source, index) => {
    if (source.every((cell) => !text(cell))) return [];

    const line = index + 2;
    const quarto = firstInteger(get(source, "quarto"));
    const nome = text(get(source, "nome"));
    const checkin = isoDate(get(source, "checkin"));
    const checkout = isoDate(get(source, "checkout"));
    const externalCode = text(get(source, "codigo"));
    const notes = text(get(source, "observacoes"));
    const room = rooms.find((item) => item.numero === quarto);

    if (!room || !nome || !checkin || !checkout || checkout <= checkin) {
      errors.push(`Linha ${line}: confira UH, nome completo, entrada e saída.`);
      return [];
    }

    const normalizedCode = normalize(externalCode);
    const externalStayKey = normalizedCode
      ? `${normalizedCode}|${quarto}|${checkin}|${checkout}`
      : "";
    if (externalStayKey && seenExternalStays.has(externalStayKey)) {
      errors.push(
        `Linha ${line}: código ${externalCode}, UH ${quarto} e período estão repetidos dentro da própria planilha.`,
      );
      return [];
    }
    if (externalStayKey) seenExternalStays.add(externalStayKey);

    const diarias = Math.max(1, nightsBetween(checkin, checkout));
    const importedDailyRate = numeric(get(source, "diaria"));
    const importedTotal = numeric(get(source, "total"));
    const valorDiaria = importedDailyRate || Number(room.preco);
    const valorTotal = importedTotal || valorDiaria * diarias;
    const valorPago = Math.max(0, Math.min(numeric(get(source, "pago")), valorTotal));
    const status = internalStatus(get(source, "status"), valorPago, valorTotal);
    const explicitChannel = text(get(source, "canal"));

    if (!importedDailyRate && !importedTotal) {
      warnings.push(
        `Linha ${line}: a planilha não informou valor; foi usada a tarifa atual da UH ${quarto} (${valorDiaria.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}). Confira antes de cobrar.`,
      );
    }
    if (notes && /\b(agua|água)\b/i.test(notes) && !/\d/.test(notes)) {
      warnings.push(
        `Linha ${line}: a observação menciona água sem quantidade ou valor. Ela será preservada como pendência, mas não entrará automaticamente no total do consumo.`,
      );
    }

    const row: ImportedReservationRow = {
      quarto,
      cliente_id: null,
      cliente_nome: nome,
      cliente_telefone: text(get(source, "telefone")) || null,
      cliente_email: text(get(source, "email")) || null,
      cliente_cpf: text(get(source, "cpf")) || null,
      cliente_tipo: "hóspede normal",
      cliente_data_nascimento: null,
      cliente_sexo: text(get(source, "sexo")) || null,
      cliente_profissao: text(get(source, "profissao")) || null,
      cliente_cidade: text(get(source, "cidade")) || null,
      cliente_estado: text(get(source, "estado")) || null,
      cliente_cep: null,
      cliente_bairro: null,
      cliente_estado_civil: text(get(source, "estadoCivil")) || null,
      cliente_tem_filhos: null,
      cliente_quantidade_filhos: null,
      data_reserva: dataReserva,
      checkin,
      checkout,
      horario_reserva: null,
      horario_checkin: DEFAULT_CHECKIN_TIME,
      horario_checkout: DEFAULT_CHECKOUT_TIME,
      diarias,
      valor_diaria: valorDiaria,
      valor_total: valorTotal,
      valor_pago: valorPago,
      desconto: 0,
      pessoas: Math.max(1, firstInteger(get(source, "pessoas")) || 1),
      canal: explicitChannel || (isHospedin ? "Hospedin (importado)" : "Planilha importada"),
      motivo_estadia: null,
      pagamento: text(get(source, "pagamento")) || "Não informado",
      pago: valorTotal > 0 && valorPago >= valorTotal,
      status,
      checkin_at: ["ocupado", "finalizado"].includes(status)
        ? `${checkin}T${DEFAULT_CHECKIN_TIME}:00`
        : null,
      codigo_externo: externalCode || null,
      origem_importacao: isHospedin ? "Hospedin" : "Planilha",
      observacoes_importacao: notes || null,
      group_id: null,
    };

    return [row];
  });

  const rowsByExternalCode = new Map<string, ImportedReservationRow[]>();
  for (const row of rows) {
    const code = normalize(row.codigo_externo);
    if (!code || row.status === "cancelado" || row.status === "manutencao") continue;
    const group = rowsByExternalCode.get(code) ?? [];
    group.push(row);
    rowsByExternalCode.set(code, group);
  }

  for (const [code, groupRows] of rowsByExternalCode) {
    const roomsInGroup = new Set(groupRows.map((row) => row.quarto));
    if (roomsInGroup.size < 2) continue;
    const groupId = crypto.randomUUID();
    for (const row of groupRows) row.group_id = groupId;
    warnings.push(
      `${groupRows.length} UHs do código ${groupRows[0].codigo_externo || code} foram reconhecidas como uma reserva em grupo.`,
    );
  }

  return { rows, errors, warnings, source: isHospedin ? "Hospedin" : "Planilha genérica" };
}

export function ReservationImportModal({
  rooms,
  onClose,
  onImport,
}: {
  rooms: Room[];
  onClose: () => void;
  onImport: (rows: ReservaRow[]) => Promise<ReservationImportResult>;
}) {
  const [rows, setRows] = useState<ImportedReservationRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [source, setSource] = useState("");
  const [result, setResult] = useState<ReservationImportResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const preview = useMemo(() => rows.slice(0, 10), [rows]);

  async function choose(file?: File) {
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (!extension || !["xlsx", "csv"].includes(extension)) {
        throw new Error("Formato não suportado. Use somente .xlsx ou .csv.");
      }
      const sheet =
        extension === "csv"
          ? parseCsv(await file.text())
          : ((await readSheet(file)) as Cell[][]);
      const parsed = parseRows(sheet, rooms);
      setRows(parsed.rows);
      setErrors(parsed.errors);
      setWarnings(parsed.warnings);
      setSource(parsed.source);
      setFileName(file.name);
    } catch (error) {
      setRows([]);
      setWarnings([]);
      setSource("");
      setErrors([
        error instanceof Error ? error.message : "Não foi possível ler a planilha.",
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Importar reservas (.xlsx ou .csv)">
      <div className="space-y-4">
        <div className="rounded-xl border border-dashed border-border bg-muted/40 p-5 text-center">
          <FileSpreadsheet className="mx-auto mb-2 h-8 w-8 text-primary" />
          <p className="text-sm font-semibold">Planilha .xlsx ou .csv</p>
          <p className="mb-3 text-xs text-muted-foreground">
            Reconhece o relatório do Hospedin com Código da reserva, Situação, Nome completo,
            Data de entrada, Data de saída, Hóspedes, UH e Observações. O formato antigo .xls não é usado.
          </p>
          <label className="btn-ghost inline-flex cursor-pointer items-center gap-2">
            <Upload className="h-4 w-4" />
            {busy ? "Lendo…" : "Escolher .xlsx ou .csv"}
            <input
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
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

        {warnings.length > 0 && (
          <div className="max-h-36 overflow-auto rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            <p className="mb-1 flex items-center gap-1 font-bold">
              <AlertTriangle className="h-4 w-4" /> Confira antes de importar
            </p>
            {warnings.map((warning) => (
              <p key={warning} className="mt-1">{warning}</p>
            ))}
          </div>
        )}

        {errors.length > 0 && (
          <div className="max-h-32 overflow-auto rounded-lg bg-brick-bg p-3 text-xs text-brick">
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
                  <th className="p-2 text-left">Código</th>
                  <th className="p-2 text-left">UH</th>
                  <th className="p-2 text-left">Hóspede</th>
                  <th className="p-2">Entrada</th>
                  <th className="p-2">Saída</th>
                  <th className="p-2">Pessoas</th>
                  <th className="p-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row, index) => (
                  <tr
                    key={`${row.codigo_externo ?? row.quarto}-${row.checkin}-${index}`}
                    className="border-t border-border"
                  >
                    <td className="p-2 font-mono">{row.codigo_externo || "—"}</td>
                    <td className="p-2 font-semibold">{row.quarto}</td>
                    <td className="p-2">{row.cliente_nome}</td>
                    <td className="p-2 text-center">{row.checkin}</td>
                    <td className="p-2 text-center">{row.checkout}</td>
                    <td className="p-2 text-center">{row.pessoas}</td>
                    <td className="p-2 text-right">
                      {row.valor_total.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > preview.length && (
              <p className="p-2 text-center text-xs text-muted-foreground">
                + {rows.length - preview.length} reservas
              </p>
            )}
          </div>
        )}

        {result && (
          <div
            className={`rounded-lg p-3 text-sm ${
              result.errors.length ? "bg-brass-bg" : "bg-sage-bg"
            }`}
          >
            <strong>{result.imported} reserva(s) importada(s).</strong>
            {result.errors.map((error) => (
              <p key={error} className="mt-1 text-xs">
                {error.includes("reservations_company_external_stay_normalized_uidx")
                  ? "Esta estadia já havia sido importada para o mesmo quarto e período."
                  : error}
              </p>
            ))}
          </div>
        )}

        <p className="rounded-lg bg-muted/50 p-3 text-[11px] leading-relaxed text-muted-foreground">
          O código externo evita repetir a mesma estadia. Quando o mesmo código do Hospedin aparece em
          UHs diferentes, o sistema cria automaticamente uma reserva em grupo.
        </p>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Fechar
          </button>
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
            {busy ? "Importando…" : `Importar ${rows.length || ""} reservas`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
