import 'dotenv/config';
import path from 'node:path';

const bool = (v, fallback = false) => v == null ? fallback : /^(1|true|yes|on)$/i.test(String(v));
const int = (v, fallback) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const config = {
  booking: {
    enabled: bool(process.env.BOOKING_ENABLED, true),
    headless: bool(process.env.BOOKING_HEADLESS, false),
    pollMinutes: Math.max(1, int(process.env.BOOKING_POLL_MINUTES, 5)),
    maxReservationsPerCycle: clamp(int(process.env.BOOKING_MAX_RESERVATIONS_PER_CYCLE, 12), 1, 20),
    profileDir: path.resolve(process.env.BOOKING_PROFILE_DIR || './data/booking-profile'),
    reservationsUrl: process.env.BOOKING_RESERVATIONS_URL || 'https://admin.booking.com/',
    endpoint: process.env.BOOKING_CONNECTOR_ENDPOINT || '',
    token: process.env.BOOKING_CONNECTOR_TOKEN || '',
  },
  companyId: process.env.COMPANY_ID || '',
  gmail: {
    enabled: bool(process.env.GMAIL_ENABLED, false),
    pollMinutes: Math.max(1, int(process.env.GMAIL_POLL_MINUTES, 5)),
    userId: process.env.GMAIL_USER || 'me',
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN || '',
  },
};

export function validateConfig() {
  const missing = [];
  if (config.booking.enabled) {
    if (!config.booking.endpoint) missing.push('BOOKING_CONNECTOR_ENDPOINT');
    if (!config.booking.token) missing.push('BOOKING_CONNECTOR_TOKEN');
    if (!config.companyId) missing.push('COMPANY_ID');
  }
  if (config.gmail.enabled) {
    if (!config.gmail.clientId) missing.push('GOOGLE_CLIENT_ID');
    if (!config.gmail.clientSecret) missing.push('GOOGLE_CLIENT_SECRET');
    if (!config.gmail.refreshToken) missing.push('GOOGLE_REFRESH_TOKEN');
  }
  if (missing.length) throw new Error(`Configuração ausente: ${missing.join(', ')}`);
}
