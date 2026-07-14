import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "dono" | "recepcao" | "limpeza" | "cafe";

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, user: session?.user ?? null, loading };
}

export function useRole(user: User | null) {
  return useQuery({
    queryKey: ["role", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<AppRole | null> => {
      const { data: memberRoles, error: memberError } = await supabase
        .from("company_members" as never)
        .select("role")
        .eq("user_id", user!.id);
      if (!memberError && memberRoles?.length) {
        const roles = memberRoles as unknown as { role: AppRole }[];
        if (roles.some((r) => r.role === "dono")) return "dono";
        if (roles.some((r) => r.role === "recepcao")) return "recepcao";
        if (roles.some((r) => r.role === "limpeza")) return "limpeza";
        if (roles.some((r) => r.role === "cafe")) return "cafe";
      }

      const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", user!.id);
      if (error) throw error;
      if (data?.some((r) => r.role === "dono")) return "dono";
      if (data?.some((r) => r.role === "recepcao")) return "recepcao";
      if (data?.some((r) => r.role === "limpeza")) return "limpeza";
      if (data?.some((r) => r.role === "cafe")) return "cafe";
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
