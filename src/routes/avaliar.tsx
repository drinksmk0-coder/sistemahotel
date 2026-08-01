import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { WIFI_DEVICES } from "@/lib/constants";

export const Route = createFileRoute("/avaliar")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    quarto: s.quarto != null ? Number(s.quarto) : undefined,
    empresa: s.empresa != null ? String(s.empresa) : undefined,
  }),
  component: Avaliar,
});

const CRITERIA = [
  { key: "nota_geral", label: "Nota geral da estadia" },
  { key: "nota_limpeza", label: "Limpeza do quarto" },
  { key: "nota_cama", label: "Cama e conforto para dormir" },
  { key: "nota_banheiro", label: "Banheiro" },
  { key: "nota_chuveiro", label: "Chuveiro e água quente" },
  { key: "nota_silencio", label: "Silêncio e nível de barulho" },
  { key: "nota_ventilacao", label: "Ventilação e temperatura" },
  { key: "nota_espaco", label: "Espaço do quarto" },
  { key: "nota_tv", label: "TV e entretenimento" },
  { key: "nota_frigobar", label: "Frigobar" },
  { key: "nota_wifi", label: "Wi‑Fi" },
  { key: "nota_iluminacao", label: "Iluminação" },
  { key: "nota_custo_beneficio", label: "Custo-benefício" },
  { key: "nota_atendimento", label: "Atendimento da equipe" },
] as const;

const PREFERENCIAS = [
  "Silêncio",
  "Banheiro maior",
  "Mais espaço",
  "Smart TV",
  "Frigobar",
  "Ventilação",
  "Cama confortável",
  "Preço",
] as const;

const PROBLEMAS = [
  "Nenhum",
  "Barulho",
  "Banheiro pequeno",
  "Quarto pequeno",
  "TV pequena ou antiga",
  "Sem frigobar",
  "Calor ou pouca ventilação",
  "Wi‑Fi",
  "Limpeza",
  "Cama",
  "Chuveiro",
  "Outro",
] as const;

