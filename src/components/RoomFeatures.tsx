import { useEffect, useState } from "react";
import type { Room } from "@/lib/data";

export type RoomFeaturePatch = {
  frigobar: boolean;
  tv_smart: boolean;
  ventilador: boolean;
  vista: "rua" | "lateral" | "fundos" | "interna" | "nao_informada";
  nivel_ruido: "silencioso" | "moderado" | "barulhento" | "nao_informado";
  ventilacao: "arejada" | "normal" | "abafada" | "nao_informada";
  tamanho_banheiro: "pequeno" | "normal" | "amplo" | "nao_informado";
  tamanho_quarto: "compacto" | "normal" | "espacoso" | "nao_informado";
  tipo_janela: "madeira" | "vidro" | "mista" | "nao_informado";
  tamanho_janela: "pequena" | "media" | "grande" | "nao_informado";
  acesso_escadas: "sem_escadas" | "subir" | "descer" | "nao_informado";
  proximo_garagem: boolean | null;
  parede_frente_janela: boolean | null;
  prioridade_venda: 1 | 2 | 3;
  observacoes_quarto: string | null;
};

export type RoomWithFeatures = Room & Partial<RoomFeaturePatch>;

export const ROOM_FEATURE_FILTERS = [
  ["todos", "Todos os quartos"],
  ["pacote_conforto", "Pacote: conforto completo"],
  ["pacote_silencio", "Pacote: silêncio e descanso"],
  ["pacote_equipado", "Pacote: bem equipado"],
  ["pacote_familia", "Pacote: família / mais espaço"],
  ["pacote_acesso", "Pacote: fácil acesso"],
  ["silencioso", "Menos barulho"],
  ["arejada", "Mais arejado"],
  ["abafada", "Mais abafado"],
  ["espacoso", "Quarto espaçoso"],
  ["sem_escadas", "Sem escadas"],
  ["descer_escadas", "Descendo escadas"],
  ["longe_garagem", "Longe da garagem"],
  ["proximo_garagem", "Próximo da garagem"],
  ["janela_grande", "Janela grande"],
  ["janela_vidro", "Janela de vidro"],
  ["janela_madeira", "Janela de madeira"],
  ["vista_livre", "Janela sem parede próxima"],
  ["parede_janela", "Parede próxima da janela"],
  ["frigobar", "Com frigobar"],
  ["tv_smart", "Com Smart TV"],
  ["rua", "Frente para a rua"],
  ["fundos", "Fundos do hotel"],
  ["banheiro_amplo", "Banheiro amplo"],
  ["ultima_opcao", "Vender por último"],
] as const;

const DEFAULTS: RoomFeaturePatch = {
  frigobar: false,
  tv_smart: false,
  ventilador: true,
  vista: "nao_informada",
  nivel_ruido: "nao_informado",
  ventilacao: "nao_informada",
  tamanho_banheiro: "nao_informado",
  tamanho_quarto: "nao_informado",
  tipo_janela: "nao_informado",
  tamanho_janela: "nao_informado",
  acesso_escadas: "nao_informado",
  proximo_garagem: null,
  parede_frente_janela: null,
  prioridade_venda: 2,
  observacoes_quarto: null,
};

export function normalizeRoomFeatures(room: RoomWithFeatures): RoomFeaturePatch {
  return {
    frigobar: Boolean(room.frigobar),
    tv_smart: Boolean(room.tv_smart),
    ventilador: room.ventilador !== false,
    vista: room.vista ?? DEFAULTS.vista,
    nivel_ruido: room.nivel_ruido ?? DEFAULTS.nivel_ruido,
    ventilacao: room.ventilacao ?? DEFAULTS.ventilacao,
    tamanho_banheiro: room.tamanho_banheiro ?? DEFAULTS.tamanho_banheiro,
    tamanho_quarto: room.tamanho_quarto ?? DEFAULTS.tamanho_quarto,
    tipo_janela: room.tipo_janela ?? DEFAULTS.tipo_janela,
    tamanho_janela: room.tamanho_janela ?? DEFAULTS.tamanho_janela,
    acesso_escadas: room.acesso_escadas ?? DEFAULTS.acesso_escadas,
    proximo_garagem: room.proximo_garagem ?? null,
    parede_frente_janela: room.parede_frente_janela ?? null,
    prioridade_venda: room.prioridade_venda === 1 || room.prioridade_venda === 3 ? room.prioridade_venda : 2,
    observacoes_quarto: room.observacoes_quarto?.trim() || null,
  };
}

