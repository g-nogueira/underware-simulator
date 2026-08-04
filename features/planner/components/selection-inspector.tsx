"use client";

import { ROUTE_COLORS } from "../model/catalog";

import {
  usePartRegistry,
  usePlanner,
} from "../application/planner-provider";

function parseMillimetres(
  value: string,
  fallback: number,
  min = -Infinity,
  max = Infinity,
) {
  if (value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

export function SelectionInspector() {
  const planner = usePlanner();
  const partRegistry = usePartRegistry();
  const {
    routes,
    selectedRouteId,
    selected,
    selectedRoute,
    selectedRouteGeometry,
    selectedRoutePointIndex,
    selectedRoutePointIsBend,
    systemSpec,
    selectedRouteLength,
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
  const selectedCanResize = selected
    ? partRegistry.canResize(selected)
    : false;
  const selectedRotations = selected
    ? partRegistry.allowedRotationsFor(selected)
    : [];

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
                          diameter: parseMillimetres(
                            event.target.value,
                            selectedRoute.diameter,
                            1,
                            30,
                          ),
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
                        updateSelected({
                          x: parseMillimetres(
                            event.target.value,
                            selected.x,
                          ),
                        })
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
                        updateSelected({
                          y: parseMillimetres(
                            event.target.value,
                            selected.y,
                          ),
                        })
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
                      readOnly={!selectedCanResize}
                      onChange={(event) =>
                        selectedCanResize &&
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
                      readOnly={!selectedCanResize}
                      onChange={(event) =>
                        selectedCanResize &&
                        updateSelected({
                          height: Math.max(1, Number(event.target.value) || 1),
                        })
                      }
                    />
                    <i>mm</i>
                  </span>
                </label>
              </div>
              {!selectedCanResize && (
                <p className="fixed-size-note">
                  Locked to the manifest&apos;s exact printable footprint.
                </p>
              )}
            </section>

            <section className="inspector-section">
              <h2>Rotation</h2>
              <div className="rotation-options">
                {selectedRotations.map((rotation) => (
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

            {partRegistry.resolve(selected)?.InspectorSections?.map(
              (InspectorSection, index) => (
                <InspectorSection key={index} item={selected} />
              ),
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
                style={{ cursor: "default" }}
              >
                <button
                  type="button"
                  className="route-select"
                  style={{
                    width: 7,
                    height: 7,
                    padding: 0,
                    borderRadius: "50%",
                    background: route.color,
                    color: route.color,
                    boxShadow: "0 0 8px currentColor",
                  }}
                  onClick={() => selectRoute(route.id)}
                  aria-label={"Select " + route.name}
                  aria-pressed={selectedRouteId === route.id}
                />
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
                        diameter: parseMillimetres(
                          event.target.value,
                          route.diameter,
                          1,
                          30,
                        ),
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

