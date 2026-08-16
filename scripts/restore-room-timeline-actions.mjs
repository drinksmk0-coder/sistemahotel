import fs from "node:fs";

const path = "src/components/RoomTimeline.tsx";
let source = fs.readFileSync(path, "utf8");

function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`restore-room-timeline-actions: trecho não encontrado (${label})`);
  source = source.replace(before, after);
}

replaceOnce(
  '  Building2,\n  CalendarDays,',
  '  ArrowRightLeft,\n  Building2,\n  CalendarDays,',
  "ícone de troca de quarto",
);

replaceOnce(
  'import { GuestPaymentModal } from "@/components/GuestPaymentModal";',
  'import { GuestPaymentModal } from "@/components/GuestPaymentModal";\nimport { Modal } from "@/components/ui-kit";',
  "modal",
);

replaceOnce(
  '  const [paymentReservation, setPaymentReservation] = useState<Reservation | null>(null);\n  const [companyBillingReservation, setCompanyBillingReservation] = useState<Reservation | null>(null);',
  '  const [paymentReservation, setPaymentReservation] = useState<Reservation | null>(null);\n  const [movingReservation, setMovingReservation] = useState<Reservation | null>(null);\n  const [companyBillingReservation, setCompanyBillingReservation] = useState<Reservation | null>(null);',
  "estado da troca de quarto",
);

const checkoutAnchor = '  function finishCheckout(reservation: Reservation) {';
if (!source.includes('function moveReservationToRoom(destination: Room)')) {
  if (!source.includes(checkoutAnchor)) throw new Error("âncora do checkout não encontrada");
  source = source.replace(
    checkoutAnchor,
    `  async function moveReservationToRoom(destination: Room) {\n    const reservation = movingReservation;\n    if (!reservation || destination.numero === reservation.quarto) return;\n\n    const available = roomAvailableForMove(destination, reservation, reservations);\n    if (!available) {\n      toast.error(\`O quarto \${destination.numero} não está disponível para todo o período desta hospedagem.\`);\n      return;\n    }\n\n    if (!window.confirm(\`Trocar \${reservation.cliente_nome} do quarto \${reservation.quarto} para o quarto \${destination.numero}? O quarto atual será enviado para limpeza.\`)) return;\n\n    setBusyReservationId(reservation.id);\n    try {\n      await updateReservation.mutateAsync({\n        id: reservation.id,\n        patch: { quarto: destination.numero },\n      });\n      await updateRoomSituation.mutateAsync({\n        id: destination.numero,\n        patch: { situacao: \"ocupado\" },\n      });\n      await updateRoomSituation.mutateAsync({\n        id: reservation.quarto,\n        patch: { situacao: \"limpeza\" },\n      });\n      toast.success(\`Hóspede transferido do quarto \${reservation.quarto} para o quarto \${destination.numero}.\`);\n      setMovingReservation(null);\n    } catch (error) {\n      toast.error(error instanceof Error ? error.message : \"Não foi possível trocar o quarto.\");\n    } finally {\n      setBusyReservationId(null);\n    }\n  }\n\n${checkoutAnchor}`,
  );
}

replaceOnce(
  '                        const checkoutDue = checkedIn && today >= reservation.checkout;\n                        const visual = reservationVisual(reservation, today, temporarilyAway, account.balance, account.total, account.paid);',
  '                        const visual = reservationVisual(reservation, today, temporarilyAway, account.balance, account.total, account.paid);',
  "remove condicionamento do checkout pela data",
);

const oldPrimary = `                        } else if (checkoutDue && !["finalizado", "cancelado"].includes(reservation.status)) {\n                          if (account.balance > 0.009) {\n                            primaryAction = company ? (\n                              <PrimaryAction icon={<Building2 className="h-3.5 w-3.5" />} label="Faturar" title="Revisar conta, faturar empresa e concluir check-out" onClick={() => setCompanyBillingReservation(reservation)} />\n                            ) : (\n                              <PrimaryAction icon={<CircleDollarSign className="h-3.5 w-3.5" />} label="Revisar conta" title={\`Há \${fmtBRL(account.balance)} pendente antes do check-out\`} onClick={() => setPaymentReservation(reservation)} />\n                            );\n                          } else {\n                            primaryAction = (\n                              <PrimaryAction icon={<DoorOpen className="h-3.5 w-3.5" />} label="Check-out" title="Conta revisada e quitada: concluir check-out" disabled={busy} onClick={() => finishCheckout(reservation)} />\n                            );\n                          }\n                        }`;

