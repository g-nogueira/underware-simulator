"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";

import exampleManifest from "@/spikes/json-parts/examples/straight-channel.part.json";
import {
  validatePartManifest,
  type PartManifestIssue,
} from "@/lib/part-manifest.mjs";

const EXAMPLE_TEXT = JSON.stringify(exampleManifest, null, 2);

type ParsedManifest = typeof exampleManifest;

function parseManifest(text: string) {
  try {
    const value: unknown = JSON.parse(text);
    const validation = validatePartManifest(value);
    return validation.ok
      ? { value: validation.manifest as ParsedManifest, validation }
      : { value: null, validation };
  } catch (error) {
    return {
      value: null,
      validation: {
        ok: false as const,
        issues: [
          {
            path: "$",
            code: "invalid_json",
            message: error instanceof Error ? error.message : "Invalid JSON",
          },
        ],
        warnings: [],
      },
    };
  }
}

function IssueList({
  title,
  issues,
  tone,
}: {
  title: string;
  issues: PartManifestIssue[];
  tone: "error" | "warning";
}) {
  if (!issues.length) return null;
  return (
    <section className={`manifest-messages ${tone}`} aria-label={title}>
      <strong>{title}</strong>
      <ul>
        {issues.map((entry, index) => (
          <li key={`${entry.path}:${entry.code}:${index}`}>
            <code>{entry.path}</code>
            <span>{entry.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function JsonPartsSpikePage() {
  const [text, setText] = useState(EXAMPLE_TEXT);
  const fileInput = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => parseManifest(text), [text]);
  const manifest = parsed.value;
  const previewUrl = manifest
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(manifest.visual.svg)}`
    : "";

  function formatJson() {
    try {
      setText(JSON.stringify(JSON.parse(text), null, 2));
    } catch {
      // The validation panel already exposes the parse error without replacing the draft.
    }
  }

  async function importManifest(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setText(await file.text());
    event.target.value = "";
  }

  return (
    <main className="manifest-spike-page">
      <header className="manifest-spike-header">
        <div>
          <span className="manifest-kicker">Manifest contract · v1alpha1</span>
          <h1>JSON part manifest laboratory</h1>
          <p>
            Edit a self-contained part definition and verify its physical size,
            grid contract, print output, and SVG before it reaches the planner.
          </p>
        </div>
        <Link href="/">Back to planner</Link>
      </header>

      <section className="manifest-spike-notice">
        <strong>The production importer is now available under + Parts</strong>
        <span>
          This isolated route remains a validation laboratory. Use Import JSON /
          advanced mode in the planner to install a manifest on this device.
        </span>
      </section>

      <div className="manifest-lab-grid">
        <section className="manifest-editor-panel" aria-label="Manifest editor">
          <div className="manifest-panel-heading">
            <div>
              <span>Advanced mode</span>
              <strong>Part JSON</strong>
            </div>
            <div className="manifest-editor-actions">
              <input
                ref={fileInput}
                className="sr-only"
                type="file"
                accept="application/json,.json"
                onChange={importManifest}
                aria-label="Import part JSON"
              />
              <button type="button" onClick={() => fileInput.current?.click()}>
                Import JSON
              </button>
              <button type="button" onClick={formatJson}>
                Format
              </button>
              <button type="button" onClick={() => setText(EXAMPLE_TEXT)}>
                Reset example
              </button>
            </div>
          </div>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            spellCheck={false}
            aria-label="Part manifest JSON"
          />
          <footer className={parsed.validation.ok ? "valid" : "invalid"}>
            <i aria-hidden="true" />
            {parsed.validation.ok
              ? "Structurally and dimensionally valid"
              : `${parsed.validation.issues.length} blocking issue${
                  parsed.validation.issues.length === 1 ? "" : "s"
                }`}
          </footer>
        </section>

        <aside className="manifest-preview-panel" aria-label="Part preview">
          {manifest ? (
            <>
              <div className="manifest-panel-heading">
                <div>
                  <span>1:1 contract</span>
                  <strong>{manifest.metadata.name}</strong>
                </div>
                <span className="manifest-version">v{manifest.version}</span>
              </div>
              <div className="manifest-svg-preview">
                {/* SVG is isolated as an image; it is never inserted into the DOM. */}
                {/* eslint-disable-next-line @next/next/no-img-element -- data SVG must remain an inert browser image, not an optimized remote asset. */}
                <img src={previewUrl} alt={`${manifest.metadata.name} top view`} />
                <span className="dimension dimension-width">
                  {manifest.physical.sizeMm.x.toFixed(2)} mm
                </span>
                <span className="dimension dimension-depth">
                  {manifest.physical.sizeMm.y.toFixed(2)} mm
                </span>
              </div>
              <dl className="manifest-facts">
                <div>
                  <dt>Printable size</dt>
                  <dd>
                    {manifest.physical.sizeMm.x.toFixed(2)} ×{" "}
                    {manifest.physical.sizeMm.y.toFixed(2)} ×{" "}
                    {manifest.physical.sizeMm.z.toFixed(2)} mm
                  </dd>
                </div>
                <div>
                  <dt>Mounting</dt>
                  <dd>{manifest.mounting.map((entry) => entry.system).join(", ")}</dd>
                </div>
                <div>
                  <dt>Planner resizing</dt>
                  <dd>Locked to printed dimensions</dd>
                </div>
                <div>
                  <dt>Print output</dt>
                  <dd>
                    {manifest.print.components.reduce(
                      (sum, component) => sum + component.quantity,
                      0,
                    )}{" "}
                    component
                  </dd>
                </div>
              </dl>
              <a
                className="manifest-source-link"
                href={manifest.metadata.source.url}
                target="_blank"
                rel="noreferrer"
              >
                Open source model page ↗
              </a>
            </>
          ) : (
            <div className="manifest-empty-preview">
              <span aria-hidden="true">◇</span>
              <strong>Preview paused</strong>
              <p>Fix the blocking JSON or dimensional issues to render the part.</p>
            </div>
          )}

          <IssueList
            title="Blocking issues"
            issues={parsed.validation.issues}
            tone="error"
          />
          <IssueList
            title="Warnings"
            issues={parsed.validation.warnings}
            tone="warning"
          />
        </aside>
      </div>

      <section className="manifest-guardrails" aria-label="Spike guardrails">
        <article>
          <span>01</span>
          <strong>Millimetres are authoritative</strong>
          <p>
            The SVG viewBox must match the physical X/Y footprint. There is no
            independent scale setting that can silently distort a print.
          </p>
        </article>
        <article>
          <span>02</span>
          <strong>SVG is inert content</strong>
          <p>
            Scripts, links, external resources, style attributes, and unknown
            elements are rejected; valid markup is rendered as an image.
          </p>
        </article>
        <article>
          <span>03</span>
          <strong>Capabilities stay finite</strong>
          <p>
            JSON selects whitelisted renderer, sizing, capacity, and print
            behaviours. It cannot execute code or name arbitrary modules.
          </p>
        </article>
      </section>
    </main>
  );
}
