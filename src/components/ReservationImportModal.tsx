import { useMemo, useState } from "react";
import { Upload } from "lucide-react";
import { readSheet } from "read-excel-file/browser";
import { Modal } from "@/components/ui-kit";
import { hotelOperationalDateISO, nightsBetween } from "@/lib/format";
import type { Room } from "@/lib/data";
import type { ReservaRow } from "@/components/ReservaForm";

type Cell = string | number | boolean | Date | null;
export type ReservationImportResult = { imported: number; errors: string[] };

const aliases: Record<string, string[]> = {
  quarto: ["quarto", "uh", "unidade habitacional", "acomodacao"],
  nome: ["cliente", "hospede", "nome", "nome do hospede"],
  telefone: ["telefone", "celular", "whatsapp"],
  cpf: ["cpf", "documento"],
  email: ["email", "e-mail"],
  checkin: ["checkin", "check-in", "entrada", "data de entrada"],
  checkout: ["checkout", "check-out", "saida", "data de saida"],
  pessoas: ["pessoas", "hospedes", "quantidade de pessoas", "adultos"],
  diaria: ["valor diaria", "diaria", "tarifa"],
  total: ["valor total", "total", "total reserva"],
  pago: ["valor pago", "pago", "recebido"],
  pagamento: ["pagamento", "forma de pagamento"],
  canal: ["canal", "origem", "canal de venda", "canal de vendas"],
  status: ["status", "situacao"],
  estado: ["estado", "uf"],
  cidade: ["cidade"],
  profissao: ["profissao"],
  sexo: ["sexo", "genero"],
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
  const parsed = Number(text(value).replace(/\s/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function isoDate(value: Cell | undefined) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
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

function parseRows(sheet: Cell[][], rooms: Room[]) {
  if (sheet.length < 2) {
    throw new Error("A planilha precisa ter cabeçalho e pelo menos uma reserva.");
  }
  const headers = sheet[0];
  const missing = ["quarto", "nome", "checkin", "checkout"].filter(
    (key) => column(headers, key) < 0,
  );
  if (missing.length) {
    throw new Error(`Colunas obrigatórias ausentes: ${missing.join(", ")}.`);
  }
  const get = (source: Cell[], key: string) => source[column(headers, key)];
  const errors: string[] = [];
  const dataReserva = hotelOperationalDateISO();
  const rows = sheet.slice(1).flatMap((source, index) => {
    const quarto = numeric(get(source, "quarto"));
    const nome = text(get(source, "nome"));
    const checkin = isoDate(get(source, "checkin"));
    const checkout = isoDate(get(source, "checkout"));
    const room = rooms.find((item) => item.numero === quarto);
    if (!room || !nome || !checkin || !checkout || checkout <= checkin) {
      errors.push(`Linha ${index + 2}: confira quarto, hóspede e período.`);
      return [];
    }
    const diarias = Math.max(1, nightsBetween(checkin, checkout));
    const valorDiaria = numeric(get(source, "diaria")) || Number(room.preco);
    const valorTotal = numeric(get(source, "total")) || valorDiaria * diarias;
    const valorPago = Math.max(0, Math.min(numeric(get(source, "pago")), valorTotal));
    const importedStatus = normalize(get(source, "status"));
    const status = importedStatus.includes("cancel")
      ? "cancelado"
      : importedStatus.includes("final")
        ? "finalizado"
        : importedStatus.includes("ocup")
          ? "ocupado"
          : valorPago >= valorTotal
            ? "ocupado"
            : "reservado";

    return [
      {
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
        horario_checkin: null,
        horario_checkout: null,
        diarias,
        valor_diaria: valorDiaria,
        valor_total: valorTotal,
        valor_pago: valorPago,
        desconto: 0,
        pessoas: Math.max(1, Math.round(numeric(get(source, "pessoas")) || 1)),
        canal: text(get(source, "canal")) || "Direto",
        motivo_estadia: null,
        pagamento: text(get(source, "pagamento")) || "Não informado",
        pago: valorTotal > 0 && valorPago >= valorTotal,
        status,
        checkin_at: ["ocupado", "finalizado"].includes(status)
          ? `${checkin}T12:00:00`
          : null,
      } satisfies ReservaRow,
    ];
  });
  return { rows, errors };
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
  const [rows, setRows] = useState<ReservaRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState<ReservationImportResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const preview = useMemo(() => rows.slice(0, 8), [rows]);

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
      const parsed = parseRows(sheet, rooms);
      setRows(parsed.rows);
      setErrors(parsed.errors);
      setFileName(file.name);
    } catch (error) {
      setRows([]);
      setErrors([
        error instanceof Error ? error.message : "Não foi possível ler a planilha.",
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Importar reservas do Excel">
      <div className="space-y-4">
        <div className="rounded-xl border border-dashed border-border bg-muted/40 p-5 text-center">
          <Upload className="mx-auto mb-2 h-7 w-7 text-pine" />
          <p className="text-sm font-semibold">Planilha .xlsx ou .csv</p>
          <p className="mb-3 text-xs text-muted-foreground">
            Obrigatórias: Quarto, Hóspede, Check-in e Check-out. Também lemos telefone,
            diária, total, pago, canal, estado e profissão.
          </p>
          <label className="btn-ghost inline-flex cursor-pointer">
            {busy ? "Lendo…" : "Escolher planilha"}
            <input
              type="file"
              accept=".xlsx,.csv,.xls"
              className="hidden"
              disabled={busy}
              onChange={(event) => choose(event.target.files?.[0])}
            />
          </label>
          {fileName && <p className="mt-2 text-xs text-muted-foreground">{fileName}</p>}
        </div>

        {errors.length > 0 && (
          <div className="max-h-28 overflow-auto rounded-lg bg-brick-bg p-3 text-xs text-brick">
            {errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        )}

        {preview.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted">
                <tr>
                  <th className="p-2 text-left">UH</th>
                  <th className="p-2 text-left">Hóspede</th>
                  <th className="p-2">Entrada</th>
                  <th className="p-2">Saída</th>
                  <th className="p-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row, index) => (
                  <tr
                    key={`${row.quarto}-${row.checkin}-${index}`}
                    className="border-t border-border"
                  >
                    <td className="p-2">{row.quarto}</td>
                    <td className="p-2">{row.cliente_nome}</td>
                    <td className="p-2 text-center">{row.checkin}</td>
                    <td className="p-2 text-center">{row.checkout}</td>
                    <td className="p-2 text-right">
                      R$ {row.valor_total.toFixed(2).replace(".", ",")}
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
                {error}
              </p>
            ))}
          </div>
        )}

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
