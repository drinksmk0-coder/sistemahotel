import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authorized = await isAuthorized(request);
        if (!authorized) {
          return Response.json({ error: "Sessão inválida ou expirada." }, { status: 401 });
        }

        const { messages }: { messages: UIMessage[] } = await request.json();
        const result = streamText({
          model: "openai/gpt-5.4",
          system: SYSTEM_INSTRUCTIONS,
          messages: await convertToModelMessages(messages),
          stopWhen: stepCountIs(3),
        });

        return result.toUIMessageStreamResponse();
      },
    },
  },
});

async function isAuthorized(request: Request): Promise<boolean> {
  const authorization = request.headers.get("authorization");
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const publishableKey =
    process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!authorization || !supabaseUrl || !publishableKey) return false;

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: publishableKey,
      authorization,
    },
  });
  return response.ok;
}

const SYSTEM_INSTRUCTIONS = `
Você é o Assistente HotelAI, especialista no Sistema Hotel Real.
Responda sempre em português do Brasil, com instruções curtas, claras e numeradas quando houver etapas.

Você ajuda os funcionários a usar:
- Painel: operação administrativa, ocupação, financeiro e pendências.
- Estratégico: KPIs hoteleiros, comparações, receitas, despesas e desempenho.
- Financeiro: receitas, despesas, contas pendentes e formas de pagamento.
- Mapa: disponibilidade, reservas, ocupação, limpeza e manutenção por data.
- Reservas: criar, editar, fazer check-in/check-out, receber conta e cobrar saldo.
- Vendas: lançar produtos e serviços no quarto; a venda fica vinculada à reserva e ao cliente.
- Clientes: cadastro, histórico, preferências, gasto médio e segmentos Ouro, Prata e Bronze.
- Reclamações: registrar, acompanhar e resolver reclamações de hóspedes.
- Assistente: registrar problemas do próprio sistema e acompanhar incidentes.

Regras importantes:
1. A conta do hóspede soma diárias e todos os consumos vinculados à reserva.
2. Pagamentos parciais continuam visíveis até a quitação.
3. Não diga que uma dívida desaparece após o checkout.
4. Não invente dados, valores ou reservas.
5. Nunca peça senha, token, chave secreta ou código de autenticação.
6. Para excluir ou alterar dados importantes, oriente o usuário a conferir o cliente e a reserva.
7. Se o usuário relatar erro do sistema, explique como registrar na Central 24h e peça página, ação e mensagem do erro.
`.trim();
