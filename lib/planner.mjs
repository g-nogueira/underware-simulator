export const SYSTEM_SPECS = Object.freeze({
  openGrid: Object.freeze({
    label: "openGrid",
    grid: 28,
    channelCapacity: 6,
  }),
  underware: Object.freeze({
    label: "Underware",
    grid: 25,
    channelCapacity: 5,
  }),
});

const ITEM_KINDS = new Set([
  "channel",
  "power-brick",
  "holder",
  "obstacle",
]);

export function snapToGrid(value, gridSize) {
  if (!Number.isFinite(value) || !Number.isFinite(gridSize) || gridSize <= 0) {
    throw new TypeError("Grid snapping requires finite values and a positive grid");
  }
  return Math.round(value / gridSize) * gridSize;
}

export function clampToDesk(item, desk, gridSize) {
  const maxX = Math.max(0, desk.width - item.width);
  const maxY = Math.max(0, desk.depth - item.height);
  return {
    x: Math.min(Math.max(snapToGrid(item.x, gridSize), 0), maxX),
    y: Math.min(Math.max(snapToGrid(item.y, gridSize), 0), maxY),
  };
}

export function getCapacityState(cableCount, limit) {
  const percent = limit > 0 ? Math.round((cableCount / limit) * 100) : 0;
  return {
    percent,
    level: percent > 100 ? "over" : percent > 80 ? "near" : "ok",
    remaining: Math.max(limit - cableCount, 0),
  };
}

export function calculatePrintPlan(items, systemId) {
  const system = SYSTEM_SPECS[systemId];
  if (!system) throw new TypeError(`Unsupported system: ${systemId}`);

  const printableItems = items.filter((item) => item.kind !== "obstacle");
  const groups = new Map();

  for (const item of printableItems) {
    const label =
      item.kind === "channel"
        ? `${item.name} · ${Math.max(item.width, item.height)} mm`
        : item.name;
    groups.set(label, (groups.get(label) ?? 0) + 1);
  }

  const printMinutes = Math.round(
    printableItems.reduce(
      (sum, item) => sum + (item.width * item.height) / 510,
      0,
    ),
  );
  const filamentGrams = Math.round(
    printableItems.reduce(
      (sum, item) => sum + (item.width * item.height) / 2050,
      0,
    ),
  );
  const overCapacity = items.filter(
    (item) =>
      item.kind === "channel" &&
      (item.cables ?? 0) > system.channelCapacity,
  );

  return {
    partsCount: printableItems.length,
    printMinutes,
    filamentGrams,
    groups: [...groups.entries()].map(([label, count]) => ({ label, count })),
    overCapacityIds: overCapacity.map((item) => item.id),
  };
}

export function validatePlanFile(value) {
  if (!value || typeof value !== "object") {
    return { ok: false, reason: "Plan must be an object" };
  }
  if (value.version !== 1) {
    return { ok: false, reason: "Unsupported plan version" };
  }
  if (!SYSTEM_SPECS[value.system]) {
    return { ok: false, reason: "Unsupported mounting system" };
  }
  if (
    !value.desk ||
    !Number.isFinite(value.desk.width) ||
    !Number.isFinite(value.desk.depth) ||
    value.desk.width <= 0 ||
    value.desk.depth <= 0
  ) {
    return { ok: false, reason: "Desk dimensions must be positive numbers" };
  }
  if (!Array.isArray(value.items) || !Array.isArray(value.routes)) {
    return { ok: false, reason: "Plan items and routes must be arrays" };
  }
  if (
    value.items.some(
      (item) =>
        !item ||
        typeof item !== "object" ||
        typeof item.id !== "string" ||
        !ITEM_KINDS.has(item.kind) ||
        !Number.isFinite(item.x) ||
        !Number.isFinite(item.y) ||
        !Number.isFinite(item.width) ||
        !Number.isFinite(item.height),
    )
  ) {
    return { ok: false, reason: "Plan contains an invalid item" };
  }

  return { ok: true, plan: value };
}
