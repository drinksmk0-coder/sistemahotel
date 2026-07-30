import { useEffect, useState } from "react";
import type { Room } from "@/lib/data";

export type RoomFeaturePatch = {
  frigobar: boolean;
  tv_smart: boolean;
  vista: "rua" | "lateral" | "fundos" | "interna" | "nao_informada";
  nivel_ruido: "silencioso" | "moderado" | "barulhento" | "nao_informado";
  ventilacao: "arejada" | "normal" | "abafada" | "nao_informada";
  tamanho_banheiro: "pequeno" | "normal" | "amplo" | "nao_informado";
  prioridade_venda: 1 | 2 | 3;
  observacoes_quarto: string | null;
};

export type RoomWithFeatures = Room & Partial<RoomFeaturePatch>;

export const ROOM_FEATURE_FILTERS = [
  ["todos", "Todas as características"],
  ["frigobar", "Com frigobar"],
  ["tv_smart", "Com Smart TV"],
  ["silencioso", "Mais silenciosos"],
  ["rua", "De frente para a rua"],
  ["fundos", "Nos fundos"],
  ["banheiro_pequeno", "Banheiro pequeno"],
  ["arejada", "Mais arejados"],
  ["abafada", "Mais abafados"],
  ["ultima_opcao", "Vender por último"],
] as const;

const DEFAULTS: RoomFeaturePatch = {
  frigobar: false,
  tv_smart: false,
  vista: "nao_informada",
  nivel_ruido: "nao_informado",
  ventilacao: "nao_informada",
  tamanho_banheiro: "nao_informado",
  prioridade_venda: 2,
  observacoes_quarto: null,
};

export function normalizeRoomFeatures(room: RoomWithFeatures): RoomFeaturePatch {
  return {
    frigobar: Boolean(room.frigobar),
    tv_smart: Boolean(room.tv_smart),
    vista: room.vista ?? "nao_informada",
    nivel_ruido: room.nivel_ruido ?? "nao_informado",
    ventilacao: room.ventilacao ?? "nao_informada",
    tamanho_banheiro: room.tamanho_banheiro ?? "nao_informado",
    prioridade_venda: room.prioridade_venda === 1 || room.prioridade_venda === 3 ? room.prioridade_venda : 2,
    observacoes_quarto: room.observacoes_quarto?.trim() || null,
  };
}

export function roomMatchesFeature(room: RoomWithFeatures, filter: string) {
  const features = normalizeRoomFeatures(room);
  switch (filter) {
    case "frigobar":
      return features.frigobar;
    case "tv_smart":
      return features.tv_smart;
    case "silencioso":
      return features.nivel_ruido === "silencioso";
    case "rua":
      return features.vista === "rua";
    case "fundos":
      return features.vista === "fundos";
    case "banheiro_pequeno":
      return features.tamanho_banheiro === "pequeno";
    case "arejada":
      return features.ventilacao === "arejada";
    case "abafada":
      return features.ventilacao === "abafada";
    case "ultima_opcao":
      return features.prioridade_venda === 3;
    default:
      return true;
  }
}

type FeatureTag = { key: string; label: string; className: string };

export function roomFeatureTags(room: RoomWithFeatures): FeatureTag[] {
  const feature = normalizeRoomFeatures(room);
  const tags: FeatureTag[] = [];
  if (feature.frigobar) tags.push({ key: "frigobar", label: "❄ Frigobar", className: "bg-sky-50 text-sky-800 border-sky-200" });
  if (feature.tv_smart) tags.push({ key: "tv", label: "📺 Smart TV", className: "bg-violet-50 text-violet-800 border-violet-200" });
  if (feature.vista === "rua") tags.push({ key: "rua", label: "↗ Rua", className: "bg-amber-50 text-amber-900 border-amber-200" });
  if (feature.vista === "fundos") tags.push({ key: "fundos", label: "↙ Fundos", className: "bg-zinc-100 text-zinc-800 border-zinc-300" });
  if (feature.vista === "lateral") tags.push({ key: "lateral", label: "↔ Lateral", className: "bg-zinc-50 text-zinc-700 border-zinc-200" });
  if (feature.vista === "interna") tags.push({ key: "interna", label: "▣ Interna", className: "bg-zinc-50 text-zinc-700 border-zinc-200" });
  if (feature.nivel_ruido === "silencioso") tags.push({ key: "quiet", label: "🔇 Silencioso", className: "bg-emerald-50 text-emerald-800 border-emerald-200" });
  if (feature.nivel_ruido === "barulhento") tags.push({ key: "noise", label: "🔊 Mais barulho", className: "bg-rose-50 text-rose-800 border-rose-200" });
  if (feature.ventilacao === "arejada") tags.push({ key: "air", label: "🍃 Arejado", className: "bg-teal-50 text-teal-800 border-teal-200" });
  if (feature.ventilacao === "abafada") tags.push({ key: "warm", label: "♨ Abafado", className: "bg-orange-50 text-orange-800 border-orange-200" });
  if (feature.tamanho_banheiro === "pequeno") tags.push({ key: "bath-small", label: "🚿 Banheiro pequeno", className: "bg-yellow-50 text-yellow-900 border-yellow-200" });
  if (feature.tamanho_banheiro === "amplo") tags.push({ key: "bath-large", label: "🛁 Banheiro amplo", className: "bg-cyan-50 text-cyan-800 border-cyan-200" });
  if (feature.prioridade_venda === 1) tags.push({ key: "priority", label: "★ Priorizar", className: "bg-sage-bg text-pine-dark border-sage/40" });
  if (feature.prioridade_venda === 3) tags.push({ key: "last", label: "⏳ Vender por último", className: "bg-brick-bg text-brick border-brick/35" });
  return tags;
}

