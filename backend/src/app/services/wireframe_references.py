"""In-context reference HTML for the wireframe generator.

The wireframe model has aesthetic priors but no concrete patterns to
remix when given a high-level brief like "Stripe-esque dashboard" or
"editorial landing page". These references — distilled from the
hand-built samples in `~/design-library-sample/samples/` — give it
exactly that: complete, runnable HTML chunks demonstrating type
hierarchy, color restraint, density, and section rhythm for each
archetype.

The model is told to ADAPT these to the user's domain, not copy them
verbatim. References are plain HTML+CSS so the model's output uses
the same vocabulary (no Tailwind classes, no shadcn).

Token cost: ~2-3KB per reference. Injected only when the archetype
matches — dashboards/landings/marketing get a reference, vanilla CRUD
list screens don't (they use the existing `design_block` design system
guidance instead).
"""

from __future__ import annotations

from .wireframe_samples import sample_block_for_screen

# ─── DASHBOARD REFERENCE ────────────────────────────────────────────
# Distilled from ~/design-library-sample/samples/dashboard-stripe.html
# Shows: indigo accent on neutral surface, Inter + JetBrains Mono pairing,
# subtle borders not chunky shadows, KPI row with sparklines, real chart
# SVG with axis grid + area gradient + compare line, status pills with
# semantic colors, gradient avatars, dense table. Stripe / Linear / Mercury.
_DASHBOARD_REFERENCE = """
<!-- ===== REFERENCE: DASHBOARD (Stripe / Linear / Mercury vibe) ===== -->
<!-- ADAPT this to the user's app — keep the principles, change the labels.
     Principles:
       1. Inter for prose, JetBrains Mono for ALL numerals.
       2. ONE accent color (indigo here). Status colors only on status pills.
       3. Subtle 1px borders + tiny shadow. Never chunky shadows.
       4. Dense — 4 KPIs, 8 table rows, 5 breakdown items per card.
       5. Sparklines per KPI, hand-coded SVG. Real charts with axes.
       6. Status pills w/ leading dot. Gradient avatars w/ initials.
       7. Sidebar grouping: SECTION LABEL in 10px uppercase 60% color, then nav items.
       8. Sticky topbar with backdrop-filter: blur. ⌘K shortcut hint in search. -->
<style>
:root {
  --bg: #ffffff; --bg-soft: #fafafa; --bg-hover: #f7f7f8;
  --border: #e5e5e7; --border-strong: #d1d1d6;
  --text: #0a0a0a; --text-soft: #5a5a5e; --text-mute: #8a8a8e; --text-ghost: #b4b4b8;
  --accent: #635bff; --accent-soft: #efeefe;
  --success: #2da44e; --success-soft: #dcfce7;
  --warn: #d97706; --warn-soft: #fef3c7;
  --danger: #dc2626; --danger-soft: #fee2e2;
  --font-sans: 'Inter', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  --radius: 10px; --radius-sm: 6px;
}
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid var(--border); border-radius: var(--radius); }
.kpi { padding: 18px 20px; border-right: 1px solid var(--border); display: flex; flex-direction: column; gap: 10px; }
.kpi:last-child { border-right: 0; }
.kpi-label { font-size: 12px; color: var(--text-mute); font-weight: 500; }
.kpi-value { font-family: var(--font-mono); font-size: 26px; font-weight: 500; letter-spacing: -0.02em; }
.kpi-foot { display: flex; justify-content: space-between; align-items: center; }
.kpi-delta { font-family: var(--font-mono); font-size: 11px; color: var(--success); }
.kpi-delta.down { color: var(--danger); }
.spark-line { fill: none; stroke: var(--accent); stroke-width: 1.5; }
.card { border: 1px solid var(--border); border-radius: var(--radius); }
.card-head { padding: 14px 18px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
.card-title { font-size: 13px; font-weight: 600; }
.status { display: inline-flex; align-items: center; gap: 6px; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-family: var(--font-mono); font-weight: 500; }
.status::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.status.ok { color: var(--success); background: var(--success-soft); }
.status.failed { color: var(--danger); background: var(--danger-soft); }
.status.pending { color: var(--warn); background: var(--warn-soft); }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
thead th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-mute); padding: 10px 18px; background: var(--bg-soft); border-bottom: 1px solid var(--border); }
tbody td { padding: 12px 18px; border-bottom: 1px solid var(--border); }
td.mono { font-family: var(--font-mono); font-weight: 500; }
.cust-avatar { width: 26px; height: 26px; border-radius: 50%; background: linear-gradient(135deg, #635bff 0%, #ff5b6c 100%); color: #fff; display: grid; place-items: center; font-weight: 600; font-size: 10px; }
</style>
<!-- KPI row with sparkline (4 cards, divider lines, mono numbers, delta + sparkline) -->
<div class="kpis">
  <div class="kpi">
    <div class="kpi-label">Gross volume</div>
    <div class="kpi-value">$148,294.61</div>
    <div class="kpi-foot">
      <span class="kpi-delta">▲ 18.4%</span>
      <svg width="80" height="26" viewBox="0 0 80 26" preserveAspectRatio="none">
        <path class="spark-line" d="M0,18 L8,16 L16,17 L24,12 L32,14 L40,10 L48,11 L56,7 L64,9 L72,5 L80,4"/>
      </svg>
    </div>
  </div>
  <!-- … 3 more KPIs … -->
</div>
<!-- Real chart with axis grid, area fill, compare line -->
<svg viewBox="0 0 600 220" preserveAspectRatio="none">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#635bff" stop-opacity="0.18"/>
    <stop offset="100%" stop-color="#635bff" stop-opacity="0"/>
  </linearGradient></defs>
  <line x1="40" y1="20" x2="600" y2="20" stroke="#e5e5e7"/>
  <line x1="40" y1="120" x2="600" y2="120" stroke="#e5e5e7"/>
  <text x="0" y="24" fill="#8a8a8e" font-size="10" font-family="JetBrains Mono">$200k</text>
  <path d="M40,135 C90,125 160,112 270,92 C380,82 500,58 600,32 L600,180 L40,180 Z" fill="url(#g)"/>
  <path d="M40,135 C90,125 160,112 270,92 C380,82 500,58 600,32" stroke="#635bff" stroke-width="2" fill="none"/>
</svg>
<!-- Table row with avatar + mono amount + status pill -->
<tr><td>
  <div style="display:flex;align-items:center;gap:10px">
    <div class="cust-avatar">SC</div>
    <div><div style="font-weight:500">Sarah Chen</div><div style="font-size:11px;color:var(--text-mute)">sarah@acmecorp.com</div></div>
  </div>
</td><td class="mono">$2,490.00</td><td><span class="status ok">Succeeded</span></td></tr>
""".strip()


