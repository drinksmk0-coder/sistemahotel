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

patch("src/components/AppLayout.tsx", [
  [
    '  | "Inteligência"\n  | "Configurações";',
    '  | "Inteligência"\n  | "Configurações"\n  | "Plataforma";',
  ],
  [
    '  "Inteligência",\n  "Configurações",\n];',
    '  "Inteligência",\n  "Configurações",\n  "Plataforma",\n];',
  ],
  [
    'const PLATFORM_ADMIN_TAB: NavigationItem = {\n  to: "/admin-plataforma",\n  label: "Administração HospedaMais",\n  icon: ShieldCheck,\n  roles: ["dono"],\n  group: "Configurações",\n};',
    'const PLATFORM_ADMIN_TAB: NavigationItem = {\n  to: "/admin-plataforma",\n  label: "Administração HospedaMais",\n  icon: ShieldCheck,\n  roles: ["dono"],\n  group: "Plataforma",\n};',
  ],
]);

await import("./fix-booking-noshow-dashboard.mjs");
