function clean(value) {
  return String(value ?? "").replace(/[\t\f\v ]+/g, " ").trim();
}

function rawPageText() {
  return String(document.body?.innerText || "")
    .replace(/\r/g, "")
    .replace(/\u00a0/g, " ");
}

function pageLines() {
  return rawPageText()
    .split("\n")
    .map(clean)
    .filter(Boolean);
}

function flatPageText() {
  return clean(rawPageText().replace(/\n+/g, " | "));
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return clean(match[1]);
  }
  return null;
}

function valueAfterLabel(lines, labels, options = {}) {
  const normalizedLabels = labels.map((label) => label.toLocaleLowerCase("pt-BR"));
  const maxLookAhead = options.maxLookAhead ?? 3;

  for (let index = 0; index < lines.length; index += 1) {
    const current = lines[index];
    const lower = current.toLocaleLowerCase("pt-BR");
    const matchedLabel = normalizedLabels.find(
      (label) => lower === label || lower.startsWith(`${label}:`) || lower.startsWith(`${label} `),
    );
    if (!matchedLabel) continue;

    const inline = clean(current.slice(matchedLabel.length).replace(/^\s*:\s*/, ""));
    if (inline) return inline;

    for (let offset = 1; offset <= maxLookAhead; offset += 1) {
      const candidate = lines[index + offset];
      if (!candidate) break;
      if (/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ ]{1,40}:$/.test(candidate)) break;
      return candidate;
    }
  }
  return null;
}

