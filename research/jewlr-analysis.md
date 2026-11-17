# Jewlr.com — Deep Research Report

Researched live on 2026-11-17 by browsing jewlr.com (US store, desktop and mobile widths).
Goal: understand everything that makes it work, so we can plan our own personalized-jewelry store (THEJEMSUTRA).

---

## 1. What Jewlr is

A **made-to-order personalized jewelry** store. The customer does not pick from finished stock. They **design** each piece by choosing metal, gemstones, engraving text, font and size. The piece is then made in their workshop.
Main products: rings (mother's, promise, birthstone, engagement), name necklaces, bracelets, earrings, men's jewelry.
Price range: about $139 (silver) to $700+ (14K gold), plus extras.

**What makes it special:** almost every product image is **generated live** from the customer's choices. Shoppers see exactly what they will get before they buy.

---

## 2. Core feature: the live product image engine (most important)

Every product image is a URL with the design choices written into it:

```
/product-img/JWL0018/rose-gold-double-heart-ring.jpg
   ?view=t2          -> camera angle (t, t2, m, s, p, i1, i2, i3 ...)
   &sku=10KR         -> metal (SS = silver, SS18KYP = gold plated, 10KR = 10K rose gold, 14KY ...)
   &o1=2             -> option count (e.g. 2 hearts)
   &s1=05EMER        -> stone 1 = Emerald (May)
   &s2=S12BTPZ       -> stone 2 = simulated Blue Topaz (Dec)
   &e1=Ali           -> engraving line 1
   &e2=...&e0=...    -> engraving 2 / base engraving
   &ef=Scriptee      -> engraving font (Classic, Modern, Italic, Script)
   &dim=500          -> image size
```

- The server **builds the image** from layers: metal base + stone images + engraving text drawn in the chosen font. The result is cached on a CDN.
- Every change (metal, stone, text, font) swaps the image within about a second.
- The engraving text appears **on the ring in the chosen font as you type**.
- Several angles are generated per design (top, side, angled, on-hand/lifestyle). There is also a short product video (mp4).
- This "what you see is what you get" preview is the main reason people trust the store. Customer reviews say exactly this: "showing the personalized product exactly as it is."

**How we can build it:**
- Option A (simplest, closest to Jewlr): **2D layered images**. For each product and angle, export separate PNG layers (metal body per metal color, a mask for each stone slot, a text path for engraving). A server (Node + Sharp, or a Cloudinary/imgix transform) combines them and caches the result.
- Option B (more advanced than Jewlr): a **3D configurator** (Three.js / React-Three-Fiber with GLB models). The shopper can rotate the piece 360°, and metal/stone materials update in real time. This would be a real step up from Jewlr, which is 2D only.
- Hybrid: 3D on the product page, plus server-rendered 2D images for listings, the cart, emails and SEO.

---

## 3. Product page (PDP) — feature by feature

Layout: gallery on the left (stays in place while you scroll), customizer on the right.

| Element | Details |
|---|---|
| Title, price, strike price, "% OFF" badge | Price **recalculates live** with every choice (e.g. $494 → $583 after adding an emerald) |
| Star rating + count (1,402 reviews) | Links to the reviews section |
| Mini review slider | 3 short verified-buyer quotes right under the price, a trust boost |
| **Choose your metal** | 8 round swatches: 925 Silver, 18K Gold-Plated Silver, 10K White/Yellow/Rose, 14K White/Yellow/Rose, each with its own price |
| Accordion steps (one open at a time) | Number of Hearts/Stones → Stone 1 → Stone 2 → Accent stones → Engravings → Ring size → Packaging |
| Stone picker | Grid of gemstone icons with prices ($19 to $799). Two groups: **Genuine gemstones** and **Simulated stones**. A details box shows name, stone size, birth month and "attributes" (e.g. "Positivity, Calmness, Focus") |
| Engraving | Several text fields (Engraving 1, 2, Base +$25) with a **live character counter** ("9 left"), plus a font picker that shows "Abc" in each font |
| Ring size | Dropdown 4–12 in half sizes. 11+ costs **+$40**. Hint: "average ring size for women is 7.00" + link to size chart + free resizing note |
| Packaging upsell | Standard Box ($0) or Premium Ring Box (+$10), each with a photo |
| Add to Cart | Big blue button showing the live price: "$583 – Add to Cart" |
| Trust icons | Free Shipping · 99-Day Returns · 1-Year Warranty · Free Resizing |
| Delivery estimate | "Get it by Dec 24 with Express / Dec 29–31 with Free shipping", calculated per product |
| **Send a Hint** | Shopper sends the design to a partner ("drop a hint"). Great for gifts |
| Share buttons | Share, X/Twitter, Pinterest, Messenger |
| Description & specs | Stone sizes, ring width, style code |
| "As Featured In" press logos, Instagram UGC gallery | Social proof |
| Why Choose Jewlr | Made in USA, ethically sourced, add protection plan |
| **Reviews** | Rating bar chart (5★ 83% …), sort (photos, recent, highest, lowest, helpful), filter, "was this helpful?" votes, pagination, Write a Review |
| Structured data (SEO) | Product, BreadcrumbList and VideoObject JSON-LD schema, so Google can show rich results |

**Smart URL behaviour:** every choice updates the URL (`?sku=10KR&s1=05EMER&e1=Ali&ef=Scriptee&sz=7.00`), and the page title changes to match (e.g. "10K Rose Gold Double Heart…").
So any design can be shared or bookmarked, and every metal version is its own SEO page.

---

## 4. "Remembers your personalization" (very clever)

After I typed the name "Ali" and picked rose gold on one product, **every listing page then showed products with "Ali" and in rose gold**. Prices also showed the rose-gold price.
Name necklace listings show the shopper's own name on every necklace. This makes browsing feel like it was made for them, and it is a big conversion driver. Product links also carry those settings (`?e1=Ali&ef=Glamorous&sku=10KR`).

---

## 5. Homepage structure

1. Top announcement bar (Free Shipping · 99-Day Returns · One-Year Warranty · "Buy Now Pay Later")
2. Sticky header: logo, mega menu, account, search, cart with item count badge
3. **Geo popup:** detects the country ("Currently shipping to Pakistan"), offers local currency and landed costs, or "Continue to US store"
4. Hero banner with a seasonal campaign ("Give Her The Right Ring") + Shop Now
5. Scrolling **marquee** of trust points (Personalized fine jewelry · 1-yr warranty · free shipping · 50K+ 5-star reviews · 99-day returns)
6. Category image tiles: Promise Rings, Name Necklaces, Birthstone, Anklets, Engagement, Men's
7. "Personalized Jewelry, Thoughtfully Made" explainer with a labelled ring diagram ("Choose your metal / Add an engraving / Pick your stones")
8. Best Sellers carousel with **Women/Men tabs**
9. Gift guide banner ("Personalized jewelry for everyone on your list")
10. "We've Got Standards" icon row
11. Trustpilot review carousel ("50,000 Five Star Reviews")
12. Occasion tiles: Anniversary, Birthday, Peridot Edit, Wedding
13. Big footer: Company / Ordering / Learn / Customer Care, hours, phone, live chat, social links, payment and security badges, country switcher

Sections **load lazily** while you scroll (content is fetched as you reach it, which keeps the first load fast).

---

## 6. Navigation (mega menu)

Hover menus with 3 columns: **Featured / Style / Material**.

- **Shop By:** The Right Ring, Holiday Gift Guide, **Gift Finder Quiz**, Best Sellers, New Arrivals, Care & Storage, E-Gift Card, by theme (Birthstone, Name, Promise, Heart, Religious, Zodiac, Pearl…)
- **Rings:** All, Open Rings, Best Sellers, New, Sale, Men's, Size Guide · Promise, Birthstone, Mother's, Heart, Everyday, Engagement, Wedding, Claddagh, Stacking, Signet · Silver, Gold-plated, Yellow/White/Rose Gold, Pearls
- **Necklaces:** Jewelry Sets, Men's, Kid's · Name, Birthstone, Initial, Mother's, Cross, Lockets, Heart, Zodiac · Vermeil…
- **Bracelets, Earrings, Wedding**
- **Men's:** Rings, Necklaces, Chains, Bracelets, Accessories · Signet, ID bracelets, Leather · Tungsten, Stainless Steel…
- **Gifts:** by occasion (Birthday, Anniversary, New Mom, Graduation, First Communion, Bar/Bat Mitzvah…) and by recipient (Mom, Dad, Girlfriend, Boyfriend, Friends, Kids)

On mobile the same menu becomes a drill-down slide menu.
Filter links are just URL tags (`?filtered_tags[]=rose-gold`), so one collection page serves many menu links. (Correction from Part 3: `robots.txt` **blocks** these filter URLs from Google, so the SEO landing pages are the clean slugs like `/birthstone-rings`, `/mothers-rings`.)

---

## 7. Category / listing page

- Hero banner, breadcrumb, H1 + short SEO intro
- Sub-category image chips (Best Sellers, New, Promise, Birthstone, Mother's…)
- Product count ("843 Products")
- **Filter & Sort** drawer: Sort (Featured, Price ↑, Price ↓) · Metal · Birthstone · Stone Count · Recipient
- Product card: live personalized image, **wishlist heart**, badge (Best Seller / New! / Top Gift), **metal swatches**, name, "from $X", strike price, % OFF
- "Viewing 24 of 843 products" + **View More** button (load more, no page numbers)
- Long SEO article at the bottom ("What makes Jewlr the #1 choice…")

---

## 8. Search

The search box opens a panel straight away, before you type:
- **"I'm looking for…"** quick links (The Right Ring, Gift Guide, Birthstone, Gift Finder Quiz, Promise, Mother's, Engagement, Men's)
- **Best Sellers** thumbnails

---

## 9. Gift Finder Quiz

Full-page step-by-step quiz with a progress bar and playful floating confetti shapes.
1. What's the occasion? (Birthday, Anniversary, Religious, In Loving Memory, Promise/commitment, Engagement/Wedding, Not sure)
2. Who is it for? (Her, Him, Mom/Grandma, Dad/Grandfather)
3. … then more steps → a personalized product list.

---

## 10. Cart & checkout funnel

**Add-to-cart popup:**
- Item + price + % OFF
- "Is This a Gift?" (personalized card + gift wrap)
- "Add a Protection Plan" (powered by **Extend**, an insurance upsell)
- **Add-On Deals** carousel: cheap items at 55–69% off (jewelry cleaner $19, huggie earrings $30, pendant $20…)
- Promo code, subtotal, **Checkout** and **View Cart** buttons

**Cart page:** item with delivery dates (express vs free), Item Details dropdown, **Modify Item** (back into the customizer), gift option, protection plan, "Protect the Sparkle" cleaner kit, promo code, summary (tax calculated at checkout), TLS security note, help box (phone/email), returns and delivery FAQ accordions, more add-on deals, shopping perks.

**Payments seen:** Visa, Mastercard, Amex, Discover, PayPal, plus "Buy Now, Pay Later" plans (Affirm/Klarna-style).
**Fraud screening:** Signifyd.

---

## 11. Loyalty & retention

- **VIP Rewards ("Jewls")**: 1,000 bonus points on sign-up, 10/12/14 points per $1, 200 Jewls = $1
  - Tiers: **Sapphire** (0–4,999), **Ruby** (5,000–8,499, free expedited shipping), **Diamond** (8,500+)
- Wishlist hearts, account, e-gift cards
- SMS/email capture (Attentive pop-ups, Iterable email)
- "Send a Hint" emails

---

## 12. Trust & policy promises (repeated everywhere)

Free shipping · 99-day returns · 1-year warranty · free ring resizing within 30 days · made in the USA · ethically sourced · 50K+ five-star reviews (Trustpilot) · press logos · BBB/Trustwave/JVC badges · accessibility statement · supply-chain report.

---

## 13. Tech stack (what's under the hood)

| Layer | What they use |
|---|---|
| Backend | **Ruby on Rails** (CSRF `authenticity_token`, Webpacker `/packs/`) |
| Frontend | **React** single-page app (`JewlrApp`), code-split with **loadable-components**, **React Query** for data |
| API | REST `/api/v10/...`: `collections/{slug}/load_react_collection`, `cart/{token}`, `user_data`, `user/event` |
| Performance | **Prefetches** collection data when you hover the menu (`?prefetch=1`), lazy-loads sections, images resized by `dim=` |
| Image rendering | Own service at `/product-img/` and `imgsmbly.jewlr.com` ("image assembly"), CDNs `cdn.` `assets.` `cms.jewlr.com` |
| CMS | Headless CMS (`cms.jewlr.com`) for banners and landing blocks ("elements-hero-banner", "landing-marquee", "image-row") |
| A/B testing | Optimizely + Convert Experiments, `experiment_impression` sent per cart |
| Analytics / ads | GTM, GA, Meta Pixel, TikTok, Pinterest, Reddit, Bing, Microsoft Clarity (heatmaps), Northbeam (attribution), Quantcast |
| Error / UX monitoring | Sentry, Noibu (checkout error and session recording) |
| Marketing | Attentive (SMS), Iterable (email), Trustpilot reviews |
| Commerce add-ons | Extend (protection plans), Signifyd (fraud), BNPL |
| Support | Live chat widget, help desk / FAQ, contact form |
| International | Geo-IP country detection, local currency, landed duties |

---

## 14. What is especially advanced (the "secret sauce")

1. **Live server-rendered previews** of every combination (metal × stones × text × font × angle). This is the core.
2. **Personalization follows you across the site.** Your name and metal appear on every listing.
3. **The design lives in the URL.** Shareable, bookmarkable, and indexable by SEO for each variant.
4. **Live pricing engine** with per-option prices (metal, each stone, base engraving, large sizes, packaging).
5. **Accordion step-by-step customizer** with summaries ("Emerald – May"), so the page never feels overwhelming.
6. **Gifting tools**: Gift Finder Quiz, Send a Hint, gift wrap/card, occasion and recipient menus.
7. **Strong upsell funnel**: packaging upgrade → protection plan → add-on deals → cleaner kit.
8. **Huge SEO footprint**: tag-based collection URLs, JSON-LD schemas, long-form category copy, a blog.
9. **Performance tricks**: hover-prefetch, code-splitting, lazy sections, CDN-sized images.
10. **Data-driven**: A/B tests on the cart, heatmaps, multi-channel attribution.

## 15. Weak spots we can do better

- **2D only**: no 360° / 3D view. The try-on (Tangiblee) is generic: the model wears a sample name, not *your* text (see Part 2).
- **No "build your own engagement ring"** flow (choose setting → search loose certified diamonds by 4Cs).
- Only Facebook social login (no Google / Apple). The wishlist requires an account.
- `/info/payment-plans` link in the header returns **Page Not Found** (a broken link on their site).
- The engraving preview waits for a server round-trip and briefly shows an empty/loading gallery. A 3D or canvas preview on the device would feel instant.
- Phone support is currently paused (chat/email only).
- Heavy third-party scripts (~40 trackers) slow the site down. We can stay leaner.
- The gift quiz shows a blank "LOADING" screen before it appears.

---

## 16. Suggested modules for our build (input for the plan)

1. Product catalog + option schema (metals, stone slots, engraving slots, size rules, per-option pricing)
2. **Image composition engine** (2D layers via Sharp/Cloudinary) — or a **3D configurator** (R3F + GLB)
3. Product page customizer (accordion steps, live price, URL state, remembered personalization)
4. Collections with tag filters, sort, load more, SEO content
5. Mega menu + mobile drill-down, search with suggestions
6. Cart, add-on deals, gift options, promo codes, checkout (Stripe/PayPal + BNPL), tax/shipping
7. Accounts, wishlist, orders, VIP points
8. Reviews (with photos, sorting, helpful votes)
9. Gift Finder Quiz, Send a Hint
10. CMS for banners/landing pages, blog
11. Geo/currency, analytics, A/B testing, SEO schema
12. Admin: order production sheet (all chosen options for the workshop), product/option manager

Likely modern stack: **Next.js (React) + Node/NestJS or Medusa/Shopify backend + PostgreSQL + Sharp/Cloudinary image service + headless CMS (Sanity/Strapi) + Stripe**.

---

# Part 2 — Deeper exploration (second pass, 2026-11-17)

## 17. Product type differences (the customizer adapts to each product)

The same step-by-step designer is reused. Each product defines its own list of steps.

**A. Gemstone ring** (Double Heart): Metal → Number of hearts → Stone 1 → Stone 2 → Accent stones → Engravings → Ring size → Packaging.

**B. Name necklace** (JWLN0300, $69 and up):
| Step | Options |
|---|---|
| Name / text | Free text, max **9 characters**, live counter |
| Font | **10 fonts**: Glamorous, Flourish, Painter, Brannboll, Damion, Handwriting, Gothic, Beverly, Challenge, Einhorn |
| Metal | Silver $69 · Gold-plated $84 · 10K White/Yellow $269 ("MOST POPULAR" tag) · 14K Yellow $349 |
| Name thickness | Classic 0.7mm or **Premium (40% thicker) 1mm +$9** |
| Charm | None, Heart Stone, Heart, Butterfly, Cross, Infinity, Paw, Teddy Bear, Baby Feet (+$10 each) |
| Chain type | Cable · Cable with Lab Diamond · Paperclip |
| Chain length | 14"+2" ext · 16"+2" (+$5) · 18"+2" (+$9) |
| Packaging | Standard box |
The preview draws the actual name in the chosen font as a 3D-looking metal cut-out.

**C. Mother's / family ring** (3–11 Gemstone Affinity Ring):
- **Stone Count** dropdown: 3, 4, 5 (base) · 6 (+$5) … 11 (+$30), adding $5 per extra stone
- Changing the count **redraws the ring with that many stones** and **adds or removes "Stone N" steps** automatically (6 → 9 steps)
- Every stone slot has two lists: **Genuine** (Garnet $9, Amethyst $9, Aquamarine $14, Lab Diamond $79, Diamond $99, Emerald $19, Ruby $19, Sapphire $19, Opal, Pink Tourmaline, Citrine, Blue/Yellow/Green Sapphire…) and **Simulated / Premium Zirconia** (free, including Alexandrite, Lavender, Mint, Fancy Yellow, Black)
- Each stone is labelled with its **birth month**
- URL: `?sc=9` for stone count

**D. Engagement ring** (Moissanite Oval Solitaire):
- Metal now includes **18K** ($886) besides 10K/14K
- **Center Stone Shape**: Round, Oval, Emerald, Pear
- **Center Stone Size**: 1 ct (7x5mm) $399 · 1.5 ct $650 · 2 ct $900 · 3 ct $1,449
- Stone types sold: Lab Diamond, Moissanite, Diamond, Cubic Zirconia, Gemstone (tabs on the collection page)
- Educational text about color/clarity/carat, but **no loose-diamond search and no certificates (IGI/GIA)**

**Data model takeaway:** a product = a base design + an ordered list of "option steps". Each step has a type (metal, stone slot, stone count, text + font, size, charm, chain, packaging), allowed values, a price per value, and an image layer. Stone-count steps create stone-slot steps dynamically.

## 18. Your design follows you across products

Not just listing pages. Opening a *different* product page pre-fills it with your earlier choices:
emerald in slot 1, engraving "Ali", Script font, ring size 7.00. Every product link carries `?e1=Ali&ef=…&s1=05EMER&sku=10KR`.
So a shopper who designs once sees "their" ring everywhere they go.

## 19. Virtual try-on (Tangiblee)

- A **"TRY IT ON"** link under the gallery (seen on necklaces)
- Opens a **Tangiblee** widget (third-party, iframe `cdn.tangiblee.com`) with 3 modes:
  - **On model**: product shown on a model photo (two models to pick from)
  - **On me**: use your own photo/camera
  - **Compare**: compare sizes and versions
- On desktop a **QR code** says "scan to try it on yourself" (continue on your phone)
- Zoom +/- controls
- **Weakness:** the model wears a generic sample ("Jasmine"), **not the name you typed**. A truly personalized try-on would be a strong differentiator for us.

## 20. Checkout

- Distraction-free: logo + "SAFE & SECURE CHECKOUT" only, no menu
- **One page, 4 accordion steps**: ① Contact (email) → ② Shipping Address → ③ Shipping Options → ④ Payment
- Guest checkout allowed ("Returning customer? Sign in for faster checkout")
- **Newsletter opt-in checkbox is pre-ticked**, plus a "create account and earn VIP Jewls" checkbox
- Side panel: **"You will earn 5,830 Jewls with this order"**, order summary with the live design thumbnail, free shipping, total, an order **reference number**, help box, returns/delivery FAQ
- Order token in the URL (`/checkout?order_token=…`)

## 21. Account & wishlist

- Sign-in: email + password, "Remember me", forgot password, **Facebook** social login only
- Sign-up page is branded "Create A VIP Account" with a newsletter checkbox
- "Creating an account is not required to purchase" is repeated on every account page
- **Wishlist requires an account** (`/wishlist` → sign-up)

## 22. Help desk, reviews, content

- **Help desk** (`/helpdesk`): searchable help articles; sections General Questions, Order Information, Jewelry Education, International Orders, Returns, Repairs & Resizing, Shipping, VIP Rewards; contact form + live chat hours
- **Reviews page** (`/reviews`): "50K+ 5-star reviews", 94% are 4–5 stars, star breakdown, reviews collected through **Shopper Approved** (product pages) and **Trustpilot** (homepage); social follower counts (1.5M+, 180K+, 26K+)
- **Holiday Gift Guide**: recipient tiles (Her, Mom, Grandma, Him) + "Most Gifted" carousel with Women/Men tabs
- **Blog**: SEO buying guides (10k vs 14k gold, birthstone styling, gift ideas…), part of the same React app
- Education pages: How It's Made, Ring Sizing, Chain Guide, Gemstones, Diamond & 4Cs, Packaging

## 23. Mobile experience

- Hamburger drill-down menu; icons for account, search and cart (with count badge)
- Product gallery becomes a **swipe carousel with dots**
- Trust icons move directly under the price
- **Sticky bottom bar**: a small live preview of your design ("Click to enlarge") + "$253 – Add to Cart" stays visible while you scroll through the steps. A great pattern to copy.
- Chat bubble floats bottom-right

## 24. Updated "beat them" opportunities

1. **Personalized 3D / try-on**: show the customer's actual name, stones and metal on a model or on their own photo (Jewlr's try-on is generic)
2. **360° 3D viewer** on the product page
3. **Build-your-own engagement ring** with a certified loose-diamond search (4Cs filters, IGI/GIA certificates)
4. Google + Apple sign-in; **guest wishlist** (saved in the browser, synced at signup)
5. Instant preview on the device (no server wait); no blank "LOADING" screens
6. Fewer third-party scripts for speed; fix basics like broken links
7. Local market features (e.g. PKR pricing, local payment methods like JazzCash/Easypaisa/COD, if Pakistan is a target market)

---

# Part 3 — Third pass: extras, international, policies, SEO (2026-11-17)

## 25. Cart extras in detail

- **Item Details** dropdown lists every choice with its price: Style code, Material "10K Solid Rose Gold ($494)", Engraving font, Engraving text, Size, Top Heart "Emerald / May (+$89)", Bottom Heart, Accent stones. This is effectively the **workshop production sheet**.
- **Modify Item** goes back to the designer with everything pre-filled (`/products/share/JWL0018/...?line_item_id=…&sku=10KR&e1=Ali&sz=7.00&s1=05EMER…`), then updates the same cart line.
- **Is This a Gift?** → "Jewlr gift bag + card" **$9** + custom message (200 characters). The packaging page also lists a "Love Gift Wrap + Card" (heart-print paper).
- **Protection plan (Extend):** 2 years $74.99 · **3 years $119 (Best Seller, pre-selected when you open it)** · 5 years $139 (Best Value). Covers accidents, fast replacement/repairs, easy online claims. Turning it on jumped the cart from $583 to $702. (A pushy default; we may want something softer.)
- Promo code field, "Protect the Sparkle" cleaner kit ($19), add-on deals.

## 26. Send a Hint (gift-hint email)

Form: your name, your email, recipient's name, recipient's email, optional message, **email theme** dropdown ("Base" + others), "send me a copy", "add me to your email list".
Shows a **live preview of the email** with *your exact designed piece*: "Love. Want. Need. ___ wants you to know what they really, really want… HINT, HINT."
It also captures 2 email addresses per use (both are marketing leads).

## 27. Gallery details

- **Zoom** = magnifier box that follows the mouse over the live image ("Exit zoom" to leave)
- **Video** = one fixed mp4 per product (`/product-vid/JWL0018/…-1.mp4`, also listed as a Vimeo VideoObject for SEO). **The video is not personalized**: it doesn't show your metal, stones or engraving. Opportunity for us.
- On desktop the Add-to-Cart button also becomes **sticky** once you scroll past it.

## 28. More product types

| Type | Steps | Notes |
|---|---|---|
| **Bracelet** (Interlocking Heart) | Metal (Silver $141 → 14K $812) → Stone 1 → Stone 2 → Engraving → Packaging | No size step on this model |
| **Stud earrings** | Metal ($93 → $316) → Stone (one choice for the pair) → Packaging | Offers **Lab Emerald / Lab Ruby** (lab-grown) next to genuine. Page title updates to "...with Emerald Stones" |
| **Men's ring** (Cross ring) | Metal ($189 → 14K $1,289) → Stone 1 → Stone 2 → Engraving → Ring size → Packaging | Sizes **5–15**, +$20 from 12.5 (women's: 4–12, +$40 from 11) |