export function roomMatchesFeature(room: RoomWithFeatures, filter: string) {
  const f = normalizeRoomFeatures(room);
  switch (filter) {
    case "pacote_conforto": return f.ventilacao === "arejada" && f.tamanho_quarto === "espacoso" && f.tamanho_banheiro === "amplo" && f.frigobar && f.tv_smart;
    case "pacote_silencio": return f.nivel_ruido === "silencioso" && f.ventilacao !== "abafada";
    case "pacote_equipado": return f.frigobar && f.tv_smart;
    case "pacote_familia": return f.tamanho_quarto === "espacoso" && f.tamanho_banheiro !== "pequeno";
    case "pacote_acesso": return f.acesso_escadas === "sem_escadas";
    case "frigobar": return f.frigobar;
    case "tv_smart": return f.tv_smart;
    case "silencioso": return f.nivel_ruido === "silencioso";
    case "rua": return f.vista === "rua";
    case "fundos": return f.vista === "fundos";
    case "arejada": return f.ventilacao === "arejada";
    case "abafada": return f.ventilacao === "abafada";
    case "espacoso": return f.tamanho_quarto === "espacoso";
    case "sem_escadas": return f.acesso_escadas === "sem_escadas";
    case "descer_escadas": return f.acesso_escadas === "descer";
    case "proximo_garagem": return f.proximo_garagem === true;
    case "longe_garagem": return f.proximo_garagem === false;
    case "janela_grande": return f.tamanho_janela === "grande";
    case "janela_vidro": return f.tipo_janela === "vidro" || f.tipo_janela === "mista";
    case "janela_madeira": return f.tipo_janela === "madeira" || f.tipo_janela === "mista";
    case "vista_livre": return f.parede_frente_janela === false;
    case "parede_janela": return f.parede_frente_janela === true;
    case "banheiro_amplo": return f.tamanho_banheiro === "amplo";
    case "ultima_opcao": return f.prioridade_venda === 3;
    default: return true;
  }
}

type FeatureTag = { key: string; label: string; className: string };
const tones: Record<string, string> = {
  emerald: "bg-emerald-50 text-emerald-800 border-emerald-200",
  teal: "bg-teal-50 text-teal-800 border-teal-200",
  rose: "bg-rose-50 text-rose-800 border-rose-200",
  orange: "bg-orange-50 text-orange-800 border-orange-200",
  amber: "bg-amber-50 text-amber-900 border-amber-200",
  sky: "bg-sky-50 text-sky-800 border-sky-200",
  violet: "bg-violet-50 text-violet-800 border-violet-200",
  zinc: "bg-zinc-100 text-zinc-800 border-zinc-300",
};
const tag = (key: string, label: string, tone: string): FeatureTag => ({ key, label, className: tones[tone] ?? tones.zinc });

export function roomFeatureTags(room: RoomWithFeatures): FeatureTag[] {
  const f = normalizeRoomFeatures(room);
  const tags: FeatureTag[] = [];
  if (f.tamanho_quarto === "espacoso") tags.push(tag("space", "↔ Espaçoso", "emerald"));
  if (f.nivel_ruido === "silencioso") tags.push(tag("quiet", "🔇 Silencioso", "emerald"));
  if (f.nivel_ruido === "barulhento") tags.push(tag("noise", "🔊 Mais barulho", "rose"));
  if (f.ventilacao === "arejada") tags.push(tag("air", "🍃 Arejado", "teal"));
  if (f.ventilacao === "abafada") tags.push(tag("warm", "♨ Abafado", "orange"));
  if (f.acesso_escadas === "sem_escadas") tags.push(tag("access", "✓ Sem escadas", "emerald"));
  if (f.acesso_escadas === "subir") tags.push(tag("stairs-up", "↑ Subir escadas", "amber"));
  if (f.acesso_escadas === "descer") tags.push(tag("stairs-down", "↓ Descer escadas", "amber"));
  if (f.proximo_garagem === true) tags.push(tag("garage", "🚗 Próximo garagem", "amber"));
  if (f.proximo_garagem === false) tags.push(tag("far-garage", "🚗 Longe garagem", "emerald"));
  if (f.tamanho_janela === "grande") tags.push(tag("window-size", "▣ Janela grande", "sky"));
  if (f.tipo_janela === "madeira") tags.push(tag("window-wood", "Janela madeira", "amber"));
  if (f.tipo_janela === "vidro") tags.push(tag("window-glass", "Janela vidro", "sky"));
  if (f.parede_frente_janela === true) tags.push(tag("wall", "▦ Parede na janela", "zinc"));
  if (f.parede_frente_janela === false) tags.push(tag("open-view", "◫ Janela livre", "teal"));
  if (f.frigobar) tags.push(tag("frigobar", "❄ Frigobar", "sky"));
  if (f.tv_smart) tags.push(tag("tv", "📺 Smart TV", "violet"));
  if (f.ventilador) tags.push(tag("fan", "Ventilador", "zinc"));
  if (f.vista === "rua") tags.push(tag("rua", "↗ Rua", "amber"));
  if (f.vista === "fundos") tags.push(tag("fundos", "↙ Fundos", "zinc"));
  if (f.vista === "lateral") tags.push(tag("lateral", "↔ Lateral", "zinc"));
  if (f.tamanho_banheiro === "amplo") tags.push(tag("bath", "🛁 Banheiro amplo", "sky"));
  if (f.prioridade_venda === 1) tags.push(tag("priority", "★ Priorizar", "emerald"));
  if (f.prioridade_venda === 3) tags.push(tag("last", "⏳ Vender por último", "rose"));
  return tags;
}

