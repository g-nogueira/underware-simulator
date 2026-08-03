import { SYSTEM_SPECS, rotateFootprintPoint } from "@/lib/planner.mjs";

import type { PlannerItem, SystemId, ToolId } from "../model/types";
import type {
  CreatePartContext,
  PartDefinition,
  PartRegistry,
} from "./contracts";

const DEFAULT_PLACEMENT = {
  grid: "active-system",
  layer: "front",
  minimumSizeCells: { width: 1, height: 1 },
  resizing: "free",
  allowedRotations: [0, 90, 180, 270],
} as const;

export function definePart(definition: PartDefinition): PartDefinition {
  return definition;
}

/**
 * Composes independently defined parts behind the interface consumed by the
 * planner. The application never imports the built-in catalogue directly.
 */
export function createPartRegistry(
  definitions: readonly PartDefinition[],
): PartRegistry {
  const byId = new Map<string, PartDefinition>();
  const catalogById = new Map<string, PartDefinition>();
  const byDefinitionHash = new Map<string, PartDefinition>();
  const byLegacyKind = new Map<string, PartDefinition>();
  const byTool = new Map<ToolId, PartDefinition>();

  for (const definition of definitions) {
    const id = definition.catalog.id;
    if (definition.manifest) {
      if (byDefinitionHash.has(definition.manifest.definitionHash)) {
        throw new Error(
          `Duplicate part definition hash: ${definition.manifest.definitionHash}`,
        );
      }
      byDefinitionHash.set(definition.manifest.definitionHash, definition);
    }
    if (!definition.manifest || definition.manifest.catalogVisible) {
      if (byId.has(id) && !definition.manifest) {
        throw new Error(`Duplicate part definition: ${id}`);
      }
      byId.set(id, definition);
      catalogById.set(id, definition);
    }
    if (definition.legacyKind) {
      if (byLegacyKind.has(definition.legacyKind)) {
        throw new Error(`Duplicate legacy part kind: ${definition.legacyKind}`);
      }
      byLegacyKind.set(definition.legacyKind, definition);
    }
    if (definition.tool) {
      if (byTool.has(definition.tool)) {
        throw new Error(`Duplicate part tool: ${definition.tool}`);
      }
      byTool.set(definition.tool, definition);
    }
  }

  const catalog = Object.freeze(
    [...catalogById.values()].map(({ catalog: entry }) => entry),
  );
  const printDefinitions = Object.freeze(
    definitions.map((definition) => ({
      id: definition.catalog.id,
      ...(definition.manifest
        ? { definitionHash: definition.manifest.definitionHash }
        : {}),
      name: definition.catalog.name,
      strategy: definition.print?.strategy ?? "single",
      capacity: definition.print?.capacity ?? "none",
      ...(definition.print?.components
        ? { components: definition.print.components }
        : {}),
    })),
  );

  function get(id: string) {
    return byId.get(id);
  }

  function resolve(item: PlannerItem) {
    return (
      (item.partDefinition
        ? byDefinitionHash.get(item.partDefinition)
        : undefined) ??
      (item.catalogId ? byId.get(item.catalogId) : undefined) ??
      byLegacyKind.get(item.kind)
    );
  }

  function supportsSystem(
    definition: PartDefinition | undefined,
    system: SystemId,
  ) {
    if (!definition?.availability) return Boolean(definition);
    return "systems" in definition.availability
      ? definition.availability.systems.includes(system)
      : definition.availability.system === system;
  }

  function unrotatedAnchor(
    definition: PartDefinition | undefined,
    system: SystemId,
  ) {
    return definition?.placement?.snapAnchorsMm?.[system] ?? { x: 0, y: 0 };
  }

  function rotatedAnchor(
    definition: PartDefinition | undefined,
    item: PlannerItem,
    system: SystemId,
  ) {
    const anchor = unrotatedAnchor(definition, system);
    const footprint = definition?.catalog.footprintMm;
    const originalWidth = footprint?.width ??
      (item.rotation % 180 === 0 ? item.width : item.height);
    const originalHeight = footprint?.height ??
      (item.rotation % 180 === 0 ? item.height : item.width);
    return rotateFootprintPoint(
      anchor,
      originalWidth,
      originalHeight,
      item.rotation,
    );
  }

  function gridSize(definition: PartDefinition | undefined, activeGrid: number) {
    return definition?.placement?.grid === "openGrid"
      ? SYSTEM_SPECS.openGrid.grid
      : activeGrid;
  }

  return Object.freeze({
    catalog,
    printDefinitions,
    get,
    getByDefinitionHash(hash) {
      return byDefinitionHash.get(hash);
    },
    findForTool(tool) {
      return byTool.get(tool);
    },
    resolve,
    isAvailable(id, system) {
      return supportsSystem(get(id), system);
    },
    canResize(item) {
      return resolve(item)?.placement?.resizing !== "fixed";
    },
    allowedRotationsFor(item) {
      return (
        resolve(item)?.placement?.allowedRotations ??
        DEFAULT_PLACEMENT.allowedRotations
      );
    },
    snapAnchorFor(item, system) {
      return rotatedAnchor(resolve(item), item, system);
    },
    snapshotsFor(items) {
      return Object.fromEntries(
        items.flatMap((item) => {
          if (!item.partDefinition) return [];
          const definition = byDefinitionHash.get(item.partDefinition);
          return definition?.manifest
            ? [[item.partDefinition, definition.manifest.snapshot]]
            : [];
        }),
      );
    },
    create(id: string, context: CreatePartContext) {
      const definition = get(id);
      if (!definition) return undefined;
      const placement = { ...DEFAULT_PLACEMENT, ...definition.placement };
      const partGrid = gridSize(definition, context.activeGrid);
      const width =
        definition.catalog.footprintMm?.width ??
        definition.catalog.widthCells * partGrid;
      const height =
        definition.catalog.footprintMm?.height ??
        definition.catalog.heightCells * partGrid;

      const anchor = unrotatedAnchor(definition, context.system);
      const x =
        context.snapToGrid(
          context.desk.width / 2 - width / 2 + anchor.x,
          partGrid,
        ) - anchor.x;
      const y =
        context.snapToGrid(
          context.desk.depth / 2 - height / 2 + anchor.y,
          partGrid,
        ) - anchor.y;

      return {
        id: context.makeId(id),
        kind: definition.catalog.kind,
        catalogId: id,
        name: definition.catalog.name,
        x,
        y,
        width,
        height,
        rotation: 0,
        layer: placement.layer === "back" ? 0 : context.layer,
        ...(definition.manifest
          ? { partDefinition: definition.manifest.definitionHash }
          : {}),
        ...definition.defaults,
      };
    },
    gridSizeFor(item, activeGrid) {
      return gridSize(resolve(item), activeGrid);
    },
    minimumSizeFor(item, activeGrid) {
      const definition = resolve(item);
      const partGrid = gridSize(definition, activeGrid);
      const cells =
        definition?.placement?.minimumSizeCells ??
        DEFAULT_PLACEMENT.minimumSizeCells;
      return {
        width: cells.width * partGrid,
        height: cells.height * partGrid,
      };
    },
  });
}
