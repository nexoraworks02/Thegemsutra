/** Shown on every DEMO catalog page so temporary products can never be mistaken for real ones. */
export function DemoBanner({ version }: { version?: string }) {
  return (
    <div role="note" className="bg-ink text-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-2 text-[12px] leading-snug flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="eyebrow text-blush">Demo catalog</span>
        <span>Temporary images for development and testing. Not for sale · prices are synthetic · details not yet supplied.</span>
        {version && <span className="text-white/70">Data {version}</span>}
      </div>
    </div>
  );
}
