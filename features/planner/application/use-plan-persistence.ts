"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { validatePlanFile } from "@/lib/planner.mjs";

import { AUTOSAVE_KEY } from "../model/catalog";
import type {
  CableRoute,
  PlanFile,
  PlannerItem,
  SystemId,
} from "../model/types";

type PlanPersistenceOptions = {
  planName: string;
  system: SystemId;
  desk: { width: number; depth: number };
  items: PlannerItem[];
  routes: CableRoute[];
  restorePlan: (plan: PlanFile) => void;
  checkpointHistory: () => void;
  initializeTrace: (event: string) => void;
  showToast: (message: string) => void;
  emitLog: (
    event: string,
    details?: Record<string, unknown>,
    level?: "info" | "warn",
  ) => void;
};

/** Owns the browser-storage and portable-file boundary for a plan. */
export function usePlanPersistence(options: PlanPersistenceOptions) {
  const [readyToSave, setReadyToSave] = useState(false);
  const [savedAt, setSavedAt] = useState("");
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const current = optionsRef.current;
      const saved = window.localStorage.getItem(AUTOSAVE_KEY);
      if (saved) {
        try {
          const result = validatePlanFile(JSON.parse(saved)) as {
            ok: boolean;
            plan?: PlanFile;
          };
          if (result.ok && result.plan) {
            current.restorePlan(result.plan);
            setSavedAt(result.plan.savedAt ?? "restored");
          }
        } catch {
          window.localStorage.removeItem(AUTOSAVE_KEY);
        }
      }

      current.initializeTrace(saved ? "plan.autosave_restored" : "plan.started");
      setReadyToSave(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!readyToSave) return;
    const timeout = window.setTimeout(() => {
      const current = optionsRef.current;
      const timestamp = new Date().toISOString();
      const plan: PlanFile = {
        version: 1,
        name: current.planName,
        system: current.system,
        desk: current.desk,
        items: current.items,
        routes: current.routes,
        savedAt: timestamp,
      };
      window.localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(plan));
      setSavedAt(timestamp);
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [
    readyToSave,
    options.desk,
    options.items,
    options.planName,
    options.routes,
    options.system,
  ]);

  function exportPlan() {
    const current = optionsRef.current;
    const plan: PlanFile = {
      version: 1,
      name: current.planName,
      system: current.system,
      desk: current.desk,
      items: current.items,
      routes: current.routes,
      savedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(plan, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${current.planName
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "-")}.underware-plan.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    current.showToast("Plan exported");
    current.emitLog("plan.exported", {
      items: current.items.length,
      routes: current.routes.length,
    });
  }

  async function importPlan(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const current = optionsRef.current;
    try {
      const result = validatePlanFile(JSON.parse(await file.text())) as {
        ok: boolean;
        reason?: string;
        plan?: PlanFile;
      };
      if (!result.ok || !result.plan) throw new Error(result.reason);
      current.checkpointHistory();
      current.restorePlan(result.plan);
      current.showToast("Plan imported");
      current.emitLog("plan.imported", {
        fileName: file.name,
        items: result.plan.items.length,
        routes: result.plan.routes.length,
      });
    } catch {
      current.showToast("That file is not a valid Route Lab plan");
      current.emitLog("plan.import_failed", { fileName: file.name }, "warn");
    } finally {
      event.target.value = "";
    }
  }

  return { savedAt, exportPlan, importPlan };
}