export function RoomFeatureBadges({
  room,
  compact = false,
  max,
}: {
  room: RoomWithFeatures;
  compact?: boolean;
  max?: number;
}) {
  const all = roomFeatureTags(room);
  const tags = typeof max === "number" ? all.slice(0, max) : all;
  if (!all.length) {
    return compact ? null : <p className="text-xs text-muted-foreground">Características ainda não cadastradas.</p>;
  }
  return (
    <div className="flex flex-wrap gap-1" aria-label={`Características do quarto ${room.numero}`}>
      {tags.map((tag) => (
        <span
          key={tag.key}
          className={`inline-flex items-center rounded border font-semibold ${tag.className} ${compact ? "px-1 py-0.5 text-[8px]" : "px-2 py-1 text-[10px]"}`}
        >
          {tag.label}
        </span>
      ))}
      {typeof max === "number" && all.length > max && (
        <span className={`rounded border border-border bg-muted font-bold text-muted-foreground ${compact ? "px-1 py-0.5 text-[8px]" : "px-2 py-1 text-[10px]"}`}>
          +{all.length - max}
        </span>
      )}
    </div>
  );
}

export function RoomFeaturesEditor({
  room,
  saving = false,
  onSave,
}: {
  room: RoomWithFeatures;
  saving?: boolean;
  onSave: (patch: RoomFeaturePatch) => void;
}) {
  const [value, setValue] = useState<RoomFeaturePatch>(() => normalizeRoomFeatures(room));

  useEffect(() => setValue(normalizeRoomFeatures(room)), [room]);

  const set = <K extends keyof RoomFeaturePatch>(key: K, next: RoomFeaturePatch[K]) =>
    setValue((current) => ({ ...current, [key]: next }));

  return (
    <section className="rounded-xl border border-border bg-muted/20 p-3">
      <div className="mb-3">
        <h4 className="font-semibold text-pine-dark">Características do quarto</h4>
        <p className="text-[11px] text-muted-foreground">
          Uso interno da recepção e da IA. Cadastre somente informações confirmadas.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Toggle label="Possui frigobar" checked={value.frigobar} onChange={(checked) => set("frigobar", checked)} />
        <Toggle label="Possui Smart TV" checked={value.tv_smart} onChange={(checked) => set("tv_smart", checked)} />

        <Field label="Posição / vista">
          <select className="field" value={value.vista} onChange={(event) => set("vista", event.target.value as RoomFeaturePatch["vista"])}>
            <option value="nao_informada">Não informado</option>
            <option value="rua">Frente para a rua</option>
            <option value="lateral">Lateral</option>
            <option value="fundos">Fundos do hotel</option>
            <option value="interna">Área interna</option>
          </select>
        </Field>

        <Field label="Nível de ruído">
          <select className="field" value={value.nivel_ruido} onChange={(event) => set("nivel_ruido", event.target.value as RoomFeaturePatch["nivel_ruido"])}>
            <option value="nao_informado">Não informado</option>
            <option value="silencioso">Mais silencioso</option>
            <option value="moderado">Moderado</option>
            <option value="barulhento">Mais barulhento</option>
          </select>
        </Field>

        <Field label="Ventilação">
          <select className="field" value={value.ventilacao} onChange={(event) => set("ventilacao", event.target.value as RoomFeaturePatch["ventilacao"])}>
            <option value="nao_informada">Não informado</option>
            <option value="arejada">Mais arejado</option>
            <option value="normal">Normal</option>
            <option value="abafada">Mais abafado</option>
          </select>
        </Field>

        <Field label="Tamanho do banheiro">
          <select className="field" value={value.tamanho_banheiro} onChange={(event) => set("tamanho_banheiro", event.target.value as RoomFeaturePatch["tamanho_banheiro"])}>
            <option value="nao_informado">Não informado</option>
            <option value="pequeno">Pequeno / apertado</option>
            <option value="normal">Normal</option>
            <option value="amplo">Amplo</option>
          </select>
        </Field>

        <Field label="Prioridade de venda">
          <select className="field" value={value.prioridade_venda} onChange={(event) => set("prioridade_venda", Number(event.target.value) as 1 | 2 | 3)}>
            <option value={1}>Priorizar nas ofertas</option>
            <option value={2}>Ordem normal</option>
            <option value={3}>Vender por último</option>
          </select>
        </Field>
      </div>

      <Field label="Observações internas">
        <textarea
          className="field min-h-20 resize-y"
          value={value.observacoes_quarto ?? ""}
          maxLength={1000}
          placeholder="Ex.: recebe mais barulho pela manhã; bom para estadia curta; janela menor..."
          onChange={(event) => set("observacoes_quarto", event.target.value || null)}
        />
      </Field>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <RoomFeatureBadges room={{ ...room, ...value }} max={8} />
        <button type="button" className="btn-primary" disabled={saving} onClick={() => onSave({ ...value, observacoes_quarto: value.observacoes_quarto?.trim() || null })}>
          {saving ? "Salvando…" : "Salvar características"}
        </button>
      </div>
    </section>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between rounded-lg border border-border bg-card px-3 text-xs font-semibold">
      <span>{label}</span>
      <input type="checkbox" className="h-4 w-4 accent-primary" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-semibold text-muted-foreground">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}
