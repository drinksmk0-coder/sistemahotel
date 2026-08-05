import fs from "node:fs";

function patch(path, changes) {
  let source = fs.readFileSync(path, "utf8");
  for (const [before, after] of changes) {
    if (!source.includes(after) && source.includes(before)) source = source.replace(before, after);
  }
  fs.writeFileSync(path, source);
}

patch("src/routes/_authenticated/reservas.tsx", [
  [
    '  const [search, setSearch] = useState("");',
    '  const [search, setSearch] = useState("");\n  const [dateFilter, setDateFilter] = useState("");',
  ],
  [
    '    const term = search.trim().toLocaleLowerCase("pt-BR");',
    '    if (dateFilter) {\n      filteredRows = filteredRows.filter(\n        (reservation) =>\n          reservation.checkin <= dateFilter && reservation.checkout >= dateFilter,\n      );\n    }\n\n    const term = search.trim().toLocaleLowerCase("pt-BR");',
  ],
  [
    '  }, [reservations, sales, filter, search]);',
    '  }, [reservations, sales, filter, search, dateFilter]);',
  ],
  [
    '        <div className="flex flex-wrap gap-1 text-xs">',
    '        <div className="flex flex-wrap items-center gap-1 text-xs">\n          <label className="flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1">\n            <span className="font-semibold text-muted-foreground">Na data</span>\n            <input\n              type="date"\n              value={dateFilter}\n              onChange={(event) => setDateFilter(event.target.value)}\n              className="bg-transparent text-xs outline-none"\n            />\n          </label>\n          {dateFilter && (\n            <button type="button" className="rounded-full bg-muted px-2.5 py-1.5 font-semibold" onClick={() => setDateFilter("")}>\n              Limpar data\n            </button>\n          )}',
  ],
]);

patch("src/routes/_authenticated/fichas-checkin.tsx", [
  [
    '  RefreshCw,\n  UserRound,',
    '  RefreshCw,\n  Trash2,\n  AlertTriangle,\n  UserRound,',
  ],
  [
    '  const [confirming, setConfirming] = useState(false);',
    '  const [confirming, setConfirming] = useState(false);\n  const [deletingId, setDeletingId] = useState<string | null>(null);',
  ],
  [
    '  return (\n    <div>',
    `  async function deleteTestForm(row: GuestCheckin) {
    if (!company.data?.id || deletingId) return;
    const reservation = reservations.find((item) => item.id === row.reservation_id);
    const name = reservation?.cliente_nome || row.form_data?.nome_completo || "este hóspede";
    if (!window.confirm(\`Excluir somente a ficha de check-in de \${name}? A reserva, o hóspede, pagamentos e histórico da hospedagem serão mantidos.\`)) return;
    setDeletingId(row.id);
    const guestsDelete = await (supabase as any)
      .from("reservation_guests")
      .delete()
      .eq("reservation_id", row.reservation_id)
      .eq("company_id", company.data.id);
    if (guestsDelete.error) {
      setDeletingId(null);
      toast.error(\`Não foi possível excluir os acompanhantes da ficha: \${guestsDelete.error.message}\`);
      return;
    }
    const result = await (supabase as any)
      .from("guest_checkins")
      .delete()
      .eq("id", row.id)
      .eq("company_id", company.data.id);
    setDeletingId(null);
    if (result.error) {
      toast.error(\`Não foi possível excluir a ficha: \${result.error.message}\`);
      return;
    }
    if (selected?.id === row.id) setSelected(null);
    await queryClient.invalidateQueries({ queryKey: ["guest-checkins-with-guests"] });
    await queryClient.invalidateQueries({ queryKey: ["guest-checkins-pending"] });
    toast.success("Ficha de teste excluída. A reserva e o hóspede foram preservados.");
  }

  return (
    <div>`,
  ],
  [
    '      {pending.length > 0 && (',
    '      <section className="mb-3 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950 shadow-sm">\n        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />\n        <div>\n          <strong className="block text-sm">Impressão da FNRH em folha A3</strong>\n          <p className="mt-0.5 text-xs">Abra a ficha, confira o preview e selecione papel A3, escala “Ajustar à página”, margens padrão e cabeçalhos desativados. O sistema não imprime automaticamente.</p>\n        </div>\n      </section>\n\n      {pending.length > 0 && (',
  ],
  [
    '                <button\n                  type="button"\n                  className="btn-primary mt-3 flex w-full items-center justify-center gap-2"\n                  onClick={() => openForm(row)}\n                >\n                  <FileSignature className="h-4 w-4" />\n                  {waiting ? "Conferir ficha completa" : "Ver ficha completa"}\n                </button>',
    '                <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">\n                  <button\n                    type="button"\n                    className="btn-primary flex items-center justify-center gap-2"\n                    onClick={() => openForm(row)}\n                  >\n                    <FileSignature className="h-4 w-4" />\n                    {waiting ? "Conferir ficha completa" : "Ver ficha completa"}\n                  </button>\n                  <button\n                    type="button"\n                    className="btn-ghost flex items-center justify-center gap-2 text-destructive"\n                    disabled={deletingId === row.id}\n                    onClick={() => void deleteTestForm(row)}\n                    title="Excluir somente esta ficha de teste"\n                  >\n                    <Trash2 className="h-4 w-4" />\n                    {deletingId === row.id ? "Excluindo…" : "Excluir ficha"}\n                  </button>\n                </div>',
  ],
  [
    '<ExternalLink className="h-4 w-4" /> Abrir para impressão',
    '<ExternalLink className="h-4 w-4" /> Abrir preview A3',
  ],
]);

