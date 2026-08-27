# Recipe E: Real Estate / Property

## Quick ref

- **When:** Residential developments, luxury listings, property showcases, architecture firm project pages.
- **Token budget:** ~16k (HARNESS + layout + motion + color + typography + anti-similarity).
- **Files to read:** `03-layout.md`, `05-motion.md`, `02-color.md`, `01-typography.md` > Luxury/Editorial
- **Personality fit:** Primary — Professional. Strong — Luxury, Editorial, Warm/Human.

## Page flow

```
[Immersive hero — overlapping image mosaic with parallax. NOT one image. 5-7 images at different sizes and depths, moving at different scroll speeds. Property name in serif over the top.]
    ↓ images drift apart as user scrolls, revealing:
[Elevator pitch — one sentence. "Exclusive residence with wellness infrastructure next to Nature Park." Full viewport, centered.]
    ↓
[Gallery experience — NOT a grid. Pinned horizontal scroll through full-bleed property photos. Each photo fills the viewport. Captions appear per image.]
    ↓ exit horizontal scroll into:
[Key features — scattered/asymmetric layout. NOT icons+text cards. Each feature: large number/stat + one line. "12 min to city center" "40,000 sqft wellness spa" "270° mountain views"]
    ↓
[Floor plans / residences — tabbed interface: 1BR / 2BR / 3BR / Penthouse. Each tab shows plan + specs + price range + availability]
    ↓
[Location — full-width map or aerial photo with annotated points of interest]
    ↓
[Contact — split: left has form, right has sales office details + photo of showroom]
```

Key: CINEMATIC. Sells a lifestyle, not a building. Image-to-content ratio should be 70/30.

## Techniques

- Overlapping image mosaic with parallax depth layers (Springs Estate)
- Animated gradient blobs behind content (Springs Estate: 4 blob keyframes)
- Smooth scroll via Locomotive Scroll + Barba.js for page transitions
- Clip-path polygon button text-swap hovers (Springs Estate)
- Splitting.js for character/word/line animation targets
- Nature/wellness color palette with RGB variants for transparency
- Serif display at massive scale (Victor Serif at 180px)
- Preloader with branded animation

## Font direction

Elegant serif (display) + clean sans (body, uppercase labels). The serif signals permanence, establishment. See Springs Estate entry.

## Color

Nature-derived palette. Greens, blues, warm beiges. Every color needs an RGB variant for `rgba()`. See `02-color.md` > Springs Estate pattern.

## Motion budget

HIGH. Experiential — selling a lifestyle. Parallax, blob animations, clip-path reveals, page transitions. ONE signature easing curve everywhere.

## Reference sites

Springs Estate.

## Anti-patterns

Generic property listing grid. Blue/white corporate palette. Stock aerial photography. "Luxury living" cliche copy without specificity.
