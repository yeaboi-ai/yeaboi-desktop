"""Design library router + bundle loader.

Given a user brief, this service:

1. Classifies → `{recipe_letter, personality, density, energy, era, subvert}`
2. Resolves the file bundle (HARNESS + recipe + declared Files-to-read + conditionals)
3. Picks variation constraints from anti-similarity pools (seedable, forbid-list aware)
4. Composes a prompt block ready to inject into `generate-design-system`

See `backend/src/app/diagram_harness/design-library/HARNESS.md` for the source of truth.
"""

from __future__ import annotations

import json
import logging
import random
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .ai_provider import AIClient

logger = logging.getLogger(__name__)

LIBRARY_DIR = Path(__file__).resolve().parent.parent / "diagram_harness" / "design-library"
RECIPES_DIR = LIBRARY_DIR / "recipes"

# --- Canonical taxonomy ----------------------------------------------------

# Recipe codes — historically single letters a-z, extended with double-letter
# codes (aa, ab, ac, …) as new categories were added. Treat as opaque strings;
# the file lookup glob (`<code>-*.md`) supports either form.
RECIPE_LETTERS: tuple[str, ...] = tuple("abcdefghijklmnopqrstuvwxyz") + (
    "aa",  # AI product / assistant
    "ab",  # Wellness / habit tracker
    "ac",  # Browser game / interactive
)

PERSONALITIES = (
    "professional",
    "playful",
    "luxury",
    "brutalist",
    "editorial",
    "warm-human",
    "technical",
    "bold-adventurous",
    "organic-natural",
)

MODIFIER_LEVELS = ("low", "mid", "high")

# Recipe-letter → human-readable name (matches HARNESS table)
RECIPE_NAMES: dict[str, str] = {
    "a": "Creative Studio / Agency",
    "b": "SaaS / Product",
    "c": "Luxury / Brand",
    "d": "Restaurant / Hospitality",
    "e": "Real Estate / Property",
    "f": "Editorial / Content",
    "g": "Dashboard / Data Product",
    "h": "Photography / Portfolio",
    "i": "Film / Entertainment",
    "j": "Talent / Fashion Agency",
    "k": "Hardware / Physical Product",
    "l": "Immersive / Storytelling",
    "m": "E-commerce / Online Store",
    "n": "Event / Conference",
    "o": "Music / Artist",
    "p": "Non-Profit / Cause",
    "q": "Developer Docs / Technical",
    "r": "Education / Course",
    "s": "Personal / Newsletter",
    "t": "Local Business",
    "u": "Fintech / Banking",
    "v": "Travel / Tourism",
    "w": "Fitness / Wellness",
    "x": "Construction / Architecture",
    "y": "Marketplace / Platform",
    "z": "Podcast / Media",
    "aa": "AI Product / Assistant",
    "ab": "Wellness / Habit Tracker",
    "ac": "Browser Game / Interactive",
}

# --- Anti-similarity pools -------------------------------------------------
# Mirrors anti-similarity.md. Keys are stable machine IDs used in forbid lists.

