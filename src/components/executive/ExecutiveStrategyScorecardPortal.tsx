import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ExecutiveStrategyScorecard } from "@/components/executive/ExecutiveStrategyScorecard";

export function ExecutiveStrategyScorecardPortal() {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let attempts = 0;
    let portalHost: HTMLDivElement | null = null;

    const timer = window.setInterval(() => {
      attempts += 1;
      const root = document.querySelector<HTMLElement>("[data-executive-dashboard]");
      const dashboard = root?.firstElementChild;
      const header = dashboard?.querySelector<HTMLElement>("header");

      if (!dashboard || !header) {
        if (attempts >= 50) window.clearInterval(timer);
        return;
      }

      const existing = dashboard.querySelector<HTMLElement>("[data-strategy-scorecard-host]");
      if (existing) {
        setHost(existing);
        window.clearInterval(timer);
        return;
      }

      portalHost = document.createElement("div");
      portalHost.dataset.strategyScorecardHost = "true";
      portalHost.className = "executive-strategy-scorecard-host";
      header.insertAdjacentElement("afterend", portalHost);
      setHost(portalHost);
      window.clearInterval(timer);
    }, 100);

    return () => {
      window.clearInterval(timer);
      portalHost?.remove();
    };
  }, []);

  if (!host) return null;
  return createPortal(<ExecutiveStrategyScorecard />, host);
}
