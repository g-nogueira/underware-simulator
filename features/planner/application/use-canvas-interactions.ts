"use client";

import {
  PointerEvent as ReactPointerEvent,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  moveRoutePoint,
  resizeItemFromCorner,
  snapToGrid,
  translateRoute,
} from "@/lib/planner.mjs";

import type {
  CableRoute,
  CanvasInteraction,
  PlannerItem,
  ResizeCorner,
  ToolId,
} from "../model/types";

type CanvasInteractionOptions = {
  activeTool: ToolId;
  gridSize: number;
  desk: { width: number; depth: number };
  items: PlannerItem[];
  routes: CableRoute[];
  setItems: Dispatch<SetStateAction<PlannerItem[]>>;
  setRoutes: Dispatch<SetStateAction<CableRoute[]>>;
  setSelectedId: Dispatch<SetStateAction<string>>;
  setSelectedRouteId: Dispatch<SetStateAction<string>>;
  setSelectedRoutePoint: Dispatch<
    SetStateAction<{ routeId: string; pointIndex: number } | null>
  >;
  checkpointHistory: () => void;
  emitLog: (
    event: string,
    details?: Record<string, unknown>,
    level?: "info" | "warn",
  ) => void;
  getItemGridSize: (item: PlannerItem) => number;
  getItemMinimumSize: (
    item: PlannerItem,
  ) => { width: number; height: number };
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function toLocalPoint(svg: SVGSVGElement, clientX: number, clientY: number) {
  const screenCtm = svg.getScreenCTM();
  if (!screenCtm) return null;
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  return point.matrixTransform(screenCtm.inverse());
}

/**
 * Owns the SVG pointer state machine. Components receive semantic handlers
 * instead of depending on mutable interaction refs or geometry helpers.
 */
export function useCanvasInteractions({
  activeTool,
  gridSize,
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
  getItemGridSize,
  getItemMinimumSize,
}: CanvasInteractionOptions) {
  const interactionRef = useRef<CanvasInteraction | null>(null);

  function selectItem(itemId: string) {
    setSelectedId(itemId);
    setSelectedRouteId("");
    setSelectedRoutePoint(null);
  }

  function selectRoute(routeId: string) {
    setSelectedId("");
    setSelectedRouteId(routeId);
    setSelectedRoutePoint(null);
  }

  function clearSelection() {
    setSelectedId("");
    setSelectedRouteId("");
    setSelectedRoutePoint(null);
  }

  function handlePointerDown(
    event: ReactPointerEvent<SVGGElement>,
    item: PlannerItem,
  ) {
    if (activeTool !== "select") return;
    event.stopPropagation();
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const local = toLocalPoint(svg, event.clientX, event.clientY);
    if (!local) return;
    checkpointHistory();
    event.currentTarget.setPointerCapture(event.pointerId);
    interactionRef.current = {
      type: "move-item",
      id: item.id,
      dx: local.x - item.x,
      dy: local.y - item.y,
    };
    selectItem(item.id);
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
    interactionRef.current = {
      type: "resize-item",
      id: item.id,
      corner,
      startItem: { ...item },
    };
    selectItem(item.id);
  }

  function handleRoutePointerDown(
    event: ReactPointerEvent<SVGPathElement>,
    route: CableRoute,
  ) {
    if (activeTool !== "select") return;
    event.stopPropagation();
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const local = toLocalPoint(svg, event.clientX, event.clientY);
    if (!local) return;
    checkpointHistory();
    event.currentTarget.setPointerCapture(event.pointerId);
    interactionRef.current = {
      type: "move-route",
      id: route.id,
      startX: local.x,
      startY: local.y,
      startPoints: route.points.map(([x, y]) => [x, y]),
    };
    selectRoute(route.id);
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
    interactionRef.current = {
      type: "route-point",
      id: routeId,
      pointIndex,
    };
    selectRoute(routeId);
    setSelectedRoutePoint({ routeId, pointIndex });
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const active = interactionRef.current;
    if (!active) return;
    const svg = event.currentTarget;
    const local = toLocalPoint(svg, event.clientX, event.clientY);
    if (!local) return;

    if (active.type === "move-item") {
      const moving = items.find((item) => item.id === active.id);
      if (!moving) return;
      const movingGrid = getItemGridSize(moving);
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
      const resizeGrid = getItemGridSize(start);
      const minimumSize = getItemMinimumSize(start);
      const resized = resizeItemFromCorner(
        start,
        active.corner,
        local,
        desk,
        resizeGrid,
        minimumSize,
      );

      setItems((current) =>
        current.map((item) =>
          item.id === active.id ? { ...item, ...resized } : item,
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
        gridSize,
      ) as CableRoute["points"];
      setRoutes((current) =>
        current.map((route) =>
          route.id === active.id ? { ...route, points } : route,
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
                gridSize,
              ) as CableRoute["points"],
            }
          : route,
      ),
    );
  }

  function handlePointerUp() {
    const active = interactionRef.current;
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
    interactionRef.current = null;
  }

  function cancelCanvasInteraction() {
    interactionRef.current = null;
  }

  return {
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
  };
}
