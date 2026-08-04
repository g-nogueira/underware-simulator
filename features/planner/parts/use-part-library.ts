"use client";

import { useEffect, useMemo, useState } from "react";
import {
  hashPartManifest,
  validatePartManifest,
  type PartManifest,
} from "@/lib/part-manifest.mjs";

import type { PlannerItem } from "../model/types";
import { BUILT_IN_PARTS } from "./built-in-parts";
import type {
  InstalledPartManifest,
  PartDefinition,
  PartLibrary,
  PartLibraryInstallResult,
} from "./contracts";
import { createManifestPartDefinition } from "./manifest-part-definition";
import { createPartRegistry } from "./part-registry";

const PART_LIBRARY_STORAGE_KEY = "underware.part-library.v1";
const MAX_INSTALLED_MANIFESTS = 100;
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;

type StoredPartLibrary = {
  version: 1;
  entries: InstalledPartManifest[];
};

function expectedFootprint(item: PlannerItem, manifest: PartManifest) {
  const quarterTurn = item.rotation % 180 !== 0;
  return quarterTurn
    ? { width: manifest.physical.sizeMm.y, height: manifest.physical.sizeMm.x }
    : { width: manifest.physical.sizeMm.x, height: manifest.physical.sizeMm.y };
}

function almostEqual(left: number, right: number) {
  return Math.abs(left - right) <= 0.01;
}

async function verifiedEntry(
  value: unknown,
): Promise<InstalledPartManifest | null> {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<InstalledPartManifest>;
  if (
    typeof candidate.hash !== "string" ||
    !HASH_PATTERN.test(candidate.hash) ||
    typeof candidate.installedAt !== "string"
  ) {
    return null;
  }
  const validation = validatePartManifest(candidate.manifest);
  if (!validation.ok) return null;
  const calculatedHash = await hashPartManifest(validation.manifest);
  return calculatedHash === candidate.hash
    ? {
        hash: candidate.hash as `sha256:${string}`,
        manifest: validation.manifest,
        installedAt: candidate.installedAt,
      }
    : null;
}

function latestEntries(entries: readonly InstalledPartManifest[]) {
  const latestById = new Map<string, InstalledPartManifest>();
  for (const entry of entries) {
    const current = latestById.get(entry.manifest.id);
    if (!current || current.installedAt <= entry.installedAt) {
      latestById.set(entry.manifest.id, entry);
    }
  }
  return [...latestById.values()].sort((left, right) =>
    left.manifest.metadata.name.localeCompare(right.manifest.metadata.name),
  );
}

