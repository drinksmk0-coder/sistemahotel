import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { getValidAuth } from "@/lib/auth";

export type AppRole = "dono" | "recepcao" | "limpeza" | "cafe";

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    void getValidAuth().then((auth) => {
      if (!mounted) return;
      setSession(auth?.session ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setLoading(false);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, user: session?.user ?? null, loading };
}

export function useRole(user: User | null) {
  return useQuery({
    queryKey: ["role", user?.id],
    enabled: !!user,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<AppRole | null> => {
      const { data: memberRoles, error } = await supabase
        .from("company_members" as never)
        .select("role,ativo")
        .eq("user_id", user!.id);
      if (error) throw error;

      const roles = (memberRoles ?? []) as unknown as { role: AppRole; ativo: boolean }[];
      const activeRoles = roles.filter((row) => row.ativo);
      if (activeRoles.some((row) => row.role === "dono")) return "dono";
      if (activeRoles.some((row) => row.role === "recepcao")) return "recepcao";
      if (activeRoles.some((row) => row.role === "limpeza")) return "limpeza";
      if (activeRoles.some((row) => row.role === "cafe")) return "cafe";
      return null;
    },
  });
}

export function useProfile(user: User | null) {
  return useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("nome, email")
        .eq("id", user!.id)
        .maybeSingle();
      return data;
    },
  });
}
