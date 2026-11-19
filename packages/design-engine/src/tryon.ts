/**
 * Virtual try-on geometry (pure functions, no browser APIs - unit tested).
 *
 * Pipeline: pose landmarks -> estimated neck sides -> transform that maps the
 * necklace image's two neck anchors onto them -> plus the customer's manual
 * adjustments -> a canvas transform matrix.
 *
 * Physical size is APPROXIMATE: a photo has no reliable real-world scale, so the
 * neck width is estimated from shoulder width with configurable ratios and the
 * customer can correct position, size and rotation by hand.
 */

export interface Point {
  x: number;
  y: number;
}

/** One MediaPipe pose landmark (normalised 0..1 image coordinates). */
export interface PoseLandmark {
  x: number;
  y: number;
  visibility?: number;
}

/** MediaPipe Pose landmark indices we use. */
export const POSE = { NOSE: 0, MOUTH_LEFT: 9, MOUTH_RIGHT: 10, LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12 } as const;

/** Tunable neckline geometry (fractions of the shoulder width). */
export interface NecklineConfig {
  /** How far above the shoulder line the base of the neck sits. */
  neckLift: number;
  /** Half of the neck width. Average adult neck ~0.30-0.35 x shoulder width. */
  neckHalfWidth: number;
  /** Minimum gap kept between the mouth and the neck base. */
  mouthClearance: number;
  /** Landmarks below this visibility are treated as not found. */
  minVisibility: number;
}

export const DEFAULT_NECKLINE: NecklineConfig = {
  neckLift: 0.16,
  neckHalfWidth: 0.16,
  mouthClearance: 0.22,
  minVisibility: 0.5,
};

export interface NecklineEstimate {
  /** Neck side points where the chain disappears behind the neck (image px). */
  neckLeft: Point;
  neckRight: Point;
  center: Point;
  /** Shoulder-line angle in radians (0 = level). */
  rotation: number;
  shoulderWidth: number;
  /** How far the neck centre sits above the shoulder line (photo px, after the chin clamp). */
  neckLift: number;
  /** 0..1 - lowest visibility of the landmarks used. */
  confidence: number;
}

const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

/**
 * Estimate where a necklace sits from pose landmarks.
 * Returns null when the shoulders aren't reliably visible (use the fallback).
 */
export function estimateNeckline(
  landmarks: PoseLandmark[],
  image: { width: number; height: number },
  cfg: NecklineConfig = DEFAULT_NECKLINE,
): NecklineEstimate | null {
  const ls = landmarks[POSE.LEFT_SHOULDER];
  const rs = landmarks[POSE.RIGHT_SHOULDER];
  if (!ls || !rs) return null;
  const vis = Math.min(ls.visibility ?? 1, rs.visibility ?? 1);
  if (vis < cfg.minVisibility) return null;

  const px = (l: PoseLandmark): Point => ({ x: l.x * image.width, y: l.y * image.height });
  // Order by image x so "left" is always the left side of the picture (works for selfies and mirrored photos).
  let [a, b] = [px(ls), px(rs)];
  if (a.x > b.x) [a, b] = [b, a];
  const sw = dist(a, b);
  if (sw < 10) return null;

  const dir = { x: (b.x - a.x) / sw, y: (b.y - a.y) / sw };
  // Perpendicular pointing "up" the body (towards the head).
  let up = { x: dir.y, y: -dir.x };
  const nose = landmarks[POSE.NOSE];
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  if (nose && (nose.visibility ?? 1) >= cfg.minVisibility) {
    const n = px(nose);
    if ((n.x - mid.x) * up.x + (n.y - mid.y) * up.y < 0) up = { x: -up.x, y: -up.y };
  }

  let lift = cfg.neckLift * sw;
  // Never place the neck base above the chin: keep clearance below the mouth.
  const ml = landmarks[POSE.MOUTH_LEFT];
  const mr = landmarks[POSE.MOUTH_RIGHT];
  if (ml && mr && Math.min(ml.visibility ?? 1, mr.visibility ?? 1) >= cfg.minVisibility) {
    const mouth = { x: ((ml.x + mr.x) / 2) * image.width, y: ((ml.y + mr.y) / 2) * image.height };
    const mouthHeight = (mouth.x - mid.x) * up.x + (mouth.y - mid.y) * up.y; // along "up"
    lift = Math.max(0, Math.min(lift, mouthHeight - cfg.mouthClearance * sw));
  }

  const center = { x: mid.x + up.x * lift, y: mid.y + up.y * lift };
  const hw = cfg.neckHalfWidth * sw;
  return {
    neckLeft: { x: center.x - dir.x * hw, y: center.y - dir.y * hw },
    neckRight: { x: center.x + dir.x * hw, y: center.y + dir.y * hw },
    center,
    rotation: Math.atan2(dir.y, dir.x),
    shoulderWidth: sw,
    neckLift: lift,
    confidence: vis,
  };
}

