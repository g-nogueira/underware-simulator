# Underware Simulator

A dimensionally accurate, browser-based planner for arranging PC cable
management beneath a desk before printing parts.

The MVP supports both openGrid and Underware layouts. It focuses on the planning
questions that are expensive to answer through trial and error:

- Will the proposed route fit beneath the desk and around its frame?
- Do the channels have enough capacity for the selected cables?
- Which channels, corners, holders, and power components need to be printed?

## Features

- Editable desk dimensions and obstacles
- openGrid 28 mm and Underware 25 mm snapping
- Draggable channels, holders, and power components
- Cable routes with diameter and capacity validation
- Grouped print list with heuristic time and filament estimates
- Browser autosave and JSON import/export
- Build-time and device-local JSON part manifests with exact-size SVG previews
- Undo/redo and keyboard shortcuts
- Exportable structured diagnostic trace

The displayed components are schematic planning representations. Generate the
final printable parts with the official model tools and verify all dimensions
before printing.

## Architecture

The planner is a vertical feature under `features/planner`:

- `model/` owns stable plan types and the initial sample plan.
- `parts/` owns the extension contract, built-in part modules, and the registry
  that composes them.
- `application/` owns use-case orchestration. Persistence, history, tracing, and
  canvas pointer state have focused hooks; `PlannerProvider` only wires the
  controller and contexts.
- `components/` owns editor surfaces and generic extension hosts. The route
  entry point delegates immediately to this feature.

The sibling `lib/planner.mjs` module remains the framework-independent geometry,
validation, and print-plan engine covered by Node tests.

`PlannerPage` is the composition root. It injects a `PartLibrary` whose narrow
`PartRegistry` interface is consumed by the planner. Each part
definition composes catalogue metadata, defaults, placement/resize rules,
rendering, optional inspector sections, availability, and print behaviour.
Adding a shape with existing behaviours is therefore one definition; a shape
with new presentation supplies its own renderer or inspector component without
changing the editor surfaces. The core print engine receives the registry's
plain print definitions instead of maintaining another catalogue switch.

The facade exposes read-only state and named operations such as
`addCatalogItem`, `updateSelected`, `moveSelectionLayer`, and
`openPrintPlan`. React setters, undo stacks, trace storage, and mutable pointer
refs remain behind the application boundary.

## JSON part manifests

Open **+ Parts → Import JSON / advanced mode** to paste or upload a
`underware.parts/v1alpha1` manifest. An SVG file can also be inserted into the
current JSON draft; the final manifest remains one self-contained file. The editor validates exact X/Y/Z
millimetres, mounting anchors, permitted rotations, print-component sizes,
provenance, licence state, finite capabilities, and a restricted inline SVG.

Accepted manifests are content-addressed with SHA-256 and stored on the current
device. Editing creates a new immutable revision: existing placed parts retain
their old dimensions and rendering. Exported plan v2 files embed every
referenced revision once, so importing the plan does not depend on a live model
page or the recipient already having that part installed.

Release-owned manifests use the same validation and compilation path. See the
worked manifest and JSON Schema under `spikes/json-parts/`.

This is deliberately lightweight inversion of control, not a plugin framework
or dependency-injection container. A genuinely new domain concept (for example,
a routed electrical circuit with new saved data) should still change the plan
schema and validation explicitly. Open/closed is used to make new printable
parts cheap, not to hide meaningful domain changes behind untyped callbacks.

## Development

Prerequisites:

- Node.js `>=22.13.0`
- npm
- Linux for the provided bounded install/build helper scripts

```bash
npm ci
npm run dev
```

Useful checks:

```bash
npm run lint
npm test
```

`npm test` creates and validates the production artifact before running the
geometry, validation, bill-of-materials, and rendered-output tests.

Pull requests run the same lint, build, artifact, and test checks through
GitHub Actions.

State is deliberately local-first: browser storage provides autosave, while
JSON export/import provides portable plans without requiring a database or
hosted backend.

## Attribution

This project is an independent planning tool inspired by the
[Underware/openGrid ecosystem](https://github.com/AndyLevesque/QuackWorks/).
It does not redistribute the original printable model geometry.
