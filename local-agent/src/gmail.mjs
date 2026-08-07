import { google } from 'googleapis';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function gmailClient(cfg) {
  const auth = new google.auth.OAuth2(cfg.clientId, cfg.clientSecret);
  auth.setCredentials({ refresh_token: cfg.refreshToken });
  return google.gmail({ version: 'v1', auth });
}

function decodeBase64Url(value = '') {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf8');
}

function headersMap(headers = []) {
  return Object.fromEntries(headers.map((h) => [String(h.name || '').toLowerCase(), h.value || '']));
}

function extractText(payload) {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) return decodeBase64Url(payload.body.data);
  for (const part of payload.parts || []) {
    const text = extractText(part);
    if (text) return text;
  }
  if (payload.body?.data) return decodeBase64Url(payload.body.data);
  return '';
}

export async function listUnread(cfg, maxResults = 20) {
  const gmail = gmailClient(cfg);
  const list = await gmail.users.messages.list({
    userId: cfg.userId,
    q: 'is:unread newer_than:7d',
    maxResults,
  });

  const items = [];
  for (const item of list.data.messages || []) {
    const full = await gmail.users.messages.get({ userId: cfg.userId, id: item.id, format: 'full' });
    const headers = headersMap(full.data.payload?.headers);
    items.push({
      id: full.data.id,
      threadId: full.data.threadId,
      from: headers.from || '',
      to: headers.to || '',
      subject: headers.subject || '',
      date: headers.date || '',
      snippet: full.data.snippet || '',
      text: extractText(full.data.payload).slice(0, 12000),
    });
  }
  return items;
}

export async function sendEmail(cfg, { to, subject, text, replyTo, inReplyTo, references }) {
  if (!to || !subject || !text) throw new Error('to, subject e text são obrigatórios');
  const gmail = gmailClient(cfg);
  const headers = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'MIME-Version: 1.0',
  ];
  if (replyTo) headers.push(`Reply-To: ${replyTo}`);
  if (inReplyTo) headers.push(`In-Reply-To: ${inReplyTo}`);
  if (references) headers.push(`References: ${references}`);
  const raw = Buffer.from(`${headers.join('\r\n')}\r\n\r\n${text}`, 'utf8')
    .toString('base64url');
  const result = await gmail.users.messages.send({ userId: cfg.userId, requestBody: { raw } });
  return result.data;
}

export async function startGmailWatcher(cfg) {
  const seen = new Set();
  console.log(`[Gmail] Monitor ativo a cada ${cfg.pollMinutes} min.`);
  while (true) {
    try {
      const messages = await listUnread(cfg, 20);
      for (const message of messages) {
        if (seen.has(message.id)) continue;
        seen.add(message.id);
        const summary = `${message.from} | ${message.subject || '(sem assunto)'}`;
        console.log(`[Gmail] Novo não lido: ${summary}`);
      }
    } catch (error) {
      console.error('[Gmail] Falha no ciclo:', error?.message || error);
    }
    await sleep(cfg.pollMinutes * 60_000);
  }
}
