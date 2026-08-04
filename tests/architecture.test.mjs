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

  assert.match(page, /const partLibrary = usePartLibrary\(\)/);
  assert.match(page, /partLibrary=\{partLibrary\}/);
  assert.match(provider, /partLibrary: PartLibrary/);
  assert.match(controller, /usePlannerController\(partLibrary: PartLibrary\)/);
  assert.doesNotMatch(controller, /built-in-parts|BUILT_IN_PARTS|PART_CATALOG/);
});

test("composes each part from metadata, behaviour, and presentation", async () => {
  const contracts = await source("features/planner/parts/contracts.ts");
  const builtIns = await source("features/planner/parts/built-in-parts.tsx");
  const buildTime = await source(
    "features/planner/parts/build-time-manifests.ts",
  );
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
  assert.match(builtIns, /RELEASE_PART_MANIFESTS\.map/);
  assert.match(builtIns, /BUILD_TIME_MANIFESTS\.map/);
  assert.doesNotMatch(builtIns, /catalog:\s*\{/);
  assert.doesNotMatch(builtIns, /definePart\(\{/);
  assert.match(buildTime, /\.part\.json/g);
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

test("supports exact printable footprints outside whole grid cells", async () => {
  const types = await source("features/planner/model/types.ts");
  const registry = await source("features/planner/parts/part-registry.ts");
  const straightChannel = JSON.parse(
    await source(
      "features/planner/parts/manifests/straight-channel.part.json",
    ),
  );

  assert.match(types, /footprintMm\?: \{ width: number; height: number \}/);
  assert.match(registry, /catalog\.footprintMm\?\.width/);
  assert.match(registry, /catalog\.footprintMm\?\.height/);
  assert.deepEqual(straightChannel.physical.sizeMm, {
    x: 140.01,
    y: 27.2,
    z: 22.4,
  });
});

test("keeps every release catalogue entry in a JSON manifest", async () => {
  const manifestRoot = path.join(
    root,
    "features/planner/parts/manifests",
  );
  const manifestFiles = (await readdir(manifestRoot))
    .filter((name) => name.endsWith(".part.json"))
    .sort();
  const manifests = await Promise.all(
    manifestFiles.map(async (name) =>
      JSON.parse(await readFile(path.join(manifestRoot, name), "utf8")),
    ),
  );
  const ids = manifests.map((manifest) => manifest.id ?? manifest.catalog?.id);

  assert.equal(manifestFiles.length, 9);
  assert.equal(new Set(ids).size, manifestFiles.length);
  assert.ok(manifests.every((manifest) => manifest.physical?.units === "mm"));
  assert.ok(
    manifests.every(
      (manifest) =>
        manifest.apiVersion === "underware.parts/v1alpha1" ||
        (manifest.apiVersion === "underware.release-part/v1alpha1" &&
          manifest.physical.sizing === "grid-derived" &&
          manifest.physical.printReadiness === "generator-required"),
    ),
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
    if (
      filePath.endsWith(path.join("parts", "built-in-parts.tsx")) ||
      filePath.endsWith(path.join("parts", "build-time-manifests.ts"))
    ) {
      continue;
    }
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
