import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Calculator, Search, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/investimentos")({ component: InvestmentAI });

const examples = [
  "Vale a pena colocar banheiro nos quartos que ainda não têm? Considere obra, quartos parados e aumento possível da diária.",
  "Compare juntar dois quartos de R$ 80 para criar uma suíte com hidromassagem versus manter os dois quartos.",
  "É viável vender pizzas no hotel ou abrir restaurante para almoço e jantar?",
  "Analise energia solar para o hotel e estime payback. Diga quais dados faltam se não houver conta de energia.",
];

function InvestmentAI() {
  const company = useCurrentCompany();
  const [question, setQuestion] = useState(examples[0]);
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);

  async function analyze() {
    if (!company.data?.id || !question.trim()) return;
    setLoading(true); setAnswer("");
    const { data, error } = await supabase.functions.invoke("hotel-investment-analyst", { body: { company_id: company.data.id, question } });
    setAnswer(error ? `Não foi possível analisar: ${error.message}` : String(data?.answer || "Sem resposta."));
    setLoading(false);
  }

  return <div className="mx-auto max-w-5xl space-y-4 pb-10">
    <header className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2"><Sparkles className="text-primary"/><h1 className="text-xl font-extrabold text-pine-dark">HotelAI · Viabilidade de investimentos</h1></div>
      <p className="mt-1 text-sm text-muted-foreground">Cruza reservas, receita, despesas e quartos do hotel com pesquisa atual na internet para estimar retorno, risco, obra parada, payback e ROI.</p>
    </header>
    <div className="grid gap-2 sm:grid-cols-2">{examples.map((x) => <button key={x} onClick={() => setQuestion(x)} className="rounded-xl border border-border bg-card p-3 text-left text-xs hover:border-primary">{x}</button>)}</div>
    <section className="rounded-2xl border border-border bg-card p-4">
      <label className="text-xs font-bold uppercase text-muted-foreground">Projeto que o proprietário quer avaliar</label>
      <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={5} className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm" />
      <button onClick={analyze} disabled={loading} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2 font-bold text-primary-foreground disabled:opacity-50">
        {loading ? <Search className="h-4 w-4 animate-pulse"/> : <Calculator className="h-4 w-4"/>}{loading ? "Pesquisando e calculando..." : "Analisar viabilidade"}
      </button>
    </section>
    {answer && <article className="whitespace-pre-wrap rounded-2xl border border-border bg-card p-4 text-sm leading-6">{answer}</article>}
  </div>;
}
