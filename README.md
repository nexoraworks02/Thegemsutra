# THEJEMSUTRA

Personalized, made-to-order jewelry store. Shoppers design their piece (metal, birthstones, engraving, font, size) and see it rendered live.

- Research: [research/jewlr-analysis.md](research/jewlr-analysis.md)
- Build plan & confirmed decisions: [docs/build-plan.md](docs/build-plan.md)

## Repository layout

```
apps/
  storefront/        Next.js 16 storefront (home, product designer, bag)
  backend/           Medusa v2 commerce backend (needs PostgreSQL)
services/
  image/             Image render service: stacks metal + stones + engraving layers
packages/
  design-engine/     Shared product options, validation, URL state, pricing (+ tests)
assets/
  products/{style}/  Render layers + manifest.json per product
  stones/{shape}/    Stone images
```

### How the pieces fit

```
Storefront ──(price, validation, URL state)──► design-engine  ◄── Backend (re-prices at checkout)
     │
     └── <img src="IMAGE_URL/img/JS0001/...webp?m=14KR&s1=RUBY&e1=Ayesha&ef=script">
                         │
                 Image service ── reads assets/ layers ── composes WebP (cached)
```

## Run it locally

Requirements: Node 20+ (tested on Node 24), npm 10+.

```bash
npm install
```

The image service reads designs from the backend: copy `services/image/.env.example` to `.env` and use the same `INTERNAL_API_KEY` as `apps/backend/.env`. The storefront needs `REVALIDATE_SECRET` (same as the backend) in `apps/storefront/.env.local`.

```bash
npm run dev:image
```

```bash
npm run dev:storefront
```

- Storefront: http://localhost:3000
- Image service: http://localhost:4100/health

`npm run dev` starts both together.

### Backend (Medusa) + local database

The backend lives in `apps/backend` with its own `node_modules` (not part of the root workspaces).

For development the database is **PostgreSQL 17 from the `embedded-postgres` npm package** — no system install needed (the official Windows installer downloads are blocked on our network). Data lives in `apps/backend/.pgdata` (git-ignored), always created as UTF-8. Production uses a normal managed PostgreSQL; only `DATABASE_URL` changes.

From `apps/backend`, first time:

```bash
npm install
```

```bash
cp .env.template .env
```

```bash
npm run db
```

Leave that running, then in a second terminal:

```bash
npx medusa db:migrate
```

```bash
npm run seed
```

```bash
npx medusa user -e admin@jemsutra.local -p choose-a-password
```

Every day after that: `npm run db` in one terminal, `npm run dev` in another.

```bash
npm run dev
```

- API: http://localhost:9000 · Admin dashboard: http://localhost:9000/app
- Custom store endpoints: `GET /store/designs`, `POST /store/designs/:style/price`, `POST /store/designs/:style/cart-items` (adds a design to a cart with a server-calculated price and the workshop sheet in line metadata)
- The seed creates the Pakistan region (PKR), Lahore Workshop, free + express delivery, and the starter designs.
- Databases created before the Designs page existed: run `npx medusa exec ./src/scripts/import-designs.ts` once.

### Managing designs (admin → Designs)

Designs (metals and prices, stone slots and stone prices, engraving fields, fonts, sizes, packaging, sale %) are edited in the admin at http://localhost:9000/app/designs - no code changes needed.

- **New design** or **Duplicate** an existing one; save as **draft** (hidden) or **publish** (live on the store).
- **Render artwork**: until a design has its own 3D renders, it can borrow the artwork of a similar design.
- Every save is validated (with plain-language errors), creates/updates the Medusa product (one "Made to order" variant) and refreshes the storefront.
- Only drafts can be deleted; unpublish a design to hide it.

### Tests and checks

```bash
npm test
```

```bash
npm run typecheck
```

### Regenerate demo render layers

The demo products use generated placeholder layers. Real products will use layers from 3D renders in the same format (see `services/image/src/manifest.ts`).

```bash
npm run layers -w @jemsutra/image-service
```

## Image URL format

```
GET /img/{style}/{seo-name}.webp?w=800&v=top&m=14KR&s1=RUBY&s2=S-BTOP&e1=Ayesha&e2=Hamza&ef=script
GET /stones/{shape}/{code}.webp?w=120
```

| Key | Meaning |
|---|---|
| `m` | metal code (`SS`, `GP`, `10KY`, `10KW`, `10KR`, `14KY`, `14KW`, `14KR`) |
| `sc` | stone count (multi-stone designs) |
| `s1..sN` | stone per slot (`RUBY`, `EMER`, `S-BTOP`, `CZ`, ...) |
| `e1`, `e2` | engraving text |
| `ef` | engraving font (`classic`, `modern`, `italic`, `script`) |
| `sz`, `pk` | ring size, packaging (storefront URLs only, ignored by images) |
| `w`, `v` | image width, view |

Invalid values fall back to product defaults, so the service only renders allowed combinations and cache keys stay stable.

## Status

| Part | Status |
|---|---|
| Design engine (options, pricing, URL state, validation, production stages) | ✅ working, 21 tests |
| Image render service | ✅ working with demo layers |
| Storefront: home, product designer, bag | ✅ working, bag stored in the Medusa cart |
| Medusa backend + local PostgreSQL 17 | ✅ running: Pakistan/PKR region, delivery options, designs seeded, admin dashboard |
| Checkout (cash on delivery) + order confirmation | ✅ working end to end |
| Admin Designs manager (create, edit, publish designs without code) | ✅ working |
| Workshop flow (stages, emails, workshop sheet, tracking) | ✅ working |
| Online payments (card, JazzCash, Easypaisa), customer accounts, order emails | ⏳ next |
