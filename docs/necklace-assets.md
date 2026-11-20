# Necklace asset manifest and intake checker (Phase 1C Stage A)

Status: **schema v1 + read-only checker.** No necklace is rendered from these files yet,
and nothing here makes a product publishable.

## Why

Real necklaces will be rendered from artwork supplied by the designer/manufacturer.
Before any of it is used, the files must be structurally sound: present, the right
format and size, transparent where needed, with consistent physical scale and anchor
points. The checker answers exactly that - nothing more.

> **Passing the checker is not a manufacturing approval.** It does not confirm
> dimensions, materials, prices or that the piece can be made, and it never
> publishes or enables a product.

## Files

- Manifest: `necklace-assets.json` in the asset folder (e.g. `assets/products/{style}/`).
  Separate from the current render manifest `manifest.json`, which is unchanged.
- Code: `services/image/src/necklace-assets/schema.ts` (types + structural rules),
  `intake.ts` (file checks), `scripts/check-necklace-assets.ts` (command).

## Usage

```bash
npm run assets:check -w @jemsutra/image-service -- assets/products/JSN001
npm run assets:check -w @jemsutra/image-service -- path/to/necklace-assets.json --json
```

Exit status: `0` structurally valid (warnings allowed) · `1` problems found · `2` usage error.
Given a folder, it uses `necklace-assets.json`, or recognises a legacy `manifest.json`.

## Coordinate spaces and units

- **View space**: a view's pixel canvas (origin top-left, x right, y down).
- **Asset space**: one file's own pixel canvas (SVG: its `viewBox`).
- **Physical lengths**: millimetres only (`"units": { "length": "mm" }`). A view's
  `mmPerPx` converts view pixels to mm when the view is drawn to physical scale.

## Schema v1

| Field | Required | Meaning |
|---|---|---|
| `schema`, `schemaVersion` | yes | `"thegemsutra.necklace-assets"`, `1`. Unknown versions are rejected, not guessed |
| `styleCode` | yes | Design style code |
| `units.length` | yes | `"mm"` |
| `provenance.source` | yes | `designer`, `manufacturer`, `photography`, `cad-render` or `generated-placeholder`; optional `supplier`, `receivedAt`, `notes` |
| `readiness` | yes | `placeholder`, `partial`, `complete` - self-declared completeness, **not** an approval |
| `views` | yes (one `front`) | `kind` (`front`/`angle`/`detail`/`worn`), `canvas` {width,height}, optional `mmPerPx`, named `anchors` |
| `pendant` | yes | `type: "nameplate"` (text in a `textBox`, optional `maxWidthMm`/`maxHeightMm`/`thicknessMm`) or `type: "artwork"` (artwork per finish); `attach` = view anchors where chains join |
| `chains[]` | yes | `id`, `view`, `connects` (two view anchors), `variants` per finish (asset refs with `start`/`end` anchors) |
| `finishes` | yes | Finish codes (only manufacturer-confirmed), optional `label`, optional `material` reference asset |
| `worn` | optional (future) | Try-on anchors on a `worn` view: `neckLeft`, `neckRight`, optional `pendantCenter` |

Asset reference: `{ file, format: png|webp|svg, width, height, alpha?: required|optional, anchors? }`.

`readiness: "complete"` additionally requires: non-placeholder provenance, the pendant
view's `mmPerPx`, and for nameplates `maxWidthMm`, `maxHeightMm`, `thicknessMm`; every
chain needs artwork for every finish.

## What the checker verifies

- Schema/version, required fields, unknown fields (warned as typos).
- Physical scale (`mmPerPx` 0.001-10), positive mm values, text box vs. physical limits.
- Anchors inside their canvas; referenced anchors/views/finishes exist; duplicate ids.
- Each file: safe relative path (no `..`, absolute paths, drive letters, backslashes,
  odd characters; symlinks must stay inside the folder), regular file, size caps
  (raster 30 MB, SVG 2 MB, manifest 1 MB), format detected from content and matching
  the declared format and extension, pixel size / SVG viewBox matching the manifest,
  transparency where required (alpha channel present, not fully opaque, not empty).
- SVG safety (scanned as text, never executed): no DOCTYPE/entities, scripts, event
  handlers, `javascript:`, `<foreignObject>`, embedded documents/media, `<image>`,
  external `href`/`url()` or `@import`.
- Duplicate file references (case-insensitive).
- Read-only: input files are never written.

## Legacy manifests

The current `manifest.json` files (JS0001, JS0002, JSN900) are recognised as **legacy
render manifests**, lightly checked and left unchanged. JSN900 is reported as a
developer-only demo with unmeasured placeholder artwork - not a verified product.

## Still required from the designer/manufacturer

Fonts and licences, plate dimensions and tolerances, name rules, attachment geometry,
finish references, chain artwork, confirmed lengths and finishes, sample photos, prices.
See the Phase 1C plan. Until then any manifest must use `provenance.source:
"generated-placeholder"` and `readiness: "placeholder"`.
