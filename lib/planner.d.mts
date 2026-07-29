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

export function calculateRouteLength(
  points: Array<[number, number]>,
): number;

export function insertRouteBend(
  points: Array<[number, number]>,
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

export function calculatePrintPlan(
  items: Array<{
    id: string;
    kind: string;
    name: string;
    width: number;
    height: number;
    cables?: number;
  }>,
  systemId: SystemId,
): {
  partsCount: number;
  printMinutes: number;
  filamentGrams: number;
  groups: Array<{ label: string; count: number }>;
  overCapacityIds: string[];
};

export function validatePlanFile(value: unknown):
  | { ok: false; reason: string }
  | { ok: true; plan: unknown };
