"use client";

import { PlannerHeader } from "./planner-header";
import { PlannerOverlays } from "./planner-overlays";
import { PlannerWorkspace } from "./planner-workspace";
import { SelectionInspector } from "./selection-inspector";
import { PlannerTools } from "./planner-tools";

export function PlannerView() {
  return (
    <main className="app-shell">
      <PlannerHeader />
      <PlannerTools />
      <PlannerWorkspace />
      <SelectionInspector />
      <PlannerOverlays />
    </main>
  );
}

