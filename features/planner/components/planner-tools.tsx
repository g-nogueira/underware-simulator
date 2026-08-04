"use client";

import { useState } from "react";

import { TOOLS } from "../model/catalog";
import { usePlanner } from "../application/planner-provider";
import { PartManifestEditor } from "./part-manifest-editor";

export function PlannerTools() {
  const [manifestEditorOpen, setManifestEditorOpen] = useState(false);
  const {
    partCatalog,
    activeTool,
    catalogOpen,
    closeCatalog,
    selectTool,
    canAddCatalogItem,
    addCatalogItem,
  } = usePlanner();
  const categories = [...new Set(partCatalog.map((part) => part.category))];

  return (
    <>
      <aside className="toolrail" aria-label="Planner tools">
        {TOOLS.map((tool) => (
          <button
            type="button"
            key={tool.id}
            className={activeTool === tool.id ? "active" : ""}
            onClick={() => selectTool(tool.id)}
            aria-pressed={activeTool === tool.id}
            title={
              tool.id === "select"
                ? "Select and move parts"
                : `Add ${tool.label.toLowerCase()}`
            }
          >
            <span className="tool-icon" aria-hidden="true">
              {tool.icon}
            </span>
            <span>{tool.label}</span>
          </button>
        ))}
      </aside>

      {catalogOpen && (
        <aside
          className="parts-palette"
          role="dialog"
          aria-modal="false"
          aria-labelledby="parts-palette-title"
        >
          <header>
            <div>
              <span className="eyebrow">Printable catalogue</span>
              <h2 id="parts-palette-title">Add a part</h2>
            </div>
            <button
              type="button"
              onClick={closeCatalog}
              aria-label="Close parts catalogue"
            >
              ×
            </button>
          </header>
          <p>
            Schematic planning parts based on the official Underware and
            openGrid customizers.
          </p>
          <button
            type="button"
            className="catalog-manifest-action"
            onClick={() => setManifestEditorOpen(true)}
          >
            <span aria-hidden="true">{`{ }`}</span>
            <strong>Import JSON / advanced mode</strong>
            <small>
              Add a fixed-size MakerWorld or local model with an inline SVG.
            </small>
          </button>
          {categories.map((category) => (
              <section key={category}>
                <h3>{category}</h3>
                <div className="catalog-grid">
                  {partCatalog.filter(
                    (part) => part.category === category,
                  ).map((part) => (
                    <button
                      type="button"
                      key={part.id}
                      className={
                        part.featured ? "priority-part" : ""
                      }
                      onClick={() => addCatalogItem(part.id)}
                      disabled={!canAddCatalogItem(part.id)}
                    >
                      <span aria-hidden="true">{part.icon}</span>
                      <strong>{part.name}</strong>
                      <small>{part.description}</small>
                    </button>
                  ))}
                </div>
              </section>
            ))}
        </aside>
      )}
      <PartManifestEditor
        open={manifestEditorOpen}
        onClose={() => setManifestEditorOpen(false)}
      />
    </>
  );
}
