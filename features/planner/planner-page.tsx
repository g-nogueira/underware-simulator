"use client";

import { PlannerProvider } from "./application/planner-provider";
import { PlannerView } from "./components/planner-view";
import { DEFAULT_PART_REGISTRY } from "./parts/built-in-parts";

export default function PlannerPage() {
  return (
    <PlannerProvider partRegistry={DEFAULT_PART_REGISTRY}>
      <PlannerView />
    </PlannerProvider>
  );
}