POOLS: dict[str, dict[str, str]] = {
    "layout": {
        "asymmetric-split": "Asymmetric split 60/40 or 70/30 — never centred hero.",
        "off-grid-drop-caps": "Off-grid drop cap — primary heading first letter bleeds left.",
        "diagonal-zoning": "Diagonal zoning — ≤10° rotation or skew on one hero element.",
        "horizontal-rail": "Horizontal rail — one sideways-scroll element among vertical content.",
        "overlap-stack": "Overlap stack — hero image overlaps headline by ≥15%.",
        "grid-intentional-gap": "12-column grid with one column deliberately left empty.",
        "full-bleed-interruption": "One section breaks out of max-width and bleeds edge to edge.",
        "margin-note-column": "Right margin reserved for dates, captions, metadata.",
        "two-line-split-headline": "Headline splits across two lines with different alignment.",
        "centred-but-constrained": "Everything centred, but content width varies per section.",
    },
    "type": {
        "extreme-scale-contrast": "Extreme scale contrast — hero 5–8× body size; no middle.",
        "weight-only-hierarchy": "Single family, hierarchy by weight (200/500/800) not size.",
        "mixed-case-hero": "Headline in lowercase except proper nouns.",
        "uppercase-labels-everywhere": "All section labels, buttons, meta in UPPERCASE with 0.05–0.1em tracking.",
        "letter-spaced-body": "Body copy tracked +0.02em for reading calm.",
        "display-serif-mono-body": "Unusual pairing — serif display with monospace body.",
        "italic-display": "Hero in italic cut of the display face.",
        "variable-weight-axis": "Single variable font, weight changes per section.",
        "numbers-in-display-face": "Prices, counts, years rendered in display/serif at dramatic scale.",
        "inline-accent-heading": "One word in the headline gets the accent colour.",
    },
    "color": {
        "two-colour-constraint": "Background + ONE saturated accent. No third colour.",
        "monochromatic-tint-ladder": "5 tints of a single hue; accent from saturation not hue.",
        "warm-cool-accent": "Everything warm except one cool accent.",
        "cool-warm-accent": "Everything cool except one warm accent.",
        "saturated-dark": "Dark mode where the 'dark' is saturated (deep green, aubergine, indigo-night).",
        "newsprint": "Off-white base, near-black text, one red or one blue accent.",
        "photograph-driven": "UI is monochrome; all colour comes from content photography.",
        "gradient-as-brand": "One continuous gradient is the brand; no flat accent.",
        "pastel-constraint": "All colours desaturated to pastel (≤40% saturation).",
        "high-contrast-poster": "2–3 flat saturated colours, no gradients, no transparency.",
    },
    "motion": {
        "static": "No motion beyond state transitions. The calm is the statement.",
        "single-signature-easing": "Pick one cubic-bezier and use it on every animated property.",
        "slow-reveals": "All scroll reveals ≥800ms.",
        "snap-transitions": "No easing; instant state changes. Brutalist / technical feel.",
        "magnetic-cursor": "Buttons subtly attract the cursor on hover (≤8px pull).",
        "text-split-reveal": "Hero headline reveals word-by-word or line-by-line on load.",
        "staggered-grid": "Cards / list items enter with 40–80ms stagger.",
        "background-drift": "Ambient slow gradient or blob motion in the background.",
        "scroll-linked-scale": "Hero element scales or shifts with scroll depth.",
        "cursor-as-tool": "Custom cursor with specific hover states per element type.",
    },
    "micro": {
        "tabular-numerics": "`font-variant-numeric: tabular-nums` on all number display.",
        "underline-on-hover": "Links get a drawing-in underline on hover, not colour-shift.",
        "hand-drawn-icons": "SVG paths with irregular stroke widths, not perfect geometrics.",
        "grain-overlay": "Subtle grain (3–6% opacity) on hero and background.",
        "border-as-accent": "Hairline borders in the accent colour.",
        "square-corners": "`border-radius: 0` throughout.",
        "soft-shadows-no-blur": "Shadows with 0 blur, 4–8px offset, dim colour.",
        "neon-edge-glow": "Accent-coloured 0-blur glow on hover/focus.",
        "typographic-punctuation": "Real typographic marks (“ ” ‘ ’ — … ×), never straight quotes.",
        "coordinate-frame-numbers": "Visible coordinate labels, frame numbers, section IDs.",
    },
    "density": {
        "one-concept-per-viewport": "Every viewport height has a single focus.",
        "dense-above-fold": "Hero and first meaningful content visible without scroll.",
        "margin-note-density": "Primary content sparse; supporting info in right/left margin.",
        "data-forward": "Numbers, counts, specs dominate hero.",
        "photography-forward": "≥60% of each viewport is imagery.",
        "type-forward": "Text-only hero; images deferred to later sections.",
        "progressive-density": "Starts sparse, gets denser as user scrolls.",
        "tabular-hero": "Hero is a comparison table, spec sheet, or data grid.",
        "list-as-landing": "The page is a long list — no traditional hero.",
        "dashboard-hero": "The hero is a live data panel (active users, recent events).",
    },
}

