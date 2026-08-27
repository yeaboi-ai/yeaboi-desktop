# Design Harness

> Entry point. Routes a brief to the right recipe, personality, and load bundle.

---

## Quick ref

- **Step 1:** identify project type → pick a recipe letter (table below).
- **Step 2:** pick a personality (9 options) + modifiers (3 dials × 3 levels). Default each modifier to "Mid" if unspecified.
- **Step 3:** load `recipes/<letter>-*.md` for the full recipe body. Each recipe declares its own `Files to read:` list — load only those.
- **Step 4:** load `anti-similarity.md` for variation constraints (every generation).
- **Step 5:** load `when-to-subvert.md` IF brief calls for distinctive / editorial / award-quality (not for mainstream SaaS / utility).
- **Step 6:** generate. Run `13-checklist.md` against the output.
- **Bundles are opt-in by file list. Do not load the whole library.**

---

## Step 1: Project Types → Recipes

| Type | Description | Recipe |
|------|-------------|--------|
| Creative Studio / Agency | Portfolio, case studies, "we make cool stuff" | `recipes/a-creative-studio.md` |
| SaaS / Product | Landing page selling software, signup flow | `recipes/b-saas.md` |
| Luxury / Brand | Spirits, fashion, hospitality, high-end retail | `recipes/c-luxury.md` |
| Restaurant / Hospitality | Dining, hotels, venues, experiences | `recipes/d-restaurant.md` |
| Real Estate / Property | Developments, listings, property showcase | `recipes/e-real-estate.md` |
| Editorial / Content | Blog, magazine, journalism, storytelling | `recipes/f-editorial.md` |
| Dashboard / Data Product | Admin panel, analytics, monitoring (also read `08-dashboards.md`) | `recipes/g-dashboard.md` |
| Photography / Portfolio | Visual work showcase, minimal chrome | `recipes/h-photography.md` |
| Film / Entertainment | Distributor, production company, events | `recipes/i-film.md` |
| Talent / Fashion Agency | Model agency, influencer management | `recipes/j-talent.md` |
| Hardware / Physical Product | Vehicles, devices, physical goods | `recipes/k-hardware.md` |
| Immersive / Storytelling | Year-in-review, annual reports, cause-driven | `recipes/l-immersive.md` |
| E-commerce / Online Store | Product listings, checkout, DTC brand | `recipes/m-ecommerce.md` |
| Event / Conference | Festivals, conferences, launches, exhibitions | `recipes/n-event.md` |
| Music / Artist | Musicians, bands, labels, releases | `recipes/o-music.md` |
| Non-Profit / Cause | Charity, NGO, activism, fundraising | `recipes/p-nonprofit.md` |
| Developer Docs / Technical | Documentation, API reference, dev tools | `recipes/q-docs.md` |
| Education / Course | Online learning, bootcamps, knowledge platforms | `recipes/r-education.md` |
| Personal / Newsletter | Personal brand, writer, newsletter, indie maker | `recipes/s-personal.md` |
| Local Business | Trades, clinics, salons, shops, service providers | `recipes/t-local-business.md` |
| Fintech / Banking | Financial products, crypto, trading platforms | `recipes/u-fintech.md` |
| Travel / Tourism | Destinations, tours, hospitality booking | `recipes/v-travel.md` |
| Fitness / Wellness | Gyms, studios, health apps, wellness brands | `recipes/w-fitness.md` |
| Construction / Architecture | Builders, architects, engineering firms | `recipes/x-construction.md` |
| Marketplace / Platform | Two-sided markets, directories, aggregators | `recipes/y-marketplace.md` |
| Podcast / Media | Shows, episodes, audio-first content | `recipes/z-podcast.md` |
| **Utility / Admin / CRUD** | Admin panels, inventory, back-office, internal tools (also read `utility-interfaces.md`) | `recipes/g-dashboard.md` + `utility-interfaces.md` |

---

## Step 2a: Personalities (9 options)

Applied on top of the recipe. Recipe = what the page is; personality = how it feels.

