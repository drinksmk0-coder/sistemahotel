import { config, validateConfig } from './config.mjs';
import { startBookingWatcher } from './booking.mjs';

process.on('unhandledRejection', (error) => console.error('[Agente] unhandledRejection', error));
process.on('uncaughtException', (error) => console.error('[Agente] uncaughtException', error));

validateConfig();

console.log('[HospedaMais] Agente local iniciado');
console.log(`[HospedaMais] Booking: ${config.booking.enabled ? `ativo a cada ${config.booking.pollMinutes} min` : 'desativado'}`);
console.log(`[HospedaMais] Gmail: ${config.gmail.enabled ? 'configurado para próxima etapa' : 'desativado'}`);

const jobs = [];
if (config.booking.enabled) {
  jobs.push(startBookingWatcher({ ...config.booking, companyId: config.companyId }));
}

if (!jobs.length) {
  console.log('[HospedaMais] Nenhum módulo ativo.');
  process.exit(0);
}

await Promise.all(jobs);
