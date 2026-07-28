function normalizeChartLabel(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function semanticChartColor(
  label: unknown,
  index: number,
  primary = "var(--chart-1)",
) {
  const normalized = normalizeChartLabel(label);

  // São origens diferentes no cadastro, mas pertencem à mesma família visual
  // de reservas diretas e por isso devem compartilhar a mesma cor.
  if (
    normalized === "direto" ||
    normalized === "direct" ||
    (normalized.includes("direto") && normalized.includes("hospedin"))
  ) {
    return "var(--chart-1)";
  }
  if (normalized.includes("whatsapp") || normalized === "wh") return "var(--chart-2)";
  if (normalized.includes("booking") || normalized === "bo") return "var(--chart-3)";
  if (normalized.includes("formulario") || normalized === "fo") return "var(--chart-4)";
  if (normalized.includes("instagram")) return "var(--chart-5)";
  if (normalized.includes("site")) return "var(--chart-6)";

  return index === 0 ? primary : `var(--chart-${(index % 6) + 1})`;
}
