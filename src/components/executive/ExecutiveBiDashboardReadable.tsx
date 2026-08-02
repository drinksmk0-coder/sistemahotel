import { useEffect, useRef, useState } from "react";
import { ExecutiveBiDashboard } from "@/components/executive/ExecutiveBiDashboard";
import { ExecutiveCommandCenter } from "@/components/executive/ExecutiveCommandCenter";
import { useCurrentCompany } from "@/lib/data";

type Range = { start: string; end: string };

export function ExecutiveBiDashboardReadable() {
  const rootRef = useRef<HTMLDivElement>(null);
  const company = useCurrentCompany();
  const [range, setRange] = useState<Range | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    function syncRange() {
      const inputs = root.querySelectorAll<HTMLInputElement>('input[type="date"]');
      if (inputs.length < 2 || !inputs[0].value || !inputs[1].value) return;
      const next = normalizeRange(inputs[0].value, inputs[1].value);
      setRange((current) =>
        current?.start === next.start && current?.end === next.end ? current : next,
      );
    }

    const observer = new MutationObserver(syncRange);
    observer.observe(root, { childList: true, subtree: true });
    root.addEventListener("change", syncRange, true);
    root.addEventListener("input", syncRange, true);
    const timer = window.setTimeout(syncRange, 0);

    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      root.removeEventListener("change", syncRange, true);
      root.removeEventListener("input", syncRange, true);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="executive-readable-root h-full min-h-0 overflow-y-auto"
      data-executive-dashboard
    >
      <div className="space-y-2">
        <ExecutiveCommandCenter companyId={company.data?.id} range={range} />
        <ExecutiveBiDashboard />
      </div>
    </div>
  );
}

function normalizeRange(start: string, end: string): Range {
  return start <= end ? { start, end } : { start: end, end: start };
}
