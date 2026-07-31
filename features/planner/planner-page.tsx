"use client";

import { PlannerProvider } from "./application/planner-provider";
import { PlannerView } from "./components/planner-view";

export default function PlannerPage() {
  return (
    <PlannerProvider>
      <PlannerView />
    </PlannerProvider>
  );
}