# Which picks to avoid per personality (mirrors anti-similarity.md compatibility table).
PERSONALITY_AVOID: dict[str, dict[str, set[str]]] = {
    "professional": {
        "layout": {"diagonal-zoning"},
        "type": {"italic-display", "mixed-case-hero"},
        "color": {"gradient-as-brand", "high-contrast-poster"},
        "motion": {"magnetic-cursor"},
        "micro": {"hand-drawn-icons", "grain-overlay"},
        "density": {"list-as-landing"},
    },
    "playful": {
        "color": {"monochromatic-tint-ladder"},
        "motion": {"static"},
        "micro": {"square-corners"},
    },
    "luxury": {
        "layout": {"full-bleed-interruption"},
        "color": {"high-contrast-poster", "saturated-dark"},
        "motion": {"snap-transitions"},
        "micro": {"hand-drawn-icons"},
        "density": {"dashboard-hero"},
    },
    "brutalist": {
        "layout": {"centred-but-constrained"},
        "type": {"letter-spaced-body"},
        "color": {"pastel-constraint"},
        "motion": {"slow-reveals"},
    },
    "editorial": {
        "color": {"gradient-as-brand"},
        "density": {"dashboard-hero"},
    },
    "warm-human": {
        "layout": {"diagonal-zoning"},
        "color": {"saturated-dark", "high-contrast-poster"},
        "motion": {"snap-transitions"},
        "micro": {"neon-edge-glow", "square-corners"},
        "density": {"dashboard-hero"},
    },
    "technical": {
        "layout": {"diagonal-zoning"},
        "type": {"italic-display", "mixed-case-hero"},
        "color": {"pastel-constraint", "photograph-driven"},
        "motion": {"magnetic-cursor"},
        "micro": {"hand-drawn-icons"},
        "density": {"photography-forward"},
    },
    "bold-adventurous": {
        "type": {"letter-spaced-body"},
        "color": {"pastel-constraint"},
        "motion": {"static"},
    },
    "organic-natural": {
        "color": {"saturated-dark", "high-contrast-poster"},
        "motion": {"snap-transitions"},
        "micro": {"neon-edge-glow", "square-corners"},
        "density": {"dashboard-hero"},
    },
}


# --- Dataclasses -----------------------------------------------------------


@dataclass
class Classification:
    recipe_letter: str
    personality: str
    density: str  # "low" | "mid" | "high"
    energy: str
    era: str
    rationale: str
    subvert: bool = False
    admin: bool = False  # force utility-interfaces load

    @property
    def recipe_name(self) -> str:
        return RECIPE_NAMES.get(self.recipe_letter, self.recipe_letter.upper())


@dataclass
class VariationPicks:
    layout: str
    type: str
    color: str
    motion: str
    micro: str
    density: str

    def to_dict(self) -> dict[str, str]:
        return {
            "layout": self.layout,
            "type": self.type,
            "color": self.color,
            "motion": self.motion,
            "micro": self.micro,
            "density": self.density,
        }


@dataclass
class Bundle:
    classification: Classification
    variation: VariationPicks
    files_loaded: list[str] = field(default_factory=list)
    file_contents: dict[str, str] = field(default_factory=dict)
    prompt_block: str = ""
    token_estimate: int = 0
    forbid_used: list[dict[str, str]] = field(default_factory=list)


# --- Recipe parsing --------------------------------------------------------

_FILES_TO_READ_RE = re.compile(r"\*\*Files to read:\*\*\s*(.+)", re.IGNORECASE)
_BACKTICK_RE = re.compile(r"`([^`]+)`")


def _recipe_path(letter: str) -> Path:
    """Find the recipe file for a letter (glob `{letter}-*.md`)."""
    matches = list(RECIPES_DIR.glob(f"{letter}-*.md"))
    if not matches:
        raise FileNotFoundError(f"No recipe for letter {letter!r} in {RECIPES_DIR}")
    return matches[0]


def _parse_files_to_read(recipe_text: str) -> list[str]:
    """Extract the filenames listed on the `Files to read:` line of a recipe.

    The line looks like:
        - **Files to read:** `07-page-archetypes.md` > SaaS Landing Page, `04-components.md`, ...

    Returns the raw filenames (without subsection pointers).
    """
    m = _FILES_TO_READ_RE.search(recipe_text)
    if not m:
        return []
    line = m.group(1)
    files = _BACKTICK_RE.findall(line)
    # Strip any `>` subsection pointer — we load the whole file.
    cleaned: list[str] = []
    for f in files:
        name = f.split(">")[0].strip()
        if name.endswith(".md"):
            cleaned.append(name)
    return cleaned


