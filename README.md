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
geometry, validation, bill-of-materials, and rendered-output tests.

Pull requests run the same lint, build, artifact, and test checks through
GitHub Actions.

## Architecture

- `app/`: React interface and interaction state
- `lib/planner.mjs`: pure geometry, validation, and print-list logic
- `tests/`: domain and rendered-output tests
- `worker/`: Cloudflare-compatible server entry point
- `.openai/hosting.json`: Sites deployment identity

State is deliberately local-first: browser storage provides autosave, while
JSON export/import provides portable plans without requiring a database or
hosted backend.

## Attribution

This project is an independent planning tool inspired by the
[Underware/openGrid ecosystem](https://github.com/AndyLevesque/QuackWorks/).
It does not redistribute the original printable model geometry.
