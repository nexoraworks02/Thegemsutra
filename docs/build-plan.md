# THEJEMSUTRA — Build Plan

A personalized, made-to-order jewelry store, inspired by what makes jewlr.com work (see `research/jewlr-analysis.md`) and designed to go beyond it.
Plan version 1 · 2026-11-17

---

## 1. Goal in one sentence

Let shoppers **design their own jewelry** (metal, stones, engraving, font, size) and **see exactly what they'll get**, live. Then make it to order and deliver it with a premium, gift-friendly experience.

## 2. What we copy, and where we beat Jewlr

| Copy (proven) | Beat (our edge) |
|---|---|
| Live image of the exact design | **360° 3D viewer** of the design (Jewlr is 2D only) |
| Step-by-step accordion designer with live price | **Instant preview on the shopper's device** (no server wait, no "LOADING" screens) |
| Design saved in the URL + remembered across the site | **Personalized try-on**: the model wears *your* name and stones (Jewlr's is generic) |
| Send a Hint, gift wrap, gift quiz | **Personalized video / spin** of the customer's design |
| Cart upsells (box, add-ons, protection) | Softer upsells: no pre-selected paid plans |
| Reviews, VIP points, free shipping & long returns | Google + Apple sign-in, **guest wishlist** |
| SEO collections + schema + blog | Real H1s, a lean site, fewer trackers, faster pages |
| International currencies | **Local payments** (e.g. JazzCash/Easypaisa/COD if Pakistan) |
| — | **Build-your-own engagement ring** with certified diamond search (later phase) |

## 3. Decisions — ✅ CONFIRMED (2026-11-17)

All six recommended options were accepted. The "Recommended" column is now the decision.

| # | Decision | Decision (confirmed) | Alternatives considered |
|---|---|---|---|
| D1 | **Launch market** | Pakistan first (PKR, local payments, COD), then international in USD | USA/global first; both at once |
| D2 | **Platform** | **Custom headless**: Next.js + Medusa (open-source commerce engine) + our own design/option engine | Shopify headless (struggles with per-stone pricing and thousands of combinations); fully custom backend |
| D3 | **Preview technology at launch** | **2D layered images** (like Jewlr), built from 3D models so we can add a 3D viewer in Phase 3 | 3D configurator from day one (slower to launch) |
| D4 | **Launch catalog** | 20–30 hero designs (name necklaces, birthstone/mother's rings, couples rings, initial pendants) | Larger catalog (needs more 3D/render work) |
| D5 | **Manufacturing** | Partner workshop with a clear order sheet + status updates | Own workshop |
| D6 | **Brand look** | Premium/minimal, matching the "Jemsutra" name (to design in Phase 0) | — |

## 4. System architecture

```
                 ┌──────────────────────────────────────────┐
  Shopper ───►   │  Storefront  (Next.js, React, Tailwind)  │  ◄── Headless CMS (banners, pages, blog)
                 │  • Designer UI   • Collections  • Cart   │
                 └───────┬───────────────┬──────────────────┘
                         │ REST/GraphQL  │ image URLs
              ┌──────────▼─────────┐  ┌──▼─────────────────────────┐
              │ Commerce backend   │  │ Image Render Service        │
              │ (Medusa + Postgres)│  │ (Node + Sharp + font engine)│
              │ • products/options │  │ • stacks layers per choice  │
              │ • pricing engine   │  │ • draws engraving text      │
              │ • cart/orders/users│  │ • cached on CDN             │
              │ • VIP, reviews     │  └────────────────────────────┘
              └──────────┬─────────┘
       ┌─────────────────┼────────────────────┬─────────────────┐
   Payments          Email/SMS            Search            Admin + Workshop
 (Stripe + local)  (Resend/Klaviyo)   (Meilisearch)     (order sheets, status)
```

### Recommended stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Next.js (App Router) + TypeScript + Tailwind** | Server-rendered pages for SEO, fast, large talent pool |
| Commerce | **Medusa v2** (Node.js) + **PostgreSQL** + Redis | Free/open source, gives cart, checkout, orders, admin, multi-currency; we add custom modules |
| Design/option engine | Our own module in Medusa | The heart of the product: steps, stone slots, per-slot pricing |
| Image service | Node + **Sharp** + **opentype.js** (text to path) | Composes PNG/WebP layers + engraving per URL |
| CDN | Cloudflare (or Bunny) | Caches every rendered combination |
| 3D (Phase 3) | **React Three Fiber** + GLB models, `<model-viewer>` for AR | Same 3D files we use to make the 2D layers |
| CMS | **Payload CMS** or Sanity | Banners, landing pages, blog, gift guides |
| Search | Meilisearch | Fast instant search with suggestions |
| Payments | Stripe (international) + PK gateway (Safepay/PayFast) + JazzCash/Easypaisa + COD | Depends on D1 |
| Email/SMS | Resend (transactional) + Klaviyo (marketing flows) | Order emails, abandoned cart, Send a Hint |
| Reviews | Own reviews module (photos, helpful votes) | No monthly fee, full control |
| Analytics | GA4 + Microsoft Clarity + server events | Keep trackers minimal for speed |
| Hosting | Vercel (frontend) + Railway/Render or AWS (backend, image service) | Simple to start, scales later |
| Errors | Sentry | — |

## 5. The core: design & pricing engine

### 5.1 Data model (simplified)

```
Product            id, style_code, name, slug, type (ring|necklace|bracelet|earring),
                   base_price_per_metal{}, size_rule_id, steps[] (ordered)
Metal              code (SS, GP, 10KY, 10KW, 10KR, 14KY…), name, color, tier
StoneType          code (05EMER, S12BTPZ…), name, birth_month, kind (genuine|lab|simulated|cz), meaning
StoneSlot          product_id, slot_no, shape, size_mm, default_stone
SlotStonePrice     slot_id × stone_code → price        ← same stone costs more in bigger slots
StoneCountRule     product_id, min, max, base_count, price_per_extra   (mother's rings 3–11)
EngravingSlot      product_id, key (e1,e2,e0), max_chars, extra_price, fonts[]
Font               code, name, file (for preview + workshop)
SizeRule           range (4–12 or 5–15), step 0.5, surcharge_from, surcharge
Charm / Chain      options with prices (necklaces)
Packaging          standard, premium (+price), gift bag + card (+price)
DesignConfig       JSON: {sku, sc, s1..sN, e1..e3, ef, sz, charm, chain, len, pack}
CartLine           product_id, DesignConfig, priced_breakdown[], render_url
Order → ProductionSheet   all choices + fonts + stone sizes + render images for the workshop
```

### 5.2 Price formula

```
price = base_price[metal]
      + Σ SlotStonePrice[slot][stone]
      + extra_stones × price_per_extra
      + Σ engraving extras (e.g. base engraving +$25)
      + size surcharge (if size ≥ threshold)
      + charm + chain length + thickness + packaging
then apply: sale %  →  currency conversion  →  round to clean local price
```

The same calculation runs on the frontend (instant) and the backend (trusted, at checkout).

### 5.3 Design state

- Every choice updates the URL: `/products/JS0018/double-heart-ring?m=14KY&s1=EMER&s2=BTPZ&e1=Ali&ef=script&sz=7`
- Shareable, bookmarkable, and each metal version gets its own page title
- Last choices (name, metal, stones, size) are saved in the browser and **carried to other products and listing images**

## 6. Live image engine

### 6.1 Asset pipeline (the hardest real-world part, so start early)

1. **3D model** for each design (CAD from the jeweller or made by a 3D artist) → export GLB
2. Render every **angle** (top, side, angled, on-hand) in Blender/KeyShot as separate passes:
   - metal body for each metal color
   - one **mask per stone slot** (where the stone sits)
   - stone images per stone type, matched to the slot's shape and angle
   - **engraving area map** (position, curve and perspective of each engraving line)
   - shadow / reflection pass
3. Upload the layers to storage, named by a standard convention: `/{style}/{angle}/{layer}.png`

### 6.2 Render service

`GET /img/{style}/{slug}.webp?v=top&m=14KY&s1=EMER&e1=Ali&ef=script&w=800`
1. Check that every value is allowed (blocks abuse)
2. Stack: metal → stones in their slots → engraving text (converted to a path, bent along the band, engraved look) → shadows
3. Output WebP/AVIF at the requested width; cache at the CDN for good
4. Also used for listing cards, the cart, emails, the order sheet and Google Shopping images

### 6.3 Instant preview (our edge)

On the product page, draw the same layers **in the browser** (canvas). Choices then show instantly, and the server image is only used for sharing, SEO and emails. In Phase 3 the same page gets the 3D viewer.

## 7. Pages & features

### Storefront
- **Header:** announcement bar, mega menu (Featured / Style / Material columns), search with suggestions, account, cart badge; mobile drill-down menu
- **Home:** hero campaign, trust marquee, category tiles, "how personalization works" diagram, best sellers (Women/Men tabs), gift guide banner, standards row, reviews carousel, occasion tiles
- **Collections:** banner, sub-category chips, product count, filter & sort drawer (metal, birthstone, stone count, recipient, price), personalized product images with metal swatches, badges, load more, SEO copy
- **Product page:**
  - sticky gallery: live image, angles, zoom, video, try-on
  - step-by-step designer: metal swatches with prices, stone grids (genuine / lab / simulated with birth month + meaning), stone count, engraving fields with character counter + font picker, size with guide, charm/chain, packaging
  - live price + "% off", delivery date estimate, trust icons, Send a Hint, share buttons
  - specs, reviews (rating breakdown, photos, sort/filter, helpful votes), schema
  - mobile: sticky bottom bar with mini preview + Add to Cart
- **Cart:**
  - add-to-cart popup
  - item details with every choice priced, Modify Item
  - gift option (bag + card + message), optional protection plan (not pre-selected), add-on deals
  - promo code, delivery dates
- **Checkout:** one page with 4 steps (contact → address → shipping → payment), guest checkout, points earned, order reference
- **Account:** orders + status tracking, saved designs, wishlist (works for guests too), addresses, VIP points
- **Gifting:** Gift Finder Quiz, gift guides, Send a Hint email with a design preview, e-gift cards
- **Content:** help center (FAQ search), return/repair/resize request forms, ring size guide (printable sizer), chain guide, gemstone guide, how it's made, blog
- **Support:** chat widget with an AI assistant + quick intents (order change, repair, resize, return)

### Admin / operations
- Product & option manager (steps, slots, slot stone prices, fonts, size rules)
- Asset upload with a layer-check preview
- Orders → **production sheet PDF** (all choices, font, text, stone sizes, renders) → workshop status (*in production → QC → shipped*) → automatic customer emails
- Returns/repairs queue, promo codes, reviews moderation, VIP rules, CMS pages

## 8. Phased roadmap

Durations assume a team of 2–3 developers + a designer + a 3D/CAD artist.

### Phase 0 — Foundations (2 weeks)
- Confirm decisions D1–D6
- Brand identity: logo, colors, type, photo style
- Choose the 20–30 launch designs and get CAD/3D models
- UX wireframes: home, collection, product designer, cart, checkout (mobile first)
- Set up repo, CI, environments (dev/staging/prod)
- **Done when:** designs approved, first 3 products modelled, wireframes signed off

### Phase 1 — MVP store (8–10 weeks)
1. Commerce backend (Medusa) + PostgreSQL + admin
2. Design/option engine + pricing (shared frontend/backend logic, unit-tested)
3. Asset pipeline + image render service + CDN
4. Product page designer (accordion steps, live price, URL state, remembered choices, mobile sticky bar)
5. Home, collections with filters, mega menu, search
6. Cart + one-page checkout + payments (per D1) + tax/shipping rates
7. Order emails + production sheet + workshop status
8. Policies, size guide, help center basics, SEO basics (schema, sitemap, real H1s, clean slugs)
- **Done when:** a real customer can design, pay and receive a made-to-order piece, and the workshop gets a correct sheet

### Phase 2 — Conversion & retention (6 weeks)
- Reviews with photos, Send a Hint, Gift Finder Quiz, gift wrap/card, add-on deals, promo codes
- Accounts: Google/Apple sign-in, saved designs, guest wishlist, order tracking
- VIP points & tiers
- Email flows: abandoned cart (with the design image), post-purchase review request, birthday/anniversary reminders
- Return/repair/resize request forms, AI chat assistant
- **Done when:** conversion and repeat-purchase tracking are live, and the reviews flow is collecting

### Phase 3 — Our differentiators (6–8 weeks)
- **3D 360° viewer** on product pages (same GLB models)
- **Personalized try-on**: the customer's design on a model photo and on their own photo; AR on phones
- **Personalized spin video** of each design (for product pages, emails and social sharing)
- Instant in-browser preview everywhere
- **Done when:** the 3D viewer and try-on are live on the top 10 products

### Phase 4 — Scale (ongoing)
- International store: multi-currency with rounded local prices, per-country policies, hreflang
- Build-your-own engagement ring + certified diamond search
- A/B testing, personalization ("for you" rows), Google Shopping feed with personalized images
- More designs every month (the pipeline makes this repeatable)

**Total to a full v1 (Phases 0–3): roughly 5–6 months.**

## 9. Team

| Role | Phase 0–1 | Phase 2–3 |
|---|---|---|
| Full-stack / frontend developer | 1–2 | 2 |
| Backend developer (commerce + image service) | 1 | 1 |
| UI/UX designer | 1 | part-time |
| 3D/CAD artist + renderer | 1 | 1 |
| Product photographer / content | part-time | part-time |
| Project lead / QA | part-time | part-time |

## 10. Key risks & how we handle them

| Risk | Mitigation |
|---|---|
| 3D models and layer renders take longer than expected | Start in Phase 0; standardize naming and angles; launch with 20–30 designs only |
| Number of combinations explodes the render work | Render **layers**, not finished images; combine on demand; cache at the CDN |
| Engraving preview looks fake | Convert text to a path, bend it along the band, add an engraved shading effect; test every font early |
| Workshop gets an order wrong | Generated production sheet with renders + exact font files; QC photo before shipping |
| Price mismatch between frontend and backend | One shared pricing library with unit tests; the backend recalculates at checkout |
| Slow pages from too many scripts | Script budget; load analytics and chat after the page is interactive |
| Payment options for the local market | Confirm gateways in Phase 0 (D1); offer COD with verification if Pakistan |

## 11. Success metrics

- Product page → add to cart rate ≥ 8%
- Checkout conversion ≥ 2.5% of sessions
- Mobile page load (largest content) < 2.5 s
- Preview update after a change < 200 ms (in-browser)
- Production errors < 1% of orders
- Average rating ≥ 4.7, repeat purchase rate tracked from Phase 2

## 12. Immediate next steps

1. ~~Confirm D1–D6~~ ✅ done (2026-11-17)
2. Brand basics + pick the first 20–30 designs
3. Get CAD/3D files for 3 pilot products and prove the layer pipeline end-to-end
4. Wireframe the product designer (mobile first)
5. Scaffold the project: Next.js storefront + Medusa backend + image service