def _estimate_tokens(text: str) -> int:
    """Cheap heuristic — ~4 chars per token."""
    return max(1, len(text) // 4)


# --- Classification --------------------------------------------------------


_CLASSIFY_SYSTEM = """You route user briefs to design recipes. Output ONLY JSON.

CRITICAL recipe-routing rules:
- B2B INTERNAL TOOLS (loan platforms, CRMs, admin panels, underwriting,
  servicing, compliance, trading desks, ops dashboards, helpdesks, fleet,
  inventory, EMR, finance, payroll, customer support tools) → recipe `u`
  (fintech / utility) or `g` (admin/CRUD). NEVER recipe `f` (editorial)
  even when the user says "Bloomberg-terminal", "institutional",
  "trustworthy", "dense" — those are tone hints for a UTILITY recipe,
  not a magazine. Editorial = magazines, newspapers, journals, content
  marketing — NOT dashboards.
- AI / LLM / CHATBOT / AGENT PRODUCTS (chat-with-X, AI assistant, agent
  builder, prompt library, copilot, AI writer/generator) → recipe `aa`
  (AI product). This is distinct from recipe `b` (generic SaaS) because
  the primary UI is a chat surface, not a marketing landing.
- HABIT / JOURNAL / WELLNESS / SELF-TRACKING (mood tracker, fitness log,
  meditation, sleep, gratitude journal, streak app) → recipe `ab`. This
  is distinct from recipe `w` (gym/fitness brand site) — `ab` is the
  app interior, `w` is the marketing site.
- BROWSER GAMES / INTERACTIVE TOYS (puzzle, arcade, quiz, trivia, idle
  game, casual web game) → recipe `ac`.
- SALES CRM / PIPELINE TOOLS → recipe `g` (admin/CRUD) with personality
  `professional`. They share the dashboard shell pattern.
- DIRECTORY / AGGREGATOR / CURATED LIST (filtered listings, Awesome-list
  style, niche directories) → recipe `y` (marketplace) when the listings
  are transactable, else recipe `f` (editorial) for content-led
  directories.
- "subvert": false for any internal tool / dashboard / data app, even
  when the user wants a distinctive look. "subvert"=true is reserved for
  marketing pages and award-bait portfolios.
- A B2B SaaS dashboard with "institutional" / "Bloomberg-terminal" tone
  is recipe `u` with personality `trustworthy` or `precise`, density
  `high`, energy `low`. NOT editorial."""


def _build_classify_user_prompt(brief: str) -> str:
    rows = "\n".join(f"  {k} = {v}" for k, v in RECIPE_NAMES.items())
    return f"""Classify this brief into a recipe, personality, and modifiers.

BRIEF:
{brief.strip()[:2000]}

RECIPES (pick ONE letter):
{rows}

PERSONALITIES (pick ONE): {", ".join(PERSONALITIES)}

MODIFIERS (each is one of low|mid|high — default mid):
- density (sparse → dense)
- energy (calm → intense; high enables WebGL)
- era (classic → contemporary)

Output JSON exactly:
{{
  "recipe_letter": "<one of the codes above — usually a-z, or aa/ab/ac>",
  "personality": "<one of the 9>",
  "density": "<low|mid|high>",
  "energy": "<low|mid|high>",
  "era": "<low|mid|high>",
  "subvert": <true if brief asks for distinctive/editorial/award-quality, else false>,
  "admin": <true if brief mentions admin/CRUD/inventory/back-office/internal tool, else false>,
  "rationale": "<one sentence — why this combination fits>"
}}"""


async def classify_brief(brief: str, ai_client: AIClient) -> Classification:
    """Call the AI to classify a brief. Raises on parse failure — caller may
    fall back to `fallback_classify` for keyword routing."""
    raw = await ai_client.chat(
        system=_CLASSIFY_SYSTEM,
        messages=[{"role": "user", "content": _build_classify_user_prompt(brief)}],
        max_tokens=400,
    )
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3]
    data = json.loads(raw.strip())

    letter = str(data.get("recipe_letter", "")).strip().lower()
    if letter not in RECIPE_LETTERS:
        raise ValueError(f"invalid recipe_letter: {data.get('recipe_letter')!r}")

    personality = str(data.get("personality", "")).strip().lower().replace(" ", "-").replace("/", "-")
    # Normalise common variants ("warm" → "warm-human", etc.)
    _ALIASES = {
        "warm": "warm-human",
        "bold": "bold-adventurous",
        "organic": "organic-natural",
    }
    personality = _ALIASES.get(personality, personality)
    if personality not in PERSONALITIES:
        raise ValueError(f"invalid personality: {data.get('personality')!r}")

    def _norm_level(v: str) -> str:
        v = str(v).strip().lower()
        return v if v in MODIFIER_LEVELS else "mid"

    return Classification(
        recipe_letter=letter,
        personality=personality,
        density=_norm_level(data.get("density", "mid")),
        energy=_norm_level(data.get("energy", "mid")),
        era=_norm_level(data.get("era", "mid")),
        rationale=str(data.get("rationale", "")).strip(),
        subvert=bool(data.get("subvert", False)),
        admin=bool(data.get("admin", False)),
    )


