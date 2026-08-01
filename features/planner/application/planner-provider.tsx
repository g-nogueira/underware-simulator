"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";

import type { PartRegistry } from "../parts/contracts";
import {
  usePlannerController,
  type PlannerFacade,
} from "./use-planner-controller";

const PlannerContext = createContext<PlannerFacade | null>(null);
const PartRegistryContext = createContext<PartRegistry | null>(null);

export function PlannerProvider({
  children,
  partRegistry,
}: {
  children: ReactNode;
  partRegistry: PartRegistry;
}) {
  const facade = usePlannerController(partRegistry);
  return (
    <PartRegistryContext.Provider value={partRegistry}>
      <PlannerContext.Provider value={facade}>
        {children}
      </PlannerContext.Provider>
    </PartRegistryContext.Provider>
  );
}

export function usePlanner() {
  const facade = useContext(PlannerContext);
  if (!facade) {
    throw new Error("usePlanner must be used inside PlannerProvider");
  }
  return facade;
}

export function usePartRegistry() {
  const registry = useContext(PartRegistryContext);
  if (!registry) {
    throw new Error("usePartRegistry must be used inside PlannerProvider");
  }
  return registry;
}

export type { PlannerFacade } from "./use-planner-controller";

