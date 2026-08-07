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
      (label) => lower === label || lower.startsWith(`${label}:`),
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

function findRoomType(lines) {
  const explicit = valueAfterLabel(lines, ["Tipo de quarto", "Room type", "Acomodação"]);
  if (explicit) return explicit;

  return (
    lines.find((line) =>
      /^(quarto|suíte|suite|apartamento|chalé|chale|studio|estúdio)\b/i.test(line),
    ) || null
  );
}

function findStatus(lines, flatText) {
  const explicit = valueAfterLabel(lines, [
    "Status da reserva",
    "Reservation status",
    "Situação da reserva",
  ]);
  if (explicit) return explicit;

  const statusLine = lines.find((line) =>
    /^(recebido|confirmada?|cancelada?|no-show|não compareceu|alterada?)$/i.test(line),
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
  const total = valueAfterLabel(lines, [
    "Preço total",
    "Valor total",
    "Total price",
    "Total da reserva",
  ]);
  const guests = valueAfterLabel(lines, [
    "Total de hóspedes",
    "Hóspedes",
    "Guests",
    "Adultos e crianças",
  ]);
  const roomType = findRoomType(lines);
  const status = findStatus(lines, flatText);

  return {
    source: "booking_extranet_chrome",
    captured_at: new Date().toISOString(),
    page_url: location.href,
    page_title: title,
    booking_code: code,
    guest_name: guestName,
    checkin_text: checkin,
    checkout_text: checkout,
    total_text: total,
    guests_text: guests,
    room_type: roomType,
    status_text: status,
    raw_excerpt: rawPageText().slice(0, 12000),
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "HOSPEDAMAIS_EXTRACT_BOOKING") return;
  try {
    const payload = extractBookingReservation();
    sendResponse({ ok: true, payload });
  } catch (error) {
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return true;
});