_KEYWORD_RECIPES: list[tuple[str, tuple[str, ...]]] = [
    # AI / LLM / agent products come FIRST — the brief often mentions
    # "saas" or "dashboard" alongside "AI", and we want the AI cue to win.
    (
        "aa",
        (
            "ai assistant",
            "ai chat",
            "llm",
            "chatbot",
            "chat with",
            "agent builder",
            "copilot",
            "prompt library",
            "rag app",
            "ai writer",
            "ai generator",
            "ai tool",
        ),
    ),
    (
        "ab",
        (
            "habit tracker",
            "habit app",
            "mood tracker",
            "journal app",
            "gratitude",
            "meditation app",
            "sleep tracker",
            "streak",
            "wellness app",
            "self-care",
            "self tracking",
        ),
    ),
    (
        "ac",
        (
            "browser game",
            "puzzle game",
            "arcade",
            "trivia",
            "quiz game",
            "wordle",
            "idle game",
            "web game",
            "casual game",
        ),
    ),
    (
        "u",
        (
            "fintech",
            "bank",
            "crypto",
            "trading",
            "loan",
            "lender",
            "lending",
            "underwriting",
            "underwrite",
            "delinquency",
            "credit union",
            "cdfi",
            "treasury",
            "portfolio",
            "risk",
            "compliance",
            "kyc",
            "aml",
            "bloomberg",
            "terminal",
            "institutional",
            "servicing",
        ),
    ),
    (
        "g",
        (
            "dashboard",
            "analytics",
            "admin",
            "crud",
            "inventory",
            "back-office",
            "internal tool",
            "monitoring",
            "ops",
            "ticketing",
            "helpdesk",
            "fleet",
            "emr",
            "ehr",
            "payroll",
            "hris",
        ),
    ),
    ("q", ("api docs", "developer docs", "sdk docs", "reference")),
    ("c", ("luxury", "premium", "high-end", "couture")),
    ("d", ("restaurant", "hotel", "venue", "hospitality")),
    ("e", ("real estate", "property", "apartment listing")),
    ("f", ("magazine", "journalism", "editorial", "long-form")),
    ("h", ("photography", "photo portfolio", "visual portfolio")),
    ("i", ("film", "cinema", "production company")),
    ("m", ("ecommerce", "shop", "storefront", "online store")),
    ("n", ("conference", "event", "festival", "exhibition")),
    ("o", ("music", "band", "record label", "album")),
    ("p", ("charity", "non-profit", "nonprofit", "ngo")),
    ("r", ("course", "bootcamp", "online learning", "education")),
    ("t", ("plumber", "salon", "clinic", "local business")),
    ("v", ("travel", "tour", "destination", "holiday")),
    ("w", ("gym", "fitness", "wellness", "yoga studio")),
    ("x", ("construction", "architect", "builder")),
    ("y", ("marketplace", "aggregator", "two-sided platform")),
    ("z", ("podcast", "show", "episodes")),
    ("a", ("agency", "studio", "portfolio")),
    ("b", ("saas", "product landing", "dev tool", "app marketing")),
]


