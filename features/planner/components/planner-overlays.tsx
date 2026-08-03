"use client";

import {
  usePartRegistry,
  usePlanner,
} from "../application/planner-provider";
import { useDialogFocus } from "./use-dialog-focus";

export function PlannerOverlays() {
  const planner = usePlanner();
  const partRegistry = usePartRegistry();
  const {
    deskDraft,
    printOpen,
    deskOpen,
    traceOpen,
    traceId,
    traceEvents,
    toast,
    system,
    systemSpec,
    printPlan,
    exportPlan,
    applyDeskDimensions,
    exportTrace,
    closeDeskSetup,
    updateDeskDraft,
    closePrintPlan,
    closeTrace,
  } = planner;
  const deskDialogRef = useDialogFocus(deskOpen, closeDeskSetup);
  const printDialogRef = useDialogFocus(printOpen, closePrintPlan);
  const traceDialogRef = useDialogFocus(traceOpen, closeTrace);

  return (
    <>
      {deskOpen && (
        <div
          className="drawer-backdrop modal-backdrop"
          role="presentation"
          onMouseDown={closeDeskSetup}
        >
          <section
            ref={deskDialogRef}
            className="desk-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="desk-setup-title"
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span className="eyebrow">Physical workspace</span>
                <h2 id="desk-setup-title">Desk setup</h2>
              </div>
              <button
                type="button"
                onClick={closeDeskSetup}
                aria-label="Close desk setup"
              >
                ×
              </button>
            </header>
            <p>
              Enter the usable underside area. Parts outside the new boundary
              will be moved back inside it.
            </p>
            <div className="desk-fields">
              <label>
                <span>Width</span>
                <span className="input-unit">
                  <input
                    data-dialog-initial-focus
                    type="number"
                    min="300"
                    value={deskDraft.width}
                    onChange={(event) =>
                      updateDeskDraft(
                        "width",
                        event.target.value === ""
                          ? ""
                          : Number(event.target.value),
                      )
                    }
                  />
                  <i>mm</i>
                </span>
              </label>
              <label>
                <span>Depth</span>
                <span className="input-unit">
                  <input
                    type="number"
                    min="300"
                    value={deskDraft.depth}
                    onChange={(event) =>
                      updateDeskDraft(
                        "depth",
                        event.target.value === ""
                          ? ""
                          : Number(event.target.value),
                      )
                    }
                  />
                  <i>mm</i>
                </span>
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" onClick={closeDeskSetup}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={applyDeskDimensions}>
                Apply dimensions
              </button>
            </div>
          </section>
        </div>
      )}

{printOpen && (
        <div
          className="drawer-backdrop"
          role="presentation"
          onMouseDown={closePrintPlan}
        >
          <aside
            ref={printDialogRef}
            className="print-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="print-plan-title"
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span className="eyebrow">Ready to make</span>
                <h2 id="print-plan-title">Print plan</h2>
              </div>
              <button
                type="button"
                onClick={closePrintPlan}
                aria-label="Close print plan"
              >
                ×
              </button>
            </header>
            <div
              className={`print-totals ${
                printPlan.gridTilesCount > 0 ? "has-grid-total" : ""
              }`}
            >
              <span>
                <strong>{printPlan.partsCount}</strong>
                <small>parts</small>
              </span>
              {printPlan.gridTilesCount > 0 && (
                <span>
                  <strong>{printPlan.gridTilesCount}</strong>
                  <small>openGrid plates</small>
                </span>
              )}
              <span>
                <strong>
                  {Math.floor(printPlan.printMinutes / 60)}h{" "}
                  {printPlan.printMinutes % 60}m
                </strong>
                <small>print time</small>
              </span>
              <span>
                <strong>{printPlan.filamentGrams}g</strong>
                <small>filament</small>
              </span>
            </div>
            {printPlan.overCapacityIds.length > 0 && (
              <div className="print-warning">
                <span aria-hidden="true">!</span>
                {printPlan.overCapacityIds.length} channel
                {printPlan.overCapacityIds.length === 1 ? "" : "s"} over
                capacity
              </div>
            )}
            <div className="bom-list">
              {printPlan.groups.map((group) => (
                <div key={group.label}>
                  <span className="part-thumbnail" aria-hidden="true">
                    ▣
                  </span>
                  <span>
                    <strong>{group.label}</strong>
                    <small>
                      {group.catalogId &&
                      !partRegistry.isAvailable(group.catalogId, system)
                        ? `Not compatible with ${systemSpec.label}`
                        : `${systemSpec.label} compatible`}
                    </small>
                  </span>
                  <b>× {group.count}</b>
                </div>
              ))}
            </div>
            <div className="print-note">
              <span aria-hidden="true">i</span>
              Estimates are planning aids. Confirm the generated part dimensions
              in the official Underware/openGrid model before printing.
            </div>
            <button type="button" className="primary wide" onClick={exportPlan}>
              Export plan JSON
            </button>
          </aside>
        </div>
      )}

{traceOpen && (
        <div
          className="drawer-backdrop"
          role="presentation"
          onMouseDown={closeTrace}
        >
          <aside
            ref={traceDialogRef}
            className="print-drawer trace-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="trace-title"
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span className="eyebrow">Local diagnostics</span>
                <h2 id="trace-title">Activity trace</h2>
              </div>
              <button
                type="button"
                onClick={closeTrace}
                aria-label="Close activity trace"
              >
                ×
              </button>
            </header>
            <div className="trace-id">
              <span>
                Correlation ID
                <strong>{traceId}</strong>
              </span>
              <i aria-hidden="true" />
            </div>
            <p className="trace-copy">
              Route Lab records structured actions only on this device. Export
              this log when a saved plan behaves unexpectedly.
            </p>
            <div className="trace-events">
              {[...traceEvents].reverse().map((entry, index) => (
                <article key={`${entry.timestamp}-${entry.event}-${index}`}>
                  <span className={entry.level}>{entry.level}</span>
                  <div>
                    <strong>{entry.event}</strong>
                    <time>{new Date(entry.timestamp).toLocaleTimeString()}</time>
                    {entry.details && (
                      <code>{JSON.stringify(entry.details)}</code>
                    )}
                  </div>
                </article>
              ))}
            </div>
            <button type="button" className="primary wide" onClick={exportTrace}>
              Export troubleshooting log
            </button>
          </aside>
        </div>
      )}

{toast && (
        <div className="toast" role="status">
          <span aria-hidden="true">✓</span>
          {toast}
        </div>
      )}
    </>
  );
}
