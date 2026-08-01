import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLayerStack,
  calculateCableRouteGeometries,
  calculateGridTilePlan,
  calculateRouteLength,
  calculatePrintPlan,
  clampToDesk,
  getCapacityState,
  getChannelGeometry,
  getPowerBrickOutletLayout,
  insertRouteBend,
  moveRoutePoint,
  removeRouteBend,
  reorderLayerStack,
  resizeItemFromCorner,
  snapToGrid,
  translateRoute,
  validatePlanFile,
} from "../lib/planner.mjs";

test("snaps placement to the active physical grid", () => {
  assert.equal(snapToGrid(83, 28), 84);
  assert.equal(snapToGrid(88, 25), 100);
});

test("keeps a snapped part inside the desk", () => {
  assert.deepEqual(
    clampToDesk(
      { x: 1590, y: -20, width: 168, height: 56 },
      { width: 1600, depth: 800 },
      28,
    ),
    { x: 1432, y: 0 },
  );
});

test("distinguishes safe, near, and over-capacity channels", () => {
  assert.equal(getCapacityState(4, 6).level, "ok");
  assert.equal(getCapacityState(5, 6).level, "near");
  assert.equal(getCapacityState(7, 6).level, "over");
});

test("keeps every configured power outlet inside a resized brick", () => {
  const outlets = getPowerBrickOutletLayout(112, 168, 9);

  assert.equal(outlets.length, 9);
  for (const outlet of outlets) {
    assert.ok(outlet.x - outlet.radius >= 0);
    assert.ok(outlet.x + outlet.radius <= 112);
    assert.ok(outlet.y - outlet.radius >= 0);
    assert.ok(outlet.y + outlet.radius <= 168);
  }
});

test("reflows outlet symbols and respects the configured count", () => {
  const wide = getPowerBrickOutletLayout(420, 80, 6);
  const compact = getPowerBrickOutletLayout(140, 140, 4);

  assert.equal(wide.length, 6);
  assert.equal(new Set(wide.map((outlet) => outlet.y)).size, 1);
  assert.equal(compact.length, 4);
  assert.equal(new Set(compact.map((outlet) => outlet.y)).size, 2);
});

test("renders L and T junctions with their actual channel footprints", () => {
  const bounds = {
    x: 100,
    y: 100,
    width: 112,
    height: 112,
    rotation: 0,
  };
  const lJunction = getChannelGeometry({
    ...bounds,
    catalogId: "l-channel",
  });
  const tJunction = getChannelGeometry({
    ...bounds,
    catalogId: "t-channel",
  });

  assert.equal(lJunction.paths.length, 1);
  assert.match(lJunction.paths[0], / V .* H /);
  assert.equal(tJunction.paths.length, 2);
  assert.match(tJunction.paths[0], / H /);
  assert.match(tJunction.paths[1], / V /);
  assert.ok(lJunction.branchWidth < bounds.width);
  assert.ok(tJunction.branchWidth < bounds.width);
});

test("rotates junction footprints inside their existing item bounds", () => {
  const geometry = getChannelGeometry({
    x: 40,
    y: 60,
    width: 112,
    height: 112,
    rotation: 90,
    catalogId: "t-channel",
  });

  assert.equal(geometry.transform, "rotate(90 96 116)");
});

test("accepts channel topology from a composed part definition", () => {
  const geometry = getChannelGeometry(
    {
      x: 0,
      y: 0,
      width: 112,
      height: 112,
      rotation: 0,
      catalogId: "third-party-corner",
    },
    "l",
  );

  assert.equal(geometry.paths.length, 1);
  assert.match(geometry.paths[0], / V .* H /);
});

test("calculates route length and inserts a bend in its longest segment", () => {
  const points = [
    [0, 0],
    [100, 0],
    [100, 50],
  ];
  const withBend = insertRouteBend(points);

  assert.equal(calculateRouteLength(points), 150);
  assert.deepEqual(withBend, [
    [0, 0],
    [50, 0],
    [100, 0],
    [100, 50],
  ]);
});

test("fans cable routes that share a channel into diameter-aware lanes", () => {
  const geometries = calculateCableRouteGeometries([
    {
      id: "power",
      layer: 0,
      diameter: 6,
      points: [
        [0, 0],
        [100, 0],
      ],
    },
    {
      id: "display",
      layer: 1,
      diameter: 6,
      points: [
        [0, 0],
        [100, 0],
      ],
    },
  ]);

  assert.equal(geometries[0].maxBundleSize, 2);
  assert.equal(geometries[1].maxBundleSize, 2);
  assert.deepEqual(geometries[0].segmentOffsets, [-4.5]);
  assert.deepEqual(geometries[1].segmentOffsets, [4.5]);
  assert.notEqual(geometries[0].path, geometries[1].path);
  assert.match(geometries[0].path, /^M 0 0 /);
  assert.match(geometries[0].path, /L 100 0$/);
});