# ─── LANDING REFERENCE ──────────────────────────────────────────────
# Distilled from ~/design-library-sample/samples/recipe-a-orra.html
# Shows: warm cream palette + ONE accent color, three-font hierarchy
# (display + editorial serif + mono), marketing top nav (NO sidebar),
# hero with mixed serif + sans typography, generous section padding,
# section rhythm with hairline dividers. Editorial / agency-grade.
_LANDING_REFERENCE = """
<!-- ===== REFERENCE: EDITORIAL LANDING PAGE (recipe-a-orra style) ===== -->
<!-- ADAPT this to the user's brand — keep the principles, change the copy.
     Principles:
       1. THREE fonts: display sans (Outfit / Inter / Söhne), editorial serif
          (Playfair / Tiempos / EB Garamond) for hero accent words, mono
          (JetBrains / IBM Plex Mono) for tags / coords / footer meta.
       2. TWO colors only: a warm/dark base + ONE accent. NO indigo blue.
          NO chunky CTAs. CTAs are typed, not boxed.
       3. TOP NAV with logo (left) + 3-5 links (right) + tiny CTA. NO sidebar.
       4. Hero = 80vh, generous padding (--grid-margin: clamp(1.5rem, 5vw, 5rem)).
       5. Title mixes display sans + editorial serif italic for accent words:
          <h1>Turn support noise into <span class="serif italic">product clarity</span>.</h1>
       6. Section padding-y: 80-120px desktop. Sections separated by hairline
          1px borders, NOT background color shifts.
       7. Type-led CTAs: <a href="#">Get early access →</a> with arrow, no box.
       8. Logo strip = greyscale, mono font, "TRUSTED BY" label in tiny mono caps. -->
<style>
:root {
  --bg-base: #f4efe6; --bg-surface: #eae4d8;
  --text-bright: #1a1815; --text-default: #4a4639; --text-dim: #8a8474;
  --accent: #c43a2e;  /* deep vermillion — the ONLY color */
  --border: #d0c8b8;
  --font-display: 'Outfit', sans-serif;
  --font-editorial: 'Playfair Display', serif;
  --font-mono: 'IBM Plex Mono', monospace;
  --grid-margin: clamp(1.5rem, 5vw, 5rem);
}
body { background: var(--bg-base); color: var(--text-default); font-family: var(--font-display); }
.nav { position: fixed; top: 0; left: 0; right: 0; padding: var(--grid-margin); display: flex; justify-content: space-between; align-items: center; z-index: 100; }
.nav-logo { font-family: var(--font-display); font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: var(--text-bright); }
.nav-links { display: flex; gap: 2.5rem; }
.nav-links a { font-family: var(--font-mono); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-dim); }
.nav-links a:hover { color: var(--accent); }
.hero { min-height: 80vh; padding: calc(var(--grid-margin) * 3) var(--grid-margin) var(--grid-margin); display: flex; flex-direction: column; justify-content: center; }
.hero-tag { font-family: var(--font-mono); font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.15em; color: var(--accent); margin-bottom: 2rem; }
.hero-title { font-family: var(--font-display); font-size: clamp(3rem, 8vw, 7rem); font-weight: 200; line-height: 1.05; letter-spacing: -0.03em; color: var(--text-bright); margin-bottom: 2rem; max-width: 14ch; }
.hero-title .serif { font-family: var(--font-editorial); font-style: italic; font-weight: 400; }
.hero-description { font-family: var(--font-display); font-size: 1.125rem; line-height: 1.6; color: var(--text-default); max-width: 48ch; margin-bottom: 3rem; }
.hero-cta { display: inline-flex; align-items: center; gap: 0.75rem; font-family: var(--font-display); font-size: 1rem; font-weight: 500; color: var(--text-bright); border-bottom: 1px solid var(--text-bright); padding-bottom: 0.25rem; }
.hero-cta:hover { color: var(--accent); border-color: var(--accent); }
.section { padding: 8rem var(--grid-margin); border-top: 1px solid var(--border); }
.section-label { font-family: var(--font-mono); font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.15em; color: var(--text-dim); margin-bottom: 2rem; }
.section-title { font-family: var(--font-display); font-size: clamp(2rem, 4vw, 3rem); font-weight: 300; line-height: 1.15; letter-spacing: -0.02em; color: var(--text-bright); max-width: 24ch; margin-bottom: 1.5rem; }
.section-title .serif { font-family: var(--font-editorial); font-style: italic; }
.logo-strip { display: flex; align-items: center; gap: 3rem; padding: 4rem var(--grid-margin); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
.logo-strip-label { font-family: var(--font-mono); font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.15em; color: var(--text-dim); white-space: nowrap; }
.logo-strip-logos { display: flex; gap: 3rem; flex: 1; justify-content: space-evenly; opacity: 0.5; font-family: var(--font-display); font-weight: 600; font-size: 1.125rem; color: var(--text-default); }
</style>
<nav class="nav">
  <div class="nav-logo">HUM</div>
  <div class="nav-links"><a href="#">Product</a><a href="#">Pricing</a><a href="#">Customers</a><a href="#">Sign in →</a></div>
</nav>
<section class="hero">
  <span class="hero-tag">— Now in beta</span>
  <h1 class="hero-title">Turn support noise into <span class="serif">product clarity</span>.</h1>
  <p class="hero-description">Hum clusters every customer ticket into themes ranked by revenue impact. Stop guessing what to ship next.</p>
  <a href="#" class="hero-cta">Get early access <span style="font-family: var(--font-mono);">→</span></a>
</section>
<div class="logo-strip">
  <span class="logo-strip-label">Trusted by</span>
  <div class="logo-strip-logos"><span>Linear</span><span>Vercel</span><span>Notion</span><span>Railway</span><span>Supabase</span><span>Cal.com</span></div>
</div>
<section class="section">
  <div class="section-label">— How it works</div>
  <h2 class="section-title">Connect your inbox. <span class="serif">Get the answers</span> shipped.</h2>
  <!-- … 3-step explainer goes here … -->
</section>
""".strip()


