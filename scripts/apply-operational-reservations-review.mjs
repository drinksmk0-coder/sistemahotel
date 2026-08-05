import fs from 'node:fs';

const path = 'src/routes/_authenticated/reservas.tsx';
let source = fs.readFileSync(path, 'utf8');

function replaceOnce(search, replacement, label) {
  if (!source.includes(search)) {
    throw new Error(`Trecho não encontrado: ${label}`);
  }
  source = source.replace(search, replacement);
}

replaceOnce(
  '  const [filter, setFilter] = useState("ativas");\n  const [search, setSearch] = useState("");',
  '  const [filter, setFilter] = useState("ativas");\n  const [search, setSearch] = useState("");\n  const [dateFilter, setDateFilter] = useState("");',
  'estado do filtro por data',
);

replaceOnce(
  '    const term = search.trim().toLocaleLowerCase("pt-BR");\n    if (!term) return filteredRows;\n    return filteredRows.filter((reservation) =>\n      [',
  '    if (dateFilter) {\n      filteredRows = filteredRows.filter(\n        (reservation) => reservation.checkin <= dateFilter && reservation.checkout >= dateFilter,\n      );\n    }\n\n    const term = search.trim().toLocaleLowerCase("pt-BR");\n    if (!term) return filteredRows;\n    return filteredRows.filter((reservation) =>\n      [',
  'aplicação do filtro por data',
);

replaceOnce(
  '  }, [reservations, sales, filter, search]);',
  '  }, [reservations, sales, filter, search, dateFilter]);',
  'dependências do filtro',
);

replaceOnce(
  '        <div className="flex flex-wrap gap-1 text-xs">\n          {["ativas", "saidas", "pendencias", "reservado", "ocupado", "finalizado", "todas"].map((f) => (',
  '        <label className="flex min-w-[170px] items-center gap-2 rounded-lg border border-border bg-background px-2 text-xs font-semibold text-muted-foreground">\n          <span>Data</span>\n          <input\n            type="date"\n            value={dateFilter}\n            onChange={(event) => setDateFilter(event.target.value)}\n            className="h-8 min-w-0 flex-1 bg-transparent text-foreground outline-none"\n          />\n          {dateFilter && (\n            <button\n              type="button"\n              onClick={() => setDateFilter("")}\n              className="rounded px-1 text-muted-foreground hover:text-foreground"\n              title="Limpar data"\n            >\n              ×\n            </button>\n          )}\n        </label>\n        <div className="flex flex-wrap gap-1 text-xs">\n          {["ativas", "saidas", "pendencias", "reservado", "ocupado", "finalizado", "todas"].map((f) => (',
  'campo de data',
);

replaceOnce(
  '                onSuccess: () =>\n                  toast.success(\n                    balance > 0\n                      ? `Check-in realizado com saldo pendente de ${fmtBRL(balance)}.`\n                      : "Check-in realizado",\n                  ),',
  '                onSuccess: () => {\n                  updateRoom.mutate(\n                    { id: reservation.quarto, patch: { situacao: "ocupado" } },\n                    {\n                      onError: (e: Error) =>\n                        toast.error(`Check-in feito, mas falhou ao atualizar o quarto: ${e.message}`),\n                    },\n                  );\n                  toast.success(\n                    balance > 0\n                      ? `Check-in realizado com saldo pendente de ${fmtBRL(balance)}.`\n                      : "Check-in realizado",\n                  );\n                },',
  'sincronização do quarto no check-in',
);

replaceOnce(
  '      <button\n        className="rounded-md bg-brick-bg px-2 py-1 text-xs font-semibold text-brick"\n        onClick={() => {\n          if (\n            !window.confirm(\n              `Cancelar a reserva de ${reservation.cliente_nome}? O registro será mantido no histórico.`,\n            )\n          )\n            return;\n          update.mutate(\n            {\n              id: reservation.id,\n              patch: { status: "cancelado" },\n            },\n            {\n              onSuccess: () => toast.success("Reserva cancelada"),\n              onError: (e: Error) => toast.error(e.message),\n            },\n          );\n        }}\n        title="Cancelar reserva"\n      >\n        <Ban className="h-3.5 w-3.5" />\n      </button>',
  '      {!done && (\n        <button\n          className="rounded-md bg-brick-bg px-2 py-1 text-xs font-semibold text-brick"\n          onClick={() => {\n            if (\n              !window.confirm(\n                `Cancelar a reserva de ${reservation.cliente_nome}? O registro será mantido no histórico.`,\n              )\n            )\n              return;\n            update.mutate(\n              {\n                id: reservation.id,\n                patch: { status: "cancelado" },\n              },\n              {\n                onSuccess: () => toast.success("Reserva cancelada"),\n                onError: (e: Error) => toast.error(e.message),\n              },\n            );\n          }}\n          title="Cancelar reserva"\n        >\n          <Ban className="h-3.5 w-3.5" />\n        </button>\n      )}',
  'proteção do cancelamento',
);

fs.writeFileSync(path, source);
console.log('Revisão operacional de reservas aplicada.');
