import 'dotenv/config';
import path from 'node:path';

const bool = (v, fallback = false) => v == null ? fallback : /^(1|true|yes|on)$/i.test(String(v));
const int = (v, fallback) => Number.isFinite(Number(v)) ? Number(v) : fallback;

export const config = {
  booking: {
    enabled: bool(process.env.BOOKING_ENABLED, true),
    pollMinutes: Math.max(1, int(process.env.BOOKING_POLL_MINUTES, 5)),
    profileDir: path.resolve(process.env.BOOKING_PROFILE_DIR || './data/booking-profile'),
    reservationsUrl: process.env.BOOKING_RESERVATIONS_URL || 'https://admin.booking.com/hotel/hoteladmin/reservations.html',
    endpoint: process.env.BOOKING_CONNECTOR_ENDPOINT || '',
    token: process.env.BOOKING_CONNECTOR_TOKEN || '',
  },
  companyId: process.env.COMPANY_ID || '',
  gmail: {
    enabled: bool(process.env.GMAIL_ENABLED, false),
  },
};

export function validateConfig() {
  const missing = [];
  if (config.booking.enabled) {
    if (!config.booking.endpoint) missing.push('BOOKING_CONNECTOR_ENDPOINT');
    if (!config.booking.token) missing.push('BOOKING_CONNECTOR_TOKEN');
    if (!config.companyId) missing.push('COMPANY_ID');
  }
  if (missing.length) throw new Error(`Configuração ausente: ${missing.join(', ')}`);
}
