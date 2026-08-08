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
      const label = normalized.find((x) => lower === x || lower.startsWith(`${x}:`) || lower.startsWith(`${x} `));
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

  const moneyAmount = (value) => {
    const normalized = clean(value).replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.');
    const amount = Number(normalized);
    return Number.isFinite(amount) ? amount : 0;
  };
  const grossTotal = () => {
    const headline = after(['Preço total', 'Valor total', 'Total price', 'Total da reserva']);
    if (moneyAmount(headline) > 0) return headline;
    for (const labels of [['Preço total do quarto', 'Total room price'], ['Subtotal']]) {
      const candidate = after(labels, 2);
      if (moneyAmount(candidate) > 0) return candidate;
    }
    return headline;
  };

  const u = new URL(url);
  const code = u.searchParams.get('res_id') || after(['Número da reserva', 'Reservation number']) || flat.match(/\b(\d{10})\b/)?.[1] || null;
  const cancelledLine = lines.find((line) => /cancelad[oa]|cancelou\s+esta\s+reserva|cancell?ed\s+(?:this\s+booking|by\s+guest)/i.test(line));
  const status = after(['Status da reserva', 'Reservation status', 'Situação da reserva']) || (cancelledLine ? clean(cancelledLine.match(/(cancelad[oa](?:\s+pelo\s+hóspede)?|cancelou\s+esta\s+reserva|cancell?ed(?:\s+this\s+booking|\s+by\s+guest)?)/i)?.[1] || 'Cancelada') : (/pedir cancelamento de reserva|request\s+to\s+cancel/i.test(flat) ? 'Reserva ativa' : null));
  const stripCancellation = (v) => clean(String(v ?? '').replace(/\s+(?:cancelad[oa](?:\s+pelo\s+hóspede)?|cancell?ed(?:\s+by\s+guest)?)\s*$/i, '')) || null;
  const explicitRoom = after(['Tipo de quarto', 'Room type', 'Acomodação']);
  const roomLine = lines.find((line) => /^(?:\d+\s+)?(?:quarto|suíte|suite|apartamento|chalé|chale|studio|estúdio)\b/i.test(line) || /\b(?:room|suite|apartment|studio)\s*$/i.test(stripCancellation(line) || ''));
  const roomType = stripCancellation(explicitRoom || roomLine)?.replace(/^\d+\s+/, '') || null;
  const phoneLabels = ['Telefone', 'Telefone do hóspede', 'Número de telefone', 'Phone', 'Phone number', 'Guest phone', 'Mobile phone'];
  const phoneCandidate = after(phoneLabels, 4);
  const phoneDigits = clean(phoneCandidate).replace(/\D/g, '');
  const guestPhone = phoneDigits.length >= 8 && phoneDigits.length <= 15 ? phoneCandidate : null;

  return {
    source: 'booking_extranet_local_agent',
    captured_at: new Date().toISOString(),
    page_url: url,
    booking_code: code,
    guest_name: after(['Nome do hóspede', 'Guest name', 'Hóspede principal']) || after(['Reservado por', 'Booked by']),
    guest_phone: guestPhone,
    checkin_text: after(['Check-in', 'Entrada', 'Arrival'], 2),
    checkout_text: after(['Check-out', 'Saída', 'Departure'], 2),
    total_text: grossTotal(),
    guests_text: after(['Total de hóspedes', 'Hóspedes', 'Guests', 'Adultos e crianças']),
    room_type: roomType,
    status_text: status,
    raw_excerpt: raw.slice(0, 12000),
  };
}

function fingerprint(payload) {
  return [payload.booking_code, payload.status_text, payload.checkin_text, payload.checkout_text, payload.total_text, payload.guest_phone].map((v) => clean(v)).join('|');
}

function isSafeToSend(payload) {
  if (!payload.booking_code) return false;
  if (/cancelad/i.test(payload.status_text || '')) return true;
  return Boolean(payload.checkin_text && payload.checkout_text);
}

