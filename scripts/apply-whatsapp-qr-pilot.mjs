import fs from "node:fs";

const whatsappPath = "src/routes/_authenticated/whatsapp-ia.tsx";
let source = fs.readFileSync(whatsappPath, "utf8");

if (!source.includes('import { WhatsAppQrPilotCard } from "@/components/WhatsAppQrPilotCard";')) {
  source = source.replace(
    'import { PageHeader } from "@/components/AppLayout";\n',
    'import { PageHeader } from "@/components/AppLayout";\nimport { WhatsAppQrPilotCard } from "@/components/WhatsAppQrPilotCard";\n',
  );
}

if (!source.includes("<WhatsAppQrPilotCard companyId={companyId} />")) {
  const marker = '      <section className="mb-5 overflow-hidden rounded-2xl border border-emerald-200 bg-card shadow-sm">';
  if (!source.includes(marker)) throw new Error("Não encontrei o card oficial do WhatsApp para inserir o piloto antes dele.");
  source = source.replace(marker, '      <WhatsAppQrPilotCard companyId={companyId} />\n\n' + marker);
}

fs.writeFileSync(whatsappPath, source);

const packagePath = "package.json";
const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
pkg.dependencies = pkg.dependencies || {};
pkg.dependencies["@whiskeysockets/baileys"] = "7.0.0-rc13";
pkg.dependencies = Object.fromEntries(Object.entries(pkg.dependencies).sort(([a], [b]) => a.localeCompare(b)));
fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);

console.log("WhatsApp QR pilot patch applied.");
