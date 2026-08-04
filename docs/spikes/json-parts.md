# Spike: JSON-ingestable printable parts

Status: **option A + B selected and implemented in this PR**

Runtime contract: `underware.parts/v1alpha1`

Interactive laboratory: `/spikes/json-parts`

## Question

How can a part found on MakerWorld (or another model source) become a safe,
dimensionally accurate planning item without changing planner code for every new
shape?

The spike must preserve one non-negotiable invariant:

> One planner millimetre represents one real-world millimetre. The plan must
> never silently scale a representation away from the object that will be
> printed.

The current straight-channel example uses the verified physical dimensions
**140.01 × 27.20 × 22.40 mm**. Its planner footprint is X/Y
**140.01 × 27.20 mm**; Z **22.40 mm** remains physical height.

## What the current app actually needs from a part

| Concern | Current dependency | Manifest data or rule needed |
|---|---|---|
| Catalogue | ID, name, category, icon, description | Stable ID and versioned display metadata |
| Physical plan | Width, depth, rotation | Authoritative X/Y/Z in millimetres; no free scale |
| Grid placement | Active system and snap size | Compatible system plus a local millimetre snap anchor |
| Rendering | React renderer selected by registry | Whitelisted renderer capability plus inert SVG |
| Selection | Hit bounds, movement, resize, rotate | Physical footprint, allowed rotations, explicit sizing mode |
| Layers | Back/front default and shared stack | Default layer; instances retain ordinary layer controls |
| Cable routing | Capacity and future route snapping | Capacity capability and optional cable ports |
| Print list | Label, quantity, grouping, source | One or more print components and the exact source variant |
| Persistence | `catalogId` today | Manifest ID + version + content hash; definition snapshot once per plan |
| Import safety | v1 plan validation only | JSON Schema validation, semantic validation, limits, and SVG isolation |
| Provenance | Not currently represented | Source page/model/profile, creator when known, licence state, optional artifact hash |

This is why a JSON object containing only `name`, `width`, `height`, and `svg`
would work visually but fail as a trustworthy planning/printing contract.

## Alternatives

### A. Build-time JSON catalogue

Each release ships one reviewed `*.part.json` file per part. The build validates
them and composes them into the existing `PartRegistry`.

Pros:

- Smallest production change and easiest CI/review story.
- No untrusted runtime content or catalogue persistence problem.
- Adding a supported part becomes a data-only release change.
- Excellent first migration for the existing built-in catalogue.

Cons:

- Does not meet the random-user live-import goal.
- Every new part still waits for an app release.
- Cannot prove the installed-catalogue and portable-plan lifecycle.

Best use: release-maintained built-ins, regardless of the runtime choice.

### B. Self-contained JSON manifest with inline SVG

One portable `.part.json` contains metadata, exact dimensions, placement rules,
capability IDs, print components, provenance, and the SVG string. The advanced
editor can edit the same object that import/export uses.

Pros:

- Closest match to the requested Terraform-like authoring model.
- One file is easy to upload, download, paste, diff, embed in a plan, and share.
- Offline/local-first; no backend or remote registry required.
- Can be prototyped on top of the current `PartRegistry` without changing the
  geometry engine.

Cons:

- Escaped SVG is unpleasant to edit inside JSON.
- Large or complex SVGs make the manifest noisy.
- Requires strict SVG limits/isolation and catalogue versioning.
- Cannot carry a binary 3MF model.

Best use: first runtime-import version. This is the candidate demonstrated by
the spike laboratory, but it is **not yet selected**.

### C. `.underware-part.zip` pack

A package contains `part.json`, `preview.svg`, and optionally a 3MF/STL artifact.

Pros:

- Clean JSON and separately editable assets.
- Natural home for multiple SVGs, print components, thumbnails, and 3MF files.
- Better long-term creator experience than escaped inline SVG.
- Can hash every asset and keep the exact printable file with the definition.

Cons:

- More moving parts and a harder live code-editor experience.
- Requires ZIP parsing, path traversal prevention, decompression limits, and
  asset lifecycle/storage.
- A plan either becomes a package itself or still needs embedded snapshots.
- Premature for the current small catalogue.

Best use: a later interchange format after a single-manifest lifecycle proves
itself.

### D. 3MF-first import with generated metadata/preview

