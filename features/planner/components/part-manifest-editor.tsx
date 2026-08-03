"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  validatePartManifest,
  type PartManifest,
  type PartManifestIssue,
} from "@/lib/part-manifest.mjs";

import { usePartLibrary } from "../application/planner-provider";
import { BUILD_TIME_MANIFESTS } from "../parts/build-time-manifests";
import { useDialogFocus } from "./use-dialog-focus";

const EXAMPLE_TEXT = JSON.stringify(BUILD_TIME_MANIFESTS[0].manifest, null, 2);
const MAX_MANIFEST_FILE_BYTES = 500_000;

type ParsedDraft = {
  manifest: PartManifest | null;
  issues: PartManifestIssue[];
  warnings: PartManifestIssue[];
};

function parseDraft(text: string): ParsedDraft {
  try {
    const validation = validatePartManifest(JSON.parse(text));
    return validation.ok
      ? {
          manifest: validation.manifest,
          issues: [],
          warnings: validation.warnings,
        }
      : {
          manifest: null,
          issues: validation.issues,
          warnings: validation.warnings,
        };
  } catch (error) {
    return {
      manifest: null,
      issues: [
        {
          path: "$",
          code: "invalid_json",
          message: error instanceof Error ? error.message : "Invalid JSON",
        },
      ],
      warnings: [],
    };
  }
}

