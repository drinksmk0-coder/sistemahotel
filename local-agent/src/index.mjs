import { config, validateConfig } from './config.mjs';
import { startBookingWatcher } from './booking.mjs';
import { startGmailWatcher } from './gmail.mjs';

process.on('unhandledRejection', (error) => console.error('[Agente] unhandledRejection', error));
process.on('uncaughtException', (error) => console.error('[Agente] uncaughtException', error));

validateConfig();

console.log('[HospedaMais] Agente local iniciado');
console.log(`[HospedaMais] Booking: ${config.booking.enabled ? `ativo a cada ${config.booking.pollMinutes} min` : 'desativado'}`);
console.log(`[HospedaMais] Gmail: ${config.gmail.enabled ? `ativo a cada ${config.gmail.pollMinutes} min` : 'desativado'}`);

const jobs = [];
if (config.booking.enabled) jobs.push(startBookingWatcher({ ...config.booking, companyId: config.companyId }));
if (config.gmail.enabled) jobs.push(startGmailWatcher(config.gmail));

if (!jobs.length) {
  console.log('[HospedaMais] Nenhum módulo ativo.');
  process.exit(0);
}

await Promise.all(jobs);
