import { createClient } from "npm:@supabase/supabase-js@2.110.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-booking-connector-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const connectorToken = Deno.env.get("BOOKING_CONNECTOR_TOKEN") ?? "";

type BookingPayload = {
  source?: string;
  captured_at?: string;
  page_url?: string;
  page_title?: string;
  booking_code?: string;
  guest_name?: string | null;
  guest_phone?: string | null;
  checkin_text?: string | null;
  checkout_text?: string | null;
  total_text?: string | null;
  guests_text?: string | null;
  room_type?: string | null;
  status_text?: string | null;
  raw_excerpt?: string | null;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return respond({ ok: true });
  if (request.method !== "POST") return respond({ ok: false, error: "Method not allowed" }, 405);

  const token = request.headers.get("x-booking-connector-token") ?? "";
  if (!connectorToken || token !== connectorToken) {
    return respond({ ok: false, error: "Invalid connector token" }, 401);
  }

  const body = await request.json().catch(() => null) as {
    company_id?: string;
    action?: string;
    payload?: BookingPayload;
  } | null;
  const companyId = String(body?.company_id ?? "").trim();

  if (!companyId) {
    return respond({ ok: false, error: "company_id é obrigatório" }, 400);
  }

  if (body?.action === "list_known_reservations") {
    const { data, error } = await supabase
      .from("booking_browser_events")
      .select("booking_code,page_url,captured_at")
      .eq("company_id", companyId)
      .eq("event_type", "reservation_details")
      .not("page_url", "is", null)
      .order("captured_at", { ascending: false })
      .limit(200);
    if (error) return respond({ ok: false, error: error.message }, 500);

    const seen = new Set<string>();
    const reservations = (data ?? []).flatMap((row) => {
      const code = String(row.booking_code ?? "").replace(/\D/g, "");
      const pageUrl = String(row.page_url ?? "").trim();
      if (!code || seen.has(code) || !/^https:\/\/admin\.booking\.com\//i.test(pageUrl)) return [];
      seen.add(code);
      return [{ booking_code: code, page_url: pageUrl }];
    });
    return respond({ ok: true, reservations });
  }

  const payload = body?.payload;
  const bookingCode = String(payload?.booking_code ?? "").replace(/\D/g, "");

  if (!bookingCode) {
    return respond({ ok: false, error: "company_id e booking_code são obrigatórios" }, 400);
  }
  if (!/^https:\/\/admin\.booking\.com\//i.test(String(payload?.page_url ?? ""))) {
    return respond({ ok: false, error: "Origem da página Booking inválida" }, 400);
  }

  const cancellationText = `${payload?.status_text ?? ""} ${payload?.room_type ?? ""} ${String(payload?.raw_excerpt ?? "").slice(0, 2400)}`;
  const eventType = isConfirmedCancellation(cancellationText) ? "cancellation_details" : "reservation_details";
  const guestPhone = normalizePhone(payload?.guest_phone);
  const grossTotal = parseGrossTotal(payload);
  const safePayload = { ...payload, raw_excerpt: String(payload?.raw_excerpt ?? "").slice(0, 12000) };

  const { data: event, error: eventError } = await supabase
    .from("booking_browser_events")
    .upsert({
      company_id: companyId,
      booking_code: bookingCode,
      source: "booking_extranet_chrome",
      status: "needs_review",
      event_type: eventType,
      guest_name: nullable(payload?.guest_name),
      guest_phone: guestPhone,
      checkin_text: nullable(payload?.checkin_text),
      checkout_text: nullable(payload?.checkout_text),
      total_text: grossTotal > 0 ? formatCurrency(grossTotal) : nullable(payload?.total_text),
      guests_text: nullable(payload?.guests_text),
      room_type: cleanRoomType(payload?.room_type),
      booking_status_text: eventType === "cancellation_details"
        ? (nullable(payload?.status_text) || "Cancelada pelo hóspede")
        : nullable(payload?.status_text),
      page_url: nullable(payload?.page_url),
      page_title: nullable(payload?.page_title),
      payload: safePayload,
      captured_at: payload?.captured_at || new Date().toISOString(),
      error: null,
    }, { onConflict: "company_id,booking_code,event_type" })
    .select("id,status,booking_code,event_type")
    .single();

  if (eventError) return respond({ ok: false, error: eventError.message }, 500);

  if (eventType === "cancellation_details") {
    const cancellation = await processCancellation(event.id, companyId, bookingCode, payload);
    return respond({ ok: true, event_id: event.id, booking_code: bookingCode, ...cancellation });
  }

  const existing = await findReservation(companyId, bookingCode, payload);
  if (existing.kind === "unique" && existing.reservation) {
    const reconciliation = await reconcileExistingReservation(existing.reservation, companyId, bookingCode, payload);
    if (reconciliation.error) {
      const review = await keepForReview(event.id, reconciliation.error);
      return respond({ ok: true, event_id: event.id, booking_code: bookingCode, ...review });
    }
    const clientSync = await syncBookingClient(existing.reservation, companyId, payload);
    if (clientSync.error) {
      const review = await keepForReview(event.id, clientSync.error);
      return respond({ ok: true, event_id: event.id, booking_code: bookingCode, ...review });
    }
    await markEvent(event.id, {
      status: "processed",
      reservation_id: existing.reservation.id,
      previous_status: existing.reservation.status,
      new_status: existing.reservation.status,
      processed_at: new Date().toISOString(),
      error: null,
    });
    return respond({
      ok: true,
      event_id: event.id,
      booking_code: bookingCode,
      status: "processed",
      linked_existing_reservation: true,
      reservation_id: existing.reservation.id,
    });
  }

  const creation = await createReservationAutomatically(event.id, companyId, bookingCode, payload);
  return respond({ ok: true, event_id: event.id, booking_code: bookingCode, ...creation });
});

