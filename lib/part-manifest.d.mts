export const PART_MANIFEST_API_VERSION: "underware.parts/v1alpha1";

export type PartManifestIssue = {
  path: string;
  code: string;
  message: string;
};

export type PartManifestJson =
  | null
  | boolean
  | number
  | string
  | PartManifestJson[]
  | { [key: string]: PartManifestJson };

export type PartManifestValidation =
  | {
      ok: false;
      issues: PartManifestIssue[];
      warnings: PartManifestIssue[];
    }
  | {
      ok: true;
      manifest: Record<string, PartManifestJson>;
      issues: [];
      warnings: PartManifestIssue[];
    };

export function validatePartManifest(value: unknown): PartManifestValidation;

export function compilePartManifest(
  value: unknown,
): PartManifestValidation | (Extract<PartManifestValidation, { ok: true }> & {
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
    allowedRotations: readonly number[];
    compatibleSystems: readonly string[];
    placement: Readonly<{
      grid: "active-system";
      layer: "back" | "front";
      resizing: "fixed";
    }>;
    print: Readonly<{
      strategy: "components";
      capacity: "cable" | "none";
      components: readonly Readonly<Record<string, PartManifestJson>>[];
    }>;
    visual: Readonly<{ svg: string; viewBoxMm: readonly number[] }>;
    source: Readonly<Record<string, PartManifestJson>>;
    version: string;
  }>;
});
