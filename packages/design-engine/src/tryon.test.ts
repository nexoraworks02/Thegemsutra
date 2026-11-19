import { describe, expect, it } from "vitest";
import {
  ADJUST_LIMITS,
  DEFAULT_NECKLINE,
  DEFAULT_SUBJECT_RULES,
  DEMO_PRODUCT_BY_STYLE,
  NO_ADJUSTMENT,
  PRODUCTS,
  POSE,
  adjustReducer,
  applyAdjustments,
  applyMatrix,
  chooseSubject,
  estimateNeckline,
  fallbackPlacement,
  necklaceMatrix,
  pendantDrop,
  placeNecklace,
  validateProductDef,
  type NecklaceAnchors,
  type PendantGeometry,
  type PoseLandmark,
} from "./index";

/** Necklace image geometry matching assets/products/JSN900/manifest.json */
const anchors: NecklaceAnchors = { width: 1200, height: 900, neckLeft: { x: 200, y: 80 }, neckRight: { x: 1000, y: 80 } };

/**
 * Portrait fixtures: normalised landmarks as MediaPipe returns them.
 * Add more cases here (orientations, crops, angles) as the test set grows.
 */
function portrait(opts: {
  ls: [number, number];
  rs: [number, number];
  nose: [number, number];
  mouth?: [number, number];
  vis?: number;
}): PoseLandmark[] {
  const lm: PoseLandmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
  const v = opts.vis ?? 0.99;
  lm[POSE.NOSE] = { x: opts.nose[0], y: opts.nose[1], visibility: v };
  if (opts.mouth) {
    lm[POSE.MOUTH_LEFT] = { x: opts.mouth[0] - 0.02, y: opts.mouth[1], visibility: v };
    lm[POSE.MOUTH_RIGHT] = { x: opts.mouth[0] + 0.02, y: opts.mouth[1], visibility: v };
  }
  // MediaPipe "left shoulder" is the person's left = right side of a non-mirrored photo.
  lm[POSE.LEFT_SHOULDER] = { x: opts.ls[0], y: opts.ls[1], visibility: v };
  lm[POSE.RIGHT_SHOULDER] = { x: opts.rs[0], y: opts.rs[1], visibility: v };
  return lm;
}

const FIXTURES = {
  frontalPortrait: { image: { width: 1000, height: 1300 }, lm: portrait({ ls: [0.75, 0.7], rs: [0.25, 0.7], nose: [0.5, 0.35], mouth: [0.5, 0.45] }) },
  tiltedShoulders: { image: { width: 1000, height: 1300 }, lm: portrait({ ls: [0.74, 0.74], rs: [0.26, 0.66], nose: [0.48, 0.33], mouth: [0.48, 0.43] }) },
  smallSubjectLandscape: { image: { width: 1600, height: 900 }, lm: portrait({ ls: [0.6, 0.62], rs: [0.42, 0.62], nose: [0.51, 0.35], mouth: [0.51, 0.42] }) },
  mirroredSelfie: { image: { width: 1000, height: 1300 }, lm: portrait({ ls: [0.25, 0.7], rs: [0.75, 0.7], nose: [0.5, 0.35], mouth: [0.5, 0.45] }) },
  closeCropChin: { image: { width: 1000, height: 1000 }, lm: portrait({ ls: [0.9, 0.85], rs: [0.1, 0.85], nose: [0.5, 0.45], mouth: [0.5, 0.72] }) },
  shouldersHidden: { image: { width: 1000, height: 1300 }, lm: portrait({ ls: [0.75, 0.7], rs: [0.25, 0.7], nose: [0.5, 0.35], vis: 0.2 }) },
};

