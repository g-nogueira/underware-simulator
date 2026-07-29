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

export function getPowerBrickOutletLayout(width, height, outletCount) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new TypeError("Power brick dimensions must be positive numbers");
  }

  const count = Math.min(
    Math.max(Math.round(Number.isFinite(outletCount) ? outletCount : 1), 1),
    16,
  );
  const padding = Math.min(18, Math.max(7, Math.min(width, height) * 0.16));
  const columns = Math.min(
    count,
    Math.max(1, Math.ceil(Math.sqrt((count * width) / height))),
  );
  const rows = Math.ceil(count / columns);
  const cellWidth = Math.max((width - padding * 2) / columns, 1);
  const cellHeight = Math.max((height - padding * 2) / rows, 1);
  const radius = Math.min(17, Math.max(4, Math.min(cellWidth, cellHeight) * 0.28));

  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const rowCount = Math.min(columns, count - row * columns);
    const rowOffset = ((columns - rowCount) * cellWidth) / 2;
    return {
      x: padding + rowOffset + (column + 0.5) * cellWidth,
      y: padding + (row + 0.5) * cellHeight,
      radius,
    };
  });
}

export function calculateRouteLength(points) {
  if (!Array.isArray(points) || points.length < 2) return 0;

  return points.slice(1).reduce((total, [x, y], index) => {
    const [previousX, previousY] = points[index];
    return total + Math.hypot(x - previousX, y - previousY);
  }, 0);
}

export function insertRouteBend(points) {
  if (!Array.isArray(points) || points.length < 2) return points;

  let longestIndex = 0;
  let longestLength = -1;
  for (let index = 0; index < points.length - 1; index += 1) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[index + 1];
    const length = Math.hypot(x2 - x1, y2 - y1);
    if (length > longestLength) {
      longestLength = length;
      longestIndex = index;
    }
  }

  const [x1, y1] = points[longestIndex];
  const [x2, y2] = points[longestIndex + 1];
  return [
    ...points.slice(0, longestIndex + 1),
    [(x1 + x2) / 2, (y1 + y2) / 2],
    ...points.slice(longestIndex + 1),
  ];
}

export function resizeItemFromCorner(
  item,
  corner,
  pointer,
  desk,
  gridSize,
  minimumSize = { width: gridSize, height: gridSize },
) {
  const right = item.x + item.width;
  const bottom = item.y + item.height;
  let left = item.x;
  let top = item.y;
  let nextRight = right;
  let nextBottom = bottom;

  if (corner.includes("w")) {
    left = Math.min(
      Math.max(snapToGrid(pointer.x, gridSize), 0),
      right - minimumSize.width,
    );
  }
  if (corner.includes("e")) {
    nextRight = Math.min(
      Math.max(
        snapToGrid(pointer.x, gridSize),
        item.x + minimumSize.width,
      ),
      desk.width,
    );
  }
  if (corner.includes("n")) {
    top = Math.min(
      Math.max(snapToGrid(pointer.y, gridSize), 0),
      bottom - minimumSize.height,
    );
  }
  if (corner.includes("s")) {
    nextBottom = Math.min(
      Math.max(
        snapToGrid(pointer.y, gridSize),
        item.y + minimumSize.height,
      ),
      desk.depth,
    );
  }

  return {
    x: left,
    y: top,
    width: nextRight - left,
    height: nextBottom - top,
  };
}

export function translateRoute(points, deltaX, deltaY, desk, gridSize) {
  if (!Array.isArray(points) || points.length === 0) return points;

  const minX = Math.min(...points.map(([x]) => x));
  const maxX = Math.max(...points.map(([x]) => x));
  const minY = Math.min(...points.map(([, y]) => y));
  const maxY = Math.max(...points.map(([, y]) => y));
  const constrainedX = Math.min(
    Math.max(snapToGrid(deltaX, gridSize), -minX),
    desk.width - maxX,
  );
  const constrainedY = Math.min(
    Math.max(snapToGrid(deltaY, gridSize), -minY),
    desk.depth - maxY,
  );

  return points.map(([x, y]) => [x + constrainedX, y + constrainedY]);
}

export function moveRoutePoint(
  points,
  pointIndex,
  pointer,
  desk,
  gridSize,
) {
  return points.map((point, index) =>
    index === pointIndex
      ? [
          Math.min(
            Math.max(snapToGrid(pointer.x, gridSize), 0),
            desk.width,
          ),
          Math.min(
            Math.max(snapToGrid(pointer.y, gridSize), 0),
            desk.depth,
          ),
        ]
      : point,
  );
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