The user uploads a 3MF; the app extracts units and the 3D bounding box, derives a
top-down silhouette, then asks for mounting and routing semantics. 3MF defines
units, coordinates, geometry, and metadata, unlike older mesh-only workflows.

Pros:

- Strongest link between what the planner shows and what will be printed.
- Can automatically verify X/Y/Z rather than trusting typed dimensions.
- One format can eventually carry several components and manufacturing data.

Cons:

- Considerably more parsing, projection, orientation, memory, and security work.
- Geometry does not tell us which face is “top”, where mounts snap, where cables
  enter, or which clearance is required.
- MakerWorld customizers may expose SCAD/configuration rather than a stable 3MF.
- Still needs a manifest for planner-specific semantics.

Best use: optional verification/enrichment after manifests exist, not as a
replacement for the manifest.

### E. MakerWorld URL adapter or hosted catalogue service

The user pastes a model URL; a backend or provider adapter retrieves metadata and
stores a normalized part definition.

Pros:

- Lowest friction when it works.
- Central catalogue can support moderation, updates, ratings, and reuse.
- A provider adapter fits the Terraform analogy well.

Cons:

- MakerWorld page markup, file links, authentication, and licences are external
  contracts the app does not control.
- Requires a backend, availability policy, caching, moderation, and migrations.
- Remote data can drift after a plan was created.
- Metadata still cannot infer mounting anchors, ports, clearance, or a correct
  top view in the general case.

Best use: a later adapter that produces the same manifest; never make the plan
depend on live scraping.

## Selected implementation

The selected staged hybrid is:

1. Keep release-owned parts as build-time JSON.
2. Add runtime import of the same self-contained JSON + inline SVG contract.
3. Embed one immutable definition snapshot per custom part in exported plans.
4. Add ZIP packs only when separate assets or 3MF verification are needed.
5. Add MakerWorld/other provider adapters only when an official, maintainable
   integration path exists; adapters must output the same manifest.

The release catalogue now follows that split. Every existing catalogue entry
is a JSON file. The dimensionally verified straight channel uses the public
fixed-variant contract. The older resizable catalogue tools are JSON planning
templates marked `grid-derived` and `generator-required`, because their final Z
dimension and printable output depend on parameters selected in the external
generator. This keeps their current editor behaviour without fabricating an
exact model revision.

This avoids two bad extremes: hard-coding every part in TypeScript, and turning
JSON into an executable mini-language.

## Candidate `v1alpha1` contract

The complete machine-readable proposal is
[`spikes/json-parts/underware-part.schema.json`](../../spikes/json-parts/underware-part.schema.json).
The worked example is
[`straight-channel.part.json`](../../spikes/json-parts/examples/straight-channel.part.json).

Key groups:

- `apiVersion`, `id`, `version`: schema compatibility and immutable identity.
- `metadata`: catalogue copy, source page/model/profile, creator, and licence
  state. An unknown licence is a visible warning, not invented metadata.
- `physical.units`: always `mm` in v1.
- `physical.sizeMm`: exact X/Y/Z bounding dimensions of the printable variant.
- `physical.clearanceMm`: installation space, deliberately separate from the
  physical footprint.
- `placement`: fixed sizing, allowed rotations, and default layer.
- `mounting`: system compatibility, snap anchor, and optional attachment points
  in the part's local millimetre coordinates.
- `ports`: optional cable entry/exit points for later route snapping.
- `capabilities`: finite IDs implemented by the app, never module paths or code.
- `visual`: inline SVG in `physical-mm`; its viewBox must be exactly
  `[0, 0, physical X, physical Y]`.
- `print.components`: exact component names and quantities required for one
  placed item; optional filenames and SHA-256 values can pin downloaded files.

### Why fixed-size variants first

The existing planner lets users resize generic parts. That is unsafe for a
downloaded printable model: changing 140.01 mm to 168 mm in the plan does not
change the MakerWorld output.

`v1alpha1` therefore accepts only `placement.resizing: "fixed"`. A future
parametric sizing capability must bind allowed parameters (for example,
`lengthMm`) to a specific generator configuration and regenerate or select the
actual printable variant. It must not visually scale an existing print.

### SVG rules

SVG is active document content, not merely a list of paths. It can include
scripts, foreign HTML, links, and external resources. The candidate validator:

