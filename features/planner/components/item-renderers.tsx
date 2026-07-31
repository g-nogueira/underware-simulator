import type { ComponentType } from "react";
import {
  SYSTEM_SPECS,
  calculateGridTilePlan,
  getChannelGeometry,
  getPowerBrickOutletLayout,
} from "@/lib/planner.mjs";

import type { ItemKind, PlannerItem } from "../model/types";

type ItemRendererProps = { item: PlannerItem };

function ItemBody({ item, grid = false }: ItemRendererProps & { grid?: boolean }) {
  return (
    <rect
      x={item.x}
      y={item.y}
      width={item.width}
      height={item.height}
      rx="18"
      className="item-body"
      fill={grid ? "url(#open-grid-plate)" : undefined}
    />
  );
}

function GridRenderer({ item }: ItemRendererProps) {
  const plan =
    Number.isFinite(item.width) &&
    Number.isFinite(item.height) &&
    item.width > 0 &&
    item.height > 0
      ? calculateGridTilePlan(
          item.width,
          item.height,
          SYSTEM_SPECS.openGrid.grid,
          item.maxTileCellsX ?? 8,
          item.maxTileCellsY ?? 8,
        )
      : null;

  return (
    <>
      <ItemBody item={item} grid />
      {plan && (
        <>
          <text
            x={item.x + item.width / 2}
            y={item.y + item.height / 2 - 4}
            textAnchor="middle"
            className="grid-label"
          >
            {plan.cellsX} × {plan.cellsY} cells
          </text>
          <text
            x={item.x + item.width / 2}
            y={item.y + item.height / 2 + 18}
            textAnchor="middle"
            className="grid-count-label"
          >
            {plan.tileCount} printable {plan.tileCount === 1 ? "grid" : "grids"}
          </text>
        </>
      )}
    </>
  );
}

function ChannelRenderer({ item }: ItemRendererProps) {
  const geometry = getChannelGeometry(item);
  return (
    <>
      <rect
        x={item.x}
        y={item.y}
        width={item.width}
        height={item.height}
        className="channel-hit-area"
      />
      <g transform={geometry.transform}>
        {geometry.paths.map((path, index) => (
          <g key={`${index}-${path}`}>
            <path
              d={path}
              className="channel-shell-outline"
              strokeWidth={geometry.branchWidth + 4}
            />
            <path
              d={path}
              className="channel-shell"
              strokeWidth={geometry.branchWidth}
            />
            <path d={path} className="channel-core" />
          </g>
        ))}
      </g>
    </>
  );
}

function CableLoopRenderer({ item }: ItemRendererProps) {
  return (
    <>
      <ItemBody item={item} />
      <ellipse
        cx={item.x + item.width / 2}
        cy={item.y + item.height / 2}
        rx={Math.max(8, item.width / 2 - 16)}
        ry={Math.max(8, item.height / 2 - 16)}
        className="cable-loop-ring"
      />
      <line
        x1={item.x + item.width / 2}
        y1={item.y + 4}
        x2={item.x + item.width / 2}
        y2={item.y + 23}
        className="cable-loop-opening"
      />
    </>
  );
}

function PowerBrickRenderer({ item }: ItemRendererProps) {
  return (
    <>
      <ItemBody item={item} />
      {getPowerBrickOutletLayout(
        item.width,
        item.height,
        item.outlets ?? 6,
      ).map((outlet, index) => (
        <circle
          key={index}
          cx={item.x + outlet.x}
          cy={item.y + outlet.y}
          r={outlet.radius}
          className="outlet"
        />
      ))}
    </>
  );
}

function HolderRenderer({ item }: ItemRendererProps) {
  return (
    <>
      <ItemBody item={item} />
      <rect
        x={item.x + 20}
        y={item.y + 15}
        width={item.width - 40}
        height="12"
        rx="6"
        className="holder-slot"
      />
      <line
        x1={item.x + 14}
        y1={item.y + item.height - 15}
        x2={item.x + item.width - 14}
        y2={item.y + item.height - 15}
        className="holder-lip"
      />
    </>
  );
}

function ObstacleRenderer({ item }: ItemRendererProps) {
  return (
    <>
      <ItemBody item={item} />
      <text
        x={item.x + item.width / 2}
        y={item.y + item.height / 2 + 7}
        textAnchor="middle"
        className="obstacle-label"
      >
        {item.name}
      </text>
    </>
  );
}

/** Exhaustive registry: adding a new item kind requires one renderer entry. */
const ITEM_RENDERERS: Record<ItemKind, ComponentType<ItemRendererProps>> = {
  grid: GridRenderer,
  channel: ChannelRenderer,
  "cable-loop": CableLoopRenderer,
  "power-brick": PowerBrickRenderer,
  holder: HolderRenderer,
  obstacle: ObstacleRenderer,
};

export function ItemVisual({ item }: ItemRendererProps) {
  const Renderer = ITEM_RENDERERS[item.kind];
  return <Renderer item={item} />;
}
