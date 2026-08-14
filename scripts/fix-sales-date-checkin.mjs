import fs from "node:fs";

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`fix-sales-date-checkin: trecho não encontrado (${label})`);
  return source.replace(before, after);
}

// --- Vendas: data escolhível + associação histórica correta por quarto/data ---
{
  const path = "src/routes/_authenticated/vendas.tsx";
  let src = fs.readFileSync(path, "utf8");

  src = replaceOnce(
    src,
    'type PurchaseInput = { buyerType: "hospede" | "funcionario"; room: number | null; employeeName: string; payment: string; amountPaid: number; items: CartItem[] };',
    'type PurchaseInput = { buyerType: "hospede" | "funcionario"; saleDate: string; room: number | null; employeeName: string; payment: string; amountPaid: number; items: CartItem[] };',
    "PurchaseInput",
  );

  src = replaceOnce(
    src,
    '    const active = input.buyerType === "hospede" && input.room != null ? activeReservationForRoom(reservations, input.room) : null;\n    if (input.buyerType === "hospede" && !active) throw new Error("Selecione um quarto com hospedagem ativa.");',
    '    const active = input.buyerType === "hospede" && input.room != null ? reservationForRoomOnDate(reservations, input.room, input.saleDate) : null;\n    if (input.buyerType === "hospede" && !active) throw new Error(`Não há hóspede hospedado no quarto ${input.room ?? "—"} em ${fmtDate(input.saleDate)}.`);',
    "resolver hóspede por data",
  );

  src = replaceOnce(
    src,
    '        pagamento: input.payment, data: todayISO(),',
    '        pagamento: input.payment, data: input.saleDate,',
    "data da venda",
  );

  src = replaceOnce(
    src,
    '  const [buyerType, setBuyerType] = useState<"hospede" | "funcionario">("hospede");\n  const [room, setRoom] = useState<number | null>(initialRoom ?? rooms[0]?.numero ?? null);',
    '  const [buyerType, setBuyerType] = useState<"hospede" | "funcionario">("hospede");\n  const [saleDate, setSaleDate] = useState(todayISO());\n  const [room, setRoom] = useState<number | null>(initialRoom ?? rooms[0]?.numero ?? null);',
    "estado data venda",
  );

  src = replaceOnce(
    src,
    '  const active = room == null ? null : activeReservationForRoom(reservations, room);',
    '  const active = room == null ? null : reservationForRoomOnDate(reservations, room, saleDate);',
    "hóspede exibido por data",
  );

  src = replaceOnce(
    src,
    'try { await onSave({ buyerType, room, employeeName, payment, amountPaid: effectivePaid, items: cart }); }',
    'try { await onSave({ buyerType, saleDate, room, employeeName, payment, amountPaid: effectivePaid, items: cart }); }',
    "submit data",
  );

  src = replaceOnce(
    src,
    '    <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1"><button type="button" className={buyerType === "hospede" ? "btn-primary" : "btn-ghost"} onClick={() => setBuyerType("hospede")}><UserRound className="h-4 w-4" /> Hóspede</button><button type="button" className={buyerType === "funcionario" ? "btn-primary" : "btn-ghost"} onClick={() => setBuyerType("funcionario")}><UsersRound className="h-4 w-4" /> Funcionário</button></div>\n    {buyerType === "hospede" ?',
    '    <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1"><button type="button" className={buyerType === "hospede" ? "btn-primary" : "btn-ghost"} onClick={() => setBuyerType("hospede")}><UserRound className="h-4 w-4" /> Hóspede</button><button type="button" className={buyerType === "funcionario" ? "btn-primary" : "btn-ghost"} onClick={() => setBuyerType("funcionario")}><UsersRound className="h-4 w-4" /> Funcionário</button></div>\n    <Field label="Data da venda"><input type="date" className="field" value={saleDate} max={todayISO()} onChange={(e) => setSaleDate(e.target.value)} required /></Field>\n    {buyerType === "hospede" ?',
    "campo data venda",
  );

  if (!src.includes("function reservationForRoomOnDate(")) {
    src += `\n\nfunction reservationForRoomOnDate(reservations: any[], room: number, date: string) {\n  const candidates = reservations\n    .filter((r) =>\n      Number(r.quarto) === Number(room) &&\n      !["cancelado", "manutencao"].includes(String(r.status ?? "").toLowerCase()) &&\n      String(r.checkin ?? "") <= date &&\n      String(r.checkout ?? "") > date\n    )\n    .sort((a, b) => {\n      const priority = (r: any) => r.status === "ocupado" ? 3 : r.status === "saida_pendente" ? 2 : r.status === "finalizado" ? 1 : 0;\n      return priority(b) - priority(a) || String(b.checkin ?? "").localeCompare(String(a.checkin ?? ""));\n    });\n  return candidates[0] ?? null;\n}\n`;
  }

  // O helper antigo deixa de ser usado nesta tela.
  src = src.replace('activeReservationForRoom, ', '');
  fs.writeFileSync(path, src);
}