function Avaliar() {
  const { quarto, empresa } = useSearch({ from: "/avaliar" });
  const [nome, setNome] = useState("");
  const [quartoInput, setQuartoInput] = useState(quarto ? String(quarto) : "");
  const [notas, setNotas] = useState<Record<string, number>>({});
  const [recomendaria, setRecomendaria] = useState<boolean | null>(null);
  const [voltariaQuarto, setVoltariaQuarto] = useState<boolean | null>(null);
  const [preferenciaPrincipal, setPreferenciaPrincipal] = useState("");
  const [problemaPrincipal, setProblemaPrincipal] = useState("Nenhum");
  const [wifiProblema, setWifiProblema] = useState(false);
  const [wifiDispositivo, setWifiDispositivo] = useState("");
  const [comentario, setComentario] = useState("");
  const [sugestao, setSugestao] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!notas.nota_geral) return toast.error("Dê ao menos a nota geral");
    if (!quartoInput.trim()) return toast.error("Informe o número do quarto");

    const q = Number(quartoInput);
    if (!Number.isInteger(q) || q <= 0) return toast.error("Número do quarto inválido");

    setBusy(true);
    try {
      const { error } = await supabase.from("feedbacks").insert({
        company_id: empresa ?? null,
        hospede_nome: nome.trim() || null,
        quarto: q,
        nota_geral: notas.nota_geral ?? null,
        nota_limpeza: notas.nota_limpeza ?? null,
        nota_conforto: notas.nota_cama ?? null,
        nota_cama: notas.nota_cama ?? null,
        nota_banheiro: notas.nota_banheiro ?? null,
        nota_chuveiro: notas.nota_chuveiro ?? null,
        nota_silencio: notas.nota_silencio ?? null,
        nota_ventilacao: notas.nota_ventilacao ?? null,
        nota_espaco: notas.nota_espaco ?? null,
        nota_tv: notas.nota_tv ?? null,
        nota_frigobar: notas.nota_frigobar ?? null,
        nota_wifi: notas.nota_wifi ?? null,
        nota_iluminacao: notas.nota_iluminacao ?? null,
        nota_custo_beneficio: notas.nota_custo_beneficio ?? null,
        nota_atendimento: notas.nota_atendimento ?? null,
        recomendaria,
        voltaria_quarto: voltariaQuarto,
        preferencia_principal: preferenciaPrincipal || null,
        problema_principal: problemaPrincipal || null,
        wifi_problema: wifiProblema,
        wifi_dispositivo: wifiProblema && wifiDispositivo ? wifiDispositivo : null,
        comentario: comentario.trim() || null,
        sugestao: sugestao.trim() || null,
      } as never);
      if (error) throw error;

      if (wifiProblema) {
        await supabase.from("complaints").insert({
          company_id: empresa ?? null,
          quarto: q,
          categoria: "wifi",
          gravidade: "media",
          origem: "qrcode",
          hospede_nome: nome.trim() || null,
          dispositivo: wifiDispositivo || null,
          descricao: "Problema de Wi‑Fi relatado na avaliação do hóspede.",
          status: "aberto",
        } as never);
      }

      setSent(true);
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível enviar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-pine to-pine-dark px-4">
        <div className="card-surface max-w-md p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sage-bg text-3xl">✓</div>
          <h1 className="section-title text-2xl">Obrigado!</h1>
          <p className="mt-2 text-muted-foreground">Sua avaliação foi salva e ajudará o hotel a melhorar os quartos e recomendar opções mais adequadas aos próximos hóspedes.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pine to-pine-dark px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-5 text-center text-white">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-brass font-serif text-2xl font-bold text-pine-dark">PR</div>
          <h1 className="font-serif text-2xl font-bold">Qualidade da hospedagem</h1>
          <p className="text-sm text-[#CFE0D5]">Avalie o quarto onde ficou. Sua opinião ajuda o hotel a melhorar e recomendar quartos mais adequados.</p>
        </div>

        <form onSubmit={submit} className="card-surface space-y-5 p-5 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-muted-foreground">Seu nome (opcional)</span>
              <input className="field" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-muted-foreground">Número do quarto</span>
              <input className="field" value={quartoInput} onChange={(e) => setQuartoInput(e.target.value)} inputMode="numeric" required />
            </label>
          </div>

          <section>
            <h2 className="mb-3 text-base font-extrabold text-foreground">Dê uma nota de 1 a 5</h2>
            <div className="divide-y divide-border rounded-xl border border-border">
              {CRITERIA.map((c) => (
                <div key={c.key} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-sm font-medium">{c.label}</span>
                  <StarInput value={notas[c.key] ?? 0} onChange={(v) => setNotas((p) => ({ ...p, [c.key]: v }))} />
                </div>
              ))}
            </div>
          </section>

          <div className="grid gap-3 sm:grid-cols-2">
            <Choice label="Você voltaria a ficar neste quarto?" value={voltariaQuarto} onChange={setVoltariaQuarto} />
            <Choice label="Você recomendaria o hotel?" value={recomendaria} onChange={setRecomendaria} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-muted-foreground">O que mais importa para você em um quarto?</span>
              <select className="field" value={preferenciaPrincipal} onChange={(e) => setPreferenciaPrincipal(e.target.value)}>
                <option value="">Selecione</option>
                {PREFERENCIAS.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-muted-foreground">Principal problema encontrado</span>
              <select className="field" value={problemaPrincipal} onChange={(e) => setProblemaPrincipal(e.target.value)}>
                {PROBLEMAS.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
          </div>

          <div className="rounded-lg bg-muted p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={wifiProblema} onChange={(e) => setWifiProblema(e.target.checked)} />
              Tive problema com o Wi‑Fi
            </label>
            {wifiProblema && (
              <label className="mt-2 block">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">Qual aparelho você usou?</span>
                <select className="field" value={wifiDispositivo} onChange={(e) => setWifiDispositivo(e.target.value)}>
                  <option value="">Selecione</option>
                  {WIFI_DEVICES.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </label>
            )}
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">O que você mais gostou?</span>
            <textarea className="field min-h-20" value={comentario} onChange={(e) => setComentario(e.target.value)} maxLength={500} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">O que devemos melhorar neste quarto?</span>
            <textarea className="field min-h-20" value={sugestao} onChange={(e) => setSugestao(e.target.value)} maxLength={500} />
          </label>

          <button type="submit" disabled={busy} className="btn-primary w-full py-3 text-base disabled:opacity-60">
            {busy ? "Enviando…" : "Enviar avaliação"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Choice({ label, value, onChange }: { label: string; value: boolean | null; onChange: (value: boolean) => void }) {
  return (
    <div>
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <div className="flex gap-2">
        <button type="button" onClick={() => onChange(true)} className={`flex-1 rounded-lg border py-2 text-sm font-semibold ${value === true ? "border-sage bg-sage-bg text-pine-dark" : "border-border"}`}>Sim</button>
        <button type="button" onClick={() => onChange(false)} className={`flex-1 rounded-lg border py-2 text-sm font-semibold ${value === false ? "border-brick bg-brick-bg text-brick" : "border-border"}`}>Não</button>
      </div>
    </div>
  );
}

function StarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-0.5" role="radiogroup" aria-label="Nota de 1 a 5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} className={`text-2xl leading-none transition ${n <= value ? "text-brass" : "text-border"}`} aria-label={`${n} estrelas`} aria-pressed={n === value}>★</button>
      ))}
    </div>
  );
}
