import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  Eye,
  EyeOff,
  GripVertical,
  LayoutDashboard,
  RotateCcw,
  Save,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";

export type DashboardChartType = "bar" | "line" | "area" | "pie";

export type DashboardWidgetSettings = {
  id: string;
  title: string;
  color: string;
  columns: number;
  height: number;
  hidden: boolean;
  chartType: DashboardChartType;
};

export type DashboardWidget = {
  id: string;
  title: string;
  kind: "kpi" | "chart" | "content";
  defaultColumns?: number;
  defaultHeight?: number;
  defaultColor?: string;
  chartTypes?: DashboardChartType[];
  render: (settings: DashboardWidgetSettings) => ReactNode;
};

type StoredLayout = {
  order: string[];
  widgets: Record<string, DashboardWidgetSettings>;
};

function storageKey(companyId: string | null | undefined, dashboardId: string) {
  return `hotelreal.dashboard.${companyId ?? "default"}.${dashboardId}`;
}

function defaultSettings(widget: DashboardWidget): DashboardWidgetSettings {
  return {
    id: widget.id,
    title: widget.title,
    color: widget.defaultColor ?? "var(--pine)",
    columns: widget.defaultColumns ?? (widget.kind === "kpi" ? 2 : 6),
    height: widget.defaultHeight ?? (widget.kind === "kpi" ? 110 : 290),
    hidden: false,
    chartType: widget.chartTypes?.[0] ?? "bar",
  };
}

function loadLayout(
  companyId: string | null | undefined,
  dashboardId: string,
  widgets: DashboardWidget[],
): StoredLayout {
  const fallback: StoredLayout = {
    order: widgets.map((widget) => widget.id),
    widgets: Object.fromEntries(widgets.map((widget) => [widget.id, defaultSettings(widget)])),
  };
  if (typeof window === "undefined") return fallback;
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(storageKey(companyId, dashboardId)) ?? "{}",
    ) as Partial<StoredLayout>;
    const storedWidgets = stored.widgets ?? {};
    return {
      order: [
        ...(stored.order ?? []).filter((id) => widgets.some((widget) => widget.id === id)),
        ...widgets.map((widget) => widget.id).filter((id) => !(stored.order ?? []).includes(id)),
      ],
      widgets: Object.fromEntries(
        widgets.map((widget) => [
          widget.id,
          { ...defaultSettings(widget), ...storedWidgets[widget.id], id: widget.id },
        ]),
      ),
    };
  } catch {
    return fallback;
  }
}

