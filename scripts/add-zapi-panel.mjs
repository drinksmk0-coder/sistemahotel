import fs from "node:fs";

const path = "src/routes/_authenticated/integracoes.tsx";
let source = fs.readFileSync(path, "utf8");

if (!source.includes('import { ZApiIntegrationPanel } from "@/components/ZApiIntegrationPanel";')) {
  source = source.replace(
    'import { PageHeader } from "@/components/AppLayout";\n',
    'import { PageHeader } from "@/components/AppLayout";\nimport { ZApiIntegrationPanel } from "@/components/ZApiIntegrationPanel";\n',
  );
}

const marker = '      <section className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">';
if (!source.includes("<ZApiIntegrationPanel")) {
  if (!source.includes(marker)) throw new Error("Ponto de inserção do painel Z-API não encontrado.");
  source = source.replace(
    marker,
    '      <ZApiIntegrationPanel companyId={current.data?.id} />\n\n' + marker,
  );
}

fs.writeFileSync(path, source);
console.log("Painel Z-API integrado à tela de Integrações.");
