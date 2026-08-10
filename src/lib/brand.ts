export const BRAND = {
  name: "HospedaMais",
  shortName: "HospedaMais",
  hotelName: "Hotel Real",
  tagline: "Gestão hoteleira inteligente",
  publicTagline: "Reservas diretas e hospedagem",
  description:
    "Hotel Real — reservas diretas, hospedagem e atendimento pelo HospedaMais.",
  icon: "/hospedamais-icon.svg",
  manifest: "/manifest.webmanifest",
} as const;

export const BRAND_STORAGE_PREFIX = "hospedamais";

export const PUBLIC_APP_ORIGIN = "https://sistemahotel-two.vercel.app";
export const CANONICAL_APP_HOST = "sistemahotel-two.vercel.app";
export const LEGACY_APP_HOSTS = new Set([
  "sistemahotel-three.vercel.app",
  "sistemahotel-sdk13.vercel.app",
  "sistemahotel-git-main-sdk13.vercel.app",
]);

export function publicAppUrl(path = "/") {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${PUBLIC_APP_ORIGIN}${normalized}`;
}

export function canonicalUrlForCurrentLocation() {
  if (typeof window === "undefined") return null;
  if (!LEGACY_APP_HOSTS.has(window.location.hostname)) return null;
  return `${PUBLIC_APP_ORIGIN}${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function brandedPageTitle(page?: string) {
  return page
    ? `${page} — ${BRAND.hotelName} | ${BRAND.name}`
    : `${BRAND.hotelName} — ${BRAND.publicTagline} | ${BRAND.name}`;
}
