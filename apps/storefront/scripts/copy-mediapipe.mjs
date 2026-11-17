// Copies the MediaPipe Tasks Vision WASM runtime into public/ so the try-on
// prototype loads it from our own origin (no third-party script CDN).
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
// The package doesn't export ./package.json; resolve its entry file and use that folder.
const pkgDir = path.dirname(require.resolve("@mediapipe/tasks-vision"));
const from = path.join(pkgDir, "wasm");
const to = path.resolve(here, "../public/mediapipe/wasm");

if (!existsSync(from)) {
  console.warn("[copy-mediapipe] @mediapipe/tasks-vision wasm folder not found - skipping");
} else {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
  console.log(`[copy-mediapipe] WASM runtime copied to ${path.relative(process.cwd(), to)}`);
}
