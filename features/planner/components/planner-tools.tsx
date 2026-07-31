import { PART_CATALOG, TOOLS } from "../model/catalog";
import { usePlanner } from "../application/planner-provider";

export function PlannerTools() {
  const {
    system,
    activeTool,
    catalogOpen,
    closeCatalog,
    selectTool,
    addCatalogItem,
  } = usePlanner();

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
          {(["Foundation", "Cable routing", "Mounts"] as const).map(
            (category) => (
              <section key={category}>
                <h3>{category}</h3>
                <div className="catalog-grid">
                  {PART_CATALOG.filter(
                    (part) => part.category === category,
                  ).map((part) => (
                    <button
                      type="button"
                      key={part.id}
                      className={
                        part.id === "opengrid-baseplate"
                          ? "priority-part"
                          : ""
                      }
                      onClick={() => addCatalogItem(part)}
                      disabled={part.openGridOnly && system !== "openGrid"}
                    >
                      <span aria-hidden="true">{part.icon}</span>
                      <strong>{part.name}</strong>
                      <small>{part.description}</small>
                    </button>
                  ))}
                </div>
              </section>
            ),
          )}
        </aside>
      )}
    </>
  );
}
