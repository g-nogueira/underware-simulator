"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";

import type { PartLibrary, PartRegistry } from "../parts/contracts";
import {
  usePlannerController,
  type PlannerFacade,
} from "./use-planner-controller";

const PlannerContext = createContext<PlannerFacade | null>(null);
const PartRegistryContext = createContext<PartRegistry | null>(null);
const PartLibraryContext = createContext<PartLibrary | null>(null);

export function PlannerProvider({
  children,
  partLibrary,
}: {
  children: ReactNode;
  partLibrary: PartLibrary;
}) {
  const facade = usePlannerController(partLibrary);
  return (
    <PartLibraryContext.Provider value={partLibrary}>
      <PartRegistryContext.Provider value={partLibrary.registry}>
        <PlannerContext.Provider value={facade}>
          {children}
        </PlannerContext.Provider>
      </PartRegistryContext.Provider>
    </PartLibraryContext.Provider>
  );
}

export function usePartLibrary() {
  const library = useContext(PartLibraryContext);
  if (!library) {
    throw new Error("usePartLibrary must be used inside PlannerProvider");
  }
  return library;
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