| # | Personality | Typography | Color | Spacing | Motion | Copy voice |
|---|---|---|---|---|---|---|
| 1 | **Professional** | Clean sans, medium weight, tight tracking | Cool/neutral, restrained, single accent | Tight, efficient | Minimal, functional | Direct, authoritative |
| 2 | **Playful** | Rounded sans or bouncy serif, variable weight | Warm, saturated, unexpected combos | Generous, breathing | Bouncy easings, hover surprises | Casual, witty |
| 3 | **Luxury** | Light-weight serif, extreme letter-spacing | Dark + metallic, monochromatic | Very generous | Slow, dramatic reveals (1s+) | Sparse, poetic |
| 4 | **Brutalist** | Heavy grotesque, tight or overlapping | High contrast, clashing, raw | Dense OR massive gaps | Instant snaps (no easing), glitch | Blunt, provocative |
| 5 | **Editorial** | Serif headlines, sans body, clear hierarchy | Near-monochromatic, surgical accent | Magazine-like varied | Subtle, content-focused | Long-form, journalistic |
| 6 | **Warm/Human** | Humanist sans, hand-drawn accents | Earth tones, cream backgrounds | Comfortable, domestic | Gentle fades | Conversational, empathetic |
| 7 | **Technical** | Monospace-heavy, geometric sans | Dark bg, single bright accent (cyan, green, amber) | Grid-precise, systematic | Blink effects, data-driven | Terse, spec-like |
| 8 | **Bold/Adventurous** | Strong sans at heavy weight, tight tracking | High contrast, dark + vibrant, full-bleed photo | Dynamic, asymmetric | Fast, energetic, parallax | Active verbs, aspirational |
| 9 | **Organic/Natural** | Humanist serif/sans, handcraft feel | Earth tones (sage, clay, stone, cream) | Generous, unhurried | Subtle natural easing | Grounded, material-focused |

---

## Step 2b: Modifiers (3 orthogonal dials)

Cross-cut ALL personalities. Default to "Mid" if unspecified.

| Dial | Low | Mid (default) | High |
|---|---|---|---|
| **Density** | Sparse — extreme whitespace, single focus per viewport, minimal content | Balanced — standard section rhythm, comfortable reading | Dense — multi-column, info-heavy, compact spacing, bento |
| **Energy** | Calm — subtle transitions, minimal scroll effects, quiet | Moderate — standard hover states, smooth page transitions | Intense — complex scroll animations, WebGL (see `webgl-core.md`), parallax, cinematic |
| **Era** | Classic — timeless palette, traditional proportions, serif-forward | Neutral — contemporary but not trendy | Contemporary — latest trends, experimental layouts |

Example: "Restaurant + Organic/Natural + Sparse + Calm + Classic" = Kinfolk farm-to-table. "Restaurant + Brutalist + Dense + Intense + Contemporary" = punk ramen bar.

---

## Step 2c: Compatibility Matrix

**P** = Primary (natural fit). **S** = Strong. **N** = Niche (needs justification). **X** = Bad fit.

