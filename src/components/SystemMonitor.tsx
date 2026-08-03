import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { BellRing, Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRole, useSession } from "@/hooks/use-auth";
import { useCurrentCompany } from "@/lib/data";
import { BRAND_STORAGE_PREFIX } from "@/lib/brand";
import { FeedbackAlert } from "@/components/FeedbackAlert";

export function SystemMonitor() {
  const company = useCurrentCompany();
  const { user } = useSession();
  const { data: role } = useRole(user);
  const path = useRouterState({ select: (state) => state.location.pathname });
  const canReview = role === "dono" || role === "recepcao";

  const pendingCheckins = useQuery({
    queryKey: ["guest-checkins-pending", company.data?.id],
    enabled: Boolean(company.data?.id && canReview),
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

  const pendingEmailEvents = useQuery({
    queryKey: ["hotel-email-inbox-pending", company.data?.id],
    enabled: Boolean(company.data?.id && canReview),
    staleTime: 20_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const [booking, expenses] = await Promise.all([
        (supabase as any)
          .from("booking_email_events")
          .select("id", { count: "exact", head: true })
          .eq("company_id", company.data!.id)
          .in("status", ["needs_review", "error"]),
        (supabase as any)
          .from("expense_email_events")
          .select("id", { count: "exact", head: true })
          .eq("company_id", company.data!.id)
          .in("status", ["needs_review", "error"]),
      ]);
      if (booking.error) throw booking.error;
      if (expenses.error) throw expenses.error;
      return {
        booking: booking.count ?? 0,
        expenses: expenses.count ?? 0,
      };
    },
  });

  useEffect(() => {
    const companyId = company.data?.id;
    if (!companyId || !user?.id || !role) return;

    const sessionKey = `${BRAND_STORAGE_PREFIX}:session:${companyId}:${user.id}`;
    const isNewSession = !window.sessionStorage.getItem(sessionKey);
    if (isNewSession) window.sessionStorage.setItem(sessionKey, "1");
    let firstRequest = true;

    const record = async () => {
      if (document.visibilityState === "hidden") return;
      const { error } = await (supabase as any).rpc("record_user_activity", {
        p_company_id: companyId,
        p_path: window.location.pathname,
        p_new_session: firstRequest && isNewSession,
      });
      firstRequest = false;
      if (error) {
        console.warn("[Activity] Não foi possível atualizar o último acesso:", error.message);
      }
    };

    void record();
    const interval = window.setInterval(() => void record(), 120_000);
    const onFocus = () => void record();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void record();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [company.data?.id, path, role, user?.id]);

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
        page_url: `${window.location.origin}${window.location.pathname}`,
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

  if (!canReview || !company.data?.id) return null;

  const checkins = pendingCheckins.data ?? 0;
  const booking = pendingEmailEvents.data?.booking ?? 0;
  const expenses = pendingEmailEvents.data?.expenses ?? 0;
  const total = checkins + booking + expenses;

  return (
    <>
      <FeedbackAlert />

      <Link
        to="/caixa-entrada-hotel"
        className="fixed bottom-4 right-4 z-[78] flex items-center gap-2 rounded-full border border-primary/20 bg-card px-3 py-2 text-xs font-extrabold text-primary shadow-xl transition hover:-translate-y-0.5 hover:border-primary/40"
        aria-label="Abrir Central de entradas do hotel"
      >
        <span className="relative grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground">
          <Inbox className="h-4 w-4" />
          {total > 0 && (
            <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-brick px-1 text-[10px] font-black text-white">
              {total > 99 ? "99+" : total}
            </span>
          )}
        </span>
        Central de entradas
      </Link>

      {total > 0 && path !== "/caixa-entrada-hotel" && (
        <Link
          to="/caixa-entrada-hotel"
          className="fixed right-3 top-14 z-[80] flex w-[min(26rem,calc(100vw-1.5rem))] items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950 shadow-2xl transition hover:-translate-y-0.5 sm:right-5 sm:top-4"
          aria-label={`${total} entrada(s) do hotel aguardando conferência`}
        >
          <span className="relative mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-700 text-white">
            <BellRing className="h-5 w-5" />
            <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-brick px-1 text-[10px] font-black text-white">
              {total > 99 ? "99+" : total}
            </span>
          </span>
          <span className="min-w-0">
            <strong className="block text-sm">Central do hotel precisa de atenção</strong>
            <span className="mt-0.5 block text-xs leading-relaxed text-amber-800">
              {booking > 0 ? `${booking} Booking · ` : ""}
              {expenses > 0 ? `${expenses} conta(s) · ` : ""}
              {checkins > 0 ? `${checkins} FNRH` : ""}
              . Clique para conferir sem procurar em várias telas.
            </span>
          </span>
        </Link>
      )}
    </>
  );
}
