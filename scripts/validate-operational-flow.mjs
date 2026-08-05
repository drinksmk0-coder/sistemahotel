import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const reservations = read('src/routes/_authenticated/reservas.tsx');
const roomMap = read('src/components/MapaQuartos.tsx');
const sales = read('src/routes/_authenticated/vendas.tsx');
const guestAccount = read('src/lib/guest-account.ts');

const checks = [
  ['filtro por data considera período da hospedagem', reservations.includes('reservation.checkin <= dateFilter') && reservations.includes('reservation.checkout >= dateFilter')],
  ['edição por ID preserva a reserva', reservations.includes('get("editar")') && reservations.includes('setEditing(reservation)')],
  ['cancelamento altera status sem excluir histórico', reservations.includes('patch: { status: "cancelado" }')],
  ['check-in altera reserva para ocupado', reservations.includes('status: "ocupado"')],
  ['check-in sincroniza situação do quarto', reservations.includes('patch: { situacao: "ocupado" }')],
  ['checkout registra data e hora', reservations.includes('checkout_at: new Date().toISOString()')],
  ['checkout finaliza reserva sem exclusão', reservations.includes('status: "finalizado"')],
  ['checkout envia quarto para limpeza', reservations.includes('patch: { situacao: "limpeza" }')],
  ['checkout com saldo é bloqueado', reservations.includes('Check-out bloqueado: faltam')],
  ['saldo empresarial preserva contas a receber', reservations.includes('Faturar empresa') && reservations.includes('billing_status')],
  ['mapa permite liberar quarto após limpeza', roomMap.includes('Liberar quarto') && roomMap.includes('onSituacao(null)')],
  ['mapa abre edição da hospedagem correta', roomMap.includes('/reservas?editar=${stay.id}')],
  ['mapa abre venda vinculada a quarto e reserva', roomMap.includes('/vendas?quarto=${room.numero}&reserva=${stay.id}')],
  ['vendas lê quarto inicial da URL', sales.includes('initialRoomFromQuery') && sales.includes('get("quarto")')],
  ['venda de hóspede exige hospedagem ativa', sales.includes('Selecione um quarto com hospedagem ativa')],
  ['venda de funcionário não grava quarto', sales.includes('input.buyerType === "hospede" ? input.room : null')],
  ['venda liga consumo à reserva ativa', sales.includes('reserva_id: input.buyerType === "hospede" ? active?.id ?? null : null')],
  ['venda baixa estoque', sales.includes('estoque_atual: nextStock')],
  ['estoque bloqueia venda acima do disponível', sales.includes('Estoque insuficiente')],
  ['reposição e contagem estão disponíveis', sales.includes('register_stock_restock') && sales.includes('register_stock_count')],
  ['conta consolida hospedagem e consumos', guestAccount.includes('extrasTotal') && guestAccount.includes('balance')],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} - ${label}`);
}

if (failed.length) {
  console.error(`\n${failed.length} validação(ões) operacional(is) falharam.`);
  process.exit(1);
}

console.log(`\n${checks.length} validações operacionais aprovadas.`);
