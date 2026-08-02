import { useEffect } from "react";

const DONUT_TITLES = new Set([
  "3. Receitas por forma de pagamento",
  "4. Reservas por canal",
  "9. Como as despesas foram pagas",
]);

const SVG_NS = "http://www.w3.org/2000/svg";
const RADIAN = Math.PI / 180;

type LegendRow = {
  row: HTMLElement;
  left: HTMLElement;
  percentage: HTMLElement;
  percentageText: string;
  percentageValue: number;
};

export function ExecutiveDonutLegendStandardizer() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-executive-dashboard]");
    if (!root) return;

    let frame = 0;

    const standardize = () => {
      frame = 0;

      root.querySelectorAll<HTMLElement>("article").forEach((article) => {
        const title = article.querySelector("h2")?.textContent?.trim() ?? "";
        if (!DONUT_TITLES.has(title)) return;

        const rows = findLegendRows(article);
        if (!rows.length) return;

        const legend = rows[0].row.parentElement;
        const layout = legend?.parentElement;
        const chart = layout?.firstElementChild;

        article.dataset.executiveDonutCard = "true";
        legend?.setAttribute("data-executive-donut-legend", "true");
        layout?.setAttribute("data-executive-donut-layout", "true");
        if (chart instanceof HTMLElement) chart.dataset.executiveDonutChart = "true";

        rows.forEach(({ row, left, percentage, percentageText }) => {
          row.dataset.executiveDonutLegendRow = "true";
          left.dataset.executiveDonutLegendLabel = "true";
          percentage.dataset.executiveDonutPercentage = "true";
          percentage.setAttribute("aria-hidden", "true");

          const originalMetrics = percentage.dataset.executiveDonutOriginalMetrics
            ?? percentage.textContent?.trim()
            ?? "";
          percentage.dataset.executiveDonutOriginalMetrics = originalMetrics;

          const parts = originalMetrics.split("·").map((part) => part.trim()).filter(Boolean);
          const moneyText = parts.find((part) => /^R\$/i.test(part))
            ?? left.querySelector<HTMLElement>("[data-executive-donut-value]")?.textContent?.trim();

          if (percentage.textContent !== percentageText) percentage.textContent = percentageText;

          const previousValue = left.querySelector<HTMLElement>("[data-executive-donut-value]");
          if (!moneyText) {
            previousValue?.remove();
            return;
          }

          if (previousValue) {
            if (previousValue.textContent !== moneyText) previousValue.textContent = moneyText;
            previousValue.title = moneyText;
            return;
          }

          const value = document.createElement("span");
          value.dataset.executiveDonutValue = "true";
          value.textContent = moneyText;
          value.title = moneyText;
          left.appendChild(value);
        });

        if (chart instanceof HTMLElement) {
          drawSlicePercentages(chart, rows);
        }
      });
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(standardize);
    };

    const observer = new MutationObserver(schedule);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    window.addEventListener("resize", schedule);
    schedule();

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}

function findLegendRows(article: HTMLElement): LegendRow[] {
  return Array.from(article.querySelectorAll<HTMLElement>("div"))
    .filter((element) => {
      if (element.children.length !== 2) return false;
      const [left, right] = Array.from(element.children);
      return left instanceof HTMLSpanElement
        && right instanceof HTMLElement
        && right.tagName === "STRONG"
        && Boolean(left.querySelector("i"));
    })
    .map((row) => {
      const left = row.children[0] as HTMLElement;
      const percentage = row.children[1] as HTMLElement;
      const originalMetrics = percentage.dataset.executiveDonutOriginalMetrics
        ?? percentage.textContent?.trim()
        ?? "";
      const percentageText = originalMetrics
        .split("·")
        .map((part) => part.trim())
        .find((part) => part.includes("%"))
        ?? "0%";

      return {
        row,
        left,
        percentage,
        percentageText,
        percentageValue: parsePercentage(percentageText),
      };
    });
}

function drawSlicePercentages(chart: HTMLElement, rows: LegendRow[]) {
  const svg = chart.querySelector<SVGSVGElement>("svg.recharts-surface");
  if (!svg) return;

  const sectors = Array.from(svg.querySelectorAll<SVGPathElement>("path.recharts-sector"));
  if (!sectors.length) return;

  const count = Math.min(sectors.length, rows.length);
  const boxes = sectors.slice(0, count).map((sector) => sector.getBBox());
  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.width));
  const maxY = Math.max(...boxes.map((box) => box.y + box.height));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const outerRadius = Math.max(1, Math.min(maxX - minX, maxY - minY) / 2);
  const labelRadius = outerRadius * 0.79;

  const labels = Array.from(svg.querySelectorAll<SVGTextElement>("text[data-executive-donut-slice-label]"));
  while (labels.length > count) labels.pop()?.remove();

  let startAngle = 90;
  for (let index = 0; index < count; index += 1) {
    const row = rows[index];
    const sector = sectors[index];
    const sliceAngle = row.percentageValue * 3.6;
    const midAngle = startAngle - sliceAngle / 2;
    startAngle -= sliceAngle;

    const x = cx + labelRadius * Math.cos(-midAngle * RADIAN);
    const y = cy + labelRadius * Math.sin(-midAngle * RADIAN);
    const display = row.percentageText.replace(".", ",");
    const color = readableTextColor(window.getComputedStyle(sector).fill);
    const outline = color === "#ffffff" ? "rgba(15,23,42,0.42)" : "rgba(255,255,255,0.72)";
    const fontSize = row.percentageValue < 3 ? 7 : row.percentageValue < 7 ? 8 : 10;

    const label = labels[index] ?? document.createElementNS(SVG_NS, "text");
    if (!labels[index]) {
      label.dataset.executiveDonutSliceLabel = "true";
      label.setAttribute("aria-hidden", "true");
      svg.appendChild(label);
      labels.push(label);
    }

    setSvgAttribute(label, "x", x.toFixed(2));
    setSvgAttribute(label, "y", y.toFixed(2));
    setSvgAttribute(label, "text-anchor", "middle");
    setSvgAttribute(label, "dominant-baseline", "central");
    setSvgAttribute(label, "fill", color);
    setSvgAttribute(label, "stroke", outline);
    setSvgAttribute(label, "stroke-width", "0.8");
    setSvgAttribute(label, "paint-order", "stroke");
    setSvgAttribute(label, "font-size", String(fontSize));
    setSvgAttribute(label, "font-weight", "900");
    setSvgAttribute(label, "pointer-events", "none");
    if (label.textContent !== display) label.textContent = display;
  }
}

function setSvgAttribute(element: SVGElement, name: string, value: string) {
  if (element.getAttribute(name) !== value) element.setAttribute(name, value);
}

function parsePercentage(value: string) {
  const parsed = Number(value.replace("%", "").replace(",", ".").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function readableTextColor(fill: string) {
  const match = fill.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!match) return "#ffffff";
  const red = Number(match[1]);
  const green = Number(match[2]);
  const blue = Number(match[3]);
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance > 0.58 ? "#0f172a" : "#ffffff";
}
