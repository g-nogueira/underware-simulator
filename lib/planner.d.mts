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
