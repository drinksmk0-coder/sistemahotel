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
  backgroundStyle: "clean" | "soft" | "gradient";
  surfaceOpacity: number;
  chartSurfaceOpacity: number;
  borderRadius: number;
  uiScale: number;
  glassEffect: boolean;
  shadows: "none" | "soft" | "strong";
  chartPalette: string[];
  autoPalette: boolean;
  aiDesignerEnabled: boolean;
  requiredGuestFields: Record<GuestFieldKey, boolean>;
};

const DEFAULT_SETTINGS: SystemSettings = {
  logo: "/hotel-real-logo.png",
  primaryColor: "#2878e8",
  accentColor: "#168aad",
  backgroundColor: "#f4f7fa",
  surfaceColor: "#ffffff",
  textColor: "#071a38",
  theme: "light",
  backgroundStyle: "clean",
  surfaceOpacity: 100,
  chartSurfaceOpacity: 100,
  borderRadius: 12,
  uiScale: 1,
  glassEffect: false,
  shadows: "soft",
  chartPalette: ["#1859a9", "#2878e8", "#168aad", "#0f6f8f", "#4c91e8", "#336ca8"],
  autoPalette: true,
  aiDesignerEnabled: true,
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
  const chartLightness = theme === "dark" ? [68, 60, 74, 64, 56, 70] : [38, 49, 43, 55, 34, 47];
  const chartHueOffsets = [0, 14, 28, -14, -28, 38];
  const chartPalette = chartHueOffsets.map((offset, index) =>
    hslToHex(
      h + offset,
      clamp(s + (index % 2 ? -4 : 6), 44, 82),
      chartLightness[index],
    ),
  );
  const accent = chartPalette[2];
  const backgroundColor =
    theme === "dark" ? hslToHex(h, 15, 10) : hslToHex(h, clamp(s * 0.18, 8, 18), theme === "light" ? 98 : 95);
  const surfaceColor = theme === "dark" ? hslToHex(h, 13, 15) : hslToHex(h, 12, 99);
  const textColor = theme === "dark" ? "#F8F9FA" : "#1A1D20";

  return {
    primaryColor: primary,
    accentColor: accent,
    backgroundColor,
    surfaceColor,
    textColor,
    chartPalette,
  };
}

function rgb(hex: string) {
  const clean = hex.replace("#", "");
  const value = Number.parseInt(clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function relativeLuminance(hex: string) {
  const channels = rgb(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function accessibleForeground(background: string) {
  const luminance = relativeLuminance(background);
  const whiteContrast = 1.05 / (luminance + 0.05);
  const darkContrast = (luminance + 0.05) / 0.0607;
  return whiteContrast >= darkContrast ? "#FFFFFF" : "#1A1D20";
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
  const surfaceOpacity = clamp(settings.surfaceOpacity ?? 96, 35, 100);
  const chartSurfaceOpacity = clamp(settings.chartSurfaceOpacity ?? 100, 35, 100);
  const radius = clamp(settings.borderRadius ?? 12, 0, 28);
  const scale = clamp(settings.uiScale ?? 1, 0.85, 1.15);

  root.dataset.systemTheme = settings.theme;
  root.dataset.backgroundStyle = settings.backgroundStyle ?? "soft";
  root.dataset.glassEffect = settings.glassEffect ? "on" : "off";
  root.dataset.systemShadows = settings.shadows ?? "soft";
  root.style.colorScheme = dark ? "dark" : "light";
  root.style.fontSize = `${scale * 100}%`;
  root.style.setProperty("--radius", `${radius}px`);
  root.style.setProperty("--brand-primary", settings.primaryColor);
  root.style.setProperty("--brand-accent", settings.accentColor);
  root.style.setProperty("--pine", settings.primaryColor);
  root.style.setProperty(
    "--pine-dark",
    dark ? text : `color-mix(in srgb, ${settings.primaryColor} 72%, black)`,
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
  root.style.setProperty("--brick", "#C62828");
  root.style.setProperty(
    "--brick-bg",
    `color-mix(in srgb, #C62828 14%, ${surface})`,
  );
  root.style.setProperty("--background", background);
  root.style.setProperty("--paper", background);
  root.style.setProperty(
    "--paper-2",
    `color-mix(in srgb, ${background} 88%, ${settings.primaryColor})`,
  );
  root.style.setProperty("--foreground", text);
  root.style.setProperty("--card-solid", surface);
  root.style.setProperty(
    "--card",
    `color-mix(in srgb, ${surface} ${surfaceOpacity}%, transparent)`,
  );
  root.style.setProperty(
    "--chart-surface",
    `color-mix(in srgb, ${surface} ${chartSurfaceOpacity}%, transparent)`,
  );
  root.style.setProperty("--surface-opacity", `${surfaceOpacity / 100}`);
  root.style.setProperty("--card-foreground", text);
  root.style.setProperty("--popover", surface);
  root.style.setProperty("--popover-foreground", text);
  root.style.setProperty("--primary", settings.primaryColor);
  root.style.setProperty("--primary-foreground", accessibleForeground(settings.primaryColor));
  root.style.setProperty("--accent", settings.accentColor);
  root.style.setProperty("--accent-foreground", accessibleForeground(settings.accentColor));
  root.style.setProperty("--warning", "#B45309");
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
