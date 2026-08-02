import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany } from "@/lib/data";
import { CompanyThemePicker } from "@/components/CompanyThemePicker";

const DEFAULT_THEME = "#2f5d48";

type ThemedCompany = { id: string; tema_cor?: string | null };

function validHex(value?: string | null) {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : DEFAULT_THEME;
}

function applyCompanyTheme(value?: string | null) {
  const color = validHex(value);
  const root = document.documentElement;
  root.style.setProperty("--pine", color);
  root.style.setProperty("--primary", color);
  root.style.setProperty("--pine-dark", `color-mix(in srgb, ${color} 76%, black)`);
  root.style.setProperty("--secondary-foreground", `color-mix(in srgb, ${color} 78%, black)`);

  const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  themeMeta?.setAttribute("content", color);
}

export function CompanyThemeSync() {
  const company = useCurrentCompany();
  const queryClient = useQueryClient();
  const themedCompany = company.data as ThemedCompany | null;
  const companyId = themedCompany?.id;
  const themeColor = themedCompany?.tema_cor;

  useEffect(() => {
    applyCompanyTheme(themeColor);
  }, [themeColor]);

  useEffect(() => {
    if (!companyId) return;

    const channel = supabase
      .channel(`company-theme-${companyId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "companies", filter: `id=eq.${companyId}` },
        (payload) => {
          const updated = payload.new as { tema_cor?: string | null };
          applyCompanyTheme(updated.tema_cor);
          queryClient.invalidateQueries({ queryKey: ["companies"] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [companyId, queryClient]);

  return <CompanyThemePicker />;
}
