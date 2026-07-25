import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany } from "@/lib/data";

export function SystemMonitor() {
  const company = useCurrentCompany();

  useEffect(() => {
    const companyId = company.data?.id;
    if (!companyId) return;
    const recent = new Set<string>();

    const capture = async ({
      title,
      description,
      code,
      context,
    }: {
      title: string;
      description: string;
      code?: string;
      context?: Record<string, unknown>;
    }) => {
      const signature = `${title}|${description}|${window.location.pathname}`.slice(0, 500);
      if (recent.has(signature) || description.includes("system_issues")) return;
      recent.add(signature);
      window.setTimeout(() => recent.delete(signature), 60_000);

      const { error } = await supabase.from("system_issues" as never).insert({
        company_id: companyId,
        title: title.slice(0, 160),
        description: description.slice(0, 1500),
        severity: "alta",
        status: "aberto",
        source: "frontend",
        page_url: window.location.href,
        error_code: code?.slice(0, 120) || null,
        context: context ?? {},
      } as never);
      if (error) console.warn("[Monitor] Falha ao registrar incidente:", error.message);
    };

    const onError = (event: ErrorEvent) => {
      void capture({
        title: "Erro automático no sistema",
        description: event.message || "Erro desconhecido no navegador.",
        code: event.error?.name,
        context: {
          source: event.filename,
          line: event.lineno,
          column: event.colno,
        },
      });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason =
        event.reason instanceof Error
          ? `${event.reason.name}: ${event.reason.message}`
          : String(event.reason ?? "Falha assíncrona desconhecida");
      void capture({
        title: "Falha não tratada no sistema",
        description: reason,
        code: event.reason instanceof Error ? event.reason.name : "unhandled_rejection",
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, [company.data?.id]);

  return null;
}
