import fs from "node:fs";

const path = "src/routes/_authenticated/reservas.tsx";
let source = fs.readFileSync(path, "utf8");

function keepFirst(block) {
  const first = source.indexOf(block);
  if (first < 0) return;
  const head = source.slice(0, first + block.length);
  const tail = source.slice(first + block.length).split(block).join("");
  source = head + tail;
}

function removeBlock(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  if (start < 0) return;
  const end = source.indexOf(endMarker, start);
  if (end < 0) return;
  source = source.slice(0, start) + source.slice(end + endMarker.length);
}

keepFirst('  const [dateFilter, setDateFilter] = useState("");\n');

keepFirst(`  useEffect(() => {
    const reservationId = new URLSearchParams(window.location.search).get("editar");
    if (!reservationId || !reservations.length) return;
    const reservation = reservations.find((item) => item.id === reservationId);
    if (!reservation) return;
    setEditing(reservation);
    window.history.replaceState({}, "", window.location.pathname);
  }, [reservations]);
`);

keepFirst(`    if (dateFilter) {
      filteredRows = filteredRows.filter(
        (reservation) =>
          reservation.checkin <= dateFilter && reservation.checkout >= dateFilter,
      );
    }
`);

// Ao abrir Reservas, mostra automaticamente as hospedagens da data atual.
// O campo de data continua disponível para consultar qualquer outra data.
source = source.replace(
  '  const [dateFilter, setDateFilter] = useState("");',
  '  const [dateFilter, setDateFilter] = useState(() => todayISO());',
);

// Importação de reservas foi removida: o fluxo oficial deve ser cadastro,
// integrações automáticas e sincronizações auditáveis, não CSV manual.
source = source.replace('  Upload,\n', '');
source = source.replace(
  'import {\n  ReservationImportModal,\n  type ReservationImportResult,\n} from "@/components/ReservationImportModal";\n',
  '',
);
source = source.replace('  const [importOpen, setImportOpen] = useState(false);\n', '');

removeBlock(
  '  async function importReservations(rows: ReservaRow[]): Promise<ReservationImportResult> {',
  '  async function createGroupReservation(payload: GroupReservationPayload) {',
);
// Recoloca a assinatura removida pelo helper acima.
if (!source.includes('  async function createGroupReservation(payload: GroupReservationPayload) {')) {
  source = source.replace(
    '    if (!currentCompany.data?.id) {',
    '  async function createGroupReservation(payload: GroupReservationPayload) {\n    if (!currentCompany.data?.id) {',
  );
}

source = source.replace(
  `            <button
              onClick={() => setImportOpen(true)}
              className="btn-ghost flex items-center gap-1.5"
            >
              <Upload className="h-4 w-4" /> Importar
            </button>
`,
  '',
);

removeBlock(
  '      {importOpen && (',
  '      {moving && (',
);
if (!source.includes('      {moving && (')) {
  source = source.replace(
    '        <MoveRoomModal',
    '      {moving && (\n        <MoveRoomModal',
  );
}

source = source.replace(
  '["ativas", "saidas", "pendencias", "reservado", "ocupado", "finalizado", "todas"]',
  '["ativas", "saidas", "pendencias", "reservado", "ocupado", "cancelado", "finalizado", "todas"]',
);

fs.writeFileSync(path, source);
console.log("Reservas: data atual por padrão, filtro Cancelado garantido e importação removida.");
