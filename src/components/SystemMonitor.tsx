import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useRole, useSession } from "@/hooks/use-auth";
import { useCurrentCompany } from "@/lib/data";
import { BRAND_STORAGE_PREFIX } from "@/lib/brand";
import { ReceptionSalesCorrectionPanel } from "@/components/ReceptionSalesCorrectionPanel";

const DELETE_ACTION_RE = /\b(excluir|exclus[aã]o|apagar|remover|delete)\b/i;

export function SystemMonitor() {
  const company = useCurrentCompany();
  const { user } = useSession();
  const { data: role } = useRole(user);
  const path = useRouterState({ select: (state) => state.location.pathname });
  const companyId = company.data?.id;

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

  useEffect(() => {
    if (role !== "recepcao") return;

    const hidden = new Set<HTMLElement>();
    const applyGuard = () => {
      document.querySelectorAll<HTMLElement>('button,[role="menuitem"],a').forEach((element) => {
        if (element.dataset.receptionDeleteHidden === "1") return;
        const label = [
          element.textContent ?? "",
          element.getAttribute("title") ?? "",
          element.getAttribute("aria-label") ?? "",
        ].join(" ");
        if (!DELETE_ACTION_RE.test(label)) return;
        element.dataset.receptionDeleteHidden = "1";
        element.style.setProperty("display", "none", "important");
        hidden.add(element);
      });
    };

    applyGuard();
    const observer = new MutationObserver(applyGuard);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      hidden.forEach((element) => {
        if (element.dataset.receptionDeleteHidden !== "1") return;
        element.style.removeProperty("display");
        delete element.dataset.receptionDeleteHidden;
      });
    };
  }, [path, role]);

  if (role === "recepcao" && companyId && path.startsWith("/vendas")) {
    return <ReceptionSalesCorrectionPanel companyId={companyId} />;
  }

  return null;
}
