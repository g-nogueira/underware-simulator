# Underware Simulator

A dimensionally accurate, browser-based planner for arranging PC cable
management beneath a desk before printing parts.

The MVP supports both openGrid and Underware layouts. It focuses on the planning
questions that are expensive to answer through trial and error:

- Will the proposed route fit beneath the desk and around its frame?
- Do the channels have enough capacity for the selected cables?
- Which channels, corners, holders, grids, and power components need printing?

## Features

- Editable desk dimensions and obstacles
- openGrid 28 mm and Underware 25 mm snapping
- Draggable channels, holders, power components, and printable grid coverage
- Cable routes with realistic shared lanes, diameter, color, and capacity checks
- Shared layer ordering for physical parts and cable routes
- Grouped print list with heuristic time and filament estimates
- Browser autosave and JSON import/export
- Undo/redo and keyboard shortcuts
- Exportable structured diagnostic trace

The displayed components are schematic planning representations. Generate the
final printable parts with the official model tools and verify all dimensions
before printing.

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
geometry, validation, bill-of-materials, rendered-output, and architecture
contract tests.

Pull requests run the same lint, build, artifact, and test checks through
GitHub Actions.

## Architecture

The planner is a vertical feature under `features/planner`:

- `model/` owns stable types, the initial sample plan, and the extensible part
  catalogue.
- `application/` owns editor orchestration. `PlannerProvider` is the UI-facing
  facade; history, tracing, and canvas pointer state each live in focused hooks.
- `components/` owns composition and rendering. The page entrypoint delegates
  immediately to this feature instead of containing editor logic.
- `lib/planner.mjs` remains the framework-independent geometry, validation, and
  print-plan engine covered by Node tests.
- `worker/` contains the Cloudflare-compatible server entry point.
- `.openai/hosting.json` contains the Sites deployment identity.

To add another part that uses an existing item kind, add one entry to
`features/planner/model/catalog.ts`; creation, placement, catalogue UI, and
print-plan metadata continue through the existing workflow. A genuinely new
item kind also adds one renderer to the exhaustive registry in
`features/planner/components/item-renderers.tsx`.

The facade exposes read-only planner state and named operations such as
`addCatalogItem`, `updateSelected`, `moveSelectionLayer`, and `openPrintPlan`.
React setters, undo stacks, trace storage, and mutable pointer refs stay behind
the application boundary.

State remains local-first: browser storage provides autosave, while JSON
export/import provides portable plans without a database or hosted backend.

## Attribution

This project is an independent planning tool inspired by the
[Underware/openGrid ecosystem](https://github.com/AndyLevesque/QuackWorks/).
It does not redistribute the original printable model geometry.
