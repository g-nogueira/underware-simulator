import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  PART_MANIFEST_API_VERSION,
  hashPartManifest,
  compilePartManifest,
  validatePartManifest,
} from "../lib/part-manifest.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const examplePath = path.join(
  root,
  "spikes/json-parts/examples/straight-channel.part.json",
);

async function example() {
  return JSON.parse(await readFile(examplePath, "utf8"));
}

test("accepts the dimensionally accurate straight-channel candidate", async () => {
  const manifest = await example();
  const result = validatePartManifest(manifest);

  assert.equal(PART_MANIFEST_API_VERSION, "underware.parts/v1alpha1");
  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
  assert.equal(result.warnings[0].code, "license_unverified");
});

test("compiles physical dimensions without grid-cell rounding", async () => {
  const result = compilePartManifest(await example());

  assert.equal(result.ok, true);
  assert.deepEqual(result.part.catalog.footprintMm, {
    width: 140.01,
    height: 27.2,
  });
  assert.equal(result.part.physicalHeightMm, 22.4);
  assert.equal(result.part.placement.resizing, "fixed");
  assert.deepEqual(result.part.compatibleSystems, ["openGrid"]);
  assert.deepEqual(result.part.print.components, [
    {
      id: "channel-body",
      name: "Straight channel · 140.01 × 27.20 × 22.40 mm",
      quantity: 1,
      fileName: "monokini_I_channel_tex.scad",
      sizeMm: { x: 140.01, y: 27.2, z: 22.4 },
    },
  ]);
});

test("hashes canonical manifest content to the release-pinned revision", async () => {
  const manifest = await example();
  const reordered = Object.fromEntries(Object.entries(manifest).reverse());

  assert.equal(
    await hashPartManifest(manifest),
    "sha256:436313035d6279903f7f0668ec6d2249d3c11b4deb21823f5c84512c7db3c06d",
  );
  assert.equal(await hashPartManifest(reordered), await hashPartManifest(manifest));
});

test("rejects a visual scale that disagrees with the printable footprint", async () => {
  const manifest = await example();
  manifest.visual.viewBoxMm = [0, 0, 168, 56];
  manifest.visual.svg = manifest.visual.svg.replace(
    'viewBox="0 0 140.01 27.2"',
    'viewBox="0 0 168 56"',
  );
  const result = validatePartManifest(manifest);

  assert.equal(result.ok, false);
  assert.ok(
    result.issues.some((entry) => entry.code === "physical_scale_mismatch"),
  );
});

test("rejects non-millimetre manifests and free resizing", async () => {
  const manifest = await example();
  manifest.physical.units = "in";
  manifest.placement.resizing = "free";
  const result = validatePartManifest(manifest);

  assert.equal(result.ok, false);
  assert.ok(result.issues.some((entry) => entry.code === "unit_invariant"));
  assert.ok(
    result.issues.some((entry) => entry.code === "fixed_size_required"),
  );
});

test("rejects active or externally linked SVG content", async () => {
  const manifest = await example();
  manifest.visual.svg = manifest.visual.svg.replace(
    "</svg>",
    '<script>alert(1)</script><image href="https://example.com/x.png"/></svg>',
  );
  const result = validatePartManifest(manifest);

  assert.equal(result.ok, false);
  assert.ok(
    result.issues.some((entry) => entry.code === "external_or_styled_content"),
  );
  assert.ok(
    result.issues.some((entry) => entry.code === "unsupported_element"),
  );
});

test("rejects arbitrary executable capability names", async () => {
  const manifest = await example();
  manifest.capabilities.renderer = "https://example.com/renderer.js";
  const result = validatePartManifest(manifest);

  assert.equal(result.ok, false);
  assert.ok(
    result.issues.some((entry) => entry.code === "unsupported_capability"),
  );
});

test("rejects unknown fields and physical points outside the footprint", async () => {
  const manifest = await example();
  manifest.execute = "alert(1)";
  manifest.mounting[0].snapAnchorMm.x = 999;
  const result = validatePartManifest(manifest);

  assert.equal(result.ok, false);
  assert.ok(result.issues.some((entry) => entry.code === "unknown_property"));
  assert.ok(
    result.issues.some((entry) => entry.code === "point_outside_footprint"),
  );
});

test("requires exact dimensions for every printable component", async () => {
  const manifest = await example();
  delete manifest.print.components[0].sizeMm;
  const result = validatePartManifest(manifest);

  assert.equal(result.ok, false);
  assert.ok(
    result.issues.some(
      (entry) =>
        entry.path === "print.components.0.sizeMm" &&
        entry.code === "required",
    ),
  );
});

test("ships a strict Draft 2020-12 schema alongside the candidate", async () => {
  const schema = JSON.parse(
    await readFile(
      path.join(root, "spikes/json-parts/underware-part.schema.json"),
      "utf8",
    ),
  );

  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.properties.apiVersion.const, PART_MANIFEST_API_VERSION);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.$defs.physical.properties.units.const, "mm");
  assert.equal(schema.$defs.placement.properties.resizing.const, "fixed");
  assert.equal(schema.$defs.visual.properties.coordinateSpace.const, "physical-mm");
});
