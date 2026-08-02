import { useEffect } from "react";

const DONUT_TITLES = new Set([
  "3. Receitas por forma de pagamento",
  "4. Reservas por canal",
  "9. Como as despesas foram pagas",
]);

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

        const rows = Array.from(article.querySelectorAll<HTMLElement>("div")).filter((element) => {
          if (element.children.length !== 2) return false;
          const [left, right] = Array.from(element.children);
          return left instanceof HTMLSpanElement
            && right instanceof HTMLElement
            && right.tagName === "STRONG"
            && Boolean(left.querySelector("i"));
        });

        if (!rows.length) return;

        const legend = rows[0].parentElement;
        const layout = legend?.parentElement;
        const chart = layout?.firstElementChild;

        article.dataset.executiveDonutCard = "true";
        legend?.setAttribute("data-executive-donut-legend", "true");
        layout?.setAttribute("data-executive-donut-layout", "true");
        if (chart instanceof HTMLElement) chart.dataset.executiveDonutChart = "true";

        rows.forEach((row) => {
          const left = row.children[0] as HTMLElement;
          const percentage = row.children[1] as HTMLElement;
          const raw = percentage.textContent?.trim() ?? "";
          const parts = raw.split("·").map((part) => part.trim()).filter(Boolean);
          const percentageText = parts.find((part) => part.includes("%")) ?? raw;
          const moneyText = parts.find((part) => /^R\$/i.test(part));

          row.dataset.executiveDonutLegendRow = "true";
          left.dataset.executiveDonutLegendLabel = "true";
          percentage.dataset.executiveDonutPercentage = "true";

          if (percentage.textContent !== percentageText) percentage.textContent = percentageText;

          const previousValue = left.querySelector<HTMLElement>("[data-executive-donut-value]");
          if (!moneyText) {
            previousValue?.remove();
            return;
          }

          if (previousValue) {
            if (previousValue.textContent !== moneyText) previousValue.textContent = moneyText;
            return;
          }

          const value = document.createElement("span");
          value.dataset.executiveDonutValue = "true";
          value.textContent = moneyText;
          value.title = moneyText;
          left.appendChild(value);
        });
      });
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(standardize);
    };

    const observer = new MutationObserver(schedule);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    schedule();

    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
