# ruff: noqa: E501
"""Archetype → minimum-viable screen set table.

Used by `WireframePlanService` to assemble a default screen plan from a
user's brief. Each archetype encodes a known set of screens that almost
every app of that kind needs (e.g. every marketplace needs a checkout).
The classifier picks one or more archetypes; the assembler unions their
screen sets, dedupes, and tiers them.

Each entry's `tier` is the default for that screen *within* that
archetype — the user can promote/demote via the editable plan card.

Lines intentionally exceed 120 chars — the column-aligned table is the
human reference for what each archetype contains.
"""

from typing import Literal, TypedDict

ScreenKind = Literal["screen", "modal", "drawer", "popover"]
ScreenTier = Literal["hero", "secondary", "optional"]


class ArchetypeScreen(TypedDict):
    id: str
    name: str
    intent: str
    kind: ScreenKind
    tier: ScreenTier


# fmt: off
ARCHETYPES: dict[str, list[ArchetypeScreen]] = {
    "consumer-content": [
        {"id": "home",         "name": "Home",          "intent": "Featured content + continue-watching/listening",          "kind": "screen", "tier": "hero"},
        {"id": "browse",       "name": "Browse",        "intent": "Discovery via genre / mood / curated lists",              "kind": "screen", "tier": "hero"},
        {"id": "detail",       "name": "Item Detail",   "intent": "Single piece of content with metadata + play/read CTA",   "kind": "screen", "tier": "hero"},
        {"id": "player",       "name": "Player",        "intent": "Active playback with transport controls + queue",         "kind": "screen", "tier": "secondary"},
        {"id": "library",      "name": "Library",       "intent": "User's saved / downloaded / recently-played",             "kind": "screen", "tier": "secondary"},
        {"id": "search",       "name": "Search",        "intent": "Query input + ranked results",                            "kind": "screen", "tier": "secondary"},
        {"id": "profile",      "name": "Profile",       "intent": "User identity, stats, public-facing profile",             "kind": "screen", "tier": "secondary"},
        {"id": "settings",     "name": "Settings",      "intent": "Preferences, downloads, playback quality",                "kind": "screen", "tier": "optional"},
        {"id": "login",        "name": "Login",         "intent": "Email + password / SSO entry",                            "kind": "screen", "tier": "secondary"},
        {"id": "onboarding",   "name": "Onboarding",    "intent": "First-run interest selection / personalization",          "kind": "screen", "tier": "optional"},
    ],
    "consumer-social": [
        {"id": "feed",         "name": "Feed",          "intent": "Reverse-chronological / algorithmic post stream",         "kind": "screen", "tier": "hero"},
        {"id": "post_detail",  "name": "Post Detail",   "intent": "Single post + comments + reactions",                      "kind": "screen", "tier": "hero"},
        {"id": "compose",      "name": "Compose",       "intent": "Create a new post / story / reply",                       "kind": "modal",  "tier": "hero"},
        {"id": "profile",      "name": "Profile",       "intent": "User profile with posts + follow CTA",                    "kind": "screen", "tier": "secondary"},
        {"id": "messages",     "name": "Messages",      "intent": "DM list + conversation view",                             "kind": "screen", "tier": "secondary"},
        {"id": "notifications","name": "Notifications", "intent": "Activity feed (likes, follows, mentions)",                "kind": "screen", "tier": "secondary"},
        {"id": "search",       "name": "Search",        "intent": "Find users / hashtags / topics",                          "kind": "screen", "tier": "secondary"},
        {"id": "settings",     "name": "Settings",      "intent": "Privacy, blocked users, account",                         "kind": "screen", "tier": "optional"},
        {"id": "login",        "name": "Login",         "intent": "Auth entry",                                              "kind": "screen", "tier": "secondary"},
        {"id": "onboarding",   "name": "Onboarding",    "intent": "Pick interests / find people to follow",                  "kind": "screen", "tier": "optional"},
    ],
    "marketplace": [
        {"id": "browse",       "name": "Browse",        "intent": "Faceted catalogue with filters + sort",                   "kind": "screen", "tier": "hero"},
        {"id": "listing",      "name": "Listing Detail","intent": "Item gallery + price + seller + add-to-cart",             "kind": "screen", "tier": "hero"},
        {"id": "checkout",     "name": "Checkout",      "intent": "Shipping, payment, review-and-pay",                       "kind": "screen", "tier": "hero"},
        {"id": "seller",       "name": "Seller Profile","intent": "Seller's storefront + ratings + other listings",          "kind": "screen", "tier": "secondary"},
        {"id": "my_listings",  "name": "My Listings",   "intent": "Active / sold / draft listings (seller side)",            "kind": "screen", "tier": "secondary"},
        {"id": "messages",     "name": "Messages",      "intent": "Buyer ↔ seller chat",                                     "kind": "screen", "tier": "secondary"},
        {"id": "orders",       "name": "Orders",        "intent": "Buyer's order history + tracking",                        "kind": "screen", "tier": "secondary"},
        {"id": "create_listing","name":"Create Listing","intent": "Multi-step listing form",                                 "kind": "screen", "tier": "secondary"},
        {"id": "reviews",      "name": "Reviews",       "intent": "Leave / read reviews",                                    "kind": "modal",  "tier": "optional"},
        {"id": "settings",     "name": "Settings",      "intent": "Payouts, addresses, notifications",                       "kind": "screen", "tier": "optional"},
        {"id": "login",        "name": "Login",         "intent": "Auth entry",                                              "kind": "screen", "tier": "secondary"},
        {"id": "onboarding",   "name": "Onboarding",    "intent": "Buyer or seller path selection",                          "kind": "screen", "tier": "optional"},
    ],
    "b2b-saas": [
        {"id": "dashboard",    "name": "Dashboard",     "intent": "Overview metrics + recent activity",                      "kind": "screen", "tier": "hero"},
        {"id": "workspace",    "name": "Workspace",     "intent": "Primary work surface (board / list / calendar)",          "kind": "screen", "tier": "hero"},
        {"id": "item_detail",  "name": "Item Detail",   "intent": "Drill-down on a single record",                           "kind": "screen", "tier": "hero"},
        {"id": "team",         "name": "Team",          "intent": "Members, roles, invites",                                 "kind": "screen", "tier": "secondary"},
        {"id": "integrations", "name": "Integrations",  "intent": "Connect external services",                               "kind": "screen", "tier": "secondary"},
        {"id": "settings",     "name": "Settings",      "intent": "Workspace + account preferences",                         "kind": "screen", "tier": "secondary"},
        {"id": "billing",      "name": "Billing",       "intent": "Plan, usage, invoices",                                   "kind": "screen", "tier": "optional"},
        {"id": "login",        "name": "Login",         "intent": "Auth entry (SSO common)",                                 "kind": "screen", "tier": "secondary"},
        {"id": "onboarding",   "name": "Onboarding",    "intent": "Workspace setup + invite teammates",                      "kind": "screen", "tier": "optional"},
    ],
    "b2b-admin": [
        {"id": "list",         "name": "List View",     "intent": "Searchable / filterable record table",                    "kind": "screen", "tier": "hero"},
        {"id": "detail",       "name": "Record Detail", "intent": "Full record + editable fields + history",                 "kind": "screen", "tier": "hero"},
        {"id": "action_modal", "name": "Action Modal",  "intent": "Confirm + execute a workflow action",                     "kind": "modal",  "tier": "hero"},
        {"id": "audit_log",    "name": "Audit Log",     "intent": "Timestamped trail of who did what",                       "kind": "screen", "tier": "secondary"},
        {"id": "settings",     "name": "Settings",      "intent": "Roles, permissions, defaults",                            "kind": "screen", "tier": "secondary"},
        {"id": "login",        "name": "Login",         "intent": "SSO / staff auth",                                        "kind": "screen", "tier": "secondary"},
    ],
    "productivity-tool": [
        {"id": "inbox",        "name": "Inbox",         "intent": "Today's items + quick capture",                           "kind": "screen", "tier": "hero"},
        {"id": "project",      "name": "Project View",  "intent": "Items grouped by project / list",                         "kind": "screen", "tier": "hero"},
        {"id": "item_detail",  "name": "Item Detail",   "intent": "Single task + sub-items + notes",                         "kind": "screen", "tier": "hero"},
        {"id": "calendar",     "name": "Calendar",      "intent": "Time-based view of items",                                "kind": "screen", "tier": "secondary"},
        {"id": "search",       "name": "Search",        "intent": "Find anything across projects",                           "kind": "screen", "tier": "secondary"},
        {"id": "settings",     "name": "Settings",      "intent": "Sync, notifications, themes",                             "kind": "screen", "tier": "optional"},
        {"id": "login",        "name": "Login",         "intent": "Auth entry",                                              "kind": "screen", "tier": "secondary"},
        {"id": "onboarding",   "name": "Onboarding",    "intent": "First project setup",                                     "kind": "screen", "tier": "optional"},
    ],
    "media-creator": [
        {"id": "dashboard",    "name": "Dashboard",     "intent": "Recent files + create-new CTA",                           "kind": "screen", "tier": "hero"},
        {"id": "editor",       "name": "Editor",        "intent": "Main creation surface (canvas / timeline)",               "kind": "screen", "tier": "hero"},
        {"id": "asset_browser","name": "Asset Browser", "intent": "User's library of components / footage / fonts",          "kind": "screen", "tier": "hero"},
        {"id": "share_modal",  "name": "Share",         "intent": "Generate share link + permissions",                       "kind": "modal",  "tier": "secondary"},
        {"id": "templates",    "name": "Templates",     "intent": "Browse + duplicate template",                             "kind": "screen", "tier": "secondary"},
        {"id": "settings",     "name": "Settings",      "intent": "Account + workspace preferences",                         "kind": "screen", "tier": "optional"},
        {"id": "login",        "name": "Login",         "intent": "Auth entry",                                              "kind": "screen", "tier": "secondary"},
    ],
    "developer-tool": [
        {"id": "project_list", "name": "Projects",      "intent": "List of all projects",                                    "kind": "screen", "tier": "hero"},
        {"id": "project_detail","name":"Project Detail","intent": "Single project: deployments, env, domains",               "kind": "screen", "tier": "hero"},
        {"id": "deployment",   "name": "Deployment",    "intent": "Build logs + status + rollback",                          "kind": "screen", "tier": "hero"},
        {"id": "settings",     "name": "Settings",      "intent": "Project + team settings",                                 "kind": "screen", "tier": "secondary"},
        {"id": "billing",      "name": "Billing",       "intent": "Plan + usage + invoices",                                 "kind": "screen", "tier": "optional"},
        {"id": "login",        "name": "Login",         "intent": "OAuth (GitHub / GitLab common)",                          "kind": "screen", "tier": "secondary"},
    ],
    "ai-assistant": [
        {"id": "chat",         "name": "Chat",          "intent": "Primary conversation surface: thread + composer + model picker",  "kind": "screen", "tier": "hero"},
        {"id": "conversations","name": "Conversations", "intent": "Sidebar list of past threads with search + pin",                  "kind": "screen", "tier": "hero"},
        {"id": "agents",       "name": "Agents",        "intent": "Library of custom agents / system prompts to switch between",     "kind": "screen", "tier": "secondary"},
        {"id": "agent_detail", "name": "Agent Detail",  "intent": "Configure one agent: system prompt + tools + knowledge",          "kind": "screen", "tier": "secondary"},
        {"id": "prompt_library","name": "Prompt Library","intent": "Reusable prompt templates the user can drop into a chat",         "kind": "screen", "tier": "secondary"},
        {"id": "model_picker", "name": "Model Picker",  "intent": "Switch between models + view capabilities/cost",                  "kind": "popover","tier": "secondary"},
        {"id": "knowledge",    "name": "Knowledge",     "intent": "Uploaded files / connected sources the assistant can reference",  "kind": "screen", "tier": "secondary"},
        {"id": "settings",     "name": "Settings",      "intent": "Account, API keys, default model, voice",                         "kind": "screen", "tier": "secondary"},
        {"id": "login",        "name": "Login",         "intent": "Auth entry",                                                      "kind": "screen", "tier": "secondary"},
        {"id": "onboarding",   "name": "Onboarding",    "intent": "Pick use-case + first agent to seed the workspace",               "kind": "screen", "tier": "optional"},
    ],
    "directory": [
        {"id": "browse",       "name": "Browse",        "intent": "Filterable / searchable list of entries — the core surface",      "kind": "screen", "tier": "hero"},
        {"id": "entry_detail", "name": "Entry Detail",  "intent": "Full record for one entry — metadata, photos, contact, reviews",  "kind": "screen", "tier": "hero"},
        {"id": "map_view",     "name": "Map View",      "intent": "Geographic split-view with pinned entries",                       "kind": "screen", "tier": "secondary"},
        {"id": "categories",   "name": "Categories",    "intent": "Top-level taxonomy / topic hubs landing screen",                  "kind": "screen", "tier": "secondary"},
        {"id": "submit",       "name": "Submit Entry",  "intent": "Form to add a new entry (community-curated directories)",         "kind": "screen", "tier": "secondary"},
        {"id": "compare",      "name": "Compare",       "intent": "Side-by-side comparison of 2-4 entries",                          "kind": "screen", "tier": "optional"},
        {"id": "saved",        "name": "Saved",         "intent": "User's favourited / bookmarked entries",                          "kind": "screen", "tier": "secondary"},
        {"id": "login",        "name": "Login",         "intent": "Optional — only required for submit / save",                      "kind": "screen", "tier": "optional"},
    ],
    "tracker": [
        {"id": "today",        "name": "Today",         "intent": "Quick log + streak + today's targets — the daily landing",        "kind": "screen", "tier": "hero"},
        {"id": "history",      "name": "History",       "intent": "Calendar / heatmap of past entries with streak visualisation",    "kind": "screen", "tier": "hero"},
        {"id": "entry",        "name": "Log Entry",     "intent": "Compose a new entry (mood + note + tags + photos)",               "kind": "modal",  "tier": "hero"},
        {"id": "habits",       "name": "Habits",        "intent": "User's tracked habits / metrics — add, reorder, archive",         "kind": "screen", "tier": "secondary"},
        {"id": "habit_detail", "name": "Habit Detail",  "intent": "Single habit: history graph, completion rate, edit cadence",      "kind": "screen", "tier": "secondary"},
        {"id": "insights",     "name": "Insights",      "intent": "Trends, correlations, weekly summary — the rewards screen",       "kind": "screen", "tier": "secondary"},
        {"id": "achievements", "name": "Achievements",  "intent": "Badges, milestones, streak rewards (gamification)",               "kind": "screen", "tier": "optional"},
        {"id": "settings",     "name": "Settings",      "intent": "Reminders, units, privacy, export",                               "kind": "screen", "tier": "secondary"},
        {"id": "login",        "name": "Login",         "intent": "Auth entry",                                                      "kind": "screen", "tier": "secondary"},
        {"id": "onboarding",   "name": "Onboarding",    "intent": "Pick habits + reminder cadence on first run",                     "kind": "screen", "tier": "optional"},
    ],
    "sales-crm": [
        {"id": "pipeline",     "name": "Pipeline",      "intent": "Kanban of deals by stage with value totals per column",           "kind": "screen", "tier": "hero"},
        {"id": "deal_detail",  "name": "Deal Detail",   "intent": "Single deal: timeline, contacts, notes, next steps, value",       "kind": "screen", "tier": "hero"},
        {"id": "contacts",     "name": "Contacts",      "intent": "Searchable table of people with last-touch + owner",              "kind": "screen", "tier": "hero"},
        {"id": "contact_360",  "name": "Contact 360",   "intent": "Single person: activity timeline, deals, emails, calls",          "kind": "screen", "tier": "secondary"},
        {"id": "accounts",     "name": "Accounts",      "intent": "Company-level rollup with associated contacts and deals",         "kind": "screen", "tier": "secondary"},
        {"id": "activities",   "name": "Activities",    "intent": "Tasks + calls + emails feed across the team",                     "kind": "screen", "tier": "secondary"},
        {"id": "leaderboard",  "name": "Leaderboard",   "intent": "Rep rankings by closed-won / activity (gamification)",            "kind": "screen", "tier": "secondary"},
        {"id": "reports",      "name": "Reports",       "intent": "Forecast, conversion funnel, win/loss breakdown",                 "kind": "screen", "tier": "secondary"},
        {"id": "log_call",     "name": "Log Activity",  "intent": "Modal to log a call / email / meeting against a contact",         "kind": "modal",  "tier": "secondary"},
        {"id": "settings",     "name": "Settings",      "intent": "Pipeline stages, custom fields, team, integrations",              "kind": "screen", "tier": "secondary"},
        {"id": "login",        "name": "Login",         "intent": "SSO common for sales teams",                                      "kind": "screen", "tier": "secondary"},
    ],
    "browser-game": [
        {"id": "play",         "name": "Play",          "intent": "Active game canvas with HUD (score, lives, timer)",               "kind": "screen", "tier": "hero"},
        {"id": "menu",         "name": "Main Menu",     "intent": "Start / continue / level select / settings entry",                "kind": "screen", "tier": "hero"},
        {"id": "level_select", "name": "Level Select",  "intent": "Grid of levels with locked / completed / star ratings",           "kind": "screen", "tier": "secondary"},
        {"id": "result",       "name": "Result",        "intent": "Win / lose screen with score, retry, next-level CTA",             "kind": "modal",  "tier": "hero"},
        {"id": "pause",        "name": "Pause",         "intent": "In-game pause overlay: resume / restart / quit",                  "kind": "modal",  "tier": "secondary"},
        {"id": "leaderboard",  "name": "Leaderboard",   "intent": "Global / friend rankings with player avatars + scores",           "kind": "screen", "tier": "secondary"},
        {"id": "shop",         "name": "Shop",          "intent": "Cosmetics / power-ups (optional monetisation)",                   "kind": "screen", "tier": "optional"},
        {"id": "settings",     "name": "Settings",      "intent": "Sound, controls, accessibility, account",                         "kind": "screen", "tier": "secondary"},
        {"id": "tutorial",     "name": "Tutorial",      "intent": "First-run interactive instructions",                              "kind": "screen", "tier": "optional"},
        {"id": "login",        "name": "Login",         "intent": "Optional — only for cloud-save / leaderboard",                    "kind": "screen", "tier": "optional"},
    ],
}
# fmt: on

ARCHETYPE_NAMES: list[str] = list(ARCHETYPES.keys())


def union_screens(archetype_ids: list[str]) -> list[ArchetypeScreen]:
    """Union the screen sets of the given archetypes, deduping by `id`.

    When the same screen id appears in multiple archetypes (e.g. `login`),
    keep the first occurrence — its tier is taken from the higher-ranked
    archetype, which is what the caller already sorted by.
    """
    seen: set[str] = set()
    out: list[ArchetypeScreen] = []
    for aid in archetype_ids:
        for s in ARCHETYPES.get(aid, []):
            if s["id"] in seen:
                continue
            seen.add(s["id"])
            out.append(s)
    return out