export function usePartLibrary(): PartLibrary {
  const [ready, setReady] = useState(false);
  const [runtimeEntries, setRuntimeEntries] = useState<
    InstalledPartManifest[]
  >([]);
  const [planEntries, setPlanEntries] = useState<InstalledPartManifest[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      let entries: unknown[] = [];
      try {
        const raw = window.localStorage.getItem(PART_LIBRARY_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<StoredPartLibrary>;
          if (parsed.version === 1 && Array.isArray(parsed.entries)) {
            entries = parsed.entries.slice(-MAX_INSTALLED_MANIFESTS);
          }
        }
      } catch {
        entries = [];
      }
      const verified = (
        await Promise.all(entries.map((entry) => verifiedEntry(entry)))
      ).filter((entry): entry is InstalledPartManifest => entry !== null);
      if (!cancelled) {
        setRuntimeEntries(verified);
        setReady(true);
      }
    }
    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      const stored: StoredPartLibrary = {
        version: 1,
        entries: runtimeEntries.slice(-MAX_INSTALLED_MANIFESTS),
      };
      window.localStorage.setItem(
        PART_LIBRARY_STORAGE_KEY,
        JSON.stringify(stored),
      );
    } catch {
      // The installed part remains usable for this session when storage is unavailable.
    }
  }, [ready, runtimeEntries]);

  const registry = useMemo(() => {
    const definitions: PartDefinition[] = [...BUILT_IN_PARTS];
    const knownHashes = new Set(
      BUILT_IN_PARTS.flatMap((definition) =>
        definition.manifest
          ? [definition.manifest.definitionHash]
          : [],
      ),
    );

    const latestHashById = new Map(
      latestEntries(runtimeEntries).map((entry) => [
        entry.manifest.id,
        entry.hash,
      ]),
    );
    for (const entry of runtimeEntries) {
      if (knownHashes.has(entry.hash)) continue;
      knownHashes.add(entry.hash);
      definitions.push(
        createManifestPartDefinition({
          manifest: entry.manifest,
          definitionHash: entry.hash,
          origin: "runtime",
          catalogVisible:
            latestHashById.get(entry.manifest.id) === entry.hash,
        }),
      );
    }

    for (const entry of planEntries) {
      if (knownHashes.has(entry.hash)) continue;
      knownHashes.add(entry.hash);
      definitions.push(
        createManifestPartDefinition({
          manifest: entry.manifest,
          definitionHash: entry.hash,
          origin: "plan",
          catalogVisible: false,
        }),
      );
    }

    return createPartRegistry(definitions);
  }, [planEntries, runtimeEntries]);

  async function installManifest(
    value: unknown,
  ): Promise<PartLibraryInstallResult> {
    const validation = validatePartManifest(value);
    if (!validation.ok) return validation;
    const hash = await hashPartManifest(validation.manifest);
    const reserved = registry.get(validation.manifest.id);
    if (
      reserved?.manifest?.origin === "build-time" &&
      reserved.manifest.definitionHash === hash
    ) {
      return {
        ok: true,
        hash,
        manifest: validation.manifest,
        warnings: validation.warnings,
        alreadyInstalled: true,
      };
    }
    if (
      reserved &&
      (!reserved.manifest || reserved.manifest.origin === "build-time")
    ) {
      return {
        ok: false,
        issues: [
          {
            path: "id",
            code: "reserved_id",
            message: "This ID belongs to a release-provided part; use a unique ID",
          },
        ],
        warnings: validation.warnings,
      };
    }
    const alreadyInstalled = runtimeEntries.some(
      (entry) => entry.hash === hash,
    );
    if (!alreadyInstalled) {
      setRuntimeEntries((current) => [
        ...current,
        {
          hash,
          manifest: validation.manifest,
          installedAt: new Date().toISOString(),
        },
      ]);
    }
    return {
      ok: true,
      hash,
      manifest: validation.manifest,
      warnings: validation.warnings,
      alreadyInstalled,
    };
  }

  async function preparePlanDefinitions(plan: {
    version: 1 | 2;
    items: readonly PlannerItem[];
    partDefinitions?: Record<string, unknown>;
  }) {
    if (plan.version === 1) {
      setPlanEntries([]);
      return { ok: true as const };
    }

    const definitions = plan.partDefinitions;
    if (!definitions || typeof definitions !== "object") {
      return { ok: false as const, reason: "Plan is missing its part definitions" };
    }
    const pairs = Object.entries(definitions);
    if (pairs.length > MAX_INSTALLED_MANIFESTS) {
      return { ok: false as const, reason: "Plan contains too many part definitions" };
    }

    const prepared: InstalledPartManifest[] = [];
    for (const [hash, value] of pairs) {
      if (!HASH_PATTERN.test(hash)) {
        return { ok: false as const, reason: "Plan contains an invalid part-definition hash" };
      }
      const validation = validatePartManifest(value);
      if (!validation.ok) {
        return {
          ok: false as const,
          reason: `Invalid part definition ${hash}: ${validation.issues[0]?.message ?? "unknown error"}`,
        };
      }
      if ((await hashPartManifest(validation.manifest)) !== hash) {
        return { ok: false as const, reason: "A part definition does not match its SHA-256 hash" };
      }
      prepared.push({
        hash: hash as `sha256:${string}`,
        manifest: validation.manifest,
        installedAt: new Date(0).toISOString(),
      });
    }

    const byHash = new Map(prepared.map((entry) => [entry.hash, entry.manifest]));
    for (const item of plan.items) {
      if (!item.partDefinition) continue;
      const manifest = byHash.get(item.partDefinition);
      if (!manifest) {
        return { ok: false as const, reason: `${item.name} is missing its pinned part definition` };
      }
      if (item.catalogId !== manifest.id) {
        return { ok: false as const, reason: `${item.name} does not match its part definition` };
      }
      if (!manifest.placement.allowedRotations.includes(item.rotation)) {
        return { ok: false as const, reason: `${item.name} uses a disallowed rotation` };
      }
      const expected = expectedFootprint(item, manifest);
      if (
        !almostEqual(item.width, expected.width) ||
        !almostEqual(item.height, expected.height)
      ) {
        return {
          ok: false as const,
          reason: `${item.name} no longer matches its exact printable dimensions`,
        };
      }
    }

    setPlanEntries(prepared);
    return { ok: true as const };
  }

  return {
    ready,
    registry,
    installedManifests: latestEntries(runtimeEntries),
    installManifest,
    preparePlanDefinitions,
  };
}
