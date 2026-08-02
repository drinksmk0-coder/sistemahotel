import { useEffect } from "react";

const QUICK_PERIODS = new Set(["Hoje", "7 dias", "30 dias", "Mês atual", "Ano atual"]);

export function ExecutiveDashboardUiGuard() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-executive-dashboard]");
    if (!root) return;

    let repairTimer = 0;

    const findFilterButton = () => Array.from(root.querySelectorAll<HTMLButtonElement>("button[aria-expanded]"))
      .find((button) => button.textContent?.includes("Filtros")) ?? null;

    const findFilterPanel = () => Array.from(root.querySelectorAll<HTMLElement>("section[data-executive-control]"))
      .find((section) => section.querySelector("h2")?.textContent?.trim() === "Filtros cruzados") ?? null;

    const closeFilters = () => {
      const button = findFilterButton();
      if (button?.getAttribute("aria-expanded") === "true") button.click();
    };

    const decorateFilter = () => {
      const panel = findFilterPanel();
      if (!panel) return;
      panel.dataset.executiveFilterPanel = "true";
      if (panel.querySelector("[data-filter-close]")) return;

      const close = document.createElement("button");
      close.type = "button";
      close.dataset.filterClose = "true";
      close.className = "executive-filter-close";
      close.setAttribute("aria-label", "Fechar filtros");
      close.title = "Fechar filtros";
      close.textContent = "×";
      close.addEventListener("click", closeFilters);
      panel.appendChild(close);
    };

    const restoreFinancialWidgets = () => {
      const titles = Array.from(root.querySelectorAll<HTMLElement>("article h2"));
      const financialTitle = titles.find((title) => title.textContent?.trim().startsWith("2. Receita"));
      if (!financialTitle) return;

      const financialCard = financialTitle.closest("article");
      const financialHost = financialCard?.querySelector("[data-revenue-expense-gop-host]");
      const expenseInsights = root.querySelector("[data-expense-insights-host]");
      if (financialHost && expenseInsights) return;

      root.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    };

    const scheduleRepair = () => {
      window.clearTimeout(repairTimer);
      repairTimer = window.setTimeout(() => {
        decorateFilter();
        restoreFinancialWidgets();
      }, 80);
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const panel = findFilterPanel();
      const button = findFilterButton();
      if (!panel || !button || button.getAttribute("aria-expanded") !== "true") return;
      if (panel.contains(target) || button.contains(target)) return;
      closeFilters();
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const panel = target.closest<HTMLElement>("[data-executive-filter-panel]");
      const button = target.closest<HTMLButtonElement>("button");
      if (!panel || !button) return;
      if (QUICK_PERIODS.has(button.textContent?.trim() ?? "")) {
        window.setTimeout(closeFilters, 0);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeFilters();
    };

    const observer = new MutationObserver(scheduleRepair);
    observer.observe(root, { childList: true, subtree: true });
    document.addEventListener("pointerdown", onPointerDown, true);
    root.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown);
    scheduleRepair();

    return () => {
      window.clearTimeout(repairTimer);
      observer.disconnect();
      document.removeEventListener("pointerdown", onPointerDown, true);
      root.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return null;
}
