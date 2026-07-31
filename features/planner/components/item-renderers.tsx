import {
  SYSTEM_SPECS,
  calculateGridTilePlan,
  getChannelGeometry,
  getPowerBrickOutletLayout,
} from "@/lib/planner.mjs";

import { usePartRegistry } from "../application/planner-provider";
import type { PlannerItem } from "../model/types";
import type { PartRendererProps } from "../parts/contracts";

type ChannelTopology = "straight" | "l" | "t" | "x" | "s";

function ItemBody({
  item,
  grid = false,
}: PartRendererProps & { grid?: boolean }) {
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

export function GridRenderer({ item }: PartRendererProps) {
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

export function createChannelRenderer(topology: ChannelTopology) {
  function ChannelRenderer({ item }: PartRendererProps) {
    const geometry = getChannelGeometry(item, topology);
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
  ChannelRenderer.displayName = `${topology}ChannelRenderer`;
  return ChannelRenderer;
}

export function CableLoopRenderer({ item }: PartRendererProps) {
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

export function PowerBrickRenderer({ item }: PartRendererProps) {
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

export function HolderRenderer({ item }: PartRendererProps) {
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

export function ObstacleRenderer({ item }: PartRendererProps) {
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

/** Compatibility fallback for v1 plan items without a catalogue ID. */
const LEGACY_RENDERERS = {
  part: HolderRenderer,
  grid: GridRenderer,
  channel: createChannelRenderer("straight"),
  "cable-loop": CableLoopRenderer,
  "power-brick": PowerBrickRenderer,
  holder: HolderRenderer,
  obstacle: ObstacleRenderer,
} as const;

export function ItemVisual({ item }: { item: PlannerItem }) {
  const registry = usePartRegistry();
  const Renderer =
    registry.resolve(item)?.Renderer ?? LEGACY_RENDERERS[item.kind];
  return <Renderer item={item} />;
}
