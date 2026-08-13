import fs from "node:fs";

const file = "src/routes/api/chat.ts";
let source = fs.readFileSync(file, "utf8");

const routeMarker = `        if (assistantMode === "analysis" && isReportRequest(question)) {`;
const helperMarker = `function isReportRequest(value: string) {`;

const routeBlock = `        // Investimentos têm um motor próprio. Intercepte antes de relatórios,\n        // contexto operacional e do assistente analítico geral para nunca cair\n        // no Random Forest de cancelamento.\n        if (assistantMode === "analysis" && isInvestmentRequest(question)) {\n          const investmentResponse = await fetch(\n            \`${"${supabaseUrl}"}/functions/v1/hotel-investment-analyst\`,\n            {\n              method: "POST",\n              headers: {\n                apikey: publishableKey,\n                authorization,\n                "Content-Type": "application/json",\n              },\n              body: JSON.stringify({\n                company_id: companyId,\n                question,\n              }),\n            },\n          );\n          const investmentPayload = (await investmentResponse\n            .json()\n            .catch(() => ({}))) as { answer?: string; error?: string };\n\n          if (!investmentResponse.ok || !investmentPayload.answer) {\n            return Response.json(\n              {\n                error:\n                  investmentPayload.error ||\n                  "Não foi possível analisar a viabilidade do investimento.",\n              },\n              { status: investmentResponse.status || 502 },\n            );\n          }\n\n          return streamAnswer(messages, investmentPayload.answer);\n        }\n\n`;

const helperBlock = `function isInvestmentRequest(value: string) {\n  const normalized = normalize(value);\n\n  const explicitIntent =\n    /\\b(vale a pena|vale|compensa|compensaria|viavel|viabilidade|viabil|investimento|investir|devo investir|seria bom|faz sentido|payback|roi|capex|opex|retorno do investimento|retorno financeiro|tempo de retorno)\\b/.test(\n      normalized,\n    );\n\n  const project =\n    /\\b(banheiro|banheiros|reforma|obra|hidromass|hidromassagem|suite|suites|pizza|pizzas|pizzaria|restaurante|almoco|jantar|energia solar|painel solar|paineis solares|fotovolta|cozinha|ampliar|ampliacao|construir|construcao)\\b/.test(\n      normalized,\n    );\n\n  const businessAction =\n    /\\b(vender|abrir|colocar|instalar|criar|juntar|transformar|reformar|oferecer|montar|implementar)\\b/.test(\n      normalized,\n    );\n\n  const economics =\n    /\\b(custo|custos|receita|faturamento|lucro|margem|diaria|ocupacao|quartos parados|retorno|investimento|preco|valor|ganho)\\b/.test(\n      normalized,\n    );\n\n  const cancellationOnly =\n    /\\b(risco de cancelamento|chance de cancelamento|probabilidade de cancelamento|vai cancelar)\\b/.test(\n      normalized,\n    );\n\n  // Projetos claramente econômicos devem ir para viabilidade mesmo quando o usuário\n  // pergunta de forma natural, por exemplo: "É viável vender pizzas no hotel?".\n  return !cancellationOnly && (\n    explicitIntent ||\n    (project && businessAction) ||\n    (project && economics)\n  );\n}\n\n`;

if (!source.includes("hotel-investment-analyst")) {
  if (!source.includes(routeMarker)) {
    throw new Error("Marcador do roteamento principal não encontrado em chat.ts");
  }
  source = source.replace(routeMarker, routeBlock + routeMarker);
}

if (!source.includes("function isInvestmentRequest(value: string)")) {
  if (!source.includes(helperMarker)) {
    throw new Error("Marcador de helpers não encontrado em chat.ts");
  }
  source = source.replace(helperMarker, helperBlock + helperMarker);
}

fs.writeFileSync(file, source);
console.log("Roteamento de HotelAI Investimentos aplicado ao chat principal.");
