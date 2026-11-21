# Demo catalog (temporary jewelry images) - Milestone 1

Status: **local development only.** Browse, view and zoom temporary demo products built
from our existing jewelry image collection. Not for sale, synthetic prices, nothing is
published, no database records. Cart/checkout for catalog products is Milestone 2.

## What it is

- **Ordinary (catalog) products** with fixed photos, kept completely separate from the
  personalised designs (JS0001-JS0003). Photos are never fed into the design engine.
- Every product is clearly marked DEMO: banner on every page, DEMO badge on cards,
  "Synthetic test price", "Not yet supplied" for metal / stones / sizes, purchase disabled.
- Titles describe only what the image looks like ("Blue Halo Ring"). Material, gemstone,
  purity and authenticity words are rejected by the importer.

## Where things live

| Path | Purpose | In Git |
|---|---|---|
| `services/image/catalog/overrides.demo.json` | Reviewed mapping: which source image is which demo product, category, title, tags, synthetic price, exclusions, lifestyle images | yes (filenames only) |
| `services/image/src/catalog/` | Schema, importer, image-service routes, tests | yes |
| `services/image/scripts/catalog-import.ts` | Import / status / rollback command | yes |
| `services/image/.demo-catalog/` | Generated: web images, numbered catalog versions, reports, `current.json` | **no** (git-ignored) |
| `apps/storefront/src/app/demo/catalog/**/page.demo.tsx` | Demo pages | yes |
| Source images (e.g. `Downloads/Rings`) | Original files - only ever read | **no** |

The temporary images are never committed (the repository is public).

## Running it locally

```bash
# 1. Import (source folders are only read). Use --dry-run first to see the report.
npm run catalog:import -w @jemsutra/image-service -- \
  --source "C:/Users/<you>/Downloads/Rings" --source "C:/Users/<you>/Downloads/Earrings" \
  --source "C:/Users/<you>/Downloads/Jewelry_Sets_Concepts_and_Lifestyle" \
  --source "C:/Users/<you>/Downloads/Necklaces_and_Pendants"

# 2. Start the image service with the catalog enabled
DEMO_CATALOG_DIR=.demo-catalog npm run start -w @jemsutra/image-service

# 3. Open http://localhost:3000/demo/catalog  (storefront in `next dev`)
```

Other commands: `-- --status`, `-- --rollback`, `-- --activate v0001`, `--json`.
Exit status: 0 ok, 1 problems found (nothing written), 2 usage error.

## Isolation (independent layers)

| Layer | Behaviour |
|---|---|
| Build | Demo pages (`page.demo.tsx`) are compiled only in `next dev` or a build with `ENABLE_DEMO_CATALOG=true`. A normal production build contains no demo pages, components or catalog code (checked down to source maps). |
| Build guard | A build with `ENABLE_DEMO_CATALOG=true` **fails** on hosting/CI platforms (`VERCEL`, `NETLIFY`, `CF_PAGES`, `RENDER`, `CI`, ... set), so a stray variable can't ship demo pages. |
| Proxy (`src/proxy.ts`, `/demo/*` only) | Production server: 404 unless `ENABLE_DEMO_CATALOG=true` **and** the request's Host / X-Forwarded-Host is loopback (localhost, 127.0.0.1, ::1). |
| Image service `/catalog/*` | 404 unless `DEMO_CATALOG_DIR` is set (in production also `ENABLE_DEMO_CATALOG=true`), the folder carries the importer's marker file, and the request host is loopback. Asset ids and variants are pattern-checked and looked up in the active catalog; responses never contain paths or error details. |
| Data | The generated catalog is git-ignored and never deployed, so even a misconfigured server has nothing to show. |
| Search engines | `robots.txt` disallows `/demo/`; pages send `noindex` meta and `X-Robots-Tag` (an extra layer, not the isolation itself). |

Never set `ENABLE_DEMO_CATALOG` for the live store.

## HTTP status codes

