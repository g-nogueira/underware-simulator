"use client";

import { useCallback, useRef, useState } from "react";

import type { SystemId, TraceEvent } from "../model/types";

type TracePlanSummary = {
  name: string;
  system: SystemId;
  desk: { width: number; depth: number };
};

function makeTraceId() {
  return (
    window.crypto?.randomUUID?.() ??
    "trace-" + Date.now() + "-" + Math.random().toString(16).slice(2)
  );
}

function downloadJson(fileName: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/**
 * Facade for local observability. The editor emits named events without
 * depending on trace storage, correlation IDs, console formatting, or export.
 */
export function usePlannerTrace() {
  const [traceId, setTraceId] = useState("starting");
  const [traceEvents, setTraceEvents] = useState<TraceEvent[]>([]);
  const [toast, setToast] = useState("");
  const traceIdRef = useRef("starting");

  const initializeTrace = useCallback(function initializeTrace(
    event: "plan.started" | "plan.autosave_restored",
  ) {
    const nextTraceId = makeTraceId();
    traceIdRef.current = nextTraceId;
    setTraceId(nextTraceId);
    setTraceEvents([
      {
        timestamp: new Date().toISOString(),
        level: "info",
        event,
        traceId: nextTraceId,
      },
    ]);
  }, []);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  }

  function emitLog(
    event: string,
    details?: Record<string, unknown>,
    level: TraceEvent["level"] = "info",
  ) {
    const entry: TraceEvent = {
      timestamp: new Date().toISOString(),
      level,
      event,
      traceId: traceIdRef.current,
      ...(details ? { details } : {}),
    };
    setTraceEvents((current) => [...current.slice(-79), entry]);
    console.info("[route-lab] " + JSON.stringify(entry));
  }

  function exportTrace(plan: TracePlanSummary) {
    downloadJson("route-lab-trace-" + traceId.slice(0, 8) + ".json", {
      traceId,
      exportedAt: new Date().toISOString(),
      plan,
      events: traceEvents,
    });
    showToast("Troubleshooting log exported");
  }

  return {
    traceId,
    traceEvents,
    toast,
    initializeTrace,
    showToast,
    emitLog,
    exportTrace,
  };
}