export function DashboardDesigner({
  companyId,
  dashboardId,
  widgets,
}: {
  companyId?: string | null;
  dashboardId: string;
  widgets: DashboardWidget[];
}) {
  const [editing, setEditing] = useState(false);
  const [layout, setLayout] = useState(() => loadLayout(companyId, dashboardId, widgets));
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const widgetById = useMemo(
    () => new Map(widgets.map((widget) => [widget.id, widget])),
    [widgets],
  );
  const orderedWidgets = layout.order
    .map((id) => widgetById.get(id))
    .filter((widget): widget is DashboardWidget => Boolean(widget));

  function updateWidget(id: string, patch: Partial<DashboardWidgetSettings>) {
    setLayout((current) => ({
      ...current,
      widgets: {
        ...current.widgets,
        [id]: { ...current.widgets[id], ...patch },
      },
    }));
  }

  function moveWidget(targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    setLayout((current) => {
      const order = current.order.filter((id) => id !== draggedId);
      order.splice(order.indexOf(targetId), 0, draggedId);
      return { ...current, order };
    });
    setDraggedId(null);
  }

  function save() {
    window.localStorage.setItem(storageKey(companyId, dashboardId), JSON.stringify(layout));
    setEditing(false);
    toast.success("Layout do dashboard salvo");
  }

  function reset() {
    const next = loadLayout(null, `__reset_${dashboardId}`, widgets);
    window.localStorage.removeItem(storageKey(companyId, dashboardId));
    setLayout(next);
    toast.success("Layout padrão restaurado");
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="h-4 w-4 text-brass" />
          <div>
            <p className="text-xs font-bold text-pine-dark">Dashboard personalizável</p>
            <p className="text-[10px] text-muted-foreground">
              Grade de 12 colunas · arraste e monte sua própria visão
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {editing && (
            <>
              <button type="button" className="btn-ghost flex items-center gap-1 text-xs" onClick={reset}>
                <RotateCcw className="h-3.5 w-3.5" /> Restaurar
              </button>
              <button type="button" className="btn-primary flex items-center gap-1 text-xs" onClick={save}>
                <Save className="h-3.5 w-3.5" /> Salvar layout
              </button>
            </>
          )}
          <button
            type="button"
            className="btn-ghost flex items-center gap-1 text-xs"
            onClick={() => setEditing((value) => !value)}
          >
            <Settings2 className="h-3.5 w-3.5" />
            {editing ? "Fechar edição" : "Personalizar"}
          </button>
        </div>
      </div>

      {editing && (
        <div className="rounded-lg border border-brass/40 bg-brass/10 px-3 py-2 text-xs text-pine-dark">
          Arraste pelo ícone, altere título, cor, largura, altura ou tipo. Itens ocultos continuam
          disponíveis enquanto este modo estiver aberto.
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        {orderedWidgets.map((widget) => {
          const settings = layout.widgets[widget.id] ?? defaultSettings(widget);
          if (settings.hidden && !editing) return null;
          const wrapperStyle = {
            "--widget-color": settings.color,
            borderTopColor: settings.color,
            gridColumn: `span ${Math.min(12, Math.max(1, settings.columns))} / span ${Math.min(12, Math.max(1, settings.columns))}`,
            minHeight: settings.height,
            opacity: settings.hidden ? 0.5 : 1,
          } as CSSProperties;

          return (
            <div
              key={widget.id}
              draggable={editing}
              onDragStart={() => setDraggedId(widget.id)}
              onDragOver={(event) => editing && event.preventDefault()}
              onDrop={() => moveWidget(widget.id)}
              className={`min-w-0 overflow-hidden rounded-lg border-t-4 ${
                editing ? "border border-dashed border-brass bg-card p-2 shadow-md" : ""
              }`}
              style={wrapperStyle}
            >
              {editing && (
                <div className="mb-2 grid gap-2 rounded-md bg-muted p-2 sm:grid-cols-[auto_1fr_repeat(4,auto)]">
                  <GripVertical className="mt-2 h-4 w-4 cursor-grab text-muted-foreground" />
                  <input
                    className="field min-w-0 py-1 text-xs"
                    aria-label={`Título de ${widget.title}`}
                    value={settings.title}
                    onChange={(event) => updateWidget(widget.id, { title: event.target.value })}
                  />
                  <label className="text-[10px] font-semibold text-muted-foreground">
                    Cor
                    <input
                      type="color"
                      className="block h-7 w-10 cursor-pointer"
                      value={settings.color.startsWith("#") ? settings.color : "#234d38"}
                      onChange={(event) => updateWidget(widget.id, { color: event.target.value })}
                    />
                  </label>
                  <label className="text-[10px] font-semibold text-muted-foreground">
                    Largura
                    <select
                      className="field block py-1 text-xs"
                      value={settings.columns}
                      onChange={(event) =>
                        updateWidget(widget.id, { columns: Number(event.target.value) })
                      }
                    >
                      {[2, 3, 4, 6, 8, 9, 12].map((columns) => (
                        <option key={columns} value={columns}>{columns}/12</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-[10px] font-semibold text-muted-foreground">
                    Altura
                    <select
                      className="field block py-1 text-xs"
                      value={settings.height}
                      onChange={(event) =>
                        updateWidget(widget.id, { height: Number(event.target.value) })
                      }
                    >
                      {[90, 120, 180, 240, 300, 420, 560].map((height) => (
                        <option key={height} value={height}>{height}px</option>
                      ))}
                    </select>
                  </label>
                  {widget.chartTypes?.length ? (
                    <label className="text-[10px] font-semibold text-muted-foreground">
                      Tipo
                      <select
                        className="field block py-1 text-xs"
                        value={settings.chartType}
                        onChange={(event) =>
                          updateWidget(widget.id, {
                            chartType: event.target.value as DashboardChartType,
                          })
                        }
                      >
                        {widget.chartTypes.map((type) => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </label>
                  ) : <span />}
                  <button
                    type="button"
                    className="self-end rounded-md border border-border bg-card p-2"
                    aria-label={settings.hidden ? "Exibir item" : "Ocultar item"}
                    onClick={() => updateWidget(widget.id, { hidden: !settings.hidden })}
                  >
                    {settings.hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                </div>
              )}
              {widget.render(settings)}
            </div>
          );
        })}
      </div>
    </section>
  );
}
