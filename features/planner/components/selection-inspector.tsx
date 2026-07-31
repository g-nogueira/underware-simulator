"use client";

import { SYSTEM_SPECS } from "@/lib/planner.mjs";
import { ROUTE_COLORS } from "../model/catalog";

import type { PlannerFacade } from "../application/planner-provider";

export function SelectionInspector({
  planner,
}: {
  planner: PlannerFacade;
}) {
  const {
    routes,
    selectedRouteId,
    selected,
    selectedRoute,
    selectedRouteGeometry,
    selectedRoutePointIndex,
    selectedRoutePointIsBend,
    systemSpec,
    capacity,
    capacityState,
    selectedRouteLength,
    selectedGridPlan,
    updateSelected,
    beginSelectionNameEdit,
    changeSelectionName,
    finishSelectionNameEdit,
    rotateSelected,
    deleteSelected,
    removeRoute,
    updateRoute,
    moveSelectionLayer,
    addRouteBend,
    removeSelectedBend,
    duplicateSelected,
    selectRoute,
  } = planner;

  return (
    <>
      <aside className="inspector" aria-label="Selection inspector">
        <div className="inspector-header">
          <div>
            <span className="eyebrow">Selection</span>
            {selected || selectedRoute ? (
              <label className="selection-name">
                <span className="sr-only">Selection name</span>
                <input
                  value={selected?.name ?? selectedRoute?.name ?? ""}
                  onFocus={beginSelectionNameEdit}
                  onChange={(event) => changeSelectionName(event.target.value)}
                  onBlur={finishSelectionNameEdit}
                  aria-label={`Rename ${
                    selected?.name ?? selectedRoute?.name ?? "selection"
                  }`}
                />
                <span aria-hidden="true">✎</span>
              </label>
            ) : (
              <strong>Nothing selected</strong>
            )}
          </div>
          {(selected || selectedRoute) && (
            <span className="selection-type">
              {selected ? selected.kind.replace("-", " ") : "cable route"}
            </span>
          )}
        </div>

        {selectedRoute ? (
          <>
            <section className="inspector-section route-editor">
              <h2>Route geometry</h2>
              <div className="route-stats">
                <span>
                  <strong>{selectedRoute.points.length}</strong>
                  control points
                </span>
                <span>
                  <strong>{selectedRouteLength} mm</strong>
                  route length
                </span>
              </div>
              <p>
                Drag the cable line to move the whole route. Drag a blue point
                to change its start, end, or bends. Click a bend to select it
                for removal.
              </p>
              {selectedRoutePointIndex !== null && (
                <div className="bend-selection">
                  <span>
                    <strong>
                      {selectedRoutePointIsBend
                        ? `Bend ${selectedRoutePointIndex}`
                        : "Route endpoint"}
                    </strong>
                    {selectedRoutePointIsBend
                      ? "Selected control point"
                      : "Endpoints cannot be removed"}
                  </span>
                  {selectedRoutePointIsBend && (
                    <button
                      type="button"
                      className="danger"
                      onClick={removeSelectedBend}
                    >
                      Remove bend
                    </button>
                  )}
                </div>
              )}
            </section>
            <section className="inspector-section">
              <h2>Cable</h2>
              <div className="field-grid route-fields">
                <label>
                  <span>Ø</span>
                  <span className="input-unit">
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={selectedRoute.diameter}
                      onChange={(event) =>
                        updateRoute(selectedRoute.id, {
                          diameter: Number(event.target.value),
                        })
                      }
                    />
                    <i>mm</i>
                  </span>
                </label>
              </div>
              <div className="route-color-field">
                <label>
                  <span>Route color</span>
                  <input
                    type="color"
                    value={selectedRoute.color}
                    onChange={(event) =>
                      updateRoute(selectedRoute.id, {
                        color: event.target.value,
                      })
                    }
                    aria-label={`${selectedRoute.name} color`}
                  />
                </label>
                <div className="color-swatches" aria-label="Route color presets">
                  {ROUTE_COLORS.map((color) => (
                    <button
                      type="button"
                      key={color}
                      className={selectedRoute.color === color ? "active" : ""}
                      style={{ background: color }}
                      onClick={() =>
                        updateRoute(selectedRoute.id, { color })
                      }
                      aria-label={`Set route color to ${color}`}
                      aria-pressed={selectedRoute.color === color}
                    />
                  ))}
                </div>
              </div>
              <div className="route-bundle-status">
                <span>Channel behaviour</span>
                <strong>
                  {selectedRouteGeometry &&
                  selectedRouteGeometry.maxBundleSize > 1
                    ? `${selectedRouteGeometry.maxBundleSize} cable lanes detected`
                    : "Automatic cable lanes"}
                </strong>
                <small>
                  Grid points remain the exact route centreline. Shared segments
                  fan into parallel, diameter-aware lanes; layer order controls
                  over/under crossings.
                </small>
              </div>
            </section>
            <section className="inspector-section">
              <h2>Layer order</h2>
              <div className="layer-options">
                <button type="button" onClick={() => moveSelectionLayer("back")}>
                  Send to back
                </button>
                <button
                  type="button"
                  onClick={() => moveSelectionLayer("backward")}
                >
                  Send backward
                </button>
                <button
                  type="button"
                  onClick={() => moveSelectionLayer("forward")}
                >
                  Bring forward
                </button>
                <button type="button" onClick={() => moveSelectionLayer("front")}>
                  Bring to front
                </button>
              </div>
              <p>Routes and physical parts share the same visual layer stack.</p>
            </section>
            <section className="inspector-actions">
              <button type="button" onClick={() => addRouteBend(selectedRoute)}>
                Add bend
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => removeRoute(selectedRoute.id)}
              >
                Delete
              </button>
            </section>
          </>
        ) : selected ? (
          <>
            <section className="inspector-section">
              <h2>Position</h2>
              <div className="field-grid">
                <label>
                  <span>X</span>
                  <span className="input-unit">
                    <input
                      type="number"
                      value={selected.x}
                      step={systemSpec.grid}
                      onChange={(event) =>
                        updateSelected({ x: Number(event.target.value) })
                      }
                    />
                    <i>mm</i>
                  </span>
                </label>
                <label>
                  <span>Y</span>
                  <span className="input-unit">
                    <input
                      type="number"
                      value={selected.y}
                      step={systemSpec.grid}
                      onChange={(event) =>
                        updateSelected({ y: Number(event.target.value) })
                      }
                    />
                    <i>mm</i>
                  </span>
                </label>
              </div>
            </section>

            <section className="inspector-section">
              <h2>Size</h2>
              <div className="field-grid">
                <label>
                  <span>W</span>
                  <span className="input-unit">
                    <input
                      type="number"
                      min="1"
                      value={selected.width}
                      onChange={(event) =>
                        updateSelected({
                          width: Math.max(1, Number(event.target.value) || 1),
                        })
                      }
                    />
                    <i>mm</i>
                  </span>
                </label>
                <label>
                  <span>H</span>
                  <span className="input-unit">
                    <input
                      type="number"
                      min="1"
                      value={selected.height}
                      onChange={(event) =>
                        updateSelected({
                          height: Math.max(1, Number(event.target.value) || 1),
                        })
                      }
                    />
                    <i>mm</i>
                  </span>
                </label>
              </div>
            </section>

            <section className="inspector-section">
              <h2>Rotation</h2>
              <div className="rotation-options">
                {([0, 90, 180, 270] as const).map((rotation) => (
                  <button
                    type="button"
                    key={rotation}
                    className={selected.rotation === rotation ? "active" : ""}
                    onClick={() => rotateSelected(rotation)}
                  >
                    {rotation}°
                  </button>
                ))}
              </div>
            </section>

            <section className="inspector-section">
              <h2>Layer order</h2>
              <div className="layer-options">
                <button type="button" onClick={() => moveSelectionLayer("back")}>
                  Send to back
                </button>
                <button
                  type="button"
                  onClick={() => moveSelectionLayer("backward")}
                >
                  Send backward
                </button>
                <button
                  type="button"
                  onClick={() => moveSelectionLayer("forward")}
                >
                  Bring forward
                </button>
                <button type="button" onClick={() => moveSelectionLayer("front")}>
                  Bring to front
                </button>
              </div>
              <p>
                Use this to place a power brick behind a cable route or keep a
                grid below every mounted part.
              </p>
            </section>

            {selected.kind === "grid" && selectedGridPlan && (
              <section className="inspector-section grid-config">
                <div className="section-heading">
                  <h2>openGrid coverage</h2>
                  <strong>
                    {selectedGridPlan.tileCount}{" "}
                    {selectedGridPlan.tileCount === 1 ? "grid" : "grids"} to
                    print
                  </strong>
                </div>
                <div className="grid-coverage-summary">
                  <span>
                    <strong>
                      {selectedGridPlan.cellsX} × {selectedGridPlan.cellsY}
                    </strong>
                    cells covered
                  </span>
                  <span>
                    <strong>
                      {selectedGridPlan.columns} × {selectedGridPlan.rows}
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
                        value={selectedGridPlan.cellsX}
                        onChange={(event) =>
                          updateSelected({
                            width:
                              Math.max(1, Number(event.target.value)) *
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
                        value={selectedGridPlan.cellsY}
                        onChange={(event) =>
                          updateSelected({
                            height:
                              Math.max(1, Number(event.target.value)) *
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
                        value={selected.maxTileCellsX ?? 8}
                        onChange={(event) =>
                          updateSelected({
                            maxTileCellsX: Math.max(
                              1,
                              Number(event.target.value),
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
                        value={selected.maxTileCellsY ?? 8}
                        onChange={(event) =>
                          updateSelected({
                            maxTileCellsY: Math.max(
                              1,
                              Number(event.target.value),
                            ),
                          })
                        }
                      />
                    </span>
                  </label>
                </div>
                <p>
                  Defaults to 8 × 8 cells (224 × 224 mm). Change the maximum
                  tile size to match your printer bed; the print list splits
                  edge grids automatically.
                </p>
              </section>
            )}

            {selected.kind === "channel" && (
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
                  className={`capacity-meter ${
                    capacityState.level !== "ok" ? "warning" : ""
                  }`}
                >
                  <i
                    style={{ width: `${Math.min(capacityState.percent, 100)}%` }}
                  />
                </div>
                <p
                  className={
                    capacityState.level !== "ok" ? "warning-copy" : ""
                  }
                >
                  {capacityState.level === "over"
                    ? "Over capacity. Split this route or use another channel."
                    : capacityState.level === "near"
                      ? "Near capacity. Leave room for bend tolerance."
                      : `${100 - capacityState.percent}% spare capacity remains.`}
                </p>
              </section>
            )}

            {selected.kind === "power-brick" && (
              <section className="inspector-section">
                <div className="section-heading">
                  <h2>Outlet layout</h2>
                  <strong>{selected.outlets ?? 6} outlets</strong>
                </div>
                <input
                  className="capacity-range"
                  type="range"
                  min="1"
                  max="16"
                  value={selected.outlets ?? 6}
                  onChange={(event) =>
                    updateSelected({ outlets: Number(event.target.value) })
                  }
                  aria-label="Power brick outlet count"
                />
                <p>
                  Outlets reflow and scale automatically to fit the brick
                  dimensions.
                </p>
              </section>
            )}

            <section className="inspector-actions">
              <button
                type="button"
                onClick={duplicateSelected}
              >
                Duplicate
              </button>
              <button type="button" className="danger" onClick={deleteSelected}>
                Delete
              </button>
            </section>
          </>
        ) : (
          <div className="empty-selection">
            <span aria-hidden="true">↖</span>
            <strong>Select something on the desk</strong>
            <p>Move it on the grid or edit its exact dimensions here.</p>
          </div>
        )}

        <section className="route-section">
          <div className="section-heading">
            <h2>Cable routes</h2>
            <strong>{routes.length}</strong>
          </div>
          <div className="route-list">
            {routes.map((route) => (
              <div
                key={route.id}
                className={selectedRouteId === route.id ? "active" : ""}
                onClick={() => selectRoute(route.id)}
              >
                <i style={{ background: route.color }} aria-hidden="true" />
                <label>
                  <span className="sr-only">Route name</span>
                  <input
                    value={route.name}
                    onChange={(event) =>
                      updateRoute(route.id, { name: event.target.value })
                    }
                  />
                </label>
                <label className="route-diameter">
                  <span className="sr-only">
                    {route.name} cable diameter in millimetres
                  </span>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={route.diameter}
                    onChange={(event) =>
                      updateRoute(route.id, {
                        diameter: Number(event.target.value),
                      })
                    }
                  />
                  <span>mm</span>
                </label>
                <button
                  type="button"
                  onClick={() => removeRoute(route.id)}
                  aria-label={`Delete ${route.name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </section>
      </aside>
    </>
  );
}
