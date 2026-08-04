"use client";

import { PlannerProvider } from "./application/planner-provider";
import { PlannerView } from "./components/planner-view";
import { usePartLibrary } from "./parts/use-part-library";

export default function PlannerPage() {
  const partLibrary = usePartLibrary();
  return (
    <PlannerProvider partLibrary={partLibrary}>
      <PlannerView />
    </PlannerProvider>
  );
}
