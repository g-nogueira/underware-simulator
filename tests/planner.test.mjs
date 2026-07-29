import assert from "node:assert/strict";
import test from "node:test";

import {
  calculatePrintPlan,
  clampToDesk,
  getCapacityState,
  snapToGrid,
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
