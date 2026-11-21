"use client";

import { useEffect, useRef, useState } from "react";
import { demoImageUrl, demoSrcSet, galleryHasNavigation, galleryImages, galleryStep, type DemoImage } from "@/lib/catalog-shared";

/**
 * Product gallery: main image with hover zoom (mouse), thumbnails when there is more
 * than one image, and a full-screen viewer (click / tap) where the image can be
 * zoomed and panned. Keyboard: arrows switch images, Escape closes the viewer.
 */
/** Stop the page behind the full-screen viewer from scrolling; returns the undo function. */
function lockPageScroll(): () => void {
  const body = document.body;
  const previous = body.style.overflow;
  body.style.overflow = "hidden";
  return () => {
    body.style.overflow = previous;
  };
}

export function ProductGallery({ images, title }: { images: DemoImage[]; title: string }) {
  const sorted = galleryImages(images);
  const [index, setIndex] = useState(0);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [viewer, setViewer] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const current = sorted[index];
  const count = sorted.length;
  const hasNav = galleryHasNavigation(count);
  const go = (d: number) => setIndex((i) => galleryStep(i, d, count));

  useEffect(() => {
    if (!viewer) return;
    const unlockScroll = lockPageScroll();
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setViewer(false);
      else if (galleryHasNavigation(count) && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
        setZoomed(false);
        const d = e.key === "ArrowRight" ? 1 : -1;
        setIndex((i) => galleryStep(i, d, count));
      }
    };
    window.addEventListener("keydown", onKey);
    const opener = openerRef.current;
    return () => {
      unlockScroll();
      window.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [viewer, count]);

  if (!current) return <div className="aspect-square tile" />;

  return (
    <div>
      <button
        ref={openerRef}
        type="button"
        onClick={() => (setZoomed(false), setViewer(true))}
        onMouseMove={(e) => {
          if (!window.matchMedia("(hover: hover)").matches) return; // no hover zoom on touch screens
          const r = e.currentTarget.getBoundingClientRect();
          setHover({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
        }}
        onMouseLeave={() => setHover(null)}
        className="relative block w-full aspect-square overflow-hidden rounded-sm tile cursor-zoom-in"
        aria-label={`Open full-screen view of ${title}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- sized by the image service */}
        <img
          src={demoImageUrl(current.asset, "full", 800)}
          srcSet={demoSrcSet(current.asset, "full", [600, 800, 1200])}
          sizes="(min-width: 1024px) 50vw, 100vw"
          alt={current.alt}
          className="h-full w-full object-contain transition-transform duration-200 ease-out"
          style={hover ? { transform: "scale(2)", transformOrigin: `${hover.x}% ${hover.y}%` } : undefined}
        />
        <span className="absolute right-3 bottom-3 bg-white/90 border border-line px-2 py-1 text-[11px] text-muted pointer-events-none">
          <span className="hidden [@media(hover:hover)]:inline">Hover to zoom · click to enlarge</span>
          <span className="[@media(hover:hover)]:hidden">Tap to enlarge</span>
        </span>
      </button>

      {hasNav && (
        <ul className="mt-3 flex gap-2" aria-label="Product images">
          {sorted.map((im, i) => (
            <li key={im.asset}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show image ${i + 1} of ${count}`}
                aria-current={i === index ? "true" : undefined}
                className={`option block h-16 w-16 overflow-hidden ${i === index ? "option-active" : ""}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- thumbnail */}
                <img src={demoImageUrl(im.asset, "card", 120)} alt="" className="h-full w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {viewer && (
        <div role="dialog" aria-modal="true" aria-label={`${title} - full-screen image`} className="fixed inset-0 z-50 bg-ink/95 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 text-white text-sm">
            <span>
              {title}
              {hasNav && <span className="text-white/60"> · {index + 1} / {count}</span>}
            </span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setZoomed((z) => !z)} className="border border-white/40 px-3 py-1.5 hover:bg-white/10" aria-pressed={zoomed}>
                {zoomed ? "Fit to screen" : "Zoom in"}
              </button>
              <button ref={closeRef} type="button" onClick={() => setViewer(false)} className="border border-white/40 px-3 py-1.5 hover:bg-white/10">
                Close
              </button>
            </div>
          </div>
          <div className={`relative flex-1 ${zoomed ? "overflow-auto" : "overflow-hidden flex items-center justify-center"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- sized by the image service */}
            <img
              src={demoImageUrl(current.asset, "full", 1200)}
              alt={current.alt}
              onClick={() => setZoomed((z) => !z)}
              className={zoomed ? "max-w-none w-[200%] sm:w-[1200px] cursor-zoom-out" : "max-h-full max-w-full object-contain cursor-zoom-in p-2"}
            />
            {hasNav && !zoomed && (
              <>
                <button type="button" onClick={() => go(-1)} aria-label="Previous image" className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/90 px-3 py-2 text-ink">
                  ‹
                </button>
                <button type="button" onClick={() => go(1)} aria-label="Next image" className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/90 px-3 py-2 text-ink">
                  ›
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
