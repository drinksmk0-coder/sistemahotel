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

export function brandedPageTitle(page?: string) {
  return page
    ? `${page} — ${BRAND.hotelName} | ${BRAND.name}`
    : `${BRAND.hotelName} — ${BRAND.publicTagline} | ${BRAND.name}`;
}
