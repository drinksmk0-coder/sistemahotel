import fs from "node:fs";

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`add-timeline-actions: trecho não encontrado (${label})`);
  return source.replace(before, after);
}

// Linha do tempo: ações operacionais contextualizadas por hospedagem.
{
  const path = "src/components/RoomTimeline.tsx";
  let src = fs.readFileSync(path, "utf8");

  src = replaceOnce(
    src,
    '  LogIn,\n  Sparkles,\n  WalletCards,',
    '  LogIn,\n  LogOut,\n  Pencil,\n  RotateCcw,\n  ShoppingCart,\n  Sparkles,\n  WalletCards,',
    "ícones",
  );

  src = replaceOnce(
    src,
    'import { fmtBRL, fmtDate, todayISO } from "@/lib/format";',
    'import { fmtBRL, fmtDate, hotelLocalTime, todayISO } from "@/lib/format";',
    "hora local",
  );

  src = replaceOnce(
    src,
    '  function handleCheckIn(reservation: Reservation) {\n    const account = buildGuestAccount(reservation, sales);',
    '  function handleCheckIn(reservation: Reservation) {\n    const todayLocal = todayISO();\n    const nowLocal = hotelLocalTime();\n    if (reservation.checkin > todayLocal) {\n      toast.error(`Check-in bloqueado: esta reserva começa em ${fmtDate(reservation.checkin)}.`);\n      return;\n    }\n    if (reservation.checkin === todayLocal && nowLocal < "12:00") {\n      toast.error("Check-in desta data liberado a partir das 12:00. Antes disso, ainda pertence à diária anterior.");\n      return;\n    }\n    const account = buildGuestAccount(reservation, sales);',
    "proteção check-in",
  );

  const anchor = '  function finishCheckout(reservation: Reservation) {';
  if (!src.includes('function undoCheckIn(reservation: Reservation)')) {
    src = src.replace(
      anchor,
      `  function undoCheckIn(reservation: Reservation) {\n    if (!window.confirm(\`Desfazer o check-in de \${reservation.cliente_nome}? A reserva voltará para Reservado.\`)) return;\n    setBusyReservationId(reservation.id);\n    updateReservation.mutate(\n      {\n        id: reservation.id,\n        patch: {\n          status: "reservado",\n          presence_status: null,\n          checkin_at: null,\n          horario_checkin: null,\n        },\n      },\n      {\n        onSuccess: () => {\n          updateRoomSituation.mutate(\n            { id: reservation.quarto, patch: { situacao: "reservado" } },\n            {\n              onSuccess: () => {\n                toast.success(\`Check-in de \${reservation.cliente_nome} desfeito.\`);\n                setBusyReservationId(null);\n              },\n              onError: (error: Error) => {\n                toast.error(\`Check-in desfeito, mas falhou ao atualizar o quarto: \${error.message}\`);\n                setBusyReservationId(null);\n              },\n            },\n          );\n        },\n        onError: (error: Error) => {\n          toast.error(error.message);\n          setBusyReservationId(null);\n        },\n      },\n    );\n  }\n\n  function toggleGuestAway(reservation: Reservation, isAway: boolean) {\n    setBusyReservationId(reservation.id);\n    updateReservation.mutate(\n      {\n        id: reservation.id,\n        patch: { presence_status: isAway ? null : "ausente_temporario" },\n      },\n      {\n        onSuccess: () => {\n          updateRoomSituation.mutate(\n            { id: reservation.quarto, patch: { situacao: isAway ? "ocupado" : "ausente_temporario" } },\n            {\n              onSuccess: () => {\n                toast.success(isAway ? \`\${reservation.cliente_nome} retornou ao hotel.\` : \`\${reservation.cliente_nome} marcado como saiu temporariamente.\`);\n                setBusyReservationId(null);\n              },\n              onError: (error: Error) => {\n                toast.error(\`Presença atualizada, mas falhou ao atualizar o quarto: \${error.message}\`);\n                setBusyReservationId(null);\n              },\n            },\n          );\n        },\n        onError: (error: Error) => {\n          toast.error(error.message);\n          setBusyReservationId(null);\n        },\n      },\n    );\n  }\n\n${anchor}`,
    );
  }

  src = replaceOnce(
    src,
    '                            {primaryAction}\n                          </div>',
    `                            <div className="flex shrink-0 items-center gap-0.5 pr-1">\n                              {primaryAction}\n                              <a\n                                href={\`/vendas?quarto=\${reservation.quarto}&data=\${saleDateForReservation(reservation, today)}\`}\n                                className="grid h-7 w-7 place-items-center rounded-md bg-black/10 transition hover:bg-black/20"\n                                title={\`Lançar venda para \${reservation.cliente_nome}\`}\n                                aria-label={\`Lançar venda para \${reservation.cliente_nome}\`}\n                              >\n                                <ShoppingCart className="h-3.5 w-3.5" />\n                              </a>\n                              <a\n                                href={\`/reservas?editar=\${reservation.id}\`}\n                                className="grid h-7 w-7 place-items-center rounded-md bg-black/10 transition hover:bg-black/20"\n                                title={\`Editar hospedagem de \${reservation.cliente_nome}\`}\n                                aria-label={\`Editar hospedagem de \${reservation.cliente_nome}\`}\n                              >\n                                <Pencil className="h-3.5 w-3.5" />\n                              </a>\n                              {checkedIn && reservation.status === "ocupado" && (\n                                <>\n                                  <button\n                                    type="button"\n                                    disabled={busy}\n                                    onClick={() => toggleGuestAway(reservation, temporarilyAway)}\n                                    className="grid h-7 w-7 place-items-center rounded-md bg-black/10 transition hover:bg-black/20 disabled:opacity-50"\n                                    title={temporarilyAway ? "Hóspede retornou" : "Hóspede saiu"}\n                                    aria-label={temporarilyAway ? \`Marcar retorno de \${reservation.cliente_nome}\` : \`Marcar saída temporária de \${reservation.cliente_nome}\`}\n                                  >\n                                    {temporarilyAway ? <LogIn className="h-3.5 w-3.5" /> : <LogOut className="h-3.5 w-3.5" />}\n                                  </button>\n                                  <button\n                                    type="button"\n                                    disabled={busy}\n                                    onClick={() => undoCheckIn(reservation)}\n                                    className="grid h-7 w-7 place-items-center rounded-md bg-black/10 transition hover:bg-black/20 disabled:opacity-50"\n                                    title="Desfazer check-in"\n                                    aria-label={\`Desfazer check-in de \${reservation.cliente_nome}\`}\n                                  >\n                                    <RotateCcw className="h-3.5 w-3.5" />\n                                  </button>\n                                </>\n                              )}\n                            </div>\n                          </div>`,
    "ações na hospedagem",
  );

  if (!src.includes("function saleDateForReservation(")) {
    src += `\n\nfunction saleDateForReservation(reservation: Reservation, today: string) {\n  if (reservation.checkin <= today && reservation.checkout > today) return today;\n  return addDaysISO(reservation.checkout, -1);\n}\n`;
  }

  fs.writeFileSync(path, src);
}

// Vendas: quando aberta pela timeline, respeitar a data enviada na URL.
{
  const path = "src/routes/_authenticated/vendas.tsx";
  let src = fs.readFileSync(path, "utf8");
  src = replaceOnce(
    src,
    '  const [buyerType, setBuyerType] = useState<"hospede" | "funcionario">("hospede");\n  const [saleDate, setSaleDate] = useState(todayISO());',
    '  const [buyerType, setBuyerType] = useState<"hospede" | "funcionario">("hospede");\n  const requestedSaleDate = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("data") : null;\n  const [saleDate, setSaleDate] = useState(requestedSaleDate && requestedSaleDate <= todayISO() ? requestedSaleDate : todayISO());',
    "data inicial pela timeline",
  );
  fs.writeFileSync(path, src);
}

console.log("add-timeline-actions: ações operacionais adicionadas à linha do tempo");