**Pricing insight:** the same stone costs different amounts on different products (Emerald: $19 / $44 / $54 / $89 / $178) because stone size differs. **Price = product base price (per metal) + price of each stone *for that slot size* + engraving extras + size surcharge + packaging.**
**Smart defaults:** a second stone slot defaults to a matching simulated stone; ring size defaults to your last choice.

## 29. International store

- Footer **"Change country"** → "Now Shipping Worldwide!" dropdown with **189 countries**, each with its currency (USD, CAD, AUD, GBP, EUR, JPY, PKR, …)
- Picking a country moves you to a separate **`/int/` store** (`/int/products/...?geo=PK`). Dedicated English stores also exist at **`/ca/`, `/uk/`, `/au/`**, linked with `hreflang` tags so Google shows the right one per country
- **Prices are converted and rounded** to clean local numbers: $69 → **Rs 20,100**; $269 → Rs 78,300; $349 → Rs 101,600 (≈ 291 PKR per USD, rounded to 100s)
- International policy differences: **30-day returns** (vs 99 in the US), free shipping still advertised, delivery-date estimate hidden, try-on still available
- On every visit from a new country a popup offers local currency, "guaranteed landed costs" (duties included) or staying on the US store

## 30. Shipping, returns, warranty

**Shipping (US):**
| Service | Time | Price |
|---|---|---|
| Standard Ground | 3–4 business days | FREE |
| Expedited | 2 business days | ~~$19~~ $12 |
| Express | 1 business day | ~~$25~~ $17 |
Manufacturing takes **1–4 days** before shipping. Delivery estimates on product pages = average manufacturing time + shipping method. Carriers: UPS, FedEx, USPS.

