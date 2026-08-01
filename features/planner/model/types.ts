export type SystemId = "openGrid" | "underware";

export type ToolId = "select" | "grid" | "parts" | "route" | "obstacle";

export type ItemKind =
  | "part"
  | "grid"
  | "channel"
  | "cable-loop"
  | "power-brick"
  | "holder"
  | "obstacle";

/**
 * Catalogue IDs are deliberately open. Part modules own their identifiers, so
 * registering a new shape does not require reopening a central union.
 */
export type CatalogItemId = string;

export type LayerMovement = "back" | "backward" | "forward" | "front";

export type PlannerItem = {
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

export type CableRoute = {
  id: string;
  name: string;
  color: string;
  points: Array<[number, number]>;
  diameter: number;
  layer?: number;
};

export type PlanFile = {
  version: 1;
  name: string;
  system: SystemId;
  desk: { width: number; depth: number };
  items: PlannerItem[];
  routes: CableRoute[];
  savedAt?: string;
};

export type PlanSnapshot = Pick<
  PlanFile,
  "system" | "desk" | "items" | "routes"
>;

export type TraceEvent = {
  timestamp: string;
  level: "info" | "warn";
  event: string;
  traceId: string;
  details?: Record<string, unknown>;
};

export type ResizeCorner = "nw" | "ne" | "sw" | "se";

export type CanvasInteraction =
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

export type CatalogItem = {
  id: CatalogItemId;
  kind: Exclude<ItemKind, "obstacle">;
  name: string;
  icon: string;
  category: string;
  description: string;
  widthCells: number;
  heightCells: number;
  /** Exact top-down footprint when the printable model is not cell-sized. */
  footprintMm?: { width: number; height: number };
  featured?: boolean;
};

export type LayerEntry = {
  id: string;
  type: "item" | "route";
  layer: number;
};

export type RouteGeometry = {
  id: string;
  path: string;
  sharedSegmentCount: number;
  maxBundleSize: number;
};

export type GridTilePlan = {
  cellsX: number;
  cellsY: number;
  columns: number;
  rows: number;
  tileCount: number;
};

export type PrintPlan = {
  partsCount: number;
  printMinutes: number;
  filamentGrams: number;
  groups: Array<{ label: string; count: number; catalogId?: string }>;
  overCapacityIds: string[];
  gridTilesCount: number;
};