async function createReservationAutomatically(eventId: string, companyId: string, bookingCode: string, payload?: BookingPayload) {
  const guestName = nullable(payload?.guest_name);
  const checkin = parseBookingDate(payload?.checkin_text);
  const checkout = parseBookingDate(payload?.checkout_text);
  const roomType = cleanRoomType(payload?.room_type);
  const total = parseGrossTotal(payload);
  const people = parseGuests(payload?.guests_text);

  if (!guestName || !checkin || !checkout || !roomType) {
    return keepForReview(eventId, "Dados essenciais incompletos para criar a reserva automaticamente.");
  }

  const nights = daysBetween(checkin, checkout);
  if (nights < 1) return keepForReview(eventId, "Datas inválidas para criação automática.");
  if (!(total > 0)) return keepForReview(eventId, "Valor da Booking ausente ou igual a zero; revisão manual necessária.");

  const { data: mappings, error: mappingError } = await supabase
    .from("booking_room_type_mappings")
    .select("room_number")
    .eq("company_id", companyId)
    .eq("enabled", true)
    .ilike("booking_room_type", roomType);

  if (mappingError) return keepForReview(eventId, mappingError.message);
  const mappedNumbers = [...new Set((mappings ?? []).map((m) => Number(m.room_number)).filter(Number.isFinite))];
  if (!mappedNumbers.length) {
    return keepForReview(eventId, `Acomodação '${roomType}' ainda não possui quartos mapeados.`);
  }

  const { data: rooms, error: roomError } = await supabase
    .from("rooms")
    .select("numero,prioridade_venda,preco")
    .eq("company_id", companyId)
    .in("numero", mappedNumbers)
    .order("prioridade_venda", { ascending: true })
    .order("numero", { ascending: true });

  if (roomError) return keepForReview(eventId, roomError.message);
  if (!rooms?.length) return keepForReview(eventId, "Nenhum quarto mapeado foi encontrado no cadastro do hotel.");

  const { data: conflicts, error: conflictError } = await supabase
    .from("reservations")
    .select("quarto")
    .eq("company_id", companyId)
    .in("quarto", mappedNumbers)
    .in("status", ["reservado", "ocupado"])
    .lt("checkin", checkout)
    .gt("checkout", checkin);

  if (conflictError) return keepForReview(eventId, conflictError.message);
  const blocked = new Set((conflicts ?? []).map((r) => Number(r.quarto)));
  const selected = rooms.find((room) => !blocked.has(Number(room.numero)));
  if (!selected) {
    return keepForReview(eventId, `Nenhum quarto '${roomType}' está livre entre ${checkin} e ${checkout}.`);
  }

  const roomNumber = Number(selected.numero);
  const daily = Number((total / nights).toFixed(2));
  const note = `Reserva Booking ${bookingCode} criada automaticamente pela extensão. Categoria Booking: ${roomType}.`;

  const { data: reservation, error: insertError } = await supabase
    .from("reservations")
    .insert({
      quarto: roomNumber,
      cliente_nome: guestName,
      checkin,
      checkout,
      diarias: nights,
      valor_diaria: daily,
      valor_total: total,
      pagamento: "-",
      pago: false,
      status: "reservado",
      valor_pago: 0,
      pessoas: people,
      desconto: 0,
      canal: "Booking",
      company_id: companyId,
      codigo_externo: bookingCode,
      origem_importacao: "booking_extranet_chrome",
      observacoes_importacao: note,
    })
    .select("id,quarto,status,cliente_id,cliente_nome")
    .single();

  if (insertError) return keepForReview(eventId, `Falha ao criar reserva: ${insertError.message}`);

  const clientSync = await syncBookingClient(reservation, companyId, payload);
  if (clientSync.error) {
    return keepForReview(eventId, clientSync.error);
  }

  await markEvent(eventId, {
    status: "processed",
    reservation_id: reservation.id,
    previous_status: null,
    new_status: "reservado",
    processed_at: new Date().toISOString(),
    error: null,
  });

  return {
    status: "processed",
    auto_created: true,
    reservation_id: reservation.id,
    room_number: roomNumber,
  };
}

