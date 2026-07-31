import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function write(path, content) {
  fs.writeFileSync(path, content);
}

function replaceLiteral(path, before, after, count = 1) {
  const source = read(path);
  const occurrences = source.split(before).length - 1;
  if (occurrences !== count) {
    throw new Error(`${path}: esperado ${count} ocorrência(s), encontrado ${occurrences}`);
  }
  write(path, source.split(before).join(after));
}

function replaceRegex(path, regex, after) {
  const source = read(path);
  const matches = source.match(regex);
  if (!matches || matches.length !== 1) {
    throw new Error(`${path}: trecho regex não encontrado de forma única: ${regex}`);
  }
  write(path, source.replace(regex, after));
}

const reservations = "src/routes/_authenticated/reservas.tsx";

replaceLiteral(
  reservations,
  'import { ExportPeriodButton, type ExportScope } from "@/components/ExportPeriodButton";\n',
  'import { ExportPeriodButton, type ExportScope } from "@/components/ExportPeriodButton";\nimport {\n  CompanyBillingCheckoutModal,\n  type CompanyBillingCheckout,\n} from "@/components/CompanyBillingCheckoutModal";\n',
);

replaceLiteral(
  reservations,
  '  ocupado: "brick",\n  finalizado: "slate",',
  '  ocupado: "brick",\n  saida_pendente: "brass",\n  finalizado: "slate",',
);

replaceLiteral(
  reservations,
  '  const [filter, setFilter] = useState("ativas");\n  const [search, setSearch] = useState("");\n',
  '  const [filter, setFilter] = useState("ativas");\n  const [search, setSearch] = useState("");\n  const overdueDepartures = reservations.filter(\n    (reservation) =>\n      reservation.status === "saida_pendente" ||\n      (reservation.status === "ocupado" && reservation.checkout < todayISO()),\n  );\n',
);

replaceLiteral(
  reservations,
  '    else if (filter === "pendencias")\n      filteredRows = reservations.filter(\n        (reservation) =>\n          reservation.status !== "cancelado" &&\n          reservation.status !== "manutencao" &&\n          reservation.checkout < todayISO() &&\n          buildGuestAccount(reservation, sales).balance > 0,\n      );\n    else if (filter === "todas") filteredRows = reservations;',
  '    else if (filter === "pendencias")\n      filteredRows = reservations.filter(\n        (reservation) =>\n          reservation.status !== "cancelado" &&\n          reservation.status !== "manutencao" &&\n          reservation.checkout < todayISO() &&\n          buildGuestAccount(reservation, sales).balance > 0,\n      );\n    else if (filter === "saidas")\n      filteredRows = reservations.filter(\n        (reservation) =>\n          reservation.status === "saida_pendente" ||\n          (reservation.status === "ocupado" && reservation.checkout < todayISO()),\n      );\n    else if (filter === "todas") filteredRows = reservations;',
);

replaceLiteral(
  reservations,
  '        reservation.canal,\n        reservation.status,\n',
  '        reservation.canal,\n        reservation.status,\n        reservation.billing_company_name,\n',
);

replaceLiteral(
  reservations,
  '      />\n\n      <div className="mb-3 flex flex-col gap-2 rounded-xl border border-border bg-card p-2.5 shadow-sm lg:flex-row lg:items-center">',
  '      />\n\n      {overdueDepartures.length > 0 && (\n        <button\n          type="button"\n          className="mb-2 flex w-full items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-left text-sm text-amber-950 shadow-sm"\n          onClick={() => setFilter("saidas")}\n        >\n          <span>\n            <strong>{overdueDepartures.length} saída(s) aguardando conferência.</strong> O quarto\n            deixa de ficar ocupado automaticamente, mas a conta continua pendente até a baixa.\n          </span>\n          <span className="shrink-0 rounded-full bg-amber-200 px-2.5 py-1 text-xs font-bold">\n            Ver saídas\n          </span>\n        </button>\n      )}\n\n      <div className="mb-3 flex flex-col gap-2 rounded-xl border border-border bg-card p-2.5 shadow-sm lg:flex-row lg:items-center">',
);

