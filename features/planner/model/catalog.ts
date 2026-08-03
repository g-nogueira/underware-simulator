import { SYSTEM_SPECS } from "@/lib/planner.mjs";
import type { SystemId, ToolId } from "./types";

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

