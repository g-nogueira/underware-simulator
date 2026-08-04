export const PART_MANIFEST_API_VERSION: "underware.parts/v1alpha1";

export type PartManifestIssue = {
  path: string;
  code: string;
  message: string;
};

export type PartSizeMm = { x: number; y: number; z: number };
export type PartPointMm = { x: number; y: number };

export type PartManifest = {
  $schema?: string;
  apiVersion: typeof PART_MANIFEST_API_VERSION;
  id: string;
  version: string;
  metadata: {
    name: string;
    icon?: string;
    category: string;
    description: string;
    tags?: string[];
    source: {
      provider: "makerworld" | "local" | "other";
      url: string;
      modelId?: string;
      profileId?: string;
      creator?: string;
      artifactSha256?: string;
    };
    license: {
      status: "declared" | "unknown";
      name?: string;
      spdxId?: string;
      sourceUrl: string;
    };
  };
  physical: {
    units: "mm";
    sizeMm: PartSizeMm;
    clearanceMm?: {
      left: number;
      right: number;
      top: number;
      bottom: number;
      above: number;
    };
  };
  placement: {
    resizing: "fixed";
    allowedRotations: Array<0 | 90 | 180 | 270>;
    defaultLayer: "back" | "front";
  };
  mounting: Array<{
    system: "openGrid" | "underware";
    snapAnchorMm: PartPointMm;
    attachmentPointsMm?: Array<PartPointMm & { id: string }>;
  }>;
  ports?: Array<{
    id: string;
    kind: "cable";
    positionMm: PartPointMm;
    directionDeg: 0 | 90 | 180 | 270;
  }>;
  capabilities: {
    renderer: "svg/v1";
    sizing: "fixed/v1";
    print: "components/v1";
    capacity: "none/v1" | "system-cable/v1";
  };
  defaults?: { cables?: number };
  visual: {
    type: "svg";
    coordinateSpace: "physical-mm";
    viewBoxMm: [0, 0, number, number];
    svg: string;
  };
  print: {
    components: Array<{
      id: string;
      name: string;
      quantity: number;
      sizeMm: PartSizeMm;
      fileName?: string;
      artifactSha256?: string;
    }>;
  };
};

export type PartManifestValidation =
  | {
      ok: false;
      issues: PartManifestIssue[];
      warnings: PartManifestIssue[];
    }
  | {
      ok: true;
      manifest: PartManifest;
      issues: [];
      warnings: PartManifestIssue[];
    };

export function canonicalizePartManifest(value: unknown): string;
export function hashPartManifest(value: unknown): Promise<`sha256:${string}`>;
export function validatePartManifest(value: unknown): PartManifestValidation;

export function compilePartManifest(
  value: unknown,
): Extract<PartManifestValidation, { ok: false }> | (Extract<PartManifestValidation, { ok: true }> & {
  part: Readonly<{
    catalog: Readonly<{
      id: string;
      kind: "part";
      name: string;
      icon: string;
      category: string;
      description: string;
      widthCells: 1;
      heightCells: 1;
      footprintMm: Readonly<{ width: number; height: number }>;
    }>;
    physicalHeightMm: number;
    allowedRotations: readonly (0 | 90 | 180 | 270)[];
    compatibleSystems: readonly ("openGrid" | "underware")[];
    snapAnchorsMm: Readonly<
      Partial<Record<"openGrid" | "underware", Readonly<PartPointMm>>>
    >;
    defaults: Readonly<{ cables?: number }>;
    placement: Readonly<{
      grid: "active-system";
      layer: "back" | "front";
      resizing: "fixed";
    }>;
    print: Readonly<{
      strategy: "components";
      capacity: "cable" | "none";
      components: readonly Readonly<PartManifest["print"]["components"][number]>[];
    }>;
    visual: Readonly<{ svg: string; viewBoxMm: readonly number[] }>;
    source: Readonly<PartManifest["metadata"]["source"]>;
    version: string;
    manifest: Readonly<PartManifest>;
  }>;
});
