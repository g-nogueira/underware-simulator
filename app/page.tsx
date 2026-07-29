"use client";

import {
  ChangeEvent,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  SYSTEM_SPECS,
  calculateRouteLength,
  calculatePrintPlan,
  getCapacityState,
  getPowerBrickOutletLayout,
  insertRouteBend,
  moveRoutePoint,
  resizeItemFromCorner,
  snapToGrid,
  translateRoute,
  validatePlanFile,
} from "@/lib/planner.mjs";

type SystemId = "openGrid" | "underware";
type ToolId =
  | "select"
  | "channel"
  | "route"
  | "power-brick"
  | "holder"
  | "obstacle";
type ItemKind = "channel" | "power-brick" | "holder" | "obstacle";

type PlannerItem = {
  id: string;
  kind: ItemKind;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: 0 | 90 | 180 | 270;
  cables?: number;
  outlets?: number;
};

type CableRoute = {
  id: string;
  name: string;
  color: string;
  points: Array<[number, number]>;
  diameter: number;
};

type PlanFile = {
  version: 1;
  name: string;
  system: SystemId;
  desk: { width: number; depth: number };
  items: PlannerItem[];
  routes: CableRoute[];
  savedAt?: string;
};

type PlanSnapshot = Pick<PlanFile, "system" | "desk" | "items" | "routes">;

type TraceEvent = {
  timestamp: string;
  level: "info" | "warn";
  event: string;
  traceId: string;
  details?: Record<string, unknown>;
};

type ResizeCorner = "nw" | "ne" | "sw" | "se";

type CanvasInteraction =
  | { type: "move-item"; id: string; dx: number; dy: number }
  | {
      type: "resize-item";
      id: string;
      corner: ResizeCorner;
      startItem: PlannerItem;
    }
  | {
      type: "move-route";
      id: string;
      startX: number;
      startY: number;
      startPoints: CableRoute["points"];
    }
  | { type: "route-point"; id: string; pointIndex: number };

const AUTOSAVE_KEY = "underware-route-lab:plan:v1";

const SYSTEMS = {
  openGrid: {
    label: SYSTEM_SPECS.openGrid.label,
    grid: SYSTEM_SPECS.openGrid.grid,
    capacity: SYSTEM_SPECS.openGrid.channelCapacity,
  },
  underware: {
    label: SYSTEM_SPECS.underware.label,
    grid: SYSTEM_SPECS.underware.grid,
    capacity: SYSTEM_SPECS.underware.channelCapacity,
  },
} as const;

const TOOLS: Array<{ id: ToolId; icon: string; label: string }> = [
  { id: "select", icon: "↖", label: "Select" },
  { id: "channel", icon: "▣", label: "Channel" },
  { id: "route", icon: "⌁", label: "Cable route" },
  { id: "power-brick", icon: "▯", label: "Power brick" },
  { id: "holder", icon: "⊔", label: "Device holder" },
  { id: "obstacle", icon: "▧", label: "Obstacle" },
];

const INITIAL_ITEMS: PlannerItem[] = [
  {
    id: "frame-top",
    kind: "obstacle",
    name: "Rear frame",
    x: 126,
    y: 76,
    width: 1348,
    height: 64,
    rotation: 0,
  },
  {
    id: "frame-left",
    kind: "obstacle",
    name: "Left frame",
    x: 126,
    y: 76,
    width: 64,
    height: 250,
    rotation: 0,
  },
  {
    id: "frame-right",
    kind: "obstacle",
    name: "Right frame",
    x: 1410,
    y: 76,
    width: 64,
    height: 250,
    rotation: 0,
  },
  {
    id: "power-strip",
    kind: "power-brick",
    name: "6-outlet power strip",
    x: 590,
    y: 174,
    width: 420,
    height: 80,
    rotation: 0,
    outlets: 6,
  },
  {
    id: "channel-left",
    kind: "channel",
    name: "Straight channel",
    x: 280,
    y: 304,
    width: 56,
    height: 336,
    rotation: 90,
    cables: 4,
  },
  {
    id: "channel-middle",
    kind: "channel",
    name: "Straight channel",
    x: 336,
    y: 584,
    width: 504,
    height: 56,
    rotation: 0,
    cables: 5,
  },
  {
    id: "channel-bottom",
    kind: "channel",
    name: "Straight channel",
    x: 840,
    y: 584,
    width: 448,
    height: 56,
    rotation: 0,
    cables: 5,
  },
  {
    id: "channel-right",
    kind: "channel",
    name: "Straight channel",
    x: 1288,
    y: 304,
    width: 56,
    height: 336,
    rotation: 90,
    cables: 5,
  },
  {
    id: "holder-left",
    kind: "holder",
    name: "Mini PC holder",
    x: 400,
    y: 664,
    width: 150,
    height: 86,
    rotation: 0,
  },
  {
    id: "holder-right",
    kind: "holder",
    name: "USB hub holder",
    x: 1048,
    y: 664,
    width: 150,
    height: 86,
    rotation: 0,
  },
];

