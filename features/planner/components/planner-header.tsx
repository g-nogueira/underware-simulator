import { useRef } from "react";

import { SYSTEMS } from "../model/catalog";
import type { SystemId } from "../model/types";
import { usePlanner } from "../application/planner-provider";

export function PlannerHeader() {
  const fileInput = useRef<HTMLInputElement>(null);
  const {
    system,
    planName,
    renamePlan,
    changeSystem,
    importPlan,
    exportPlan,
  } = usePlanner();

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          U
        </span>
        <span>Underware</span>
        <span className="brand-slash">/</span>
        <span className="brand-subtitle">Route Lab</span>
      </div>

      <label className="plan-name">
        <span className="sr-only">Plan name</span>
        <input
          value={planName}
          onChange={(event) => renamePlan(event.target.value)}
        />
        <span aria-hidden="true">✎</span>
      </label>

      <div
        className="system-switch"
        role="group"
        aria-label="Mounting system"
      >
        {(Object.keys(SYSTEMS) as SystemId[]).map((id) => (
          <button
            type="button"
            key={id}
            className={system === id ? "active" : ""}
            onClick={() => changeSystem(id)}
            aria-pressed={system === id}
          >
            <strong>{SYSTEMS[id].label}</strong>
            <span>{SYSTEMS[id].grid} mm</span>
          </button>
        ))}
      </div>

      <div className="file-actions">
        <input
          ref={fileInput}
          className="sr-only"
          type="file"
          accept=".json,application/json"
          onChange={importPlan}
          tabIndex={-1}
          aria-hidden="true"
        />
        <button type="button" onClick={() => fileInput.current?.click()}>
          <span aria-hidden="true">↓</span> Import
        </button>
        <button type="button" className="primary" onClick={exportPlan}>
          <span aria-hidden="true">↑</span> Export
        </button>
      </div>
    </header>
  );
}
