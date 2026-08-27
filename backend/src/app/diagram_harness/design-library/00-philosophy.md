# Design Philosophy

> Core principles applied to every brief. Load always — this file is intentionally small.

---

## Quick ref

- Four principles guide every decision: **restraint**, **intentionality**, **personality**, **hierarchy**.
- The brief dictates the output. Don't impose aesthetic; match what the project actually is.
- Every design token (colour, font, spacing, motion) should have a reason you could state in one sentence.
- If two sections use the same structure and rhythm, at least one is wrong.
- For load-on-demand: critique of generic AI output + deliberate subversion patterns live in `when-to-subvert.md`.

---

## The Four Principles

### Restraint

Premium design is defined by what you leave out. Whitespace, restrained palettes, and calm spacing signal trustworthiness faster than any decorative addition. If an element doesn't serve the content, remove it.

### Intentionality

Every choice is deliberate. For any token in the output, you should be able to answer "why this value?" — not "what did the framework default to?" This applies to colour, type, spacing, easing, and layout.

### Personality

Interfaces gain character from how they handle the *uncommon* cases — empty states, errors, loading, 404s, confirmations. Generic happy-path output is indistinguishable; considered edge-case output isn't.

### Hierarchy

Not every section is equal. Some are louder, some quieter. Vary heights, spacing, visual weight, and density. The failure mode to watch for: five identically-structured sections stacked vertically.

---

## How to think about a brief

1. **Match the brief.** A restaurant site isn't a SaaS landing page; an admin tool isn't a portfolio. Start from what the project actually is (see `HARNESS.md` for routing).
2. **Let content dictate layout.** Hero, features, testimonials is a template — the content of *this* project should drive what sections exist and in what order.
3. **Pick one strong opinion.** Sites trying to include every trend end up feeling like nothing. One clear direction beats three compromises.
4. **Study the best work in the category.** `12-reference-sites.md` lists concrete examples. Look at category-appropriate references, not generic "modern website" examples.
5. **Design all the states.** Happy path is ~30% of the design work. Empty / error / loading / transitioning states are where polish shows.

---

## Spacing and rhythm

- Use a defined spacing scale (tokens, not arbitrary numbers).
- Vary section vertical rhythm — don't make every section the same height.
- Optimal reading measure: 45–75 characters per line.
- Generous whitespace signals premium; dense but organised signals operational/utility. Match the project type.

---

## Awwwards criteria (category benchmark)

| Dimension | Weight | What it means for output |
|---|---|---|
| Design | 40% | Intentional palette + type, micro-details, consistent system |
| Usability | 30% | Clear navigation, fast load, accessibility, mobile-first |
| Creativity | 20% | Custom interactions, concept-driven, not templated |
| Content | 10% | Real content, not lorem-ipsum-grade filler |

Use as a rubric for self-critique: if the output would score 0 on Creativity, it's a template — not a design.

---

## When to load `when-to-subvert.md`

Load that file when the brief signals any of:

- Creative, editorial, or portfolio work
- Explicit anti-generic framing ("not SaaS-looking", "distinctive", "award-quality")
- Luxury, fashion, music, or experimental brands
- Projects that explicitly reject conventional aesthetic (brutalist, neubrutalist, anti-design)

For mainstream SaaS, utility tools, dashboards, enterprise, healthcare, fintech: the subversion file actively fights the brief. Don't load it.