**Returns:** 99 days from shipping date, full refund to original payment (minus shipping and gift packaging). **Engraved items can be returned too.** Must be new/unworn. Resized or repaired items don't qualify. The customer pays return shipping. Self-service forms: **Request to Return, Request to Repair, Resize**.

**Warranty:** 1 year on all jewelry (manufacturing defects, craftsmanship, shipping damage). **Lifetime warranty on Luxury Bridal diamond engagement rings.** Not covered: wear and tear, tarnish, accidents, loss/theft. Rings can be resized within 2 sizes, beyond that a remake at 30% off. Extended cover is sold through Extend.

**How It's Made:** "custom design technology + traditional hand-made manufacturing". Steps: choose style → metal (92.5% silver, 10K/14K gold, tungsten) → stones (genuine, simulated, "Brilliance" CZ, diamonds) → engraving.

## 31. Customer support

- **Help Scout Beacon** chat widget with an **AI "JEWLR Assistant"** (chatbot first, humans behind it)
- Quick-start buttons: *Make a change to my order · I need to repair my jewelry · I need to resize my jewelry · I need to return my jewelry*
- Its greeting openly mentions current "delays with orders and repairs"; phone support is paused
- Also: help desk articles, contact form, email

## 32. SEO & performance measurements (homepage, desktop)

