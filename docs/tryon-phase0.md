# Virtual Try-On — Phase 0 (proof of concept)

Status: **implemented, developer-only**. Goal proven: a customer types a name, we render a transparent necklace with that exact name, they upload a selfie, and the necklace is placed on their neck automatically, with manual fine-tuning and a local download.

## Planning correction (from the feasibility review)

The readiness scores in the review added up to **2.5 / 10, not 3.5 / 10**. The figure was a rough planning estimate, not measured completion, and is not used for tracking.

## Engineering decisions

| Decision | Choice | Why |
|---|---|---|
| Chain rendering | **Pre-rendered transparent necklace incl. chain** (server, one image) | Simpler and more convincing for a pilot than a browser-side procedural chain composited over a photo. The chain ends follow the name width, so it stays exact. |
| Landmarks | **MediaPipe Pose Landmarker (lite) only** | Shoulders + nose + mouth are enough for the neckline. Face Landmarker not needed (smaller download). |
| Physical size | **Approximate**: neck width estimated as a configurable fraction of shoulder width (`DEFAULT_NECKLINE`) + manual size/position/rotation | A photo has no reliable real-world scale. Labelled "approximate" in the UI. |
| Processing location | **Entirely in the browser** | The selfie is never uploaded. Only the public pose model is downloaded. |
| GPU | Tries `GPU`, **falls back to `CPU`** automatically | No GPU / frame-rate assumptions. Benchmark real phones in the live-camera phase. |
| Isolation | Demo design `JSN900` is **not** in `PRODUCTS`, not in the database, not in the store | Served by the image service only when `ENABLE_TRYON_DEMO=true`; page `/dev/try-on` is 404 in production builds unless enabled. |

## What was built

| Area | File(s) |
|---|---|
| Demo name necklace (dev only) | `packages/design-engine/src/catalog/demo.ts` |
| Neckline estimate, placement, adjustments, canvas matrix (pure, tested) | `packages/design-engine/src/tryon.ts`, `tryon.test.ts` |
| Transparent necklace renderer (exact font outlines) | `services/image/src/necklace.ts`, `necklace.test.ts` |
| Render branch for `nameplate` views + transparent background | `services/image/src/render.ts`, `manifest.ts` (ring path unchanged) |
| Necklace geometry endpoint | `GET /tryon-meta/:style` in `services/image/src/server.ts` |
| Demo geometry | `assets/products/JSN900/manifest.json` |
| Developer page | `apps/storefront/src/app/dev/try-on/page.tsx`, `TryOnLab.tsx`, `pose.ts` |
| Self-hosted MediaPipe WASM | `apps/storefront/scripts/copy-mediapipe.mjs` → `public/mediapipe/wasm` (git-ignored, copied on `dev`/`build`) |

Image URL (personalised, transparent): `GET /img/JSN900/demo-name-necklace.png?m=GP&e1=Ayesha&ef=script&w=1200`

## How to test locally

1. `services/image/.env` must contain `ENABLE_TRYON_DEMO=true` (plus the usual `MEDUSA_URL`, `INTERNAL_API_KEY`).
2. Start the image service and storefront:
   ```bash
   npm run dev:image
   ```
   ```bash
   npm run dev:storefront
   ```
3. Open **http://localhost:3000/dev/try-on**.
4. Type a name, pick a font and metal, then **Upload or take a selfie** (on a phone this offers the camera).
5. The necklace is placed automatically. Drag it, use the Size / Rotation sliders or arrow buttons, tick "Show detection guides" to see the estimated neck points, then **Download photo**.
6. Automated tests:
   ```bash
   npm test
   ```

Photos that work best: front-facing, shoulders visible, neck uncovered, reasonably lit.

## Test results (2026-11-18)

- **Unit tests:** 41 passing - 33 engine (incl. 13 try-on: neckline estimate on 6 portrait fixtures - frontal, tilted shoulders, mirrored selfie, small subject in landscape, tight chin crop, hidden shoulders; exact anchor mapping; adjustment reducer + limits; demo isolation) and 8 image service (exact name, placeholder only when empty, centring/attachment, long-name shrink, genuine transparency at corners and between the chains, personalisation changes the image, rings stay opaque).
- **Ring regression:** 6 ring images (all 3 designs, metals, stones, engravings, webp/png/jpeg) are **byte-identical** before and after the change.
- **Builds:** storefront production build, Medusa backend + admin build, all type checks: pass.
- **Isolation:** production build → `/dev/try-on` 404; store lists JS0001–JS0003 only; `POST /store/designs/JSN900/price` → 404.
- **Smoke test, 6 public-domain NASA portraits** (stored outside the repo): pose detected in **6/6** (confidence 98-100%). Placement good on 5/6; on a wider full-length framing the plate sat lower than ideal (fixed with the Move controls). Includes two bulky spacesuits and a group photo (placed on the front person).
- **Speed (this desktop, GPU):** first detection ~10.5 s (one-time model + GPU warm-up), then **78-109 ms** per photo. Not representative of phones.

## Temporary assets to replace with CAD-derived renders

| Temporary | Replace with |
|---|---|
| Procedural metal shading of the name (SVG gradient) | Rendered metal material per finish (from CAD / KeyShot / Blender) |
| Procedural chain (dashed stroke "links") | Real chain renders per chain type (cable, paperclip, ...) and length |
| Jump rings (circles) | Modelled jump rings / bails |
| Contact shadow (blurred silhouette) | Shadow pass from the renderer |
| `JSN900/manifest.json` geometry (`neckLeft/neckRight`, `plateCenter`, `maxPlateWidth`, `fontSize`, `mmPerPx` = 0.1375) | Measured geometry from the real design: plate size in mm, chain attachment points, drop per chain length |
| `DEFAULT_NECKLINE` ratios (0.16 lift, 0.16 half-width) | Values tuned on a larger, diverse test set |

The **name itself is already production-accurate**: it is drawn from the real font outlines (opentype.js), never generated by AI.

## Known limitations (Phase 0)

- Front-facing photos only; strong head turns or side views are not handled.
- No hair or clothing occlusion: the chain is always drawn on top (hair over the neck will look wrong).
- No lighting match: the metal does not pick up the photo's light or colour cast.
- Plate drop is a fixed fraction of the estimated neck width, so on some framings it sits too low or high; chain-length options don't exist yet.
- Size is approximate; no real-world calibration.
- One person per photo (the most prominent pose is used).
- The pose model is loaded from Google model storage by default (set `NEXT_PUBLIC_POSE_MODEL_URL` to self-host).
- Smoke-test portraits are mostly uniforms/spacesuits; real selfies with open necklines and varied skin tones, lighting and ages still need a broader test set.
- No live camera, no 3D, no checkout integration (by design for Phase 0).

## Suggested next steps

1. Broader portrait test set (20-50 consented selfies) and tune `DEFAULT_NECKLINE`.
2. Real necklace product (Phase 1): chain type/length, charms, plate thickness in the engine + admin, real CAD renders.
3. Hair segmentation for occlusion; simple light/colour matching.
4. Then live camera (benchmark real mid-range phones first).
