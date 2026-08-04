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
  "part",
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

const MAX_GRID_CELLS_PER_AXIS = 10_000;

export function snapToGrid(value, gridSize) {
  if (!Number.isFinite(value) || !Number.isFinite(gridSize) || gridSize <= 0) {
    throw new TypeError("Grid snapping requires finite values and a positive grid");
  }
  return Math.round(value / gridSize) * gridSize;
}

export function rotateFootprintPoint(point, width, height, rotation) {
  if (
    !point ||
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    ![0, 90, 180, 270].includes(rotation)
  ) {
    throw new TypeError("Footprint rotation requires finite dimensions and a cardinal rotation");
  }
  const clean = (value) => Math.round(value * 1_000_000_000) / 1_000_000_000;
  if (rotation === 90) return { x: clean(height - point.y), y: point.x };
  if (rotation === 180) {
    return { x: clean(width - point.x), y: clean(height - point.y) };
  }
  if (rotation === 270) return { x: point.y, y: clean(width - point.x) };
  return { x: point.x, y: point.y };
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

export function getChannelGeometry(item, topology) {
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

  const resolvedTopology =
    topology ??
    {
      "l-channel": "l",
      "t-channel": "t",
      "x-channel": "x",
      "s-channel": "s",
    }[item.catalogId] ??
    "straight";
  const paths = {
    l: [`M ${x1} ${y1} V ${y2} H ${x2}`],
    t: [
      `M ${x1} ${y1} H ${x2}`,
      `M ${middleX} ${y1} V ${y2}`,
    ],
    x: [
      `M ${x1} ${middleY} H ${x2}`,
      `M ${middleX} ${y1} V ${y2}`,
    ],
    s: [
      `M ${x1} ${y2} C ${middleX} ${y2}, ${middleX} ${y1}, ${x2} ${y1}`,
    ],
  }[resolvedTopology] ?? [`M ${x1} ${middleY} H ${x2}`];

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

const ROUTE_GEOMETRY_EPSILON = 0.001;

function createRouteSegment(route, routeIndex, segmentIndex) {
  const start = route.points[segmentIndex];
  const end = route.points[segmentIndex + 1];
  if (
    !Array.isArray(start) ||
    !Array.isArray(end) ||
    !start.every(Number.isFinite) ||
    !end.every(Number.isFinite)
  ) {
    return null;
  }

  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy);
  if (length <= ROUTE_GEOMETRY_EPSILON) return null;

  const direction = [dx / length, dy / length];
  const canonicalDirection = [...direction];
  if (
    canonicalDirection[0] < -ROUTE_GEOMETRY_EPSILON ||
    (Math.abs(canonicalDirection[0]) <= ROUTE_GEOMETRY_EPSILON &&
      canonicalDirection[1] < 0)
  ) {
    canonicalDirection[0] *= -1;
    canonicalDirection[1] *= -1;
  }

  return {
    route,
    routeIndex,
    segmentIndex,
    start,
    end,
    length,
    direction,
    canonicalDirection,
    normal: [-canonicalDirection[1], canonicalDirection[0]],
  };
}

function segmentsShareChannel(first, second, tolerance) {
  const [ux, uy] = first.canonicalDirection;
  const [vx, vy] = second.canonicalDirection;
  if (Math.abs(ux * vy - uy * vx) > ROUTE_GEOMETRY_EPSILON) {
    return false;
  }

  const lineDistance = Math.abs(
    (second.start[0] - first.start[0]) * uy -
      (second.start[1] - first.start[1]) * ux,
  );
  if (lineDistance > tolerance) return false;

  const project = ([x, y]) => x * ux + y * uy;
  const firstRange = [project(first.start), project(first.end)].sort(
    (a, b) => a - b,
  );
  const secondRange = [project(second.start), project(second.end)].sort(
    (a, b) => a - b,
  );
  return (
    Math.min(firstRange[1], secondRange[1]) -
      Math.max(firstRange[0], secondRange[0]) >
    tolerance
  );
}

function intersectShiftedSegments(vertex, previous, next) {
  const previousPoint = [
    vertex[0] + previous.offsetVector[0],
    vertex[1] + previous.offsetVector[1],
  ];
  const nextPoint = [
    vertex[0] + next.offsetVector[0],
    vertex[1] + next.offsetVector[1],
  ];
  const [px, py] = previous.direction;
  const [nx, ny] = next.direction;
  const determinant = px * ny - py * nx;

  if (Math.abs(determinant) <= ROUTE_GEOMETRY_EPSILON) {
    return [
      (previousPoint[0] + nextPoint[0]) / 2,
      (previousPoint[1] + nextPoint[1]) / 2,
    ];
  }

  const deltaX = nextPoint[0] - previousPoint[0];
  const deltaY = nextPoint[1] - previousPoint[1];
  const distance = (deltaX * ny - deltaY * nx) / determinant;
  const intersection = [
    previousPoint[0] + px * distance,
    previousPoint[1] + py * distance,
  ];
  const largestOffset = Math.max(
    Math.abs(previous.laneOffset),
    Math.abs(next.laneOffset),
    1,
  );
  return Math.hypot(
    intersection[0] - vertex[0],
    intersection[1] - vertex[1],
  ) <= largestOffset * 5
    ? intersection
    : [
        (previousPoint[0] + nextPoint[0]) / 2,
        (previousPoint[1] + nextPoint[1]) / 2,
      ];
}

function formatRouteNumber(value) {
  return String(Math.round(value * 1000) / 1000);
}

function buildRoundedRoutePath(points, cornerRadius) {
  const deduplicated = points.filter(
    (point, index) =>
      index === 0 ||
      Math.hypot(
        point[0] - points[index - 1][0],
        point[1] - points[index - 1][1],
      ) > ROUTE_GEOMETRY_EPSILON,
  );
  if (deduplicated.length === 0) return "";
  if (deduplicated.length === 1) {
    return `M ${formatRouteNumber(deduplicated[0][0])} ${formatRouteNumber(
      deduplicated[0][1],
    )}`;
  }

  const commands = [
    `M ${formatRouteNumber(deduplicated[0][0])} ${formatRouteNumber(
      deduplicated[0][1],
    )}`,
  ];
  for (let index = 1; index < deduplicated.length - 1; index += 1) {
    const previous = deduplicated[index - 1];
    const current = deduplicated[index];
    const next = deduplicated[index + 1];
    const incoming = [current[0] - previous[0], current[1] - previous[1]];
    const outgoing = [next[0] - current[0], next[1] - current[1]];
    const incomingLength = Math.hypot(...incoming);
    const outgoingLength = Math.hypot(...outgoing);
    if (
      incomingLength <= ROUTE_GEOMETRY_EPSILON ||
      outgoingLength <= ROUTE_GEOMETRY_EPSILON
    ) {
      continue;
    }

    const incomingUnit = incoming.map((value) => value / incomingLength);
    const outgoingUnit = outgoing.map((value) => value / outgoingLength);
    const cross =
      incomingUnit[0] * outgoingUnit[1] -
      incomingUnit[1] * outgoingUnit[0];
    if (Math.abs(cross) <= ROUTE_GEOMETRY_EPSILON) {
      commands.push(
        `L ${formatRouteNumber(current[0])} ${formatRouteNumber(current[1])}`,
      );
      continue;
    }

    const radius = Math.min(
      cornerRadius,
      incomingLength / 2,
      outgoingLength / 2,
    );
    const before = [
      current[0] - incomingUnit[0] * radius,
      current[1] - incomingUnit[1] * radius,
    ];
    const after = [
      current[0] + outgoingUnit[0] * radius,
      current[1] + outgoingUnit[1] * radius,
    ];
    commands.push(
      `L ${formatRouteNumber(before[0])} ${formatRouteNumber(before[1])}`,
      `Q ${formatRouteNumber(current[0])} ${formatRouteNumber(
        current[1],
      )} ${formatRouteNumber(after[0])} ${formatRouteNumber(after[1])}`,
    );
  }

  const last = deduplicated.at(-1);
  commands.push(
    `L ${formatRouteNumber(last[0])} ${formatRouteNumber(last[1])}`,
  );
  return commands.join(" ");
}

export function calculateCableRouteGeometries(routes, options = {}) {
  if (!Array.isArray(routes)) return [];

  const channelTolerance = Number.isFinite(options.channelTolerance)
    ? Math.max(0, options.channelTolerance)
    : 0.5;
  const laneGap = Number.isFinite(options.laneGap)
    ? Math.max(0, options.laneGap)
    : 3;
  const cornerRadius = Number.isFinite(options.cornerRadius)
    ? Math.max(0, options.cornerRadius)
    : 18;
  const routeRecords = routes
    .map((route, routeIndex) => ({ route, routeIndex }))
    .filter(
      ({ route }) =>
        route &&
        typeof route.id === "string" &&
        Array.isArray(route.points) &&
        route.points.length >= 2,
    );
  const allSegments = routeRecords.flatMap(({ route, routeIndex }) =>
    route.points
      .slice(0, -1)
      .map((_, segmentIndex) =>
        createRouteSegment(route, routeIndex, segmentIndex),
      )
      .filter(Boolean),
  );
  const routeById = new Map(
    routeRecords.map(({ route, routeIndex }) => [route.id, { route, routeIndex }]),
  );

  return routeRecords.map(({ route, routeIndex }) => {
    const routeSegments = allSegments.filter(
      (segment) => segment.route.id === route.id,
    );
    const displaySegments = routeSegments.map((segment) => {
      const participantIds = new Set([route.id]);
      for (const candidate of allSegments) {
        if (
          candidate.route.id !== route.id &&
          segmentsShareChannel(segment, candidate, channelTolerance)
        ) {
          participantIds.add(candidate.route.id);
        }
      }
      const participants = [...participantIds]
        .map((id) => routeById.get(id))
        .filter(Boolean)
        .sort(
          (first, second) =>
            (Number.isFinite(first.route.layer)
              ? first.route.layer
              : first.routeIndex) -
              (Number.isFinite(second.route.layer)
                ? second.route.layer
                : second.routeIndex) ||
            first.route.id.localeCompare(second.route.id),
        );
      const laneIndex = participants.findIndex(
        (participant) => participant.route.id === route.id,
      );
      const largestDiameter = Math.max(
        ...participants.map(({ route: participant }) =>
          Number.isFinite(participant.diameter)
            ? Math.max(1, participant.diameter)
            : 1,
        ),
      );
      const laneSpacing = largestDiameter + laneGap;
      const laneOffset =
        (laneIndex - (participants.length - 1) / 2) * laneSpacing;
      return {
        ...segment,
        bundleSize: participants.length,
        laneOffset,
        offsetVector: [
          segment.normal[0] * laneOffset,
          segment.normal[1] * laneOffset,
        ],
      };
    });
    const segmentByIndex = new Map(
      displaySegments.map((segment) => [segment.segmentIndex, segment]),
    );
    const displayPoints = [route.points[0]];
    const firstSegment = segmentByIndex.get(0);
    if (firstSegment && Math.abs(firstSegment.laneOffset) > ROUTE_GEOMETRY_EPSILON) {
      const fanLength = Math.min(24, firstSegment.length / 3);
      displayPoints.push([
        route.points[0][0] + firstSegment.direction[0] * fanLength +
          firstSegment.offsetVector[0],
        route.points[0][1] + firstSegment.direction[1] * fanLength +
          firstSegment.offsetVector[1],
      ]);
    }

    for (let pointIndex = 1; pointIndex < route.points.length - 1; pointIndex += 1) {
      const previous = segmentByIndex.get(pointIndex - 1);
      const next = segmentByIndex.get(pointIndex);
      displayPoints.push(
        previous && next
          ? intersectShiftedSegments(route.points[pointIndex], previous, next)
          : route.points[pointIndex],
      );
    }

    const lastSegment = segmentByIndex.get(route.points.length - 2);
    if (lastSegment && Math.abs(lastSegment.laneOffset) > ROUTE_GEOMETRY_EPSILON) {
      const fanLength = Math.min(24, lastSegment.length / 3);
      const endpoint = route.points.at(-1);
      displayPoints.push([
        endpoint[0] - lastSegment.direction[0] * fanLength +
          lastSegment.offsetVector[0],
        endpoint[1] - lastSegment.direction[1] * fanLength +
          lastSegment.offsetVector[1],
      ]);
    }
    displayPoints.push(route.points.at(-1));

    return {
      id: route.id,
      path: buildRoundedRoutePath(displayPoints, cornerRadius),
      displayPoints,
      segmentOffsets: route.points
        .slice(0, -1)
        .map((_, index) => segmentByIndex.get(index)?.laneOffset ?? 0),
      sharedSegmentCount: displaySegments.filter(
        (segment) => segment.bundleSize > 1,
      ).length,
      maxBundleSize: Math.max(
        1,
        ...displaySegments.map((segment) => segment.bundleSize),
      ),
      routeIndex,
    };
  });
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
  const parsedMaxX = Number(maxTileCellsX);
  const parsedMaxY = Number(maxTileCellsY);
  const maxX = Number.isFinite(parsedMaxX)
    ? Math.max(1, Math.floor(parsedMaxX))
    : 1;
  const maxY = Number.isFinite(parsedMaxY)
    ? Math.max(1, Math.floor(parsedMaxY))
    : 1;
  if (
    cellsX > MAX_GRID_CELLS_PER_AXIS ||
    cellsY > MAX_GRID_CELLS_PER_AXIS ||
    maxX > MAX_GRID_CELLS_PER_AXIS ||
    maxY > MAX_GRID_CELLS_PER_AXIS
  ) {
    throw new RangeError("Grid coverage exceeds the supported planning range");
  }
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

export function calculatePrintPlan(items, systemId, partDefinitions = []) {
  const system = SYSTEM_SPECS[systemId];
  if (!system) throw new TypeError(`Unsupported system: ${systemId}`);

  const printableItems = items.filter((item) => item.kind !== "obstacle");
  const definitionById = new Map(
    partDefinitions.map((definition) => [definition.id, definition]),
  );
  const definitionByHash = new Map(
    partDefinitions
      .filter((definition) => definition.definitionHash)
      .map((definition) => [definition.definitionHash, definition]),
  );
  const groups = new Map();
  const addGroup = (label, count, catalogId) => {
    const current = groups.get(label);
    const nextCatalogId = current?.catalogId ?? catalogId;
    groups.set(label, {
      count: (current?.count ?? 0) + count,
      ...(nextCatalogId ? { catalogId: nextCatalogId } : {}),
    });
  };
  let partsCount = 0;
  let gridTilesCount = 0;
  let printableArea = 0;

  for (const item of printableItems) {
    const definition =
      (item.partDefinition
        ? definitionByHash.get(item.partDefinition)
        : undefined) ?? definitionById.get(item.catalogId);
    const printStrategy =
      definition?.strategy ??
      (item.kind === "grid"
        ? "grid-tiles"
        : item.kind === "channel"
          ? "linear"
          : "single");
    if (printStrategy === "grid-tiles") {
      const gridPlan = calculateGridTilePlan(
        item.width,
        item.height,
        SYSTEM_SPECS.openGrid.grid,
        item.maxTileCellsX ?? 8,
        item.maxTileCellsY ?? 8,
      );
      partsCount += gridPlan.tileCount;
      gridTilesCount += gridPlan.tileCount;
      printableArea +=
        gridPlan.cellsX *
        gridPlan.cellsY *
        SYSTEM_SPECS.openGrid.grid ** 2;
      for (const group of gridPlan.groups) {
        const label = `openGrid baseplate · ${group.label}`;
        addGroup(label, group.count, "opengrid-baseplate");
      }
      continue;
    }

    if (printStrategy === "components" && definition?.components?.length) {
      for (const component of definition.components) {
        const quantity = Math.max(1, Math.floor(component.quantity));
        const size = component.sizeMm;
        partsCount += quantity;
        printableArea += size.x * size.y * quantity;
        addGroup(
          `${component.name} · ${size.x} × ${size.y} × ${size.z} mm`,
          quantity,
          item.catalogId,
        );
      }
      continue;
    }

    partsCount += 1;
    printableArea += item.width * item.height;
    const catalogLabel =
      definition?.name ?? CATALOG_LABELS[item.catalogId] ?? item.name;
    const label =
      printStrategy === "linear"
        ? `${catalogLabel} · ${Math.max(item.width, item.height)} mm`
        : catalogLabel;
    addGroup(label, 1, item.catalogId);
  }

  const printMinutes = Math.max(
    partsCount > 0 ? 1 : 0,
    Math.round(printableArea / 510),
  );
  const filamentGrams = Math.max(
    partsCount > 0 ? 1 : 0,
    Math.round(printableArea / 2050),
  );
  const overCapacity = items.filter(
    (item) => {
      const definition =
        (item.partDefinition
          ? definitionByHash.get(item.partDefinition)
          : undefined) ?? definitionById.get(item.catalogId);
      const tracksCableCapacity =
        definition?.capacity === "cable" ||
        (!definition && item.kind === "channel");
      return tracksCableCapacity && (item.cables ?? 0) > system.channelCapacity;
    },
  );

  return {
    partsCount,
    printMinutes,
    filamentGrams,
    groups: [...groups.entries()].map(([label, group]) => ({
      label,
      ...group,
    })),
    overCapacityIds: overCapacity.map((item) => item.id),
    gridTilesCount,
  };
}

export function validatePlanFile(value) {
  if (!value || typeof value !== "object") {
    return { ok: false, reason: "Plan must be an object" };
  }
  if (value.version !== 1 && value.version !== 2) {
    return { ok: false, reason: "Unsupported plan version" };
  }
  if (
    value.version === 2 &&
    (!value.partDefinitions ||
      typeof value.partDefinitions !== "object" ||
      Array.isArray(value.partDefinitions) ||
      Object.keys(value.partDefinitions).length > 100)
  ) {
    return { ok: false, reason: "Plan contains invalid part definitions" };
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
        !Number.isFinite(item.height) ||
        item.width <= 0 ||
        item.height <= 0 ||
        ![0, 90, 180, 270].includes(item.rotation) ||
        (item.partDefinition !== undefined &&
          (typeof item.partDefinition !== "string" ||
            !/^sha256:[a-f0-9]{64}$/.test(item.partDefinition) ||
            value.version !== 2 ||
            typeof item.catalogId !== "string" ||
            !Object.hasOwn(value.partDefinitions, item.partDefinition))) ||
        (item.kind === "grid" &&
          (Math.ceil(item.width / SYSTEM_SPECS.openGrid.grid) >
            MAX_GRID_CELLS_PER_AXIS ||
            Math.ceil(item.height / SYSTEM_SPECS.openGrid.grid) >
              MAX_GRID_CELLS_PER_AXIS ||
            (Number.isFinite(Number(item.maxTileCellsX)) &&
              Number(item.maxTileCellsX) > MAX_GRID_CELLS_PER_AXIS) ||
            (Number.isFinite(Number(item.maxTileCellsY)) &&
              Number(item.maxTileCellsY) > MAX_GRID_CELLS_PER_AXIS))),
    )
  ) {
    return { ok: false, reason: "Plan contains an invalid item" };
  }

  return { ok: true, plan: value };
}