| Item | Finding |
|---|---|
| Sitemap | `/sitemap.xml` with hreflang alternates for US/CA/AU/UK |
| robots.txt | Blocks search, **filter-tag URLs**, cart/checkout/user APIs |
| Canonical | Set correctly |
| Structured data | Product, BreadcrumbList, VideoObject on product pages |
| Server rendering | Product links and policy text come in the first HTML (good for Google), with a "please enable JavaScript" note |
| **H1** | Homepage has **two empty H1 tags** (an SEO mistake) |
| Speed | First byte ≈ 0.54 s · DOM ready ≈ 1.1 s · full load ≈ 2.9 s · **177 requests, ~1.2 MB** (own JS only ~160 KB; most weight is images and trackers) |

## 33. Extra lessons for our build

1. Store a **complete, priced option list per cart line**. It powers the cart, emails, the workshop sheet and "Modify Item".
2. Price each stone **per product slot** (stone size), not one global price.
3. Plan **multi-currency with rounded local prices** and per-country policies from day one.
4. Self-service **return/repair/resize request forms** + an AI chat with quick intents cut support load.
5. Gift-hint emails are both a gifting feature and lead capture.
6. Personalized video (render a short spin of *their* design) would beat Jewlr's generic videos.
7. Get the SEO basics right (real H1s, clean category slugs, schema, hreflang).
