import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { Palette } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany } from "@/lib/data";

const DEFAULT_THEME = "#2f5d48";
const PRESETS = ["#2f5d48", "#245b78", "#6b3f68", "#7a4c2e", "#4f5f2f", "#394b59"];

type ThemedCompany = { id: string; tema_cor?: string | null };

export function CompanyThemePicker() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const company = useCurrentCompany();
  const queryClient = useQueryClient();
  const themedCompany = company.data as ThemedCompany | null;
  const [color, setColor] = useState(themedCompany?.tema_cor ?? DEFAULT_THEME);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setColor(themedCompany?.tema_cor ?? DEFAULT_THEME);
  }, [themedCompany?.id, themedCompany?.tema_cor]);

  if (path !== "/empresa" || !themedCompany) return null;

  async function saveTheme(nextColor: string) {
    if (!/^#[0-9a-f]{6}$/i.test(nextColor)) {
      toast.error("Escolha uma cor válida.");
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("companies" as never)
      .update({ tema_cor: nextColor, tema_atualizado_em: new Date().toISOString() } as never)
      .eq("id", themedCompany.id);
    setSaving(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    await queryClient.invalidateQueries({ queryKey: ["companies"] });
    toast.success("Cor atualizada em todos os aparelhos");
  }

  return (
    <section className="fixed right-3 top-16 z-30 w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border border-border bg-card p-4 shadow-xl xl:right-5 xl:top-5">
      <div className="flex items-start gap-3">
        <Palette className="mt-0.5 h-5 w-5 text-pine" />
        <div className="min-w-0 flex-1">
          <h3 className="font-serif font-bold text-pine-dark">Cor do SistemaHotel</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            A cor fica salva na empresa e aparece no notebook, celular e computador do hotel.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                aria-label={`Usar cor ${preset}`}
                className={`h-8 w-8 rounded-full border-2 shadow-sm ${color === preset ? "border-foreground" : "border-white"}`}
                style={{ backgroundColor: preset }}
                onClick={() => {
                  setColor(preset);
                  void saveTheme(preset);
                }}
              />
            ))}
            <input
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
              className="h-9 w-12 cursor-pointer rounded border border-border bg-card p-1"
              aria-label="Escolher outra cor"
            />
            <button type="button" className="btn-primary text-xs" disabled={saving} onClick={() => void saveTheme(color)}>
              {saving ? "Salvando..." : "Aplicar"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
