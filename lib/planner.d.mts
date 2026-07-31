export type SystemId = "openGrid" | "underware";

export const SYSTEM_SPECS: Readonly<{
  openGrid: Readonly<{
    label: "openGrid";
    grid: 28;
    channelCapacity: 6;
  }>;
  underware: Readonly<{
    label: "Underware";
    grid: 25;
    channelCapacity: 5;
  }>;
}>;

export function snapToGrid(value: number, gridSize: number): number;

export function getCapacityState(
  cableCount: number,
  limit: number,
): {
  percent: number;
  level: "ok" | "near" | "over";
  remaining: number;
};

export function getPowerBrickOutletLayout(
  width: number,
  height: number,
  outletCount: number,
): Array<{ x: number; y: number; radius: number }>;

export function getChannelGeometry(item: {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: 0 | 90 | 180 | 270;
  catalogId?: string;
}): {
  paths: string[];
  branchWidth: number;
  transform?: string;
};

export function calculateRouteLength(
  points: Array<[number, number]>,
): number;

export type CableRouteGeometryInput = {
  id: string;
  points: Array<[number, number]>;
  diameter?: number;
  layer?: number;
};

export type CableRouteGeometry = {
  id: string;
  path: string;
  displayPoints: Array<[number, number]>;
  segmentOffsets: number[];
  sharedSegmentCount: number;
  maxBundleSize: number;
  routeIndex: number;
};

export function calculateCableRouteGeometries(
  routes: CableRouteGeometryInput[],
  options?: {
    channelTolerance?: number;
    laneGap?: number;
    cornerRadius?: number;
  },
): CableRouteGeometry[];

export function insertRouteBend(
  points: Array<[number, number]>,
): Array<[number, number]>;

export function removeRouteBend(
  points: Array<[number, number]>,
  pointIndex: number,
): Array<[number, number]>;

export function resizeItemFromCorner(
  item: { x: number; y: number; width: number; height: number },
  corner: "nw" | "ne" | "sw" | "se",
  pointer: { x: number; y: number },
  desk: { width: number; depth: number },
  gridSize: number,
  minimumSize?: { width: number; height: number },
): { x: number; y: number; width: number; height: number };

export function translateRoute(
  points: Array<[number, number]>,
  deltaX: number,
  deltaY: number,
  desk: { width: number; depth: number },
  gridSize: number,
): Array<[number, number]>;

export function moveRoutePoint(
  points: Array<[number, number]>,
  pointIndex: number,
  pointer: { x: number; y: number },
  desk: { width: number; depth: number },
  gridSize: number,
): Array<[number, number]>;

export type LayerEntry = {
  id: string;
  type: "item" | "route";
  layer: number;
};

export function buildLayerStack(
  items: Array<{ id: string; layer?: number }>,
  routes: Array<{ id: string; layer?: number }>,
): LayerEntry[];

export function reorderLayerStack(
  items: Array<{ id: string; layer?: number }>,
  routes: Array<{ id: string; layer?: number }>,
  selection: { id: string; type: "item" | "route" },
  movement: "back" | "backward" | "forward" | "front",
): LayerEntry[];

export function calculateGridTilePlan(
  width: number,
  height: number,
  tileSize?: number,
  maxTileCellsX?: number,
  maxTileCellsY?: number,
): {
  cellsX: number;
  cellsY: number;
  columns: number;
  rows: number;
  tileCount: number;
  groups: Array<{ label: string; count: number; catalogId?: string }>;
};

export function calculatePrintPlan(
  items: Array<{
    id: string;
    kind: string;
    name: string;
    width: number;
    height: number;
    cables?: number;
    catalogId?: string;
    maxTileCellsX?: number;
    maxTileCellsY?: number;
  }>,
  systemId: SystemId,
): {
  partsCount: number;
  printMinutes: number;
  filamentGrams: number;
  groups: Array<{ label: string; count: number }>;
  overCapacityIds: string[];
  gridTilesCount: number;
};

export function validatePlanFile(value: unknown):
  | { ok: false; reason: string }
  | { ok: true; plan: unknown };
