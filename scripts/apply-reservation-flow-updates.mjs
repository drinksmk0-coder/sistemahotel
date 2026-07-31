import fs from "node:fs";

const path = "src/routes/_authenticated/assistente.tsx";
let source = fs.readFileSync(path, "utf8");

function replaceOnce(before, after) {
  const occurrences = source.split(before).length - 1;
  if (occurrences !== 1) {
    throw new Error(`Trecho esperado uma vez, encontrado ${occurrences}: ${before.slice(0, 100)}`);
  }
  source = source.replace(before, after);
}

replaceOnce(
  'import { createFileRoute, Navigate } from "@tanstack/react-router";',
  'import { createFileRoute, Link, Navigate } from "@tanstack/react-router";',
);

replaceOnce(
  '  Bot,\n  CheckCircle2,\n  Copy,\n  MessageSquareWarning,\n  Save,\n  Send,\n  Sparkles,',
  '  Bot,\n  Brain,\n  CheckCircle2,\n  Copy,\n  Droplets,\n  MessageSquareWarning,\n  Printer,\n  Save,\n  Send,\n  Sparkles,',
);

replaceOnce(
  '    "Quais despesas e reclamações exigem ação primeiro?",\n',
  '    "Quais despesas e reclamações exigem ação primeiro?",\n    "Gere o relatório de consumo de água deste mês.",\n',
);

replaceOnce(
  'function AssistenteWorkspace() {\n  const currentCompany = useCurrentCompany();',
  'function AssistenteWorkspace() {\n  const { user } = useSession();\n  const { data: workspaceRole } = useRole(user);\n  const currentCompany = useCurrentCompany();',
);

replaceOnce(
  '      <PageHeader\n        title="Assistente 24h"\n        subtitle="Análises do hotel e recepção virtual."\n      />',
  '      <PageHeader\n        title="Assistente 24h"\n        subtitle="Análises do hotel, relatórios e recepção virtual."\n        action={\n          workspaceRole === "dono" ? (\n            <div className="flex flex-wrap gap-2">\n              <Link to="/memoria-ia" className="btn-ghost inline-flex items-center gap-1.5 text-xs">\n                <Brain className="h-4 w-4" /> Memória\n              </Link>\n              <Link\n                to="/relatorio-consumo-agua"\n                className="btn-ghost inline-flex items-center gap-1.5 text-xs"\n              >\n                <Droplets className="h-4 w-4" /> Relatório de água\n              </Link>\n            </div>\n          ) : undefined\n        }\n      />',
);

replaceOnce(
  '                                >\n                                  <Copy className="h-3.5 w-3.5" />\n                                </MessageAction>\n                              </MessageActions>',
  '                                >\n                                  <Copy className="h-3.5 w-3.5" />\n                                </MessageAction>\n                                <MessageAction\n                                  tooltip="Imprimir resposta como relatório"\n                                  label="Imprimir resposta"\n                                  className="h-8 w-8"\n                                  onClick={() => printHotelAiAnswer(part.text)}\n                                >\n                                  <Printer className="h-3.5 w-3.5" />\n                                </MessageAction>\n                              </MessageActions>',
);

source = source
  .replace('toast.success("Treinamento da recepção virtual salvo para esta empresa.");', 'toast.success("Instruções da recepção virtual salvas para esta empresa.");')
  .replace('Treinamento da recepção virtual', 'Instruções da recepção virtual')
  .replace('Salvar treinamento', 'Salvar instruções');

replaceOnce(
  '\nfunction StatusCard({',
  `\nfunction printHotelAiAnswer(text: string) {\n  const popup = window.open("", "_blank", "width=900,height=760");\n  if (!popup) {\n    toast.error("O navegador bloqueou a janela de impressão.");\n    return;\n  }\n  popup.opener = null;\n  const escaped = text\n    .replace(/&/g, "&amp;")\n    .replace(/</g, "&lt;")\n    .replace(/>/g, "&gt;")\n    .replace(/\\n/g, "<br />");\n  popup.document.write(\`<!doctype html>\n<html lang="pt-BR">\n<head>\n  <meta charset="utf-8" />\n  <title>Relatório do HotelAI</title>\n  <style>\n    body { font-family: Arial, sans-serif; margin: 32px; color: #1f2937; line-height: 1.55; }\n    header { border-bottom: 2px solid #24453a; margin-bottom: 22px; padding-bottom: 12px; }\n    h1 { font-size: 22px; margin: 0; }\n    .meta { color: #6b7280; font-size: 12px; margin-top: 5px; }\n    main { font-size: 14px; white-space: normal; }\n    footer { border-top: 1px solid #d1d5db; color: #6b7280; font-size: 10px; margin-top: 28px; padding-top: 10px; }\n    @media print { body { margin: 16mm; } }\n  </style>\n</head>\n<body>\n  <header>\n    <h1>Relatório do HotelAI</h1>\n    <div class="meta">Emitido em \\${new Date().toLocaleString("pt-BR")}</div>\n  </header>\n  <main>\\${escaped}</main>\n  <footer>Relatório gerencial gerado pelo sistema. Confira os lançamentos originais antes de decisões financeiras.</footer>\n</body>\n</html>\`);\n  popup.document.close();\n  popup.focus();\n  window.setTimeout(() => popup.print(), 250);\n}\n\nfunction StatusCard({`,
);

fs.writeFileSync(path, source);
console.log("HotelAI atualizado com memória, relatório e impressão.");
