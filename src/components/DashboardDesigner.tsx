import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
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
  "bar" | "horizontalBar" | "line" | "area" | "pie" | "doughnut" | "radar" | "composed";

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
  const [dragging, setDragging] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const [resizing, setResizing] = useState<{
    id: string;
    startX: number;
    startY: number;
    startColumns: number;
    startHeight: number;
    gridWidth: number;
  } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const draggedIdRef = useRef<string | null>(null);
  const lastPointerRef = useRef({ x: 0, y: 0 });
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
        Math.max(
          1,
          Math.round(resizing!.startColumns + (event.clientX - resizing!.startX) / columnWidth),
        ),
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

  function moveWidgetNear(targetId: string, placeAfter: boolean) {
    const draggedId = draggedIdRef.current;
    if (!draggedId || draggedId === targetId) return;
    setLayout((current) => {
      const order = current.order.filter((id) => id !== draggedId);
      const targetIndex = order.indexOf(targetId);
      if (targetIndex < 0) return current;
      order.splice(targetIndex + (placeAfter ? 1 : 0), 0, draggedId);
      if (order.every((id, index) => id === current.order[index])) return current;
      return { ...current, order };
    });
  }

  function moveWidgetToEdge(edge: "start" | "end") {
    const draggedId = draggedIdRef.current;
    if (!draggedId) return;
    setLayout((current) => {
      const order = current.order.filter((id) => id !== draggedId);
      if (edge === "start") order.unshift(draggedId);
      else order.push(draggedId);
      if (order.every((id, index) => id === current.order[index])) return current;
      return { ...current, order };
    });
  }

  function reorderAtPoint(clientX: number, clientY: number) {
    const grid = gridRef.current;
    const draggedId = draggedIdRef.current;
    if (!grid || !draggedId) return;

    const gridRect = grid.getBoundingClientRect();
    if (
      clientX < gridRect.left ||
      clientX > gridRect.right ||
      clientY < gridRect.top - 24 ||
      clientY > gridRect.bottom + 24
    ) {
      return;
    }

    const candidates = Array.from(
      grid.querySelectorAll<HTMLElement>("[data-dashboard-widget-id]"),
    ).filter((element) => element.dataset.dashboardWidgetId !== draggedId);

    if (!candidates.length) return;
    if (clientY <= gridRect.top + 18) {
      moveWidgetToEdge("start");
      return;
    }
    if (clientY >= gridRect.bottom - 18) {
      moveWidgetToEdge("end");
      return;
    }

    let closest = candidates[0];
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
      const rect = candidate.getBoundingClientRect();
      const dx =
        clientX < rect.left ? rect.left - clientX : clientX > rect.right ? clientX - rect.right : 0;
      const dy =
        clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0;
      const distance = Math.hypot(dx, dy);
      if (distance < closestDistance) {
        closest = candidate;
        closestDistance = distance;
      }
    }

    const rect = closest.getBoundingClientRect();
    const sameRow =
      clientY >= rect.top + rect.height * 0.25 && clientY <= rect.bottom - rect.height * 0.25;
    const placeAfter = sameRow
      ? clientX > rect.left + rect.width / 2
      : clientY > rect.top + rect.height / 2;
    moveWidgetNear(closest.dataset.dashboardWidgetId!, placeAfter);
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
    reorderAtPoint(lastPointerRef.current.x, lastPointerRef.current.y);
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

  function startDragging(event: ReactPointerEvent<HTMLButtonElement>, id: string) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    draggedIdRef.current = id;
    lastPointerRef.current = { x: event.clientX, y: event.clientY };
    setDragging({ id, x: event.clientX, y: event.clientY });
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
  }

  function finishDragging() {
    draggedIdRef.current = null;
    setDragging(null);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    stopAutoScroll();
  }

  useEffect(() => {
    if (!dragging) return;

    function onPointerMove(event: PointerEvent) {
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
      setDragging((current) =>
        current ? { ...current, x: event.clientX, y: event.clientY } : current,
      );
      reorderAtPoint(event.clientX, event.clientY);
      updateAutoScroll(event.clientY);
    }

    function onPointerUp() {
      finishDragging();
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
    window.addEventListener("pointercancel", onPointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [dragging?.id]);

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
            <p className="text-[10px] text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {editing && (
            <>
              <button
                type="button"
                className="btn-ghost flex items-center gap-1 text-xs"
                onClick={reset}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Restaurar
              </button>
              <button
                type="button"
                className="btn-primary flex items-center gap-1 text-xs"
                onClick={save}
              >
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
          Arraste pelo ícone e defina título, cor, largura, altura ou tipo. A altura aceita desde 36
          px; cards muito pequenos podem ocultar parte do conteúdo. Itens ocultos continuam
          disponíveis neste modo.
        </div>
      )}

      <div ref={gridRef} className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        {orderedWidgets.map((widget) => {
          const settings = layout.widgets[widget.id] ?? defaultSettings(widget);
          if (settings.hidden && !editing) return null;
          const wrapperStyle = {
            "--widget-color": settings.color,
            "--widget-background": settings.backgroundColor,
            borderTopColor: settings.color,
            background: `color-mix(in srgb, ${settings.backgroundColor} ${settings.backgroundOpacity}%, transparent)`,
            gridColumn: `span ${Math.min(12, Math.max(1, settings.columns))} / span ${Math.min(12, Math.max(1, settings.columns))}`,
            height: settings.height,
            opacity: settings.hidden ? 0.5 : dragging?.id === widget.id ? 0.35 : 1,
          } as CSSProperties;

          return (
            <div
              key={widget.id}
              data-dashboard-widget-id={widget.id}
              className={`dashboard-widget relative min-w-0 rounded-lg border-t-4 ${
                editing
                  ? "overflow-visible border border-dashed border-brass bg-card p-2 shadow-md"
                  : "overflow-hidden"
              }`}
              style={wrapperStyle}
            >
              {editing && (
                <div className="mb-2 grid gap-2 rounded-md bg-muted p-2 sm:grid-cols-[auto_1fr_repeat(4,auto)]">
                  <button
                    type="button"
                    onPointerDown={(event) => startDragging(event, widget.id)}
                    className="mt-1 cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-card active:cursor-grabbing"
                    aria-label={`Mover ${settings.title}`}
                    title="Segure e arraste com o mouse para qualquer posição"
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>
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
                            Math.max(
                              MIN_WIDGET_HEIGHT,
                              Number(event.target.value) || MIN_WIDGET_HEIGHT,
                            ),
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
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <span />
                  )}
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
      </div>
      {dragging && (
        <div
          className="pointer-events-none fixed z-[100] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-brass bg-card/95 px-3 py-2 text-xs font-bold text-pine-dark shadow-xl"
          style={{ left: dragging.x, top: dragging.y }}
        >
          <GripVertical className="mr-1 inline h-4 w-4" />
          {layout.widgets[dragging.id]?.title ?? "Mover item"}
        </div>
      )}
    </section>
  );
}
