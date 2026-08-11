import fs from 'node:fs';

function replaceOnce(path, from, to) {
  let text = fs.readFileSync(path, 'utf8');
  if (!text.includes(from)) throw new Error(`Trecho não encontrado em ${path}`);
  text = text.replace(from, to);
  fs.writeFileSync(path, text);
}

// 1) Scanner: atualiza a lista após a IA alterar reserva/quarto no backend.
const scannerPath = 'src/components/GuestFormScanner.tsx';
replaceOnce(scannerPath,
  'import { useRef, useState } from "react";\n',
  'import { useRef, useState } from "react";\nimport { useQueryClient } from "@tanstack/react-query";\n'
);
replaceOnce(scannerPath,
  '  sexo?: string | null;\n};',
  '  sexo?: string | null;\n  quarto?: number | null;\n  data_checkin?: string | null;\n  horario_checkin?: string | null;\n  horario_checkin_confiavel?: boolean;\n  pagamento?: string | null;\n  pagamento_confiavel?: boolean;\n  valor_pago?: number | null;\n  valor_pago_confiavel?: boolean;\n};'
);
replaceOnce(scannerPath,
  '  const company = useCurrentCompany();\n  const [busy, setBusy] = useState(false);',
  '  const company = useCurrentCompany();\n  const queryClient = useQueryClient();\n  const [busy, setBusy] = useState(false);'
);
replaceOnce(scannerPath,
  '      onResult(data.guest as GuestScanResult);\n      toast.success("Ficha lida. Confira os dados antes de salvar.");',
  '      onResult(data.guest as GuestScanResult);\n      await Promise.all([\n        queryClient.invalidateQueries({ queryKey: ["reservations"] }),\n        queryClient.invalidateQueries({ queryKey: ["rooms"] }),\n      ]);\n      toast.success(\n        data.reservation_updated\n          ? "Ficha lida. Horário/pagamento aplicados e reserva atualizada automaticamente."\n          : "Ficha lida. Confira os dados antes de salvar.",\n      );'
);
replaceOnce(scannerPath,
  'Use o scanner apenas para hóspedes cuja ficha precise ser digitalizada e confira nome, documento e datas antes de salvar.',
  'Use o scanner apenas para hóspedes cuja ficha precise ser digitalizada. A IA também pode reconhecer horário de entrada e comprovantes visíveis (Pix, crédito ou débito e valor pago); campos incertos não são aplicados automaticamente.'
);