replaceLiteral(
  reservations,
  '["ativas", "pendencias", "reservado", "ocupado", "finalizado", "todas"]',
  '["ativas", "saidas", "pendencias", "reservado", "ocupado", "finalizado", "todas"]',
);

replaceLiteral(
  reservations,
  '                const needsAttention =\n                  r.status !== "cancelado" &&\n                  r.status !== "manutencao" &&\n                  daysOverdue > 0 &&\n                  account.balance > 0;\n',
  '                const rowDeparturePending =\n                  r.status === "saida_pendente" ||\n                  (r.status === "ocupado" && daysOverdue > 0);\n                const companyBillingPending =\n                  r.billing_responsibility === "company" && account.balance > 0;\n                const needsAttention =\n                  r.status !== "cancelado" &&\n                  r.status !== "manutencao" &&\n                  (rowDeparturePending || (daysOverdue > 0 && account.balance > 0));\n',
);

replaceLiteral(
  reservations,
  '                      </span>\n                      {needsAttention && (',
  '                      </span>\n                      {companyBillingPending && (\n                        <span className="mt-0.5 block text-[9px] font-bold text-primary">\n                          Empresa: {r.billing_company_name || "não identificada"}\n                          {r.billing_due_date ? ` · vence ${fmtDate(r.billing_due_date)}` : ""}\n                        </span>\n                      )}\n                      {needsAttention && (',
);

replaceLiteral(
  reservations,
  '                          {r.status === "finalizado"\n                            ? "Checkout com saldo"\n                            : r.status === "ocupado"\n                              ? "Estadia vencida"\n                              : "Reserva vencida"}',
  '                          {companyBillingPending\n                            ? "A receber da empresa"\n                            : rowDeparturePending\n                              ? "Saída pendente de conferência"\n                              : r.status === "finalizado"\n                                ? "Checkout com saldo"\n                                : "Reserva vencida"}',
);

replaceLiteral(
  reservations,
  '<Badge tone={statusTone[r.status]}>{r.status}</Badge>',
  '<Badge tone={statusTone[r.status]}>\n                        {r.status === "saida_pendente" ? "saída pendente" : r.status}\n                      </Badge>',
);

replaceLiteral(
  reservations,
  '  const done = ["finalizado", "cancelado"].includes(reservation.status);\n  const total = Number(reservation.valor_total);\n  const balance = account.balance;\n  const [paymentOpen, setPaymentOpen] = useState(false);\n  const receiptUrl = whatsappReceiptUrl(reservation, client);\n  const reviewUrl = whatsappReviewUrl(reservation, client);\n  return (',
  '  const done = ["finalizado", "cancelado"].includes(reservation.status);\n  const departureStage = ["ocupado", "saida_pendente"].includes(reservation.status);\n  const total = Number(reservation.valor_total);\n  const balance = account.balance;\n  const [paymentOpen, setPaymentOpen] = useState(false);\n  const [companyBillingOpen, setCompanyBillingOpen] = useState(false);\n  const [companyBillingBusy, setCompanyBillingBusy] = useState(false);\n  const receiptUrl = whatsappReceiptUrl(reservation, client);\n  const reviewUrl = whatsappReviewUrl(reservation, client);\n\n  function finishCheckout(\n    extraPatch: Record<string, unknown> = {},\n    options?: { companyBilling?: boolean },\n  ) {\n    if (options?.companyBilling) setCompanyBillingBusy(true);\n    update.mutate(\n      {\n        id: reservation.id,\n        patch: {\n          status: "finalizado",\n          horario_checkout: reservation.horario_checkout ?? currentTime(),\n          checkout_at: new Date().toISOString(),\n          ...extraPatch,\n        },\n      },\n      {\n        onSuccess: () => {\n          updateRoom.mutate(\n            { id: reservation.quarto, patch: { situacao: "limpeza" } },\n            {\n              onSuccess: () => {\n                toast.success(\n                  options?.companyBilling\n                    ? "Check-out realizado; saldo enviado para contas a receber da empresa."\n                    : "Check-out realizado; quarto enviado para limpeza",\n                );\n                setCompanyBillingOpen(false);\n                setCompanyBillingBusy(false);\n              },\n              onError: (e: Error) => {\n                toast.error(`Check-out feito, mas falhou ao marcar limpeza: ${e.message}`);\n                setCompanyBillingOpen(false);\n                setCompanyBillingBusy(false);\n              },\n            },\n          );\n        },\n        onError: (e: Error) => {\n          toast.error(e.message);\n          setCompanyBillingBusy(false);\n        },\n      },\n    );\n  }\n\n  return (',
);

