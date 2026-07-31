"use client";

import { usePlanner } from "../application/planner-provider";
import { PlannerHeader } from "./planner-header";
import { PlannerOverlays } from "./planner-overlays";
import { PlannerWorkspace } from "./planner-workspace";
import { SelectionInspector } from "./selection-inspector";
import { PlannerTools } from "./planner-tools";

export function PlannerView() {
  const planner = usePlanner();

  return (
    <main className="app-shell">
      <PlannerHeader />
      <PlannerTools />
      <PlannerWorkspace />
      <SelectionInspector planner={planner} />
      <PlannerOverlays planner={planner} />
    </main>
  );
}