patch("src/components/MapaQuartos.tsx", [
  [
    '            {whatsapp && (',
    '            {stay && (\n              <a\n                className="btn-ghost inline-flex items-center gap-1"\n                href={`/vendas?quarto=${room.numero}`}\n                title={`Lançar venda para ${stay.cliente_nome} no quarto ${room.numero}`}\n              >\n                <ShoppingCart className="h-4 w-4" /> Lançar venda\n              </a>\n            )}\n            {stay && (\n              <a className="btn-ghost" href={`/reservas?editar=${stay.id}`}>Editar hospedagem</a>\n            )}\n            {whatsapp && (',
  ],
  [
    '  SlidersHorizontal,\n} from "lucide-react";',
    '  SlidersHorizontal,\n  ShoppingCart,\n} from "lucide-react";',
  ],
]);

patch("src/routes/_authenticated/vendas.tsx", [
  [
    '  const [purchaseOpen, setPurchaseOpen] = useState(false);',
    '  const initialRoom = typeof window !== "undefined" ? Number(new URLSearchParams(window.location.search).get("quarto")) || null : null;\n  const [purchaseOpen, setPurchaseOpen] = useState(initialRoom != null);',
  ],
  [
    '{purchaseOpen && <PurchaseModal rooms={rooms as any[]} reservations={reservations as any[]} products={activeProducts}',
    '{purchaseOpen && <PurchaseModal initialRoom={initialRoom} rooms={rooms as any[]} reservations={reservations as any[]} products={activeProducts}',
  ],
  [
    'function PurchaseModal({ rooms, reservations, products, employees, onClose, onSave }: { rooms: any[]; reservations: any[]; products: Product[]; employees: string[]; onClose: () => void; onSave: (input: PurchaseInput) => Promise<void> }) {',
    'function PurchaseModal({ initialRoom, rooms, reservations, products, employees, onClose, onSave }: { initialRoom?: number | null; rooms: any[]; reservations: any[]; products: Product[]; employees: string[]; onClose: () => void; onSave: (input: PurchaseInput) => Promise<void> }) {',
  ],
  [
    '  const [room, setRoom] = useState<number | null>(rooms[0]?.numero ?? null);',
    '  const [room, setRoom] = useState<number | null>(initialRoom ?? rooms[0]?.numero ?? null);',
  ],
]);

patch("src/routes/checkin-print.tsx", [
  [
    '@page { size: A4 portrait; margin: 9mm; }',
    '@page { size: A3 portrait; margin: 10mm; }',
  ],
  [
    'max-w-[210mm]',
    'max-w-[297mm]',
  ],
  [
    'min-h-[297mm] w-full max-w-[210mm]',
    'min-h-[420mm] w-full max-w-[297mm]',
  ],
  [
    '<button type="button" onClick={() => window.print()} className="btn-primary flex items-center gap-2"><Printer className="h-4 w-4" /> Imprimir ou salvar em PDF</button>',
    '<div className="mr-auto rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950"><strong>Antes de imprimir:</strong> selecione papel A3, escala “Ajustar à página”, margens padrão e desative cabeçalhos/rodapés.</div><button type="button" onClick={() => window.print()} className="btn-primary flex items-center gap-2"><Printer className="h-4 w-4" /> Imprimir em A3 ou salvar PDF</button>',
  ],
]);
