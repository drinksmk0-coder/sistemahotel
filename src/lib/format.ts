export function fmtBRL(n: number | null | undefined): string {
  const v = Number(n) || 0;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function fmtTime(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 5);
}

export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function nightsBetween(a?: string, b?: string): number {
  if (!a || !b) return 0;
  const d1 = new Date(a).getTime();
  const d2 = new Date(b).getTime();
  return Math.max(0, Math.round((d2 - d1) / 86400000));
}

// CSV export with formula-injection protection (fixes the CSV injection flaw).
function csvCell(value: unknown): string {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n;]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function downloadCSV(filename: string, rows: (string | number | null)[][]) {
  const content = rows.map((r) => r.map(csvCell).join(";")).join("\r\n");
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function xmlCell(value: string | number | null): string {
  const content = value == null ? "" : String(value);
  return content
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function downloadExcel(filename: string, rows: (string | number | null)[][]) {
  const tableRows = rows
    .map(
      (row, rowIndex) =>
        `<Row>${row
          .map((value) => {
            const isNumber = typeof value === "number" && Number.isFinite(value);
            const style = rowIndex === 0 ? ' ss:StyleID="Header"' : "";
            return `<Cell${style}><Data ss:Type="${isNumber ? "Number" : "String"}">${xmlCell(value)}</Data></Cell>`;
          })
          .join("")}</Row>`,
    )
    .join("");
  const content = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#D0B25B" ss:Pattern="Solid"/></Style>
 </Styles>
 <Worksheet ss:Name="Dados"><Table>${tableRows}</Table></Worksheet>
</Workbook>`;
  const blob = new Blob(["\uFEFF" + content], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".xls") ? filename : `${filename}.xls`;
  anchor.click();
  URL.revokeObjectURL(url);
}
