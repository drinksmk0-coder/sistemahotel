import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRole, useSession } from "@/hooks/use-auth";
import { useCurrentCompany } from "@/lib/data";
import { BRAND_STORAGE_PREFIX } from "@/lib/brand";

export function SystemMonitor() {
  const company = useCurrentCompany();
  const { user } = useSession();
  const { data: role } = useRole(user);
  const path = useRouterState({ select: (state) => state.location.pathname });
  const canReview = role === "dono" || role === "recepcao";
  const companyId = company.data?.id;
  const feedbackSeenKey = `${BRAND_STORAGE_PREFIX}:feedback-seen:${companyId ?? "none"}:${user?.id ?? "anon"}`;

  const pendingCheckins = useQuery({
    queryKey: ["guest-checkins-pending", companyId],
    enabled: Boolean(companyId && canReview),
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { count, error } = await (supabase as any)
        .from("guest_checkins")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("status", "preenchido")
        .is("reviewed_at", null);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const pendingEmailEvents = useQuery({
    queryKey: ["hotel-email-inbox-pending", companyId],
    enabled: Boolean(companyId && canReview),
    staleTime: 20_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const [booking, expenses] = await Promise.all([
        (supabase as any)
          .from("booking_email_events")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .in("status", ["needs_review", "error"]),
        (supabase as any)
          .from("expense_email_events")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
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

  const pendingFeedbacks = useQuery({
    queryKey: ["hotel-feedback-inbox-pending", companyId, user?.id],
    enabled: Boolean(companyId && user?.id && canReview),
    staleTime: 0,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const seenAt = window.localStorage.getItem(feedbackSeenKey) ?? "1970-01-01T00:00:00.000Z";
      const { count, error } = await (supabase as any)
        .from("feedbacks")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .gt("created_at", seenAt);
      if (error) throw error;
      return count ?? 0;
    },
  });

  useEffect(() => {
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
  }, [companyId, path, role, user?.id]);

  useEffect(() => {
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
        code: event.reason instanceof Error ? event.reason.name : "unhandled_rejection",
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, [companyId]);

  if (!canReview || !companyId) return null;

  const checkins = pendingCheckins.data ?? 0;
  const booking = pendingEmailEvents.data?.booking ?? 0;
  const expenses = pendingEmailEvents.data?.expenses ?? 0;
  const feedbacks = pendingFeedbacks.data ?? 0;
  const total = checkins + booking + expenses + feedbacks;

  function markFeedbacksSeen() {
    if (feedbacks <= 0) return;
    window.localStorage.setItem(feedbackSeenKey, new Date().toISOString());
    void pendingFeedbacks.refetch();
  }

  if (total <= 0 || path.startsWith("/caixa-entrada-hotel")) return null;

  const details = [
    booking ? `${booking} Booking` : "",
    expenses ? `${expenses} conta(s)` : "",
    feedbacks ? `${feedbacks} avaliação(ões)` : "",
    checkins ? `${checkins} FNRH` : "",
  ].filter(Boolean).join(" · ");

  return (
    <Link
      to="/caixa-entrada-hotel"
      onClick={markFeedbacksSeen}
      className="group fixed bottom-24 right-0 z-[78] flex items-center gap-2 rounded-l-xl border border-r-0 border-primary/25 bg-card/95 py-2 pl-2 pr-2.5 text-xs font-extrabold text-primary shadow-xl backdrop-blur transition hover:pr-4 sm:bottom-5"
      aria-label={`${total} entrada(s) aguardando conferência: ${details}`}
      title={details}
    >
      <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
        <Inbox className="h-4 w-4" />
        <span className="absolute -left-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-brick px-1 text-[10px] font-black text-white">
          {total > 99 ? "99+" : total}
        </span>
      </span>
      <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-200 group-hover:max-w-40 group-hover:opacity-100 sm:max-w-40 sm:opacity-100">
        Conferir entradas
      </span>
    </Link>
  );
}
