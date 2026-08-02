import { CalendarRange, FileDown, FileText, Filter, Printer, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type TooltipState = { text: string; x: number; y: number } | null;

const EXPLANATIONS: Record<string, string> = {
  "Receita total": "Soma da receita das hospedagens e das vendas extras registradas no período selecionado.",
  "Taxa de ocupação": "Percentual de quartos-noite ocupados em relação aos quartos-noite disponíveis no período.",
  "Diária média (ADR)": "Valor médio cobrado por quarto ocupado. Ajuda a saber se o hotel está vendendo barato ou valorizando a diária.",
  RevPAR: "Receita de hospedagem por quarto disponível. Cruza preço e ocupação em um único indicador.",
  Reservas: "Quantidade total de reservas que cruzam o período selecionado.",
  Cancelamentos: "Reservas canceladas no período. A comparação mostra se a perda aumentou ou diminuiu.",
  "No-show": "Reservas em que o hóspede não compareceu. É uma perda de demanda e pode indicar necessidade de garantia antecipada.",
  "1. Ocupação, reservas, cancelamentos e no-show por dia": "As barras mostram o movimento diário de reservas, cancelamentos e no-show. A linha verde mostra a taxa de ocupação, permitindo identificar dias cheios, quedas e perdas.",
  "2. Receitas por dia (R$)": "Mostra em quais dias a receita se concentrou e ajuda a comparar picos de faturamento com ocupação e reservas.",
  "3. Receitas por forma de pagamento": "Distribuição do valor recebido por Pix, dinheiro, cartões, transferência e outras formas. A legenda lateral mostra participação e valor.",
  "4. Reservas por canal": "Mostra de onde vieram as reservas: direto, WhatsApp, Booking, Google, Instagram ou outros canais.",
  "5. Ocupação por categoria de quarto": "Compara a utilização das categorias de quarto e revela quais tipos têm maior ou menor procura.",
  "6. Ranking de quartos por ocupação": "Ordena os quartos pela taxa de ocupação para identificar os mais vendidos e os que precisam de revisão de preço, divulgação ou manutenção.",
  "7. Origem: hóspedes x receita por estado": "A intensidade do mapa representa receita. A tabela cruza estado, quantidade de hóspedes e valor gerado.",
};

export function ExecutiveDashboardInteractions() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipState>(null);

  useEffect(() => {
    let attempts = 0;
    let originalFilter: HTMLButtonElement | null = null;
    let portalHost: HTMLDivElement | null = null;

    const timer = window.setInterval(() => {
      attempts += 1;
      const root = document.querySelector<HTMLElement>("[data-executive-dashboard]");
      const header = root?.querySelector<HTMLElement>("header");
      if (!header) {
        if (attempts >= 50) window.clearInterval(timer);
        return;
      }

      const buttons = Array.from(header.querySelectorAll<HTMLButtonElement>("button"));
      originalFilter = buttons.find((button) => button.textContent?.trim().includes("Filtros")) ?? null;
      const toolbar = originalFilter?.parentElement ?? header.lastElementChild;
      if (!(toolbar instanceof HTMLElement)) return;

      originalFilter?.setAttribute("data-original-filter", "true");
      if (originalFilter) originalFilter.style.display = "none";

      portalHost = document.createElement("div");
      portalHost.className = "executive-dashboard-controls-host relative flex items-end gap-2";
      portalHost.dataset.executiveControl = "true";
      toolbar.appendChild(portalHost);
      setHost(portalHost);
      window.clearInterval(timer);
    }, 100);

    return () => {
      window.clearInterval(timer);
      if (originalFilter) originalFilter.style.removeProperty("display");
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
      const key = heading || label || "";
      return EXPLANATIONS[key] ?? null;
    };

    const onPointerOver = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const text = explanationFor(target);
      if (!text) return;
      setTooltip({
        text,
        x: Math.min(event.clientX + 16, window.innerWidth - 340),
        y: Math.min(event.clientY + 16, window.innerHeight - 130),
      });
    };

    const onPointerMove = (event: PointerEvent) => {
      setTooltip((current) => current ? {
        ...current,
        x: Math.min(event.clientX + 16, window.innerWidth - 340),
        y: Math.min(event.clientY + 16, window.innerHeight - 130),
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

  function applyRange(start: string, end: string) {
    const root = document.querySelector<HTMLElement>("[data-executive-dashboard]");
    const fields = root?.querySelectorAll<HTMLInputElement>('header input[type="date"]');
    if (!fields || fields.length < 2) return;
    setInputValue(fields[0], start);
    setInputValue(fields[1], end);
    setFilterOpen(false);
  }

  function applyPreset(preset: "today" | "7" | "30" | "month" | "year") {
    const now = new Date();
    const end = toISO(now);
    if (preset === "today") return applyRange(end, end);
    if (preset === "7") return applyRange(toISO(addDays(now, -6)), end);
    if (preset === "30") return applyRange(toISO(addDays(now, -29)), end);
    if (preset === "month") return applyRange(`${end.slice(0, 7)}-01`, end);
    applyRange(`${end.slice(0, 4)}-01-01`, end);
  }

  function downloadCsv() {
    const root = document.querySelector<HTMLElement>("[data-executive-dashboard]");
    if (!root) return;
    const inputs = root.querySelectorAll<HTMLInputElement>('header input[type="date"]');
    const firstSection = root.querySelector("section");
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
        <>
          <div className="relative" data-executive-control>
            <button type="button" className="executive-control-button" onClick={() => { setFilterOpen((value) => !value); setReportOpen(false); }} aria-expanded={filterOpen}>
              <Filter className="h-3.5 w-3.5" /> Filtros
            </button>
            {filterOpen && (
              <div className="executive-control-popover w-64">
                <div className="mb-3 flex items-center justify-between">
                  <div><strong className="block text-sm">Filtrar período</strong><span className="text-[10px] text-muted-foreground">Atualiza todos os indicadores e gráficos.</span></div>
                  <button type="button" className="rounded-md p-1 hover:bg-muted" onClick={() => setFilterOpen(false)} aria-label="Fechar filtros"><X className="h-4 w-4" /></button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Preset label="Hoje" onClick={() => applyPreset("today")} />
                  <Preset label="7 dias" onClick={() => applyPreset("7")} />
                  <Preset label="30 dias" onClick={() => applyPreset("30")} />
                  <Preset label="Mês atual" onClick={() => applyPreset("month")} />
                  <Preset label="Ano atual" onClick={() => applyPreset("year")} wide />
                </div>
              </div>
            )}
          </div>

          <div className="relative" data-executive-control>
            <button type="button" className="executive-control-button" onClick={() => { setReportOpen((value) => !value); setFilterOpen(false); }} aria-expanded={reportOpen}>
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
          </div>
        </>,
        host,
      )}
      {tooltip && createPortal(<HelpTooltip tooltip={tooltip} />, document.body)}
    </>
  );
}

function Preset({ label, onClick, wide = false }: { label: string; onClick: () => void; wide?: boolean }) {
  return <button type="button" className={`flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2 py-2 text-xs font-bold hover:border-primary/40 hover:bg-primary/5 ${wide ? "col-span-2" : ""}`} onClick={onClick}><CalendarRange className="h-3.5 w-3.5" />{label}</button>;
}

function HelpTooltip({ tooltip }: { tooltip: Exclude<TooltipState, null> }) {
  return <div className="executive-help-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>{tooltip.text}</div>;
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function addDays(date: Date, amount: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

function toISO(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function csvCell(value: string) {
  const clean = String(value ?? "").replaceAll('"', '""');
  return `"${clean}"`;
}
