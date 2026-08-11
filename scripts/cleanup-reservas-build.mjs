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

fs.writeFileSync(path, source);
console.log("Reservas: duplicações removidas antes do build.");
