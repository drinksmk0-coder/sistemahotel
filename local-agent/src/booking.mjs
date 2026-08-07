import { chromium } from 'playwright';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value) => String(value ?? '').replace(/[\t\f\v ]+/g, ' ').trim();

function parseReservationFromText(text, url) {
  const raw = String(text || '').replace(/\r/g, '').replace(/\u00a0/g, ' ');
  const lines = raw.split('\n').map(clean).filter(Boolean);
  const flat = clean(raw.replace(/\n+/g, ' | '));

  const after = (labels, maxLookAhead = 3) => {
    const normalized = labels.map((x) => x.toLocaleLowerCase('pt-BR'));
    for (let i = 0; i < lines.length; i += 1) {
      const current = lines[i];
      const lower = current.toLocaleLowerCase('pt-BR');
      const label = normalized.find((x) => lower === x || lower.startsWith(`${x}:`));
      if (!label) continue;
      const inline = clean(current.slice(label.length).replace(/^\s*:\s*/, ''));
      if (inline) return inline;
      for (let offset = 1; offset <= maxLookAhead; offset += 1) {
        const candidate = lines[i + offset];
        if (!candidate) break;
        if (/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ ]{1,40}:$/.test(candidate)) break;
        return candidate;
      }
    }
    return null;
  };

  const u = new URL(url);
  const code = u.searchParams.get('res_id') || after(['Número da reserva', 'Reservation number']) || flat.match(/\b(\d{10})\b/)?.[1] || null;
  const cancelledLine = lines.find((line) => /cancelad[oa]/i.test(line));
  const status = after(['Status da reserva', 'Reservation status', 'Situação da reserva']) || (cancelledLine ? clean(cancelledLine.match(/(cancelad[oa](?:\s+pelo\s+hóspede)?)/i)?.[1] || 'Cancelada') : (/pedir cancelamento de reserva/i.test(flat) ? 'Reserva ativa' : null));
  const stripCancellation = (v) => clean(String(v ?? '').replace(/\s+cancelad[oa](?:\s+pelo\s+hóspede)?\s*$/i, '')) || null;
  const explicitRoom = after(['Tipo de quarto', 'Room type', 'Acomodação']);
  const roomType = stripCancellation(explicitRoom || lines.find((line) => /^(quarto|suíte|suite|apartamento|chalé|chale|studio|estúdio)\b/i.test(line)));

  return {
    source: 'booking_extranet_local_agent',
    captured_at: new Date().toISOString(),
    page_url: url,
    booking_code: code,
    guest_name: after(['Nome do hóspede', 'Guest name', 'Hóspede principal']) || after(['Reservado por', 'Booked by']),
    checkin_text: after(['Check-in', 'Entrada', 'Arrival'], 2),
    checkout_text: after(['Check-out', 'Saída', 'Departure'], 2),
    total_text: after(['Preço total', 'Valor total', 'Total price', 'Total da reserva']),
    guests_text: after(['Total de hóspedes', 'Hóspedes', 'Guests', 'Adultos e crianças']),
    room_type: roomType,
    status_text: status,
    raw_excerpt: raw.slice(0, 12000),
  };
}

function fingerprint(payload) {
  return [payload.booking_code, payload.status_text, payload.checkin_text, payload.checkout_text, payload.total_text].map((v) => clean(v)).join('|');
}

function isSafeToSend(payload) {
  if (!payload.booking_code) return false;
  if (/cancelad/i.test(payload.status_text || '')) return true;
  return Boolean(payload.checkin_text && payload.checkout_text);
}

export async function startBookingWatcher(cfg) {
  const context = await chromium.launchPersistentContext(cfg.profileDir, {
    headless: false,
    viewport: { width: 1366, height: 820 },
  });
  const page = context.pages()[0] || await context.newPage();
  const sent = new Map();

  const send = async (payload) => {
    const key = fingerprint(payload);
    if (sent.get(payload.booking_code) === key) return;
    const response = await fetch(cfg.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-booking-connector-token': cfg.token,
      },
      body: JSON.stringify({ company_id: cfg.companyId, payload }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    sent.set(payload.booking_code, key);
    console.log(`[Booking] ${payload.booking_code} enviado (${payload.status_text || 'sem status'})`);
  };

  const scan = async () => {
    try {
      if (!page.url().startsWith('https://admin.booking.com/')) {
        await page.goto(cfg.reservationsUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      }

      const bodyText = await page.locator('body').innerText().catch(() => '');
      if (/captcha|verifique que você é humano|two-factor|código de verificação|sign in|iniciar sessão/i.test(bodyText)) {
        console.warn('[Booking] Login/2FA/CAPTCHA necessário. O agente aguardará ação humana.');
        return;
      }

      const reservationLinks = await page.locator('a[href*="res_id="]').evaluateAll((nodes) => [...new Set(nodes.map((n) => n.href).filter(Boolean))]);
      if (!reservationLinks.length && /res_id=/.test(page.url())) reservationLinks.push(page.url());

      for (const link of reservationLinks.slice(0, 40)) {
        const detail = await context.newPage();
        try {
          await detail.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 });
          await detail.waitForTimeout(1200);
          const text = await detail.locator('body').innerText();
          const payload = parseReservationFromText(text, detail.url());
          if (isSafeToSend(payload)) await send(payload);
        } catch (error) {
          console.error('[Booking] Falha ao processar reserva:', error?.message || error);
        } finally {
          await detail.close();
        }
      }
    } catch (error) {
      console.error('[Booking] Falha no ciclo:', error?.message || error);
    }
  };

  await page.goto(cfg.reservationsUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  console.log('[Booking] Agente iniciado. Faça login manualmente se a Extranet solicitar.');
  while (true) {
    await scan();
    await sleep(cfg.pollMinutes * 60_000);
  }
}