| Recipe | Prof | Play | Lux | Brut | Edit | Warm | Tech | Bold | Organic |
|---|---|---|---|---|---|---|---|---|---|
| A Creative Studio | S | S | S | P | P | N | N | S | N |
| B SaaS | P | S | N | N | S | S | S | N | X |
| C Luxury | S | X | P | N | P | X | X | N | S |
| D Restaurant | S | S | S | N | P | P | X | N | P |
| E Real Estate | P | X | S | N | S | S | X | N | N |
| F Editorial | S | N | S | S | P | S | N | N | S |
| G Dashboard | P | N | N | N | S | N | P | X | X |
| H Photography | S | N | S | S | P | S | X | S | S |
| I Film | S | N | S | S | P | N | X | S | N |
| J Talent | P | N | S | S | P | N | X | S | X |
| K Hardware | P | N | S | N | S | N | P | S | N |
| L Immersive | N | S | S | S | P | S | N | S | S |
| M E-commerce | P | S | S | N | S | S | N | N | S |
| N Event | S | P | S | S | S | S | X | P | N |
| O Music | N | S | N | P | S | N | N | P | N |
| P Non-Profit | S | N | N | X | S | P | X | S | P |
| Q Dev Docs | S | N | X | S | N | N | P | X | X |
| R Education | P | S | X | X | S | P | S | N | N |
| S Personal | N | S | N | S | P | P | S | N | S |
| T Local Biz | S | S | N | X | N | P | X | N | S |
| U Fintech | P | X | S | X | S | N | P | X | X |
| V Travel | S | S | S | N | P | S | X | P | S |
| W Fitness | S | S | N | N | N | S | N | P | S |
| X Construction | P | X | N | S | N | N | S | N | N |
| Y Marketplace | P | S | S | N | N | S | N | N | N |
| Z Podcast | N | P | N | S | P | P | N | N | N |

If a combo is **X**, it will feel wrong to most audiences — avoid unless deliberately subverting. **N** works but needs reason (e.g., Technical + Restaurant only fits molecular gastronomy). **P** and **S** are safe.

---

## Structural Rule

Page flows in recipes are STARTING POINTS, not mandates. They exist to prevent defaulting to `hero → work → about → services → footer` every time.

- Read the flow to understand the INTENT and RHYTHM of the page type
- Adapt, reorder, skip, or combine sections based on actual content and goals
- If you have a better idea that serves the project, USE IT — the flow is a floor, not a ceiling
- The hard failure mode: 5 identically-structured vertical sections. Avoid regardless of which recipe you started from
- Improvisation is expected. A restaurant with no reservations skips that section. A SaaS with no pricing yet shows a waitlist

---

## Font Selection

Pick from pools in `01-typography.md` or foundries listed there. Quick pools:

- **Display sans (bold/geometric):** Aktiv Grotesk, Cabinet Grotesk, General Sans, Satoshi, Clash Display, Outfit, Syne, Basement Grotesque, Plus Jakarta Sans, Neue Montreal
- **Display serif (elegant/editorial):** Instrument Serif, Playfair Display, Fraunces, PP Woodland, BerlingskeSerif, Victor Serif, Saol Display, Source Serif 4
- **Body sans:** DM Sans, Space Grotesk, Outfit, Plus Jakarta Sans, General Sans, Satoshi, TT Commons Pro, Manrope
- **Monospace:** DM Mono, JetBrains Mono, IBM Plex Mono, Geist Mono, ABC Favorit Mono
- **Premium (paid):** Söhne, Marlin, Girott, Flatspot, ABC Oracle, Exposure VAR, GT Super, Graphik

Never use Inter or Roboto as the sole typeface unless brand-mandated.

---

## Load Procedure (for generators)

Given a user brief:

1. Classify → `{recipe_letter, personality, density, energy, era}`.
2. Load `HARNESS.md` (this file — small, load-always).
3. Load `recipes/<letter>-*.md` (one file, ~30–60 lines).
4. Read the recipe's `Files to read:` list; load each with the recipe's declared token cap.
5. Load `anti-similarity.md`; pick variation constraints honouring the personality's `compatibility notes`.
6. Load `when-to-subvert.md` IF personality ∈ {Editorial, Brutalist, Luxury} OR brief mentions distinctive/award.
7. Load `08-dashboards.md` IF Recipe = G; load `utility-interfaces.md` IF brief mentions admin/CRUD/inventory.
8. Load WebGL files (`webgl-core.md` + specified recipes from `webgl-recipes.md`) IF Energy = High AND recipe's WebGL block applies.
9. Generate tokens + memo + hand-off bundle.
10. Validate against `13-checklist.md`.

Typical bundle size for a non-WebGL recipe: **~25–40k tokens**. WebGL-heavy: **+30k**. Budgets per recipe are declared inside each recipe file.

---

## Pre-ship

Every output goes through `13-checklist.md`. Every item. No exceptions.