async function processCancellation(eventId: string, companyId: string, bookingCode: string, payload?: BookingPayload) {
  const match = await findReservation(companyId, bookingCode, payload);
  if (match.kind !== "unique" || !match.reservation) {
    const reason = match.kind === "multiple"
      ? "Mais de uma reserva corresponde ao cancelamento; revisão manual necessária."
      : "Reserva não localizada com segurança para o cancelamento.";
    await markEvent(eventId, { status: "needs_review", error: reason });
    return { status: "needs_review", reason };
  }

  const reservation = match.reservation;
  const total = parseGrossTotal(payload);
  const nights = daysBetween(reservation.checkin, reservation.checkout);
  const financialUpdates = total > 0
    ? {
        valor_total: total,
        ...(nights > 0 ? { valor_diaria: Number((total / nights).toFixed(2)) } : {}),
      }
    : {};
  if (reservation.status === "cancelado") {
    if (total > 0 && parseCurrency(reservation.valor_total) <= 0) {
      await supabase
        .from("reservations")
        .update(financialUpdates)
        .eq("id", reservation.id)
        .eq("company_id", companyId);
    }
    await markEvent(eventId, {
      status: "already_cancelled",
      reservation_id: reservation.id,
      previous_status: "cancelado",
      new_status: "cancelado",
      processed_at: new Date().toISOString(),
      error: null,
    });
    return { status: "already_cancelled", reservation_id: reservation.id };
  }

  if (reservation.status !== "reservado") {
    const reason = `Reserva encontrada, mas está com status ${reservation.status}; cancelamento não aplicado automaticamente.`;
    await markEvent(eventId, {
      status: "needs_review",
      reservation_id: reservation.id,
      previous_status: reservation.status,
      error: reason,
    });
    return { status: "needs_review", reservation_id: reservation.id, reason };
  }

  const note = `Cancelamento Booking ${bookingCode} recebido pela extensão em ${new Date().toISOString()}.`;
  const observations = [reservation.observacoes_importacao, note].filter(Boolean).join("\n");
  const { error: updateError } = await supabase
    .from("reservations")
    .update({ status: "cancelado", observacoes_importacao: observations, ...financialUpdates })
    .eq("id", reservation.id)
    .eq("company_id", companyId)
    .eq("status", "reservado");

  if (updateError) {
    await markEvent(eventId, {
      status: "error",
      reservation_id: reservation.id,
      previous_status: reservation.status,
      error: updateError.message,
    });
    return { status: "error", reservation_id: reservation.id, reason: updateError.message };
  }

  await markEvent(eventId, {
    status: "processed",
    reservation_id: reservation.id,
    previous_status: reservation.status,
    new_status: "cancelado",
    processed_at: new Date().toISOString(),
    error: null,
  });
  return { status: "processed", cancelled_locally: true, reservation_id: reservation.id };
}

