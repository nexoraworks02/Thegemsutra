// Prepares the self-hosted assets of the developer-only try-on prototype:
//   public/mediapipe/wasm/    MediaPipe Tasks Vision WASM runtime (from node_modules)
//   public/mediapipe/models/  pose model (vendored in tryon-assets/, see its README)
//
// Usage: node scripts/copy-mediapipe.mjs dev|build
//   dev   -> always copies (the try-on page exists in `next dev`)
//   build -> copies only when ENABLE_TRYON_DEMO=true; otherwise REMOVES public/mediapipe
//            so a normal production build serves none of these files.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(here, "..");
const out = path.join(app, "public/mediapipe");
const mode = process.argv[2] ?? "build";

/** ENABLE_TRYON_DEMO from the environment or the app's .env files (same files Next reads for a build). */
function tryOnFlag() {
  if (process.env.ENABLE_TRYON_DEMO) return process.env.ENABLE_TRYON_DEMO === "true";
  for (const f of [".env.production.local", ".env.local", ".env.production", ".env"]) {
    const file = path.join(app, f);
    if (!existsSync(file)) continue;
    const m = readFileSync(file, "utf8").match(/^\s*ENABLE_TRYON_DEMO\s*=\s*["']?([^"'\r\n#]*)/m);
    if (m) return m[1].trim() === "true";
  }
  return false;
}

const enabled = mode === "dev" || tryOnFlag();

if (!enabled) {
  rmSync(out, { recursive: true, force: true });
  console.log("[try-on assets] try-on disabled for this build - public/mediapipe removed");
} else {
  // The package doesn't export ./package.json; resolve its entry file and use that folder.
  const wasm = path.join(path.dirname(require.resolve("@mediapipe/tasks-vision")), "wasm");
  const model = path.join(app, "tryon-assets/pose_landmarker_lite.task");
  if (!existsSync(wasm)) throw new Error("[try-on assets] @mediapipe/tasks-vision wasm folder not found");
  if (!existsSync(model)) throw new Error("[try-on assets] tryon-assets/pose_landmarker_lite.task is missing");
  mkdirSync(path.join(out, "models"), { recursive: true });
  cpSync(wasm, path.join(out, "wasm"), { recursive: true });
  cpSync(model, path.join(out, "models/pose_landmarker_lite.task"));
  console.log(`[try-on assets] WASM runtime and pose model copied to ${path.relative(process.cwd(), out)} (${mode})`);
}
