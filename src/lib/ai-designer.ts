import type { DashboardChartType, DashboardWidget } from "@/components/DashboardDesigner";

export type AiWidgetPreset = {
  columns: number;
  height: number;
  fontSize: number;
  contentScale: number;
  backgroundOpacity: number;
};

export type AiDesignProfile = {
  version: string;
  generatedAt: string;
  density: "compacta" | "equilibrada" | "confortavel";
  kpi: AiWidgetPreset;
  chart: AiWidgetPreset;
  content: AiWidgetPreset;
  chartTypes: {
    trend: DashboardChartType;
    comparison: DashboardChartType;
    composition: DashboardChartType;
    ranking: DashboardChartType;
  };
  showLegend: boolean;
  showLabels: boolean;
  autoFit: boolean;
  diagnostics: string[];
  explanation: string;
};

const DEFAULT_PROFILE: AiDesignProfile = {
  version: "default",
  generatedAt: "",
  density: "compacta",
  kpi: {
    columns: 2,
    height: 104,
    fontSize: 88,
    contentScale: 100,
    backgroundOpacity: 100,
  },
  chart: {
    columns: 6,
    height: 284,
    fontSize: 92,
    contentScale: 100,
    backgroundOpacity: 100,
  },
  content: {
    columns: 6,
    height: 280,
    fontSize: 92,
    contentScale: 100,
    backgroundOpacity: 100,
  },
  chartTypes: {
    trend: "line",
    comparison: "composed",
    composition: "doughnut",
    ranking: "horizontalBar",
  },
  showLegend: true,
  showLabels: true,
  autoFit: true,
  diagnostics: [],
  explanation: "Layout compacto, responsivo e adequado para análise gerencial.",
};

function storageKey(companyId?: string | null) {
  return `hotelreal.aiDesigner.${companyId ?? "default"}`;
}

export function getAiDesignProfile(companyId?: string | null): AiDesignProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = JSON.parse(window.localStorage.getItem(storageKey(companyId)) ?? "null");
    return stored ? normalizeAiDesignProfile(stored) : null;
  } catch {
    return null;
  }
}

export function saveAiDesignProfile(
  companyId: string | null | undefined,
  profile: AiDesignProfile,
) {
  const normalized = normalizeAiDesignProfile(profile);
  window.localStorage.setItem(storageKey(companyId), JSON.stringify(normalized));
  window.localStorage.setItem(storageKey(), JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent("hotelreal:ai-design", { detail: normalized }));
}

export function normalizeAiDesignProfile(value: unknown): AiDesignProfile {
  const source = isRecord(value) ? value : {};
  const chartTypes = isRecord(source.chartTypes) ? source.chartTypes : {};
  return {
    ...DEFAULT_PROFILE,
    version: String(source.version ?? Date.now()),
    generatedAt: String(source.generatedAt ?? new Date().toISOString()),
    density: ["compacta", "equilibrada", "confortavel"].includes(String(source.density))
      ? (source.density as AiDesignProfile["density"])
      : DEFAULT_PROFILE.density,
    kpi: normalizePreset(source.kpi, DEFAULT_PROFILE.kpi),
    chart: normalizePreset(source.chart, DEFAULT_PROFILE.chart),
    content: normalizePreset(source.content, DEFAULT_PROFILE.content),
    chartTypes: {
      trend: chartType(chartTypes.trend, DEFAULT_PROFILE.chartTypes.trend),
      comparison: chartType(chartTypes.comparison, DEFAULT_PROFILE.chartTypes.comparison),
      composition: chartType(chartTypes.composition, DEFAULT_PROFILE.chartTypes.composition),
      ranking: chartType(chartTypes.ranking, DEFAULT_PROFILE.chartTypes.ranking),
    },
    showLegend: source.showLegend !== false,
    showLabels: source.showLabels !== false,
    autoFit: source.autoFit !== false,
    diagnostics: Array.isArray(source.diagnostics)
      ? source.diagnostics.map(String).slice(0, 8)
      : [],
    explanation: String(source.explanation ?? DEFAULT_PROFILE.explanation).slice(0, 800),
  };
}

export function recommendedChartType(
  widget: DashboardWidget,
  profile: AiDesignProfile,
): DashboardChartType {
  const available = widget.chartTypes ?? [];
  if (!available.length) return "bar";
  const title = normalize(widget.title);
  const preference =
    includesAny(title, ["evolucao", "tendencia", "historico", "previsao", "mensal", "diaria"])
      ? profile.chartTypes.trend
      : includesAny(title, ["origem", "perfil", "composicao", "participacao", "forma de pagamento"])
        ? profile.chartTypes.composition
        : includesAny(title, ["ranking", "maiores", "melhores", "por quarto", "por categoria"])
          ? profile.chartTypes.ranking
          : profile.chartTypes.comparison;
  return available.includes(preference) ? preference : available[0];
}

function normalizePreset(value: unknown, fallback: AiWidgetPreset): AiWidgetPreset {
  const source = isRecord(value) ? value : {};
  return {
    columns: integer(source.columns, 1, 12, fallback.columns),
    height: integer(source.height, 72, 720, fallback.height),
    fontSize: integer(source.fontSize, 55, 130, fallback.fontSize),
    contentScale: integer(source.contentScale, 60, 130, fallback.contentScale),
    backgroundOpacity: integer(
      source.backgroundOpacity,
      45,
      100,
      fallback.backgroundOpacity,
    ),
  };
}

function chartType(value: unknown, fallback: DashboardChartType): DashboardChartType {
  const types: DashboardChartType[] = [
    "bar",
    "horizontalBar",
    "line",
    "area",
    "pie",
    "doughnut",
    "radar",
    "composed",
  ];
  return types.includes(value as DashboardChartType) ? (value as DashboardChartType) : fallback;
}

function integer(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function includesAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}
