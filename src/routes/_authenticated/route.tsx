import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { GlobalHistoryNavigation } from "@/components/GlobalHistoryNavigation";
import { OwnerStrategicRedirect } from "@/components/OwnerStrategicRedirect";
import { getValidAuth } from "@/lib/auth";
import "@/components/app-floating-tools.css";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const auth = await getValidAuth();
    if (!auth) throw redirect({ to: "/auth" });

    const { data: members, error: memberError } = await supabase
      .from("company_members" as never)
      .select("id")
      .eq("user_id", auth.user.id);

    if (!memberError && members?.length) return { user: auth.user };

    const { data: roles, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", auth.user.id);
    if (roleError || !roles?.length) {
      throw redirect({ to: "/cadastro-empresa" });
    }

    return { user: auth.user };
  },
  component: AuthenticatedShell,
});

function AuthenticatedShell() {
  const path = useRouterState({ select: (state) => state.location.pathname });

  // Na branch de demonstração, o painel atraente precisa ser visualmente independente
  // do layout legado para reproduzir de verdade a proposta enviada pelo usuário.
  if (path === "/painel-atraente") {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-[#ede9df]">
        <Outlet />
      </div>
    );
  }

  return (
    <AppLayout>
      <OwnerStrategicRedirect />
      <GlobalHistoryNavigation />
      <Outlet />
    </AppLayout>
  );
}