function Messages({
  title,
  entries,
  tone,
}: {
  title: string;
  entries: readonly PartManifestIssue[];
  tone: "error" | "warning";
}) {
  if (!entries.length) return null;
  return (
    <section className={`manifest-messages ${tone}`} aria-label={title}>
      <strong>{title}</strong>
      <ul>
        {entries.map((entry, index) => (
          <li key={`${entry.path}:${entry.code}:${index}`}>
            <code>{entry.path}</code>
            <span>{entry.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PartManifestEditor({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const library = usePartLibrary();
  const [text, setText] = useState(EXAMPLE_TEXT);
  const [status, setStatus] = useState("");
  const [selectedInstalledHash, setSelectedInstalledHash] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const svgInput = useRef<HTMLInputElement>(null);
  const dialogRef = useDialogFocus(open, onClose);
  const parsed = useMemo(() => parseDraft(text), [text]);
  const manifest = parsed.manifest;
  const previewUrl = manifest
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(manifest.visual.svg)}`
    : "";

  if (!open) return null;

  function formatJson() {
    try {
      setText(JSON.stringify(JSON.parse(text), null, 2));
      setStatus("");
    } catch {
      setStatus("Fix the JSON syntax before formatting.");
    }
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > MAX_MANIFEST_FILE_BYTES) {
        throw new Error("Part JSON must be 500 KB or smaller");
      }
      setText(await file.text());
      setSelectedInstalledHash("");
      setStatus(`Loaded ${file.name}; review it before installing.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to read that file");
    } finally {
      event.target.value = "";
    }
  }

  async function importSvg(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 120_000) {
        throw new Error("SVG must be 120 KB or smaller");
      }
      const svg = await file.text();
      const draft = JSON.parse(text) as Record<string, unknown>;
      const viewBoxMatch = svg.match(
        /<svg\b[^>]*\bviewBox\s*=\s*["']([^"']+)["']/i,
      );
      const viewBox = viewBoxMatch?.[1]
        .trim()
        .split(/[\s,]+/)
        .map(Number);
      draft.visual = {
        ...((draft.visual as Record<string, unknown> | undefined) ?? {}),
        type: "svg",
        coordinateSpace: "physical-mm",
        ...(viewBox?.length === 4 && viewBox.every(Number.isFinite)
          ? { viewBoxMm: viewBox }
          : {}),
        svg,
      };
      setText(JSON.stringify(draft, null, 2));
      setStatus(
        `Loaded ${file.name}. Its SVG viewBox must still match physical.sizeMm X/Y.`,
      );
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Unable to add that SVG to the current JSON",
      );
    } finally {
      event.target.value = "";
    }
  }

  function loadInstalled(hash: string) {
    setSelectedInstalledHash(hash);
    const entry = library.installedManifests.find(
      (candidate) => candidate.hash === hash,
    );
    if (!entry) return;
    setText(JSON.stringify(entry.manifest, null, 2));
    setStatus(
      "Editing creates a new immutable revision; placed copies keep the old one.",
    );
  }

  function exportDraft() {
    if (!manifest) return;
    const blob = new Blob([JSON.stringify(manifest, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${manifest.id}.part.json`;
    document.body.append(anchor);
    try {
      anchor.click();
    } finally {
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  }

  async function installDraft() {
    if (!manifest) return;
    setStatus("Validating and hashing this revision…");
    try {
      const result = await library.installManifest(manifest);
      if (!result.ok) {
        setStatus(result.issues[0]?.message ?? "The manifest is not valid");
        return;
      }
      setSelectedInstalledHash(result.hash);
      setStatus(
        result.alreadyInstalled
          ? "This exact revision is already installed."
          : `Installed ${result.manifest.metadata.name}. It is now available in + Parts.`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to install this part");
    }
  }

  const componentCount =
    manifest?.print.components.reduce(
      (total, component) => total + component.quantity,
      0,
    ) ?? 0;

  return (
    <div
      className="drawer-backdrop modal-backdrop part-manifest-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        ref={dialogRef}
        className="part-manifest-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="part-manifest-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="eyebrow">Advanced mode · data-only parts</span>
            <h2 id="part-manifest-title">Import or edit a part manifest</h2>
            <p>
              One planner millimetre equals one real millimetre. Installation is
              blocked unless the physical footprint, SVG, mounting anchors, and
              print components agree.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close part editor">
            ×
          </button>
        </header>

        <div className="part-manifest-library-row">
          <label>
            <span>Edit an installed part</span>
            <select
              value={selectedInstalledHash}
              onChange={(event) => loadInstalled(event.target.value)}
            >
              <option value="">New manifest / example</option>
              {library.installedManifests.map((entry) => (
                <option key={entry.hash} value={entry.hash}>
                  {entry.manifest.metadata.name} · v{entry.manifest.version}
                </option>
              ))}
            </select>
          </label>
          <span>Stored on this device; exported plans embed referenced revisions.</span>
        </div>

        <div className="manifest-lab-grid part-manifest-grid">
          <section className="manifest-editor-panel" aria-label="Part JSON editor">
            <div className="manifest-panel-heading">
              <div>
                <span>Live JSON</span>
                <strong>{manifest?.metadata.name ?? "Invalid draft"}</strong>
              </div>
              <div className="manifest-editor-actions">
                <input
                  ref={fileInput}
                  className="sr-only"
                  type="file"
                  accept="application/json,.json,.part.json"
                  onChange={importFile}
                  aria-label="Import part JSON"
                />
                <input
                  ref={svgInput}
                  className="sr-only"
                  type="file"
                  accept="image/svg+xml,.svg"
                  onChange={importSvg}
                  aria-label="Import SVG into part JSON"
                />
                <button type="button" onClick={() => fileInput.current?.click()}>
                  Import JSON
                </button>
                <button type="button" onClick={() => svgInput.current?.click()}>
                  Import SVG
                </button>
                <button type="button" onClick={formatJson}>
                  Format
                </button>
                <button type="button" onClick={exportDraft} disabled={!manifest}>
                  Export
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setText(EXAMPLE_TEXT);
                    setSelectedInstalledHash("");
                    setStatus("Example restored.");
                  }}
                >
                  Example
                </button>
              </div>
            </div>
            <textarea
              data-dialog-initial-focus
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                setStatus("");
              }}
              spellCheck={false}
              aria-label="Part manifest JSON"
            />
            <footer className={manifest ? "valid" : "invalid"}>
              <i aria-hidden="true" />
              {manifest
                ? "Structurally, physically, and visually valid"
                : `${parsed.issues.length} blocking issue${
                    parsed.issues.length === 1 ? "" : "s"
                  }`}
            </footer>
          </section>

          <aside className="manifest-preview-panel" aria-label="Part preview">
            {manifest ? (
              <>
                <div className="manifest-panel-heading">
                  <div>
                    <span>Physical preview</span>
                    <strong>{manifest.metadata.name}</strong>
                  </div>
                  <span className="manifest-version">v{manifest.version}</span>
                </div>
                <div className="manifest-svg-preview">
                  {/* eslint-disable-next-line @next/next/no-img-element -- accepted SVG stays inside an inert image boundary. */}
                  <img src={previewUrl} alt={`${manifest.metadata.name} top view`} />
                  <span className="dimension dimension-width">
                    {manifest.physical.sizeMm.x} mm
                  </span>
                  <span className="dimension dimension-depth">
                    {manifest.physical.sizeMm.y} mm
                  </span>
                </div>
                <dl className="manifest-facts">
                  <div>
                    <dt>Real-world size</dt>
                    <dd>
                      {manifest.physical.sizeMm.x} × {manifest.physical.sizeMm.y} ×{" "}
                      {manifest.physical.sizeMm.z} mm
                    </dd>
                  </div>
                  <div>
                    <dt>Print output</dt>
                    <dd>
                      {componentCount} {componentCount === 1 ? "component" : "components"}
                    </dd>
                  </div>
                  <div>
                    <dt>Mounting</dt>
                    <dd>{manifest.mounting.map((entry) => entry.system).join(", ")}</dd>
                  </div>
                  <div>
                    <dt>Planner scaling</dt>
                    <dd>Fixed · never silently scaled</dd>
                  </div>
                </dl>
              </>
            ) : (
              <div className="manifest-empty-preview">
                <span aria-hidden="true">◇</span>
                <strong>Preview blocked</strong>
                <p>Fix every blocking issue before this part can be installed.</p>
              </div>
            )}

            <Messages title="Blocking issues" entries={parsed.issues} tone="error" />
            <Messages title="Warnings" entries={parsed.warnings} tone="warning" />
          </aside>
        </div>

        <footer className="part-manifest-actions">
          <span role="status">{status}</span>
          <div>
            <button type="button" onClick={onClose}>
              Close
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => void installDraft()}
              disabled={!manifest}
            >
              Install immutable revision
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
