import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BarChart3, ImagePlus, Palette, Plus, RotateCcw, Save, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/AppLayout";
import { Field, Modal } from "@/components/ui-kit";
import { useCurrentCompany, useInsert, useRooms, useUpdate, type Company, type Room } from "@/lib/data";
import { fmtBRL } from "@/lib/format";
import {
  GUEST_FIELD_KEYS,
  applySystemSettings,
  buildHarmonicPalette,
  getSystemSettings,
  saveSystemSettings,
  type GuestFieldKey,
  type SystemSettings,
} from "@/lib/system-settings";
import { supabase } from "@/integrations/supabase/client";
import {
  normalizeAiDesignProfile,
  saveAiDesignProfile,
  type AiDesignProfile,
} from "@/lib/ai-designer";

export const Route = createFileRoute("/_authenticated/empresa")({
  component: Empresa,
});

function Empresa() {
  const current = useCurrentCompany();
  const { data: rooms = [] } = useRooms();
  const updateCompany = useUpdate("companies", ["companies"]);
  const insertRoom = useInsert("rooms", ["rooms"]);
  const updateRoom = useUpdate("rooms", ["rooms"]);
  const [roomOpen, setRoomOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);

  if (!current.data) {
    return (
      <div>
        <PageHeader title="Empresa" subtitle="Nenhuma empresa encontrada para este usuario." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Empresa"
        subtitle="Cadastro da empresa, quartos, capacidade e observacoes operacionais."
        action={
          <button onClick={() => setRoomOpen(true)} className="btn-primary flex items-center gap-1.5">
            <Plus className="h-4 w-4" /> Quarto
          </button>
        }
      />

      <CompanyForm
        company={current.data}
        onSave={(patch) =>
          updateCompany.mutate(
            { id: current.data!.id, patch },
            {
              onSuccess: () => toast.success("Empresa atualizada"),
              onError: (e) => toast.error(e.message),
            },
          )
        }
      />

      <SystemCustomization companyId={current.data.id} />

      <section className="mt-5 card-surface overflow-x-auto">
        <div className="border-b border-border p-4">
          <h3 className="font-serif text-lg font-bold">Quartos cadastrados</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <th className="p-3">Numero</th>
              <th className="p-3">Andar</th>
              <th className="p-3">Configuracao</th>
              <th className="p-3">Diaria</th>
              <th className="p-3">Banheiro</th>
              <th className="p-3">Observacao</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {rooms.map((room) => (
              <tr key={`${room.company_id}-${room.numero}`} className="border-b border-border/50">
                <td className="p-3 font-serif text-lg font-bold">{room.numero}</td>
                <td className="p-3">{room.andar}</td>
                <td className="p-3">{room.configuracao}</td>
                <td className="p-3">{fmtBRL(room.preco)}</td>
                <td className="p-3">{room.banheiro ? "Sim" : "Nao"}</td>
                <td className="p-3 text-muted-foreground">{room.situacao ?? "-"}</td>
                <td className="p-3 text-right">
                  <button
                    className="btn-ghost py-1 text-xs"
                    onClick={() => {
                      setEditingRoom(room);
                      setRoomOpen(true);
                    }}
                  >
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {roomOpen && (
        <RoomForm
          editing={editingRoom}
          onClose={() => {
            setRoomOpen(false);
            setEditingRoom(null);
          }}
          onSave={(row) => {
            if (editingRoom) {
              updateRoom.mutate(
                { id: editingRoom.numero, patch: row },
                {
                  onSuccess: () => {
                    toast.success("Quarto atualizado");
                    setRoomOpen(false);
                    setEditingRoom(null);
                  },
                  onError: (e) => toast.error(e.message),
                },
              );
            } else {
              insertRoom.mutate(row, {
                onSuccess: () => {
                  toast.success("Quarto cadastrado");
                  setRoomOpen(false);
                },
                onError: (e) => toast.error(e.message),
              });
            }
          }}
        />
      )}
    </div>
  );
}

const GUEST_FIELD_LABELS: Record<GuestFieldKey, string> = {
  cpf: "CPF",
  telefone: "Telefone",
  estado: "Estado/UF",
  estadoCivil: "Estado civil",
  nascimento: "Data de nascimento",
};

function SystemCustomization({ companyId }: { companyId: string }) {
  const [settings, setSettings] = useState<SystemSettings>(() => getSystemSettings(companyId));
  const [designerBusy, setDesignerBusy] = useState(false);
  const [designerSuggestion, setDesignerSuggestion] = useState<{
    system: Partial<SystemSettings>;
    profile: AiDesignProfile;
  } | null>(null);
  const [previousSettings, setPreviousSettings] = useState<SystemSettings | null>(null);

  useEffect(() => {
    applySystemSettings(settings);
  }, [settings]);

  function updateRequired(field: GuestFieldKey, value: boolean) {
    setSettings((current) => ({
      ...current,
      requiredGuestFields: { ...current.requiredGuestFields, [field]: value },
    }));
  }

  function readLogo(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Selecione uma imagem.");
    if (file.size > 700_000) return toast.error("Use uma imagem de até 700 KB.");
    const reader = new FileReader();
    reader.onload = () => setSettings((current) => ({ ...current, logo: String(reader.result) }));
    reader.readAsDataURL(file);
  }

  function applyDesignerPalette(primaryColor: string, theme = settings.theme) {
    setSettings((current) => ({
      ...current,
      ...buildHarmonicPalette(primaryColor, theme),
      theme,
      autoPalette: true,
    }));
  }

  async function analyzeDesign() {
    setDesignerBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("hotel-analyst", {
        body: {
          mode: "design",
          company_id: companyId,
          current_settings: {
            primaryColor: settings.primaryColor,
            accentColor: settings.accentColor,
            backgroundColor: settings.backgroundColor,
            surfaceColor: settings.surfaceColor,
            textColor: settings.textColor,
            theme: settings.theme,
            backgroundStyle: settings.backgroundStyle,
            surfaceOpacity: settings.surfaceOpacity,
            chartSurfaceOpacity: settings.chartSurfaceOpacity,
            borderRadius: settings.borderRadius,
            uiScale: settings.uiScale,
            glassEffect: settings.glassEffect,
            shadows: settings.shadows,
            chartPalette: settings.chartPalette,
          },
        },
      });
      if (error) {
        let message = error.message;
        const context = "context" in error ? error.context : null;
        if (context instanceof Response) {
          const payload = (await context.clone().json().catch(() => null)) as {
            error?: string;
          } | null;
          message = payload?.error || message;
        }
        throw new Error(message);
      }
      if (!data?.design?.system || !data?.design?.profile) {
        throw new Error("O Gemini não retornou uma proposta visual válida.");
      }
      setDesignerSuggestion({
        system: data.design.system as Partial<SystemSettings>,
        profile: normalizeAiDesignProfile(data.design.profile),
      });
      toast.success(
        data.degraded
          ? "Proposta segura preparada. O Gemini estava indisponível; confira antes de aplicar."
          : "Análise visual concluída. Confira a prévia antes de aplicar.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao consultar o designer Gemini.");
    } finally {
      setDesignerBusy(false);
    }
  }

  function applyAiSuggestion() {
    if (!designerSuggestion) return;
    const next: SystemSettings = {
      ...settings,
      ...designerSuggestion.system,
      autoPalette: true,
      aiDesignerEnabled: true,
      requiredGuestFields: settings.requiredGuestFields,
    };
    setPreviousSettings(settings);
    setSettings(next);
    saveSystemSettings(companyId, next);
    saveAiDesignProfile(companyId, designerSuggestion.profile);
    setDesignerSuggestion(null);
    toast.success("Designer Gemini aplicado em todo o sistema e nos dashboards.");
  }

  function undoAiDesign() {
    if (!previousSettings) return;
    setSettings(previousSettings);
    saveSystemSettings(companyId, previousSettings);
    setPreviousSettings(null);
    toast.success("Visual anterior restaurado.");
  }

  return (
    <section id="configuracoes-sistema" className="mt-5 scroll-mt-6 card-surface p-4">
      <div className="mb-4 flex items-center gap-2">
        <Palette className="h-5 w-5 text-brass" />
        <div>
          <h3 className="font-serif text-lg font-bold">Configurações do sistema</h3>
          <p className="text-xs text-muted-foreground">Personalização disponível somente para o dono desta empresa.</p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <div className="space-y-3 rounded-lg border border-border p-3">
          <h4 className="text-sm font-bold text-pine-dark">Marca e aparência</h4>
          <div className="flex items-center gap-3">
            <img src={settings.logo} alt="Prévia da logo" className="h-16 w-16 rounded-lg border bg-white object-contain p-1" />
            <label className="btn-ghost flex cursor-pointer items-center gap-2 text-xs">
              <ImagePlus className="h-4 w-4" />
              Escolher logo
              <input type="file" accept="image/*" className="hidden" onChange={(event) => readLogo(event.target.files?.[0])} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cor principal">
              <input
                className="h-10 w-full cursor-pointer rounded border"
                type="color"
                value={settings.primaryColor}
                onChange={(event) => {
                  const primaryColor = event.target.value;
                  if (settings.autoPalette) applyDesignerPalette(primaryColor);
                  else setSettings((current) => ({ ...current, primaryColor }));
                }}
              />
            </Field>
            <Field label="Cor de destaque">
              <input className="h-10 w-full cursor-pointer rounded border" type="color" value={settings.accentColor} onChange={(event) => setSettings((current) => ({ ...current, accentColor: event.target.value }))} />
            </Field>
          </div>
          <Field label="Tema da página inteira">
            <select
              className="field"
              value={settings.theme}
              onChange={(event) =>
                settings.autoPalette
                  ? applyDesignerPalette(
                      settings.primaryColor,
                      event.target.value as SystemSettings["theme"],
                    )
                  : setSettings((current) => ({
                      ...current,
                      theme: event.target.value as SystemSettings["theme"],
                    }))
              }
            >
              <option value="light">Claro</option>
              <option value="soft">Suave</option>
              <option value="dark">Escuro</option>
            </select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Estilo do fundo">
              <select
                className="field"
                value={settings.backgroundStyle}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    backgroundStyle: event.target.value as SystemSettings["backgroundStyle"],
                  }))
                }
              >
                <option value="clean">Limpo</option>
                <option value="soft">Luzes suaves</option>
                <option value="gradient">Degradê da marca</option>
              </select>
            </Field>
            <Field label="Sombras dos blocos">
              <select
                className="field"
                value={settings.shadows}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    shadows: event.target.value as SystemSettings["shadows"],
                  }))
                }
              >
                <option value="none">Sem sombra</option>
                <option value="soft">Suave</option>
                <option value="strong">Destacada</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Fundo">
              <input
                className="h-10 w-full cursor-pointer rounded border"
                type="color"
                value={settings.backgroundColor}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, backgroundColor: event.target.value }))
                }
              />
            </Field>
            <Field label="Cards">
              <input
                className="h-10 w-full cursor-pointer rounded border"
                type="color"
                value={settings.surfaceColor}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, surfaceColor: event.target.value }))
                }
              />
            </Field>
            <Field label="Texto">
              <input
                className="h-10 w-full cursor-pointer rounded border"
                type="color"
                value={settings.textColor}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, textColor: event.target.value }))
                }
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={`Transparência dos cards: ${settings.surfaceOpacity}%`}>
              <input
                className="w-full accent-[var(--pine)]"
                type="range"
                min={35}
                max={100}
                value={settings.surfaceOpacity}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    surfaceOpacity: Number(event.target.value),
                  }))
                }
              />
            </Field>
            <Field label={`Fundo dos gráficos: ${settings.chartSurfaceOpacity}%`}>
              <input
                className="w-full accent-[var(--pine)]"
                type="range"
                min={35}
                max={100}
                value={settings.chartSurfaceOpacity}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    chartSurfaceOpacity: Number(event.target.value),
                  }))
                }
              />
            </Field>
            <Field label={`Arredondamento: ${settings.borderRadius}px`}>
              <input
                className="w-full accent-[var(--pine)]"
                type="range"
                min={0}
                max={28}
                value={settings.borderRadius}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    borderRadius: Number(event.target.value),
                  }))
                }
              />
            </Field>
            <Field label={`Tamanho geral: ${Math.round(settings.uiScale * 100)}%`}>
              <input
                className="w-full accent-[var(--pine)]"
                type="range"
                min={85}
                max={115}
                value={Math.round(settings.uiScale * 100)}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    uiScale: Number(event.target.value) / 100,
                  }))
                }
              />
            </Field>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/45 p-3">
            <span>
              <span className="block text-sm font-bold text-pine-dark">Efeito de vidro</span>
              <span className="block text-[11px] text-muted-foreground">
                Aplica desfoque atrás de cards transparentes.
              </span>
            </span>
            <input
              type="checkbox"
              checked={settings.glassEffect}
              onChange={(event) =>
                setSettings((current) => ({ ...current, glassEffect: event.target.checked }))
              }
            />
          </label>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            A cor principal e a de destaque passam a valer em menus, botões, cabeçalhos,
            seleções, cards, tabelas e gráficos de todas as páginas.
          </p>
          <label className="flex items-start justify-between gap-3 rounded-lg border border-brass/35 bg-brass/10 p-3">
            <span>
              <span className="block text-sm font-bold text-pine-dark">Designer automático</span>
              <span className="block text-[11px] leading-relaxed text-muted-foreground">
                Ao escolher a cor principal, o sistema calcula destaque, fundos, contraste e seis
                cores harmônicas para os gráficos.
              </span>
            </span>
            <input
              type="checkbox"
              checked={settings.autoPalette}
              onChange={(event) => {
                if (event.target.checked) applyDesignerPalette(settings.primaryColor);
                else setSettings((current) => ({ ...current, autoPalette: false }));
              }}
            />
          </label>
          <div className="rounded-lg border border-primary/25 bg-primary/5 p-3">
            <div className="flex items-start justify-between gap-3">
              <span>
                <span className="flex items-center gap-1.5 text-sm font-bold text-pine-dark">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Designer Gemini automático
                </span>
                <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">
                  Analisa contraste, densidade, tamanhos, legendas e tipos de gráfico. A proposta
                  aparece antes de ser aplicada e pode ser desfeita.
                </span>
              </span>
              <input
                type="checkbox"
                checked={settings.aiDesignerEnabled}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    aiDesignerEnabled: event.target.checked,
                  }))
                }
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary flex items-center gap-1.5 text-xs"
                disabled={designerBusy || !settings.aiDesignerEnabled}
                onClick={analyzeDesign}
              >
                <Sparkles className="h-3.5 w-3.5" />
                {designerBusy ? "Analisando…" : "Analisar visual agora"}
              </button>
              {previousSettings && (
                <button
                  type="button"
                  className="btn-ghost flex items-center gap-1.5 text-xs"
                  onClick={undoAiDesign}
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Desfazer IA
                </button>
              )}
            </div>
          </div>
          {designerSuggestion && (
            <div className="rounded-lg border border-sage/40 bg-sage-bg/55 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-pine-dark">Prévia sugerida pelo Gemini</p>
                  <p className="max-w-2xl text-[11px] text-muted-foreground">
                    {designerSuggestion.profile.explanation}
                  </p>
                </div>
                <div className="flex gap-1">
                  {(designerSuggestion.system.chartPalette ?? settings.chartPalette).map(
                    (color, index) => (
                      <span
                        key={`${color}-${index}`}
                        className="h-6 w-6 rounded-full border border-white shadow"
                        style={{ backgroundColor: color }}
                        title={`Cor ${index + 1}: ${color}`}
                      />
                    ),
                  )}
                </div>
              </div>
              {designerSuggestion.profile.diagnostics.length > 0 && (
                <ul className="mt-2 grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
                  {designerSuggestion.profile.diagnostics.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex gap-2">
                <button type="button" className="btn-primary text-xs" onClick={applyAiSuggestion}>
                  Aplicar em todo o sistema
                </button>
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  onClick={() => setDesignerSuggestion(null)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="rounded-lg border border-border p-3">
            <div className="mb-3 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-brass" />
              <div>
                <h4 className="text-sm font-bold text-pine-dark">Paleta dos gráficos</h4>
                <p className="text-xs text-muted-foreground">
                  Defina as seis cores usadas nas séries e comparações.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {settings.chartPalette.map((color, index) => (
                <label key={`${index}-${color}`} className="text-center text-[10px] font-semibold text-muted-foreground">
                  Cor {index + 1}
                  <input
                    className="mt-1 h-10 w-full cursor-pointer rounded border"
                    type="color"
                    value={color}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        chartPalette: current.chartPalette.map((item, itemIndex) =>
                          itemIndex === index ? event.target.value : item,
                        ),
                      }))
                    }
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border p-3">
            <h4 className="text-sm font-bold text-pine-dark">Campos obrigatórios do hóspede</h4>
            <p className="mb-3 text-xs text-muted-foreground">Desative o que não precisa ser exigido em uma nova reserva.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {GUEST_FIELD_KEYS.map((field) => (
                <label key={field} className="flex items-center justify-between gap-3 rounded-md bg-muted px-3 py-2 text-sm">
                  <span>{GUEST_FIELD_LABELS[field]}</span>
                  <input
                    type="checkbox"
                    checked={settings.requiredGuestFields[field]}
                    onChange={(event) => updateRequired(field, event.target.checked)}
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        className="btn-primary mt-4 flex items-center gap-2"
        onClick={() => {
          saveSystemSettings(companyId, settings);
          toast.success("Configurações aplicadas");
        }}
      >
        <Save className="h-4 w-4" /> Aplicar configurações
      </button>
    </section>
  );
}

function CompanyForm({ company, onSave }: { company: Company; onSave: (patch: Partial<Company>) => void }) {
  const [form, setForm] = useState(company);
  useEffect(() => setForm(company), [company]);
  const set = (key: keyof Company, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <form
      className="card-surface grid gap-3 p-4 md:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          nome: form.nome,
          documento: form.documento,
          telefone: form.telefone,
          whatsapp: form.whatsapp,
          email: form.email,
          endereco: form.endereco,
          cidade: form.cidade,
          estado: form.estado,
          observacoes: form.observacoes,
        });
      }}
    >
      <Field label="Nome da empresa">
        <input className="field" value={form.nome} onChange={(e) => set("nome", e.target.value)} required />
      </Field>
      <Field label="Documento">
        <input className="field" value={form.documento ?? ""} onChange={(e) => set("documento", e.target.value)} />
      </Field>
      <Field label="Telefone">
        <input className="field" value={form.telefone ?? ""} onChange={(e) => set("telefone", e.target.value)} />
      </Field>
      <Field label="WhatsApp">
        <input className="field" value={form.whatsapp ?? ""} onChange={(e) => set("whatsapp", e.target.value)} />
      </Field>
      <Field label="E-mail">
        <input className="field" type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
      </Field>
      <Field label="Cidade / UF">
        <div className="grid grid-cols-[1fr_90px] gap-2">
          <input className="field" value={form.cidade ?? ""} onChange={(e) => set("cidade", e.target.value)} />
          <input className="field" value={form.estado ?? ""} onChange={(e) => set("estado", e.target.value)} maxLength={2} />
        </div>
      </Field>
      <Field label="Endereco">
        <input className="field" value={form.endereco ?? ""} onChange={(e) => set("endereco", e.target.value)} />
      </Field>
      <Field label="Observacoes">
        <input className="field" value={form.observacoes ?? ""} onChange={(e) => set("observacoes", e.target.value)} />
      </Field>
      <div className="md:col-span-2">
        <button className="btn-primary" type="submit">
          Salvar empresa
        </button>
      </div>
    </form>
  );
}

function RoomForm({
  editing,
  onClose,
  onSave,
}: {
  editing: Room | null;
  onClose: () => void;
  onSave: (row: Record<string, unknown>) => void;
}) {
  const [numero, setNumero] = useState(editing?.numero ?? 0);
  const [andar, setAndar] = useState(editing?.andar ?? 1);
  const [configuracao, setConfiguracao] = useState(editing?.configuracao ?? "Casal");
  const [preco, setPreco] = useState(editing?.preco ?? 0);
  const [banheiro, setBanheiro] = useState(editing?.banheiro ?? true);
  const [observacao, setObservacao] = useState(editing?.situacao ?? "");

  return (
    <Modal open onClose={onClose} title={editing ? "Editar quarto" : "Novo quarto"}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ numero, andar, configuracao, preco, banheiro, situacao: observacao || null });
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Numero">
            <input className="field" type="number" value={numero} disabled={!!editing} onChange={(e) => setNumero(Number(e.target.value))} />
          </Field>
          <Field label="Andar">
            <input className="field" type="number" value={andar} onChange={(e) => setAndar(Number(e.target.value))} />
          </Field>
        </div>
        <Field label="Configuracao / capacidade">
          <input className="field" value={configuracao} onChange={(e) => setConfiguracao(e.target.value)} placeholder="Ex.: casal, duplo, ate 5 pessoas" />
        </Field>
        <Field label="Valor da diaria">
          <input className="field" type="number" step="0.01" value={preco} onChange={(e) => setPreco(Number(e.target.value))} />
        </Field>
        <Field label="Observacoes do quarto">
          <input className="field" value={observacao} onChange={(e) => setObservacao(e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={banheiro} onChange={(e) => setBanheiro(e.target.checked)} />
          Possui banheiro
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancelar
          </button>
          <button type="submit" className="btn-primary">
            Salvar
          </button>
        </div>
      </form>
    </Modal>
  );
}
