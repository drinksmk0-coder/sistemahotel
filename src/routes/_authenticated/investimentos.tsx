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
    setLoading(true);
    setAnswer("");

    const hotelAiQuestion = [
      "ANÁLISE DE INVESTIMENTO DO PROPRIETÁRIO.",
      "A pergunta abaixo é uma decisão de investimento. NÃO responda apenas com relatório de ocupação, padrão temporal ou resumo de dados.",
      "Responda em linguagem simples, como se estivesse explicando diretamente ao dono do hotel. Comece pela conclusão e depois explique os números. Evite termos técnicos sem explicar.",
      "REGRA DO HOTEL: todos os quartos cadastrados com diária de R$ 80 devem ser considerados quartos sem banheiro privativo.",
      "REGRA DE EVIDÊNCIA: para os quartos de R$ 80, considere como hospedagem comprovada apenas as reservas realmente registradas no sistema no período de Carnaval. Fora desse período, não invente ocupação nem suponha que houve hospedagem sem evidência do banco.",
      "Busque no sistema quantos quartos de R$ 80 existem e use essa quantidade real; nunca invente uma quantidade fixa de quartos.",
      "Use os dados reais disponíveis do hotel como insumos do cálculo: reservas, ocupação, quartos, receitas, despesas, padrões de demanda ao longo do tempo e canais.",
      "Sua obrigação é transformar esses dados em uma DECISÃO FINANCEIRA E OPERACIONAL sobre o projeto informado.",
      "Calcule, quando possível: investimento inicial, custo mensal adicional, quartos/dias fora de operação, receita perdida durante obra, impacto permanente de reduzir quantidade de quartos, diária atual versus diária necessária após a melhoria, receita incremental, margem, prazo para recuperar o investimento, retorno anual e ponto de equilíbrio.",
      "Use os meses de menor demanda para sugerir a melhor janela de obra e estime como isso reduz a perda de receita.",
      "Monte cenários pessimista, base e otimista. Separe claramente: DADO DO HOTEL, PREMISSA e DADO EXTERNO quando houver.",
      "Se faltar custo de obra/equipamento ou outro valor externo, NÃO encerre a resposta. Faça o cálculo com uma faixa de premissas claramente identificada e diga quais cotações precisam ser obtidas para fechar a decisão.",
      "A resposta deve conter obrigatoriamente: 1) resposta curta 'vale ou não vale'; 2) quantos quartos de R$80 foram encontrados; 3) o que esses quartos realmente venderam no Carnaval; 4) impacto da obra; 5) cálculo financeiro em linguagem simples; 6) três cenários; 7) melhor época para executar; 8) riscos; 9) dados faltantes; 10) VEREDITO.",
      "Nunca marque como DADO DO HOTEL algo que seja estimativa. Se usar R$ 80, deixe claro que vem da regra do hotel/cadastro dos quartos. Se usar custo de obra ou futura diária, marque como PREMISSA ou DADO EXTERNO.",
      "Termine com VEREDITO: Viável, Viável com condições ou Não recomendado agora; inclua chance de retorno como faixa justificada e próximo teste de baixo custo.",
      "Nunca encerre a resposta apenas descrevendo os dados do hotel.",
      "Projeto a avaliar:",
      question,
    ].join("\n");

    const result = await supabase.functions.invoke("hotel-assistant-v2", {
      body: {
        company_id: company.data.id,
        mode: "analysis",
        question: hotelAiQuestion,
        conversation: [],
      },
    });

    if (!result.error && result.data?.answer) {
      const response = String(result.data.answer);
      const historicalOnly = response.includes("# Leitura histórica") && !/VEREDITO|payback|ROI|investimento inicial|vi[aá]vel/i.test(response);
      if (!historicalOnly) {
        setAnswer(response);
        setLoading(false);
        return;
      }

      const retry = await supabase.functions.invoke("hotel-assistant-v2", {
        body: {
          company_id: company.data.id,
          mode: "analysis",
          question: [
            "CORREÇÃO DE RESPOSTA: a resposta anterior ficou apenas descritiva.",
            "Ignore qualquer formato de 'Leitura histórica' como resposta final.",
            "REGRA DO HOTEL: quartos de R$80 = quartos sem banheiro privativo. Use a quantidade real cadastrada no sistema.",
            "REGRA DE EVIDÊNCIA: para esses quartos de R$80, só trate como hospedagem comprovada o que estiver realmente registrado no Carnaval; fora disso, não presuma ocupação.",
            "Explique em linguagem simples e entregue a análise de VIABILIDADE do investimento, com investimento inicial, perda de receita, aumento de diária necessário, prazo de retorno, cenários e VEREDITO.",
            "Projeto:",
            question,
          ].join("\n"),
          conversation: [],
        },
      });
      setAnswer(!retry.error && retry.data?.answer ? String(retry.data.answer) : response);
      setLoading(false);
      return;
    }

    setAnswer(
      "A HotelAI não conseguiu concluir a análise agora. Atualize a página e tente novamente; se continuar, a conexão da HotelAI precisa ser verificada.",
    );
    setLoading(false);
  }

  return <div className="mx-auto max-w-5xl space-y-4 pb-10">
    <header className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2"><Sparkles className="text-primary"/><h1 className="text-xl font-extrabold text-pine-dark">HotelAI · Viabilidade de investimentos</h1></div>
      <p className="mt-1 text-sm text-muted-foreground">A própria HotelAI cruza os dados reais do hotel para avaliar retorno, risco, obra parada, payback e ROI.</p>
    </header>
    <div className="grid gap-2 sm:grid-cols-2">{examples.map((x) => <button key={x} onClick={() => setQuestion(x)} className="rounded-xl border border-border bg-card p-3 text-left text-xs hover:border-primary">{x}</button>)}</div>
    <section className="rounded-2xl border border-border bg-card p-4">
      <label className="text-xs font-bold uppercase text-muted-foreground">Projeto que o proprietário quer avaliar</label>
      <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={5} className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm" />
      <button onClick={analyze} disabled={loading} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2 font-bold text-primary-foreground disabled:opacity-50">
        {loading ? <Search className="h-4 w-4 animate-pulse"/> : <Calculator className="h-4 w-4"/>}{loading ? "HotelAI calculando viabilidade..." : "Perguntar à HotelAI"}
      </button>
    </section>
    {answer && <article className="whitespace-pre-wrap rounded-2xl border border-border bg-card p-4 text-sm leading-6">{answer}</article>}
  </div>;
}