test("detects partially overlapping channels in either route direction", () => {
  const geometries = calculateCableRouteGeometries([
    {
      id: "left-to-right",
      diameter: 5,
      points: [
        [0, 40],
        [100, 40],
      ],
    },
    {
      id: "right-to-left",
      diameter: 5,
      points: [
        [150, 40],
        [50, 40],
      ],
    },
  ]);

  assert.equal(geometries[0].sharedSegmentCount, 1);
  assert.equal(geometries[1].sharedSegmentCount, 1);
  assert.equal(Math.abs(geometries[0].segmentOffsets[0]), 4);
  assert.equal(Math.abs(geometries[1].segmentOffsets[0]), 4);
});

test("rounds cable bends without changing the measured centreline", () => {
  const points = [
    [0, 0],
    [100, 0],
    [100, 80],
  ];
  const [geometry] = calculateCableRouteGeometries([
    { id: "usb", diameter: 4, points },
  ]);

  assert.match(geometry.path, / Q /);
  assert.equal(calculateRouteLength(points), 180);
  assert.deepEqual(geometry.segmentOffsets, [0, 0]);
});

test("removes only intermediate route bends", () => {
  const points = [
    [0, 0],
    [50, 0],
    [100, 0],
    [100, 50],
  ];

  assert.deepEqual(removeRouteBend(points, 1), [
    [0, 0],
    [100, 0],
    [100, 50],
  ]);
  assert.equal(removeRouteBend(points, 0), points);
  assert.equal(removeRouteBend(points, points.length - 1), points);
  assert.equal(
    removeRouteBend(
      [
        [0, 0],
        [100, 0],
      ],
      1,
    ).length,
    2,
  );
});

test("resizes an item from every corner while preserving the opposite corner", () => {
  const item = { x: 100, y: 100, width: 200, height: 100 };
  const desk = { width: 600, depth: 400 };

  assert.deepEqual(
    resizeItemFromCorner(item, "nw", { x: 50, y: 75 }, desk, 25),
    { x: 50, y: 75, width: 250, height: 125 },
  );
  assert.deepEqual(
    resizeItemFromCorner(item, "ne", { x: 375, y: 50 }, desk, 25),
    { x: 100, y: 50, width: 275, height: 150 },
  );
  assert.deepEqual(
    resizeItemFromCorner(item, "sw", { x: 75, y: 250 }, desk, 25),
    { x: 75, y: 100, width: 225, height: 150 },
  );
  assert.deepEqual(
    resizeItemFromCorner(item, "se", { x: 425, y: 275 }, desk, 25),
    { x: 100, y: 100, width: 325, height: 175 },
  );
});

test("moves and edits cable routes on-grid without leaving the desk", () => {
  const route = [
    [50, 50],
    [150, 50],
    [150, 125],
  ];
  const desk = { width: 300, depth: 200 };

  assert.deepEqual(translateRoute(route, 42, -80, desk, 25), [
    [100, 0],
    [200, 0],
    [200, 75],
  ]);
  assert.deepEqual(
    moveRoutePoint(route, 1, { x: 231, y: 214 }, desk, 25),
    [
      [50, 50],
      [225, 200],
      [150, 125],
    ],
  );
});

test("builds a grouped print list and excludes obstacles", () => {
  const result = calculatePrintPlan(
    [
      {
        id: "one",
        kind: "channel",
        name: "Straight channel",
        width: 168,
        height: 56,
        cables: 7,
      },
      {
        id: "two",
        kind: "channel",
        name: "Straight channel",
        width: 168,
        height: 56,
        cables: 2,
      },
      {
        id: "frame",
        kind: "obstacle",
        name: "Frame",
        width: 600,
        height: 80,
      },
    ],
    "openGrid",
  );

  assert.equal(result.partsCount, 2);
  assert.deepEqual(result.groups, [
    { label: "Straight channel · 168 mm", count: 2 },
  ]);
  assert.deepEqual(result.overCapacityIds, ["one"]);
  assert.equal(result.gridTilesCount, 0);
});

test("splits openGrid coverage into exact printable baseplate sizes", () => {
  const result = calculateGridTilePlan(560, 280, 28, 8, 8);

  assert.deepEqual(
    {
      cellsX: result.cellsX,
      cellsY: result.cellsY,
      columns: result.columns,
      rows: result.rows,
      tileCount: result.tileCount,
    },
    { cellsX: 20, cellsY: 10, columns: 3, rows: 2, tileCount: 6 },
  );
  assert.deepEqual(result.groups, [
    { label: "8 × 8 cells (224 × 224 mm)", count: 2 },
    { label: "4 × 8 cells (112 × 224 mm)", count: 1 },
    { label: "8 × 2 cells (224 × 56 mm)", count: 2 },
    { label: "4 × 2 cells (112 × 56 mm)", count: 1 },
  ]);
});