replaceLiteral(
  reservations,
  '      {reservation.status === "reservado" && (\n        <button\n          className="rounded-md bg-brick-bg px-2 py-1 text-xs font-semibold text-brick"\n          onClick={() => {\n            if (account.lodgingPaid < account.lodgingTotal) {\n              toast.error(\n                `Check-in bloqueado: receba ${fmtBRL(account.lodgingTotal - account.lodgingPaid)} das diárias primeiro.`,\n              );\n              setPaymentOpen(true);\n              return;\n            }\n            update.mutate(\n              {\n                id: reservation.id,\n                patch: {\n                  status: "ocupado",\n                  checkin_at: reservation.checkin_at ?? new Date().toISOString(),\n                  horario_checkin: reservation.horario_checkin ?? currentTime(),\n                },\n              },\n              {\n                onSuccess: () => toast.success("Check-in realizado"),\n                onError: (e: Error) => toast.error(e.message),\n              },\n            );\n          }}\n        >\n          {account.lodgingPaid < account.lodgingTotal ? "Receber antes do check-in" : "Check-in"}\n        </button>\n      )}',
  '      {reservation.status === "reservado" && (\n        <button\n          className="rounded-md bg-brick-bg px-2 py-1 text-xs font-semibold text-brick"\n          onClick={() =>\n            update.mutate(\n              {\n                id: reservation.id,\n                patch: {\n                  status: "ocupado",\n                  checkin_at: reservation.checkin_at ?? new Date().toISOString(),\n                  horario_checkin: reservation.horario_checkin ?? currentTime(),\n                },\n              },\n              {\n                onSuccess: () =>\n                  toast.success(\n                    balance > 0\n                      ? `Check-in realizado com saldo pendente de ${fmtBRL(balance)}.`\n                      : "Check-in realizado",\n                  ),\n                onError: (e: Error) => toast.error(e.message),\n              },\n            )\n          }\n          title={balance > 0 ? "O pagamento será acompanhado na conta do hóspede." : undefined}\n        >\n          Check-in\n        </button>\n      )}',
);

replaceLiteral(
  reservations,
  '      {reservation.status === "ocupado" && (\n        <button\n          className="rounded-md bg-slate-bg px-2 py-1 text-xs font-semibold text-slate"\n          onClick={() => {\n            if (balance > 0) {\n              toast.error(`Check-out bloqueado: ainda faltam ${fmtBRL(balance)} na conta.`);\n              setPaymentOpen(true);\n              return;\n            }\n            update.mutate(\n              {\n                id: reservation.id,\n                patch: {\n                  status: "finalizado",\n                  horario_checkout: reservation.horario_checkout ?? currentTime(),\n                },\n              },\n              {\n                onSuccess: () => {\n                  updateRoom.mutate(\n                    { id: reservation.quarto, patch: { situacao: "limpeza" } },\n                    {\n                      onSuccess: () =>\n                        toast.success("Check-out realizado; quarto enviado para limpeza"),\n                      onError: (e: Error) =>\n                        toast.error(`Check-out feito, mas falhou ao marcar limpeza: ${e.message}`),\n                    },\n                  );\n                },\n                onError: (e: Error) => toast.error(e.message),\n              },\n            );\n          }}\n        >\n          {balance > 0 ? "Receber antes do check-out" : "Check-out"}\n        </button>\n      )}',
  '      {departureStage && (\n        <button\n          className="rounded-md bg-slate-bg px-2 py-1 text-xs font-semibold text-slate"\n          onClick={() => {\n            if (balance > 0) {\n              toast.error(\n                `Check-out bloqueado: faltam ${fmtBRL(balance)}. Receba a conta ou use “Faturar empresa”.`,\n              );\n              setPaymentOpen(true);\n              return;\n            }\n            finishCheckout({\n              billing_status:\n                reservation.billing_responsibility === "company" ? "paid" : "not_applicable",\n            });\n          }}\n        >\n          {balance > 0 ? "Receber antes do check-out" : "Check-out"}\n        </button>\n      )}\n      {departureStage && balance > 0 && (\n        <button\n          className="rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary"\n          onClick={() => setCompanyBillingOpen(true)}\n          title="Concluir a saída mantendo o saldo a receber da empresa"\n        >\n          Faturar empresa\n        </button>\n      )}',
);