def fallback_classify(brief: str) -> Classification:
    """Keyword-only classifier. Used if the LLM call fails."""
    b = brief.lower()
    letter = "b"
    for cand, keywords in _KEYWORD_RECIPES:
        if any(k in b for k in keywords):
            letter = cand
            break

    personality = "professional"
    if any(w in b for w in ("luxury", "premium", "elegant")):
        personality = "luxury"
    elif any(w in b for w in ("playful", "fun", "friendly")):
        personality = "playful"
    elif any(w in b for w in ("editorial", "magazine", "long-form")):
        personality = "editorial"
    elif any(w in b for w in ("brutal", "raw", "punk")):
        personality = "brutalist"
    elif any(w in b for w in ("technical", "developer", "api")):
        personality = "technical"

    admin = any(w in b for w in ("admin", "crud", "inventory", "back-office", "internal tool"))
    subvert = any(w in b for w in ("award", "distinctive", "bold", "editorial"))

    return Classification(
        recipe_letter=letter,
        personality=personality,
        density="mid",
        energy="mid",
        era="mid",
        rationale="keyword fallback (LLM classifier unavailable)",
        subvert=subvert,
        admin=admin,
    )


# --- Variation picking -----------------------------------------------------


def pick_variation(
    personality: str,
    *,
    seed: int | None = None,
    forbid_list: list[dict[str, str]] | None = None,
) -> VariationPicks:
    """Pick one constraint from each of the 6 pools, honouring personality
    compatibility and a recent-outputs forbid list.

    `forbid_list` is a list of prior picks (each a dict with keys matching
    pool names). The last 3 are used (as per anti-similarity.md default).
    """
    rng = random.Random(seed)
    avoid = PERSONALITY_AVOID.get(personality, {})
    recent = (forbid_list or [])[-3:]

    picks: dict[str, str] = {}
    degraded: list[str] = []

    for pool_name, pool in POOLS.items():
        candidates = list(pool.keys())
        # Drop personality-incompatible
        candidates = [c for c in candidates if c not in avoid.get(pool_name, set())]
        # Drop anything in the recent forbid list
        forbidden_recent = {r.get(pool_name) for r in recent if r.get(pool_name)}
        filtered = [c for c in candidates if c not in forbidden_recent]

        if filtered:
            pick = rng.choice(filtered)
        elif candidates:
            # Degrade: allow repetition from the 2nd-most-recent output
            relaxed = [c for c in candidates if c not in {r.get(pool_name) for r in recent[-1:] if r.get(pool_name)}]
            pick = rng.choice(relaxed or candidates)
            degraded.append(pool_name)
        else:
            # No candidates survive compatibility — pick anything from the pool
            pick = rng.choice(list(pool.keys()))
            degraded.append(f"{pool_name}(forced)")
        picks[pool_name] = pick

    if degraded:
        logger.info("Variation picker degraded pools: %s", degraded)

    return VariationPicks(**picks)


# --- Bundle loading --------------------------------------------------------


def _webgl_recipe_applies(letter: str) -> bool:
    """Recipes where Energy=High unlocks WebGL treatment (from HARNESS step 8).

    Not all recipes benefit. These are the ones whose recipe file declares a
    WebGL enhancement block — verified against recipe contents at load time.
    """
    candidates = {"a", "c", "h", "i", "k", "l", "m", "n", "o", "v"}
    if letter not in candidates:
        return False
    path = _recipe_path(letter)
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return False
    return "webgl" in text.lower()


