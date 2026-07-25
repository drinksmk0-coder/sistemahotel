export const GUEST_FIELD_KEYS = ["cpf", "telefone", "estado", "estadoCivil", "nascimento"] as const;
export type GuestFieldKey = (typeof GUEST_FIELD_KEYS)[number];

export type SystemSettings = {
  logo: string;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  theme: "light" | "soft" | "dark";
  chartPalette: string[];
  requiredGuestFields: Record<GuestFieldKey, boolean>;
};

const DEFAULT_SETTINGS: SystemSettings = {
  logo: "/hotel-real-logo.png",
  primaryColor: "#234d38",
  accentColor: "#d0b25b",
  backgroundColor: "#f4f0e8",
  surfaceColor: "#fffdf8",
  textColor: "#332d27",
  theme: "soft",
  chartPalette: ["#234d38", "#588b69", "#d0b25b", "#a2462d", "#2f8a72", "#6f8f7a"],
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
      chartPalette:
        Array.isArray(stored.chartPalette) && stored.chartPalette.length >= 4
          ? stored.chartPalette
          : DEFAULT_SETTINGS.chartPalette,
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
  const dark = settings.theme === "dark";
  const background = dark ? "#171b19" : settings.backgroundColor;
  const surface = dark ? "#212723" : settings.surfaceColor;
  const text = dark ? "#f2f4f2" : settings.textColor;

  root.dataset.systemTheme = settings.theme;
  root.style.colorScheme = dark ? "dark" : "light";
  root.style.setProperty("--brand-primary", settings.primaryColor);
  root.style.setProperty("--brand-accent", settings.accentColor);
  root.style.setProperty("--pine", settings.primaryColor);
  root.style.setProperty(
    "--pine-dark",
    `color-mix(in srgb, ${settings.primaryColor} 72%, black)`,
  );
  root.style.setProperty("--brass", settings.accentColor);
  root.style.setProperty(
    "--brass-bg",
    `color-mix(in srgb, ${settings.accentColor} 18%, ${surface})`,
  );
  root.style.setProperty("--sage", settings.chartPalette[1] ?? settings.primaryColor);
  root.style.setProperty(
    "--sage-bg",
    `color-mix(in srgb, ${settings.chartPalette[1] ?? settings.primaryColor} 14%, ${surface})`,
  );
  root.style.setProperty("--brick", settings.chartPalette[3] ?? "#a2462d");
  root.style.setProperty(
    "--brick-bg",
    `color-mix(in srgb, ${settings.chartPalette[3] ?? "#a2462d"} 14%, ${surface})`,
  );
  root.style.setProperty("--background", background);
  root.style.setProperty("--paper", background);
  root.style.setProperty(
    "--paper-2",
    `color-mix(in srgb, ${background} 88%, ${settings.primaryColor})`,
  );
  root.style.setProperty("--foreground", text);
  root.style.setProperty("--card", surface);
  root.style.setProperty("--card-foreground", text);
  root.style.setProperty("--popover", surface);
  root.style.setProperty("--popover-foreground", text);
  root.style.setProperty("--primary", settings.primaryColor);
  root.style.setProperty("--accent", settings.accentColor);
  root.style.setProperty("--ring", settings.accentColor);
  root.style.setProperty(
    "--muted",
    `color-mix(in srgb, ${surface} 88%, ${settings.primaryColor})`,
  );
  root.style.setProperty(
    "--muted-foreground",
    `color-mix(in srgb, ${text} 66%, ${background})`,
  );
  root.style.setProperty(
    "--border",
    `color-mix(in srgb, ${text} ${dark ? 24 : 18}%, ${surface})`,
  );
  root.style.setProperty(
    "--input",
    `color-mix(in srgb, ${text} ${dark ? 28 : 20}%, ${surface})`,
  );
  settings.chartPalette.slice(0, 6).forEach((color, index) => {
    root.style.setProperty(`--chart-${index + 1}`, color);
  });
}
