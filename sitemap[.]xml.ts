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
  { key: "nota_limpeza", label: "Limpeza do quarto" },
  { key: "nota_conforto", label: "Conforto e cama" },
  { key: "nota_atendimento", label: "Atendimento da equipe" },
  { key: "nota_wifi", label: "Wi-Fi / internet" },
  { key: "nota_chuveiro", label: "Chuveiro / água quente" },
  { key: "nota_geral", label: "Nota geral da estadia" },
] as const;

function Avaliar() {
  const { quarto, empresa } = useSearch({ from: "/avaliar" });
  const [nome, setNome] = useState("");
  const [quartoInput, setQuartoInput] = useState<string>(quarto ? String(quarto) : "");
  const [notas, setNotas] = useState<Record<string, number>>({});
  const [recomendaria, setRecomendaria] = useState<boolean | null>(null);
  const [wifiProblema, setWifiProblema] = useState(false);
  const [wifiDispositivo, setWifiDispositivo] = useState("");
  const [comentario, setComentario] = useState("");
  const [sugestao, setSugestao] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!notas.nota_geral) return toast.error("Dê ao menos a nota geral");
    setBusy(true);
    const q = quartoInput ? Number(quartoInput) : null;
    try {
      const { error } = await supabase.from("feedbacks").insert({
        company_id: empresa ?? null,
        hospede_nome: nome.trim() || null,
        quarto: q,
        nota_geral: notas.nota_geral ?? null,
        nota_limpeza: notas.nota_limpeza ?? null,
        nota_conforto: notas.nota_conforto ?? null,
        nota_atendimento: notas.nota_atendimento ?? null,
        nota_wifi: notas.nota_wifi ?? null,
        nota_chuveiro: notas.nota_chuveiro ?? null,
        recomendaria,
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
          dispositivo: wifiProblema && wifiDispositivo ? wifiDispositivo : null,
          descricao: "Problema de Wi-Fi relatado na avaliação do hóspede.",
          status: "aberto",
        } as never);
      }
      setSent(true);
    } catch {
      toast.error("Não foi possível enviar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-pine to-pine-dark px-4">
        <div className="card-surface max-w-md p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sage-bg text-3xl">
            ✓
          </div>
          <h1 className="section-title text-2xl">Obrigado!</h1>
          <p className="mt-2 text-muted-foreground">
            Sua avaliação foi enviada para a equipe da Pousada Real Cruzília. Ela nos ajuda a
            melhorar sua experiência.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pine to-pine-dark px-4 py-8">
      <div className="mx-auto max-w-lg">
        <div className="mb-5 text-center text-white">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-brass font-serif text-2xl font-bold text-pine-dark">
            PR
          </div>
          <h1 className="font-serif text-2xl font-bold">Como foi sua estadia?</h1>
          <p className="text-sm text-[#CFE0D5]">Pousada Real Cruzília · sua opinião é anônima e rápida</p>
        </div>

        <form onSubmit={submit} className="card-surface space-y-4 p-5">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-muted-foreground">Seu nome (opcional)</span>
              <input className="field" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-muted-foreground">Número do quarto</span>
              <input
                className="field"
                value={quartoInput}
                onChange={(e) => setQuartoInput(e.target.value)}
                inputMode="numeric"
              />
            </label>
          </div>

          <div className="space-y-3">
            {CRITERIA.map((c) => (
              <div key={c.key} className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{c.label}</span>
                <StarInput value={notas[c.key] ?? 0} onChange={(v) => setNotas((p) => ({ ...p, [c.key]: v }))} />
              </div>
            ))}
          </div>

          <div className="rounded-lg bg-muted p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={wifiProblema} onChange={(e) => setWifiProblema(e.target.checked)} />
              Tive problema com o Wi-Fi
            </label>
            {wifiProblema && (
              <label className="mt-2 block">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                  Qual aparelho você usou?
                </span>
                <select className="field" value={wifiDispositivo} onChange={(e) => setWifiDispositivo(e.target.value)}>
                  <option value="">Selecione</option>
                  {WIFI_DEVICES.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div>
            <span className="mb-1 block text-sm font-medium">Você recomendaria a pousada?</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRecomendaria(true)}
                className={`flex-1 rounded-lg border py-2 text-sm font-semibold ${recomendaria === true ? "border-sage bg-sage-bg text-pine-dark" : "border-border"}`}
              >
                👍 Sim
              </button>
              <button
                type="button"
                onClick={() => setRecomendaria(false)}
                className={`flex-1 rounded-lg border py-2 text-sm font-semibold ${recomendaria === false ? "border-brick bg-brick-bg text-brick" : "border-border"}`}
              >
                👎 Não
              </button>
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">Comentário</span>
            <textarea className="field min-h-20" value={comentario} onChange={(e) => setComentario(e.target.value)} maxLength={500} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">Sugestão de melhoria</span>
            <textarea className="field min-h-16" value={sugestao} onChange={(e) => setSugestao(e.target.value)} maxLength={500} />
          </label>

          <button type="submit" disabled={busy} className="btn-primary w-full py-3 text-base disabled:opacity-60">
            {busy ? "Enviando…" : "Enviar avaliação"}
          </button>
        </form>
      </div>
    </div>
  );
}

function StarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`text-2xl leading-none transition ${n <= value ? "text-brass" : "text-border"}`}
          aria-label={`${n} estrelas`}
        >
          ★
        </button>
      ))}
    </div>
  );
}
