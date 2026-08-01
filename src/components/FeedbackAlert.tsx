import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { MessageSquareText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRole, useSession } from "@/hooks/use-auth";
import { useCurrentCompany } from "@/lib/data";
import { BRAND_STORAGE_PREFIX } from "@/lib/brand";

type RecentFeedback = {
  id: string;
  nota_geral: number | null;
  quarto: number | null;
  created_at: string;
};

export function FeedbackAlert() {
  const company = useCurrentCompany();
  const { user } = useSession();
  const { data: role } = useRole(user);
  const canReview = role === "dono" || role === "recepcao";
  const companyId = company.data?.id;
  const seenKey = `${BRAND_STORAGE_PREFIX}:feedback-seen:${companyId ?? "none"}:${user?.id ?? "anon"}`;

  const feedbacks = useQuery({
    queryKey: ["new-feedback-alert", companyId, user?.id],
    enabled: Boolean(companyId && user?.id && canReview),
    staleTime: 0,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const seenAt = window.localStorage.getItem(seenKey) ?? "1970-01-01T00:00:00.000Z";
      const { data, error } = await (supabase as any)
        .from("feedbacks")
        .select("id, nota_geral, quarto, created_at")
        .eq("company_id", companyId)
        .gt("created_at", seenAt)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as RecentFeedback[];
    },
  });

  const pending = feedbacks.data ?? [];
  if (!canReview || !companyId || pending.length === 0) return null;

  const latest = pending[0];
  const detail = [
    latest.nota_geral != null ? `Nota ${latest.nota_geral}/5` : null,
    latest.quarto != null ? `quarto ${latest.quarto}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  function markSeen() {
    window.localStorage.setItem(seenKey, new Date().toISOString());
  }

  return (
    <Link
      to="/avaliacoes"
      onClick={markSeen}
      className="fixed right-3 top-14 z-[81] flex w-[min(24rem,calc(100vw-1.5rem))] items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950 shadow-2xl transition hover:-translate-y-0.5 sm:right-5 sm:top-4"
      aria-label={`${pending.length} nova(s) avaliação(ões) recebida(s)`}
    >
      <span className="relative mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-700 text-white">
        <MessageSquareText className="h-5 w-5" />
        <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-brick px-1 text-[10px] font-black text-white">
          {pending.length > 99 ? "99+" : pending.length}
        </span>
      </span>
      <span className="min-w-0">
        <strong className="block text-sm">Nova avaliação recebida</strong>
        <span className="mt-0.5 block text-xs leading-relaxed text-amber-800">
          {detail || `${pending.length} resposta(s) nova(s)`}. Clique para conferir a avaliação.
        </span>
      </span>
    </Link>
  );
}
