import { createManifestPartDefinition } from "./manifest-part-definition";
import {
  BUILD_TIME_MANIFESTS,
  RELEASE_PART_MANIFESTS,
} from "./build-time-manifests";
import type { PartDefinition } from "./contracts";
import { createPartRegistry } from "./part-registry";
import { createReleasePartDefinition } from "./release-part-definition";

const releaseDefinitions = RELEASE_PART_MANIFESTS.map(
  createReleasePartDefinition,
);
const exactDefinitions = BUILD_TIME_MANIFESTS.map((entry) => ({
  ...createManifestPartDefinition({
    manifest: entry.manifest,
    definitionHash: entry.hash,
    origin: "build-time",
    catalogVisible: true,
  }),
  legacyKind: entry.legacyKind,
}));

/**
 * Every release-owned catalogue entry now starts as JSON. The first entry is
 * the foundation tool, followed by the exact featured printable variant and
 * the remaining generator-backed planning templates.
 */
export const BUILT_IN_PARTS = [
  releaseDefinitions[0],
  ...exactDefinitions,
  ...releaseDefinitions.slice(1),
] as const satisfies readonly PartDefinition[];

export const DEFAULT_PART_REGISTRY = createPartRegistry(BUILT_IN_PARTS);
