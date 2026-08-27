"""Component-library catalogues for the wireframe generator.

When a session's `ai_config.library` is set to "shadcn", the per-screen
prompt is prepended with a block of canonical class patterns so the model
adapts shadcn primitives instead of inventing generic Tailwind from
scratch. This is the cheapest path to a Linear/Stripe-grade baseline:
DeepSeek can faithfully remix patterns it sees, but it can't invent
"institutional dense" vibes from a tone description alone.

The catalogues are static — we don't hit the shadcn registry at runtime
because the patterns are stable per shadcn major version, and pulling
them on every wireframe call would multiply latency for no quality gain.
"""

from __future__ import annotations

# shadcn/ui — using the official Tailwind class strings. Dark-mode-first
# so it composes with the existing canvas iframe shell. CSS variables
# (--background, --primary, --muted-foreground, etc.) come from the
# design-system memo so each session can reskin the same primitives.
_SHADCN: dict[str, str] = {
    "_intro": (
        "You are generating shadcn/ui-style markup. Use the exact class "
        "patterns below. Wrap CSS variables: bg-background, text-foreground, "
        "border-border, bg-card, bg-muted, text-muted-foreground, bg-primary, "
        "text-primary-foreground, bg-secondary, bg-destructive, etc. "
        "Default radius is rounded-md. Default shadow is shadow-sm. "
        "Spacing comes in multiples of 1 (4px). "
        "ALL primitives use these exact Tailwind classes — do NOT invent variations."
    ),
    "button_primary": (
        '<button class="inline-flex items-center justify-center gap-2 whitespace-nowrap '
        "rounded-md text-sm font-medium transition-colors focus-visible:outline-none "
        "focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none "
        "disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 "
        'h-9 px-4 py-2">Label</button>'
    ),
    "button_secondary": (
        '<button class="inline-flex items-center justify-center gap-2 whitespace-nowrap '
        "rounded-md text-sm font-medium border border-input bg-background hover:bg-accent "
        'hover:text-accent-foreground h-9 px-4 py-2">Label</button>'
    ),
    "button_ghost": (
        '<button class="inline-flex items-center justify-center gap-2 whitespace-nowrap '
        "rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground "
        'h-9 px-4 py-2">Label</button>'
    ),
    "button_destructive": (
        '<button class="inline-flex items-center justify-center gap-2 whitespace-nowrap '
        "rounded-md text-sm font-medium bg-destructive text-destructive-foreground "
        'hover:bg-destructive/90 h-9 px-4 py-2">Label</button>'
    ),
    "input": (
        '<input class="flex h-9 w-full rounded-md border border-input bg-transparent '
        "px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground "
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring "
        'disabled:cursor-not-allowed disabled:opacity-50" placeholder="Search…" />'
    ),
    "card": (
        '<div class="rounded-xl border bg-card text-card-foreground shadow-sm">'
        '<div class="flex flex-col space-y-1.5 p-6">'
        '<h3 class="text-2xl font-semibold leading-none tracking-tight">Title</h3>'
        '<p class="text-sm text-muted-foreground">Description.</p>'
        "</div>"
        '<div class="p-6 pt-0">Content</div>'
        "</div>"
    ),
    "badge_default": (
        '<span class="inline-flex items-center rounded-md border px-2.5 py-0.5 '
        "text-xs font-semibold transition-colors border-transparent "
        'bg-primary text-primary-foreground">Active</span>'
    ),
    "badge_secondary": (
        '<span class="inline-flex items-center rounded-md border px-2.5 py-0.5 '
        "text-xs font-semibold transition-colors border-transparent "
        'bg-secondary text-secondary-foreground">Pending</span>'
    ),
    "badge_destructive": (
        '<span class="inline-flex items-center rounded-md border px-2.5 py-0.5 '
        "text-xs font-semibold transition-colors border-transparent "
        'bg-destructive text-destructive-foreground">Suspended</span>'
    ),
    "badge_outline": (
        '<span class="inline-flex items-center rounded-md border px-2.5 py-0.5 '
        'text-xs font-semibold text-foreground">Label</span>'
    ),
    "table": (
        '<div class="rounded-md border">'
        '<table class="w-full caption-bottom text-sm">'
        '<thead class="[&_tr]:border-b">'
        '<tr class="border-b transition-colors hover:bg-muted/50">'
        '<th class="h-10 px-2 text-left align-middle font-medium text-muted-foreground">Col</th>'
        "</tr></thead>"
        '<tbody class="[&_tr:last-child]:border-0">'
        '<tr class="border-b transition-colors hover:bg-muted/50">'
        '<td class="p-2 align-middle">Cell</td>'
        "</tr></tbody></table></div>"
    ),
    "dialog": (
        # Modal — overlay + centred panel. Use data-trigger on the X button
        # so the simulator's modal-close handler picks it up.
        '<div class="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" data-overlay>'
        '<div class="fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] '
        'translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg sm:rounded-lg">'
        '<div class="flex flex-col space-y-1.5 text-center sm:text-left">'
        '<h2 class="text-lg font-semibold leading-none tracking-tight">Title</h2>'
        '<p class="text-sm text-muted-foreground">Description.</p>'
        "</div>"
        "<div>Content</div>"
        '<div class="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">'
        '<button class="...secondary classes...">Cancel</button>'
        '<button class="...primary classes...">Confirm</button>'
        "</div>"
        '<button data-trigger="close" class="absolute right-4 top-4 rounded-sm opacity-70 '
        'ring-offset-background transition-opacity hover:opacity-100">×</button>'
        "</div></div>"
    ),
    "sheet_right": (
        # Drawer that slides in from the right. Same close convention.
        '<div class="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" data-overlay>'
        '<div class="fixed inset-y-0 right-0 z-50 h-full w-3/4 max-w-md gap-4 bg-background '
        'p-6 shadow-lg border-l flex flex-col">'
        '<div class="flex flex-col space-y-2 text-left">'
        '<h2 class="text-lg font-semibold text-foreground">Title</h2>'
        '<p class="text-sm text-muted-foreground">Description.</p>'
        "</div>"
        '<div class="flex-1 overflow-y-auto">Content</div>'
        '<button data-trigger="close" class="absolute right-4 top-4 rounded-sm opacity-70 '
        'hover:opacity-100">×</button>'
        "</div></div>"
    ),
    "tabs": (
        '<div class="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 '
        'text-muted-foreground">'
        '<button class="inline-flex items-center justify-center whitespace-nowrap rounded-md '
        "px-3 py-1 text-sm font-medium ring-offset-background transition-all bg-background "
        'text-foreground shadow">Active</button>'
        '<button class="inline-flex items-center justify-center whitespace-nowrap rounded-md '
        'px-3 py-1 text-sm font-medium">Inactive</button>'
        "</div>"
    ),
    "dropdown": (
        '<div class="z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 '
        'text-popover-foreground shadow-md">'
        '<div class="relative flex cursor-default select-none items-center rounded-sm '
        'px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground">Item</div>'
        "</div>"
    ),
    "checkbox": (
        '<button role="checkbox" class="peer h-4 w-4 shrink-0 rounded-sm border border-primary '
        "shadow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring "
        'data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"></button>'
    ),
    "switch": (
        '<button role="switch" class="peer inline-flex h-5 w-9 shrink-0 cursor-pointer '
        "items-center rounded-full border-2 border-transparent transition-colors "
        'data-[state=checked]:bg-primary data-[state=unchecked]:bg-input">'
        '<span class="pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg '
        "ring-0 transition-transform data-[state=checked]:translate-x-4 "
        'data-[state=unchecked]:translate-x-0"></span></button>'
    ),
    "skeleton": ('<div class="animate-pulse rounded-md bg-muted h-4 w-full"></div>'),
    "empty_state": (
        '<div class="flex flex-col items-center justify-center text-center py-12 px-4">'
        '<div class="rounded-full bg-muted p-4 mb-4"></div>'
        '<h3 class="text-lg font-semibold">No items yet</h3>'
        '<p class="text-sm text-muted-foreground mt-1 max-w-sm">'
        "Get started by creating your first item.</p>"
        '<button class="...primary classes... mt-4">Create item</button>'
        "</div>"
    ),
}