replaceLiteral(
  reservations,
  '      {reservation.status === "ocupado" && (',
  '      {departureStage && (',
);

replaceLiteral(
  reservations,
  '      {paymentOpen && <GuestPaymentModal account={account} onClose={() => setPaymentOpen(false)} />}\n    </div>',
  '      {paymentOpen && <GuestPaymentModal account={account} onClose={() => setPaymentOpen(false)} />}\n      {companyBillingOpen && (\n        <CompanyBillingCheckoutModal\n          reservation={reservation}\n          balance={balance}\n          busy={companyBillingBusy}\n          onClose={() => setCompanyBillingOpen(false)}\n          onConfirm={(billing: CompanyBillingCheckout) =>\n            finishCheckout(billing, { companyBilling: true })\n          }\n        />\n      )}\n    </div>',
);

const dataPath = "src/lib/data.ts";
replaceLiteral(
  dataPath,
  'export type Reservation = Tables<"reservations"> &\n  TenantRow & {\n    group_id?: string | null;\n  };',
  'export type Reservation = Tables<"reservations"> &\n  TenantRow & {\n    group_id?: string | null;\n    origem_importacao?: string | null;\n    observacoes_importacao?: string | null;\n    billing_responsibility?: "guest" | "company";\n    billing_company_name?: string | null;\n    billing_company_document?: string | null;\n    billing_company_email?: string | null;\n    billing_due_date?: string | null;\n    billing_status?: "not_applicable" | "pending" | "paid" | "overdue";\n    checkout_at?: string | null;\n  };',
);
replaceLiteral(
  dataPath,
  '        r.status !== "manutencao" &&\n        r.checkin <= today &&',
  '        r.status !== "manutencao" &&\n        r.status !== "saida_pendente" &&\n        r.checkin <= today &&',
);
replaceLiteral(
  dataPath,
  '  else if (reservation.status === "ocupado" && reservation.checkout < today)\n    state = "estadia_vencida";',
  '  else if (\n    (reservation.status === "ocupado" || reservation.status === "saida_pendente") &&\n    reservation.checkout < today\n  )\n    state = "estadia_vencida";',
);
replaceLiteral(
  dataPath,
  '// Derive the reservation status from how much was paid:\n// full payment -> ocupado, partial/none -> reservado.\nexport function statusFromPayment(valorTotal: number, valorPago: number): "ocupado" | "reservado" {\n  return valorTotal > 0 && valorPago >= valorTotal ? "ocupado" : "reservado";\n}',
  '// Pagamento e presença são estados diferentes. Uma reserva só vira ocupada no check-in manual.\nexport function statusFromPayment(_valorTotal: number, _valorPago: number): "ocupado" | "reservado" {\n  return "reservado";\n}',
);

const formPath = "src/components/ReservaForm.tsx";
replaceLiteral(
  formPath,
  '            Pagar total (ocupado)',
  '            Registrar pagamento total',
);

console.log("Atualizações de reservas aplicadas com sucesso.");
