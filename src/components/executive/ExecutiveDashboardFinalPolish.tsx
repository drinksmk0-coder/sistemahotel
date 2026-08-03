import { useEffect } from "react";

const DONUT_TITLES = new Set([
  "3. Receitas por forma de pagamento",
  "4. Reservas por canal",
  "9. Como as despesas foram pagas",
]);

export function ExecutiveDashboardFinalPolish() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-executive-dashboard]");
    if (!root) return;

    let frame = 0;

    const apply = () => {
      frame = 0;
      root.querySelectorAll<HTMLElement>("article").forEach((article) => {
        const heading = article.querySelector<HTMLElement>("h2");
        const title = heading?.textContent?.trim() ?? "";
        const content = heading?.nextElementSibling;

        if (DONUT_TITLES.has(title) && content instanceof HTMLElement) {
          article.dataset.executiveDonutCard = "true";
          content.dataset.executiveDonutLayout = "true";
          const chart = content.firstElementChild;
          const legend = content.children.item(1);
          if (chart instanceof HTMLElement) chart.dataset.executiveDonutChart = "true";
          if (legend instanceof HTMLElement) legend.dataset.executiveDonutLegend = "true";
        }

        if (title.startsWith("7. Origem:") && content instanceof HTMLElement) {
          article.dataset.executiveMapCard = "true";
          content.dataset.executiveMapLayout = "true";
          const map = content.querySelector<SVGSVGElement>("svg");
          if (map) map.dataset.executiveBrazilMap = "true";
        }
      });
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(apply);
    };

    const observer = new MutationObserver(schedule);
    observer.observe(root, { childList: true, subtree: true });
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
