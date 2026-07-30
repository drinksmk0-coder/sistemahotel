import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useRole, useSession } from "@/hooks/use-auth";

const LEGACY_OWNER_DASHBOARDS = new Set(["/painel", "/dashboard-estrategico"]);

export function OwnerStrategicRedirect() {
  const { user } = useSession();
  const { data: role, isLoading } = useRole(user);
  const navigate = useNavigate();
  const path = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => {
    if (isLoading || role !== "dono" || !LEGACY_OWNER_DASHBOARDS.has(path)) return;

    navigate({ to: "/central-estrategica", replace: true });
  }, [isLoading, navigate, path, role]);

  return null;
}
