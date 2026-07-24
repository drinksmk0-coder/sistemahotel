export const GUEST_FIELD_KEYS = ["cpf", "telefone", "estado", "estadoCivil", "nascimento"] as const;
export type GuestFieldKey = (typeof GUEST_FIELD_KEYS)[number];

export type SystemSettings = {
  logo: string;
  primaryColor: string;
  accentColor: string;
  requiredGuestFields: Record<GuestFieldKey, boolean>;
};

const DEFAULT_SETTINGS: SystemSettings = {
  logo: "/hotel-real-logo.png",
  primaryColor: "#234d38",
  accentColor: "#d0b25b",
  requiredGuestFields: {
    cpf: true,
    telefone: true,
    estado: true,
    estadoCivil: true,
    nascimento: true,
  },
};

function storageKey(companyId?: string | null) {
  return `hotelreal.systemSettings.${companyId ?? "default"}`;
}

export function getSystemSettings(companyId?: string | null): SystemSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const stored = JSON.parse(window.localStorage.getItem(storageKey(companyId)) ?? "{}") as Partial<SystemSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      requiredGuestFields: {
        ...DEFAULT_SETTINGS.requiredGuestFields,
        ...stored.requiredGuestFields,
      },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSystemSettings(companyId: string | null | undefined, settings: SystemSettings) {
  window.localStorage.setItem(storageKey(companyId), JSON.stringify(settings));
  window.localStorage.setItem(storageKey(), JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent("hotelreal:settings", { detail: settings }));
}

export function applySystemSettings(settings: SystemSettings) {
  const root = document.documentElement;
  root.style.setProperty("--brand-primary", settings.primaryColor);
  root.style.setProperty("--brand-accent", settings.accentColor);
}
