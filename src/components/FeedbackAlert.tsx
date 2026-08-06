import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { MessageSquareText, TriangleAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRole, useSession } from "@/hooks/use-auth";
import { useCurrentCompany } from "@/lib/data";
import { BRAND_STORAGE_PREFIX } from "@/lib/brand";

type RecentFeedback = {
  id: string;
  nota_geral: number | null;
  nota_limpeza: number | null;
  nota_cama: number | null;
  nota_banheiro: number | null;
  nota_chuveiro: number | null;
  nota_silencio: number | null;
  nota_ventilacao: number | null;
  nota_espaco: number | null;
  nota_tv: number | null;
  nota_frigobar: number | null;
  nota_wifi: number | null;
  nota_iluminacao: number | null;
  nota_custo_beneficio: number | null;
  nota_atendimento: number | null;
  quarto: number | null;
  created_at: string;
};

const SCORE_KEYS = [
  "nota_geral",
  "nota_limpeza",
  "nota_cama",
  "nota_banheiro",
  "nota_chuveiro",
  "nota_silencio",
  "nota_ventilacao",
  "nota_espaco",
  "nota_tv",
  "nota_frigobar",
  "nota_wifi",
  "nota_iluminacao",
  "nota_custo_beneficio",
  "nota_atendimento",
] as const;

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
        .select(
          "id, nota_geral, nota_limpeza, nota_cama, nota_banheiro, nota_chuveiro, nota_silencio, nota_ventilacao, nota_espaco, nota_tv, nota_frigobar, nota_wifi, nota_iluminacao, nota_custo_beneficio, nota_atendimento, quarto, created_at",
        )
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
  const scoredValues = SCORE_KEYS.map((key) => latest[key]).filter(
    (score): score is number => score != null,
  );
  const lowestScore = scoredValues.length ? Math.min(...scoredValues) : null;
  const hasOccurrence = lowestScore != null && lowestScore <= 2;
  const isUrgent = lowestScore === 1;
  const alertTitle = isUrgent
    ? "Nova ocorrência urgente"
    : hasOccurrence
      ? "Nova ocorrência relevante"
      : "Nova avaliação recebida";
  const detail = [
    hasOccurrence ? `Menor nota ${lowestScore}/5` : latest.nota_geral != null ? `Nota ${latest.nota_geral}/5` : null,
    latest.quarto != null ? `quarto ${latest.quarto}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  function markSeen() {
    window.localStorage.setItem(seenKey, new Date().toISOString());
  }

  return (
    <Link
      to={hasOccurrence ? "/reclamacoes" : "/avaliacoes"}
      onClick={markSeen}
      className={`fixed right-3 top-14 z-[81] flex w-[min(24rem,calc(100vw-1.5rem))] items-start gap-3 rounded-xl border p-3 shadow-2xl transition hover:-translate-y-0.5 sm:right-5 sm:top-4 ${
        isUrgent
          ? "border-red-300 bg-red-50 text-red-950"
          : hasOccurrence
            ? "border-orange-300 bg-orange-50 text-orange-950"
            : "border-amber-300 bg-amber-50 text-amber-950"
      }`}
      aria-label={`${pending.length} nova(s) resposta(s). ${alertTitle}`}
    >
      <span
        className={`relative mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full text-white ${
          isUrgent ? "bg-red-700" : hasOccurrence ? "bg-orange-700" : "bg-amber-700"
        }`}
      >
        {hasOccurrence ? <TriangleAlert className="h-5 w-5" /> : <MessageSquareText className="h-5 w-5" />}
        <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-brick px-1 text-[10px] font-black text-white">
          {pending.length > 99 ? "99+" : pending.length}
        </span>
      </span>
      <span className="min-w-0">
        <strong className="block text-sm">{alertTitle}</strong>
        <span className="mt-0.5 block text-xs leading-relaxed opacity-80">
          {detail || `${pending.length} resposta(s) nova(s)`}. Clique para conferir.
        </span>
      </span>
    </Link>
  );
}