test("normalizes imported openGrid tile limits", () => {
  const numericStrings = calculateGridTilePlan(224, 224, 28, "4", "8");
  assert.deepEqual(
    {
      columns: numericStrings.columns,
      rows: numericStrings.rows,
      tileCount: numericStrings.tileCount,
    },
    { columns: 2, rows: 1, tileCount: 2 },
  );

  const malformed = calculateGridTilePlan(56, 56, 28, "invalid", Infinity);
  assert.equal(malformed.tileCount, 4);
  assert.throws(
    () => calculateGridTilePlan(Number.MAX_VALUE, 224, 28, 8, 8),
    /supported planning range/,
  );
  assert.throws(
    () => calculateGridTilePlan(224, 224, 28, Number.MAX_VALUE, 8),
    /supported planning range/,
  );
});

test("counts generated openGrid baseplates as individual print parts", () => {
  const result = calculatePrintPlan(
    [
      {
        id: "grid",
        kind: "grid",
        name: "Main mounting grid",
        catalogId: "opengrid-baseplate",
        width: 560,
        height: 280,
        maxTileCellsX: 8,
        maxTileCellsY: 8,
      },
      {
        id: "loop",
        kind: "cable-loop",
        name: "Monitor cable loop",
        catalogId: "cable-loop",
        width: 56,
        height: 56,
      },
    ],
    "openGrid",
  );

  assert.equal(result.gridTilesCount, 6);
  assert.equal(result.partsCount, 7);
  assert.deepEqual(result.groups.at(-1), {
    label: "Cable loop",
    count: 1,
    catalogId: "cable-loop",
  });
  assert.equal(result.groups[0].catalogId, "opengrid-baseplate");
});

test("estimates openGrid material from complete generated cells", () => {
  const result = calculatePrintPlan(
    [
      {
        id: "partial-grid",
        kind: "grid",
        name: "Tiny coverage",
        width: 1,
        height: 1,
      },
    ],
    "openGrid",
  );

  assert.equal(result.gridTilesCount, 1);
  assert.ok(result.printMinutes > 0);
  assert.ok(result.filamentGrams > 0);
});

test("uses injected part print behaviour without changing the engine", () => {
  const result = calculatePrintPlan(
    [
      {
        id: "custom",
        kind: "part",
        name: "User-facing name",
        catalogId: "third-party-channel",
        width: 140,
        height: 56,
        cables: 7,
      },
    ],
    "openGrid",
    [
      {
        id: "third-party-channel",
        name: "Third-party channel",
        strategy: "linear",
        capacity: "cable",
      },
    ],
  );

  assert.deepEqual(result.groups, [
    {
      label: "Third-party channel · 140 mm",
      count: 1,
      catalogId: "third-party-channel",
    },
  ]);
  assert.deepEqual(result.overCapacityIds, ["custom"]);
});

test("honours an injected channel definition that opts out of capacity", () => {
  const result = calculatePrintPlan(
    [
      {
        id: "custom",
        kind: "channel",
        name: "User-facing name",
        catalogId: "third-party-channel",
        width: 140,
        height: 56,
        cables: 99,
      },
    ],
    "openGrid",
    [
      {
        id: "third-party-channel",
        name: "Third-party channel",
        strategy: "linear",
        capacity: "none",
      },
    ],
  );

  assert.deepEqual(result.groups, [
    {
      label: "Third-party channel · 140 mm",
      count: 1,
      catalogId: "third-party-channel",
    },
  ]);
  assert.deepEqual(result.overCapacityIds, []);
});

test("reorders items and routes in one shared layer stack", () => {
  const items = [
    { id: "grid", layer: 0 },
    { id: "brick", layer: 2 },
  ];
  const routes = [{ id: "power", layer: 1 }];

  assert.deepEqual(
    buildLayerStack(items, routes).map(({ id, type }) => `${type}:${id}`),
    ["item:grid", "route:power", "item:brick"],
  );

  assert.deepEqual(
    reorderLayerStack(
      items,
      routes,
      { id: "brick", type: "item" },
      "backward",
    ).map(({ id, type }) => `${type}:${id}`),
    ["item:grid", "item:brick", "route:power"],
  );
});

test("rejects malformed imported plans", () => {
  assert.equal(validatePlanFile({ version: 1 }).ok, false);
  assert.equal(
    validatePlanFile({
      version: 1,
      system: "openGrid",
      desk: { width: 1600, depth: 800 },
      items: [],
      routes: [],
    }).ok,
    true,
  );
  assert.equal(
    validatePlanFile({
      version: 1,
      system: "openGrid",
      desk: { width: 1600, depth: 800 },
      items: [
        {
          id: "invalid-grid",
          kind: "grid",
          x: 0,
          y: 0,
          width: 0,
          height: 224,
        },
      ],
      routes: [],
    }).ok,
    false,
  );
  assert.equal(
    validatePlanFile({
      version: 1,
      system: "openGrid",
      desk: { width: 1600, depth: 800 },
      items: [
        {
          id: "unsafe-grid",
          kind: "grid",
          x: 0,
          y: 0,
          width: Number.MAX_VALUE,
          height: 224,
        },
      ],
      routes: [],
    }).ok,
    false,
  );
});
