import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

test("keeps the route entrypoint free of planner responsibilities", async () => {
  const page = await source("app/page.tsx");
  assert.equal(page.trim(), 'export { default } from "@/features/planner/planner-page";');
  assert.doesNotMatch(page, /useState|useEffect|SYSTEM_SPECS|calculate[A-Z]/);
});

test("composes the editor from focused feature surfaces", async () => {
  const view = await source("features/planner/components/planner-view.tsx");
  for (const component of [
    "PlannerHeader",
    "PlannerTools",
    "PlannerWorkspace",
    "SelectionInspector",
    "PlannerOverlays",
  ]) {
    assert.match(view, new RegExp(`<${component}(?:\\s|\\s*\\/)`));
  }
  assert.doesNotMatch(view, /<svg|calculatePrintPlan|localStorage/);
});

test("keeps mutable implementation details behind the planner facade", async () => {
  const provider = await source(
    "features/planner/application/planner-provider.tsx",
  );
  const facade = provider.match(
    /\n  return \{\n    system,[\s\S]*?\n  \};\n\}\n\nexport type PlannerFacade/,
  )?.[0];

  assert.ok(facade, "planner facade return block should remain explicit");
  assert.doesNotMatch(facade, /\bset[A-Z]\w*\b/);
  assert.doesNotMatch(
    facade,
    /interactionRef|pastRef|futureRef|checkpointHistory|emitLog|makeId/,
  );
  assert.doesNotMatch(provider, /className=|<svg/);
});

test("registers one renderer for every supported item kind", async () => {
  const types = await source("features/planner/model/types.ts");
  const renderers = await source(
    "features/planner/components/item-renderers.tsx",
  );
  const kindBlock = types.match(/export type ItemKind =([\s\S]*?);/)?.[1];
  const registryBlock = renderers.match(
    /const ITEM_RENDERERS:[\s\S]*?= \{([\s\S]*?)\n\};/,
  )?.[1];

  assert.ok(kindBlock);
  assert.ok(registryBlock);
  const kinds = [...kindBlock.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  const registered = [...registryBlock.matchAll(/^\s*(?:"([^"]+)"|([\w-]+)):/gm)]
    .map((match) => match[1] ?? match[2]);
  assert.deepEqual(registered.sort(), kinds.sort());
});

test("keeps catalogue identifiers unique", async () => {
  const catalog = await source("features/planner/model/catalog.ts");
  const partBlock = catalog.match(
    /export const PART_CATALOG:[\s\S]*?= \[([\s\S]*?)\n\];/,
  )?.[1];
  assert.ok(partBlock);
  const ids = [...partBlock.matchAll(/\bid: "([^"]+)"/g)].map(
    (match) => match[1],
  );
  assert.ok(ids.length > 0);
  assert.equal(new Set(ids).size, ids.length);
});

test("prevents another planner source monolith", async () => {
  const featureRoot = path.join(root, "features/planner");
  const entries = await readdir(featureRoot, {
    recursive: true,
    withFileTypes: true,
  });
  for (const entry of entries) {
    if (!entry.isFile() || !/\.(?:ts|tsx)$/.test(entry.name)) continue;
    const filePath = path.join(entry.parentPath, entry.name);
    const lines = (await readFile(filePath, "utf8")).split("\n").length;
    assert.ok(lines <= 1000, filePath + " has " + lines + " lines");
  }
});
