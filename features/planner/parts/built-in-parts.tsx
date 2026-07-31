import {
  CableLoopRenderer,
  GridRenderer,
  HolderRenderer,
  PowerBrickRenderer,
  createChannelRenderer,
} from "../components/item-renderers";
import type { CatalogItem } from "../model/types";
import type { PartDefinition } from "./contracts";
import {
  ChannelCapacityInspector,
  GridCoverageInspector,
  PowerBrickOutletInspector,
} from "./part-inspector-sections";
import { createPartRegistry, definePart } from "./part-registry";

function channel(
  catalog: CatalogItem,
  topology: "straight" | "l" | "t" | "x" | "s",
  legacy = false,
): PartDefinition {
  return definePart({
    catalog,
    Renderer: createChannelRenderer(topology),
    InspectorSections: [ChannelCapacityInspector],
    defaults: { cables: 0 },
    placement: { grid: "active-system", layer: "front" },
    appearance: { shadow: true },
    print: { strategy: "linear", capacity: "cable" },
    ...(legacy ? { legacyKind: "channel" as const } : {}),
  });
}

/**
 * Built-in modules are composed once at the application boundary. Adding a
 * shape that uses existing behaviours means adding one definition here (or
 * importing one from another module), without changing the planner core.
 */
export const BUILT_IN_PARTS = [
  definePart({
    catalog: {
      id: "opengrid-baseplate",
      kind: "grid",
      name: "openGrid baseplate",
      icon: "▦",
      category: "Foundation",
      description: "Resizable coverage area split into printable grid tiles.",
      widthCells: 8,
      heightCells: 8,
      featured: true,
    },
    Renderer: GridRenderer,
    InspectorSections: [GridCoverageInspector],
    defaults: { maxTileCellsX: 8, maxTileCellsY: 8 },
    availability: { system: "openGrid" },
    placement: { grid: "openGrid", layer: "back" },
    appearance: { shadow: false },
    print: { strategy: "grid-tiles", capacity: "none" },
    tool: "grid",
    legacyKind: "grid",
  }),
  channel(
    {
      id: "straight-channel",
      kind: "channel",
      name: "Straight channel",
      icon: "━",
      category: "Cable routing",
      description: "Parametric I channel for a straight cable run.",
      widthCells: 6,
      heightCells: 2,
    },
    "straight",
    true,
  ),
  channel(
    {
      id: "l-channel",
      kind: "channel",
      name: "L corner channel",
      icon: "┗",
      category: "Cable routing",
      description: "A 90° corner joining two perpendicular runs.",
      widthCells: 4,
      heightCells: 4,
    },
    "l",
  ),
  channel(
    {
      id: "t-channel",
      kind: "channel",
      name: "T junction channel",
      icon: "┳",
      category: "Cable routing",
      description: "A three-way branch for splitting a route.",
      widthCells: 4,
      heightCells: 4,
    },
    "t",
  ),
  channel(
    {
      id: "x-channel",
      kind: "channel",
      name: "X junction channel",
      icon: "╋",
      category: "Cable routing",
      description: "A four-way crossing for intersecting runs.",
      widthCells: 4,
      heightCells: 4,
    },
    "x",
  ),
  channel(
    {
      id: "s-channel",
      kind: "channel",
      name: "S offset channel",
      icon: "∿",
      category: "Cable routing",
      description: "An offset channel for moving a run around an obstacle.",
      widthCells: 5,
      heightCells: 3,
    },
    "s",
  ),
  definePart({
    catalog: {
      id: "cable-loop",
      kind: "cable-loop",
      name: "Cable loop",
      icon: "◯",
      category: "Cable routing",
      description: "Open loop for retaining a loose cable bundle.",
      widthCells: 2,
      heightCells: 2,
    },
    Renderer: CableLoopRenderer,
    placement: { grid: "active-system", layer: "front" },
    appearance: { shadow: true },
    print: { strategy: "single", capacity: "none" },
    legacyKind: "cable-loop",
  }),
  definePart({
    catalog: {
      id: "device-holder",
      kind: "holder",
      name: "Device holder",
      icon: "⊔",
      category: "Mounts",
      description: "Resizable cradle for hubs, mini PCs, and adapters.",
      widthCells: 5,
      heightCells: 3,
    },
    Renderer: HolderRenderer,
    placement: {
      grid: "active-system",
      layer: "front",
      minimumSizeCells: { width: 3, height: 2 },
    },
    appearance: { shadow: true },
    print: { strategy: "single", capacity: "none" },
    legacyKind: "holder",
  }),
  definePart({
    catalog: {
      id: "power-brick-mount",
      kind: "power-brick",
      name: "Power brick mount",
      icon: "▯",
      category: "Mounts",
      description: "Resizable brick or power-strip holder with outlet count.",
      widthCells: 7,
      heightCells: 3,
    },
    Renderer: PowerBrickRenderer,
    InspectorSections: [PowerBrickOutletInspector],
    defaults: { outlets: 6 },
    placement: {
      grid: "active-system",
      layer: "front",
      minimumSizeCells: { width: 3, height: 2 },
    },
    appearance: { shadow: true },
    print: { strategy: "single", capacity: "none" },
    legacyKind: "power-brick",
  }),
] as const satisfies readonly PartDefinition[];

export const DEFAULT_PART_REGISTRY = createPartRegistry(BUILT_IN_PARTS);