export async function startBookingWatcher(cfg) {
  const context = await chromium.launchPersistentContext(cfg.profileDir, {
    headless: cfg.headless,
    viewport: { width: 1366, height: 820 },
  });
  let page = context.pages()[0] || await context.newPage();
  const sent = new Map();
  const knownLinks = new Map();
  const lastScanned = new Map();
  let lastKnownRefresh = 0;
  let navigationWarningShown = false;

  const refreshKnownReservations = async () => {
    if (Date.now() - lastKnownRefresh < 30 * 60_000) return;
    const response = await fetch(cfg.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-booking-connector-token': cfg.token,
      },
      body: JSON.stringify({ company_id: cfg.companyId, action: 'list_known_reservations' }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    for (const row of body.reservations || []) {
      const code = String(row.booking_code || '').replace(/\D/g, '');
      const pageUrl = String(row.page_url || '');
      if (code && pageUrl.startsWith('https://admin.booking.com/')) knownLinks.set(code, pageUrl);
    }
    lastKnownRefresh = Date.now();
  };

  const withCurrentSession = (storedUrl, currentUrl) => {
    try {
      const target = new URL(storedUrl);
      const current = new URL(currentUrl);
      for (const key of ['ses', 'lang', 'hotel_id']) {
        const value = current.searchParams.get(key);
        if (value) target.searchParams.set(key, value);
      }
      return target.toString();
    } catch {
      return storedUrl;
    }
  };

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
    if (sent.size > 1000) sent.delete(sent.keys().next().value);
    console.log(`[Booking] ${payload.booking_code} enviado (${payload.status_text || 'sem status'})`);
  };

  const scan = async () => {
    try {
      const bookingPages = context.pages().filter((candidate) => candidate.url().startsWith('https://admin.booking.com/'));
      const reservationPage = [...bookingPages].reverse().find((candidate) => /[?&]res_id=/.test(candidate.url()));
      page = reservationPage || bookingPages.at(-1) || page;

      if (!page.url().startsWith('https://admin.booking.com/')) {
        await page.goto(cfg.reservationsUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      }

      const bodyText = await page.locator('body').innerText().catch(() => '');
      if (/sorry, this page does not exist|esta p[aá]gina n[aã]o existe|p[aá]gina n[aã]o encontrada/i.test(bodyText)) {
        console.warn('[Booking] A Booking recusou um endereço antigo. Voltando à página inicial. Depois, abra o menu Reservas uma vez.');
        await page.goto('https://admin.booking.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
        navigationWarningShown = false;
        return;
      }

      if (/captcha|verifique que você é humano|two-factor|código de verificação|sign in|iniciar sessão/i.test(bodyText)) {
        console.warn('[Booking] Login/2FA/CAPTCHA necessário. O agente aguardará ação humana.');
        return;
      }

      await refreshKnownReservations().catch((error) => {
        console.warn('[Booking] Não foi possível atualizar a lista histórica:', error?.message || error);
      });
      const visibleLinks = await page.locator('a[href*="res_id="]').evaluateAll((nodes) => [...new Set(nodes.map((n) => n.href).filter(Boolean))]);
      if (!visibleLinks.length && /[?&]res_id=/.test(page.url())) visibleLinks.push(page.url());
      for (const link of visibleLinks) {
        try {
          const code = new URL(link).searchParams.get('res_id')?.replace(/\D/g, '');
          if (code) knownLinks.set(code, link);
        } catch {}
      }

      if (!knownLinks.size) {
        const reservationsMenu = page.locator('a, button').filter({ hasText: /^(reservas|reservations)$/i }).first();
        if (await reservationsMenu.count()) {
          console.log('[Booking] Abrindo o menu Reservas automaticamente...');
          await reservationsMenu.click().catch(() => {});
          await page.waitForTimeout(1500);
          return;
        }

        if (!navigationWarningShown) {
          console.warn('[Booking] Nenhuma reserva visível. No navegador aberto pelo agente, entre na Booking e clique em Reservas.');
          navigationWarningShown = true;
        }
        return;
      }

      navigationWarningShown = false;
      const currentPageIsReservation = /[?&]res_id=/.test(page.url());
      const detail = currentPageIsReservation ? page : await context.newPage();
      const reservationLinks = [...knownLinks.entries()]
        .sort(([codeA], [codeB]) => (lastScanned.get(codeA) || 0) - (lastScanned.get(codeB) || 0))
        .slice(0, cfg.maxReservationsPerCycle);

      for (const [knownCode, storedLink] of reservationLinks) {
        try {
          const link = withCurrentSession(storedLink, page.url());
          await detail.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 });
          await detail.waitForTimeout(700);
          const revealPhone = detail.locator('button, a, [role="button"]').filter({ hasText: /mostrar|exibir|revelar|show/i }).filter({ hasText: /telefone|phone/i }).first();
          if (await revealPhone.count()) {
            await revealPhone.click().catch(() => {});
            await detail.waitForTimeout(500);
          }
          const text = await detail.locator('body').innerText();
          const payload = parseReservationFromText(text, detail.url());
          if (payload.booking_code) knownLinks.set(payload.booking_code, detail.url());
          if (isSafeToSend(payload)) await send(payload);
        } catch (error) {
          console.error('[Booking] Falha ao processar reserva:', error?.message || error);
        } finally {
          lastScanned.set(knownCode, Date.now());
        }
      }
      if (!currentPageIsReservation) await detail.close().catch(() => {});
    } catch (error) {
      console.error('[Booking] Falha no ciclo:', error?.message || error);
    }
  };

  await page.goto(cfg.reservationsUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  console.log(`[Booking] Agente iniciado em modo ${cfg.headless ? 'invisível' : 'visível'}.`);
  if (!cfg.headless) console.log('[Booking] Faça login manualmente e abra Reservas uma vez se a Extranet solicitar.');
  while (true) {
    await scan();
    await sleep(cfg.pollMinutes * 60_000);
  }
}