export function RoomFeatureBadges({ room, compact = false, max }: { room: RoomWithFeatures; compact?: boolean; max?: number }) {
  const all = roomFeatureTags(room);
  const tags = typeof max === "number" ? all.slice(0, max) : all;
  if (!all.length) return compact ? null : <p className="text-xs text-muted-foreground">Características ainda não cadastradas.</p>;
  return (
    <div className="flex flex-wrap gap-1" aria-label={`Características do quarto ${room.numero}`}>
      {tags.map((item) => <span key={item.key} className={`inline-flex items-center rounded border font-semibold ${item.className} ${compact ? "px-1 py-0.5 text-[8px]" : "px-2 py-1 text-[10px]"}`}>{item.label}</span>)}
      {typeof max === "number" && all.length > max && <span className={`rounded border border-border bg-muted font-bold text-muted-foreground ${compact ? "px-1 py-0.5 text-[8px]" : "px-2 py-1 text-[10px]"}`}>+{all.length - max}</span>}
    </div>
  );
}

export function RoomFeaturesEditor({ room, saving = false, onSave }: { room: RoomWithFeatures; saving?: boolean; onSave: (patch: RoomFeaturePatch) => void }) {
  const [value, setValue] = useState<RoomFeaturePatch>(() => normalizeRoomFeatures(room));
  useEffect(() => setValue(normalizeRoomFeatures(room)), [room]);
  const set = <K extends keyof RoomFeaturePatch>(key: K, next: RoomFeaturePatch[K]) => setValue((current) => ({ ...current, [key]: next }));

  return (
    <details className="group rounded-xl border border-border bg-muted/15 shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 marker:hidden">
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-pine-dark">Características do quarto</h4>
          <div className="mt-1"><RoomFeatureBadges room={{ ...room, ...value }} compact max={5} /></div>
        </div>
        <span className="shrink-0 rounded-full border border-border bg-card px-3 py-1 text-[10px] font-bold text-primary group-open:bg-primary group-open:text-primary-foreground">Configurar</span>
      </summary>
      <div className="border-t border-border/70 p-3">
        <p className="mb-3 text-[11px] text-muted-foreground">Abra somente quando precisar alterar preferências ou características físicas da UH.</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Toggle label="Possui frigobar" checked={value.frigobar} onChange={(v) => set("frigobar", v)} />
          <Toggle label="Possui Smart TV" checked={value.tv_smart} onChange={(v) => set("tv_smart", v)} />
          <Toggle label="Possui ventilador" checked={value.ventilador} onChange={(v) => set("ventilador", v)} />
          <SelectField label="Posição" value={value.vista} onChange={(v) => set("vista", v as RoomFeaturePatch["vista"])} options={[["nao_informada", "Não informado"], ["rua", "Frente para a rua"], ["lateral", "Lateral"], ["fundos", "Fundos do hotel"], ["interna", "Área interna"]]} />
          <SelectField label="Nível de ruído" value={value.nivel_ruido} onChange={(v) => set("nivel_ruido", v as RoomFeaturePatch["nivel_ruido"])} options={[["nao_informado", "Não informado"], ["silencioso", "Mais silencioso"], ["moderado", "Moderado"], ["barulhento", "Mais barulhento"]]} />
          <SelectField label="Ventilação percebida" value={value.ventilacao} onChange={(v) => set("ventilacao", v as RoomFeaturePatch["ventilacao"])} options={[["nao_informada", "Não avaliada"], ["arejada", "Mais arejado"], ["normal", "Normal"], ["abafada", "Mais abafado"]]} />
          <SelectField label="Tamanho do quarto" value={value.tamanho_quarto} onChange={(v) => set("tamanho_quarto", v as RoomFeaturePatch["tamanho_quarto"])} options={[["nao_informado", "Não informado"], ["compacto", "Compacto"], ["normal", "Normal"], ["espacoso", "Espaçoso"]]} />
          <SelectField label="Tipo de janela" value={value.tipo_janela} onChange={(v) => set("tipo_janela", v as RoomFeaturePatch["tipo_janela"])} options={[["nao_informado", "Não informado"], ["madeira", "Madeira"], ["vidro", "Vidro"], ["mista", "Mista"]]} />
          <SelectField label="Tamanho da janela" value={value.tamanho_janela} onChange={(v) => set("tamanho_janela", v as RoomFeaturePatch["tamanho_janela"])} options={[["nao_informado", "Não informado"], ["pequena", "Pequena"], ["media", "Média"], ["grande", "Grande"]]} />
          <SelectField label="Acesso ao quarto" value={value.acesso_escadas} onChange={(v) => set("acesso_escadas", v as RoomFeaturePatch["acesso_escadas"])} options={[["nao_informado", "Não informado"], ["sem_escadas", "Sem escadas"], ["subir", "Precisa subir escadas"], ["descer", "Precisa descer escadas"]]} />
          <SelectField label="Tamanho do banheiro" value={value.tamanho_banheiro} onChange={(v) => set("tamanho_banheiro", v as RoomFeaturePatch["tamanho_banheiro"])} options={[["nao_informado", "Não informado"], ["pequeno", "Pequeno"], ["normal", "Normal"], ["amplo", "Amplo"]]} />
          <SelectField label="Próximo da garagem" value={value.proximo_garagem == null ? "nao_informado" : value.proximo_garagem ? "sim" : "nao"} onChange={(v) => set("proximo_garagem", v === "nao_informado" ? null : v === "sim")} options={[["nao_informado", "Não informado"], ["sim", "Sim"], ["nao", "Não"]]} />
          <SelectField label="Parede diante da janela" value={value.parede_frente_janela == null ? "nao_informado" : value.parede_frente_janela ? "sim" : "nao"} onChange={(v) => set("parede_frente_janela", v === "nao_informado" ? null : v === "sim")} options={[["nao_informado", "Não informado"], ["sim", "Sim"], ["nao", "Não"]]} />
          <SelectField label="Prioridade de venda" value={String(value.prioridade_venda)} onChange={(v) => set("prioridade_venda", Number(v) as 1 | 2 | 3)} options={[["1", "Priorizar"], ["2", "Ordem normal"], ["3", "Vender por último"]]} />
        </div>
        <label className="mt-3 block text-[11px] font-semibold text-muted-foreground">
          <span className="mb-1 block">Observações internas</span>
          <textarea className="field min-h-20 resize-y" value={value.observacoes_quarto ?? ""} maxLength={1000} placeholder="Ex.: recebe barulho pela manhã; bom para família; janela menor..." onChange={(event) => set("observacoes_quarto", event.target.value || null)} />
        </label>
        <div className="mt-3 flex justify-end">
          <button type="button" className="btn-primary" disabled={saving} onClick={() => onSave({ ...value, observacoes_quarto: value.observacoes_quarto?.trim() || null })}>{saving ? "Salvando…" : "Salvar características"}</button>
        </div>
      </div>
    </details>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex min-h-11 cursor-pointer items-center justify-between rounded-lg border border-border bg-card px-3 text-xs font-semibold"><span>{label}</span><input type="checkbox" className="h-4 w-4 accent-primary" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>;
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: readonly (readonly [string, string])[] }) {
  return <label className="block text-[11px] font-semibold text-muted-foreground"><span className="mb-1 block">{label}</span><select className="field" value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>;
}
