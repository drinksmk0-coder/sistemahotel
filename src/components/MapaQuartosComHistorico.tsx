import { useEffect } from "react";
import { MapaQuartos } from "@/components/MapaQuartos";
import { todayISO } from "@/lib/format";

/**
 * Mantém um dia de contexto histórico visível ao abrir o mapa.
 * A alteração é apenas visual: reservas finalizadas continuam sem bloquear disponibilidade.
 */
export function MapaQuartosComHistorico() {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const root = document.querySelector<HTMLElement>("[data-room-timeline-root]");
      const dateInput = root?.querySelector<HTMLInputElement>('input[type="date"]');
      if (!dateInput || dateInput.dataset.historyAdjusted === "true") return;

      const today = todayISO();
      if (dateInput.value !== today) return;

      dateInput.dataset.historyAdjusted = "true";
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(dateInput, previousDayISO(today));
      dateInput.dispatchEvent(new Event("change", { bubbles: true }));
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  return <MapaQuartos />;
}

function previousDayISO(date: string) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() - 1);
  return value.toISOString().slice(0, 10);
}
