let currentPayload = null;
const $ = (id) => document.getElementById(id);

async function config() {
  return chrome.storage.local.get(["endpoint", "token", "company"]);
}

function field(label, value) {
  return `<div class="row"><b>${label}</b>${value || "Não encontrado"}</div>`;
}

function render(payload) {
  currentPayload = payload;
  $("preview").hidden = false;
  $("preview").innerHTML = [
    field("Código Booking", payload.booking_code),
    field("Hóspede", payload.guest_name),
    field("Check-in", payload.checkin_text),
    field("Check-out", payload.checkout_text),
    field("Valor", payload.total_text),
    field("Hóspedes", payload.guests_text),
    field("Acomodação", payload.room_type),
    field("Status", payload.status_text),
  ].join("");
  $("send").disabled = !payload.booking_code;
  $("status").textContent = payload.booking_code
    ? "Dados capturados. Confira antes de enviar."
    : "Não encontrei o código da reserva nesta página.";
}

async function capture() {
  $("status").textContent = "Lendo página…";
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !String(tab.url || "").startsWith("https://admin.booking.com/")) {
    $("status").innerHTML = '<span class="error">Abra uma reserva em admin.booking.com.</span>';
    return;
  }
  chrome.tabs.sendMessage(tab.id, { type: "HOSPEDAMAIS_EXTRACT_BOOKING" }, (response) => {
    if (chrome.runtime.lastError || !response?.ok) {
      $("status").innerHTML = `<span class="error">${chrome.runtime.lastError?.message || response?.error || "Falha ao ler a página."}</span>`;
      return;
    }
    render(response.payload);
  });
}

async function send() {
  if (!currentPayload) return;
  const saved = await config();
  if (!saved.endpoint || !saved.token || !saved.company) {
    $("status").innerHTML = '<span class="error">Preencha endpoint, token e empresa na configuração.</span>';
    return;
  }
  $("send").disabled = true;
  $("status").textContent = "Enviando para conferência…";
  try {
    const response = await fetch(saved.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-booking-connector-token": saved.token,
      },
      body: JSON.stringify({ company_id: saved.company, payload: currentPayload }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    $("status").innerHTML = `<span class="ok">Enviado. Evento ${result.event_id || "registrado"} aguardando conferência.</span>`;
  } catch (error) {
    $("status").innerHTML = `<span class="error">${error instanceof Error ? error.message : String(error)}</span>`;
  } finally {
    $("send").disabled = false;
  }
}

async function loadConfig() {
  const saved = await config();
  $("endpoint").value = saved.endpoint || "";
  $("token").value = saved.token || "";
  $("company").value = saved.company || "";
}

$("capture").addEventListener("click", capture);
$("send").addEventListener("click", send);
$("save").addEventListener("click", async () => {
  await chrome.storage.local.set({
    endpoint: $("endpoint").value.trim(),
    token: $("token").value.trim(),
    company: $("company").value.trim(),
  });
  $("status").innerHTML = '<span class="ok">Configuração salva neste navegador.</span>';
});

loadConfig().then(capture);
