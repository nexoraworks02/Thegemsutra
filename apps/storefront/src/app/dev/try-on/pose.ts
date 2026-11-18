"use client";

import type { PoseLandmark } from "@jemsutra/design-engine";

/**
 * MediaPipe Pose Landmarker, loaded only when the try-on page needs it.
 * Runs entirely in the browser: the photo is never uploaded.
 *
 * - WASM runtime: served from our own /mediapipe/wasm (copied from node_modules).
 * - Model: Google's official pose_landmarker_lite.task (public file, no user data
 *   sent). Set NEXT_PUBLIC_POSE_MODEL_URL to self-host it.
 */
const MODEL_URL =
  process.env.NEXT_PUBLIC_POSE_MODEL_URL ??
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

type Landmarker = { detect(image: HTMLCanvasElement | ImageBitmap): { landmarks: PoseLandmark[][] }; close(): void };

let instance: Promise<{ landmarker: Landmarker; delegate: "GPU" | "CPU" }> | null = null;

/** Up to this many people are detected, so group photos can be recognised. */
const MAX_POSES = 3;

export function loadPoseLandmarker() {
  instance ??= (async () => {
    const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
    const create = (delegate: "GPU" | "CPU") =>
      PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: "IMAGE",
        numPoses: MAX_POSES,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
      });
    // Photo mode uses the CPU: one detection per photo, and the first GPU detection
    // spends 1-10 s compiling shaders (measured), while CPU is ready in ~0.4 s at a
    // similar per-photo speed. GPU stays as the fallback (and for a future live camera).
    try {
      return { landmarker: (await create("CPU")) as unknown as Landmarker, delegate: "CPU" as const };
    } catch {
      return { landmarker: (await create("GPU")) as unknown as Landmarker, delegate: "GPU" as const };
    }
  })();
  instance.catch(() => (instance = null));
  return instance;
}

/** Detect every person in the photo (up to MAX_POSES); the caller decides who to use. */
export async function detectPoses(image: HTMLCanvasElement): Promise<{ poses: PoseLandmark[][]; delegate: string; ms: number }> {
  const { landmarker, delegate } = await loadPoseLandmarker();
  const t0 = performance.now();
  const result = landmarker.detect(image);
  return { poses: result.landmarks, delegate, ms: Math.round(performance.now() - t0) };
}
