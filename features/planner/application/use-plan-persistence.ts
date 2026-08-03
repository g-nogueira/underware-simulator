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
  enabled: boolean;
  planName: string;
  system: SystemId;
  desk: { width: number; depth: number };
  items: PlannerItem[];
  routes: CableRoute[];
  getPartDefinitions: () => Record<string, unknown>;
  preparePlanDefinitions: (
    plan: PlanFile,
  ) => Promise<{ ok: true } | { ok: false; reason: string }>;
  restorePlan: (plan: PlanFile) => void;
  checkpointHistory: () => void;
  initializeTrace: (
    event: "plan.started" | "plan.autosave_restored",
  ) => void;
  showToast: (message: string) => void;
  emitLog: (
    event: string,
    details?: Record<string, unknown>,
    level?: "info" | "warn",
  ) => void;
};

type StorageAttempt<T> =
  | { ok: true; value: T }
  | { ok: false; error: unknown };

function attemptStorage<T>(operation: () => T): StorageAttempt<T> {
  try {
    return { ok: true, value: operation() };
  } catch (error) {
    return { ok: false, error };
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "unknown";
}

function currentPlan(
  options: PlanPersistenceOptions,
  savedAt: string,
): PlanFile {
  return {
    version: 2,
    name: options.planName,
    system: options.system,
    desk: options.desk,
    items: options.items,
    routes: options.routes,
    partDefinitions: options.getPartDefinitions(),
    savedAt,
  };
}

/** Owns the browser-storage and portable-file boundary for a plan. */
export function usePlanPersistence(options: PlanPersistenceOptions) {
  const [readyToSave, setReadyToSave] = useState(false);
  const [savedAt, setSavedAt] = useState("");
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    if (!options.enabled) return;
    let cancelled = false;
    const frame = window.requestAnimationFrame(() => {
      void (async () => {
        const current = optionsRef.current;
        const saved = attemptStorage(() =>
          window.localStorage.getItem(AUTOSAVE_KEY),
        );
        let restored = false;
        let removalFailure: unknown;
        if (saved.ok && saved.value) {
          try {
            const result = validatePlanFile(JSON.parse(saved.value)) as {
              ok: boolean;
              reason?: string;
              plan?: PlanFile;
            };
            const prepared =
              result.ok && result.plan
                ? await current.preparePlanDefinitions(result.plan)
                : {
                    ok: false as const,
                    reason: result.reason ?? "Invalid plan",
                  };
            if (!cancelled && result.ok && result.plan && prepared.ok) {
              current.restorePlan(result.plan);
              setSavedAt(result.plan.savedAt ?? "restored");
              restored = true;
            }
            if (!prepared.ok) {
              const removed = attemptStorage(() =>
                window.localStorage.removeItem(AUTOSAVE_KEY),
              );
              if (!removed.ok) removalFailure = removed.error;
            }
          } catch {
            const removed = attemptStorage(() =>
              window.localStorage.removeItem(AUTOSAVE_KEY),
            );
            if (!removed.ok) removalFailure = removed.error;
          }
        }

        if (cancelled) return;
        current.initializeTrace(
          restored ? "plan.autosave_restored" : "plan.started",
        );
        if (!saved.ok) {
          current.emitLog(
            "plan.autosave_read_failed",
            { reason: errorMessage(saved.error) },
            "warn",
          );
        } else if (removalFailure) {
          current.emitLog(
            "plan.autosave_cleanup_failed",
            { reason: errorMessage(removalFailure) },
            "warn",
          );
        }
        setReadyToSave(true);
      })();
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [options.enabled]);

  useEffect(() => {
    if (!readyToSave) return;
    const timeout = window.setTimeout(() => {
      const current = optionsRef.current;
      const timestamp = new Date().toISOString();
      const plan = currentPlan(current, timestamp);
      const saved = attemptStorage(() =>
        window.localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(plan)),
      );
      if (!saved.ok) {
        current.emitLog(
          "plan.autosave_failed",
          { reason: errorMessage(saved.error) },
          "warn",
        );
        return;
      }
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
    const plan = currentPlan(current, new Date().toISOString());
    const blob = new Blob([JSON.stringify(plan, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${current.planName
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "-")}.underware-plan.json`;
    document.body.append(anchor);
    try {
      anchor.click();
    } finally {
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    }
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
      const prepared = await current.preparePlanDefinitions(result.plan);
      if (!prepared.ok) throw new Error(prepared.reason);
      current.checkpointHistory();
      current.restorePlan(result.plan);
      current.showToast("Plan imported");
      current.emitLog("plan.imported", {
        fileName: file.name,
        items: result.plan.items.length,
        routes: result.plan.routes.length,
      });
    } catch (error) {
      current.showToast("That file is not a valid Route Lab plan");
      current.emitLog(
        "plan.import_failed",
        { fileName: file.name, reason: errorMessage(error) },
        "warn",
      );
    } finally {
      event.target.value = "";
    }
  }

  return { savedAt, exportPlan, importPlan };
}
