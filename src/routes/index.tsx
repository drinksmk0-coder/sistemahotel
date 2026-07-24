import { createFileRoute, redirect } from "@tanstack/react-router";
import { getValidAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    if (await getValidAuth()) throw redirect({ to: "/painel" });
    throw redirect({ to: "/auth" });
  },
  component: () => null,
});
