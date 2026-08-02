import { FileDown, FileText, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type TooltipState = { text: string; x: number; y: number } | null;

const EXPLANATIONS: Record<string, string> = {
  "Receita total": "Soma da receita das hospedagens e das vendas extras registradas no período e filtros selecionados.",
  "Taxa de ocupação": "Percentual de quartos-noite ocupados em relação aos quartos-noite disponíveis no recorte atual.",
  "Diária média (ADR)": "Valor médio cobrado por quarto ocupado. Ajuda a saber se o hotel está vendendo barato ou valorizando a diária.",
  RevPAR: "Receita de hospedagem por quarto disponível. Cruza preço e ocupação em um único indicador.",
  Reservas: "Quantidade de reservas encontrada no período e nos filtros selecionados.",
  Cancelamentos: "Reservas canceladas no recorte atual. A comparação mostra se a perda aumentou ou diminuiu.",
  "No-show": "Reservas em que o hóspede não compareceu. Pode indicar necessidade de garantia antecipada.",
  "1. Ocupação, reservas, cancelamentos e no-show por dia": "As barras mostram reservas, cancelamentos e no-show. A linha verde mostra a taxa de ocupação. Em períodos longos, o gráfico agrupa automaticamente por semana ou mês.",
  "2. Receitas por dia (R$)": "Mostra em quais dias, semanas ou meses a receita se concentrou, de acordo com o período escolhido.",
  "3. Receitas por forma de pagamento": "Distribuição do valor recebido por forma de pagamento. A legenda lateral mostra participação e valor sem cortar os nomes.",
  "4. Reservas por canal": "Mostra de onde vieram as reservas: direto, WhatsApp, Booking, Google, Instagram, formulário ou outros canais.",
  "5. Ocupação por categoria de quarto": "Compara a utilização das categorias de quarto e revela quais tipos têm maior ou menor procura.",
  "6. Ranking de quartos por ocupação": "Ordena os quartos pela taxa de ocupação para identificar os mais vendidos e os que precisam de revisão de preço ou divulgação.",
  "7. Origem: hóspedes x receita por estado": "A intensidade do mapa representa receita. A tabela cruza estado, quantidade de hóspedes e valor gerado.",
};

export function ExecutiveDashboardInteractions() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipState>(null);

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

  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-executive-dashboard]");
    if (!root) return;

    const explanationFor = (target: Element) => {
      if (target.closest("[data-executive-control]")) return null;
      const article = target.closest("article");
      if (!article) return null;
      const heading = article.querySelector("h2")?.textContent?.trim();
      const label = article.querySelector("p")?.textContent?.trim();
      return EXPLANATIONS[heading || label || ""] ?? null;
    };

    const onPointerOver = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const text = explanationFor(target);
      if (!text) return;
      setTooltip({
        text,
        x: Math.max(8, Math.min(event.clientX + 16, window.innerWidth - 340)),
        y: Math.max(8, Math.min(event.clientY + 16, window.innerHeight - 130)),
      });
    };

    const onPointerMove = (event: PointerEvent) => {
      setTooltip((current) => current ? {
        ...current,
        x: Math.max(8, Math.min(event.clientX + 16, window.innerWidth - 340)),
        y: Math.max(8, Math.min(event.clientY + 16, window.innerHeight - 130)),
      } : null);
    };

    const onPointerOut = (event: PointerEvent) => {
      const target = event.target;
      const related = event.relatedTarget;
      if (!(target instanceof Element)) return;
      const article = target.closest("article");
      if (article && related instanceof Node && article.contains(related)) return;
      setTooltip(null);
    };

    root.addEventListener("pointerover", onPointerOver);
    root.addEventListener("pointermove", onPointerMove);
    root.addEventListener("pointerout", onPointerOut);
    return () => {
      root.removeEventListener("pointerover", onPointerOver);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerout", onPointerOut);
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

  if (!host) return tooltip ? createPortal(<HelpTooltip tooltip={tooltip} />, document.body) : null;

  return (
    <>
      {createPortal(
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
      )}
      {tooltip && createPortal(<HelpTooltip tooltip={tooltip} />, document.body)}
    </>
  );
}

function HelpTooltip({ tooltip }: { tooltip: Exclude<TooltipState, null> }) {
  return <div className="executive-help-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>{tooltip.text}</div>;
}

function csvCell(value: string) {
  const clean = String(value ?? "").replaceAll('"', '""');
  return `"${clean}"`;
}
