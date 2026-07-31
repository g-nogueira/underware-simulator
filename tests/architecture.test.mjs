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
  assert.equal(
    page.trim(),
    'export { default } from "@/features/planner/planner-page";',
  );
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
  const controller = await source(
    "features/planner/application/use-planner-controller.ts",
  );
  const exportIndex = controller.indexOf("export type PlannerFacade");
  const facadeStart = controller.lastIndexOf("return {", exportIndex);
  const facade =
    facadeStart >= 0 && exportIndex >= 0
      ? controller.slice(facadeStart, exportIndex)
      : "";

  assert.ok(facade, "planner facade return block should remain explicit");
  assert.doesNotMatch(facade, /\bset[A-Z]\w*\b/);
  assert.doesNotMatch(
    facade,
    /interactionRef|pastRef|futureRef|checkpointHistory|emitLog|makeId/,
  );
  assert.doesNotMatch(controller, /className=|<svg/);
});

test("injects part composition through an application-owned interface", async () => {
  const page = await source("features/planner/planner-page.tsx");
  const provider = await source(
    "features/planner/application/planner-provider.tsx",
  );
  const controller = await source(
    "features/planner/application/use-planner-controller.ts",
  );

  assert.match(page, /partRegistry=\{DEFAULT_PART_REGISTRY\}/);
  assert.match(provider, /partRegistry: PartRegistry/);
  assert.match(controller, /usePlannerController\(partRegistry: PartRegistry\)/);
  assert.doesNotMatch(controller, /built-in-parts|BUILT_IN_PARTS|PART_CATALOG/);
});

test("composes each part from metadata, behaviour, and presentation", async () => {
  const contracts = await source("features/planner/parts/contracts.ts");
  const builtIns = await source("features/planner/parts/built-in-parts.tsx");
  const registry = await source("features/planner/parts/part-registry.ts");

  for (const contract of [
    "catalog: CatalogItem",
    "Renderer: ComponentType",
    "InspectorSections?",
    "placement?",
    "print?",
  ]) {
    assert.match(contracts, new RegExp(contract.replace("?", "\\?")));
  }
  assert.match(builtIns, /createPartRegistry\(BUILT_IN_PARTS\)/);
  assert.match(registry, /Duplicate part definition/);
  assert.match(registry, /minimumSizeFor/);
});

test("keeps catalogue identifiers and categories open for extension", async () => {
  const types = await source("features/planner/model/types.ts");
  assert.match(types, /export type CatalogItemId = string;/);
  assert.match(types, /category: string;/);
  assert.doesNotMatch(
    types,
    /CatalogItemId\s*=\s*\n?\s*\|\s*"opengrid-baseplate"/,
  );
});

test("keeps concrete part IDs out of planner core", async () => {
  const featureRoot = path.join(root, "features/planner");
  const entries = await readdir(featureRoot, {
    recursive: true,
    withFileTypes: true,
  });
  const concreteIds =
    /opengrid-baseplate|straight-channel|l-channel|t-channel|x-channel|s-channel|device-holder|power-brick-mount/;

  for (const entry of entries) {
    if (!entry.isFile() || !/\.(?:ts|tsx)$/.test(entry.name)) continue;
    const filePath = path.join(entry.parentPath, entry.name);
    if (filePath.endsWith(path.join("parts", "built-in-parts.tsx"))) continue;
    assert.doesNotMatch(await readFile(filePath, "utf8"), concreteIds, filePath);
  }
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
    assert.ok(lines <= 850, filePath + " has " + lines + " lines");
  }
});