- allows only basic drawing elements;
- rejects scripts, `foreignObject`, unknown elements, event handlers, links,
  style attributes, URL paint servers, DOCTYPE, and entities;
- limits SVG character count;
- requires an exact root viewBox and physical-millimetre coordinate space;
- renders accepted content through an image boundary rather than inserting it
  into the application DOM.

Production should use defence in depth: a maintained SVG sanitizer with an
explicit allowlist, secure-static/image rendering, CSP, size/depth/path limits,
and semantic dimension checks. Sanitization alone does not establish physical
correctness.

## Plan and catalogue lifecycle

Plan file version 2 stores a content-addressed definition table alongside the
ordinary item instances:

```json
{
  "partDefinitions": {
    "sha256:<content hash>": { "...": "immutable manifest snapshot" }
  },
  "items": [
    {
      "partDefinition": "sha256:<content hash>",
      "catalogId": "makerworld.example.part",
      "partDefinition": "sha256:<content hash>",
      "x": 420,
      "y": 280,
      "rotation": 90,
      "layer": 4
    }
  ]
}
```

Rules:

1. Parse JSON and validate the versioned schema.
2. Run semantic checks for dimensions, anchors, ports, capabilities, and SVG.
3. Compute a content hash; do not trust a hash supplied by the author.
4. Install as a catalogue draft, then apply atomically.
5. Pin placed items to the content hash. Editing the same ID creates a new
   draft/revision; existing items do not silently change size.
6. Export each referenced custom definition once, not once per placed item.
7. If a definition is missing, render a measured placeholder and block a final
   print list rather than guessing.

This keeps an old plan reproducible even if its source page or local catalogue
changes later.

## Advanced-mode editor

The first production implementation uses the native textarea with live
validation, import/export, inert SVG preview, immutable revision installation,
and editing of device-local manifests. This keeps the runtime dependency small
while the schema stabilizes. CodeMirror remains the likely next editor upgrade.

Options considered:

| Editor | Pros | Cons | Fit now |
|---|---|---|---|
| Native textarea | Zero dependency, tiny, live validation and diagnostics | No syntax highlighting or schema completion | Selected for v1alpha1 |
| CodeMirror 6 | Modular, lighter-weight editor with lint extension points | Schema completion/field diagnostics need integration work | Best first production choice |
| Monaco | Excellent JSON Schema completion and familiar VS Code UX | Largest integration and worker/bundle cost | Too heavy for the first version |
| Generated form + raw JSON toggle | Friendly for non-developers; preserves advanced mode | Complex fields and SVG still need custom controls; two synchronized views | Add after the contract stabilizes |

The spike deliberately uses a native textarea so editor selection does not
obscure the manifest decision.

## Maintainability boundaries

JSON may select supported capabilities such as `svg/v1`, `fixed/v1`, or
`components/v1`. It may not contain:

- JavaScript, callbacks, expressions, conditions, or arbitrary module names;
- remote renderer URLs, raw HTML, React components, or CSS;
- a free scale factor;
- formulas for print quantities;
- new saved-property types the plan schema cannot validate.

A genuinely new domain behavior is implemented and tested in TypeScript first,
then exposed as a versioned capability that manifests may reference. This keeps
the planner open for data-defined parts without creating an untyped programming
language in JSON.

## Implemented boundary

- Release-owned JSON manifests compile through the same capability adapter as
  runtime imports.
- Runtime manifests are validated, SHA-256 addressed, and stored locally.
- Fixed printable parts cannot be resized in the canvas or inspector.
- Rotations preserve the exact X/Y footprint and grid-aligned mounting anchor.
- Plan v2 embeds each referenced manifest revision once and verifies its hash
  and exact item dimensions on import.
- Print components include their own X/Y/Z dimensions, so multi-component BOMs
  do not guess from the assembled footprint.

## References

- [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12)
- [Ajv standalone validation](https://ajv.js.org/standalone.html)
- [SVG 2 secure-static external-resource rules](https://www.w3.org/TR/SVG/linking.html)
- [DOMPurify SVG sanitizer project](https://github.com/cure53/DOMPurify)
- [3MF format and Core Specification](https://3mf.io/)
- [QuackWorks parametric source repository](https://github.com/AndyLevesque/QuackWorks)
- [MakerWorld model 1329404](https://makerworld.com/en/models/1329404-underware-for-opengrid-customizer)
