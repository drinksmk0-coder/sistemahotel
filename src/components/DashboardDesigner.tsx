import {
  useEffect,
  useEffectEvent,
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
  contentScale: number;
  fontSize: number;
  autoFit: boolean;
  showLegend: boolean;
  showLabels: boolean;
  showAccentBorder: boolean;
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

const MIN_WIDGET_HEIGHT = 2;
const MAX_WIDGET_HEIGHT = 1200;

function storageKey(companyId: string | null | undefined, dashboardId: string) {
  return `hotelreal.dashboard.v6r2.${companyId ?? "default"}.${dashboardId}`;
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
    contentScale: 100,
    fontSize: 100,
    autoFit: true,
    showLegend: true,
    showLabels: widget.kind === "chart",
    showAccentBorder: false,
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
    const current = window.localStorage.getItem(storageKey(companyId, dashboardId));
    const stored = JSON.parse(current ?? "{}") as Partial<StoredLayout>;
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  const selectedWidget = selectedId ? widgetById.get(selectedId) : undefined;
  const selectedSettings = selectedId ? layout.widgets[selectedId] : undefined;

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
    setSelectedId(id);
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

  const handleDraggingPointerMove = useEffectEvent((event: PointerEvent) => {
    lastPointerRef.current = { x: event.clientX, y: event.clientY };
    setDragging((current) =>
      current ? { ...current, x: event.clientX, y: event.clientY } : current,
    );
    reorderAtPoint(event.clientX, event.clientY);
    updateAutoScroll(event.clientY);
  });

  const handleDraggingEnd = useEffectEvent(() => {
    finishDragging();
  });

  const draggingId = dragging?.id;
  useEffect(() => {
    if (!draggingId) return;

    function onPointerMove(event: PointerEvent) {
      handleDraggingPointerMove(event);
    }

    function onPointerUp() {
      handleDraggingEnd();
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
    window.addEventListener("pointercancel", onPointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [draggingId]);

  function startResize(
    event: ReactPointerEvent<HTMLButtonElement>,
    settings: DashboardWidgetSettings,
  ) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(settings.id);
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
    setSelectedId(null);
    toast.success("Layout do dashboard salvo");
  }

  function reset() {
    const next = loadLayout(null, `__reset_${dashboardId}`, widgets);
    window.localStorage.removeItem(storageKey(companyId, dashboardId));
    setLayout(next);
    setSelectedId(null);
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
            onClick={() => {
              setEditing((value) => !value);
              setSelectedId(null);
            }}
          >
            <Settings2 className="h-3.5 w-3.5" />
            {editing ? "Fechar edição" : "Personalizar"}
          </button>
        </div>
      </div>

      {editing && (
        <EditorPanel
          widget={selectedWidget}
          settings={selectedSettings}
          widgets={orderedWidgets}
          onSelect={setSelectedId}
          onChange={(patch) => selectedId && updateWidget(selectedId, patch)}
        />
      )}

      <div ref={gridRef} className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        {orderedWidgets.map((widget) => {
          const settings = layout.widgets[widget.id] ?? defaultSettings(widget);
          if (settings.hidden && !editing) return null;
          const defaultHeight = widget.defaultHeight ?? (widget.kind === "kpi" ? 110 : 290);
          const defaultColumns = widget.defaultColumns ?? (widget.kind === "kpi" ? 2 : 6);
          const autoScale = Math.min(
            1,
            Math.max(
              0.08,
              Math.min(settings.columns / defaultColumns, settings.height / defaultHeight),
            ),
          );
          const scale = Math.max(
            0.05,
            (settings.contentScale / 100) * (settings.autoFit ? autoScale : 1),
          );
          const wrapperStyle = {
            "--widget-color": settings.color,
            "--widget-background": settings.backgroundColor,
            "--widget-columns": Math.min(12, Math.max(1, settings.columns)),
            "--widget-font-size": `${settings.fontSize}%`,
            borderTopColor: settings.showAccentBorder ? settings.color : "transparent",
            borderTopWidth: settings.showAccentBorder ? 4 : 0,
            borderTopStyle: "solid",
            background: `color-mix(in srgb, ${settings.backgroundColor} ${settings.backgroundOpacity}%, transparent)`,
            height: settings.height,
            opacity: settings.hidden ? 0.5 : dragging?.id === widget.id ? 0.35 : 1,
          } as CSSProperties;
          const contentStyle = {
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            width: `${100 / scale}%`,
            height: `${100 / scale}%`,
            fontSize: `${settings.fontSize}%`,
          } as CSSProperties;

          return (
            <div
              key={widget.id}
              data-dashboard-widget-id={widget.id}
              className={`dashboard-widget dashboard-designer-widget relative min-w-0 overflow-hidden rounded-xl border border-border/80 shadow-[0_4px_18px_rgba(15,35,60,0.045)] transition-shadow hover:shadow-[0_8px_24px_rgba(15,35,60,0.075)] ${
                editing
                  ? selectedId === widget.id
                    ? "z-10 border-2 border-brass shadow-md"
                    : "border border-dashed border-muted-foreground/45"
                  : ""
              }`}
              style={wrapperStyle}
            >
              {editing && (
                  <button
                    type="button"
                    onPointerDown={(event) => startDragging(event, widget.id)}
                    onClick={() => setSelectedId(widget.id)}
                    className="absolute left-1 top-1 z-30 flex touch-none cursor-grab items-center gap-1 rounded-md border border-border bg-card/95 px-1.5 py-1 text-[9px] font-bold text-pine-dark shadow active:cursor-grabbing"
                    aria-label={`Selecionar e mover ${settings.title}`}
                    title="Segure e arraste com o mouse"
                  >
                    <GripVertical className="h-3.5 w-3.5" />
                    <span className="max-w-24 truncate">{settings.title}</span>
                  </button>
              )}
              <div className="h-full overflow-hidden rounded-[inherit]">
                <div className="dashboard-designer-content h-full min-w-0" style={contentStyle}>
                  {widget.render(settings)}
                </div>
              </div>
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

function EditorPanel({
  widget,
  settings,
  widgets,
  onSelect,
  onChange,
}: {
  widget?: DashboardWidget;
  settings?: DashboardWidgetSettings;
  widgets: DashboardWidget[];
  onSelect: (id: string) => void;
  onChange: (patch: Partial<DashboardWidgetSettings>) => void;
}) {
  return (
    <aside className="rounded-lg border border-brass/40 bg-brass/5 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <strong className="text-xs text-pine-dark">Editar item:</strong>
        <select
          className="field h-8 min-w-52 py-1 text-xs"
          value={settings?.id ?? ""}
          onChange={(event) => onSelect(event.target.value)}
        >
          <option value="" disabled>Selecione um card ou gráfico</option>
          {widgets.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
        <span className="text-[10px] text-muted-foreground">
          Os controles ficam aqui para não cobrir os dados. Arraste pela alça do item.
        </span>
      </div>

      {widget && settings ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          <EditorField label="Título" wide>
            <input className="field h-8 py-1 text-xs" value={settings.title} onChange={(event) => onChange({ title: event.target.value })} />
          </EditorField>
          <NumberEditor label="Largura (1–12)" min={1} max={12} value={settings.columns} onValue={(columns) => onChange({ columns })} />
          <NumberEditor label="Altura (2–1200 px)" min={MIN_WIDGET_HEIGHT} max={MAX_WIDGET_HEIGHT} value={settings.height} onValue={(height) => onChange({ height })} />
          <NumberEditor label="Conteúdo (%)" min={5} max={200} value={settings.contentScale} onValue={(contentScale) => onChange({ contentScale })} />
          <NumberEditor label="Letras/números (%)" min={25} max={200} value={settings.fontSize} onValue={(fontSize) => onChange({ fontSize })} />
          {widget.chartTypes?.length ? (
            <EditorField label="Tipo de gráfico">
              <select className="field h-8 py-1 text-xs" value={settings.chartType} onChange={(event) => onChange({ chartType: event.target.value as DashboardChartType })}>
                {widget.chartTypes.map((type) => <option key={type} value={type}>{chartTypeLabel(type)}</option>)}
              </select>
            </EditorField>
          ) : <span />}
          <EditorField label="Cor principal">
            <input type="color" className="h-8 w-full cursor-pointer rounded border border-border bg-card" value={settings.color.startsWith("#") ? settings.color : "#234d38"} onChange={(event) => onChange({ color: event.target.value })} />
          </EditorField>
          <EditorField label="Cor do fundo">
            <input type="color" className="h-8 w-full cursor-pointer rounded border border-border bg-card" value={settings.backgroundColor.startsWith("#") ? settings.backgroundColor : "#fffdf8"} onChange={(event) => onChange({ backgroundColor: event.target.value })} />
          </EditorField>
          <NumberEditor label="Opacidade (%)" min={0} max={100} value={settings.backgroundOpacity} onValue={(backgroundOpacity) => onChange({ backgroundOpacity })} />
          <Toggle label="Autoajustar conteúdo" value={settings.autoFit} onChange={(autoFit) => onChange({ autoFit })} />
          <Toggle label="Mostrar legenda" value={settings.showLegend} onChange={(showLegend) => onChange({ showLegend })} />
          <Toggle label="Mostrar rótulos" value={settings.showLabels} onChange={(showLabels) => onChange({ showLabels })} />
          <Toggle label="Borda superior" value={settings.showAccentBorder} onChange={(showAccentBorder) => onChange({ showAccentBorder })} />
          <button type="button" className="flex h-8 items-center justify-center gap-1 self-end rounded-md border border-border bg-card px-2 text-xs font-semibold text-muted-foreground" onClick={() => onChange({ hidden: !settings.hidden })}>
            {settings.hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            {settings.hidden ? "Exibir" : "Ocultar"}
          </button>
        </div>
      ) : (
        <p className="rounded-md bg-card px-3 py-2 text-xs text-muted-foreground">
          Selecione um item para editar tamanho, conteúdo, letras, cores, legenda e rótulos.
        </p>
      )}
    </aside>
  );
}

function EditorField({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={`text-[10px] font-semibold text-muted-foreground ${wide ? "sm:col-span-2" : ""}`}>{label}{children}</label>;
}

function NumberEditor({ label, min, max, value, onValue }: { label: string; min: number; max: number; value: number; onValue: (value: number) => void }) {
  return (
    <EditorField label={label}>
      <input className="field h-8 py-1 text-xs" type="number" min={min} max={max} value={value} onChange={(event) => onValue(Math.min(max, Math.max(min, Number(event.target.value) || min)))} />
    </EditorField>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex h-8 items-center gap-2 self-end rounded-md border border-border bg-card px-2 text-[10px] font-semibold text-muted-foreground">
      <input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function chartTypeLabel(type: DashboardChartType) {
  return { bar: "Colunas", horizontalBar: "Barras horizontais", line: "Linhas", area: "Área", pie: "Pizza", doughnut: "Rosca", radar: "Radar", composed: "Composto" }[type];
}