# Mapping from "screen archetype hint" → which shadcn primitives to inject.
# The plan's screen kind/name gives us a hint about which patterns the
# screen is most likely to use; we don't dump the full catalogue every
# call (that'd waste tokens). Falls back to a sensible default set.
_ARCHETYPE_PRIMITIVES: dict[str, list[str]] = {
    "list": [
        "table",
        "button_primary",
        "button_secondary",
        "input",
        "badge_default",
        "badge_secondary",
        "badge_destructive",
        "badge_outline",
        "checkbox",
        "dropdown",
    ],
    "detail": ["card", "button_primary", "button_secondary", "button_ghost", "tabs", "badge_default", "badge_outline"],
    "form": ["card", "input", "button_primary", "button_secondary", "checkbox", "switch"],
    "modal": ["dialog", "input", "button_primary", "button_secondary", "checkbox"],
    "drawer": ["sheet_right", "input", "button_primary", "button_secondary", "tabs", "switch"],
    "dashboard": ["card", "table", "button_primary", "button_secondary", "tabs", "badge_default", "badge_secondary"],
    "settings": ["card", "tabs", "input", "switch", "button_primary", "button_secondary"],
    "landing": ["button_primary", "button_secondary", "card"],
    "auth": ["card", "input", "button_primary", "button_secondary"],
    "chat": [
        "input",
        "button_primary",
        "button_ghost",
        "card",
        "dropdown",
        "badge_outline",
        "skeleton",
    ],
    "kanban": [
        "card",
        "badge_default",
        "badge_secondary",
        "badge_outline",
        "button_primary",
        "button_secondary",
        "dropdown",
        "checkbox",
    ],
    "tracker": [
        "card",
        "button_primary",
        "button_ghost",
        "checkbox",
        "switch",
        "badge_default",
        "badge_outline",
    ],
    "game": [
        "button_primary",
        "button_secondary",
        "card",
        "dialog",
        "badge_default",
    ],
    "_default": ["button_primary", "button_secondary", "input", "card", "badge_default", "badge_outline"],
}