const INITIAL_ROUTES: CableRoute[] = [
  {
    id: "route-power",
    name: "PC power",
    color: "#56d7e4",
    diameter: 7,
    points: [
      [690, 252],
      [690, 360],
      [1316, 360],
      [1316, 612],
      [1086, 612],
    ],
  },
  {
    id: "route-display",
    name: "DisplayPort",
    color: "#5294ff",
    diameter: 6,
    points: [
      [912, 252],
      [912, 412],
      [1308, 412],
      [1308, 624],
      [730, 624],
    ],
  },
  {
    id: "route-usb",
    name: "USB hub",
    color: "#ffb020",
    diameter: 4,
    points: [
      [640, 252],
      [640, 388],
      [308, 388],
      [308, 612],
      [474, 612],
    ],
  },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function itemLabel(kind: ItemKind) {
  return {
    channel: "Straight channel",
    "power-brick": "Power brick mount",
    holder: "Device holder",
    obstacle: "Reserved area",
  }[kind];
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function Home() {
  const [system, setSystem] = useState<SystemId>("openGrid");
  const [activeTool, setActiveTool] = useState<ToolId>("select");
  const [planName, setPlanName] = useState("Gustavo’s desk");
  const [desk, setDesk] = useState({ width: 1600, depth: 800 });
  const [deskDraft, setDeskDraft] = useState({ width: 1600, depth: 800 });
  const [items, setItems] = useState<PlannerItem[]>(INITIAL_ITEMS);
  const [routes, setRoutes] = useState<CableRoute[]>(INITIAL_ROUTES);
  const [selectedId, setSelectedId] = useState("channel-middle");
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [zoom, setZoom] = useState(88);
  const [printOpen, setPrintOpen] = useState(false);
  const [deskOpen, setDeskOpen] = useState(false);
  const [traceOpen, setTraceOpen] = useState(false);
  const [traceId, setTraceId] = useState("starting");
  const [traceEvents, setTraceEvents] = useState<TraceEvent[]>([]);
  const [readyToSave, setReadyToSave] = useState(false);
  const [savedAt, setSavedAt] = useState("");
  const [historyState, setHistoryState] = useState({ undo: 0, redo: 0 });
  const [toast, setToast] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const interaction = useRef<CanvasInteraction | null>(null);
  const past = useRef<PlanSnapshot[]>([]);
  const future = useRef<PlanSnapshot[]>([]);
  const traceIdRef = useRef("starting");

  const selected = items.find((item) => item.id === selectedId) ?? null;
  const selectedRoute =
    routes.find((route) => route.id === selectedRouteId) ?? null;
  const systemSpec = SYSTEMS[system];
  const capacity = selected?.kind === "channel" ? selected.cables ?? 0 : 0;
  const capacityState = getCapacityState(capacity, systemSpec.capacity) as {
    percent: number;
    level: "ok" | "near" | "over";
    remaining: number;
  };
  const selectedRouteLength = selectedRoute
    ? Math.round(calculateRouteLength(selectedRoute.points))
    : 0;
  const printPlan = useMemo(
    () =>
      calculatePrintPlan(items, system) as {
        partsCount: number;
        printMinutes: number;
        filamentGrams: number;
        groups: Array<{ label: string; count: number }>;
        overCapacityIds: string[];
      },
    [items, system],
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const nextTraceId = window.crypto?.randomUUID?.() ?? makeId("trace");
      traceIdRef.current = nextTraceId;
      setTraceId(nextTraceId);

      const saved = window.localStorage.getItem(AUTOSAVE_KEY);
      if (saved) {
        try {
          const result = validatePlanFile(JSON.parse(saved)) as {
            ok: boolean;
            plan?: PlanFile;
          };
          if (result.ok && result.plan) {
            setPlanName(result.plan.name);
            setSystem(result.plan.system);
            setDesk(result.plan.desk);
            setDeskDraft(result.plan.desk);
            setItems(result.plan.items);
            setRoutes(result.plan.routes);
            setSelectedId(result.plan.items[0]?.id ?? "");
            setSelectedRouteId("");
            setSavedAt(result.plan.savedAt ?? "restored");
          }
        } catch {
          window.localStorage.removeItem(AUTOSAVE_KEY);
        }
      }

      setTraceEvents([
        {
          timestamp: new Date().toISOString(),
          level: "info",
          event: saved ? "plan.autosave_restored" : "plan.started",
          traceId: nextTraceId,
        },
      ]);
      setReadyToSave(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!readyToSave) return;
    const timeout = window.setTimeout(() => {
      const timestamp = new Date().toISOString();
      const plan: PlanFile = {
        version: 1,
        name: planName,
        system,
        desk,
        items,
        routes,
        savedAt: timestamp,
      };
      window.localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(plan));
      setSavedAt(timestamp);
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [desk, items, planName, readyToSave, routes, system]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  }

  function emitLog(
    event: string,
    details?: Record<string, unknown>,
    level: TraceEvent["level"] = "info",
  ) {
    const entry: TraceEvent = {
      timestamp: new Date().toISOString(),
      level,
      event,
      traceId: traceIdRef.current,
      ...(details ? { details } : {}),
    };
    setTraceEvents((current) => [...current.slice(-79), entry]);
    console.info(`[route-lab] ${JSON.stringify(entry)}`);
  }

  function snapshot(): PlanSnapshot {
    return structuredClone({ system, desk, items, routes });
  }

  function restoreSnapshot(value: PlanSnapshot) {
    setSystem(value.system);
    setDesk(value.desk);
    setDeskDraft(value.desk);
    setItems(value.items);
    setRoutes(value.routes);
    setSelectedId((current) =>
      value.items.some((item) => item.id === current)
        ? current
        : (value.items[0]?.id ?? ""),
    );
    setSelectedRouteId((current) =>
      value.routes.some((route) => route.id === current) ? current : "",
    );
  }

  function checkpointHistory() {
    past.current.push(snapshot());
    if (past.current.length > 50) past.current.shift();
    future.current = [];
    setHistoryState({ undo: past.current.length, redo: 0 });
  }

  function undoPlan() {
    const previous = past.current.pop();
    if (!previous) return;
    future.current.push(snapshot());
    restoreSnapshot(previous);
    setHistoryState({
      undo: past.current.length,
      redo: future.current.length,
    });
    emitLog("plan.undo");
  }

  function redoPlan() {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(snapshot());
    restoreSnapshot(next);
    setHistoryState({
      undo: past.current.length,
      redo: future.current.length,
    });
    emitLog("plan.redo");
  }

  function changeSystem(nextSystem: SystemId) {
    if (nextSystem === system) return;
    checkpointHistory();
    const nextGrid = SYSTEMS[nextSystem].grid;
    setSystem(nextSystem);
    setItems((current) =>
      current.map((item) => ({
        ...item,
        x: snapToGrid(item.x, nextGrid),
        y: snapToGrid(item.y, nextGrid),
      })),
    );
    emitLog("system.changed", {
      from: system,
      to: nextSystem,
      grid: nextGrid,
    });
  }

  function selectTool(tool: ToolId) {
    setActiveTool(tool);
    if (tool === "select") return;

    if (tool === "route") {
      checkpointHistory();
      const index = routes.length + 1;
      const nextRoute: CableRoute = {
        id: makeId("route"),
        name: `Cable route ${index}`,
        color: ["#9f7aea", "#39d98a", "#f973c8"][index % 3],
        diameter: 5,
        points: [
          [560, 280 + index * 12],
          [560, 500],
          [1060, 500],
          [1060, 610],
        ],
      };
      setRoutes((current) => [...current, nextRoute]);
      setSelectedId("");
      setSelectedRouteId(nextRoute.id);
      showToast(`Cable route ${index} added`);
      emitLog("route.added", { route: index });
      setActiveTool("select");
      return;
    }

    checkpointHistory();
    const kind = tool as ItemKind;
    const next: PlannerItem = {
      id: makeId(kind),
      kind,
      name: itemLabel(kind),
      x: snapToGrid(desk.width / 2 - 90, systemSpec.grid),
      y: snapToGrid(desk.depth / 2 - 30, systemSpec.grid),
      width:
        kind === "obstacle" ? 280 : kind === "power-brick" ? 196 : 168,
      height: kind === "obstacle" ? 112 : kind === "holder" ? 84 : 56,
      rotation: 0,
      ...(kind === "channel" ? { cables: 0 } : {}),
      ...(kind === "power-brick" ? { outlets: 4 } : {}),
    };
    setItems((current) => [...current, next]);
    setSelectedId(next.id);
    setSelectedRouteId("");
    setActiveTool("select");
    showToast(`${next.name} added — drag it into place`);
    emitLog("item.added", { itemId: next.id, kind });
  }

  function updateSelected(patch: Partial<PlannerItem>, record = true) {
    if (!selected) return;
    if (record) checkpointHistory();
    setItems((current) =>
      current.map((item) =>
        item.id === selected.id ? { ...item, ...patch } : item,
      ),
    );
    emitLog("item.updated", { itemId: selected.id, ...patch });
  }

  function rotateSelected(rotation: PlannerItem["rotation"]) {
    if (!selected || selected.rotation === rotation) return;
    checkpointHistory();
    const parityChanged =
      Math.abs(selected.rotation - rotation) % 180 !== 0;
    if (!parityChanged) {
      updateSelected({ rotation }, false);
      return;
    }
    const centerX = selected.x + selected.width / 2;
    const centerY = selected.y + selected.height / 2;
    updateSelected(
      {
        rotation,
        width: selected.height,
        height: selected.width,
        x: snapToGrid(centerX - selected.height / 2, systemSpec.grid),
        y: snapToGrid(centerY - selected.width / 2, systemSpec.grid),
      },
      false,
    );
  }

  function handlePointerDown(
    event: ReactPointerEvent<SVGGElement>,
    item: PlannerItem,
  ) {
    if (activeTool !== "select") return;
    event.stopPropagation();
    checkpointHistory();
    event.currentTarget.setPointerCapture(event.pointerId);
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(svg.getScreenCTM()?.inverse());
    interaction.current = {
      type: "move-item",
      id: item.id,
      dx: local.x - item.x,
      dy: local.y - item.y,
    };
    setSelectedId(item.id);
    setSelectedRouteId("");
  }

  function handleResizePointerDown(
    event: ReactPointerEvent<SVGRectElement>,
    item: PlannerItem,
    corner: ResizeCorner,
  ) {
    if (activeTool !== "select") return;
    event.stopPropagation();
    checkpointHistory();
    event.currentTarget.setPointerCapture(event.pointerId);
    interaction.current = {
      type: "resize-item",
      id: item.id,
      corner,
      startItem: { ...item },
    };
    setSelectedId(item.id);
    setSelectedRouteId("");
  }

  function handleRoutePointerDown(
    event: ReactPointerEvent<SVGPolylineElement>,
    route: CableRoute,
  ) {
    if (activeTool !== "select") return;
    event.stopPropagation();
    checkpointHistory();
    event.currentTarget.setPointerCapture(event.pointerId);
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(svg.getScreenCTM()?.inverse());
    interaction.current = {
      type: "move-route",
      id: route.id,
      startX: local.x,
      startY: local.y,
      startPoints: route.points.map(([x, y]) => [x, y]),
    };
    setSelectedId("");
    setSelectedRouteId(route.id);
  }

  function handleRoutePointPointerDown(
    event: ReactPointerEvent<SVGCircleElement>,
    routeId: string,
    pointIndex: number,
  ) {
    if (activeTool !== "select") return;
    event.stopPropagation();
    checkpointHistory();
    event.currentTarget.setPointerCapture(event.pointerId);
    interaction.current = { type: "route-point", id: routeId, pointIndex };
    setSelectedId("");
    setSelectedRouteId(routeId);
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const active = interaction.current;
    if (!active) return;
    const svg = event.currentTarget;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(svg.getScreenCTM()?.inverse());

    if (active.type === "move-item") {
      const moving = items.find((item) => item.id === active.id);
      if (!moving) return;
      const nextX = snapToGrid(
        clamp(local.x - active.dx, 0, desk.width - moving.width),
        systemSpec.grid,
      );
      const nextY = snapToGrid(
        clamp(local.y - active.dy, 0, desk.depth - moving.height),
        systemSpec.grid,
      );
      setItems((current) =>
        current.map((item) =>
          item.id === moving.id ? { ...item, x: nextX, y: nextY } : item,
        ),
      );
      return;
    }

    if (active.type === "resize-item") {
      const start = active.startItem;
      const minWidth =
        start.kind === "power-brick" || start.kind === "holder"
          ? systemSpec.grid * 3
          : systemSpec.grid;
      const minHeight =
        start.kind === "power-brick" || start.kind === "holder"
          ? systemSpec.grid * 2
          : systemSpec.grid;
      const resized = resizeItemFromCorner(
        start,
        active.corner,
        local,
        desk,
        systemSpec.grid,
        { width: minWidth, height: minHeight },
      );

      setItems((current) =>
        current.map((item) =>
          item.id === active.id
            ? { ...item, ...resized }
            : item,
        ),
      );
      return;
    }

    if (active.type === "move-route") {
      const points = translateRoute(
        active.startPoints,
        local.x - active.startX,
        local.y - active.startY,
        desk,
        systemSpec.grid,
      ) as CableRoute["points"];
      setRoutes((current) =>
        current.map((route) =>
          route.id === active.id
            ? { ...route, points }
            : route,
        ),
      );
      return;
    }

    setRoutes((current) =>
      current.map((route) =>
        route.id === active.id
          ? {
              ...route,
              points: moveRoutePoint(
                route.points,
                active.pointIndex,
                local,
                desk,
                systemSpec.grid,
              ) as CableRoute["points"],
            }
          : route,
      ),
    );
  }

  function handlePointerUp() {
    const active = interaction.current;
    if (!active) return;
    if (active.type === "move-item" || active.type === "resize-item") {
      const changed = items.find((item) => item.id === active.id);
      if (changed) {
        emitLog(
          active.type === "move-item" ? "item.moved" : "item.resized",
          {
            itemId: changed.id,
            x: changed.x,
            y: changed.y,
            width: changed.width,
            height: changed.height,
          },
        );
      }
    } else {
      const changed = routes.find((route) => route.id === active.id);
      if (changed) {
        emitLog(
          active.type === "move-route" ? "route.moved" : "route.point_moved",
          { routeId: changed.id, points: changed.points },
        );
      }
    }
    interaction.current = null;
  }

  function exportPlan() {
    const plan: PlanFile = {
      version: 1,
      name: planName,
      system,
      desk,
      items,
      routes,
      savedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(plan, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${planName.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}.underware-plan.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast("Plan exported");
    emitLog("plan.exported", {
      items: items.length,
      routes: routes.length,
    });
  }

  async function importPlan(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const result = validatePlanFile(JSON.parse(await file.text())) as {
        ok: boolean;
        reason?: string;
        plan?: PlanFile;
      };
      if (!result.ok || !result.plan) throw new Error(result.reason);
      const plan = result.plan;
      checkpointHistory();
      setPlanName(plan.name);
      setSystem(plan.system);
      setDesk(plan.desk);
      setDeskDraft(plan.desk);
      setItems(plan.items);
      setRoutes(plan.routes);
      setSelectedId(plan.items[0]?.id ?? "");
      setSelectedRouteId("");
      showToast("Plan imported");
      emitLog("plan.imported", {
        fileName: file.name,
        items: plan.items.length,
        routes: plan.routes.length,
      });
    } catch {
      showToast("That file is not a valid Route Lab plan");
      emitLog("plan.import_failed", { fileName: file.name }, "warn");
    } finally {
      event.target.value = "";
    }
  }

  function deleteSelected() {
    if (!selected) return;
    checkpointHistory();
    setItems((current) => current.filter((item) => item.id !== selected.id));
    setSelectedId("");
    setSelectedRouteId("");
    showToast(`${selected.name} removed`);
    emitLog("item.deleted", { itemId: selected.id, kind: selected.kind });
  }

  function applyDeskDimensions() {
    if (
      !Number.isFinite(deskDraft.width) ||
      !Number.isFinite(deskDraft.depth) ||
      deskDraft.width < 300 ||
      deskDraft.depth < 300
    ) {
      showToast("Use desk dimensions of at least 300 × 300 mm");
      return;
    }
    checkpointHistory();
    setDesk(deskDraft);
    setItems((current) =>
      current.map((item) => ({
        ...item,
        x: clamp(item.x, 0, Math.max(0, deskDraft.width - item.width)),
        y: clamp(item.y, 0, Math.max(0, deskDraft.depth - item.height)),
      })),
    );
    setRoutes((current) =>
      current.map((route) => ({
        ...route,
        points: route.points.map(([x, y]) => [
          clamp(x, 0, deskDraft.width),
          clamp(y, 0, deskDraft.depth),
        ]),
      })),
    );
    setDeskOpen(false);
    showToast("Desk dimensions updated");
    emitLog("desk.resized", deskDraft);
  }

  function removeRoute(routeId: string) {
    checkpointHistory();
    setRoutes((current) => current.filter((route) => route.id !== routeId));
    setSelectedRouteId((current) => (current === routeId ? "" : current));
    emitLog("route.deleted", { routeId });
  }

  function updateRoute(routeId: string, patch: Partial<CableRoute>) {
    checkpointHistory();
    setRoutes((current) =>
      current.map((route) =>
        route.id === routeId ? { ...route, ...patch } : route,
      ),
    );
    emitLog("route.updated", { routeId, ...patch });
  }

  function addRouteBend(route: CableRoute) {
    checkpointHistory();
    const points = insertRouteBend(route.points).map(([x, y]) => [
      snapToGrid(x, systemSpec.grid),
      snapToGrid(y, systemSpec.grid),
    ]) as CableRoute["points"];
    setRoutes((current) =>
      current.map((entry) =>
        entry.id === route.id ? { ...entry, points } : entry,
      ),
    );
    emitLog("route.bend_added", { routeId: route.id, points: points.length });
  }

  function exportTrace() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            traceId,
            exportedAt: new Date().toISOString(),
            plan: { name: planName, system, desk },
            events: traceEvents,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `route-lab-trace-${traceId.slice(0, 8)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast("Troubleshooting log exported");
  }

  useEffect(() => {
    function handleKeyboard(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const editing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redoPlan();
        } else {
          undoPlan();
        }
      } else if (!editing && event.key === "Delete") {
        if (selected) {
          deleteSelected();
        } else if (selectedRoute) {
          removeRoute(selectedRoute.id);
        }
      } else if (!editing && event.key.toLowerCase() === "r" && selected) {
        rotateSelected(
          ([0, 90, 180, 270] as const)[
            (([0, 90, 180, 270] as const).indexOf(selected.rotation) + 1) % 4
          ],
        );
      }
    }
    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  });

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            U
          </span>
          <span>Underware</span>
          <span className="brand-slash">/</span>
          <span className="brand-subtitle">Route Lab</span>
        </div>

        <label className="plan-name">
          <span className="sr-only">Plan name</span>
          <input
            value={planName}
            onChange={(event) => setPlanName(event.target.value)}
          />
          <span aria-hidden="true">✎</span>
        </label>

        <div className="system-switch" aria-label="Mounting system">
          {(Object.keys(SYSTEMS) as SystemId[]).map((id) => (
            <button
              type="button"
              key={id}
              className={system === id ? "active" : ""}
              onClick={() => changeSystem(id)}
              aria-pressed={system === id}
            >
              <strong>{SYSTEMS[id].label}</strong>
              <span>{SYSTEMS[id].grid} mm</span>
            </button>
          ))}
        </div>

        <div className="file-actions">
          <input
            ref={fileInput}
            className="sr-only"
            type="file"
            accept=".json,application/json"
            onChange={importPlan}
          />
          <button type="button" onClick={() => fileInput.current?.click()}>
            <span aria-hidden="true">↓</span> Import
          </button>
          <button type="button" className="primary" onClick={exportPlan}>
            <span aria-hidden="true">↑</span> Export
          </button>
        </div>
      </header>

      <aside className="toolrail" aria-label="Planner tools">
        {TOOLS.map((tool) => (
          <button
            type="button"
            key={tool.id}
            className={activeTool === tool.id ? "active" : ""}
            onClick={() => selectTool(tool.id)}
            aria-pressed={activeTool === tool.id}
            title={
              tool.id === "select"
                ? "Select and move parts"
                : `Add ${tool.label.toLowerCase()}`
            }
          >
            <span className="tool-icon" aria-hidden="true">
              {tool.icon}
            </span>
            <span>{tool.label}</span>
          </button>
        ))}
      </aside>

      <section className="workspace" aria-label="Desk underside planner">
        <div className="workspace-heading">
          <div className="workspace-title">
            <span className="eyebrow">Desk underside</span>
            <strong>
              {desk.width} × {desk.depth} mm
            </strong>
            <button
              type="button"
              onClick={() => {
                setDeskDraft(desk);
                setDeskOpen(true);
              }}
            >
              Desk setup
            </button>
          </div>
          <div className="workspace-meta">
            <span className="save-status" title={savedAt || undefined}>
              <i aria-hidden="true">✓</i>
              {savedAt ? "Saved locally" : "Saving locally"}
            </span>
            <span className="snap-status">
              <i aria-hidden="true" /> Snap · {systemSpec.grid} mm
            </span>
          </div>
        </div>

        <div className="canvas-scroll">
          <div
            className="canvas-stage"
            style={{ width: `${zoom}%`, minWidth: `${zoom * 10}px` }}
          >
            <div className="measure measure-top">
              <span>{desk.width} mm</span>
            </div>
            <div className="measure measure-side">
              <span>{desk.depth} mm</span>
            </div>
            <svg
              className="desk-canvas"
              viewBox={`0 0 ${desk.width} ${desk.depth}`}
              role="img"
              aria-label={`${desk.width} by ${desk.depth} millimetre desk underside plan`}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={() => {
                interaction.current = null;
              }}
              onPointerDown={() => {
                setSelectedId("");
                setSelectedRouteId("");
              }}
            >
              <defs>
                <pattern
                  id="minor-grid"
                  width={systemSpec.grid}
                  height={systemSpec.grid}
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d={`M ${systemSpec.grid} 0 L 0 0 0 ${systemSpec.grid}`}
                    className="grid-minor"
                  />
                </pattern>
                <pattern
                  id="major-grid"
                  width={systemSpec.grid * 5}
                  height={systemSpec.grid * 5}
                  patternUnits="userSpaceOnUse"
                >
                  <rect
                    width={systemSpec.grid * 5}
                    height={systemSpec.grid * 5}
                    fill="url(#minor-grid)"
                  />
                  <path
                    d={`M ${systemSpec.grid * 5} 0 L 0 0 0 ${systemSpec.grid * 5}`}
                    className="grid-major"
                  />
                </pattern>
                <filter id="item-shadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow
                    dx="0"
                    dy="5"
                    stdDeviation="5"
                    floodColor="#000"
                    floodOpacity=".42"
                  />
                </filter>
              </defs>

              <rect
                className="desk-surface"
                x="2"
                y="2"
                width={desk.width - 4}
                height={desk.depth - 4}
                rx="30"
              />
              <rect
                x="2"
                y="2"
                width={desk.width - 4}
                height={desk.depth - 4}
                rx="30"
                fill="url(#major-grid)"
              />

              {routes.map((route) => (
                <g
                  key={route.id}
                  className={`route ${
                    selectedRouteId === route.id ? "selected" : ""
                  }`}
                >
                  <polyline
                    points={route.points.map((point) => point.join(",")).join(" ")}
                    className="route-hit"
                    onPointerDown={(event) =>
                      handleRoutePointerDown(event, route)
                    }
                  />
                  <polyline
                    points={route.points.map((point) => point.join(",")).join(" ")}
                    className="route-halo"
                  />
                  <polyline
                    points={route.points.map((point) => point.join(",")).join(" ")}
                    stroke={route.color}
                    strokeWidth={route.diameter + 3}
                  />
                  {selectedRouteId === route.id && (
                    <polyline
                      points={route.points
                        .map((point) => point.join(","))
                        .join(" ")}
                      className="route-selection"
                    />
                  )}
                </g>
              ))}

              {items.map((item) => (
                <g
                  key={item.id}
                  className={`planner-item item-${item.kind} ${
                    selectedId === item.id ? "selected" : ""
                  }`}
                  onPointerDown={(event) => handlePointerDown(event, item)}
                  filter="url(#item-shadow)"
                  role="button"
                  aria-label={`${item.name}, at ${item.x} by ${item.y} millimetres`}
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      setSelectedId(item.id);
                    }
                  }}
                >
                  <rect
                    x={item.x}
                    y={item.y}
                    width={item.width}
                    height={item.height}
                    rx={item.kind === "channel" ? 12 : 18}
                    className="item-body"
                  />
                  {item.kind === "channel" && (
                    <>
                      <line
                        x1={item.x + 16}
                        y1={item.y + item.height / 2}
                        x2={item.x + item.width - 16}
                        y2={item.y + item.height / 2}
                        className="channel-core"
                      />
                      {Array.from({
                        length: Math.max(2, Math.floor(item.width / 54)),
                      }).map((_, index) => (
                        <line
                          key={index}
                          x1={item.x + 22 + index * 52}
                          y1={item.y + 12}
                          x2={item.x + 22 + index * 52}
                          y2={item.y + item.height - 12}
                          className="channel-rib"
                        />
                      ))}
                    </>
                  )}
                  {item.kind === "power-brick" && (
                    <>
                      {getPowerBrickOutletLayout(
                        item.width,
                        item.height,
                        item.outlets ?? 6,
                      ).map((outlet, index) => (
                        <circle
                          key={index}
                          cx={item.x + outlet.x}
                          cy={item.y + outlet.y}
                          r={outlet.radius}
                          className="outlet"
                        />
                      ))}
                    </>
                  )}
                  {item.kind === "holder" && (
                    <>
                      <rect
                        x={item.x + 20}
                        y={item.y + 15}
                        width={item.width - 40}
                        height="12"
                        rx="6"
                        className="holder-slot"
                      />
                      <line
                        x1={item.x + 14}
                        y1={item.y + item.height - 15}
                        x2={item.x + item.width - 14}
                        y2={item.y + item.height - 15}
                        className="holder-lip"
                      />
                    </>
                  )}
                  {item.kind === "obstacle" && (
                    <text
                      x={item.x + item.width / 2}
                      y={item.y + item.height / 2 + 7}
                      textAnchor="middle"
                      className="obstacle-label"
                    >
                      {item.name}
                    </text>
                  )}
                  {selectedId === item.id && (
                    <>
                      <rect
                        x={item.x - 6}
                        y={item.y - 6}
                        width={item.width + 12}
                        height={item.height + 12}
                        rx="16"
                        className="selection-outline"
                      />
                      {[
                        ["nw", item.x - 6, item.y - 6],
                        ["ne", item.x + item.width + 6, item.y - 6],
                        ["sw", item.x - 6, item.y + item.height + 6],
                        [
                          "se",
                          item.x + item.width + 6,
                          item.y + item.height + 6,
                        ],
                      ].map(([corner, x, y]) => (
                        <rect
                          key={corner}
                          x={Number(x) - 7}
                          y={Number(y) - 7}
                          width="14"
                          height="14"
                          className={`selection-handle resize-${corner}`}
                          onPointerDown={(event) =>
                            handleResizePointerDown(
                              event,
                              item,
                              corner as ResizeCorner,
                            )
                          }
                          aria-label={`Resize ${item.name} from ${corner} corner`}
                        />
                      ))}
                    </>
                  )}
                </g>
              ))}

              {selectedRoute && (
                <g className="route-points" aria-label="Cable route control points">
                  {selectedRoute.points.map(([x, y], index) => (
                    <circle
                      key={`${selectedRoute.id}-${index}`}
                      cx={x}
                      cy={y}
                      r="10"
                      className="route-point"
                      onPointerDown={(event) =>
                        handleRoutePointPointerDown(
                          event,
                          selectedRoute.id,
                          index,
                        )
                      }
                      aria-label={`Move ${selectedRoute.name} point ${index + 1}`}
                    />
                  ))}
                </g>
              )}
            </svg>
          </div>
        </div>

        <div className="canvas-controls" aria-label="Canvas zoom">
          <button
            type="button"
            onClick={() => setZoom((value) => clamp(value - 8, 64, 120))}
            aria-label="Zoom out"
          >
            −
          </button>
          <span>{zoom}%</span>
          <button
            type="button"
            onClick={() => setZoom((value) => clamp(value + 8, 64, 120))}
            aria-label="Zoom in"
          >
            +
          </button>
          <button type="button" onClick={() => setZoom(88)}>
            Fit
          </button>
          <button
            type="button"
            onClick={undoPlan}
            disabled={historyState.undo === 0}
            aria-label="Undo"
            title="Undo · Ctrl Z"
          >
            ↶
          </button>
          <button
            type="button"
            onClick={redoPlan}
            disabled={historyState.redo === 0}
            aria-label="Redo"
            title="Redo · Ctrl Shift Z"
          >
            ↷
          </button>
          <button
            type="button"
            className="trace-button"
            onClick={() => setTraceOpen(true)}
            title="Open troubleshooting activity"
          >
            Trace
          </button>
        </div>

        <button
          type="button"
          className={`print-summary ${
            printPlan.overCapacityIds.length ? "warning" : ""
          }`}
          onClick={() => setPrintOpen(true)}
        >
          <span>
            <small>Print plan</small>
            <strong>{printPlan.partsCount} parts</strong>
          </span>
          <span>
            <small>Estimate</small>
            <strong>
              {Math.floor(printPlan.printMinutes / 60)}h{" "}
              {printPlan.printMinutes % 60}m · {printPlan.filamentGrams}g
            </strong>
          </span>
          <span className="summary-arrow" aria-hidden="true">
            ↗
          </span>
        </button>
      </section>

      <aside className="inspector" aria-label="Selection inspector">
        <div className="inspector-header">
          <div>
            <span className="eyebrow">Selection</span>
            <strong>
              {selected?.name ?? selectedRoute?.name ?? "Nothing selected"}
            </strong>
          </div>
          {(selected || selectedRoute) && (
            <span className="selection-type">
              {selected ? selected.kind.replace("-", " ") : "cable route"}
            </span>
          )}
        </div>

        {selectedRoute ? (
          <>
            <section className="inspector-section route-editor">
              <h2>Route geometry</h2>
              <div className="route-stats">
                <span>
                  <strong>{selectedRoute.points.length}</strong>
                  control points
                </span>
                <span>
                  <strong>{selectedRouteLength} mm</strong>
                  route length
                </span>
              </div>
              <p>
                Drag the cable line to move the whole route. Drag a blue point
                to change its start, end, or bends.
              </p>
            </section>
            <section className="inspector-section">
              <h2>Cable</h2>
              <div className="field-grid route-fields">
                <label>
                  <span>Ø</span>
                  <span className="input-unit">
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={selectedRoute.diameter}
                      onChange={(event) =>
                        updateRoute(selectedRoute.id, {
                          diameter: Number(event.target.value),
                        })
                      }
                    />
                    <i>mm</i>
                  </span>
                </label>
              </div>
            </section>
            <section className="inspector-actions">
              <button type="button" onClick={() => addRouteBend(selectedRoute)}>
                Add bend
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => removeRoute(selectedRoute.id)}
              >
                Delete
              </button>
            </section>
          </>
        ) : selected ? (
          <>
            <section className="inspector-section">
              <h2>Position</h2>
              <div className="field-grid">
                <label>
                  <span>X</span>
                  <span className="input-unit">
                    <input
                      type="number"
                      value={selected.x}
                      step={systemSpec.grid}
                      onChange={(event) =>
                        updateSelected({ x: Number(event.target.value) })
                      }
                    />
                    <i>mm</i>
                  </span>
                </label>
                <label>
                  <span>Y</span>
                  <span className="input-unit">
                    <input
                      type="number"
                      value={selected.y}
                      step={systemSpec.grid}
                      onChange={(event) =>
                        updateSelected({ y: Number(event.target.value) })
                      }
                    />
                    <i>mm</i>
                  </span>
                </label>
              </div>
            </section>

            <section className="inspector-section">
              <h2>Size</h2>
              <div className="field-grid">
                <label>
                  <span>W</span>
                  <span className="input-unit">
                    <input
                      type="number"
                      min="1"
                      value={selected.width}
                      onChange={(event) =>
                        updateSelected({ width: Number(event.target.value) })
                      }
                    />
                    <i>mm</i>
                  </span>
                </label>
                <label>
                  <span>H</span>
                  <span className="input-unit">
                    <input
                      type="number"
                      min="1"
                      value={selected.height}
                      onChange={(event) =>
                        updateSelected({ height: Number(event.target.value) })
                      }
                    />
                    <i>mm</i>
                  </span>
                </label>
              </div>
            </section>

            <section className="inspector-section">
              <h2>Rotation</h2>
              <div className="rotation-options">
                {([0, 90, 180, 270] as const).map((rotation) => (
                  <button
                    type="button"
                    key={rotation}
                    className={selected.rotation === rotation ? "active" : ""}
                    onClick={() => rotateSelected(rotation)}
                  >
                    {rotation}°
                  </button>
                ))}
              </div>
            </section>

            {selected.kind === "channel" && (
              <section className="inspector-section">
                <div className="section-heading">
                  <h2>Channel capacity</h2>
                  <strong>
                    {capacity} / {systemSpec.capacity} cables
                  </strong>
                </div>
                <input
                  className="capacity-range"
                  type="range"
                  min="0"
                  max={systemSpec.capacity + 2}
                  value={capacity}
                  onChange={(event) =>
                    updateSelected({ cables: Number(event.target.value) })
                  }
                  aria-label="Cables in selected channel"
                />
                <div
                  className={`capacity-meter ${
                    capacityState.level !== "ok" ? "warning" : ""
                  }`}
                >
                  <i
                    style={{ width: `${Math.min(capacityState.percent, 100)}%` }}
                  />
                </div>
                <p
                  className={
                    capacityState.level !== "ok" ? "warning-copy" : ""
                  }
                >
                  {capacityState.level === "over"
                    ? "Over capacity. Split this route or use another channel."
                    : capacityState.level === "near"
                      ? "Near capacity. Leave room for bend tolerance."
                      : `${100 - capacityState.percent}% spare capacity remains.`}
                </p>
              </section>
            )}

            {selected.kind === "power-brick" && (
              <section className="inspector-section">
                <div className="section-heading">
                  <h2>Outlet layout</h2>
                  <strong>{selected.outlets ?? 6} outlets</strong>
                </div>
                <input
                  className="capacity-range"
                  type="range"
                  min="1"
                  max="16"
                  value={selected.outlets ?? 6}
                  onChange={(event) =>
                    updateSelected({ outlets: Number(event.target.value) })
                  }
                  aria-label="Power brick outlet count"
                />
                <p>
                  Outlets reflow and scale automatically to fit the brick
                  dimensions.
                </p>
              </section>
            )}

            <section className="inspector-actions">
              <button
                type="button"
                onClick={() => {
                  checkpointHistory();
                  const copy = {
                    ...selected,
                    id: makeId(selected.kind),
                    x: selected.x + systemSpec.grid,
                    y: selected.y + systemSpec.grid,
                    name: `${selected.name} copy`,
                  };
                  setItems((current) => [...current, copy]);
                  setSelectedId(copy.id);
                  emitLog("item.duplicated", {
                    sourceId: selected.id,
                    itemId: copy.id,
                  });
                }}
              >
                Duplicate
              </button>
              <button type="button" className="danger" onClick={deleteSelected}>
                Delete
              </button>
            </section>
          </>
        ) : (
          <div className="empty-selection">
            <span aria-hidden="true">↖</span>
            <strong>Select something on the desk</strong>
            <p>Move it on the grid or edit its exact dimensions here.</p>
          </div>
        )}

        <section className="route-section">
          <div className="section-heading">
            <h2>Cable routes</h2>
            <strong>{routes.length}</strong>
          </div>
          <div className="route-list">
            {routes.map((route) => (
              <div
                key={route.id}
                className={selectedRouteId === route.id ? "active" : ""}
                onClick={() => {
                  setSelectedId("");
                  setSelectedRouteId(route.id);
                }}
              >
                <i style={{ background: route.color }} aria-hidden="true" />
                <label>
                  <span className="sr-only">Route name</span>
                  <input
                    value={route.name}
                    onChange={(event) =>
                      updateRoute(route.id, { name: event.target.value })
                    }
                  />
                </label>
                <label className="route-diameter">
                  <span className="sr-only">
                    {route.name} cable diameter in millimetres
                  </span>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={route.diameter}
                    onChange={(event) =>
                      updateRoute(route.id, {
                        diameter: Number(event.target.value),
                      })
                    }
                  />
                  <span>mm</span>
                </label>
                <button
                  type="button"
                  onClick={() => removeRoute(route.id)}
                  aria-label={`Delete ${route.name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </section>
      </aside>

      {deskOpen && (
        <div
          className="drawer-backdrop modal-backdrop"
          role="presentation"
          onMouseDown={() => setDeskOpen(false)}
        >
          <section
            className="desk-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="desk-setup-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span className="eyebrow">Physical workspace</span>
                <h2 id="desk-setup-title">Desk setup</h2>
              </div>
              <button
                type="button"
                onClick={() => setDeskOpen(false)}
                aria-label="Close desk setup"
              >
                ×
              </button>
            </header>
            <p>
              Enter the usable underside area. Parts outside the new boundary
              will be moved back inside it.
            </p>
            <div className="desk-fields">
              <label>
                <span>Width</span>
                <span className="input-unit">
                  <input
                    type="number"
                    min="300"
                    value={deskDraft.width}
                    onChange={(event) =>
                      setDeskDraft((current) => ({
                        ...current,
                        width: Number(event.target.value),
                      }))
                    }
                  />
                  <i>mm</i>
                </span>
              </label>
              <label>
                <span>Depth</span>
                <span className="input-unit">
                  <input
                    type="number"
                    min="300"
                    value={deskDraft.depth}
                    onChange={(event) =>
                      setDeskDraft((current) => ({
                        ...current,
                        depth: Number(event.target.value),
                      }))
                    }
                  />
                  <i>mm</i>
                </span>
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" onClick={() => setDeskOpen(false)}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={applyDeskDimensions}>
                Apply dimensions
              </button>
            </div>
          </section>
        </div>
      )}

      {printOpen && (
        <div
          className="drawer-backdrop"
          role="presentation"
          onMouseDown={() => setPrintOpen(false)}
        >
          <aside
            className="print-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="print-plan-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span className="eyebrow">Ready to make</span>
                <h2 id="print-plan-title">Print plan</h2>
              </div>
              <button
                type="button"
                onClick={() => setPrintOpen(false)}
                aria-label="Close print plan"
              >
                ×
              </button>
            </header>
            <div className="print-totals">
              <span>
                <strong>{printPlan.partsCount}</strong>
                <small>parts</small>
              </span>
              <span>
                <strong>
                  {Math.floor(printPlan.printMinutes / 60)}h{" "}
                  {printPlan.printMinutes % 60}m
                </strong>
                <small>print time</small>
              </span>
              <span>
                <strong>{printPlan.filamentGrams}g</strong>
                <small>filament</small>
              </span>
            </div>
            {printPlan.overCapacityIds.length > 0 && (
              <div className="print-warning">
                <span aria-hidden="true">!</span>
                {printPlan.overCapacityIds.length} channel
                {printPlan.overCapacityIds.length === 1 ? "" : "s"} over
                capacity
              </div>
            )}
            <div className="bom-list">
              {printPlan.groups.map((group) => (
                <div key={group.label}>
                  <span className="part-thumbnail" aria-hidden="true">
                    ▣
                  </span>
                  <span>
                    <strong>{group.label}</strong>
                    <small>{systemSpec.label} compatible</small>
                  </span>
                  <b>× {group.count}</b>
                </div>
              ))}
            </div>
            <div className="print-note">
              <span aria-hidden="true">i</span>
              Estimates are planning aids. Confirm the generated part dimensions
              in the official Underware/openGrid model before printing.
            </div>
            <button type="button" className="primary wide" onClick={exportPlan}>
              Export plan JSON
            </button>
          </aside>
        </div>
      )}

      {traceOpen && (
        <div
          className="drawer-backdrop"
          role="presentation"
          onMouseDown={() => setTraceOpen(false)}
        >
          <aside
            className="print-drawer trace-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="trace-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span className="eyebrow">Local diagnostics</span>
                <h2 id="trace-title">Activity trace</h2>
              </div>
              <button
                type="button"
                onClick={() => setTraceOpen(false)}
                aria-label="Close activity trace"
              >
                ×
              </button>
            </header>
            <div className="trace-id">
              <span>
                Correlation ID
                <strong>{traceId}</strong>
              </span>
              <i aria-hidden="true" />
            </div>
            <p className="trace-copy">
              Route Lab records structured actions only on this device. Export
              this log when a saved plan behaves unexpectedly.
            </p>
            <div className="trace-events">
              {[...traceEvents].reverse().map((entry, index) => (
                <article key={`${entry.timestamp}-${entry.event}-${index}`}>
                  <span className={entry.level}>{entry.level}</span>
                  <div>
                    <strong>{entry.event}</strong>
                    <time>{new Date(entry.timestamp).toLocaleTimeString()}</time>
                    {entry.details && (
                      <code>{JSON.stringify(entry.details)}</code>
                    )}
                  </div>
                </article>
              ))}
            </div>
            <button type="button" className="primary wide" onClick={exportTrace}>
              Export troubleshooting log
            </button>
          </aside>
        </div>
      )}

      {toast && (
        <div className="toast" role="status">
          <span aria-hidden="true">✓</span>
          {toast}
        </div>
      )}
    </main>
  );
}