// 2) Backend: amplia leitura e aplica campos confiáveis na reserva correspondente.
const fnPath = 'supabase/functions/scan-guest-form/index.ts';
replaceOnce(fnPath,
`  "sexo": "feminino"|"masculino"|"outro"|null\n}\nSe houver CPF, copie os 11 dígitos exatamente como aparecem. Se a imagem estiver ilegível, use null no campo.`,
`  "sexo": "feminino"|"masculino"|"outro"|null,\n  "quarto": number|null,\n  "data_checkin": "YYYY-MM-DD"|null,\n  "horario_checkin": "HH:MM"|null,\n  "horario_checkin_confiavel": boolean,\n  "pagamento": "pix"|"crédito"|"débito"|"dinheiro"|"transferência"|null,\n  "pagamento_confiavel": boolean,\n  "valor_pago": number|null,\n  "valor_pago_confiavel": boolean\n}\nObserve também papéis, recibos ou comprovantes visíveis sobre/ao lado da ficha. Se estiver claramente escrito Pix, crédito ou débito, extraia a forma de pagamento; extraia o valor somente se ele estiver inequivocamente associado ao pagamento da hospedagem.\nMarque *_confiavel como true SOMENTE quando o campo estiver claramente legível e sem ambiguidade. Horário como 08:00/18:00 duvidoso deve ser null ou confiavel=false.\nSe houver CPF, copie os 11 dígitos exatamente como aparecem. Se a imagem estiver ilegível, use null no campo.`
);
replaceOnce(fnPath,
`      if (guest) {\n        return json(request, {\n          guest,\n          provider: "gemini",`,
`      if (guest) {\n        const reservationUpdate = await applyReservationScan(admin, companyId, guest);\n        return json(request, {\n          guest,\n          reservation_updated: reservationUpdate.updated,\n          reservation_id: reservationUpdate.reservation_id,\n          applied_fields: reservationUpdate.applied_fields,\n          provider: "gemini",`
);
replaceOnce(fnPath,
`      sexo: normalizeSex(value("sexo")),\n    };`,
`      sexo: normalizeSex(value("sexo")),\n      quarto: normalizeRoom(raw.quarto),\n      data_checkin: normalizeDate(value("data_checkin")),\n      horario_checkin: normalizeTime(value("horario_checkin")),\n      horario_checkin_confiavel: raw.horario_checkin_confiavel === true,\n      pagamento: normalizePayment(value("pagamento")),\n      pagamento_confiavel: raw.pagamento_confiavel === true,\n      valor_pago: normalizeMoney(raw.valor_pago),\n      valor_pago_confiavel: raw.valor_pago_confiavel === true,\n    };`
);
replaceOnce(fnPath,
`function normalizeMime(value: string) {`,
`async function applyReservationScan(admin: ReturnType<typeof createClient>, companyId: string, guest: RecordRow) {\n  const room = Number(guest.quarto);\n  if (!Number.isInteger(room) || room <= 0) return { updated: false, reservation_id: null, applied_fields: [] as string[] };\n\n  let query = admin\n    .from("reservations")\n    .select("id,cliente_nome,quarto,checkin,valor_total,valor_pago,status")\n    .eq("company_id", companyId)\n    .eq("quarto", room)\n    .in("status", ["reservado", "ocupado"])\n    .order("checkin", { ascending: false })\n    .limit(8);\n  if (guest.data_checkin) query = query.eq("checkin", String(guest.data_checkin));\n  const { data, error } = await query;\n  if (error || !data?.length) return { updated: false, reservation_id: null, applied_fields: [] as string[] };\n\n  const scannedName = normalizeName(String(guest.nome ?? ""));\n  const candidates = scannedName\n    ? data.filter((row) => normalizeName(String(row.cliente_nome ?? "")) === scannedName)\n    : data;\n  if (candidates.length !== 1) return { updated: false, reservation_id: null, applied_fields: [] as string[] };\n\n  const reservation = candidates[0] as RecordRow;\n  const patch: RecordRow = {};\n  const applied: string[] = [];\n  if (guest.horario_checkin_confiavel === true && guest.horario_checkin) {\n    patch.horario_checkin = guest.horario_checkin;\n    patch.status = "ocupado";\n    patch.presence_status = "no_hotel";\n    patch.checkin_at = new Date().toISOString();\n    applied.push("horario_checkin", "checkin");\n  }\n  if (guest.pagamento_confiavel === true && guest.pagamento) {\n    patch.pagamento = guest.pagamento;\n    applied.push("pagamento");\n  }\n  if (guest.valor_pago_confiavel === true && typeof guest.valor_pago === "number") {\n    const paid = Math.max(0, guest.valor_pago);\n    patch.valor_pago = paid;\n    patch.pago = Number(reservation.valor_total ?? 0) > 0 && paid >= Number(reservation.valor_total ?? 0);\n    applied.push("valor_pago");\n  }\n  if (!applied.length) return { updated: false, reservation_id: reservation.id, applied_fields: [] as string[] };\n\n  const updated = await admin.from("reservations").update(patch).eq("id", reservation.id).eq("company_id", companyId);\n  if (updated.error) return { updated: false, reservation_id: reservation.id, applied_fields: [] as string[] };\n  if (patch.status === "ocupado") {\n    await admin.from("rooms").update({ situacao: "ocupado" }).eq("company_id", companyId).eq("numero", room);\n  }\n  return { updated: true, reservation_id: reservation.id, applied_fields: applied };\n}\n\nfunction normalizeName(value: string) {\n  return value.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\\s+/g, " ").trim();\n}\nfunction normalizeRoom(value: unknown) {\n  const n = Number(value);\n  return Number.isInteger(n) && n > 0 ? n : null;\n}\nfunction normalizeTime(value: string | null) {\n  if (!value) return null;\n  const match = value.match(/^([01]\\d|2[0-3]):([0-5]\\d)$/);\n  return match ? match[0] : null;\n}\nfunction normalizePayment(value: string | null) {\n  const clean = String(value ?? "").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase().trim();\n  if (clean === "pix") return "pix";\n  if (clean.includes("credito")) return "crédito";\n  if (clean.includes("debito")) return "débito";\n  if (clean.includes("dinheiro")) return "dinheiro";\n  if (clean.includes("transfer")) return "transferência";\n  return null;\n}\nfunction normalizeMoney(value: unknown) {\n  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 100) / 100;\n  if (typeof value !== "string") return null;\n  const parsed = Number(value.replace(/\\./g, "").replace(",", ".").replace(/[^\\d.-]/g, ""));\n  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;\n}\n\nfunction normalizeMime(value: string) {`
);

// 3) Reservas: restaura o botão de saída física sem apagar saldo pendente.
const reservationsPath = 'src/routes/_authenticated/reservas.tsx';
replaceOnce(reservationsPath,
`  function finishCheckout(\n    extraPatch: Record<string, unknown> = {},`,
`  function markGuestDeparted() {\n    update.mutate(\n      {\n        id: reservation.id,\n        patch: {\n          status: "saida_pendente",\n          presence_status: "checkout",\n          horario_checkout: currentTime(),\n          checkout_at: new Date().toISOString(),\n        },\n      },\n      {\n        onSuccess: () => {\n          updateRoom.mutate(\n            { id: reservation.quarto, patch: { situacao: "limpeza" } },\n            { onError: (e: Error) => toast.error(\`Saída registrada, mas falhou ao enviar o quarto para limpeza: \${e.message}\`) },\n          );\n          toast.success(balance > 0 ? \`Hóspede saiu. Saldo pendente: \${fmtBRL(balance)}.\` : "Hóspede saiu; quarto enviado para limpeza.");\n        },\n        onError: (e: Error) => toast.error(e.message),\n      },\n    );\n  }\n\n  function finishCheckout(\n    extraPatch: Record<string, unknown> = {},`
);
replaceOnce(reservationsPath,
`      {departureStage && (\n        <button\n          className="rounded-md bg-slate-bg px-2 py-1 text-xs font-semibold text-slate"`,
`      {reservation.status === "ocupado" && (\n        <button\n          className="rounded-md bg-brass-bg px-2 py-1 text-xs font-bold text-pine-dark"\n          onClick={markGuestDeparted}\n          title="Registrar que o hóspede deixou fisicamente o hotel; a conta pode continuar pendente"\n        >\n          O hóspede saiu\n        </button>\n      )}\n      {departureStage && (\n        <button\n          className="rounded-md bg-slate-bg px-2 py-1 text-xs font-semibold text-slate"`
);

console.log('Correções aplicadas.');