const newPrimary = `                        } else if (checkedIn && !["finalizado", "cancelado"].includes(reservation.status)) {\n                          primaryAction = (\n                            <PrimaryAction\n                              icon={<DoorOpen className="h-3.5 w-3.5" />}\n                              label="Check-out"\n                              title={account.balance > 0.009 ? \`Revisar \${fmtBRL(account.balance)} pendente e concluir check-out\` : "Concluir check-out"}\n                              disabled={busy}\n                              onClick={() => finishCheckout(reservation)}\n                            />\n                          );\n                        }`;
replaceOnce(oldPrimary, newPrimary, "checkout sempre disponível após check-in");

replaceOnce(
  '                            {primaryAction}\n                          </div>',
  `                            {checkedIn && !["finalizado", "cancelado"].includes(reservation.status) && (\n                              <PrimaryAction\n                                icon={<ArrowRightLeft className="h-3.5 w-3.5" />}\n                                label="Trocar"\n                                title="Trocar hóspede de quarto"\n                                disabled={busy}\n                                onClick={() => setMovingReservation(reservation)}\n                              />\n                            )}\n                            {primaryAction}\n                          </div>`,
  "botão trocar quarto na barra da timeline",
);

replaceOnce(
  '      {paymentAccount && <GuestPaymentModal account={paymentAccount} onClose={() => setPaymentReservation(null)} />}\n\n      {companyBillingReservation && companyBillingAccount && (',
  `      {movingReservation && (\n        <Modal\n          open\n          onClose={() => setMovingReservation(null)}\n          title={\`Trocar quarto — \${movingReservation.cliente_nome}\`}\n        >\n          <div className="space-y-3">\n            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">\n              <strong>Quarto atual: {movingReservation.quarto}</strong>\n              <p className="mt-1 text-xs text-muted-foreground">\n                Escolha um quarto sem conflito no período {fmtDate(movingReservation.checkin)} → {fmtDate(movingReservation.checkout)}.\n                Depois da troca, o quarto atual vai para limpeza.\n              </p>\n            </div>\n            <div className="grid max-h-[52vh] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">\n              {rooms\n                .filter((room) => roomAvailableForMove(room, movingReservation, reservations))\n                .sort((a, b) => a.numero - b.numero)\n                .map((room) => (\n                  <button\n                    key={room.numero}\n                    type="button"\n                    disabled={busyReservationId === movingReservation.id}\n                    onClick={() => void moveReservationToRoom(room)}\n                    className="rounded-lg border border-border bg-card p-3 text-left transition hover:border-primary hover:bg-primary/5 disabled:opacity-50"\n                  >\n                    <strong className="block text-sm text-pine-dark">Quarto {room.numero}</strong>\n                    <span className="text-xs text-muted-foreground">{room.configuracao || `${room.andar}º andar`} · {fmtBRL(room.preco)}</span>\n                  </button>\n                ))}\n            </div>\n            {!rooms.some((room) => roomAvailableForMove(room, movingReservation, reservations)) && (\n              <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">\n                Nenhum outro quarto está livre para todo o período desta hospedagem.\n              </div>\n            )}\n          </div>\n        </Modal>\n      )}\n\n      {paymentAccount && <GuestPaymentModal account={paymentAccount} onClose={() => setPaymentReservation(null)} />}\n\n      {companyBillingReservation && companyBillingAccount && (`,
  "modal de troca",
);

if (!source.includes('function roomAvailableForMove(')) {
  source += `\n\nfunction roomAvailableForMove(room: Room, reservation: Reservation, reservations: Reservation[]) {\n  if (room.numero === reservation.quarto) return false;\n  if ([\"manutencao\", \"limpeza\", \"ocupado\", \"ausente_temporario\"].includes(String(room.situacao ?? \"\"))) return false;\n\n  return !reservations.some((other) =>\n    other.id !== reservation.id &&\n    other.quarto === room.numero &&\n    other.status !== \"cancelado\" &&\n    other.checkin <= reservation.checkout &&\n    other.checkout >= reservation.checkin\n  );\n}\n`;
}

if (!source.includes('label="Trocar"') || !source.includes('label="Check-out"')) {
  throw new Error("ações solicitadas não foram restauradas");
}

fs.writeFileSync(path, source);
console.log("Linha do tempo: Trocar de quarto e Check-out restaurados sem redesenhar o mapa.");
