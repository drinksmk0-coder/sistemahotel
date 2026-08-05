import fs from 'node:fs';

const mapPath = 'src/components/MapaQuartos.tsx';
const salesPath = 'src/routes/_authenticated/vendas.tsx';

let map = fs.readFileSync(mapPath, 'utf8');
let sales = fs.readFileSync(salesPath, 'utf8');

function removeLegacyDuplicateActions(source) {
  const labels = [...source.matchAll(/Editar hospedagem/g)].map((match) => match.index ?? -1);
  if (labels.length <= 1) return source;

  const firstLabel = labels[0];
  const saleHref = source.lastIndexOf('href={`/vendas?quarto=', firstLabel);
  const launchStart = source.lastIndexOf('{stay && (', saleHref);
  const secondActionStart = source.lastIndexOf('{stay && (', firstLabel);
  const secondActionEnd = source.indexOf(')}', firstLabel);

  if (launchStart < 0 || secondActionStart < launchStart || secondActionEnd < 0) {
    throw new Error('Não foi possível localizar com segurança as ações duplicadas do mapa.');
  }

  return source.slice(0, launchStart) + source.slice(secondActionEnd + 2);
}

map = removeLegacyDuplicateActions(map);

const actionAnchor = `            {whatsapp && (\n              <a\n                className="btn-ghost inline-flex items-center gap-1"\n                href={whatsapp}\n                target="_blank"\n                rel="noreferrer"\n              >\n                <MessageCircle className="h-4 w-4" /> WhatsApp\n              </a>\n            )}`;

const actions = `${actionAnchor}\n            {stay && (\n              <>\n                <button\n                  type="button"\n                  className="btn-ghost"\n                  onClick={() => {\n                    window.location.href = \`/reservas?editar=\${stay.id}\`;\n                  }}\n                >\n                  Editar hospedagem\n                </button>\n                <button\n                  type="button"\n                  className="btn-primary"\n                  onClick={() => {\n                    window.location.href = \`/vendas?quarto=\${room.numero}&reserva=\${stay.id}\`;\n                  }}\n                >\n                  Lançar venda\n                </button>\n              </>\n            )}`;

if (!map.includes('window.location.href = `/reservas?editar=${stay.id}`')) {
  if (!map.includes(actionAnchor)) throw new Error('Âncora do WhatsApp não encontrada no mapa');
  map = map.replace(actionAnchor, actions);
}

sales = sales.replace(
  '  const initialRoom = typeof window !== "undefined" ? Number(new URLSearchParams(window.location.search).get("quarto")) || null : null;\n',
  '',
);
sales = sales.replace(
  '  const [purchaseOpen, setPurchaseOpen] = useState(initialRoom != null);',
  '  const [purchaseOpen, setPurchaseOpen] = useState(false);',
);

if (!sales.includes('useEffect')) {
  sales = sales.replace('import { useMemo, useState } from "react";', 'import { useEffect, useMemo, useState } from "react";');
}

if (!sales.includes('initialRoomFromQuery')) {
  const stateAnchor = '  const [historyOpen, setHistoryOpen] = useState(false);';
  const statePatch = `${stateAnchor}\n  const initialRoomFromQuery = useMemo(() => {\n    if (typeof window === \"undefined\") return null;\n    const value = Number(new URLSearchParams(window.location.search).get(\"quarto\"));\n    return Number.isFinite(value) && value > 0 ? value : null;\n  }, []);\n\n  useEffect(() => {\n    if (initialRoomFromQuery != null) setPurchaseOpen(true);\n  }, [initialRoomFromQuery]);`;
  if (!sales.includes(stateAnchor)) throw new Error('Âncora de estado não encontrada em vendas');
  sales = sales.replace(stateAnchor, statePatch);
}

sales = sales.replace(
  '{purchaseOpen && <PurchaseModal rooms={rooms as any[]} reservations={reservations as any[]} products={activeProducts} employees={employees.data ?? []}',
  '{purchaseOpen && <PurchaseModal initialRoom={initialRoomFromQuery} rooms={rooms as any[]} reservations={reservations as any[]} products={activeProducts} employees={employees.data ?? []}',
);

sales = sales.replace(
  'function PurchaseModal({ rooms, reservations, products, employees, onClose, onSave }: { rooms: any[]; reservations: any[]; products: Product[]; employees: string[]; onClose: () => void; onSave: (input: PurchaseInput) => Promise<void> }) {',
  'function PurchaseModal({ initialRoom, rooms, reservations, products, employees, onClose, onSave }: { initialRoom: number | null; rooms: any[]; reservations: any[]; products: Product[]; employees: string[]; onClose: () => void; onSave: (input: PurchaseInput) => Promise<void> }) {',
);

sales = sales.replace(
  '  const [room, setRoom] = useState<number | null>(rooms[0]?.numero ?? null);',
  '  const [room, setRoom] = useState<number | null>(initialRoom ?? rooms[0]?.numero ?? null);',
);

const editCount = (map.match(/Editar hospedagem/g) ?? []).length;
const saleCount = (map.match(/Lançar venda/g) ?? []).length;
if (editCount !== 1 || saleCount !== 1) {
  throw new Error(`Ações do mapa inconsistentes: editar=${editCount}, venda=${saleCount}`);
}
if (!sales.includes('initialRoom={initialRoomFromQuery}')) {
  throw new Error('Modal de venda não recebeu o quarto inicial da URL.');
}

fs.writeFileSync(mapPath, map);
fs.writeFileSync(salesPath, sales);
console.log('Mapa de quartos e vendas consolidados sem ações ou estados duplicados.');
// validação operacional 2026-08-05
