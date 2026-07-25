import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  GripVertical,
  LayoutDashboard,
  Maximize2,
  RotateCcw,
  Save,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";

export type DashboardChartType =
  | "bar"
  | "horizontalBar"
  | "line"
  | "area"
  | "pie"
  | "doughnut"
  | "radar"
  | "composed";

export type DashboardWidgetSettings = {
  id: string;
  title: string;
  color: string;
  backgroundColor: string;
  backgroundOpacity: number;
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

const MIN_WIDGET_HEIGHT = 36;
const MAX_WIDGET_HEIGHT = 900;

function storageKey(companyId: string | null | undefined, dashboardId: string) {
  return `hotelreal.dashboard.v2.${companyId ?? "default"}.${dashboardId}`;
}

function defaultSettings(widget: DashboardWidget): DashboardWidgetSettings {
  return {
    id: widget.id,
    title: widget.title,
    color: widget.defaultColor ?? "var(--pine)",
    backgroundColor: "var(--card)",
    backgroundOpacity: 100,
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
  title = "Dashboard personalizável",
  description = "Arraste, redimensione e monte sua própria visão",
}: {
  companyId?: string | null;
  dashboardId: string;
  widgets: DashboardWidget[];
  title?: string;
  description?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [layout, setLayout] = useState(() => loadLayout(companyId, dashboardId, widgets));
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [resizing, setResizing] = useState<{
    id: string;
    startX: number;
    startY: number;
    startColumns: number;
    startHeight: number;
    gridWidth: number;
  } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const autoScrollDirectionRef = useRef(0);
  const widgetById = useMemo(
    () => new Map(widgets.map((widget) => [widget.id, widget])),
    [widgets],
  );
  const orderedWidgets = layout.order
    .map((id) => widgetById.get(id))
    .filter((widget): widget is DashboardWidget => Boolean(widget));

  useEffect(() => {
    if (!resizing) return;
    function onPointerMove(event: PointerEvent) {
      const columnWidth = Math.max(56, (resizing!.gridWidth - 33) / 12);
      const columns = Math.min(
        12,
        Math.max(1, Math.round(resizing!.startColumns + (event.clientX - resizing!.startX) / columnWidth)),
      );
      const height = Math.min(
        MAX_WIDGET_HEIGHT,
        Math.max(
          MIN_WIDGET_HEIGHT,
          Math.round((resizing!.startHeight + event.clientY - resizing!.startY) / 4) * 4,
        ),
      );
      setLayout((current) => ({
        ...current,
        widgets: {
          ...current.widgets,
          [resizing!.id]: {
            ...current.widgets[resizing!.id],
            columns,
            height,
          },
        },
      }));
    }
    function onPointerUp() {
      setResizing(null);
    }
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [resizing]);

  useEffect(
    () => () => {
      if (autoScrollFrameRef.current != null) {
        window.cancelAnimationFrame(autoScrollFrameRef.current);
      }
    },
    [],
  );

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
    stopAutoScroll();
  }

  function moveWidgetToEdge(edge: "start" | "end") {
    if (!draggedId) return;
    setLayout((current) => {
      const order = current.order.filter((id) => id !== draggedId);
      if (edge === "start") order.unshift(draggedId);
      else order.push(draggedId);
      return { ...current, order };
    });
    setDraggedId(null);
    stopAutoScroll();
  }

  function moveWidgetBy(id: string, offset: -1 | 1) {
    setLayout((current) => {
      const currentIndex = current.order.indexOf(id);
      const targetIndex = Math.min(
        current.order.length - 1,
        Math.max(0, currentIndex + offset),
      );
      if (currentIndex < 0 || currentIndex === targetIndex) return current;
      const order = [...current.order];
      order.splice(currentIndex, 1);
      order.splice(targetIndex, 0, id);
      return { ...current, order };
    });
  }

  function stopAutoScroll() {
    autoScrollDirectionRef.current = 0;
    if (autoScrollFrameRef.current != null) {
      window.cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }
  }

  function runAutoScroll() {
    if (!autoScrollDirectionRef.current) {
      autoScrollFrameRef.current = null;
      return;
    }
    window.scrollBy(0, autoScrollDirectionRef.current * 14);
    autoScrollFrameRef.current = window.requestAnimationFrame(runAutoScroll);
  }

  function updateAutoScroll(clientY: number) {
    const edgeSize = Math.min(140, Math.max(80, window.innerHeight * 0.16));
    const direction = clientY < edgeSize ? -1 : clientY > window.innerHeight - edgeSize ? 1 : 0;
    autoScrollDirectionRef.current = direction;
    if (direction && autoScrollFrameRef.current == null) {
      autoScrollFrameRef.current = window.requestAnimationFrame(runAutoScroll);
    } else if (!direction) {
      stopAutoScroll();
    }
  }

  function startDragging(event: ReactDragEvent<HTMLButtonElement>, id: string) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
    setDraggedId(id);
  }

  function finishDragging() {
    setDraggedId(null);
    stopAutoScroll();
  }

  function startResize(
    event: ReactPointerEvent<HTMLButtonElement>,
    settings: DashboardWidgetSettings,
  ) {
    event.preventDefault();
    event.stopPropagation();
    setResizing({
      id: settings.id,
      startX: event.clientX,
      startY: event.clientY,
      startColumns: settings.columns,
      startHeight: settings.height,
      gridWidth: gridRef.current?.clientWidth ?? 1200,
    });
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
            <p className="text-xs font-bold text-pine-dark">{title}</p>
            <p className="text-[10px] text-muted-foreground">
              {description}
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
          Arraste pelo ícone e defina título, cor, largura, altura ou tipo. A altura aceita desde
          36 px; cards muito pequenos podem ocultar parte do conteúdo. Itens ocultos continuam
          disponíveis neste modo.
        </div>
      )}

      <div
        ref={gridRef}
        className="grid grid-cols-1 gap-3 lg:grid-cols-12"
        onDragOver={(event) => {
          if (!editing || !draggedId) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          updateAutoScroll(event.clientY);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            stopAutoScroll();
          }
        }}
      >
        {editing && draggedId && (
          <button
            type="button"
            className="sticky top-2 z-30 col-span-full rounded-lg border-2 border-dashed border-brass bg-brass/95 px-3 py-2 text-xs font-bold text-pine-dark shadow-lg"
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => moveWidgetToEdge("start")}
          >
            Solte aqui para mover para o início
          </button>
        )}
        {orderedWidgets.map((widget) => {
          const settings = layout.widgets[widget.id] ?? defaultSettings(widget);
          if (settings.hidden && !editing) return null;
          const wrapperStyle = {
            "--widget-color": settings.color,
            "--widget-background": settings.backgroundColor,
            borderTopColor: settings.color,
            background: `color-mix(in srgb, ${settings.backgroundColor} ${settings.backgroundOpacity}%, transparent)`,
            gridColumn: `span ${Math.min(12, Math.max(1, settings.columns))} / span ${Math.min(12, Math.max(1, settings.columns))}`,
            height: editing ? Math.max(140, settings.height) : settings.height,
            opacity: settings.hidden ? 0.5 : 1,
          } as CSSProperties;

          return (
            <div
              key={widget.id}
              onDragOver={(event) => {
                if (!editing) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={() => moveWidget(widget.id)}
              className={`dashboard-widget relative min-w-0 overflow-hidden rounded-lg border-t-4 ${
                editing ? "border border-dashed border-brass bg-card p-2 shadow-md" : ""
              }`}
              style={wrapperStyle}
            >
              {editing && (
                <div className="mb-2 grid gap-2 rounded-md bg-muted p-2 sm:grid-cols-[auto_1fr_repeat(4,auto)]">
                  <button
                    type="button"
                    draggable={editing}
                    onDragStart={(event) => startDragging(event, widget.id)}
                    onDragEnd={finishDragging}
                    className="mt-1 cursor-grab rounded p-1 text-muted-foreground hover:bg-card active:cursor-grabbing"
                    aria-label={`Mover ${settings.title}`}
                    title="Arraste para mover"
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>
                  <div className="flex items-start gap-1">
                    <button
                      type="button"
                      className="rounded border border-border bg-card p-1 text-muted-foreground hover:text-pine"
                      onClick={() => moveWidgetBy(widget.id, -1)}
                      aria-label={`Mover ${settings.title} uma posição para cima`}
                      title="Mover uma posição para cima"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="rounded border border-border bg-card p-1 text-muted-foreground hover:text-pine"
                      onClick={() => moveWidgetBy(widget.id, 1)}
                      aria-label={`Mover ${settings.title} uma posição para baixo`}
                      title="Mover uma posição para baixo"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <input
                    className="field min-w-0 py-1 text-xs"
                    aria-label={`Título de ${widget.title}`}
                    value={settings.title}
                    onChange={(event) => updateWidget(widget.id, { title: event.target.value })}
                  />
                  <span className="self-end whitespace-nowrap pb-1 text-[9px] font-semibold text-muted-foreground">
                    {settings.columns}/12 · {settings.height}px
                  </span>
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
                    Fundo
                    <input
                      type="color"
                      className="block h-7 w-10 cursor-pointer"
                      value={
                        settings.backgroundColor.startsWith("#")
                          ? settings.backgroundColor
                          : "#fffdf8"
                      }
                      onChange={(event) =>
                        updateWidget(widget.id, { backgroundColor: event.target.value })
                      }
                    />
                  </label>
                  <label className="text-[10px] font-semibold text-muted-foreground">
                    Opacidade
                    <input
                      className="field block w-20 py-1 text-xs"
                      type="number"
                      min={0}
                      max={100}
                      value={settings.backgroundOpacity}
                      onChange={(event) =>
                        updateWidget(widget.id, {
                          backgroundOpacity: Math.min(
                            100,
                            Math.max(0, Number(event.target.value) || 0),
                          ),
                        })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="self-end rounded border border-border bg-card px-2 py-1.5 text-[9px] font-bold text-muted-foreground"
                    onClick={() =>
                      updateWidget(widget.id, {
                        backgroundColor: "var(--card)",
                        backgroundOpacity: 100,
                      })
                    }
                    title="Usar o fundo definido no tema do sistema"
                  >
                    Fundo do tema
                  </button>
                  <label className="text-[10px] font-semibold text-muted-foreground">
                    Largura
                    <input
                      className="field block w-20 py-1 text-xs"
                      type="number"
                      min={1}
                      max={12}
                      step={1}
                      value={settings.columns}
                      onChange={(event) =>
                        updateWidget(widget.id, {
                          columns: Math.min(12, Math.max(1, Number(event.target.value) || 1)),
                        })
                      }
                    />
                  </label>
                  <label className="text-[10px] font-semibold text-muted-foreground">
                    Altura
                    <input
                      className="field block w-24 py-1 text-xs"
                      type="number"
                      min={MIN_WIDGET_HEIGHT}
                      max={MAX_WIDGET_HEIGHT}
                      step={1}
                      value={settings.height}
                      onChange={(event) =>
                        updateWidget(widget.id, {
                          height: Math.min(
                            MAX_WIDGET_HEIGHT,
                            Math.max(MIN_WIDGET_HEIGHT, Number(event.target.value) || MIN_WIDGET_HEIGHT),
                          ),
                        })
                      }
                    />
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
              {editing && (
                <button
                  type="button"
                  onPointerDown={(event) => startResize(event, settings)}
                  className="absolute bottom-1 right-1 z-20 cursor-se-resize rounded-tl-lg border border-brass/45 bg-brass p-2 text-pine-dark shadow"
                  aria-label={`Redimensionar ${settings.title}`}
                  title="Arraste para redimensionar largura e altura"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
              )}
            </div>
          );
        })}
        {editing && draggedId && (
          <button
            type="button"
            className="col-span-full rounded-lg border-2 border-dashed border-brass bg-brass/15 px-3 py-3 text-xs font-bold text-pine-dark"
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => moveWidgetToEdge("end")}
          >
            Solte aqui para mover para o final
          </button>
        )}
      </div>
    </section>
  );
}
