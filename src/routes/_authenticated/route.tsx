import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { OwnerStrategicRedirect } from "@/components/OwnerStrategicRedirect";
import { getValidAuth } from "@/lib/auth";

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
  component: () => (
    <AppLayout>
      <OwnerStrategicRedirect />
      <Outlet />
    </AppLayout>
  ),
});
