import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateRouteLength,
  calculatePrintPlan,
  clampToDesk,
  getCapacityState,
  getPowerBrickOutletLayout,
  insertRouteBend,
  moveRoutePoint,
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
});
