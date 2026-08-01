"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  buildLayerStack,
  calculateCableRouteGeometries,
  calculateRouteLength,
  calculatePrintPlan,
  insertRouteBend,
  removeRouteBend,
  reorderLayerStack,
  snapToGrid,
} from "@/lib/planner.mjs";

import { SYSTEMS } from "../model/catalog";
import { INITIAL_ITEMS, INITIAL_ROUTES } from "../model/initial-plan";
import { useCanvasInteractions } from "./use-canvas-interactions";
import { usePlanHistory } from "./use-plan-history";
import { usePlanPersistence } from "./use-plan-persistence";
import { usePlannerTrace } from "./use-planner-trace";
import type {
  CableRoute,
  LayerMovement,
  PlanFile,
  PlannerItem,
  PlanSnapshot,
  SystemId,
  ToolId,
} from "../model/types";
import type { PartRegistry } from "../parts/contracts";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function makeId(prefix: string) {
  return prefix + "-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

export function usePlannerController(partRegistry: PartRegistry) {
  const [system, setSystem] = useState<SystemId>("openGrid");
  const [activeTool, setActiveTool] = useState<ToolId>("select");
  const [planName, setPlanName] = useState("Gustavo’s desk");
  const [desk, setDesk] = useState({ width: 1600, depth: 800 });
  const [deskDraft, setDeskDraft] = useState<{
    width: number | "";
    depth: number | "";
  }>({ width: 1600, depth: 800 });
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
  const selectedRouteLength = selectedRoute
    ? Math.round(calculateRouteLength(selectedRoute.points))
    : 0;
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
      calculatePrintPlan(items, system, partRegistry.printDefinitions) as {
        partsCount: number;
        printMinutes: number;
        filamentGrams: number;
        groups: Array<{ label: string; count: number; catalogId?: string }>;
        overCapacityIds: string[];
        gridTilesCount: number;
      },
    [items, partRegistry, system],
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
    getItemGridSize: (item) =>
      partRegistry.gridSizeFor(item, systemSpec.grid),
    getItemMinimumSize: (item) =>
      partRegistry.minimumSizeFor(item, systemSpec.grid),
  });

  const { savedAt, exportPlan, importPlan } = usePlanPersistence({
    planName,
    system,
    desk,
    items,
    routes,
    restorePlan: restorePlanFile,
    checkpointHistory,
    initializeTrace,
    showToast,
    emitLog,
  });

  function restorePlanFile(plan: PlanFile) {
    setPlanName(plan.name);
    setSystem(plan.system);
    setDesk(plan.desk);
    setDeskDraft(plan.desk);
    setItems(plan.items);
    setRoutes(plan.routes);
    setSelectedId(plan.items[0]?.id ?? "");
    setSelectedRouteId("");
    setSelectedRoutePoint(null);
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

  function changeSystem(nextSystem: SystemId) {
    if (nextSystem === system) return;
    checkpointHistory();
    const nextGrid = SYSTEMS[nextSystem].grid;
    setSystem(nextSystem);
    setItems((current) =>
      current.map((item) => {
        const itemGrid = partRegistry.gridSizeFor(item, nextGrid);
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
      const part = partRegistry.findForTool(tool);
      if (part) addCatalogItem(part.catalog.id);
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

  function canAddCatalogItem(partId: string) {
    return partRegistry.isAvailable(partId, system);
  }

  function addCatalogItem(partId: string) {
    const part = partRegistry.get(partId);
    if (!part) return;
    if (!canAddCatalogItem(partId)) {
      showToast(`${part.catalog.name} is not available for ${systemSpec.label}`);
      setActiveTool("select");
      return;
    }

    checkpointHistory();
    const next = partRegistry.create(partId, {
      desk,
      activeGrid: systemSpec.grid,
      layer: layerStack.length,
      makeId,
      snapToGrid,
    });
    if (!next) return;
    setItems((current) => [...current, next]);
    setSelectedId(next.id);
    setSelectedRouteId("");
    setSelectedRoutePoint(null);
    setCatalogOpen(false);
    setActiveTool("select");
    showToast(`${next.name} added — drag or resize it`);
    emitLog("catalog.item_added", {
      itemId: next.id,
      catalogId: partId,
      kind: next.kind,
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
    const { width, depth } = deskDraft;
    if (
      typeof width !== "number" ||
      typeof depth !== "number" ||
      !Number.isFinite(width) ||
      !Number.isFinite(depth) ||
      width < 300 ||
      depth < 300
    ) {
      showToast("Use desk dimensions of at least 300 × 300 mm");
      return;
    }
    const nextDesk = { width, depth };
    checkpointHistory();
    setDesk(nextDesk);
    setItems((current) =>
      current.map((item) => ({
        ...item,
        x: clamp(item.x, 0, Math.max(0, width - item.width)),
        y: clamp(item.y, 0, Math.max(0, depth - item.height)),
      })),
    );
    setRoutes((current) =>
      current.map((route) => ({
        ...route,
        points: route.points.map(([x, y]) => [
          clamp(x, 0, width),
          clamp(y, 0, depth),
        ]),
      })),
    );
    setDeskOpen(false);
    showToast("Desk dimensions updated");
    emitLog("desk.resized", nextDesk);
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
        if (editing) return;
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

  function updateDeskDraft(
    dimension: "width" | "depth",
    value: number | "",
  ) {
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
    partCatalog: partRegistry.catalog,
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
    selectedRouteLength,
    layerStack,
    itemById,
    routeById,
    printPlan,
    undoPlan,
    redoPlan,
    changeSystem,
    selectTool,
    canAddCatalogItem,
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


