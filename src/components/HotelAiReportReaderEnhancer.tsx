import { useEffect } from "react";

const ENHANCED = "data-hotelai-reader-ready";

export function HotelAiReportReaderEnhancer() {
  useEffect(() => {
    function openReader(text: string) {
      const overlay = document.createElement("div");
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-label", "Leitura ampliada do relatório HotelAI");
      overlay.className =
        "fixed inset-0 z-[200] flex flex-col bg-background/98 p-3 backdrop-blur-sm sm:p-5";

      const header = document.createElement("div");
      header.className =
        "mx-auto flex w-full max-w-6xl shrink-0 items-center justify-between gap-3 rounded-t-xl border border-border bg-card px-4 py-3 shadow-sm";

      const title = document.createElement("div");
      title.innerHTML =
        '<strong class="block text-base text-foreground">Relatório da HotelAI</strong><span class="text-xs text-muted-foreground">Modo de leitura ampliada</span>';

      const actions = document.createElement("div");
      actions.className = "flex items-center gap-2";

      const printButton = document.createElement("button");
      printButton.type = "button";
      printButton.className = "btn-ghost px-3 py-2 text-xs font-bold";
      printButton.textContent = "Imprimir";
      printButton.addEventListener("click", () => window.print());

      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.className = "btn-primary px-3 py-2 text-xs font-bold";
      closeButton.textContent = "Fechar";

      const content = document.createElement("article");
      content.className =
        "mx-auto min-h-0 w-full max-w-6xl flex-1 overflow-y-auto rounded-b-xl border-x border-b border-border bg-card px-5 py-6 text-[15px] leading-7 text-foreground shadow-xl sm:px-8 sm:py-8 sm:text-base";
      content.style.whiteSpace = "pre-wrap";
      content.style.overflowWrap = "anywhere";
      content.textContent = text;

      const close = () => {
        document.removeEventListener("keydown", onKeyDown);
        overlay.remove();
      };
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") close();
      };

      closeButton.addEventListener("click", close);
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) close();
      });
      document.addEventListener("keydown", onKeyDown);

      actions.append(printButton, closeButton);
      header.append(title, actions);
      overlay.append(header, content);
      document.body.appendChild(overlay);
      closeButton.focus();
    }

    function enhanceResponses() {
      const printButtons = document.querySelectorAll<HTMLButtonElement>(
        'button[aria-label="Imprimir resposta"]',
      );

      printButtons.forEach((printButton) => {
        const actions = printButton.parentElement;
        const response = printButton.closest(".select-text");
        if (!actions || !response || actions.hasAttribute(ENHANCED)) return;

        actions.setAttribute(ENHANCED, "true");
        const expandButton = document.createElement("button");
        expandButton.type = "button";
        expandButton.className = printButton.className;
        expandButton.setAttribute("aria-label", "Expandir leitura");
        expandButton.setAttribute("title", "Expandir leitura");
        expandButton.innerHTML =
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
        expandButton.addEventListener("click", () => {
          const text = response.textContent?.trim() ?? "";
          if (text) openReader(text);
        });
        actions.appendChild(expandButton);
      });
    }

    enhanceResponses();
    const observer = new MutationObserver(enhanceResponses);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