// ---- Choosing who to place the necklace on ----

/** Rules for accepting a detected person for automatic placement. */
export interface SubjectRules {
  /**
   * Smallest accepted shoulder width as a fraction of the photo's SHORTER side.
   * Close-ups and half-body selfies are ~0.4-0.9, a full-length standing photo
   * ~0.25-0.3; a small background person in a group shot is ~0.1-0.15.
   */
  minShoulderFraction: number;
  /** A second person at least this fraction of the largest one's size means "more than one person". */
  crowdRatio: number;
}

export const DEFAULT_SUBJECT_RULES: SubjectRules = { minShoulderFraction: 0.18, crowdRatio: 0.6 };

export type SubjectIssue = "not-found" | "too-small" | "multiple-people";

export interface SubjectResult {
  /** The neckline to use for automatic placement, or null when it shouldn't be placed automatically. */
  estimate: NecklineEstimate | null;
  issue: SubjectIssue | null;
  /** Largest person's shoulder width / shorter photo side (0 when nobody was found). For diagnostics. */
  subjectFraction: number;
  /** Number of people with visible shoulders. */
  people: number;
}

/**
 * Pick the person to place the necklace on from all detected poses.
 * Uses the largest person, and refuses automatic placement when that person is
 * too small in the frame (likely a background person) or when another person of
 * similar size is present (we can't know who the customer is).
 */
export function chooseSubject(
  poses: PoseLandmark[][],
  image: { width: number; height: number },
  rules: SubjectRules = DEFAULT_SUBJECT_RULES,
  cfg: NecklineConfig = DEFAULT_NECKLINE,
): SubjectResult {
  const found = poses
    .map((lm) => estimateNeckline(lm, image, cfg))
    .filter((e): e is NecklineEstimate => e !== null)
    .sort((a, b) => b.shoulderWidth - a.shoulderWidth);
  const main = found[0];
  if (!main) return { estimate: null, issue: "not-found", subjectFraction: 0, people: 0 };
  const subjectFraction = main.shoulderWidth / Math.min(image.width, image.height);
  const base = { subjectFraction, people: found.length };
  if (subjectFraction < rules.minShoulderFraction) return { estimate: null, issue: "too-small", ...base };
  const second = found[1];
  if (second && second.shoulderWidth >= rules.crowdRatio * main.shoulderWidth) {
    return { estimate: null, issue: "multiple-people", ...base };
  }
  return { estimate: main, issue: null, ...base };
}

// ---- Pendant drop (how far below the neck the name/pendant hangs) ----

/**
 * Product geometry for the pendant drop, from the design's manifest (/tryon-meta).
 * Drops are in NECKLACE-IMAGE pixels: the vertical distance from the neck-anchor
 * line to the pendant centre in the rendered necklace image.
 */
export interface PendantGeometry {
  /** Drop drawn when nothing else is known (the artwork's own default). */
  defaultDrop: number;
  /** Range the renderer supports (the pendant must stay inside the image). */
  minDrop: number;
  maxDrop: number;
  /** Drops are rounded to this step so similar photos share cached renders. */
  step: number;
  /**
   * APPROXIMATE height of the pendant centre BELOW THE SHOULDER LINE, as a
   * fraction of shoulder width, for this chain length. Shoulder landmarks give
   * no real-world size, so this is a tuned visual ratio, not a measurement;
   * the customer can adjust the drop.
   */
  belowShoulders: number;
}

/**
 * Pendant drop to request from the renderer, in necklace-image pixels.
 *
 * With a detected person the pendant is anchored to the SHOULDER LINE (where a
 * chain of a given length rests on the chest), not to the estimated neck base:
 * the neck base moves up or down with the chin (see estimateNeckline), and a
 * fixed drop from it put the pendant too low on tight or tilted framings.
 *   drop (photo px) = neck lift above the shoulders + belowShoulders x shoulder width
 * then converted to necklace-image px with the same scale used to fit the neck
 * anchors. Without a person (manual placement) the artwork's default drop is used.
 * `dropScale` is the customer's adjustment (1 = as estimated). The result is
 * rounded to `step` and clamped to what the renderer supports.
 */
export function pendantDrop(
  geometry: PendantGeometry,
  opts: { estimate?: NecklineEstimate | null; anchors?: NecklaceAnchors; dropScale?: number } = {},
): number {
  let drop = geometry.defaultDrop;
  const { estimate, anchors } = opts;
  if (estimate && anchors) {
    const photoToImage = dist(anchors.neckLeft, anchors.neckRight) / dist(estimate.neckLeft, estimate.neckRight);
    drop = (estimate.neckLift + geometry.belowShoulders * estimate.shoulderWidth) * photoToImage;
  }
  drop *= opts.dropScale ?? 1;
  const stepped = Math.round(drop / geometry.step) * geometry.step;
  return Math.min(geometry.maxDrop, Math.max(geometry.minDrop, stepped));
}

