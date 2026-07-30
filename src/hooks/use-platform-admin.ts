import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-auth";

export function usePlatformAdmin() {
  const { user } = useSession();

  return useQuery({
    queryKey: ["platform-admin", user?.id],
    enabled: Boolean(user?.id),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("platform_admins")
        .select("user_id")
        .eq("user_id", user!.id)
        .eq("ativo", true)
        .maybeSingle();

      if (error) throw error;
      return Boolean(data);
    },
  });
}
