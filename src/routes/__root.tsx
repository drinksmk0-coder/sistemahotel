import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/sonner";
import { HotelAiReportReaderEnhancer } from "@/components/HotelAiReportReaderEnhancer";
import { useInspectorGuard } from "@/hooks/use-inspector-guard";
import { BRAND, brandedPageTitle, canonicalUrlForCurrentLocation } from "@/lib/brand";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">
          Página não encontrada
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A página que você está procurando não existe ou foi movida.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Ir para casa
          </Link>
        </div>
      </div>
    </div>
  );
}

function isOutdatedBundleError(error: Error) {
  const text = `${error.name} ${error.message} ${error.stack ?? ""}`.toLowerCase();
  return [
    "failed to fetch dynamically imported module",
    "importing a module script failed",
    "error loading dynamically imported module",
    "chunkloaderror",
    "loading chunk",
    "preload",
  ].some((fragment) => text.includes(fragment));
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const outdatedBundle = isOutdatedBundleError(error);

  useEffect(() => {
    reportLovableError(error, {
      boundary: "tanstack_root_error_component",
      outdated_bundle: outdatedBundle,
      page_url: typeof window !== "undefined" ? window.location.href : null,
    });

    if (!outdatedBundle || typeof window === "undefined") return;
    const reloadKey = `hospedamais:bundle-reload:${window.location.pathname}`;
    if (window.sessionStorage.getItem(reloadKey) === "1") return;
    window.sessionStorage.setItem(reloadKey, "1");
    window.location.reload();
  }, [error, outdatedBundle]);

  function reloadApplication() {
    if (typeof window === "undefined") {
      router.invalidate();
      reset();
      return;
    }
    window.sessionStorage.removeItem(`hospedamais:bundle-reload:${window.location.pathname}`);
    window.location.reload();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {outdatedBundle ? "O sistema recebeu uma atualização" : "Esta página não carregou"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {outdatedBundle
            ? "Atualize para carregar a versão mais recente e continuar trabalhando. Seus dados não serão apagados."
            : "Algo deu errado ao abrir esta página. Atualize o sistema ou volte para o início."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={reloadApplication}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Atualizar sistema
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Ir para casa
          </a>
        </div>
        {!outdatedBundle && (
          <p className="mt-4 text-xs text-muted-foreground">
            Caso o problema continue, informe à administração qual página estava sendo aberta.
          </p>
        )}
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#2878e8" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      {
        name: "apple-mobile-web-app-status-bar-style",
        content: "black-translucent",
      },
      { name: "apple-mobile-web-app-title", content: BRAND.shortName },
      { title: brandedPageTitle() },
      { name: "description", content: BRAND.description },
      { name: "application-name", content: BRAND.name },
      { name: "author", content: BRAND.name },
      { property: "og:title", content: brandedPageTitle() },
      { property: "og:description", content: BRAND.description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: brandedPageTitle() },
      { name: "twitter:description", content: BRAND.description },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: BRAND.icon, type: "image/svg+xml" },
      { rel: "shortcut icon", href: BRAND.icon, type: "image/svg+xml" },
      { rel: "manifest", href: BRAND.manifest },
      { rel: "apple-touch-icon", href: BRAND.icon },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  useInspectorGuard();

  useEffect(() => {
    const canonicalUrl = canonicalUrlForCurrentLocation();
    if (canonicalUrl) window.location.replace(canonicalUrl);
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (
        event !== "SIGNED_IN" &&
        event !== "SIGNED_OUT" &&
        event !== "USER_UPDATED"
      ) {
        return;
      }
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => sub.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <HotelAiReportReaderEnhancer />
      <Toaster richColors position="top-center" />
    </QueryClientProvider>
  );
}
