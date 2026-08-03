"use client";

import { useRef, useState } from "react";

import type { PlanSnapshot } from "../model/types";

type PlanHistoryOptions = {
  snapshot: PlanSnapshot;
  restoreSnapshot: (snapshot: PlanSnapshot) => void;
  emitLog: (event: string) => void;
};

/**
 * Keeps undo/redo mechanics separate from planner mutations. Callers only
 * checkpoint before a domain action and never manipulate history stacks.
 */
export function usePlanHistory({
  snapshot,
  restoreSnapshot,
  emitLog,
}: PlanHistoryOptions) {
  const pastRef = useRef<PlanSnapshot[]>([]);
  const futureRef = useRef<PlanSnapshot[]>([]);
  const [historyState, setHistoryState] = useState({ undo: 0, redo: 0 });

  function cloneSnapshot(value: PlanSnapshot) {
    return structuredClone(value);
  }

  function checkpointHistory() {
    pastRef.current.push(cloneSnapshot(snapshot));
    if (pastRef.current.length > 50) pastRef.current.shift();
    futureRef.current = [];
    setHistoryState({ undo: pastRef.current.length, redo: 0 });
  }

  function undoPlan() {
    const previous = pastRef.current.pop();
    if (!previous) return;
    futureRef.current.push(cloneSnapshot(snapshot));
    restoreSnapshot(previous);
    setHistoryState({
      undo: pastRef.current.length,
      redo: futureRef.current.length,
    });
    emitLog("plan.undo");
  }

  function redoPlan() {
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current.push(cloneSnapshot(snapshot));
    restoreSnapshot(next);
    setHistoryState({
      undo: pastRef.current.length,
      redo: futureRef.current.length,
    });
    emitLog("plan.redo");
  }

  return { historyState, checkpointHistory, undoPlan, redoPlan };
}
