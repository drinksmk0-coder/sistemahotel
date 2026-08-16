import fs from 'node:fs';

const path = 'src/routes/api/whatsapp-qr-pilot.ts';
let src = fs.readFileSync(path, 'utf8');

src = src.replace(
  '  DisconnectReason,\n  useMultiFileAuthState,',
  '  DisconnectReason,\n  fetchLatestWaWebVersion,\n  useMultiFileAuthState,'
);

src = src.replace(
  '  const sock = makeWASocket({\n    auth: state,',
  '  const { version: waVersion } = await fetchLatestWaWebVersion();\n  console.info("whatsapp-qr-pilot using WA Web version", waVersion.join("."));\n\n  const sock = makeWASocket({\n    version: waVersion,\n    auth: state,'
);

if (!src.includes('fetchLatestWaWebVersion') || !src.includes('version: waVersion')) {
  throw new Error('Não foi possível aplicar a correção de versão do WhatsApp Web.');
}

fs.writeFileSync(path, src);