describe("estimateNeckline", () => {
  it("places the neck centre above the shoulder midpoint, below the mouth, on frontal portraits", () => {
    const { image, lm } = FIXTURES.frontalPortrait;
    const est = estimateNeckline(lm, image)!;
    expect(est.shoulderWidth).toBeCloseTo(500, 0);
    expect(est.center.x).toBeCloseTo(500, 0);
    expect(est.center.y).toBeLessThan(0.7 * 1300); // above shoulders
    expect(est.center.y).toBeGreaterThan(0.45 * 1300); // below mouth
    expect(est.rotation).toBeCloseTo(0, 5);
    // neck width = 2 x 0.16 x shoulder width
    expect(est.neckRight.x - est.neckLeft.x).toBeCloseTo(2 * DEFAULT_NECKLINE.neckHalfWidth * 500, 0);
  });

  it("follows tilted shoulders", () => {
    const { image, lm } = FIXTURES.tiltedShoulders;
    const est = estimateNeckline(lm, image)!;
    const expected = Math.atan2((0.74 - 0.66) * 1300, (0.74 - 0.26) * 1000);
    expect(est.rotation).toBeCloseTo(expected, 5);
  });

  it("gives the same result for mirrored selfies", () => {
    const a = estimateNeckline(FIXTURES.frontalPortrait.lm, FIXTURES.frontalPortrait.image)!;
    const b = estimateNeckline(FIXTURES.mirroredSelfie.lm, FIXTURES.mirroredSelfie.image)!;
    expect(b.neckLeft.x).toBeCloseTo(a.neckLeft.x, 5);
    expect(b.center.y).toBeCloseTo(a.center.y, 5);
  });

  it("scales with subject size in landscape photos", () => {
    const { image, lm } = FIXTURES.smallSubjectLandscape;
    const est = estimateNeckline(lm, image)!;
    expect(est.shoulderWidth).toBeCloseTo(0.18 * 1600, 0);
    expect(est.center.x).toBeCloseTo(0.51 * 1600, 0);
  });

  it("never puts the neck base above the chin (or below the shoulders) on tight crops", () => {
    const { image, lm } = FIXTURES.closeCropChin;
    const est = estimateNeckline(lm, image)!;
    const mouthY = 0.72 * 1000;
    const shoulderY = 0.85 * 1000;
    // Chin is too close to the shoulders for the normal lift: stop at the shoulder line.
    const lowest = Math.min(mouthY + DEFAULT_NECKLINE.mouthClearance * est.shoulderWidth, shoulderY);
    expect(est.center.y).toBeGreaterThanOrEqual(lowest - 1e-6);
    expect(est.center.y).toBeLessThanOrEqual(shoulderY + 1e-6);
  });

  it("returns null when shoulders are not visible", () => {
    expect(estimateNeckline(FIXTURES.shouldersHidden.lm, FIXTURES.shouldersHidden.image)).toBeNull();
    expect(estimateNeckline([], { width: 100, height: 100 })).toBeNull();
  });
});

describe("placement and canvas matrix", () => {
  it("maps the necklace neck anchors exactly onto the estimated neck sides", () => {
    for (const { image, lm } of [FIXTURES.frontalPortrait, FIXTURES.tiltedShoulders, FIXTURES.smallSubjectLandscape]) {
      const est = estimateNeckline(lm, image)!;
      const m = necklaceMatrix(placeNecklace(est, anchors), anchors);
      const l = applyMatrix(m, anchors.neckLeft);
      const r = applyMatrix(m, anchors.neckRight);
      expect(l.x).toBeCloseTo(est.neckLeft.x, 6);
      expect(l.y).toBeCloseTo(est.neckLeft.y, 6);
      expect(r.x).toBeCloseTo(est.neckRight.x, 6);
      expect(r.y).toBeCloseTo(est.neckRight.y, 6);
    }
  });

  it("starts manual placement centred in the lower part of the photo (not over the face)", () => {
    const t = fallbackPlacement({ width: 1000, height: 1300 }, anchors);
    expect(t.x).toBe(500);
    expect(t.y).toBeGreaterThan(1300 * 0.6);
    expect(t.scale * 800).toBeCloseTo(220, 6);
  });
});

describe("chooseSubject", () => {
  // A small person in the background of a group selfie: shoulders 11% of the width (measured case).
  const background = portrait({ ls: [0.3, 0.45], rs: [0.19, 0.45], nose: [0.245, 0.3], mouth: [0.245, 0.35] });
  const groupImage = { width: 1600, height: 1200 };

  it("accepts a single, clearly visible person", () => {
    for (const { image, lm } of [FIXTURES.frontalPortrait, FIXTURES.smallSubjectLandscape, FIXTURES.closeCropChin]) {
      const r = chooseSubject([lm], image);
      expect(r.issue).toBeNull();
      expect(r.estimate).toEqual(estimateNeckline(lm, image));
    }
  });

  it("rejects a person who is small in the frame (likely a background person)", () => {
    const r = chooseSubject([background], groupImage);
    expect(r.issue).toBe("too-small");
    expect(r.estimate).toBeNull();
    expect(r.subjectFraction).toBeCloseTo((0.11 * 1600) / 1200, 6);
    expect(r.subjectFraction).toBeLessThan(DEFAULT_SUBJECT_RULES.minShoulderFraction);
  });

  it("uses the largest person when the others are much smaller", () => {
    const front = portrait({ ls: [0.75, 0.8], rs: [0.35, 0.8], nose: [0.55, 0.45], mouth: [0.55, 0.55] });
    const r = chooseSubject([background, front], groupImage);
    expect(r.issue).toBeNull();
    expect(r.people).toBe(2);
    expect(r.estimate!.shoulderWidth).toBeCloseTo(0.4 * 1600, 6);
  });

  it("refuses automatic placement when two people are a similar size", () => {
    const a = portrait({ ls: [0.45, 0.7], rs: [0.15, 0.7], nose: [0.3, 0.4], mouth: [0.3, 0.48] });
    const b = portrait({ ls: [0.85, 0.7], rs: [0.57, 0.7], nose: [0.71, 0.4], mouth: [0.71, 0.48] });
    const r = chooseSubject([a, b], groupImage);
    expect(r.issue).toBe("multiple-people");
    expect(r.estimate).toBeNull();
  });

  it("reports when nobody with visible shoulders is found", () => {
    expect(chooseSubject([], groupImage)).toEqual({ estimate: null, issue: "not-found", subjectFraction: 0, people: 0 });
    expect(chooseSubject([FIXTURES.shouldersHidden.lm], FIXTURES.shouldersHidden.image).issue).toBe("not-found");
  });
});

