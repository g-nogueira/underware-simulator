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
  "grid",
  "channel",
  "cable-loop",
  "power-brick",
  "holder",
  "obstacle",
]);

const CATALOG_LABELS = Object.freeze({
  "opengrid-baseplate": "openGrid baseplate",
  "straight-channel": "Straight channel",
  "l-channel": "L corner channel",
  "t-channel": "T junction channel",
  "x-channel": "X junction channel",
  "s-channel": "S offset channel",
  "cable-loop": "Cable loop",
  "device-holder": "Device holder",
  "power-brick-mount": "Power brick mount",
});

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

export function getChannelGeometry(item) {
  if (
    !item ||
    !Number.isFinite(item.x) ||
    !Number.isFinite(item.y) ||
    !Number.isFinite(item.width) ||
    !Number.isFinite(item.height) ||
    item.width <= 0 ||
    item.height <= 0
  ) {
    throw new TypeError("Channel geometry requires positive item bounds");
  }

  const rotation = [0, 90, 180, 270].includes(item.rotation)
    ? item.rotation
    : 0;
  const isQuarterTurn = rotation % 180 !== 0;
  const logicalWidth = isQuarterTurn ? item.height : item.width;
  const logicalHeight = isQuarterTurn ? item.width : item.height;
  const centerX = item.x + item.width / 2;
  const centerY = item.y + item.height / 2;
  const left = centerX - logicalWidth / 2;
  const top = centerY - logicalHeight / 2;
  const branchWidth = Math.min(
    64,
    Math.max(20, Math.min(logicalWidth, logicalHeight) * 0.36),
  );
  const inset = branchWidth / 2 + 2;
  const x1 = left + inset;
  const x2 = left + logicalWidth - inset;
  const y1 = top + inset;
  const y2 = top + logicalHeight - inset;
  const middleX = left + logicalWidth / 2;
  const middleY = top + logicalHeight / 2;

  const paths = {
    "l-channel": [`M ${x1} ${y1} V ${y2} H ${x2}`],
    "t-channel": [
      `M ${x1} ${y1} H ${x2}`,
      `M ${middleX} ${y1} V ${y2}`,
    ],
    "x-channel": [
      `M ${x1} ${middleY} H ${x2}`,
      `M ${middleX} ${y1} V ${y2}`,
    ],
    "s-channel": [
      `M ${x1} ${y2} C ${middleX} ${y2}, ${middleX} ${y1}, ${x2} ${y1}`,
    ],
  }[item.catalogId] ?? [`M ${x1} ${middleY} H ${x2}`];

  return {
    paths,
    branchWidth,
    transform:
      rotation === 0
        ? undefined
        : `rotate(${rotation} ${centerX} ${centerY})`,
  };
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

export function removeRouteBend(points, pointIndex) {
  if (
    !Array.isArray(points) ||
    points.length <= 2 ||
    !Number.isInteger(pointIndex) ||
    pointIndex <= 0 ||
    pointIndex >= points.length - 1
  ) {
    return points;
  }

  return points.filter((_, index) => index !== pointIndex);
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

export function buildLayerStack(items, routes) {
  if (!Array.isArray(items) || !Array.isArray(routes)) return [];

  const routeEntries = routes.map((route, index) => ({
    id: route.id,
    type: "route",
    layer: Number.isFinite(route.layer) ? route.layer : index,
    stableOrder: index,
  }));
  const itemEntries = items.map((item, index) => ({
    id: item.id,
    type: "item",
    layer: Number.isFinite(item.layer)
      ? item.layer
      : routes.length + index,
    stableOrder: routes.length + index,
  }));

  return [...routeEntries, ...itemEntries]
    .sort(
      (first, second) =>
        first.layer - second.layer ||
        first.stableOrder - second.stableOrder,
    )
    .map((entry, index) => ({
      id: entry.id,
      type: entry.type,
      layer: index,
    }));
}

export function reorderLayerStack(items, routes, selection, movement) {
  const stack = buildLayerStack(items, routes);
  const currentIndex = stack.findIndex(
    (entry) =>
      entry.id === selection?.id && entry.type === selection?.type,
  );
  if (currentIndex < 0 || stack.length < 2) return stack;

  const targetIndex = {
    back: 0,
    backward: Math.max(0, currentIndex - 1),
    forward: Math.min(stack.length - 1, currentIndex + 1),
    front: stack.length - 1,
  }[movement];
  if (!Number.isInteger(targetIndex) || targetIndex === currentIndex) {
    return stack;
  }

  const reordered = [...stack];
  const [entry] = reordered.splice(currentIndex, 1);
  reordered.splice(targetIndex, 0, entry);
  return reordered.map((layerEntry, index) => ({
    ...layerEntry,
    layer: index,
  }));
}

export function calculateGridTilePlan(
  width,
  height,
  tileSize = 28,
  maxTileCellsX = 8,
  maxTileCellsY = 8,
) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    !Number.isFinite(tileSize) ||
    tileSize <= 0
  ) {
    throw new TypeError("Grid coverage dimensions must be positive numbers");
  }

  const cellsX = Math.max(1, Math.ceil(width / tileSize));
  const cellsY = Math.max(1, Math.ceil(height / tileSize));
  const maxX = Math.max(1, Math.floor(maxTileCellsX || 1));
  const maxY = Math.max(1, Math.floor(maxTileCellsY || 1));
  const columnCells = [];
  const rowCells = [];

  for (let remaining = cellsX; remaining > 0; remaining -= maxX) {
    columnCells.push(Math.min(maxX, remaining));
  }
  for (let remaining = cellsY; remaining > 0; remaining -= maxY) {
    rowCells.push(Math.min(maxY, remaining));
  }

  const groups = new Map();
  for (const row of rowCells) {
    for (const column of columnCells) {
      const key = `${column} × ${row} cells (${column * tileSize} × ${
        row * tileSize
      } mm)`;
      groups.set(key, (groups.get(key) ?? 0) + 1);
    }
  }

  return {
    cellsX,
    cellsY,
    columns: columnCells.length,
    rows: rowCells.length,
    tileCount: columnCells.length * rowCells.length,
    groups: [...groups.entries()].map(([label, count]) => ({ label, count })),
  };
}

export function calculatePrintPlan(items, systemId) {
  const system = SYSTEM_SPECS[systemId];
  if (!system) throw new TypeError(`Unsupported system: ${systemId}`);

  const printableItems = items.filter((item) => item.kind !== "obstacle");
  const groups = new Map();
  let partsCount = 0;
  let gridTilesCount = 0;

  for (const item of printableItems) {
    if (item.kind === "grid") {
      const gridPlan = calculateGridTilePlan(
        item.width,
        item.height,
        SYSTEM_SPECS.openGrid.grid,
        item.maxTileCellsX ?? 8,
        item.maxTileCellsY ?? 8,
      );
      partsCount += gridPlan.tileCount;
      gridTilesCount += gridPlan.tileCount;
      for (const group of gridPlan.groups) {
        const label = `openGrid baseplate · ${group.label}`;
        groups.set(label, (groups.get(label) ?? 0) + group.count);
      }
      continue;
    }

    partsCount += 1;
    const catalogLabel = CATALOG_LABELS[item.catalogId] ?? item.name;
    const label =
      item.kind === "channel"
        ? `${catalogLabel} · ${Math.max(item.width, item.height)} mm`
        : catalogLabel;
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
    partsCount,
    printMinutes,
    filamentGrams,
    groups: [...groups.entries()].map(([label, count]) => ({ label, count })),
    overCapacityIds: overCapacity.map((item) => item.id),
    gridTilesCount,
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
