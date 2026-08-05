import fs from 'node:fs';

const files = {
  bi: 'src/components/executive/ExecutiveBiDashboard.tsx',
  reference: 'src/components/executive/ExecutiveDashboardReference.tsx',
  booking: 'src/routes/_authenticated/booking-eventos.tsx',
  sales: 'src/routes/_authenticated/vendas.tsx',
};

function replace(path, search, replacement, label) {
  const source = fs.readFileSync(path, 'utf8');
  if (!source.includes(search)) {
    if (source.includes(replacement)) {
      console.log(`SKIP - ${label} já aplicado`);
      return;
    }
    throw new Error(`Trecho não encontrado: ${label}`);
  }
  fs.writeFileSync(path, source.replace(search, replacement));
  console.log(`OK - ${label}`);
}

replace(
  files.bi,
  'brazil.locations.map((location) => {',
  'brazil.locations.map((location: { id: string; path: string; name: string }) => {',
  'tipa localização do mapa executivo',
);

replace(
  files.reference,
  'brazil.locations.map((location) => {',
  'brazil.locations.map((location: { id: string; path: string; name: string }) => {',
  'tipa localização do mapa de referência',
);

replace(
  files.booking,
  '  quarto: string;',
  '  quarto: number | string;',
  'aceita número do quarto no portal Booking',
);

replace(
  files.booking,
  '      const { data: eventData, error: eventError } = await supabase\n        .from("booking_email_events" as never)',
  '      const { data: eventData, error: eventError } = await (supabase as any)\n        .from("booking_email_events")',
  'consulta tipada de eventos Booking',
);

replace(
  files.booking,
  '        reservations = (reservationData ?? []) as ReservationSummary[];',
  '        reservations = (reservationData ?? []) as unknown as ReservationSummary[];',
  'conversão explícita do resumo de reservas',
);

replace(
  files.sales,
  '  const [payment, setPayment] = useState(PAYMENT_METHODS[0]);',
  '  const [payment, setPayment] = useState<string>(PAYMENT_METHODS[0]);',
  'permite métodos de pagamento da lista',
);

console.log('Correções de typecheck operacional aplicadas.');
// retrigger 2026-08-05T15:33-03:00
