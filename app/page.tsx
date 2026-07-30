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
  buildLayerStack,
  calculateGridTilePlan,
  calculateRouteLength,
  calculatePrintPlan,
  getCapacityState,
  getPowerBrickOutletLayout,
  insertRouteBend,
  moveRoutePoint,
  removeRouteBend,
  reorderLayerStack,
  resizeItemFromCorner,
  snapToGrid,
  translateRoute,
  validatePlanFile,
} from "@/lib/planner.mjs";

type SystemId = "openGrid" | "underware";
type ToolId =
  | "select"
  | "grid"
  | "parts"
  | "route"
  | "obstacle";
type ItemKind =
  | "grid"
  | "channel"
  | "cable-loop"
  | "power-brick"
  | "holder"
  | "obstacle";
type CatalogItemId =
  | "opengrid-baseplate"
  | "straight-channel"
  | "l-channel"
  | "t-channel"
  | "x-channel"
  | "s-channel"
  | "cable-loop"
  | "device-holder"
  | "power-brick-mount";
type LayerMovement = "back" | "backward" | "forward" | "front";

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
  catalogId?: CatalogItemId;
  layer?: number;
  maxTileCellsX?: number;
  maxTileCellsY?: number;
};

type CableRoute = {
  id: string;
  name: string;
  color: string;
  points: Array<[number, number]>;
  diameter: number;
  layer?: number;
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
  { id: "grid", icon: "▦", label: "openGrid" },
  { id: "parts", icon: "＋", label: "Parts" },
  { id: "route", icon: "⌁", label: "Cable route" },
  { id: "obstacle", icon: "▧", label: "Obstacle" },
];

const ROUTE_COLORS = [
  "#56d7e4",
  "#5294ff",
  "#9f7aea",
  "#f973c8",
  "#ffb020",
  "#39d98a",
  "#ff6b6b",
] as const;

type CatalogItem = {
  id: CatalogItemId;
  kind: Exclude<ItemKind, "obstacle">;
  name: string;
  icon: string;
  category: "Foundation" | "Cable routing" | "Mounts";
  description: string;
  widthCells: number;
  heightCells: number;
  openGridOnly?: boolean;
  cables?: number;
  outlets?: number;
};

