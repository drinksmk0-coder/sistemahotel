import { config, validateConfig } from './config.mjs';
import { sendEmail } from './gmail.mjs';

validateConfig();
if (!config.gmail.enabled) throw new Error('Ative GMAIL_ENABLED=true no .env');

const [to, subject, ...bodyParts] = process.argv.slice(2);
const text = bodyParts.join(' ').trim();
if (!to || !subject || !text) {
  console.error('Uso: npm run send-email -- destinatario@exemplo.com "Assunto" "Mensagem"');
  process.exit(1);
}

const result = await sendEmail(config.gmail, { to, subject, text });
console.log(`[Gmail] E-mail enviado. ID: ${result.id || 'ok'}`);
