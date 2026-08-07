async function readConfig() {
  return chrome.storage.local.get([
    "endpoint",
    "token",
    "company",
    "autoMode",
    "autoLastKey",
    "autoLastSentAt",
  ]);
}

function eventKey(payload) {
  return [
    payload?.booking_code || "",
    payload?.status_text || "",
    payload?.checkin_text || "",
    payload?.checkout_text || "",
    payload?.total_text || "",
  ]
    .map((value) => String(value).trim().toLocaleLowerCase("pt-BR"))
    .join("|");
}

function isEligible(payload) {
  const code = String(payload?.booking_code || "").trim();
  const status = String(payload?.status_text || "");
  const cancelled = /cancelad[oa]/i.test(status);
  const hasDates = Boolean(
    String(payload?.checkin_text || "").trim() &&
      String(payload?.checkout_text || "").trim(),
  );
  return Boolean(code && (cancelled || hasDates));
}

async function sendAutomatically(payload) {
  const saved = await readConfig();
  if (saved.autoMode !== true) return { ok: true, skipped: "auto_disabled" };
  if (!saved.endpoint || !saved.token || !saved.company) {
    return { ok: false, skipped: "missing_config" };
  }
  if (!isEligible(payload)) return { ok: true, skipped: "incomplete_payload" };

  const key = eventKey(payload);
  if (key && key === saved.autoLastKey) {
    return { ok: true, skipped: "duplicate" };
  }

  const response = await fetch(saved.endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-booking-connector-token": saved.token,
    },
    body: JSON.stringify({ company_id: saved.company, payload }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = result.error || `HTTP ${response.status}`;
    await chrome.storage.local.set({
      autoLastError: String(message),
      autoLastAttemptAt: new Date().toISOString(),
    });
    throw new Error(message);
  }

  await chrome.storage.local.set({
    autoLastKey: key,
    autoLastSentAt: new Date().toISOString(),
    autoLastEventId: result.event_id || null,
    autoLastError: "",
  });
  return { ok: true, sent: true, event_id: result.event_id || null };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "HOSPEDAMAIS_AUTO_BOOKING") return;
  sendAutomatically(message.payload)
    .then((result) => sendResponse(result))
    .catch((error) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  return true;
});
