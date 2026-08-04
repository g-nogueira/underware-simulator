import type { ComponentType } from "react";
import type { PartManifest, PartManifestIssue } from "@/lib/part-manifest.mjs";

import type {
  CatalogItem,
  ItemKind,
  PlannerItem,
  SystemId,
  ToolId,
} from "../model/types";

export type PartRendererProps = { item: PlannerItem };
export type PartInspectorProps = { item: PlannerItem };

export type PartDefaults = Partial<
  Pick<
    PlannerItem,
    "cables" | "outlets" | "maxTileCellsX" | "maxTileCellsY"
  >
>;

export type PartDefinition = {
  catalog: CatalogItem;
  Renderer: ComponentType<PartRendererProps>;
  InspectorSections?: readonly ComponentType<PartInspectorProps>[];
  defaults?: PartDefaults;
  availability?: { system: SystemId } | { systems: readonly SystemId[] };
  placement?: {
    grid: "active-system" | "openGrid";
    layer: "back" | "front";
    minimumSizeCells?: { width: number; height: number };
    resizing?: "fixed" | "free";
    allowedRotations?: readonly PlannerItem["rotation"][];
    snapAnchorsMm?: Readonly<
      Partial<Record<SystemId, Readonly<{ x: number; y: number }>>>
    >;
  };
  appearance?: { shadow: boolean };
  print?: {
    strategy: "single" | "linear" | "grid-tiles" | "components";
    capacity: "none" | "cable";
    components?: readonly {
      id: string;
      name: string;
      quantity: number;
      sizeMm: { x: number; y: number; z: number };
      fileName?: string;
      artifactSha256?: string;
    }[];
  };
  manifest?: {
    definitionHash: `sha256:${string}`;
    snapshot: Readonly<PartManifest>;
    origin: "build-time" | "runtime" | "plan";
    catalogVisible: boolean;
  };
  tool?: ToolId;
  /** Resolves v1 plan items that predate catalogue IDs. */
  legacyKind?: ItemKind;
};

export type CreatePartContext = {
  desk: { width: number; depth: number };
  activeGrid: number;
  system: SystemId;
  layer: number;
  makeId: (prefix: string) => string;
  snapToGrid: (value: number, gridSize: number) => number;
};

export type PartPrintDefinition = {
  id: string;
  definitionHash?: `sha256:${string}`;
  name: string;
  strategy: "single" | "linear" | "grid-tiles" | "components";
  capacity: "none" | "cable";
  components?: readonly {
    id: string;
    name: string;
    quantity: number;
    sizeMm: { x: number; y: number; z: number };
  }[];
};

export type PartRegistry = {
  readonly catalog: readonly CatalogItem[];
  readonly printDefinitions: readonly PartPrintDefinition[];
  get(id: string): PartDefinition | undefined;
  getByDefinitionHash(hash: string): PartDefinition | undefined;
  findForTool(tool: ToolId): PartDefinition | undefined;
  resolve(item: PlannerItem): PartDefinition | undefined;
  create(id: string, context: CreatePartContext): PlannerItem | undefined;
  isAvailable(id: string, system: SystemId): boolean;
  canResize(item: PlannerItem): boolean;
  allowedRotationsFor(item: PlannerItem): readonly PlannerItem["rotation"][];
  snapAnchorFor(
    item: PlannerItem,
    system: SystemId,
  ): Readonly<{ x: number; y: number }>;
  snapshotsFor(items: readonly PlannerItem[]): Record<string, PartManifest>;
  gridSizeFor(item: PlannerItem, activeGrid: number): number;
  minimumSizeFor(
    item: PlannerItem,
    activeGrid: number,
  ): { width: number; height: number };
};

export type InstalledPartManifest = {
  hash: `sha256:${string}`;
  manifest: PartManifest;
  installedAt: string;
};

export type PartLibraryInstallResult =
  | {
      ok: false;
      issues: PartManifestIssue[];
      warnings: PartManifestIssue[];
    }
  | {
      ok: true;
      hash: `sha256:${string}`;
      manifest: PartManifest;
      warnings: PartManifestIssue[];
      alreadyInstalled: boolean;
    };

export type PartLibrary = {
  ready: boolean;
  registry: PartRegistry;
  installedManifests: readonly InstalledPartManifest[];
  installManifest(value: unknown): Promise<PartLibraryInstallResult>;
  preparePlanDefinitions(plan: {
    version: 1 | 2;
    items: readonly PlannerItem[];
    partDefinitions?: Record<string, unknown>;
  }): Promise<{ ok: true } | { ok: false; reason: string }>;
};
