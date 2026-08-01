import type { ComponentType } from "react";

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
  availability?: { system: SystemId };
  placement?: {
    grid: "active-system" | "openGrid";
    layer: "back" | "front";
    minimumSizeCells?: { width: number; height: number };
  };
  appearance?: { shadow: boolean };
  print?: {
    strategy: "single" | "linear" | "grid-tiles";
    capacity: "none" | "cable";
  };
  tool?: ToolId;
  /** Resolves v1 plan items that predate catalogue IDs. */
  legacyKind?: ItemKind;
};

export type CreatePartContext = {
  desk: { width: number; depth: number };
  activeGrid: number;
  layer: number;
  makeId: (prefix: string) => string;
  snapToGrid: (value: number, gridSize: number) => number;
};

export type PartPrintDefinition = {
  id: string;
  name: string;
  strategy: "single" | "linear" | "grid-tiles";
  capacity: "none" | "cable";
};

export type PartRegistry = {
  readonly catalog: readonly CatalogItem[];
  readonly printDefinitions: readonly PartPrintDefinition[];
  get(id: string): PartDefinition | undefined;
  findForTool(tool: ToolId): PartDefinition | undefined;
  resolve(item: PlannerItem): PartDefinition | undefined;
  create(id: string, context: CreatePartContext): PlannerItem | undefined;
  isAvailable(id: string, system: SystemId): boolean;
  gridSizeFor(item: PlannerItem, activeGrid: number): number;
  minimumSizeFor(
    item: PlannerItem,
    activeGrid: number,
  ): { width: number; height: number };
};
