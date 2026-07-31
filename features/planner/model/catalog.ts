import { SYSTEM_SPECS } from "@/lib/planner.mjs";
import type { CatalogItem, SystemId, ToolId } from "./types";

export const AUTOSAVE_KEY = "underware-route-lab:plan:v1";

export const SYSTEMS = {
  openGrid: {
    label: SYSTEM_SPECS.openGrid.label,
    grid: SYSTEM_SPECS.openGrid.grid,
    capacity: SYSTEM_SPECS.openGrid.channelCapacity,
  },
  underware: {
    label: SYSTEM_SPECS.underware.label,
    grid: SYSTEM_SPECS.underware.grid,
    capacity: SYSTEM_SPECS.underware.channelCapacity,
  },
} as const satisfies Record<
  SystemId,
  { label: string; grid: number; capacity: number }
>;

export const TOOLS: Array<{ id: ToolId; icon: string; label: string }> = [
  { id: "select", icon: "↖", label: "Select" },
  { id: "grid", icon: "▦", label: "openGrid" },
  { id: "parts", icon: "＋", label: "Parts" },
  { id: "route", icon: "⌁", label: "Cable route" },
  { id: "obstacle", icon: "▧", label: "Obstacle" },
];

export const ROUTE_COLORS = [
  "#56d7e4",
  "#5294ff",
  "#9f7aea",
  "#f973c8",
  "#ffb020",
  "#39d98a",
  "#ff6b6b",
] as const;

/**
 * New printable parts are registered here. The planner consumes this metadata
 * generically, so catalogue growth does not require changing page composition
 * or item-creation workflows.
 */
export const PART_CATALOG: CatalogItem[] = [
  {
    id: "opengrid-baseplate",
    kind: "grid",
    name: "openGrid baseplate",
    icon: "▦",
    category: "Foundation",
    description: "Resizable coverage area split into printable grid tiles.",
    widthCells: 8,
    heightCells: 8,
    openGridOnly: true,
  },
  {
    id: "straight-channel",
    kind: "channel",
    name: "Straight channel",
    icon: "━",
    category: "Cable routing",
    description: "Parametric I channel for a straight cable run.",
    widthCells: 6,
    heightCells: 2,
    cables: 0,
  },
  {
    id: "l-channel",
    kind: "channel",
    name: "L corner channel",
    icon: "┗",
    category: "Cable routing",
    description: "A 90° corner joining two perpendicular runs.",
    widthCells: 4,
    heightCells: 4,
    cables: 0,
  },
  {
    id: "t-channel",
    kind: "channel",
    name: "T junction channel",
    icon: "┳",
    category: "Cable routing",
    description: "A three-way branch for splitting a route.",
    widthCells: 4,
    heightCells: 4,
    cables: 0,
  },
  {
    id: "x-channel",
    kind: "channel",
    name: "X junction channel",
    icon: "╋",
    category: "Cable routing",
    description: "A four-way crossing for intersecting runs.",
    widthCells: 4,
    heightCells: 4,
    cables: 0,
  },
  {
    id: "s-channel",
    kind: "channel",
    name: "S offset channel",
    icon: "∿",
    category: "Cable routing",
    description: "An offset channel for moving a run around an obstacle.",
    widthCells: 5,
    heightCells: 3,
    cables: 0,
  },
  {
    id: "cable-loop",
    kind: "cable-loop",
    name: "Cable loop",
    icon: "◯",
    category: "Cable routing",
    description: "Open loop for retaining a loose cable bundle.",
    widthCells: 2,
    heightCells: 2,
  },
  {
    id: "device-holder",
    kind: "holder",
    name: "Device holder",
    icon: "⊔",
    category: "Mounts",
    description: "Resizable cradle for hubs, mini PCs, and adapters.",
    widthCells: 5,
    heightCells: 3,
  },
  {
    id: "power-brick-mount",
    kind: "power-brick",
    name: "Power brick mount",
    icon: "▯",
    category: "Mounts",
    description: "Resizable brick or power-strip holder with outlet count.",
    widthCells: 7,
    heightCells: 3,
    outlets: 4,
  },
];
