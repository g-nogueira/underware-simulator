import { SYSTEM_SPECS } from "@/lib/planner.mjs";

import { usePlanner } from "../application/planner-provider";
import { ItemLayer, RouteLayer } from "./planner-layers";

export function PlannerWorkspace() {
  const {
    desk,
    openDeskSetup,
    savedAt,
    systemSpec,
    zoom,
    zoomBy,
    resetZoom,
    layerStack,
    routeById,
    itemById,
    selectedRoute,
    selectedRoutePointIndex,
    historyState,
    printPlan,
    handlePointerMove,
    handlePointerUp,
    handleRoutePointPointerDown,
    clearSelection,
    cancelCanvasInteraction,
    undoPlan,
    redoPlan,
    openTrace,
    openPrintPlan,
  } = usePlanner();

  return (
    <section className="workspace" aria-label="Desk underside planner">
      <div className="workspace-heading">
        <div className="workspace-title">
          <span className="eyebrow">Desk underside</span>
          <strong>
            {desk.width} × {desk.depth} mm
          </strong>
          <button type="button" onClick={openDeskSetup}>
            Desk setup
          </button>
        </div>
        <div className="workspace-meta">
          <span className="save-status" title={savedAt || undefined}>
            <i aria-hidden="true">✓</i>
            {savedAt ? "Saved locally" : "Saving locally"}
          </span>
          <span className="snap-status">
            <i aria-hidden="true" /> Snap · {systemSpec.grid} mm
          </span>
        </div>
      </div>

      <div className="canvas-scroll">
        <div
          className="canvas-stage"
          style={{ width: `${zoom}%`, minWidth: `${zoom * 10}px` }}
        >
          <div className="measure measure-top">
            <span>{desk.width} mm</span>
          </div>
          <div className="measure measure-side">
            <span>{desk.depth} mm</span>
          </div>
          <svg
            className="desk-canvas"
            viewBox={`0 0 ${desk.width} ${desk.depth}`}
            role="img"
            aria-label={`${desk.width} by ${desk.depth} millimetre desk underside plan`}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={cancelCanvasInteraction}
            onPointerDown={clearSelection}
          >
            <defs>
              <pattern
                id="minor-grid"
                width={systemSpec.grid}
                height={systemSpec.grid}
                patternUnits="userSpaceOnUse"
              >
                <path
                  d={`M ${systemSpec.grid} 0 L 0 0 0 ${systemSpec.grid}`}
                  className="grid-minor"
                />
              </pattern>
              <pattern
                id="major-grid"
                width={systemSpec.grid * 5}
                height={systemSpec.grid * 5}
                patternUnits="userSpaceOnUse"
              >
                <rect
                  width={systemSpec.grid * 5}
                  height={systemSpec.grid * 5}
                  fill="url(#minor-grid)"
                />
                <path
                  d={`M ${systemSpec.grid * 5} 0 L 0 0 0 ${systemSpec.grid * 5}`}
                  className="grid-major"
                />
              </pattern>
              <filter
                id="item-shadow"
                x="-20%"
                y="-20%"
                width="140%"
                height="140%"
              >
                <feDropShadow
                  dx="0"
                  dy="5"
                  stdDeviation="5"
                  floodColor="#000"
                  floodOpacity=".42"
                />
              </filter>
              <pattern
                id="open-grid-plate"
                width={SYSTEM_SPECS.openGrid.grid}
                height={SYSTEM_SPECS.openGrid.grid}
                patternUnits="userSpaceOnUse"
              >
                <rect
                  x="1.5"
                  y="1.5"
                  width={SYSTEM_SPECS.openGrid.grid - 3}
                  height={SYSTEM_SPECS.openGrid.grid - 3}
                  rx="5"
                  className="open-grid-cell"
                />
                <circle
                  cx={SYSTEM_SPECS.openGrid.grid / 2}
                  cy={SYSTEM_SPECS.openGrid.grid / 2}
                  r="2.5"
                  className="open-grid-hole"
                />
              </pattern>
            </defs>

            <rect
              className="desk-surface"
              x="2"
              y="2"
              width={desk.width - 4}
              height={desk.depth - 4}
              rx="30"
            />
            <rect
              x="2"
              y="2"
              width={desk.width - 4}
              height={desk.depth - 4}
              rx="30"
              fill="url(#major-grid)"
            />

            {layerStack.map((entry) => {
              if (entry.type === "route") {
                const route = routeById.get(entry.id);
                return route ? (
                  <RouteLayer key={`route:${entry.id}`} route={route} />
                ) : null;
              }
              const item = itemById.get(entry.id);
              return item ? (
                <ItemLayer key={`item:${entry.id}`} item={item} />
              ) : null;
            })}

            {selectedRoute && (
              <g className="route-points" aria-label="Cable route control points">
                {selectedRoute.points.map(([x, y], index) => (
                  <circle
                    key={`${selectedRoute.id}-${index}`}
                    cx={x}
                    cy={y}
                    r="10"
                    className={`route-point ${
                      selectedRoutePointIndex === index ? "selected" : ""
                    }`}
                    onPointerDown={(event) =>
                      handleRoutePointPointerDown(
                        event,
                        selectedRoute.id,
                        index,
                      )
                    }
                    aria-label={
                      index > 0 && index < selectedRoute.points.length - 1
                        ? `Select or move ${selectedRoute.name} bend ${index}`
                        : `Move ${selectedRoute.name} endpoint ${index + 1}`
                    }
                  />
                ))}
              </g>
            )}
          </svg>
        </div>
      </div>

      <div className="canvas-controls" aria-label="Canvas zoom">
        <button
          type="button"
          onClick={() => zoomBy(-8)}
          aria-label="Zoom out"
        >
          −
        </button>
        <span>{zoom}%</span>
        <button
          type="button"
          onClick={() => zoomBy(8)}
          aria-label="Zoom in"
        >
          +
        </button>
        <button type="button" onClick={resetZoom}>
          Fit
        </button>
        <button
          type="button"
          onClick={undoPlan}
          disabled={historyState.undo === 0}
          aria-label="Undo"
          title="Undo · Ctrl Z"
        >
          ↶
        </button>
        <button
          type="button"
          onClick={redoPlan}
          disabled={historyState.redo === 0}
          aria-label="Redo"
          title="Redo · Ctrl Shift Z"
        >
          ↷
        </button>
        <button
          type="button"
          className="trace-button"
          onClick={openTrace}
          title="Open troubleshooting activity"
        >
          Trace
        </button>
      </div>

      <button
        type="button"
        className={`print-summary ${
          printPlan.overCapacityIds.length ? "warning" : ""
        }`}
        onClick={openPrintPlan}
      >
        <span>
          <small>Print plan</small>
          <strong>{printPlan.partsCount} parts</strong>
        </span>
        {printPlan.gridTilesCount > 0 && (
          <span>
            <small>openGrid</small>
            <strong>
              {printPlan.gridTilesCount}{" "}
              {printPlan.gridTilesCount === 1 ? "grid" : "grids"}
            </strong>
          </span>
        )}
        <span className="print-summary-estimate">
          <small>Estimate</small>
          <strong>
            {Math.floor(printPlan.printMinutes / 60)}h{" "}
            {printPlan.printMinutes % 60}m · {printPlan.filamentGrams}g
          </strong>
        </span>
        <span className="summary-arrow" aria-hidden="true">
          ↗
        </span>
      </button>
    </section>
  );
}