With Cache Components the page shell streams first, which fixes the status at 200; a
`notFound()` inside the page can then only show the not-found UI. So the Proxy decides
**before rendering**: unknown categories, malformed slugs (pattern + length) and unknown
demo paths get a genuine **404** immediately; well-formed slugs are checked with a
status-only image-service call (`/catalog/exists/:slug`, 204/404, 1.5 s timeout). The 404
is a rewrite to a route-less path, which renders the site's normal not-found page with
status 404 (the address bar keeps the requested URL). If the image service is down, the
page renders its "No demo catalog loaded" message.

## Tests

- `services/image`: `npm test` (importer, schema, routes, hardening: duplicates, re-import,
  replacement, rollback, damaged/small images, output-folder safety, path traversal, hosts).
- `apps/storefront`: `npm test` (route rules, proxy, search/filter/sort, gallery logic).
  Optional live checks: `DEMO_HTTP_BASE=http://localhost:3000 npm test` with both servers running.

## Overrides file rules (enforced by the importer)

- `id`: `DEMO-<RNG|EAR|NCK|SET>-NNN`, prefix must match the category; **stable forever** -
  it is the product's identity, independent of its images.
- `title`: 3-60 chars, no claim words (gold, diamond, sapphire, 18k, genuine, ...).
- `tags`: fixed visual vocabulary (colour / shape / style), used for filters.
- `price`: repeated-digit synthetic values only (1111, 22222, ...).
- `images`: source paths `"<folder>/<file>"`; first is the primary image, then gallery
  order. One image may belong to only one product; excluded and lifestyle images can't be used.
- `reviewNotes` (optional): internal notes such as "Replace: ..."; shown on the demo product
  page as "Flagged for replacement" and listed in every import report.
- New source images are never added automatically: they are reported as "unassigned" until
  a reviewed mapping lists them.

## How images are processed

- De-duplicated by SHA-256 (the file without a `_2` / `(1)` suffix counts as the original).
  Asset ids are `img_<first 16 hex of sha256>`, so identical bytes always map to one asset.
- Generated WebP per asset: `card` (1000x1250, plain studio backgrounds trimmed and
  re-padded; scene backgrounds extended with a soft blur) and `full` (original aspect,
  max 1600 px) for the product page and zoom. Metadata is stripped. Originals untouched.
- Safety: one folder level, symlinks skipped, 30 MB cap, format detected from content,
  60 MP decode limit, atomic writes. Every product image is fully decoded and re-hashed
  before anything is written (also in `--dry-run`); shorter side under 300 px is refused,
  under 800 px warned.
- Duplicates: the file without a copy suffix is the original, then the alphabetically first
  `folder/file` - the same result whatever order `--source` folders are given in.
- Output folder: must not overlap a source folder; must be new, empty or already marked
  with `.thegemsutra-demo-catalog` (so the importer can't write into unrelated project
  folders); inside a git repository it must be git-ignored.
- Re-importing identical input writes nothing and keeps the active version.

## Replacing demo images with approved client photos (later)

1. Add the client's folder as another `--source`.
2. In the overrides file, change a product's `images` to the new files - **keep its `id`**.
3. `--dry-run` shows the change report (added / removed / details changed / images changed).
4. Import: a new version (`v0002`, ...) becomes active; the previous one is kept.
5. If anything is wrong: `--rollback` (no restart needed).

Gallery order = order of `images`. Multiple images per product are supported (thumbnails +
viewer); the current demo set has one unique image per design.

## Known limitations

- Each demo design has only one unique image (every `_2` file is a byte copy), so real
  multi-angle galleries can't be demonstrated with this set.
- The two bridal-set images have a checkerboard pattern baked into the JPEG (flagged with
  `reviewNotes`; replace them).
- Three necklace images are 788 px wide (the importer warns; zoom is softer).
- The loopback check trusts the Host / X-Forwarded-Host headers; it is defence in depth on
  top of the build gating and the absence of catalog data on deployed servers.
- Titles in the overrides are visual descriptions written for testing, not product names.
