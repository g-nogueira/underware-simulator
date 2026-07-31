"use client";

import {
  ChangeEvent,
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  SYSTEM_SPECS,
  buildLayerStack,
  calculateCableRouteGeometries,
  calculateGridTilePlan,
  calculateRouteLength,
  calculatePrintPlan,
  getCapacityState,
  insertRouteBend,
  removeRouteBend,
  reorderLayerStack,
  snapToGrid,
  validatePlanFile,
} from "@/lib/planner.mjs";

import {
  AUTOSAVE_KEY,
  PART_CATALOG,
  SYSTEMS,
} from "../model/catalog";
import { INITIAL_ITEMS, INITIAL_ROUTES } from "../model/initial-plan";
import { useCanvasInteractions } from "./use-canvas-interactions";
import { usePlanHistory } from "./use-plan-history";
import { usePlannerTrace } from "./use-planner-trace";
import type {
  CableRoute,
  CatalogItem,
  LayerMovement,
  PlanFile,
  PlannerItem,
  PlanSnapshot,
  SystemId,
  ToolId,
} from "../model/types";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function makeId(prefix: string) {
  return prefix + "-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

function usePlannerController() {
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
  const [readyToSave, setReadyToSave] = useState(false);
  const [savedAt, setSavedAt] = useState("");
  const nameEdit = useRef<{
    type: "item" | "route";
    id: string;
    original: string;
    recorded: boolean;
  } | null>(null);

  const selected = items.find((item) => item.id === selectedId) ?? null;
  const selectedRoute =
    routes.find((route) => route.id === selectedRouteId) ?? null;
  const routeGeometryById = useMemo(
    () =>
      new Map(
        (
          calculateCableRouteGeometries(routes) as Array<{
            id: string;
            path: string;
            sharedSegmentCount: number;
            maxBundleSize: number;
          }>
        ).map((geometry) => [geometry.id, geometry]),
      ),
    [routes],
  );
  const selectedRouteGeometry = selectedRoute
    ? routeGeometryById.get(selectedRoute.id)
    : null;
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
    selected?.kind === "grid" &&
    Number.isFinite(selected.width) &&
    Number.isFinite(selected.height) &&
    selected.width > 0 &&
    selected.height > 0
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
  const itemById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );
  const routeById = useMemo(
    () => new Map(routes.map((route) => [route.id, route])),
    [routes],
  );
  const printPlan = useMemo(
    () =>
      calculatePrintPlan(items, system) as {
        partsCount: number;
        printMinutes: number;
        filamentGrams: number;
        groups: Array<{ label: string; count: number; catalogId?: string }>;
        overCapacityIds: string[];
        gridTilesCount: number;
      },
    [items, system],
  );

  const {
    traceId,
    traceEvents,
    toast,
    initializeTrace,
    showToast,
    emitLog,
    exportTrace: exportPlannerTrace,
  } = usePlannerTrace();

  const { historyState, checkpointHistory, undoPlan, redoPlan } =
    usePlanHistory({
      snapshot: { system, desk, items, routes },
      restoreSnapshot,
      emitLog,
    });

  const {
    selectItem,
    selectRoute,
    clearSelection,
    handlePointerDown,
    handleResizePointerDown,
    handleRoutePointerDown,
    handleRoutePointPointerDown,
    handlePointerMove,
    handlePointerUp,
    cancelCanvasInteraction,
  } = useCanvasInteractions({
    activeTool,
    gridSize: systemSpec.grid,
    desk,
    items,
    routes,
    setItems,
    setRoutes,
    setSelectedId,
    setSelectedRouteId,
    setSelectedRoutePoint,
    checkpointHistory,
    emitLog,
  });

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
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

      initializeTrace(saved ? "plan.autosave_restored" : "plan.started");
      setReadyToSave(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [initializeTrace]);

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
      const next = !catalogOpen;
      setCatalogOpen(next);
      setActiveTool(next ? "parts" : "select");
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
    exportPlannerTrace({ name: planName, system, desk });
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

  function duplicateSelected() {
    if (!selected) return;
    checkpointHistory();
    const copy = {
      ...selected,
      id: makeId(selected.kind),
      x: selected.x + systemSpec.grid,
      y: selected.y + systemSpec.grid,
      name: `${selected.name} copy`,
    };
    setItems((current) => [...current, copy]);
    selectItem(copy.id);
    emitLog("item.duplicated", {
      sourceId: selected.id,
      itemId: copy.id,
    });
  }

  function renamePlan(name: string) {
    setPlanName(name);
  }

  function closeCatalog() {
    setCatalogOpen(false);
    setActiveTool("select");
  }

  function openDeskSetup() {
    setDeskDraft(desk);
    setDeskOpen(true);
  }

  function closeDeskSetup() {
    setDeskOpen(false);
  }

  function updateDeskDraft(dimension: "width" | "depth", value: number) {
    setDeskDraft((current) => ({ ...current, [dimension]: value }));
  }

  function zoomBy(delta: number) {
    setZoom((value) => clamp(value + delta, 64, 120));
  }

  function resetZoom() {
    setZoom(88);
  }

  function openPrintPlan() {
    setPrintOpen(true);
  }

  function closePrintPlan() {
    setPrintOpen(false);
  }

  function openTrace() {
    setTraceOpen(true);
  }

  function closeTrace() {
    setTraceOpen(false);
  }


  return {
    system,
    activeTool,
    planName,
    desk,
    deskDraft,
    routes,
    selectedId,
    selectedRouteId,
    catalogOpen,
    zoom,
    printOpen,
    deskOpen,
    traceOpen,
    traceId,
    traceEvents,
    savedAt,
    historyState,
    toast,
    selected,
    selectedRoute,
    routeGeometryById,
    selectedRouteGeometry,
    selectedRoutePointIndex,
    selectedRoutePointIsBend,
    systemSpec,
    capacity,
    capacityState,
    selectedRouteLength,
    selectedGridPlan,
    layerStack,
    itemById,
    routeById,
    printPlan,
    undoPlan,
    redoPlan,
    changeSystem,
    selectTool,
    addCatalogItem,
    updateSelected,
    beginSelectionNameEdit,
    changeSelectionName,
    finishSelectionNameEdit,
    rotateSelected,
    handlePointerMove,
    handlePointerUp,
    handlePointerDown,
    handleResizePointerDown,
    handleRoutePointerDown,
    handleRoutePointPointerDown,
    exportPlan,
    importPlan,
    deleteSelected,
    applyDeskDimensions,
    removeRoute,
    updateRoute,
    moveSelectionLayer,
    addRouteBend,
    removeSelectedBend,
    exportTrace,
    selectItem,
    selectRoute,
    clearSelection,
    cancelCanvasInteraction,
    duplicateSelected,
    renamePlan,
    closeCatalog,
    openDeskSetup,
    closeDeskSetup,
    updateDeskDraft,
    zoomBy,
    resetZoom,
    openPrintPlan,
    closePrintPlan,
    openTrace,
    closeTrace,
  };
}

export type PlannerFacade = ReturnType<typeof usePlannerController>;

const PlannerContext = createContext<PlannerFacade | null>(null);

export function PlannerProvider({ children }: { children: ReactNode }) {
  const facade = usePlannerController();
  return (
    <PlannerContext.Provider value={facade}>{children}</PlannerContext.Provider>
  );
}

export function usePlanner() {
  const facade = useContext(PlannerContext);
  if (!facade) {
    throw new Error("usePlanner must be used inside PlannerProvider");
  }
  return facade;
}
