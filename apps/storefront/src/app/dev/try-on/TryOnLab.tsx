"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  ADJUST_LIMITS,
  DEMO_PRODUCT_BY_STYLE,
  FONT_BY_CODE,
  METAL_BY_CODE,
  NO_ADJUSTMENT,
  adjustReducer,
  applyAdjustments,
  chooseSubject,
  configToQuery,
  fallbackPlacement,
  necklaceMatrix,
  normalizeConfig,
  placeNecklace,
  sanitizeEngraving,
  type NecklaceAnchors,
  type NecklineEstimate,
  type PlacementTransform,
} from "@jemsutra/design-engine";
import { IMAGE_URL } from "@/lib/media";
import { detectPoses, loadPoseLandmarker } from "./pose";

const PRODUCT = DEMO_PRODUCT_BY_STYLE["JSN900"]!;
const MAX_SIDE = 1600; // photos are downscaled on the device before detection
const NAME_MAX = PRODUCT.engravings[0]!.maxChars;

type Status =
  | { kind: "idle" }
  | { kind: "loading"; text: string }
  | { kind: "ok"; text: string }
  | { kind: "warn"; text: string }
  | { kind: "error"; text: string };

export function TryOnLab() {
  const [name, setName] = useState("Ayesha");
  const [font, setFont] = useState(PRODUCT.defaultFont);
  const [metal, setMetal] = useState(PRODUCT.defaultMetal);
  const [anchors, setAnchors] = useState<NecklaceAnchors | null>(null);
  const [necklace, setNecklace] = useState<HTMLImageElement | null>(null);
  const [photo, setPhoto] = useState<HTMLCanvasElement | null>(null);
  const [estimate, setEstimate] = useState<NecklineEstimate | null>(null);
  const [auto, setAuto] = useState<PlacementTransform | null>(null);
  const [adj, dispatch] = useReducer(adjustReducer, NO_ADJUSTMENT);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [showGuides, setShowGuides] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  // 1. Necklace geometry (neck anchors) from the image service.
  useEffect(() => {
    fetch(`${IMAGE_URL}/tryon-meta/${PRODUCT.styleCode}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`status ${r.status}`))))
      .then((m: NecklaceAnchors) => setAnchors(m))
      .catch((e) => setStatus({ kind: "error", text: `Image service not reachable or try-on demo disabled (ENABLE_TRYON_DEMO). ${e.message}` }));
  }, []);

  // 2. The personalised, transparent necklace image (debounced while typing).
  const config = useMemo(() => normalizeConfig(PRODUCT, { metal, font, engravings: { e1: name } }), [metal, font, name]);
  const necklaceUrl = useMemo(() => {
    const q = configToQuery(PRODUCT, config, { include: "visual" });
    q.set("w", "1200");
    return `${IMAGE_URL}/img/${PRODUCT.styleCode}/${PRODUCT.slug}.png?${q.toString()}`;
  }, [config]);

  useEffect(() => {
    const t = setTimeout(() => {
      const img = new Image();
      img.crossOrigin = "anonymous"; // needed so the canvas can be downloaded
      img.onload = () => setNecklace(img);
      img.onerror = () => setStatus({ kind: "error", text: "Could not load the necklace image from the image service." });
      img.src = necklaceUrl;
    }, 250);
    return () => clearTimeout(t);
  }, [necklaceUrl]);

  // Anchors in the loaded image's pixel space (in case a different width is served).
  const scaledAnchors = useMemo<NecklaceAnchors | null>(() => {
    if (!anchors || !necklace) return null;
    const k = necklace.naturalWidth / anchors.width;
    return {
      width: necklace.naturalWidth,
      height: necklace.naturalHeight,
      neckLeft: { x: anchors.neckLeft.x * k, y: anchors.neckLeft.y * k },
      neckRight: { x: anchors.neckRight.x * k, y: anchors.neckRight.y * k },
      mmPerPx: anchors.mmPerPx ? anchors.mmPerPx / k : undefined,
    };
  }, [anchors, necklace]);

  // 3. Selfie upload -> downscale on the device -> detect.
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setStatus({ kind: "error", text: "Please choose an image file." });
    setStatus({ kind: "loading", text: "Reading photo on this device..." });
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      const k = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
      const c = document.createElement("canvas");
      c.width = Math.round(bitmap.width * k);
      c.height = Math.round(bitmap.height * k);
      c.getContext("2d")!.drawImage(bitmap, 0, 0, c.width, c.height);
      bitmap.close();
      dispatch({ type: "reset" });
      setPhoto(c);
    } catch {
      setStatus({ kind: "error", text: "This photo could not be read. Try a JPEG or PNG." });
    }
  };

  const detect = useCallback(async () => {
    if (!photo || !scaledAnchors) return;
    // Nothing is drawn until we know where the neck is (never on top of a face).
    setAuto(null);
    setEstimate(null);
    setStatus({ kind: "loading", text: "Finding your neckline (first time loads the pose model)..." });
    try {
      const { poses, delegate, ms } = await detectPoses(photo);
      const subject = chooseSubject(poses, photo);
      const size = `subject ${Math.round(subject.subjectFraction * 100)}% of photo, ${subject.people} ${subject.people === 1 ? "person" : "people"}, ${delegate}, ${ms} ms`;
      if (subject.estimate) {
        setEstimate(subject.estimate);
        setAuto(placeNecklace(subject.estimate, scaledAnchors));
        setStatus({ kind: "ok", text: `Necklace placed automatically (confidence ${Math.round(subject.estimate.confidence * 100)}%, ${size}). Drag or use the sliders to fine-tune.` });
      } else {
        const why =
          subject.issue === "multiple-people"
            ? "There seems to be more than one person in this photo. Please use a photo of just you."
            : subject.issue === "too-small"
              ? "You look quite small in this photo. Please use a closer photo of just you, with your shoulders visible."
              : "We couldn't find your shoulders. Please use a front-facing photo showing your neck and shoulders.";
        setStatus({ kind: "warn", text: `${why} Or place the necklace by hand. (${size})` });
      }
    } catch (e) {
      setStatus({ kind: "error", text: `Pose detection failed to load (${(e as Error).message}). You can still place the necklace by hand.` });
    }
  }, [photo, scaledAnchors]);

  const placeByHand = () => {
    if (!photo || !scaledAnchors) return;
    dispatch({ type: "reset" });
    setAuto(fallbackPlacement(photo, scaledAnchors));
    setStatus({ kind: "warn", text: "Placed for manual positioning. Drag it onto your neckline and use the sliders to fit." });
  };

  useEffect(() => {
    detect();
  }, [detect]);

  // Warm the model up in the background so the first detection is quicker.
  useEffect(() => {
    loadPoseLandmarker().catch(() => {});
  }, []);

  // 4. Compose on the canvas.
  const transform = auto ? applyAdjustments(auto, adj) : null;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !photo) return;
    canvas.width = photo.width;
    canvas.height = photo.height;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(photo, 0, 0);
    if (necklace && scaledAnchors && transform) {
      ctx.setTransform(...necklaceMatrix(transform, scaledAnchors));
      ctx.drawImage(necklace, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    if (showGuides && estimate) {
      ctx.fillStyle = "#e11d48";
      for (const p of [estimate.neckLeft, estimate.neckRight, estimate.center]) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(4, photo.width / 200), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [photo, necklace, scaledAnchors, transform, showGuides, estimate]);

  // Drag to move (pointer works for mouse and touch).
  const toCanvas = (dx: number, dy: number) => {
    const c = canvasRef.current!;
    const k = c.width / c.getBoundingClientRect().width;
    return { dx: dx * k, dy: dy * k };
  };

  const download = () => {
    canvasRef.current?.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `thejemsutra-try-on-${sanitizeEngraving(name, NAME_MAX).replace(/\s+/g, "-") || "necklace"}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  };

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
      <div>
        {photo ? (
          <canvas
            ref={canvasRef}
            className="w-full h-auto rounded-sm border border-line bg-paper touch-none cursor-move"
            onPointerDown={(e) => {
              drag.current = { x: e.clientX, y: e.clientY };
              (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!drag.current) return;
              const d = toCanvas(e.clientX - drag.current.x, e.clientY - drag.current.y);
              drag.current = { x: e.clientX, y: e.clientY };
              dispatch({ type: "move", ...d });
            }}
            onPointerUp={() => (drag.current = null)}
            aria-label="Try-on preview. Drag to move the necklace."
          />
        ) : (
          <label className="flex flex-col items-center justify-center aspect-[4/5] max-h-[70vh] w-full border-2 border-dashed border-line rounded-sm bg-paper cursor-pointer text-center p-6">
            <span className="font-serif text-xl">Upload a selfie</span>
            <span className="mt-2 text-sm text-muted">Front-facing, shoulders visible, neck uncovered works best.</span>
            <span className="mt-1 text-xs text-muted">Stays on your device - nothing is uploaded.</span>
            <input type="file" accept="image/*" capture="user" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
        )}
        {status.kind !== "idle" && (
          <p role="status" className={`mt-3 text-sm ${status.kind === "error" ? "text-sale" : status.kind === "warn" ? "text-gold-dark" : "text-muted"}`}>
            {status.text}
          </p>
        )}
      </div>

      <aside className="space-y-6">
        <section className="space-y-3">
          <h2 className="eyebrow">1 · Your necklace</h2>
          <label className="block text-sm">
            <span className="flex justify-between text-xs text-muted mb-1"><span>Name</span><span>{NAME_MAX - name.length} left</span></span>
            <input value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} className="w-full border border-line bg-paper px-3 py-2" />
          </label>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <label className="block">
              <span className="block text-xs text-muted mb-1">Font</span>
              <select value={font} onChange={(e) => setFont(e.target.value)} className="w-full border border-line bg-paper px-2 py-2">
                {PRODUCT.fonts.map((f) => <option key={f} value={f}>{FONT_BY_CODE[f]?.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs text-muted mb-1">Metal</span>
              <select value={metal} onChange={(e) => setMetal(e.target.value)} className="w-full border border-line bg-paper px-2 py-2">
                {PRODUCT.metals.map((m) => <option key={m.metal} value={m.metal}>{METAL_BY_CODE[m.metal]?.name}</option>)}
              </select>
            </label>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- transparent render from the image service */}
          {necklace && <img src={necklace.src} alt={`Necklace reading ${config.engravings.e1 || "Name"}`} className="w-full border border-line rounded-sm bg-[repeating-conic-gradient(#eee_0_25%,#fff_0_50%)] bg-[length:16px_16px]" />}
          <p className="text-xs text-muted">Transparent render (checkerboard = see-through). Demo artwork; the name uses the real font outlines.</p>
        </section>

        <section className="space-y-3">
          <h2 className="eyebrow">2 · Photo</h2>
          <label className="inline-block border border-ink px-4 py-2 text-xs tracking-[0.14em] uppercase cursor-pointer hover:bg-ink hover:text-ivory">
            {photo ? "Choose another photo" : "Upload or take a selfie"}
            <input type="file" accept="image/*" capture="user" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          {photo && (
            <button type="button" onClick={detect} className="ml-2 text-xs underline underline-offset-4">Re-detect</button>
          )}
          {photo && scaledAnchors && !auto && status.kind !== "loading" && (
            <button type="button" onClick={placeByHand} className="ml-2 text-xs underline underline-offset-4">Place by hand</button>
          )}
        </section>

        {photo && transform && (
          <section className="space-y-3">
            <h2 className="eyebrow">3 · Adjust</h2>
            <label className="block text-xs text-muted">
              Size {Math.round(adj.scale * 100)}%
              <input type="range" min={ADJUST_LIMITS.scale[0]} max={ADJUST_LIMITS.scale[1]} step={0.01} value={adj.scale}
                onChange={(e) => dispatch({ type: "scale", value: Number(e.target.value) })} className="w-full" />
            </label>
            <label className="block text-xs text-muted">
              Rotation {adj.rotationDeg.toFixed(0)}°
              <input type="range" min={ADJUST_LIMITS.rotationDeg[0]} max={ADJUST_LIMITS.rotationDeg[1]} step={1} value={adj.rotationDeg}
                onChange={(e) => dispatch({ type: "rotate", value: Number(e.target.value) })} className="w-full" />
            </label>
            <div className="flex flex-wrap gap-2 text-xs">
              {([["↑", 0, -1], ["↓", 0, 1], ["←", -1, 0], ["→", 1, 0]] as const).map(([l, x, y]) => (
                <button key={l} type="button" aria-label={`Move ${l}`} onClick={() => dispatch({ type: "move", dx: x * (photo.width / 200), dy: y * (photo.width / 200) })}
                  className="border border-line px-3 py-1 hover:border-ink">{l}</button>
              ))}
              <button type="button" onClick={() => dispatch({ type: "reset" })} className="border border-line px-3 py-1 hover:border-ink">Reset</button>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={showGuides} onChange={(e) => setShowGuides(e.target.checked)} /> Show detection guides
            </label>
            <p className="text-xs text-muted">
              Size and position are approximate: a photo has no exact real-world scale, so fine-tune by hand.
            </p>
            <button type="button" onClick={download} className="w-full bg-ink text-ivory py-3 text-[12px] tracking-[0.16em] uppercase hover:bg-gold-dark">
              Download photo
            </button>
          </section>
        )}
      </aside>
    </div>
  );
}