async function findReservation(companyId: string, bookingCode: string, payload?: BookingPayload) {
  const { data: byCode, error: codeError } = await supabase
    .from("reservations")
    .select("id,status,cliente_id,cliente_nome,checkin,checkout,canal,codigo_externo,observacoes_importacao,valor_total,valor_diaria")
    .eq("company_id", companyId)
    .eq("codigo_externo", bookingCode)
    .limit(2);
  if (!codeError && byCode?.length === 1) return { kind: "unique", reservation: byCode[0] } as const;
  if (!codeError && (byCode?.length ?? 0) > 1) return { kind: "multiple" } as const;

  const checkin = parseBookingDate(payload?.checkin_text);
  const checkout = parseBookingDate(payload?.checkout_text);
  const guest = normalizeName(payload?.guest_name);
  if (!checkin || !checkout || !guest) return { kind: "none" } as const;

  const { data: candidates, error } = await supabase
    .from("reservations")
    .select("id,status,cliente_id,cliente_nome,checkin,checkout,canal,codigo_externo,observacoes_importacao,valor_total,valor_diaria")
    .eq("company_id", companyId)
    .eq("checkin", checkin)
    .eq("checkout", checkout)
    .ilike("canal", "Booking");
  if (error) return { kind: "none" } as const;

  const matched = (candidates ?? []).filter((row) => normalizeName(row.cliente_nome) === guest);
  if (matched.length === 1) return { kind: "unique", reservation: matched[0] } as const;
  if (matched.length > 1) return { kind: "multiple" } as const;

  const { data: overlapping, error: overlapError } = await supabase
    .from("reservations")
    .select("id,status,cliente_id,cliente_nome,checkin,checkout,canal,codigo_externo,observacoes_importacao,quarto,valor_total,valor_diaria")
    .eq("company_id", companyId)
    .in("status", ["reservado", "ocupado"])
    .lt("checkin", checkout)
    .gt("checkout", checkin)
    .ilike("canal", "Booking");
  if (overlapError) return { kind: "none" } as const;
  const overlappingGuest = (overlapping ?? []).filter((row) => normalizeName(row.cliente_nome) === guest);
  if (overlappingGuest.length === 1) return { kind: "unique", reservation: overlappingGuest[0] } as const;
  if (overlappingGuest.length > 1) return { kind: "multiple" } as const;
  return { kind: "none" } as const;
}

