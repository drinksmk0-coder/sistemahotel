import { useEffect } from "react";

function findCard(root: HTMLElement, startsWith: string) {
  return Array.from(root.querySelectorAll<HTMLElement>("article h2"))
    .find((heading) => heading.textContent?.trim().startsWith(startsWith))
    ?.closest<HTMLElement>("article") ?? null;
}

export function ExecutiveDashboardLayoutOrganizer() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-executive-dashboard]");
    if (!root) return;

    let frame = 0;

    const organize = () => {
      frame = 0;
      const dashboard = root.firstElementChild as HTMLElement | null;
      if (!dashboard) return;

      dashboard.dataset.executiveDashboardGrid = "true";

      const main = findCard(root, "1. Ocupação, reservas, cancelamentos e no-show");
      const financial = findCard(root, "2. Hospedagem, produtos, despesas e GOP")
        ?? findCard(root, "2. Receitas por dia");
      const paymentRevenue = findCard(root, "3. Receitas por forma de pagamento");
      const channel = findCard(root, "4. Reservas por canal");
      const category = findCard(root, "5. Ocupação por categoria de quarto");
      const rooms = findCard(root, "6. Ranking de quartos por ocupação");
      const states = findCard(root, "7. Origem: hóspedes x receita por estado");

      if (main) main.dataset.executiveGridMain = "true";
      if (financial) financial.dataset.executiveGridFinancial = "true";
      if (paymentRevenue) paymentRevenue.dataset.executiveGridPrimaryDonut = "true";
      if (channel) channel.dataset.executiveGridPrimaryDonut = "true";

      const primaryGroup = financial?.parentElement;
      if (
        primaryGroup instanceof HTMLElement
        && primaryGroup.tagName === "SECTION"
        && paymentRevenue?.parentElement === primaryGroup
        && channel?.parentElement === primaryGroup
      ) {
        primaryGroup.dataset.executiveChartGroup = "primary";
      }

      const operationsGroup = category?.parentElement;
      if (
        operationsGroup instanceof HTMLElement
        && operationsGroup.tagName === "SECTION"
        && rooms?.parentElement === operationsGroup
        && states?.parentElement === operationsGroup
      ) {
        operationsGroup.dataset.executiveChartGroup = "operations";
        [category, rooms, states].forEach((card) => {
          if (card) card.dataset.executiveGridThird = "true";
        });
      }

      const expenseInsights = root.querySelector<HTMLElement>(".executive-expense-insights");
      if (expenseInsights) expenseInsights.dataset.executiveExpenseGrid = "true";
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(organize);
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