// --- Reservas: bloquear check-in antecipado + permitir desfazer ---
{
  const path = "src/routes/_authenticated/reservas.tsx";
  let src = fs.readFileSync(path, "utf8");

  src = replaceOnce(
    src,
    'import { fmtBRL, fmtDate, fmtTime, todayISO, downloadExcel } from "@/lib/format";',
    'import { fmtBRL, fmtDate, fmtTime, todayISO, hotelLocalTime, downloadExcel } from "@/lib/format";',
    "import hotelLocalTime",
  );

  src = replaceOnce(
    src,
    '      {reservation.status === "reservado" && (\n        <button\n          className="rounded-md bg-brick-bg px-2 py-1 text-xs font-semibold text-brick"\n          onClick={() =>\n            update.mutate(',
    '      {reservation.status === "reservado" && (\n        <button\n          className="rounded-md bg-brick-bg px-2 py-1 text-xs font-semibold text-brick"\n          onClick={() => {\n            const today = todayISO();\n            const now = hotelLocalTime();\n            if (reservation.checkin > today) {\n              toast.error(`Check-in bloqueado: esta reserva começa em ${fmtDate(reservation.checkin)}.`);\n              return;\n            }\n            if (reservation.checkin === today && now < "12:00") {\n              toast.error("Check-in desta data liberado a partir das 12:00. Antes disso, ainda pertence à diária anterior.");\n              return;\n            }\n            update.mutate(',
    "guard checkin",
  );

  src = replaceOnce(
    src,
    '                onError: (e: Error) => toast.error(e.message),\n              },\n            )\n          }\n          title={balance > 0 ? "O pagamento será acompanhado na conta do hóspede." : undefined}',
    '                onError: (e: Error) => toast.error(e.message),\n              },\n            );\n          }}\n          title={balance > 0 ? "O pagamento será acompanhado na conta do hóspede." : undefined}',
    "fecha guard checkin",
  );

  src = replaceOnce(
    src,
    '      {reservation.status === "ocupado" && (\n        <button\n          className="rounded-md bg-brass-bg px-2 py-1 text-xs font-bold text-pine-dark"\n          onClick={markGuestDeparted}',
    '      {reservation.status === "ocupado" && (\n        <button\n          className="rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground"\n          onClick={() => {\n            if (!window.confirm(`Desfazer o check-in de ${reservation.cliente_nome}? A reserva voltará para Reservado.`)) return;\n            update.mutate(\n              { id: reservation.id, patch: { status: "reservado", presence_status: null, checkin_at: null, horario_checkin: null } },\n              {\n                onSuccess: () => {\n                  updateRoom.mutate(\n                    { id: reservation.quarto, patch: { situacao: "reservado" } },\n                    { onError: (e: Error) => toast.error(`Check-in desfeito, mas falhou ao atualizar o quarto: ${e.message}`) },\n                  );\n                  toast.success("Check-in desfeito; a reserva voltou para Reservado.");\n                },\n                onError: (e: Error) => toast.error(e.message),\n              },\n            );\n          }}\n          title="Corrigir um check-in feito antes da hora ou por engano"\n        >\n          Desfazer check-in\n        </button>\n      )}\n      {reservation.status === "ocupado" && (\n        <button\n          className="rounded-md bg-brass-bg px-2 py-1 text-xs font-bold text-pine-dark"\n          onClick={markGuestDeparted}',
    "botão desfazer",
  );

  fs.writeFileSync(path, src);
}

console.log("fix-sales-date-checkin: aplicado");
