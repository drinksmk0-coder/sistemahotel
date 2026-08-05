import { FileDown, FileText, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function ExecutiveDashboardInteractions() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    let attempts = 0;
    let portalHost: HTMLDivElement | null = null;

    const timer = window.setInterval(() => {
      attempts += 1;
      const root = document.querySelector<HTMLElement>("[data-executive-dashboard]");
      const header = root?.querySelector<HTMLElement>("header");
      if (!header) {
        if (attempts >= 50) window.clearInterval(timer);
        return;
      }

      const toolbar = header.lastElementChild;
      if (!(toolbar instanceof HTMLElement)) return;
      if (toolbar.querySelector("[data-report-control-host]")) {
        window.clearInterval(timer);
        return;
      }

      portalHost = document.createElement("div");
      portalHost.className = "executive-dashboard-controls-host relative flex items-end gap-2";
      portalHost.dataset.executiveControl = "true";
      portalHost.dataset.reportControlHost = "true";
      toolbar.appendChild(portalHost);
      setHost(portalHost);
      window.clearInterval(timer);
    }, 100);

    return () => {
      window.clearInterval(timer);
      portalHost?.remove();
    };
  }, []);

  function downloadCsv() {
    const root = document.querySelector<HTMLElement>("[data-executive-dashboard]");
    if (!root) return;
    const inputs = root.querySelectorAll<HTMLInputElement>('header input[type="date"]');
    const firstSection = root.querySelector("section:not([data-executive-control])");
    const cards = Array.from(firstSection?.querySelectorAll("article") ?? []);
    const rows = cards.map((card) => {
      const label = card.querySelector("p")?.textContent?.trim() ?? "Indicador";
      const value = card.querySelector("strong")?.textContent?.trim() ?? "";
      return [label, value];
    });
    const csv = [
      ["Relatório Pulso do Hotel"],
      ["Período", inputs[0]?.value ?? "", inputs[1]?.value ?? ""],
      [],
      ["Indicador", "Valor"],
      ...rows,
    ].map((row) => row.map(csvCell).join(";")).join("\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `pulso-do-hotel-${inputs[0]?.value || "inicio"}-${inputs[1]?.value || "fim"}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setReportOpen(false);
  }

  if (!host) return null;

  return createPortal(
    <div className="relative" data-executive-control>
      <button type="button" className="executive-control-button" onClick={() => setReportOpen((value) => !value)} aria-expanded={reportOpen}>
        <FileText className="h-3.5 w-3.5" /> Relatório
      </button>
      {reportOpen && (
        <div className="executive-control-popover w-60">
          <button type="button" className="executive-report-option" onClick={() => { window.print(); setReportOpen(false); }}>
            <Printer className="h-4 w-4" /><span><strong>Imprimir / salvar PDF</strong><small>Gera a visão completa do painel.</small></span>
          </button>
          <button type="button" className="executive-report-option" onClick={downloadCsv}>
            <FileDown className="h-4 w-4" /><span><strong>Baixar resumo CSV</strong><small>Exporta os indicadores do período.</small></span>
          </button>
        </div>
      )}
    </div>,
    host,
  );
}

function csvCell(value: string) {
  const clean = String(value ?? "").replaceAll('"', '""');
  return `"${clean}"`;
}
