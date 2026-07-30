import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BellRing } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRole, useSession } from "@/hooks/use-auth";
import { useCurrentCompany } from "@/lib/data";

export function SystemMonitor() {
  const company = useCurrentCompany();
  const { user } = useSession();
  const { data: role } = useRole(user);
  const canReviewCheckins = role === "dono" || role === "recepcao";

  const pendingCheckins = useQuery({
    queryKey: ["guest-checkins-pending", company.data?.id],
    enabled: Boolean(company.data?.id && canReviewCheckins),
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { count, error } = await (supabase as any)
        .from("guest_checkins")
        .select("id", { count: "exact", head: true })
        .eq("company_id", company.data!.id)
        .eq("status", "preenchido")
        .is("reviewed_at", null);
      if (error) throw error;
      return count ?? 0;
    },
  });

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
      const signature = `${title}|${description}|${window.location.pathname}`.slice(
        0,
        500,
      );
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
      if (error) {
        console.warn("[Monitor] Falha ao registrar incidente:", error.message);
      }
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
        code:
          event.reason instanceof Error
            ? event.reason.name
            : "unhandled_rejection",
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, [company.data?.id]);

  if (!canReviewCheckins || !company.data?.id) return null;

  const pendingCount = pendingCheckins.data ?? 0;
  if (pendingCount <= 0) return null;

  return (
    <Link
      to="/fichas-checkin"
      className="fixed right-3 top-14 z-[80] flex w-[min(24rem,calc(100vw-1.5rem))] items-start gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-emerald-950 shadow-2xl transition hover:-translate-y-0.5 sm:right-5 sm:top-4"
      aria-label={`${pendingCount} ficha(s) de check-in aguardando conferência`}
    >
      <span className="relative mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-700 text-white">
        <BellRing className="h-5 w-5" />
        <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-brick px-1 text-[10px] font-black text-white">
          {pendingCount > 99 ? "99+" : pendingCount}
        </span>
      </span>
      <span className="min-w-0">
        <strong className="block text-sm">
          Nova ficha de check-in recebida
        </strong>
        <span className="mt-0.5 block text-xs leading-relaxed text-emerald-800">
          {pendingCount} ficha(s) aguardando conferência. Clique para abrir os
          dados e a assinatura.
        </span>
      </span>
    </Link>
  );
}