const PART_CATALOG: CatalogItem[] = [
  {
    id: "opengrid-baseplate",
    kind: "grid",
    name: "openGrid baseplate",
    icon: "▦",
    category: "Foundation",
    description: "Resizable coverage area split into printable grid tiles.",
    widthCells: 8,
    heightCells: 8,
    openGridOnly: true,
  },
  {
    id: "straight-channel",
    kind: "channel",
    name: "Straight channel",
    icon: "━",
    category: "Cable routing",
    description: "Parametric I channel for a straight cable run.",
    widthCells: 6,
    heightCells: 2,
    cables: 0,
  },
  {
    id: "l-channel",
    kind: "channel",
    name: "L corner channel",
    icon: "┗",
    category: "Cable routing",
    description: "A 90° corner joining two perpendicular runs.",
    widthCells: 4,
    heightCells: 4,
    cables: 0,
  },
  {
    id: "t-channel",
    kind: "channel",
    name: "T junction channel",
    icon: "┳",
    category: "Cable routing",
    description: "A three-way branch for splitting a route.",
    widthCells: 4,
    heightCells: 4,
    cables: 0,
  },
  {
    id: "x-channel",
    kind: "channel",
    name: "X junction channel",
    icon: "╋",
    category: "Cable routing",
    description: "A four-way crossing for intersecting runs.",
    widthCells: 4,
    heightCells: 4,
    cables: 0,
  },
  {
    id: "s-channel",
    kind: "channel",
    name: "S offset channel",
    icon: "∿",
    category: "Cable routing",
    description: "An offset channel for moving a run around an obstacle.",
    widthCells: 5,
    heightCells: 3,
    cables: 0,
  },
  {
    id: "cable-loop",
    kind: "cable-loop",
    name: "Cable loop",
    icon: "◯",
    category: "Cable routing",
    description: "Open loop for retaining a loose cable bundle.",
    widthCells: 2,
    heightCells: 2,
  },
  {
    id: "device-holder",
    kind: "holder",
    name: "Device holder",
    icon: "⊔",
    category: "Mounts",
    description: "Resizable cradle for hubs, mini PCs, and adapters.",
    widthCells: 5,
    heightCells: 3,
  },
  {
    id: "power-brick-mount",
    kind: "power-brick",
    name: "Power brick mount",
    icon: "▯",
    category: "Mounts",
    description: "Resizable brick or power-strip holder with outlet count.",
    widthCells: 7,
    heightCells: 3,
    outlets: 4,
  },
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

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getChannelPaths(item: PlannerItem) {
  const left = item.x + 20;
  const right = item.x + item.width - 20;
  const top = item.y + 20;
  const bottom = item.y + item.height - 20;
  const middleX = item.x + item.width / 2;
  const middleY = item.y + item.height / 2;

  switch (item.catalogId) {
    case "l-channel":
      return [`M ${left} ${bottom} V ${top} H ${right}`];
    case "t-channel":
      return [
        `M ${left} ${top} H ${right}`,
        `M ${middleX} ${top} V ${bottom}`,
      ];
    case "x-channel":
      return [
        `M ${left} ${middleY} H ${right}`,
        `M ${middleX} ${top} V ${bottom}`,
      ];
    case "s-channel":
      return [
        `M ${left} ${bottom} C ${middleX} ${bottom}, ${middleX} ${top}, ${right} ${top}`,
      ];
    default:
      return [`M ${left} ${middleY} H ${right}`];
  }
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
  const [selectedRoutePoint, setSelectedRoutePoint] = useState<{
    routeId: string;
    pointIndex: number;
  } | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
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
  const nameEdit = useRef<{
    type: "item" | "route";
    id: string;
    original: string;
    recorded: boolean;
  } | null>(null);

  const selected = items.find((item) => item.id === selectedId) ?? null;
  const selectedRoute =
    routes.find((route) => route.id === selectedRouteId) ?? null;
  const selectedRoutePointIndex =
    selectedRoutePoint?.routeId === selectedRouteId
      ? selectedRoutePoint.pointIndex
      : null;
  const selectedRoutePointIsBend =
    selectedRoute !== null &&
    selectedRoutePointIndex !== null &&
    selectedRoutePointIndex > 0 &&
    selectedRoutePointIndex < selectedRoute.points.length - 1;
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
  const selectedGridPlan =
    selected?.kind === "grid"
      ? (calculateGridTilePlan(
          selected.width,
          selected.height,
          SYSTEM_SPECS.openGrid.grid,
          selected.maxTileCellsX ?? 8,
          selected.maxTileCellsY ?? 8,
        ) as {
          cellsX: number;
          cellsY: number;
          columns: number;
          rows: number;
          tileCount: number;
        })
      : null;
  const layerStack = useMemo(
    () =>
      buildLayerStack(items, routes) as Array<{
        id: string;
        type: "item" | "route";
        layer: number;
      }>,
    [items, routes],
  );
  const printPlan = useMemo(
    () =>
      calculatePrintPlan(items, system) as {
        partsCount: number;
        printMinutes: number;
        filamentGrams: number;
        groups: Array<{ label: string; count: number }>;
        overCapacityIds: string[];
        gridTilesCount: number;
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
            setSelectedRoutePoint(null);
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
    setSelectedRoutePoint(null);
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
      current.map((item) => {
        const itemGrid =
          item.kind === "grid" ? SYSTEM_SPECS.openGrid.grid : nextGrid;
        return {
          ...item,
          x: snapToGrid(item.x, itemGrid),
          y: snapToGrid(item.y, itemGrid),
        };
      }),
    );
    emitLog("system.changed", {
      from: system,
      to: nextSystem,
      grid: nextGrid,
    });
  }

  function selectTool(tool: ToolId) {
    setActiveTool(tool);
    if (tool === "select") {
      setCatalogOpen(false);
      return;
    }

    if (tool === "parts") {
      setCatalogOpen((current) => {
        const next = !current;
        setActiveTool(next ? "parts" : "select");
        return next;
      });
      return;
    }

    if (tool === "grid") {
      const baseplate = PART_CATALOG.find(
        (part) => part.id === "opengrid-baseplate",
      );
      if (baseplate) addCatalogItem(baseplate);
      return;
    }

    if (tool === "route") {
      checkpointHistory();
      const index = routes.length + 1;
      const nextRoute: CableRoute = {
        id: makeId("route"),
        name: `Cable route ${index}`,
        color: ["#9f7aea", "#39d98a", "#f973c8"][index % 3],
        diameter: 5,
        layer: layerStack.length,
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
      setSelectedRoutePoint(null);
      showToast(`Cable route ${index} added`);
      emitLog("route.added", { route: index });
      setActiveTool("select");
      return;
    }

    checkpointHistory();
    const next: PlannerItem = {
      id: makeId("obstacle"),
      kind: "obstacle",
      name: "Reserved area",
      x: snapToGrid(desk.width / 2 - 90, systemSpec.grid),
      y: snapToGrid(desk.depth / 2 - 30, systemSpec.grid),
      width: 280,
      height: 112,
      rotation: 0,
      layer: layerStack.length,
    };
    setItems((current) => [...current, next]);
    setSelectedId(next.id);
    setSelectedRouteId("");
    setSelectedRoutePoint(null);
    setActiveTool("select");
    showToast(`${next.name} added — drag it into place`);
    emitLog("item.added", { itemId: next.id, kind: next.kind });
  }

  function addCatalogItem(part: CatalogItem) {
    if (part.openGridOnly && system !== "openGrid") {
      showToast("openGrid baseplates require the openGrid system");
      setActiveTool("select");
      return;
    }

    checkpointHistory();
    const partGrid = part.openGridOnly
      ? SYSTEM_SPECS.openGrid.grid
      : systemSpec.grid;
    const next: PlannerItem = {
      id: makeId(part.id),
      kind: part.kind,
      catalogId: part.id,
      name: part.name,
      x: snapToGrid(desk.width / 2 - (part.widthCells * partGrid) / 2, partGrid),
      y: snapToGrid(
        desk.depth / 2 - (part.heightCells * partGrid) / 2,
        partGrid,
      ),
      width: part.widthCells * partGrid,
      height: part.heightCells * partGrid,
      rotation: 0,
      layer: part.kind === "grid" ? 0 : layerStack.length,
      ...(part.cables !== undefined ? { cables: part.cables } : {}),
      ...(part.outlets !== undefined ? { outlets: part.outlets } : {}),
      ...(part.kind === "grid"
        ? { maxTileCellsX: 8, maxTileCellsY: 8 }
        : {}),
    };
    setItems((current) => [...current, next]);
    setSelectedId(next.id);
    setSelectedRouteId("");
    setSelectedRoutePoint(null);
    setCatalogOpen(false);
    setActiveTool("select");
    showToast(`${next.name} added — drag or resize it`);
    emitLog("catalog.item_added", {
      itemId: next.id,
      catalogId: part.id,
      kind: part.kind,
    });
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

  function beginSelectionNameEdit() {
    if (selected) {
      nameEdit.current = {
        type: "item",
        id: selected.id,
        original: selected.name,
        recorded: false,
      };
    } else if (selectedRoute) {
      nameEdit.current = {
        type: "route",
        id: selectedRoute.id,
        original: selectedRoute.name,
        recorded: false,
      };
    }
  }

  function changeSelectionName(name: string) {
    const edit = nameEdit.current;
    if (!edit) return;
    if (!edit.recorded) {
      checkpointHistory();
      edit.recorded = true;
    }

    if (edit.type === "item") {
      setItems((current) =>
        current.map((item) =>
          item.id === edit.id ? { ...item, name } : item,
        ),
      );
    } else {
      setRoutes((current) =>
        current.map((route) =>
          route.id === edit.id ? { ...route, name } : route,
        ),
      );
    }
  }

  function finishSelectionNameEdit() {
    const edit = nameEdit.current;
    if (!edit) return;
    const currentName =
      edit.type === "item"
        ? items.find((item) => item.id === edit.id)?.name
        : routes.find((route) => route.id === edit.id)?.name;
    if (edit.recorded && currentName !== undefined && currentName !== edit.original) {
      emitLog(`${edit.type}.renamed`, {
        [`${edit.type}Id`]: edit.id,
        from: edit.original,
        to: currentName,
      });
    }
    nameEdit.current = null;
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
    setSelectedRoutePoint(null);
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
    setSelectedRoutePoint(null);
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
    setSelectedRoutePoint(null);
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
    setSelectedRoutePoint({ routeId, pointIndex });
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
      const movingGrid =
        moving.kind === "grid"
          ? SYSTEM_SPECS.openGrid.grid
          : systemSpec.grid;
      const nextX = snapToGrid(
        clamp(local.x - active.dx, 0, desk.width - moving.width),
        movingGrid,
      );
      const nextY = snapToGrid(
        clamp(local.y - active.dy, 0, desk.depth - moving.height),
        movingGrid,
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
      const resizeGrid =
        start.kind === "grid"
          ? SYSTEM_SPECS.openGrid.grid
          : systemSpec.grid;
      const minWidth =
        start.kind === "power-brick" || start.kind === "holder"
          ? resizeGrid * 3
          : resizeGrid;
      const minHeight =
        start.kind === "power-brick" || start.kind === "holder"
          ? resizeGrid * 2
          : resizeGrid;
      const resized = resizeItemFromCorner(
        start,
        active.corner,
        local,
        desk,
        resizeGrid,
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
      setSelectedRoutePoint(null);
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
    setSelectedRoutePoint(null);
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
    setSelectedRoutePoint((current) =>
      current?.routeId === routeId ? null : current,
    );
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

  function moveSelectionLayer(movement: LayerMovement) {
    const selection = selected
      ? { id: selected.id, type: "item" as const }
      : selectedRoute
        ? { id: selectedRoute.id, type: "route" as const }
        : null;
    if (!selection) return;

    const reordered = reorderLayerStack(
      items,
      routes,
      selection,
      movement,
    ) as Array<{ id: string; type: "item" | "route"; layer: number }>;
    if (
      reordered.every(
        (entry, index) =>
          entry.id === layerStack[index]?.id &&
          entry.type === layerStack[index]?.type,
      )
    ) {
      return;
    }
    const layers = new Map(
      reordered.map((entry) => [`${entry.type}:${entry.id}`, entry.layer]),
    );
    checkpointHistory();
    setItems((current) =>
      current.map((item) => ({
        ...item,
        layer: layers.get(`item:${item.id}`) ?? item.layer,
      })),
    );
    setRoutes((current) =>
      current.map((route) => ({
        ...route,
        layer: layers.get(`route:${route.id}`) ?? route.layer,
      })),
    );
    emitLog("selection.layer_changed", { ...selection, movement });
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
    setSelectedRoutePoint(null);
    emitLog("route.bend_added", { routeId: route.id, points: points.length });
  }

  function removeSelectedBend() {
    if (!selectedRoute || !selectedRoutePointIsBend) return;
    checkpointHistory();
    const points = removeRouteBend(
      selectedRoute.points,
      selectedRoutePointIndex,
    ) as CableRoute["points"];
    setRoutes((current) =>
      current.map((route) =>
        route.id === selectedRoute.id ? { ...route, points } : route,
      ),
    );
    setSelectedRoutePoint(null);
    showToast("Cable bend removed");
    emitLog("route.bend_removed", {
      routeId: selectedRoute.id,
      pointIndex: selectedRoutePointIndex,
      points: points.length,
    });
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

  function renderRouteLayer(route: CableRoute) {
    const routePoints = route.points.map((point) => point.join(",")).join(" ");
    return (
      <g
        key={`route:${route.id}`}
        className={`route ${
          selectedRouteId === route.id ? "selected" : ""
        }`}
      >
        <polyline
          points={routePoints}
          className="route-hit"
          onPointerDown={(event) => handleRoutePointerDown(event, route)}
        />
        <polyline points={routePoints} className="route-halo" />
        <polyline
          points={routePoints}
          stroke={route.color}
          strokeWidth={route.diameter + 3}
        />
        {selectedRouteId === route.id && (
          <polyline points={routePoints} className="route-selection" />
        )}
      </g>
    );
  }

  function renderItemLayer(item: PlannerItem) {
    const gridPlan =
      item.kind === "grid"
        ? (calculateGridTilePlan(
            item.width,
            item.height,
            SYSTEM_SPECS.openGrid.grid,
            item.maxTileCellsX ?? 8,
            item.maxTileCellsY ?? 8,
          ) as { cellsX: number; cellsY: number; tileCount: number })
        : null;
    return (
      <g
        key={`item:${item.id}`}
        className={`planner-item item-${item.kind} ${
          selectedId === item.id ? "selected" : ""
        }`}
        onPointerDown={(event) => handlePointerDown(event, item)}
        filter={item.kind === "grid" ? undefined : "url(#item-shadow)"}
        role="button"
        aria-label={`${item.name}, at ${item.x} by ${item.y} millimetres`}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            setSelectedId(item.id);
            setSelectedRouteId("");
            setSelectedRoutePoint(null);
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
          fill={item.kind === "grid" ? "url(#open-grid-plate)" : undefined}
        />
        {item.kind === "grid" && gridPlan && (
          <>
            <text
              x={item.x + item.width / 2}
              y={item.y + item.height / 2 - 4}
              textAnchor="middle"
              className="grid-label"
            >
              {gridPlan.cellsX} × {gridPlan.cellsY} cells
            </text>
            <text
              x={item.x + item.width / 2}
              y={item.y + item.height / 2 + 18}
              textAnchor="middle"
              className="grid-count-label"
            >
              {gridPlan.tileCount} printable{" "}
              {gridPlan.tileCount === 1 ? "grid" : "grids"}
            </text>
          </>
        )}
        {item.kind === "channel" && (
          <>
            {getChannelPaths(item).map((path) => (
              <path key={path} d={path} className="channel-core" />
            ))}
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
        {item.kind === "cable-loop" && (
          <>
            <ellipse
              cx={item.x + item.width / 2}
              cy={item.y + item.height / 2}
              rx={Math.max(8, item.width / 2 - 16)}
              ry={Math.max(8, item.height / 2 - 16)}
              className="cable-loop-ring"
            />
            <line
              x1={item.x + item.width / 2}
              y1={item.y + 4}
              x2={item.x + item.width / 2}
              y2={item.y + 23}
              className="cable-loop-opening"
            />
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
    );
  }

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

      {catalogOpen && (
        <aside
          className="parts-palette"
          role="dialog"
          aria-modal="false"
          aria-labelledby="parts-palette-title"
        >
          <header>
            <div>
              <span className="eyebrow">Printable catalogue</span>
              <h2 id="parts-palette-title">Add a part</h2>
            </div>
            <button
              type="button"
              onClick={() => {
                setCatalogOpen(false);
                setActiveTool("select");
              }}
              aria-label="Close parts catalogue"
            >
              ×
            </button>
          </header>
          <p>
            Schematic planning parts based on the official Underware and
            openGrid customizers.
          </p>
          {(["Foundation", "Cable routing", "Mounts"] as const).map(
            (category) => (
              <section key={category}>
                <h3>{category}</h3>
                <div className="catalog-grid">
                  {PART_CATALOG.filter(
                    (part) => part.category === category,
                  ).map((part) => (
                    <button
                      type="button"
                      key={part.id}
                      className={
                        part.id === "opengrid-baseplate"
                          ? "priority-part"
                          : ""
                      }
                      onClick={() => addCatalogItem(part)}
                      disabled={part.openGridOnly && system !== "openGrid"}
                    >
                      <span aria-hidden="true">{part.icon}</span>
                      <strong>{part.name}</strong>
                      <small>{part.description}</small>
                    </button>
                  ))}
                </div>
              </section>
            ),
          )}
        </aside>
      )}

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
                setSelectedRoutePoint(null);
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
                <pattern
                  id="open-grid-plate"
                  width={SYSTEM_SPECS.openGrid.grid}
                  height={SYSTEM_SPECS.openGrid.grid}
                  patternUnits="userSpaceOnUse"
                >
                  <rect
                    x="1.5"
                    y="1.5"
                    width={SYSTEM_SPECS.openGrid.grid - 3}
                    height={SYSTEM_SPECS.openGrid.grid - 3}
                    rx="5"
                    className="open-grid-cell"
                  />
                  <circle
                    cx={SYSTEM_SPECS.openGrid.grid / 2}
                    cy={SYSTEM_SPECS.openGrid.grid / 2}
                    r="2.5"
                    className="open-grid-hole"
                  />
                </pattern>
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

              {layerStack.map((entry) => {
                if (entry.type === "route") {
                  const route = routes.find((candidate) => candidate.id === entry.id);
                  return route ? renderRouteLayer(route) : null;
                }
                const item = items.find((candidate) => candidate.id === entry.id);
                return item ? renderItemLayer(item) : null;
              })}

              {selectedRoute && (
                <g className="route-points" aria-label="Cable route control points">
                  {selectedRoute.points.map(([x, y], index) => (
                    <circle
                      key={`${selectedRoute.id}-${index}`}
                      cx={x}
                      cy={y}
                      r="10"
                      className={`route-point ${
                        selectedRoutePointIndex === index ? "selected" : ""
                      }`}
                      onPointerDown={(event) =>
                        handleRoutePointPointerDown(
                          event,
                          selectedRoute.id,
                          index,
                        )
                      }
                      aria-label={
                        index > 0 && index < selectedRoute.points.length - 1
                          ? `Select or move ${selectedRoute.name} bend ${index}`
                          : `Move ${selectedRoute.name} endpoint ${index + 1}`
                      }
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
          {printPlan.gridTilesCount > 0 && (
            <span>
              <small>openGrid</small>
              <strong>
                {printPlan.gridTilesCount}{" "}
                {printPlan.gridTilesCount === 1 ? "grid" : "grids"}
              </strong>
            </span>
          )}
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
            {selected || selectedRoute ? (
              <label className="selection-name">
                <span className="sr-only">Selection name</span>
                <input
                  value={selected?.name ?? selectedRoute?.name ?? ""}
                  onFocus={beginSelectionNameEdit}
                  onChange={(event) => changeSelectionName(event.target.value)}
                  onBlur={finishSelectionNameEdit}
                  aria-label={`Rename ${
                    selected?.name ?? selectedRoute?.name ?? "selection"
                  }`}
                />
                <span aria-hidden="true">✎</span>
              </label>
            ) : (
              <strong>Nothing selected</strong>
            )}
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
                to change its start, end, or bends. Click a bend to select it
                for removal.
              </p>
              {selectedRoutePointIndex !== null && (
                <div className="bend-selection">
                  <span>
                    <strong>
                      {selectedRoutePointIsBend
                        ? `Bend ${selectedRoutePointIndex}`
                        : "Route endpoint"}
                    </strong>
                    {selectedRoutePointIsBend
                      ? "Selected control point"
                      : "Endpoints cannot be removed"}
                  </span>
                  {selectedRoutePointIsBend && (
                    <button
                      type="button"
                      className="danger"
                      onClick={removeSelectedBend}
                    >
                      Remove bend
                    </button>
                  )}
                </div>
              )}
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
              <div className="route-color-field">
                <label>
                  <span>Route color</span>
                  <input
                    type="color"
                    value={selectedRoute.color}
                    onChange={(event) =>
                      updateRoute(selectedRoute.id, {
                        color: event.target.value,
                      })
                    }
                    aria-label={`${selectedRoute.name} color`}
                  />
                </label>
                <div className="color-swatches" aria-label="Route color presets">
                  {ROUTE_COLORS.map((color) => (
                    <button
                      type="button"
                      key={color}
                      className={selectedRoute.color === color ? "active" : ""}
                      style={{ background: color }}
                      onClick={() =>
                        updateRoute(selectedRoute.id, { color })
                      }
                      aria-label={`Set route color to ${color}`}
                      aria-pressed={selectedRoute.color === color}
                    />
                  ))}
                </div>
              </div>
            </section>
            <section className="inspector-section">
              <h2>Layer order</h2>
              <div className="layer-options">
                <button type="button" onClick={() => moveSelectionLayer("back")}>
                  Send to back
                </button>
                <button
                  type="button"
                  onClick={() => moveSelectionLayer("backward")}
                >
                  Send backward
                </button>
                <button
                  type="button"
                  onClick={() => moveSelectionLayer("forward")}
                >
                  Bring forward
                </button>
                <button type="button" onClick={() => moveSelectionLayer("front")}>
                  Bring to front
                </button>
              </div>
              <p>Routes and physical parts share the same visual layer stack.</p>
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

            <section className="inspector-section">
              <h2>Layer order</h2>
              <div className="layer-options">
                <button type="button" onClick={() => moveSelectionLayer("back")}>
                  Send to back
                </button>
                <button
                  type="button"
                  onClick={() => moveSelectionLayer("backward")}
                >
                  Send backward
                </button>
                <button
                  type="button"
                  onClick={() => moveSelectionLayer("forward")}
                >
                  Bring forward
                </button>
                <button type="button" onClick={() => moveSelectionLayer("front")}>
                  Bring to front
                </button>
              </div>
              <p>
                Use this to place a power brick behind a cable route or keep a
                grid below every mounted part.
              </p>
            </section>

            {selected.kind === "grid" && selectedGridPlan && (
              <section className="inspector-section grid-config">
                <div className="section-heading">
                  <h2>openGrid coverage</h2>
                  <strong>
                    {selectedGridPlan.tileCount}{" "}
                    {selectedGridPlan.tileCount === 1 ? "grid" : "grids"} to
                    print
                  </strong>
                </div>
                <div className="grid-coverage-summary">
                  <span>
                    <strong>
                      {selectedGridPlan.cellsX} × {selectedGridPlan.cellsY}
                    </strong>
                    cells covered
                  </span>
                  <span>
                    <strong>
                      {selectedGridPlan.columns} × {selectedGridPlan.rows}
                    </strong>
                    printable tiles
                  </span>
                </div>
                <div className="field-grid">
                  <label>
                    <span>Cells W</span>
                    <span className="input-unit">
                      <input
                        type="number"
                        min="1"
                        value={selectedGridPlan.cellsX}
                        onChange={(event) =>
                          updateSelected({
                            width:
                              Math.max(1, Number(event.target.value)) *
                              SYSTEM_SPECS.openGrid.grid,
                          })
                        }
                      />
                    </span>
                  </label>
                  <label>
                    <span>Cells H</span>
                    <span className="input-unit">
                      <input
                        type="number"
                        min="1"
                        value={selectedGridPlan.cellsY}
                        onChange={(event) =>
                          updateSelected({
                            height:
                              Math.max(1, Number(event.target.value)) *
                              SYSTEM_SPECS.openGrid.grid,
                          })
                        }
                      />
                    </span>
                  </label>
                  <label>
                    <span>Tile max W</span>
                    <span className="input-unit">
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={selected.maxTileCellsX ?? 8}
                        onChange={(event) =>
                          updateSelected({
                            maxTileCellsX: Math.max(
                              1,
                              Number(event.target.value),
                            ),
                          })
                        }
                      />
                    </span>
                  </label>
                  <label>
                    <span>Tile max H</span>
                    <span className="input-unit">
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={selected.maxTileCellsY ?? 8}
                        onChange={(event) =>
                          updateSelected({
                            maxTileCellsY: Math.max(
                              1,
                              Number(event.target.value),
                            ),
                          })
                        }
                      />
                    </span>
                  </label>
                </div>
                <p>
                  Defaults to 8 × 8 cells (224 × 224 mm). Change the maximum
                  tile size to match your printer bed; the print list splits
                  edge grids automatically.
                </p>
              </section>
            )}

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
                  setSelectedRouteId("");
                  setSelectedRoutePoint(null);
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
                  setSelectedRoutePoint(null);
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
            <div
              className={`print-totals ${
                printPlan.gridTilesCount > 0 ? "has-grid-total" : ""
              }`}
            >
              <span>
                <strong>{printPlan.partsCount}</strong>
                <small>parts</small>
              </span>
              {printPlan.gridTilesCount > 0 && (
                <span>
                  <strong>{printPlan.gridTilesCount}</strong>
                  <small>openGrid plates</small>
                </span>
              )}
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
                    <small>
                      {group.label.startsWith("openGrid baseplate")
                        ? "openGrid compatible"
                        : `${systemSpec.label} compatible`}
                    </small>
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