# ─── FINANCE / OPERATIONS DASHBOARD REFERENCE ──────────────────────
# Distilled from ~/design-library-sample/samples/loans-ledger.html
# Used for finance / loans / risk / portfolio / trading dashboards
# where information density matters more than whitespace. Bloomberg-
# terminal vibes: dark warm base, ONE accent (amber-gold), muted status
# colours, tabular figures, market-stat strip in topbar, risk bars,
# inline progress, flag pills, applied-filter chips, bulk-action toolbar.
# This is the MINIMUM density bar for finance domains.
_FINANCE_DASHBOARD_REFERENCE = """
<!-- ===== REFERENCE: FINANCE / RISK / OPS DASHBOARD (Bloomberg / Apex / Plaid) ===== -->
<!-- Match THIS density and information richness. Adapt copy to user's domain.
     MANDATORY patterns to use (not optional):
       1. Tabular numerals — every numeric cell uses
          font-family: var(--font-mono); font-feature-settings: "tnum" 1, "zero" 1;
          font-variant-numeric: tabular-nums;
          So columns of $148,294.61 / $1,184,621.00 align perfectly.
       2. Topbar market-stat strip — 3 KPIs as MONO with bp deltas: WAR 6.834% ▲ 2bp.
       3. 5 KPI cards in a single row, each with sparkline (70x22 SVG path).
       4. Filter-tab strip with COUNTS in tiny mono badge after each label.
       5. Applied-filter chips — removable pills with × glyph (e.g. "Branch: Boston ×").
       6. Bulk-action toolbar revealed when rows selected:
          "3 selected of 1,847" + [Modify terms] [Send notice] [Refer to collections] [Charge off].
       7. Per-row inline data viz — progress bar under amount, 5-bar risk indicator next to %.
       8. Status pills with leading dot AND mono uppercase label (CURRENT / 30 DPD / 90 DPD / CHARGED OFF).
       9. Flag pills — tiny mono uppercase tags in semantic colour: COV / DOC / AML.
      10. Sidebar with multiple grouping bands and PROD env badge top-right of brand.
      11. Borrower cell: 24x24 colored avatar w/ initials + name + LN-ID · Branch in mono small.
      12. Real pagination (1, 2, 3, …, 132) — not just prev/next.
      13. 12+ visible table rows. Charged-off rows muted: balance "$0.00" in text-mute, no progress, no risk.
-->
<style>
:root {
  --bg: #0c0c0e; --bg-soft: #0f0f12; --bg-raised: #131316; --bg-hover: #18181c;
  --border: rgba(255,255,255,0.06); --border-strong: rgba(255,255,255,0.10);
  --text: #ededf0; --text-soft: #b4b4ba; --text-mute: #74747a;
  --accent: #d4a574; --accent-soft: rgba(212,165,116,0.10); --accent-line: rgba(212,165,116,0.22);
  --good: #4ea374; --good-soft: rgba(78,163,116,0.12);
  --warn: #d4a574; --warn-soft: rgba(212,165,116,0.10);
  --hot: #d97757;  --hot-soft: rgba(217,119,87,0.12);
  --bad: #c25656;  --bad-soft: rgba(194,86,86,0.12);
  --font-sans: 'Inter', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
}
.mono, td.mono, .num { font-family: var(--font-mono); font-feature-settings: "tnum" 1, "zero" 1; font-variant-numeric: tabular-nums; }
/* Topbar market-stat strip */
.market-stat { display: flex; gap: 14px; font-family: var(--font-mono); font-size: 11px; color: var(--text-mute); }
.market-stat-item span:first-child { font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; }
.market-stat-item span:last-child  { color: var(--text); font-weight: 500; }
/* KPI strip */
.kpis { display: grid; grid-template-columns: repeat(5, 1fr); border: 1px solid var(--border); border-radius: 8px; background: var(--bg-raised); }
.kpi { padding: 14px 18px; border-right: 1px solid var(--border); }
.kpi-label { font-family: var(--font-mono); font-size: 9.5px; color: var(--text-mute); text-transform: uppercase; letter-spacing: 0.1em; }
.kpi-value { font-family: var(--font-mono); font-size: 22px; font-weight: 500; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
/* Filter tabs with counts */
.filter-tabs { display: flex; gap: 1px; border: 1px solid var(--border); border-radius: 5px; padding: 2px; }
.filter-tabs button { padding: 4px 11px; font-size: 11.5px; font-family: var(--font-mono); color: var(--text-soft); border-radius: 3px; display: inline-flex; gap: 6px; }
.filter-tabs button.active { background: var(--bg-raised); color: var(--accent); }
.filter-tabs button .count { font-size: 9.5px; color: var(--text-mute); background: var(--bg-raised); padding: 0 4px; border-radius: 3px; }
/* Applied filter chips */
.chip { display: inline-flex; align-items: center; gap: 6px; padding: 3px 7px 3px 9px; border: 1px solid var(--accent-line); background: var(--accent-soft); color: var(--accent); border-radius: 5px; font-size: 11px; font-family: var(--font-mono); }
/* Status pill */
.status-pill { display: inline-flex; align-items: center; gap: 5px; padding: 1px 7px; border-radius: 3px; font-size: 10px; font-family: var(--font-mono); font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase; }
.status-pill::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
.status-pill.current { color: var(--good); background: var(--good-soft); }
.status-pill.dpd-30  { color: var(--warn); background: var(--warn-soft); }
.status-pill.dpd-90  { color: var(--bad);  background: var(--bad-soft); }
.status-pill.charge  { color: var(--text-mute); background: var(--bg-soft); border: 1px solid var(--border); }
/* Risk bars (5 segments, fill by tier) */
.risk-bars { display: inline-flex; gap: 2px; }
.risk-bar { width: 4px; height: 11px; background: var(--border-strong); border-radius: 1px; }
.risk-bar.on.lo { background: var(--good); }
.risk-bar.on.md { background: var(--warn); }
.risk-bar.on.hi { background: var(--bad); }
/* Inline progress under amount */
.amount-with-bar { display: flex; flex-direction: column; gap: 3px; align-items: flex-end; }
.amount-with-bar .progress { width: 100%; max-width: 110px; height: 2px; background: var(--border); border-radius: 1px; overflow: hidden; }
.amount-with-bar .progress-fill { height: 100%; background: var(--accent); }
/* Flag pills */
.flag { font-family: var(--font-mono); font-size: 10px; padding: 1px 5px; border-radius: 3px; font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase; }
.flag.cov { color: var(--bad); background: var(--bad-soft); }
.flag.doc { color: var(--warn); background: var(--warn-soft); }
.flag.aml { color: var(--hot); background: var(--hot-soft); }
/* Borrower cell */
.borrower { display: flex; align-items: center; gap: 9px; }
.borrower-avatar { width: 24px; height: 24px; border-radius: 4px; display: grid; place-items: center; font-family: var(--font-mono); font-weight: 600; font-size: 9.5px; color: var(--bg); }
.borrower-id { font-family: var(--font-mono); font-size: 10.5px; color: var(--text-mute); margin-top: 1px; letter-spacing: 0.02em; }
/* Bulk-action toolbar (revealed when rows selected) */
.bulk-bar { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-bottom: 1px solid var(--border); font-family: var(--font-mono); font-size: 11.5px; color: var(--text-mute); }
.bulk-action { padding: 3px 8px; border: 1px solid var(--border); border-radius: 3px; cursor: pointer; color: var(--text-soft); }
.bulk-action.danger:hover { color: var(--bad); border-color: var(--bad); }
</style>
<!-- Topbar market stats — drop into the topbar between search and actions -->
<div class="market-stat">
  <div class="market-stat-item"><span>WAR</span> <span>6.834%</span> <span style="color: var(--good);">▲ 2bp</span></div>
  <div class="market-stat-item"><span>NIM</span> <span>3.21%</span> <span style="color: var(--bad);">▼ 4bp</span></div>
  <div class="market-stat-item"><span>FED</span> <span>5.50%</span> <span>— 0bp</span></div>
</div>
<!-- Bulk-action toolbar above table head when 3 rows checked -->
<div class="bulk-bar">
  <span>☑</span><span><strong style="color:var(--text)">3 selected</strong> of 1,847 loans</span>
  <button class="bulk-action">Modify terms</button>
  <button class="bulk-action">Send notice</button>
  <button class="bulk-action">Refer to collections</button>
  <button class="bulk-action danger">Charge off</button>
</div>
<!-- Borrower row with name + LN-ID · Branch -->
<td>
  <div class="borrower">
    <div class="borrower-avatar" style="background:#4ea374">HC</div>
    <div>
      <div style="font-weight:500">Harbor Coffee Co.</div>
      <div class="borrower-id">LN-2024-04812 · Boston, MA</div>
    </div>
  </div>
</td>
<!-- Balance with progress -->
<td class="mono right">
  <div class="amount-with-bar">
    <span>$184,294.61</span>
    <div class="progress"><div class="progress-fill" style="width:74%"></div></div>
  </div>
</td>
<!-- Risk cell with 5-bar viz -->
<td class="right">
  <span style="display:inline-flex;align-items:center;gap:7px;font-family:var(--font-mono);font-size:11px">
    81%
    <span class="risk-bars"><span class="risk-bar on hi"></span><span class="risk-bar on hi"></span><span class="risk-bar on hi"></span><span class="risk-bar on hi"></span><span class="risk-bar"></span></span>
  </span>
</td>
<!-- Flag cell -->
<td><span class="flag cov">COV</span> <span class="flag doc">DOC</span></td>
<!-- Status pill examples -->
<span class="status-pill current">CURRENT</span>
<span class="status-pill dpd-30">30 DPD</span>
<span class="status-pill dpd-90">90 DPD</span>
<span class="status-pill charge">CHARGED OFF</span>
""".strip()