def _archetype_for(name: str, kind: str) -> str:
    """Cheap heuristic — match screen name/kind against archetype keys."""
    haystack = f"{name} {kind}".lower()
    if "modal" in haystack or "confirm" in haystack:
        return "modal"
    if "drawer" in haystack or "sheet" in haystack:
        return "drawer"
    # Chat / AI-assistant surfaces — match before "detail" / "list" so
    # "agent_detail" or "conversations" route to chat primitives, not generic.
    if "chat" in haystack or "conversation" in haystack or "message" in haystack or "agent" in haystack:
        return "chat"
    # Pipeline / kanban / CRM — match before generic dashboard/list.
    if "pipeline" in haystack or "kanban" in haystack or "deal" in haystack:
        return "kanban"
    # Game surfaces — play / level / score / arcade.
    if "play" in haystack or "level" in haystack or "arcade" in haystack or "puzzle" in haystack:
        return "game"
    # Habit / wellness / tracker surfaces.
    if (
        "habit" in haystack
        or "streak" in haystack
        or "today" == name.strip().lower()
        or "mood" in haystack
        or "journal" in haystack
    ):
        return "tracker"
    if "detail" in haystack or "profile" in haystack or "audit" in haystack:
        return "detail"
    if "dashboard" in haystack:
        return "dashboard"
    if "list" in haystack or "table" in haystack or "directory" in haystack or "users" == name.strip().lower():
        return "list"
    if "settings" in haystack or "preferences" in haystack:
        return "settings"
    if "form" in haystack or "create" in haystack or "new " in haystack or "edit " in haystack:
        return "form"
    if "landing" in haystack or "hero" in haystack or "marketing" in haystack:
        return "landing"
    if "login" in haystack or "sign" in haystack or "register" in haystack:
        return "auth"
    return "_default"


def shadcn_block_for_screen(screen_name: str, screen_kind: str = "screen") -> str:
    """Return a prompt fragment with shadcn class patterns for this screen.

    Empty string means "no library" — caller should skip the injection.
    """
    archetype = _archetype_for(screen_name, screen_kind)
    primitives = _ARCHETYPE_PRIMITIVES.get(archetype, _ARCHETYPE_PRIMITIVES["_default"])

    parts = ["===== SHADCN COMPONENT LIBRARY (mandatory) =====", _SHADCN["_intro"], ""]
    for key in primitives:
        snippet = _SHADCN.get(key)
        if not snippet:
            continue
        parts.append(f"<!-- {key} -->")
        parts.append(snippet)
        parts.append("")
    parts.append("===== END LIBRARY =====")
    return "\n".join(parts)


def shadcn_css_variables() -> str:
    """The CSS variable block to inject into the iframe shell when shadcn is
    active. Hardcoded shadcn-default dark theme — the design system can
    override individual variables on top to reskin.
    """
    return """:root {
  --background: 0 0% 100%;
  --foreground: 240 10% 3.9%;
  --card: 0 0% 100%;
  --card-foreground: 240 10% 3.9%;
  --popover: 0 0% 100%;
  --popover-foreground: 240 10% 3.9%;
  --primary: 240 5.9% 10%;
  --primary-foreground: 0 0% 98%;
  --secondary: 240 4.8% 95.9%;
  --secondary-foreground: 240 5.9% 10%;
  --muted: 240 4.8% 95.9%;
  --muted-foreground: 240 3.8% 46.1%;
  --accent: 240 4.8% 95.9%;
  --accent-foreground: 240 5.9% 10%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 0 0% 98%;
  --border: 240 5.9% 90%;
  --input: 240 5.9% 90%;
  --ring: 240 5.9% 10%;
  --radius: 0.5rem;
}
.dark {
  --background: 240 10% 3.9%;
  --foreground: 0 0% 98%;
  --card: 240 10% 3.9%;
  --card-foreground: 0 0% 98%;
  --popover: 240 10% 3.9%;
  --popover-foreground: 0 0% 98%;
  --primary: 0 0% 98%;
  --primary-foreground: 240 5.9% 10%;
  --secondary: 240 3.7% 15.9%;
  --secondary-foreground: 0 0% 98%;
  --muted: 240 3.7% 15.9%;
  --muted-foreground: 240 5% 64.9%;
  --accent: 240 3.7% 15.9%;
  --accent-foreground: 0 0% 98%;
  --destructive: 0 62.8% 30.6%;
  --destructive-foreground: 0 0% 98%;
  --border: 240 3.7% 15.9%;
  --input: 240 3.7% 15.9%;
  --ring: 240 4.9% 83.9%;
}"""


def get_library_block(library: str | None, screen_name: str, screen_kind: str = "screen") -> str:
    """Public entry point — returns the prompt fragment for the chosen
    library, or empty string for `custom` / unknown."""
    if (library or "").lower() != "shadcn":
        return ""
    return shadcn_block_for_screen(screen_name, screen_kind)
