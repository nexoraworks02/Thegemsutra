# Try-on assets (developer-only prototype)

Files the virtual try-on prototype needs at runtime, kept in the repository so the
app never downloads them from a third party (at build time or in the browser).

| File | Source | License | SHA-256 |
|---|---|---|---|
| `pose_landmarker_lite.task` (5,777,746 bytes) | Google MediaPipe model storage: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task` (downloaded 2026-11-19) | Apache-2.0 (MediaPipe Pose Landmarker model card) | `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a` |

`scripts/copy-mediapipe.mjs` copies it to `public/mediapipe/models/` together with the
WASM runtime from `@mediapipe/tasks-vision`, **only** in `next dev` or when
`ENABLE_TRYON_DEMO=true`. A normal production build removes `public/mediapipe/`.

To update the model: download the new file, replace it here, update the size and
SHA-256 above (`sha256sum pose_landmarker_lite.task`), and re-test detection.