function moneyAmount(value) {
  const text = clean(value);
  const normalized = text.replace(/[^0-9,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function findGrossTotal(lines) {
  const headline = valueAfterLabel(lines, [
    "Preço total",
    "Valor total",
    "Total price",
    "Total da reserva",
  ]);
  if (moneyAmount(headline) > 0) return headline;

  for (const labels of [
    ["Preço total do quarto", "Total room price"],
    ["Subtotal"],
  ]) {
    const candidate = valueAfterLabel(lines, labels, { maxLookAhead: 2 });
    if (moneyAmount(candidate) > 0) return candidate;
  }
  return headline;
}

function bookingCode(lines, flatText) {
  const url = new URL(location.href);
  return (
    url.searchParams.get("res_id") ||
    valueAfterLabel(lines, ["Número da reserva", "Reservation number"]) ||
    firstMatch(flatText, [
      /(?:número da reserva|reservation number|booking confirmation)\s*[:#-]?\s*(\d{8,12})/i,
      /\b(\d{10})\b/,
    ])
  );
}

function validPhone(value) {
  const text = clean(value);
  const digits = text.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 ? text : null;
}

function findGuestPhone(lines) {
  const labels = [
    "Telefone",
    "Telefone do hóspede",
    "Número de telefone",
    "Phone",
    "Phone number",
    "Guest phone",
    "Mobile phone",
  ];
  const normalizedLabels = labels.map((label) => label.toLocaleLowerCase("pt-BR"));

  for (let index = 0; index < lines.length; index += 1) {
    const current = lines[index];
    const lower = current.toLocaleLowerCase("pt-BR");
    const label = normalizedLabels.find((candidate) => lower === candidate || lower.startsWith(`${candidate}:`));
    if (!label || /mostrar|show|reveal/i.test(current)) continue;

    const inline = validPhone(current.slice(label.length).replace(/^\s*:\s*/, ""));
    if (inline) return inline;

    for (let offset = 1; offset <= 4; offset += 1) {
      const candidate = lines[index + offset];
      if (!candidate) break;
      const phone = validPhone(candidate);
      if (phone) return phone;
      if (/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ /-]{1,40}:?$/.test(candidate)) break;
    }
  }
  return null;
}

function revealGuestPhone() {
  const control = [...document.querySelectorAll("button, a, [role='button']")].find((element) =>
    /^(mostrar|exibir|revelar)\s+(o\s+)?(telefone|número de telefone)|^show\s+(guest\s+)?phone( number)?$/i.test(clean(element.textContent)),
  );
  if (!control || control.dataset.hospedamaisPhoneRequested === "true") return false;
  control.dataset.hospedamaisPhoneRequested = "true";
  control.click();
  return true;
}

function stripCancellation(value) {
  return clean(String(value ?? "").replace(/\s+(?:cancelad[oa](?:\s+pelo\s+hóspede)?|cancell?ed(?:\s+by\s+guest)?)\s*$/i, ""));
}

function findRoomType(lines) {
  const explicit = valueAfterLabel(lines, ["Tipo de quarto", "Room type", "Acomodação"]);
  if (explicit) return stripCancellation(explicit) || null;

  const roomLine = lines.find((line) =>
    /^(?:\d+\s+)?(?:quarto|suíte|suite|apartamento|chalé|chale|studio|estúdio)\b/i.test(line) ||
    /\b(?:room|suite|apartment|studio)\s*$/i.test(stripCancellation(line)),
  );
  return roomLine
    ? stripCancellation(roomLine).replace(/^\d+\s+/, "") || null
    : null;
}

function findStatus(lines, flatText) {
  const explicit = valueAfterLabel(lines, [
    "Status da reserva",
    "Reservation status",
    "Situação da reserva",
  ]);
  if (explicit) return explicit;

  const cancelled = lines.find((line) => /cancelad[oa]|cancelou\s+esta\s+reserva|cancell?ed\s+(?:this\s+booking|by\s+guest)/i.test(line));
  if (cancelled) {
    const match = cancelled.match(/(cancelad[oa](?:\s+pelo\s+hóspede)?|cancelou\s+esta\s+reserva|cancell?ed(?:\s+this\s+booking|\s+by\s+guest)?)/i);
    return match?.[1] ? clean(match[1]) : "Cancelada";
  }

  const statusLine = lines.find((line) =>
    /^(recebido|confirmada?|no-show|não compareceu|alterada?)$/i.test(line),
  );
  if (statusLine) return statusLine;

  if (/pedir cancelamento de reserva/i.test(flatText)) return "Reserva ativa";
  return null;
}

function extractBookingReservation() {
  const lines = pageLines();
  const flatText = flatPageText();
  const title = clean(document.title);
  const code = bookingCode(lines, flatText);

  const guestName =
    valueAfterLabel(lines, ["Nome do hóspede", "Guest name", "Hóspede principal"]) ||
    valueAfterLabel(lines, ["Reservado por", "Booked by"]);

  const checkin = valueAfterLabel(lines, ["Check-in", "Entrada", "Arrival"], {
    maxLookAhead: 2,
  });
  const checkout = valueAfterLabel(lines, ["Check-out", "Saída", "Departure"], {
    maxLookAhead: 2,
  });
  const total = findGrossTotal(lines);
  const guests = valueAfterLabel(lines, [
    "Total de hóspedes",
    "Hóspedes",
    "Guests",
    "Adultos e crianças",
  ]);
  const roomType = findRoomType(lines);
  const status = findStatus(lines, flatText);
  const guestPhone = findGuestPhone(lines);

  return {
    source: "booking_extranet_chrome",
    captured_at: new Date().toISOString(),
    page_url: location.href,
    page_title: title,
    booking_code: code,
    guest_name: guestName,
    guest_phone: guestPhone,
    checkin_text: checkin,
    checkout_text: checkout,
    total_text: total,
    guests_text: guests,
    room_type: roomType,
    status_text: status,
    raw_excerpt: rawPageText().slice(0, 12000),
  };
}

let autoTimer = null;
let lastCandidateKey = "";

function candidateKey(payload) {
  return [
    payload?.booking_code || "",
    payload?.status_text || "",
    payload?.checkin_text || "",
    payload?.checkout_text || "",
    payload?.total_text || "",
    payload?.guest_phone || "",
  ].join("|");
}

function scheduleAutomaticCapture(delay = 2200) {
  window.clearTimeout(autoTimer);
  autoTimer = window.setTimeout(() => {
    try {
      if (revealGuestPhone()) {
        scheduleAutomaticCapture(900);
        return;
      }
      const payload = extractBookingReservation();
      if (!payload.booking_code) return;
      const key = candidateKey(payload);
      if (!key || key === lastCandidateKey) return;
      lastCandidateKey = key;
      chrome.runtime.sendMessage({
        type: "HOSPEDAMAIS_AUTO_BOOKING",
        payload,
      });
    } catch {
      // O modo automático nunca deve interferir na navegação da Extranet.
    }
  }, delay);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "HOSPEDAMAIS_EXTRACT_BOOKING") return;
  const extractAndRespond = () => {
    try {
      const payload = extractBookingReservation();
      sendResponse({ ok: true, payload });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
  if (revealGuestPhone()) window.setTimeout(extractAndRespond, 900);
  else extractAndRespond();
  return true;
});

scheduleAutomaticCapture(1800);
const observer = new MutationObserver(() => scheduleAutomaticCapture());
if (document.documentElement) {
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}