# Keyword → reference. Empty = no reference (vanilla list/form/modal screens
# don't need one — the design_block guidance is enough).
def reference_block_for_screen(screen_name: str, screen_kind: str = "screen", app_context: str = "") -> str:
    """Return distilled reference HTML for the screen's archetype.

    ``app_context`` carries the app domain (title + sibling screen names +
    intents) so domain-specific references (finance, etc.) are chosen for the
    whole app, not just for screens whose NAME happens to contain a keyword.
    A debt/loan app's "Dashboard" should look like the finance exemplar even
    though "Dashboard" isn't itself a finance word.

    Returns empty string when no reference applies (most app-internal screens).
    """
    if screen_kind == "landing":
        return _LANDING_REFERENCE
    # Live samples dir takes precedence: if a sample in design-library/samples/
    # declares matching keywords, use its distilled skeleton. Falls through to
    # the inline references below when no sample matches.
    sample = sample_block_for_screen(screen_name, screen_kind, app_context)
    if sample:
        return sample
    haystack = f"{screen_name} {screen_kind} {app_context}".lower()
    # Finance / risk / portfolio domains — match BEFORE generic dashboard.
    if any(
        tok in haystack
        for tok in (
            "loan",
            "underwrit",
            "delinqu",
            "portfolio",
            "risk",
            "credit",
            "collateral",
            "covenant",
            "treasury",
            "trading",
            "position",
        )
    ):
        return _FINANCE_DASHBOARD_REFERENCE
    if "dashboard" in haystack or "overview" in haystack or "analytics" in haystack:
        return _DASHBOARD_REFERENCE
    return ""
