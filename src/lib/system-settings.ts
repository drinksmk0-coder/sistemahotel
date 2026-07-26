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
  autoPalette: boolean;
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
  autoPalette: true,
  requiredGuestFields: {
    cpf: true,
    telefone: true,
    estado: true,
    estadoCivil: true,
    nascimento: true,
  },
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hexToHsl(hex: string) {
  const clean = hex.replace("#", "");
  const value = Number.parseInt(clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean, 16);
  const red = ((value >> 16) & 255) / 255;
  const green = ((value >> 8) & 255) / 255;
  const blue = (value & 255) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
  }
  hue = Math.round(hue * 60);
  if (hue < 0) hue += 360;
  const lightness = (max + min) / 2;
  const saturation = delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0;
  return { h: hue, s: saturation * 100, l: lightness * 100 };
}

function hslToHex(hue: number, saturation: number, lightness: number) {
  const h = ((hue % 360) + 360) % 360;
  const s = clamp(saturation, 0, 100) / 100;
  const l = clamp(lightness, 0, 100) / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - chroma / 2;
  const [red, green, blue] =
    h < 60 ? [chroma, x, 0]
      : h < 120 ? [x, chroma, 0]
        : h < 180 ? [0, chroma, x]
          : h < 240 ? [0, x, chroma]
            : h < 300 ? [x, 0, chroma]
              : [chroma, 0, x];
  return `#${[red, green, blue]
    .map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

export function buildHarmonicPalette(
  primaryColor: string,
  theme: SystemSettings["theme"] = "soft",
): Pick<
  SystemSettings,
  "primaryColor" | "accentColor" | "backgroundColor" | "surfaceColor" | "textColor" | "chartPalette"
> {
  const { h, s, l } = hexToHsl(primaryColor);
  const primary = hslToHex(h, clamp(s, 42, 78), clamp(l, 32, 52));
  const accent = hslToHex(h - 96, clamp(s + 14, 55, 88), theme === "dark" ? 62 : 53);
  const secondary = hslToHex(h + 28, clamp(s + 4, 38, 72), theme === "dark" ? 62 : 48);
  const complement = hslToHex(h + 168, clamp(s + 8, 48, 82), theme === "dark" ? 65 : 50);
  const warm = hslToHex(h - 62, clamp(s + 18, 52, 88), theme === "dark" ? 66 : 55);
  const cool = hslToHex(h + 62, clamp(s + 10, 45, 82), theme === "dark" ? 64 : 49);
  const backgroundColor =
    theme === "dark" ? hslToHex(h, 15, 10) : hslToHex(h, clamp(s * 0.18, 8, 18), theme === "light" ? 98 : 95);
  const surfaceColor = theme === "dark" ? hslToHex(h, 13, 15) : hslToHex(h, 12, 99);
  const textColor = theme === "dark" ? hslToHex(h, 10, 94) : hslToHex(h, 18, 18);

  return {
    primaryColor: primary,
    accentColor: accent,
    backgroundColor,
    surfaceColor,
    textColor,
    chartPalette: [primary, secondary, accent, warm, complement, cool],
  };
}

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
