import type { ComponentType } from "react";

import {
  CableLoopRenderer,
  GridRenderer,
  HolderRenderer,
  PowerBrickRenderer,
  createChannelRenderer,
} from "../components/item-renderers";
import type {
  CatalogItem,
  ItemKind,
  PlannerItem,
  SystemId,
  ToolId,
} from "../model/types";
import type {
  PartDefaults,
  PartDefinition,
  PartInspectorProps,
  PartRendererProps,
} from "./contracts";
import {
  ChannelCapacityInspector,
  GridCoverageInspector,
  PowerBrickOutletInspector,
} from "./part-inspector-sections";
import { definePart } from "./part-registry";

export const RELEASE_PART_API_VERSION =
  "underware.release-part/v1alpha1" as const;

type RendererCapability =
  | "grid/v1"
  | "channel/l/v1"
  | "channel/t/v1"
  | "channel/x/v1"
  | "channel/s/v1"
  | "cable-loop/v1"
  | "holder/v1"
  | "power-brick/v1";

type InspectorCapability =
  | "grid-coverage/v1"
  | "channel-capacity/v1"
  | "power-brick-outlets/v1";

export type ReleasePartManifest = {
  $schema?: string;
  apiVersion: typeof RELEASE_PART_API_VERSION;
  catalog: CatalogItem;
  provenance: {
    sourceUrl: string;
    license: string;
  };
  physical: {
    units: "mm";
    sizing: "grid-derived";
    printReadiness: "generator-required";
  };
  capabilities: {
    renderer: RendererCapability;
    inspectors?: readonly InspectorCapability[];
  };
  defaults?: PartDefaults;
  availability?: { system: SystemId } | { systems: readonly SystemId[] };
  placement: NonNullable<PartDefinition["placement"]>;
  appearance: { shadow: boolean };
  print: NonNullable<PartDefinition["print"]>;
  tool?: ToolId;
  legacyKind?: ItemKind;
};

const RENDERERS: Record<
  RendererCapability,
  ComponentType<PartRendererProps>
> = {
  "grid/v1": GridRenderer,
  "channel/l/v1": createChannelRenderer("l"),
  "channel/t/v1": createChannelRenderer("t"),
  "channel/x/v1": createChannelRenderer("x"),
  "channel/s/v1": createChannelRenderer("s"),
  "cable-loop/v1": CableLoopRenderer,
  "holder/v1": HolderRenderer,
  "power-brick/v1": PowerBrickRenderer,
};

const INSPECTORS: Record<
  InspectorCapability,
  ComponentType<PartInspectorProps>
> = {
  "grid-coverage/v1": GridCoverageInspector,
  "channel-capacity/v1": ChannelCapacityInspector,
  "power-brick-outlets/v1": PowerBrickOutletInspector,
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertReleasePartManifest(
  value: unknown,
): asserts value is ReleasePartManifest {
  if (!isObject(value) || value.apiVersion !== RELEASE_PART_API_VERSION) {
    throw new Error(`Expected ${RELEASE_PART_API_VERSION}`);
  }
  if (!isObject(value.catalog)) {
    throw new Error("Release part manifest needs catalogue metadata");
  }
  const catalog = value.catalog;
  if (
    typeof catalog.id !== "string" ||
    typeof catalog.name !== "string" ||
    typeof catalog.category !== "string" ||
    typeof catalog.description !== "string" ||
    typeof catalog.icon !== "string" ||
    !Number.isFinite(catalog.widthCells) ||
    Number(catalog.widthCells) <= 0 ||
    !Number.isFinite(catalog.heightCells) ||
    Number(catalog.heightCells) <= 0
  ) {
    throw new Error("Release part catalogue metadata is incomplete");
  }
  if (
    !isObject(value.physical) ||
    value.physical.units !== "mm" ||
    value.physical.sizing !== "grid-derived" ||
    value.physical.printReadiness !== "generator-required"
  ) {
    throw new Error(
      `${catalog.id} must explicitly identify its grid-derived, generator-required dimensions`,
    );
  }
  if (
    !isObject(value.provenance) ||
    typeof value.provenance.sourceUrl !== "string" ||
    typeof value.provenance.license !== "string"
  ) {
    throw new Error(`${catalog.id} needs source and licence provenance`);
  }
  try {
    const source = new URL(value.provenance.sourceUrl);
    if (source.protocol !== "https:") throw new Error("protocol");
  } catch {
    throw new Error(`${catalog.id} source must be an HTTPS URL`);
  }
  if (!isObject(value.capabilities)) {
    throw new Error(`${catalog.id} needs capability identifiers`);
  }
  if (!(value.capabilities.renderer as string in RENDERERS)) {
    throw new Error(`${catalog.id} uses an unsupported renderer capability`);
  }
  if (
    value.capabilities.inspectors !== undefined &&
    (!Array.isArray(value.capabilities.inspectors) ||
      value.capabilities.inspectors.some(
        (entry) => typeof entry !== "string" || !(entry in INSPECTORS),
      ))
  ) {
    throw new Error(`${catalog.id} uses an unsupported inspector capability`);
  }
  if (!isObject(value.placement) || !isObject(value.appearance)) {
    throw new Error(`${catalog.id} needs placement and appearance settings`);
  }
  if (!isObject(value.print)) {
    throw new Error(`${catalog.id} needs print-planning settings`);
  }
}

/**
 * Compiles trusted, release-owned JSON planning templates through finite
 * renderer and inspector capability maps. These templates preserve the
 * existing parametric editor behaviour, but deliberately do not claim to be
 * immutable printable variants until a concrete X/Y/Z manifest is supplied.
 */
export function createReleasePartDefinition(value: unknown): PartDefinition {
  assertReleasePartManifest(value);
  const inspectors = (value.capabilities.inspectors ?? []).map(
    (capability) => INSPECTORS[capability],
  );

  return definePart({
    catalog: value.catalog,
    Renderer: RENDERERS[value.capabilities.renderer],
    ...(inspectors.length ? { InspectorSections: inspectors } : {}),
    ...(value.defaults ? { defaults: value.defaults } : {}),
    ...(value.availability ? { availability: value.availability } : {}),
    placement: {
      ...value.placement,
      ...(value.placement.allowedRotations
        ? {
            allowedRotations:
              value.placement.allowedRotations as readonly PlannerItem["rotation"][],
          }
        : {}),
    },
    appearance: value.appearance,
    print: value.print,
    ...(value.tool ? { tool: value.tool } : {}),
    ...(value.legacyKind ? { legacyKind: value.legacyKind } : {}),
  });
}
