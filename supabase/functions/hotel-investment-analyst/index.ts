import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openai = Deno.env.get("OPENAI_API_KEY")!;
    const model = Deno.env.get("OPENAI_MODEL") || "gpt-5-mini";
    const auth = req.headers.get("Authorization") || "";
    if (!url || !service || !openai || !auth) return json({ error: "Configuração ou autenticação ausente." }, 401);
    const { company_id, question } = await req.json();
    if (!company_id || !question) return json({ error: "Informe empresa e projeto a analisar." }, 400);
    const db = createClient(url, service, { auth: { persistSession: false } });
    const { data: userData } = await db.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    if (!userData.user) return json({ error: "Sessão inválida." }, 401);
    const { data: member } = await db.from("company_members").select("role").eq("company_id", company_id).eq("user_id", userData.user.id).eq("ativo", true).maybeSingle();
    if (member?.role !== "dono") return json({ error: "Análise de investimento é exclusiva do proprietário." }, 403);

    const [company, rooms, reservations, sales, expenses] = await Promise.all([
      db.from("companies").select("nome,cidade,estado").eq("id", company_id).maybeSingle(),
      db.from("rooms").select("numero,tipo,valor_diaria,status").eq("company_id", company_id).limit(200),
      db.from("reservations").select("checkin,checkout,status,valor_total,valor_pago,canal,quarto,adultos,criancas").eq("company_id", company_id).order("checkin", { ascending: false }).limit(3000),
      db.from("sales").select("data,item,categoria,qtd,total,status").eq("company_id", company_id).order("data", { ascending: false }).limit(3000),
      db.from("expenses").select("data,categoria,descricao,valor,status").eq("company_id", company_id).order("data", { ascending: false }).limit(3000),
    ]);

    const safe = {
      hotel: company.data,
      quartos: rooms.data,
      reservas: reservations.data,
      vendas: sales.data,
      despesas: expenses.data,
    };

    const instructions = `Você é o HotelAI Investimentos, analista de viabilidade de um hotel brasileiro. Use primeiro os DADOS REAIS DO HOTEL e depois pesquisa web atual para custos e benchmarks externos. Pesquise na web quando a pergunta envolver preço de obra, banheiro, hidromassagem, equipamentos, restaurante, pizzaria, energia solar, mão de obra, energia, mercado ou benchmark. Nunca apresente estimativa como dado real.

Para cada projeto calcule, quando houver dados suficientes: CAPEX, OPEX mensal incremental, quartos/dias fora de operação durante obra, receita de hospedagem perdida na obra, receita incremental esperada, margem incremental, payback simples, ROI anual e ponto de equilíbrio. Gere cenários pessimista/base/otimista. Se houver redução de quartos (ex.: juntar dois quartos), inclua permanentemente a receita perdida dos quartos removidos e compare com a diária e ocupação necessárias da nova suíte. Para restaurante/pizza, estime ticket, CMV, mão de obra, capacidade e vendas mínimas. Para solar, use consumo/custo real se existir; se não existir, declare que falta a conta de energia e trabalhe com faixa pesquisada.

Sempre termine com: VEREDITO (Viável / Viável com condições / Não recomendado agora), chance de retorno em percentual como faixa justificada (não falsa precisão), investimento estimado, retorno mensal incremental, payback, principais riscos, dados que faltam e próximo teste de baixo custo. Compare projetos e ranqueie por retorno ajustado ao risco quando o usuário pedir vários.

Diferencie claramente: [DADO DO HOTEL], [PESQUISA WEB], [PREMISSA]. Não exponha nomes ou dados pessoais de hóspedes.`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${openai}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        instructions,
        input: `PROJETO/PERGUNTA:\n${String(question).slice(0, 5000)}\n\nDADOS DO HOTEL (sem dados pessoais):\n${JSON.stringify(safe).slice(0, 120000)}`,
        tools: [{ type: "web_search_preview" }],
        max_output_tokens: 6000,
      }),
    });
    const payload = await response.json();
    if (!response.ok) return json({ error: payload?.error?.message || "Falha na análise." }, 502);
    const text = payload.output_text || (payload.output || []).flatMap((x: any) => x.content || []).map((x: any) => x.text || "").join("\n");
    return json({ answer: text, provider: "openai", model, web_research: true, generated_at: new Date().toISOString() });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