async function reconcileExistingReservation(reservation: any, companyId: string, bookingCode: string, payload?: BookingPayload) {
  const checkin = parseBookingDate(payload?.checkin_text);
  const checkout = parseBookingDate(payload?.checkout_text);
  const total = parseGrossTotal(payload);
  const people = parseGuests(payload?.guests_text);
  const updates: Record<string, unknown> = {};
  const legacyCode = String(reservation.codigo_externo ?? "").replace(/\D/g, "");

  if (!legacyCode || legacyCode.length < 8) updates.codigo_externo = bookingCode;
  if (checkin && checkout && checkin >= reservation.checkin && checkout <= reservation.checkout) {
    const nights = daysBetween(checkin, checkout);
    updates.checkin = checkin;
    updates.checkout = checkout;
    updates.diarias = nights;
    if (total > 0 && nights > 0) updates.valor_diaria = Number((total / nights).toFixed(2));
  }
  if (total > 0) updates.valor_total = total;
  if (people > 0) updates.pessoas = people;
  if (!Object.keys(updates).length) return { error: null };

  const { error } = await supabase
    .from("reservations")
    .update(updates)
    .eq("id", reservation.id)
    .eq("company_id", companyId);
  return { error: error ? `Falha ao atualizar a reserva existente: ${error.message}` : null };
}

async function syncBookingClient(reservation: any, companyId: string, payload?: BookingPayload) {
  const phone = normalizePhone(payload?.guest_phone);
  const guestName = nullable(payload?.guest_name) || nullable(reservation?.cliente_nome);
  if (!phone || !guestName) return { error: null, clientId: reservation?.cliente_id ?? null };

  if (reservation?.cliente_id) {
    const { data: linkedClient, error: linkedError } = await supabase
      .from("clients")
      .select("id,nome,telefone")
      .eq("company_id", companyId)
      .eq("id", reservation.cliente_id)
      .maybeSingle();
    if (linkedError) return { error: `Telefone capturado, mas o hóspede vinculado não pôde ser consultado: ${linkedError.message}` };
    if (linkedClient) {
      const currentPhone = normalizePhone(linkedClient.telefone);
      if (currentPhone && currentPhone !== phone) {
        return { error: "Telefone da Booking difere do telefone já cadastrado para este hóspede; revisão necessária." };
      }
      if (!currentPhone) {
        const { error: updateError } = await supabase
          .from("clients")
          .update({ telefone: phone })
          .eq("company_id", companyId)
          .eq("id", linkedClient.id);
        if (updateError) return { error: `Telefone capturado, mas não foi possível atualizar o hóspede: ${updateError.message}` };
      }
      return { error: null, clientId: linkedClient.id };
    }
  }

  const { data: candidates, error: clientError } = await supabase
    .from("clients")
    .select("id,nome,telefone")
    .eq("company_id", companyId)
    .limit(1000);
  if (clientError) return { error: `Telefone capturado, mas os hóspedes não puderam ser consultados: ${clientError.message}` };

  let client = (candidates ?? []).find((row) => normalizePhone(row.telefone) === phone) ?? null;
  if (!client) {
    const sameName = (candidates ?? []).filter((row) => normalizeName(row.nome) === normalizeName(guestName));
    const reusable = sameName.length === 1 && !normalizePhone(sameName[0].telefone) ? sameName[0] : null;
    if (reusable) {
      const { data: updated, error: updateError } = await supabase
        .from("clients")
        .update({ telefone: phone })
        .eq("company_id", companyId)
        .eq("id", reusable.id)
        .select("id,nome,telefone")
        .single();
      if (updateError) return { error: `Telefone capturado, mas não foi possível completar o hóspede: ${updateError.message}` };
      client = updated;
    }
  }

  if (!client) {
    const { data: created, error: createError } = await supabase
      .from("clients")
      .insert({ company_id: companyId, nome: guestName, telefone: phone })
      .select("id,nome,telefone")
      .single();
    if (createError) return { error: `Telefone capturado, mas não foi possível cadastrar o hóspede: ${createError.message}` };
    client = created;
  }

  const { error: linkError } = await supabase
    .from("reservations")
    .update({ cliente_id: client.id })
    .eq("company_id", companyId)
    .eq("id", reservation.id);
  if (linkError) return { error: `Hóspede identificado, mas não foi possível vinculá-lo à reserva: ${linkError.message}` };
  reservation.cliente_id = client.id;
  return { error: null, clientId: client.id };
}

