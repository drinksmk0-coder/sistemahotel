import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany } from "@/lib/data";

type Range = { start: string; end: string };

export function ExecutiveDataCoverageNotice() {
  const company = useCurrentCompany();
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [range, setRange] = useState<Range | null>(null);

  const coverage = useQuery({
    queryKey: ["executive-reservation-data-coverage", company.data?.id],
    enabled: Boolean(company.data?.id),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("reservations")
        .select("checkin")
        .eq("company_id", company.data!.id)
        .order("checkin", { ascending: true })
        .limit(1);
      if (error) throw error;
      return String(data?.[0]?.checkin ?? "").slice(0, 10) || null;
    },
  });

  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-executive-dashboard]");
    if (!root) return;

    const install = () => {
      const header = root.querySelector<HTMLElement>("[data-executive-header]");
      if (!header) return;

      let nextHost = root.querySelector<HTMLElement>("[data-executive-coverage-host]");
      if (!nextHost) {
        nextHost = document.createElement("div");
        nextHost.dataset.executiveCoverageHost = "true";
        header.insertAdjacentElement("afterend", nextHost);
      }
      setHost((current) => current === nextHost ? current : nextHost);

      const fields = header.querySelectorAll<HTMLInputElement>('input[type="date"]');
      if (fields.length >= 2 && fields[0].value && fields[1].value) {
        const start = fields[0].value <= fields[1].value ? fields[0].value : fields[1].value;
        const end = fields[0].value <= fields[1].value ? fields[1].value : fields[0].value;
        setRange((current) => current?.start === start && current?.end === end ? current : { start, end });
      }
    };

    install();
    const timer = window.setInterval(install, 500);
    const sync = () => window.setTimeout(install, 0);
    root.addEventListener("input", sync, true);
    root.addEventListener("change", sync, true);

    return () => {
      window.clearInterval(timer);
      root.removeEventListener("input", sync, true);
      root.removeEventListener("change", sync, true);
      root.querySelector("[data-executive-coverage-host]")?.remove();
    };
  }, []);

  const firstReservationDate = coverage.data;
  const isIncomplete = Boolean(
    host && range?.start && firstReservationDate && range.start < firstReservationDate,
  );

  if (!host || !isIncomplete || !firstReservationDate) return null;

  return createPortal(
    <div
      role="status"
      data-executive-coverage-warning
      className="mt-2 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-950 shadow-sm"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <span>
        <strong>Cobertura operacional incompleta.</strong>{" "}
        As reservas disponíveis no banco começam em {formatDate(firstReservationDate)}. O período selecionado começa em {formatDate(range!.start)}, então KPIs de ocupação, reservas, ADR e RevPAR anteriores a essa data ficam parciais. Para análise operacional confiável, use {formatDate(firstReservationDate)} em diante ou importe o histórico completo.
      </span>
    </div>,
    host,
  );
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
