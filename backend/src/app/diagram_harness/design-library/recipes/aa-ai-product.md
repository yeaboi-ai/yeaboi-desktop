# Recipe AA: AI Product / Assistant

## Quick ref

- **When:** LLM-wrapper apps, AI chatbots, agent builders, prompt libraries, AI copilots, AI writers/generators. The PRIMARY surface is a chat or generation interface, not a marketing page. (For the *landing* page that sells an AI product, use recipe `b` SaaS with an AI variant.)
- **Token budget:** ~16k (HARNESS + components + color + typography + utility-interfaces + anti-similarity).
- **Files to read:** `04-components.md`, `01-typography.md`, `02-color.md`, `09-ergonomics.md`, `utility-interfaces.md` (chat is a utility shell, not a marketing flow).
- **Personality fit:** Primary — Technical, Professional. Strong — Playful, Editorial. Bad fit — Luxury, Brutalist, Organic-Natural.

## Page flow

```
[App shell — chat is the primary surface, NOT a hero scroll page.]

Sidebar (collapsible, ~260px wide):
  Logo + workspace switcher
  [+ New chat] button (prominent, top of list)
  Pinned conversations
  Recent conversations (search-filterable, grouped by Today / Yesterday / Last 7 days)
  Bottom: agents library, settings, user avatar

Main thread (centred column, max-width ~720px):
  Sticky model picker at top right (with cost/speed indicator)
  Optional system-prompt strip ("You are a helpful assistant…" — editable inline)
  Message list:
    - User messages: right-aligned or subtle background tint, NEVER speech-bubble cartoon style
    - Assistant messages: left-aligned, prose-readable line length (60-75ch), markdown rendered
    - Streaming indicator: caret cursor + token-by-token append, NOT a "..." dots animation
    - Tool calls: collapsible cards inline in the thread (function name + args preview, click to expand JSON)
    - Citations / sources: numbered chips that scroll to a sources panel on click
  Composer (sticky bottom):
    - Multi-line textarea that grows to ~6 lines max, then scrolls
    - Send button (cmd/ctrl+enter) + voice/attach icons
    - Suggested prompts as ghost chips above composer when thread is empty
    - Model + agent picker accessible from composer toolbar

Optional right panel (drawer):
  Knowledge / connected sources / canvas / artifact preview
```

NEVER lay this out as a marketing landing page. Chat is the product.

## Techniques

- Token-streaming with caret cursor on the active assistant message (never spinners or pulsing dots).
- Tool-call cards inline: function name + collapsed args, expandable to full JSON. Use mono font for the name.
- Suggested prompts shown ONLY when the thread is empty — disappear on first message.
- Empty-state hero in the thread: brief tagline + 4 example prompts as cards. NOT a welcome modal.
- Markdown rendering with copy-button on code blocks (top-right hover) and language label.
- Model picker shows speed icon + cost-per-1M-tokens hint, not just the name.
- Keyboard-first: cmd+enter send, cmd+k command palette, cmd+/ new chat, esc cancels generation.
- Cancel-generation button replaces send while streaming.
- Title auto-generates from first exchange and is editable inline in the sidebar.
- Voice input pulses with audio level when recording.
- Citations as superscript chips in prose (¹ ² ³), with hover preview and a sources panel.
- "Edit" on user messages forks the thread (keep both forks in the sidebar) — never overwrite history.

## Font direction

Clean modern sans for prose (Inter, Söhne, Geist). Monospace for code, tool-call names, model names, JSON (JetBrains Mono, IBM Plex Mono, Geist Mono). Optional: one editorial accent for product-name in the empty-state hero. Body sized for reading comfort (15-16px), line-height 1.55-1.65.

## Color

Dark mode is the default. ONE accent (usually electric blue, violet, or warm orange — pick one). Neutral surface ladder: bg → surface (sidebar) → raised (cards). Semantic colors for tool-call states (running = accent, success = green, error = red, cancelled = mute). Avoid coloured assistant bubbles; the message background should be transparent or near-transparent so prose reads cleanly. User messages get a subtle tint, not a saturated colour.

Light mode must work — many users prefer it. Same accent, neutral grays inverted.

## Motion budget

LOW. Token streaming is the only constant motion. Tool-call cards expand with a 200ms ease. New messages fade in (150ms). Model picker dropdown slides. NO bouncy animations, NO confetti, NO loading spinners (use shimmer/caret instead).

## Reference sites

ChatGPT, Claude, Cursor, Perplexity, v0, Raycast AI, Linear's AI command, Vercel AI SDK chatbot template.

## Anti-patterns

Speech-bubble cartoon styling. Loading spinners during streaming. "Thinking..." text without a visible cursor. Coloured/saturated message backgrounds that fight the prose. Cramming the chat into a narrow widget on the right of a marketing page. Marketing-style hero on the chat page. Three-column "feature" grids on the chat surface. Welcome modals that interrupt first interaction. Confetti / emoji rain on send. Auto-playing voice. Forced sign-up before first message (for demos).