async function keepForReview(eventId: string, reason: string) {
  await markEvent(eventId, { status: "needs_review", error: reason });
  return { status: "needs_review", reason };
}

async function markEvent(eventId: string, values: Record<string, unknown>) {
  await supabase.from("booking_browser_events").update(values).eq("id", eventId);
}

function parseBookingDate(value: unknown) {
  const text = String(value ?? "").toLocaleLowerCase("pt-BR");
  const match = text.match(/(\d{1,2})\s+de\s+([a-zç.]+)\s+de\s+(\d{4})/i);
  const months: Record<string, string> = {
    jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
    jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
    apr: "04", may: "05", aug: "08", sep: "09", oct: "10", dec: "12",
  };
  if (match) {
    const month = months[match[2].replace(/\./g, "").slice(0, 3)];
    return month ? `${match[3]}-${month}-${match[1].padStart(2, "0")}` : null;
  }
  const english = text.match(/\b([a-z]{3,9})\s+(\d{1,2}),\s*(\d{4})/i);
  if (!english) return null;
  const month = months[english[1].slice(0, 3)];
  return month ? `${english[3]}-${month}-${english[2].padStart(2, "0")}` : null;
}

function parseCurrency(value: unknown) {
  const text = String(value ?? "").trim().replace(/[^0-9,.-]/g, "");
  if (!text) return 0;
  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  let normalized = text;
  if (comma >= 0 && dot >= 0) normalized = comma > dot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  else if (comma >= 0) normalized = text.length - comma - 1 === 3 ? text.replace(/,/g, "") : text.replace(",", ".");
  else if (dot >= 0) normalized = text.length - dot - 1 === 3 ? text.replace(/\./g, "") : text;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function parseGrossTotal(payload?: BookingPayload) {
  const headline = parseCurrency(payload?.total_text);
  if (headline > 0) return headline;

  const raw = String(payload?.raw_excerpt ?? "").replace(/\u00a0/g, " ");
  for (const pattern of [
    /(?:preço total do quarto|total room price)\s*(R\$\s*[0-9][0-9.,]*)/i,
    /subtotal\s*(R\$\s*[0-9][0-9.,]*)/i,
  ]) {
    const match = raw.match(pattern);
    const amount = parseCurrency(match?.[1]);
    if (amount > 0) return amount;
  }
  return 0;
}

function formatCurrency(value: number) {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function parseGuests(value: unknown) {
  const text = String(value ?? "");
  const groups = [...text.matchAll(/(\d+)\s*(?:adult(?:o|os)?|adults?|crianças?|children|child)/gi)];
  const first = text.match(/\d+/);
  const count = groups.length
    ? groups.reduce((total, match) => total + Number(match[1]), 0)
    : first
      ? Number(first[0])
      : 1;
  return Number.isFinite(count) && count > 0 ? count : 1;
}

function daysBetween(checkin: string, checkout: string) {
  const start = Date.parse(`${checkin}T12:00:00Z`);
  const end = Date.parse(`${checkout}T12:00:00Z`);
  return Math.round((end - start) / 86400000);
}

function normalizeName(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizePhone(value: unknown) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

function cleanRoomType(value: unknown) {
  const text = String(value ?? "").trim();
  return text.replace(/\s+(?:cancelad[oa](?:\s+pelo\s+hóspede)?|cancell?ed(?:\s+by\s+guest)?)\s*$/i, "").trim() || null;
}

function isConfirmedCancellation(value: unknown) {
  return /cancelad[oa](?:\s+pelo\s+hóspede)?|cancelou\s+esta\s+reserva|cancell?ed\s+(?:this\s+booking|by\s+guest)/i.test(String(value ?? ""));
}

function nullable(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
  });
}