describe("pendant drop", () => {
  // Matches assets/products/JSN900/manifest.json (default drop = plateCenter.y - neck y).
  const geometry: PendantGeometry = { defaultDrop: 620, minDrop: 380, maxDrop: 740, step: 20, belowShoulders: 0.09 };

  it("uses the artwork's default drop when no person was detected (manual placement)", () => {
    expect(pendantDrop(geometry)).toBe(620);
    expect(pendantDrop(geometry, { dropScale: 0.8 })).toBe(500); // 496 rounded to the 20 px step
  });

  it("matches the artwork's default on a typical frontal portrait", () => {
    const { image, lm } = FIXTURES.frontalPortrait;
    const est = estimateNeckline(lm, image)!;
    // lift 0.16 x 500 = 80 px, + 0.09 x 500 = 45 px -> 125 photo px; neck span 160 px -> 800 image px: x5 = 625 -> 620
    expect(est.neckLift).toBeCloseTo(80, 6);
    expect(pendantDrop(geometry, { estimate: est, anchors })).toBe(620);
  });

  it("raises the pendant when the chin sits close to the shoulders (anchored to the shoulder line)", () => {
    const { image, lm } = FIXTURES.closeCropChin;
    const est = estimateNeckline(lm, image)!;
    // the chin clamp lowers the neck base; a fixed drop from it would put the pendant too low
    expect(est.neckLift).toBeLessThan(DEFAULT_NECKLINE.neckLift * est.shoulderWidth);
    expect(pendantDrop(geometry, { estimate: est, anchors })).toBeLessThan(geometry.defaultDrop);
  });

  it("applies the customer's drop adjustment and stays inside the renderable range", () => {
    const { image, lm } = FIXTURES.frontalPortrait;
    const est = estimateNeckline(lm, image)!;
    expect(pendantDrop(geometry, { estimate: est, anchors, dropScale: 1.1 })).toBe(680);
    expect(pendantDrop(geometry, { estimate: est, anchors, dropScale: 1.5 })).toBe(740);
    expect(pendantDrop(geometry, { dropScale: 0.1 })).toBe(380);
  });
});

describe("manual adjustments", () => {
  it("moves, scales, rotates and resets", () => {
    let s = adjustReducer(NO_ADJUSTMENT, { type: "move", dx: 10, dy: -5 });
    s = adjustReducer(s, { type: "move", dx: 5, dy: 5 });
    s = adjustReducer(s, { type: "scale", value: 1.3 });
    s = adjustReducer(s, { type: "rotate", value: 12 });
    expect(s).toEqual({ dx: 15, dy: 0, scale: 1.3, rotationDeg: 12, drop: 1 });
    expect(adjustReducer(s, { type: "reset" })).toEqual(NO_ADJUSTMENT);
  });

  it("clamps scale and rotation to safe limits", () => {
    expect(adjustReducer(NO_ADJUSTMENT, { type: "scale", value: 9 }).scale).toBe(ADJUST_LIMITS.scale[1]);
    expect(adjustReducer(NO_ADJUSTMENT, { type: "scale", value: 0 }).scale).toBe(ADJUST_LIMITS.scale[0]);
    expect(adjustReducer(NO_ADJUSTMENT, { type: "rotate", value: -90 }).rotationDeg).toBe(-45);
    expect(adjustReducer(NO_ADJUSTMENT, { type: "drop", value: 3 }).drop).toBe(ADJUST_LIMITS.drop[1]);
    expect(adjustReducer(NO_ADJUSTMENT, { type: "drop", value: 0.1 }).drop).toBe(ADJUST_LIMITS.drop[0]);
  });

  it("applies adjustments on top of the automatic placement", () => {
    const t = applyAdjustments({ x: 100, y: 200, scale: 0.5, rotation: 0 }, { dx: 10, dy: 20, scale: 2, rotationDeg: 90, drop: 1 });
    expect(t.x).toBe(110);
    expect(t.y).toBe(220);
    expect(t.scale).toBe(1);
    expect(t.rotation).toBeCloseTo(Math.PI / 2, 10);
  });
});

describe("demo try-on necklace", () => {
  it("is a valid design but not part of the store catalog", () => {
    const demo = DEMO_PRODUCT_BY_STYLE["JSN900"]!;
    expect(validateProductDef(demo)).toEqual([]);
    expect(demo.type).toBe("necklace");
    expect(PRODUCTS.some((p) => p.styleCode === "JSN900")).toBe(false);
  });
});