def load_bundle(
    classification: Classification,
    *,
    variation: VariationPicks | None = None,
    forbid_list: list[dict[str, str]] | None = None,
    seed: int | None = None,
) -> Bundle:
    """Resolve the file bundle + variation picks + composed prompt."""
    if variation is None:
        variation = pick_variation(classification.personality, seed=seed, forbid_list=forbid_list)

    files_loaded: list[str] = []
    contents: dict[str, str] = {}

    def _load(rel: str) -> None:
        if rel in contents:
            return
        path = LIBRARY_DIR / rel
        if not path.exists():
            logger.warning("Design library file missing: %s", rel)
            return
        contents[rel] = path.read_text(encoding="utf-8")
        files_loaded.append(rel)

    # Always load
    _load("HARNESS.md")
    _load("anti-similarity.md")

    # Recipe + its declared Files-to-read
    recipe_path = _recipe_path(classification.recipe_letter)
    recipe_rel = str(recipe_path.relative_to(LIBRARY_DIR))
    _load(recipe_rel)

    recipe_text = contents.get(recipe_rel, "")
    for f in _parse_files_to_read(recipe_text):
        _load(f)

    # Conditionals
    if classification.recipe_letter == "g":
        _load("08-dashboards.md")
        # Locked palette set — every dashboard must pick one of these by name
        # rather than improvise. Stops the AI from emitting violet backgrounds,
        # tinted surfaces, or one-off color schemes that drift across runs.
        _load("08a-dashboard-palettes.md")
    if classification.admin:
        _load("utility-interfaces.md")
    if classification.subvert or classification.personality in ("editorial", "brutalist", "luxury"):
        _load("when-to-subvert.md")
    if classification.energy == "high" and _webgl_recipe_applies(classification.recipe_letter):
        _load("webgl-core.md")
        _load("webgl-recipes.md")

    prompt_block = compose_prompt_block(classification, variation, (forbid_list or [])[-3:])
    token_estimate = sum(_estimate_tokens(t) for t in contents.values()) + _estimate_tokens(prompt_block)

    return Bundle(
        classification=classification,
        variation=variation,
        files_loaded=files_loaded,
        file_contents=contents,
        prompt_block=prompt_block,
        token_estimate=token_estimate,
        forbid_used=(forbid_list or [])[-3:],
    )


# --- Prompt composition ----------------------------------------------------


def _format_variation_directives(v: VariationPicks) -> str:
    lines = []
    for pool_name, pick in v.to_dict().items():
        desc = POOLS[pool_name][pick]
        lines.append(f"- [{pool_name}:{pick}] {desc}")
    return "\n".join(lines)


def _format_forbid_directives(recent: list[dict[str, str]]) -> str:
    if not recent:
        return "(none — first output for this team/recipe)"
    lines: list[str] = []
    for i, r in enumerate(recent, 1):
        joined = ", ".join(f"{k}={v}" for k, v in r.items() if v)
        lines.append(f"- output #{i}: {joined}")
    return "\n".join(lines)


def compose_prompt_block(
    classification: Classification,
    variation: VariationPicks,
    forbid_recent: list[dict[str, str]],
) -> str:
    """Produce the prompt chunk injected into the design-system generator."""
    return f"""DESIGN BRIEF ROUTING
- Recipe: {classification.recipe_letter.upper()} — {classification.recipe_name}
- Personality: {classification.personality}
- Modifiers: density={classification.density}, energy={classification.energy}, era={classification.era}
- Subvert mode: {"ON" if classification.subvert else "off"}
- Admin/utility overlay: {"ON" if classification.admin else "off"}
- Rationale: {classification.rationale}

VARIATION CONSTRAINTS — you MUST honour all of these:
{_format_variation_directives(variation)}

FORBID LIST — do NOT reuse these patterns from the team's recent outputs:
{_format_forbid_directives(forbid_recent)}

When you output tokens, also emit a DESIGN MEMO JSON alongside that explains:
- which recipe / personality / modifiers you applied and why
- which variation picks shaped the fingerprint
- which anti-patterns from the recipe you deliberately avoided
- any subversions you made (if subvert=ON)
"""


# --- End-to-end entry point -----------------------------------------------


async def build_design_bundle(
    brief: str,
    ai_client: AIClient,
    *,
    forbid_list: list[dict[str, str]] | None = None,
    seed: int | None = None,
) -> Bundle:
    """Classify → pick variation → load bundle. Falls back to keyword routing
    if the classifier LLM call fails."""
    try:
        classification = await classify_brief(brief, ai_client)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Design classifier failed (%s); using keyword fallback", exc)
        classification = fallback_classify(brief)

    return load_bundle(classification, forbid_list=forbid_list, seed=seed)
