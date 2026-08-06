function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function pageText() {
  return clean(document.body?.innerText || "");
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return clean(match[1]);
  }
  return null;
}

function bookingCode() {
  const url = new URL(location.href);
  return (
    url.searchParams.get("res_id") ||
    firstMatch(pageText(), [
      /(?:número da reserva|reservation number|booking confirmation)\s*[:#-]?\s*(\d{8,12})/i,
      /\b(\d{10})\b/,
    ])
  );
}

function extractBookingReservation() {
  const text = pageText();
  const title = clean(document.title);
  const code = bookingCode();

  const guestName = firstMatch(text, [
    /(?:nome do hóspede|guest name|hóspede principal)\s*[:\n-]\s*([^\n|]{3,120})/i,
    /(?:reservado por|booked by)\s*[:\n-]\s*([^\n|]{3,120})/i,
  ]);
  const checkin = firstMatch(text, [
    /(?:check-in|entrada|arrival)\s*[:\n-]\s*([^\n|]{4,50})/i,
  ]);
  const checkout = firstMatch(text, [
    /(?:check-out|saída|departure)\s*[:\n-]\s*([^\n|]{4,50})/i,
  ]);
  const total = firstMatch(text, [
    /(?:valor total|total price|preço total|total da reserva)\s*[:\n-]\s*([^\n|]{2,60})/i,
  ]);
  const guests = firstMatch(text, [
    /(?:hóspedes|guests|adultos e crianças)\s*[:\n-]\s*([^\n|]{2,80})/i,
  ]);
  const roomType = firstMatch(text, [
    /(?:tipo de quarto|room type|acomodação)\s*[:\n-]\s*([^\n|]{2,120})/i,
  ]);
  const status = firstMatch(text, [
    /(?:status da reserva|reservation status|situação)\s*[:\n-]\s*([^\n|]{2,80})/i,
  ]);

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
    raw_excerpt: text.slice(0, 12000),
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "HOSPEDAMAIS_EXTRACT_BOOKING") return;
  try {
    const payload = extractBookingReservation();
    sendResponse({ ok: true, payload });
  } catch (error) {
    sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
  return true;
});