/** Necklace image geometry, from the image service (/tryon-meta). */
export interface NecklaceAnchors {
  width: number;
  height: number;
  neckLeft: Point;
  neckRight: Point;
  /** Approximate millimetres per image pixel (for the "approximate size" label). */
  mmPerPx?: number;
}

/** Where to draw the necklace: its anchor midpoint goes to (x, y), scaled and rotated. */
export interface PlacementTransform {
  x: number;
  y: number;
  scale: number;
  rotation: number; // radians
}

/** Map the necklace's neck anchors exactly onto the estimated neck sides. */
export function placeNecklace(est: NecklineEstimate, anchors: NecklaceAnchors): PlacementTransform {
  const anchorSpan = dist(anchors.neckLeft, anchors.neckRight);
  const anchorAngle = Math.atan2(anchors.neckRight.y - anchors.neckLeft.y, anchors.neckRight.x - anchors.neckLeft.x);
  return {
    x: est.center.x,
    y: est.center.y,
    scale: dist(est.neckLeft, est.neckRight) / anchorSpan,
    rotation: est.rotation - anchorAngle,
  };
}

/**
 * Starting point for MANUAL placement, used only when the customer asks to place
 * the necklace by hand (never drawn automatically when nobody suitable was found).
 * Lower centre of the photo, where the neckline usually is, not the upper middle
 * where a face usually is.
 */
export function fallbackPlacement(image: { width: number; height: number }, anchors: NecklaceAnchors): PlacementTransform {
  const span = dist(anchors.neckLeft, anchors.neckRight);
  return { x: image.width / 2, y: image.height * 0.72, scale: (Math.min(image.width, image.height) * 0.22) / span, rotation: 0 };
}

// ---- Manual adjustments (state handled by a reducer) ----

export interface Adjustments {
  dx: number; // image px
  dy: number;
  scale: number; // multiplier
  rotationDeg: number;
  /** Pendant drop multiplier (1 = as estimated); changes the rendered chain, not the image scale. */
  drop: number;
}

export const NO_ADJUSTMENT: Adjustments = { dx: 0, dy: 0, scale: 1, rotationDeg: 0, drop: 1 };
export const ADJUST_LIMITS = { scale: [0.4, 2.5], rotationDeg: [-45, 45], drop: [0.6, 1.5] } as const;

export type AdjustAction =
  | { type: "move"; dx: number; dy: number }
  | { type: "scale"; value: number }
  | { type: "rotate"; value: number }
  | { type: "drop"; value: number }
  | { type: "reset" };

const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v));

export function adjustReducer(state: Adjustments, action: AdjustAction): Adjustments {
  switch (action.type) {
    case "move":
      return { ...state, dx: state.dx + action.dx, dy: state.dy + action.dy };
    case "scale":
      return { ...state, scale: clamp(action.value, ADJUST_LIMITS.scale) };
    case "rotate":
      return { ...state, rotationDeg: clamp(action.value, ADJUST_LIMITS.rotationDeg) };
    case "drop":
      return { ...state, drop: clamp(action.value, ADJUST_LIMITS.drop) };
    case "reset":
      return NO_ADJUSTMENT;
  }
}

export function applyAdjustments(t: PlacementTransform, adj: Adjustments): PlacementTransform {
  return { x: t.x + adj.dx, y: t.y + adj.dy, scale: t.scale * adj.scale, rotation: t.rotation + (adj.rotationDeg * Math.PI) / 180 };
}

/**
 * Canvas matrix [a, b, c, d, e, f] for ctx.setTransform(), drawing the necklace
 * image (at its natural size) so its anchor midpoint lands on (t.x, t.y).
 */
export function necklaceMatrix(t: PlacementTransform, anchors: NecklaceAnchors): [number, number, number, number, number, number] {
  const ax = (anchors.neckLeft.x + anchors.neckRight.x) / 2;
  const ay = (anchors.neckLeft.y + anchors.neckRight.y) / 2;
  const cos = Math.cos(t.rotation) * t.scale;
  const sin = Math.sin(t.rotation) * t.scale;
  // translate(t) * rotate * scale * translate(-anchorMid)
  return [cos, sin, -sin, cos, t.x - (cos * ax - sin * ay), t.y - (sin * ax + cos * ay)];
}

/** Apply a canvas matrix to a point (used in tests and hit-testing). */
export function applyMatrix(m: [number, number, number, number, number, number], p: Point): Point {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}
