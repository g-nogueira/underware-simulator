import {
  SYSTEM_SPECS,
  calculateGridTilePlan,
  getCapacityState,
} from "@/lib/planner.mjs";

import {
  usePartRegistry,
  usePlanner,
} from "../application/planner-provider";
import type { PartInspectorProps } from "./contracts";

function parsePositiveNumber(
  value: string,
  fallback: number,
  max = Infinity,
) {
  if (value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(1, parsed), max);
}

export function GridCoverageInspector({ item }: PartInspectorProps) {
  const { updateSelected } = usePlanner();
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

  if (!plan) return null;

  return (
    <section className="inspector-section grid-config">
      <div className="section-heading">
        <h2>openGrid coverage</h2>
        <strong>
          {plan.tileCount} {plan.tileCount === 1 ? "grid" : "grids"} to print
        </strong>
      </div>
      <div className="grid-coverage-summary">
        <span>
          <strong>
            {plan.cellsX} × {plan.cellsY}
          </strong>
          cells covered
        </span>
        <span>
          <strong>
            {plan.columns} × {plan.rows}
          </strong>
          printable tiles
        </span>
      </div>
      <div className="field-grid">
        <label>
          <span>Cells W</span>
          <span className="input-unit">
            <input
              type="number"
              min="1"
              value={plan.cellsX}
              onChange={(event) =>
                updateSelected({
                  width:
                    parsePositiveNumber(event.target.value, plan.cellsX) *
                    SYSTEM_SPECS.openGrid.grid,
                })
              }
            />
          </span>
        </label>
        <label>
          <span>Cells H</span>
          <span className="input-unit">
            <input
              type="number"
              min="1"
              value={plan.cellsY}
              onChange={(event) =>
                updateSelected({
                  height:
                    parsePositiveNumber(event.target.value, plan.cellsY) *
                    SYSTEM_SPECS.openGrid.grid,
                })
              }
            />
          </span>
        </label>
        <label>
          <span>Tile max W</span>
          <span className="input-unit">
            <input
              type="number"
              min="1"
              max="20"
              value={item.maxTileCellsX ?? 8}
              onChange={(event) =>
                updateSelected({
                  maxTileCellsX: parsePositiveNumber(
                    event.target.value,
                    item.maxTileCellsX ?? 8,
                    20,
                  ),
                })
              }
            />
          </span>
        </label>
        <label>
          <span>Tile max H</span>
          <span className="input-unit">
            <input
              type="number"
              min="1"
              max="20"
              value={item.maxTileCellsY ?? 8}
              onChange={(event) =>
                updateSelected({
                  maxTileCellsY: parsePositiveNumber(
                    event.target.value,
                    item.maxTileCellsY ?? 8,
                    20,
                  ),
                })
              }
            />
          </span>
        </label>
      </div>
      <p>
        Defaults to 8 × 8 cells (224 × 224 mm). Change the maximum tile size to
        match your printer bed; the print list splits edge grids automatically.
      </p>
    </section>
  );
}

export function ChannelCapacityInspector({ item }: PartInspectorProps) {
  const { systemSpec, updateSelected } = usePlanner();
  const capacity = item.cables ?? 0;
  const state = getCapacityState(capacity, systemSpec.capacity);

  return (
    <section className="inspector-section">
      <div className="section-heading">
        <h2>Channel capacity</h2>
        <strong>
          {capacity} / {systemSpec.capacity} cables
        </strong>
      </div>
      <input
        className="capacity-range"
        type="range"
        min="0"
        max={systemSpec.capacity + 2}
        value={capacity}
        onChange={(event) =>
          updateSelected({ cables: Number(event.target.value) })
        }
        aria-label="Cables in selected channel"
      />
      <div
        className={`capacity-meter ${state.level !== "ok" ? "warning" : ""}`}
      >
        <i style={{ width: `${Math.min(state.percent, 100)}%` }} />
      </div>
      <p className={state.level !== "ok" ? "warning-copy" : ""}>
        {state.level === "over"
          ? "Over capacity. Split this route or use another channel."
          : state.level === "near"
            ? "Near capacity. Leave room for bend tolerance."
            : `${100 - state.percent}% spare capacity remains.`}
      </p>
    </section>
  );
}

export function PowerBrickOutletInspector({ item }: PartInspectorProps) {
  const { updateSelected } = usePlanner();

  return (
    <section className="inspector-section">
      <div className="section-heading">
        <h2>Outlet layout</h2>
        <strong>{item.outlets ?? 6} outlets</strong>
      </div>
      <input
        className="capacity-range"
        type="range"
        min="1"
        max="16"
        value={item.outlets ?? 6}
        onChange={(event) =>
          updateSelected({ outlets: Number(event.target.value) })
        }
        aria-label="Power brick outlet count"
      />
      <p>Outlets reflow and scale automatically to fit the brick dimensions.</p>
    </section>
  );
}

export function ManifestPartInspector({ item }: PartInspectorProps) {
  const registry = usePartRegistry();
  const definition = registry.resolve(item);
  const manifest = definition?.manifest?.snapshot;
  if (!manifest) return null;

  const { x, y, z } = manifest.physical.sizeMm;
  const componentCount = manifest.print.components.reduce(
    (total, component) => total + component.quantity,
    0,
  );

  return (
    <section className="inspector-section manifest-part-details">
      <div className="section-heading">
        <h2>Printable model</h2>
        <strong>Exact size locked</strong>
      </div>
      <dl>
        <div>
          <dt>Physical size</dt>
          <dd>
            {x} × {y} × {z} mm
          </dd>
        </div>
        <div>
          <dt>Manifest</dt>
          <dd>v{manifest.version}</dd>
        </div>
        <div>
          <dt>Print output</dt>
          <dd>
            {componentCount} {componentCount === 1 ? "component" : "components"}
          </dd>
        </div>
      </dl>
      <a
        href={manifest.metadata.source.url}
        target="_blank"
        rel="noreferrer"
      >
        Open source model ↗
      </a>
      <p>
        Width and depth stay pinned to this exact printable definition. Editing
        the JSON creates a new revision; existing placements keep this one.
      </p>
    </section>
  );
}
