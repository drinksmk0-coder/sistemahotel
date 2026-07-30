export const BRAND = {
  name: "HospedaMais",
  shortName: "HospedaMais",
  tagline: "Gestão hoteleira inteligente",
  description:
    "Plataforma de gestão hoteleira para reservas, quartos, equipe, finanças, hóspedes e decisões estratégicas.",
  icon: "/hospedamais-icon.svg",
  manifest: "/manifest.webmanifest",
} as const;

export const BRAND_STORAGE_PREFIX = "hospedamais";

export function brandedPageTitle(page?: string) {
  return page ? `${page} — ${BRAND.name}` : `${BRAND.name} — ${BRAND.tagline}`;
}
