'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type SimScreen = {
  id: string;
  name: string;
  kind: string;
  html: string;
  device?: string;
  triggerFrom?: string;
  width?: number;
  height?: number;
};

interface Props {
  open: boolean;
  screens: SimScreen[];
  sessionId: string;
  onClose: () => void;
  /** Pixel inset on the left for the chat drawer (0 if closed). */
  leftInset?: number;
  /** Pixel inset on the right for the context drawer (0 if closed). */
  rightInset?: number;
}

const VIEWPORT_W = 1280;
const VIEWPORT_H = 800;

// Read the same design-system localStorage payload that WireScreenNode reads,
// extract the colour tokens, and emit a CSS :root block. When no session-scoped
// design exists, fall back to the active global theme's wireframe-* tokens so
// the simulator stays in step with the user's app theme.
function readGlobalThemeFallback(): string {
  if (typeof document === 'undefined') {
    return `:root {
      --color-bg: #0a0a0a; --color-surface: #1a1a1a; --color-text: #e8e8e8;
      --color-text-muted: rgba(255,255,255,0.6); --color-primary: #e8e8e8;
      --color-accent: #e8e8e8; --color-on-accent: #0a0a0a; --color-border: rgba(255,255,255,0.1);
      --color-success: #22c55e; --color-warning: #f59e0b; --color-error: #ef4444;
      --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      --radius-sm: 4px; --radius-md: 8px;
    }`;
  }
  const styles = getComputedStyle(document.documentElement);
  const v = (name: string, fb: string) => styles.getPropertyValue(name).trim() || fb;
  const bg = v('--wireframe-bg', v('--background', 'var(--background)'));
  const text = v('--wireframe-fg', v('--foreground', 'var(--foreground)'));
  const accent = v('--wireframe-accent', v('--primary', 'var(--primary)'));
  const surface = v('--card', 'var(--card)');
  const muted = v('--muted-foreground', 'var(--muted-foreground)');
  const border = v('--border', 'color-mix(in srgb, var(--foreground) 10%, transparent)');
  const onAccent = v('--primary-foreground', 'var(--foreground)');
  const success = v('--success', '#22c55e');
  const warning = v('--warning', '#f59e0b');
  const error = v('--destructive', '#ef4444');
  return `:root {
    --color-bg: ${bg}; --color-surface: ${surface}; --color-text: ${text};
    --color-text-muted: ${muted}; --color-primary: ${accent};
    --color-accent: ${accent}; --color-on-accent: ${onAccent}; --color-border: ${border};
    --color-success: ${success}; --color-warning: ${warning}; --color-error: ${error};
    --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    --radius-sm: 4px; --radius-md: 8px;
  }`;
}

function readTokenVars(sessionId: string): string {
  const fallback = readGlobalThemeFallback();
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(`design-system-${sessionId}`);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    const ds = parsed?.design_system;
    const colors = (ds?.colors || {}) as Record<string, any>;
    const pick = (k: string, f: string) => {
      const v = colors[k];
      if (!v) return f;
      if (typeof v === 'string') return v;
      if (typeof v === 'object' && typeof v.hex === 'string') return v.hex;
      return f;
    };
    const bg = pick('background', 'var(--background)');
    const surface = pick('surface', '#111116');
    const text = pick('text', 'var(--foreground)');
    const muted = pick('muted', '#b0b0b8');
    const accent = pick('accent', pick('primary', '#5E6AD2'));
    const border = pick('border', 'var(--border)');
    const onAccent = pick('foreground', 'var(--foreground)');
    return `:root {
      --color-bg: ${bg}; --color-surface: ${surface}; --color-text: ${text};
      --color-text-muted: ${muted}; --color-primary: ${accent};
      --color-accent: ${accent}; --color-on-accent: ${onAccent}; --color-border: ${border};
      --color-success: ${pick('success', '#22c55e')};
      --color-warning: ${pick('warning', '#f59e0b')};
      --color-error: ${pick('error', '#ef4444')};
      --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      --radius-sm: 4px; --radius-md: 8px;
    }`;
  } catch {
    return fallback;
  }
}

// Click intercept script injected into every simulated screen's iframe.
// Works in two passes:
//   1. Get the click target's DIRECT text content only (no descendants), so
//      a click on a button labelled "Change role" returns "Change role" and
//      not the whole row's aggregated text.
//   2. If the target has no direct text (e.g. clicked an icon span), walk
//      up looking for an aria-label or an ancestor whose own direct text
//      fits inside 60 chars — that's the labelling node.
// Mouse 4 / 5 (back/forward) come in INSIDE the iframe — they never
// reach the parent window's listener because each iframe has its own
// event loop. Intercept here, prevent the browser's default history
// navigation, and post a message so the parent can drive its own
// screen-stack history instead.
const NAV_INTERCEPT = `
(function(){
  function swallow(e){
    if (e.button !== 3 && e.button !== 4) return false;
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    return true;
  }
  document.addEventListener('mousedown', function(e){
    if (!swallow(e)) return;
    parent.postMessage({ type: 'sim-nav', dir: e.button === 3 ? 'back' : 'forward' }, '*');
  }, true);
  document.addEventListener('mouseup', swallow, true);
  document.addEventListener('auxclick', swallow, true);
})();
`;

const CLICK_INTERCEPT = `
  function getDirectText(el) {
    if (!el || !el.childNodes) return '';
    var t = '';
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 3) t += (n.textContent || '');
    }
    return t.replace(/\\s+/g, ' ').trim();
  }
  function findTrigger(target) {
    var cur = target;
    while (cur && cur !== document.body) {
      var t = cur.getAttribute && cur.getAttribute('data-trigger');
      if (t) return t.trim();
      cur = cur.parentElement;
    }
    return '';
  }
  document.addEventListener('click', function(e) {
    // Explicit trigger wins — wired by the AI for cross-surface navigation.
    var trigger = findTrigger(e.target);
    if (trigger) {
      e.preventDefault();
      e.stopPropagation();
      try { console.log('[sim-iframe] trigger →', trigger); } catch (_) {}
      parent.postMessage({ type: 'sim-click', trigger: trigger }, '*');
      return;
    }
    var picked = null;
    var direct = getDirectText(e.target);
    if (direct && direct.length <= 60) {
      picked = direct;
    } else {
      var cur = e.target;
      while (cur && cur !== document.body) {
        var aria = cur.getAttribute && cur.getAttribute('aria-label');
        if (aria) { picked = aria.trim(); break; }
        var d = getDirectText(cur);
        if (d && d.length > 0 && d.length <= 60) { picked = d; break; }
        cur = cur.parentElement;
      }
    }
    if (!picked) {
      // Final fallback — clicked on something with no usable label
      // (icon-only button etc.). Send the first 60 chars of the target
      // text and let the matcher's word-level scoring sort it out.
      var raw = (e.target.textContent || '').replace(/\\s+/g, ' ').trim();
      if (raw) picked = raw.slice(0, 60);
    }
    if (!picked) return;
    e.preventDefault();
    e.stopPropagation();
    try { console.log('[sim-iframe] click →', picked); } catch (_) {}
    parent.postMessage({ type: 'sim-click', text: picked }, '*');
  }, true);
  document.addEventListener('submit', function(e) { e.preventDefault(); }, true);
`;

// Generic interactivity layer applied to every simulated screen / overlay.
// AI wireframes are static HTML — no behaviour. This script adds the basic
// affordances users expect: button press feedback, checkbox toggling, tab
// switching, dropdown caret rotation, row hover/select, filter chip dismiss.
// Pattern-matching only (no real data) but makes the sim feel alive.
const INTERACTIVITY_LAYER = `
(function(){
  // Hover styles + tap feedback baseline
  var style = document.createElement('style');
  style.textContent = [
    '*, *::before, *::after { transition: background-color 120ms ease, color 120ms ease, border-color 120ms ease, transform 100ms ease, opacity 120ms ease; }',
    'button, [role=button], a, [data-component^="button"], [data-component^="tab"] { cursor: pointer; }',
    'button:hover, [role=button]:hover, [data-component^="button"]:hover { filter: brightness(1.08); }',
    '.sim-pressed { transform: scale(0.97) !important; }',
    '.sim-row-selected { outline: 2px solid var(--color-accent, #5E6AD2); outline-offset: -2px; }',
    'tr:hover, [role=row]:hover { background: rgba(127,127,127,0.06) !important; }',
    'input[type=checkbox] { cursor: pointer; }',
    '[data-sim-checked="true"] { background: var(--color-accent, #5E6AD2) !important; color: var(--color-on-accent, #fff) !important; border-color: var(--color-accent, #5E6AD2) !important; }',
    '[data-sim-expanded="true"] .caret, [data-sim-expanded="true"] [class*="chevron"] { transform: rotate(180deg); }',
    '[data-sim-active="true"] { color: var(--color-accent, inherit); border-bottom-color: var(--color-accent, currentColor); }',
  ].join('\\n');
  document.head.appendChild(style);

  function isInteractive(el){
    if (!el || el === document.body) return false;
    var tag = (el.tagName || '').toLowerCase();
    if (tag === 'button' || tag === 'a' || tag === 'input' || tag === 'select') return true;
    var role = el.getAttribute && el.getAttribute('role');
    if (role === 'button' || role === 'link' || role === 'tab' || role === 'checkbox' || role === 'menuitem') return true;
    var dc = el.getAttribute && el.getAttribute('data-component');
    if (dc && /button|tab|select|chip|input/.test(dc)) return true;
    // Heuristic: a div with cursor:pointer styling counts.
    try { if (getComputedStyle(el).cursor === 'pointer') return true; } catch(_) {}
    return false;
  }

  function findInteractive(target){
    var el = target;
    while (el && el !== document.body) {
      if (isInteractive(el)) return el;
      el = el.parentElement;
    }
    return null;
  }

  // Press-flash for any interactive element
  document.addEventListener('pointerdown', function(e){
    var el = findInteractive(e.target);
    if (!el) return;
    el.classList.add('sim-pressed');
    setTimeout(function(){ el.classList.remove('sim-pressed'); }, 140);
  });

  // Checkbox toggle (covers <input type=checkbox> AND custom-checkbox divs
  // that AI commonly emits — small square containers with a checkmark glyph).
  document.addEventListener('click', function(e){
    var target = e.target;
    var checkbox = null;

    // Native input
    if (target.tagName === 'INPUT' && target.type === 'checkbox') {
      // Let the native toggle happen — also flash
      return;
    }

    // role=checkbox
    var asCb = target.closest && target.closest('[role=checkbox]');
    if (asCb) checkbox = asCb;

    // Heuristic: small square container (<= 28×28) inside a row, or one
    // containing a check glyph (✓ ☑ ✔︎). Look up two parents max.
    if (!checkbox) {
      var cur = target;
      for (var i = 0; i < 3 && cur && cur !== document.body; i++) {
        var rect = cur.getBoundingClientRect && cur.getBoundingClientRect();
        var w = rect ? rect.width : 0, h = rect ? rect.height : 0;
        var isSquare = w >= 12 && w <= 32 && Math.abs(w - h) <= 6;
        var hasCheckGlyph = (cur.textContent || '').match(/[✓☑✔︎]/);
        if (isSquare || hasCheckGlyph) { checkbox = cur; break; }
        cur = cur.parentElement;
      }
    }
    if (!checkbox) return;
    e.stopPropagation();
    var was = checkbox.getAttribute('data-sim-checked') === 'true';
    checkbox.setAttribute('data-sim-checked', was ? 'false' : 'true');
  }, true);

  // Tab switching — within a tab group, make the clicked tab the only
  // active one. Recognises THREE patterns, in order of preference:
  //   1. Explicit aria/data attrs: role=tab, [data-component^="tab"]
  //   2. Filter-pill components: [data-component="filter-tab"], "filter-tab-active"
  //   3. Heuristic: a clickable inside a row of 2–6 sibling clickables
  //      with similar dimensions (segmented control / pill row).
  // Once identified, mark only the clicked element as data-sim-active=true.
  function findTabFromTarget(target) {
    var explicit = target.closest && target.closest('[role=tab],[data-component^="tab"],[data-component="filter-tab"],[data-component="filter-tab-active"]');
    if (explicit) {
      var group = explicit.closest('[role=tablist]') || explicit.parentElement;
      if (!group) return null;
      var siblings = Array.prototype.slice.call(
        group.querySelectorAll('[role=tab],[data-component^="tab"],[data-component="filter-tab"],[data-component="filter-tab-active"]'),
      );
      if (siblings.length >= 2) return { tab: explicit, siblings: siblings };
    }
    // Heuristic — walk up to a clickable element and inspect siblings.
    var clickable = target.closest && target.closest('button, a, [role=button], [tabindex]');
    if (!clickable) return null;
    var parent = clickable.parentElement;
    if (!parent) return null;
    var kids = Array.prototype.slice.call(parent.children);
    var sibClickables = kids.filter(function(c){
      if (c === clickable) return true;
      var tag = (c.tagName || '').toLowerCase();
      if (tag === 'button' || tag === 'a') return true;
      if (c.getAttribute && (c.getAttribute('role') === 'button' || c.getAttribute('role') === 'tab')) return true;
      return false;
    });
    if (sibClickables.length < 2 || sibClickables.length > 6) return null;
    var firstRect = clickable.getBoundingClientRect ? clickable.getBoundingClientRect() : null;
    if (!firstRect) return null;
    // All siblings must have similar HEIGHT (within 6px) to qualify as a
    // tab/segmented row. Width can vary because labels differ.
    var sameHeight = sibClickables.every(function(c){
      var r = c.getBoundingClientRect ? c.getBoundingClientRect() : null;
      return r && Math.abs(r.height - firstRect.height) <= 6;
    });
    if (!sameHeight) return null;
    // Reject if any sibling contains a ×/✕ glyph — that's almost
    // certainly a filter-chip row, not a segmented tab. Chips share
    // similar dimensions but each is independently dismissible.
    var hasChipGlyph = sibClickables.some(function(c){
      var txt = (c.textContent || '');
      return txt.indexOf('×') !== -1 || txt.indexOf('✕') !== -1;
    });
    if (hasChipGlyph) return null;
    // Reject if the row is also the page's primary nav (would steal nav
    // clicks). A tab row is typically <= 360px wide; primary nav rows
    // tend to span the viewport.
    var parentRect = parent.getBoundingClientRect ? parent.getBoundingClientRect() : null;
    if (parentRect && parentRect.width > 520) return null;
    return { tab: clickable, siblings: sibClickables };
  }

  document.addEventListener('click', function(e){
    var hit = findTabFromTarget(e.target);
    if (!hit) return;
    if (hit.tab.getAttribute('data-sim-active') === 'true') return; // already active
    // Find the currently visually-active sibling — the one with a
    // non-transparent background or a saturated colour. AI wireframes
    // typically style only the active tab with a fill; the rest are
    // borderless / ghost. Swap inline styles so the clicked tab inherits
    // the active look and the previous one returns to inactive.
    var activeSib = null;
    for (var i = 0; i < hit.siblings.length; i++) {
      var sib = hit.siblings[i];
      if (sib === hit.tab) continue;
      var cs = getComputedStyle(sib);
      var bg = cs.backgroundColor || '';
      var hasFill = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
      if (hasFill) { activeSib = sib; break; }
    }
    if (activeSib) {
      var swap = hit.tab.style.cssText;
      hit.tab.style.cssText = activeSib.style.cssText;
      activeSib.style.cssText = swap;
    }
    hit.siblings.forEach(function(s){ s.setAttribute('data-sim-active', 'false'); });
    hit.tab.setAttribute('data-sim-active', 'true');
  }, true);

  // Dropdown / select expand toggle. Recognises elements containing ▾ ▼ ⌄
  // chevron glyphs as filter chips / select boxes; flips data-sim-expanded.
  document.addEventListener('click', function(e){
    var t = e.target;
    var el = t.closest && t.closest('[data-component^="select"],[role=combobox]');
    if (!el) {
      // Heuristic: pill-ish element whose text ends with a chevron glyph
      var cur = t;
      for (var i = 0; i < 3 && cur && cur !== document.body; i++) {
        var txt = (cur.textContent || '').trim();
        if (/[▾▼⌄]\\s*$/.test(txt) && txt.length < 40) { el = cur; break; }
        cur = cur.parentElement;
      }
    }
    if (!el) return;
    var was = el.getAttribute('data-sim-expanded') === 'true';
    el.setAttribute('data-sim-expanded', was ? 'false' : 'true');
  }, true);

  // Close-button + filter-chip dismiss handler.
  //
  // Clicks on a × / ✕ glyph have two valid meanings:
  //   (a) Dismiss a small filter chip ("Filters: status=active ×")
  //   (b) Close the entire overlay this content sits inside (modal /
  //       drawer / popover) — handled by the parent.
  //
  // We disambiguate using window.__SIM_IS_OVERLAY__, set by buildSrcDoc.
  // When this iframe IS the overlay, every × click closes it unless we
  // can prove we're dismissing a chip (small rounded element with no
  // nested interactive controls). On screen iframes — where there are
  // no overlays to close — the same heuristic still removes chips and
  // otherwise leaves the click alone (parent's overlayId is null
  // anyway, so a stray sim-close-overlay would no-op there).
  //
  // stopImmediatePropagation prevents the checkbox-toggle handler below
  // from squaring on the small button and locking it into a blue
  // sim-checked state.
  document.addEventListener('click', function(e){
    var t = e.target;
    var txt = (t.textContent || '').trim();
    if (txt !== '×' && txt !== '✕' && txt !== 'x') return;

    var cur = t.parentElement;
    for (var i = 0; i < 4 && cur && cur !== document.body; i++) {
      var cs = getComputedStyle(cur);
      var br = parseInt(cs.borderRadius || '0', 10);
      if (br > 4) {
        var rect = cur.getBoundingClientRect ? cur.getBoundingClientRect() : { width: 0, height: 0 };
        var hasNestedInteractive = !!cur.querySelector('button, input, textarea, select, [role=button], form');
        var isChipSized = rect.width <= 220 && rect.height <= 44 && !hasNestedInteractive;
        if (isChipSized) {
          e.preventDefault();
          e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
          cur.style.transition = 'opacity 180ms ease, transform 180ms ease';
          cur.style.opacity = '0';
          cur.style.transform = 'scale(0.92)';
          setTimeout(function(){ if (cur && cur.parentElement) cur.remove(); }, 200);
          return;
        }
        break;
      }
      cur = cur.parentElement;
    }

    // Inside an overlay → close it. On a screen iframe → no-op so a
    // stray × click on something we mis-detected doesn't cause anything
    // weird.
    if (window.__SIM_IS_OVERLAY__) {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      try { console.log('[sim-iframe] overlay close ×'); } catch (_) {}
      parent.postMessage({ type: 'sim-close-overlay' }, '*');
    }
  }, true);

  // Row click highlights — within tables / data lists, clicked row gets a
  // selected state. Doesn't conflict with row navigation: selection is
  // applied on a click that didn't match a screen/overlay (decided by parent).
  document.addEventListener('click', function(e){
    var row = e.target.closest && e.target.closest('tr,[role=row]');
    if (!row) return;
    var inTable = row.closest('table,[role=grid],[role=table]');
    if (!inTable) return;
    var prev = inTable.querySelectorAll('.sim-row-selected');
    prev.forEach(function(r){ r.classList.remove('sim-row-selected'); });
    row.classList.add('sim-row-selected');
  }, true);

  // ── Filter chips → actually hide rows ────────────────────────────────
  // The AI rarely wires data-status / data-filter attrs on its own. We
  // run pure-text matching: each filter tab has a label like "30 DPD"
  // or "Active". Find the closest list/table BELOW the tab strip in
  // document order; for every row, check whether the row's textContent
  // contains the tab label (case-insensitive). Rows that don't match get
  // display:none. Tabs labelled "All", "Total", numeric-only, or empty
  // show every row again. The user wanted real filtering, not just
  // visual tab-active styling — this delivers it without depending on
  // the model to write the JS.
  function findTargetList(fromEl){
    // Walk forward in document order looking for the first table/role-list
    // / role-grid / data-table that follows this element. Keep within the
    // same "section" container so filters above nested cards don't reach
    // into siblings we don't own.
    var section = fromEl.closest('section, main, article, [role=region], [data-component^="card"]') || document.body;
    var candidates = section.querySelectorAll('table,[role=grid],[role=table],[data-component="list"],ul,ol');
    var fromRect = fromEl.getBoundingClientRect ? fromEl.getBoundingClientRect() : null;
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      if (c === fromEl || c.contains(fromEl)) continue;
      // Pick the first list whose top edge is BELOW the filter strip.
      var r = c.getBoundingClientRect ? c.getBoundingClientRect() : null;
      if (fromRect && r && r.top >= fromRect.bottom - 4) return c;
    }
    return candidates.length > 0 ? candidates[0] : null;
  }
  function filterableRowsOf(list){
    if (!list) return [];
    if (list.tagName === 'TABLE') return Array.prototype.slice.call(list.querySelectorAll('tbody > tr'));
    if (list.getAttribute && (list.getAttribute('role') === 'grid' || list.getAttribute('role') === 'table')) {
      return Array.prototype.slice.call(list.querySelectorAll('[role=row]'));
    }
    if (list.tagName === 'UL' || list.tagName === 'OL') {
      return Array.prototype.slice.call(list.children).filter(function(c){ return c.tagName === 'LI'; });
    }
    // Generic list — direct children only.
    return Array.prototype.slice.call(list.children);
  }
  function tabLabel(el){
    // First piece of visible text content — strip counts like " · 23".
    var raw = (el.textContent || '').trim();
    // Drop a trailing count token: "60 DPD 21" → "60 DPD"; "Active 1,847" → "Active".
    raw = raw.replace(/\\s+[\\d,]+\\s*$/, '').trim();
    return raw;
  }
  function isShowAllLabel(label){
    if (!label) return true;
    var l = label.toLowerCase();
    if (l === 'all' || l === 'any' || l === 'total' || l === 'everything' || l === '*') return true;
    if (/^[\\d,.]+$/.test(l)) return true; // pure numeric labels are counts, not filters
    return false;
  }
  function applyFilter(list, label){
    var rows = filterableRowsOf(list);
    if (!rows.length) return;
    if (isShowAllLabel(label)) {
      rows.forEach(function(r){ r.style.removeProperty('display'); });
      return;
    }
    var needle = label.toLowerCase();
    var anyVisible = false;
    rows.forEach(function(r){
      var hay = (r.getAttribute('data-status') || r.getAttribute('data-filter') || r.textContent || '').toLowerCase();
      var keep = hay.indexOf(needle) !== -1;
      r.style.display = keep ? '' : 'none';
      if (keep) anyVisible = true;
    });
    // Toggle an empty-state row if one exists (class .empty-state or
    // data-empty-state) so the table doesn't look broken on zero matches.
    var empty = list.querySelector('.empty-state,[data-empty-state]');
    if (empty) empty.style.display = anyVisible ? 'none' : '';
  }
  // Hook the existing tab-switch click — when a tab is activated, also
  // run the filter pass on the closest list. We register a SECOND handler
  // (don't modify the first) so the activate-styling logic stays simple.
  document.addEventListener('click', function(e){
    var hit = findTabFromTarget(e.target);
    if (!hit) return;
    // Defer so the tab-active class lands first in the same tick.
    setTimeout(function(){
      var list = findTargetList(hit.tab);
      if (!list) return;
      applyFilter(list, tabLabel(hit.tab));
    }, 0);
  }, true);

  // ── Search input → filter rows ───────────────────────────────────────
  // Anything that smells like a search box (type=search OR placeholder
  // mentioning "Search") filters the closest list as the user types.
  function findSearchTarget(input){
    // Prefer an explicit data-search-target selector.
    var sel = input.getAttribute('data-search-target');
    if (sel) {
      try { var t = document.querySelector(sel); if (t) return t; } catch(_){}
    }
    return findTargetList(input);
  }
  document.addEventListener('input', function(e){
    var el = e.target;
    if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA')) return;
    var type = (el.getAttribute('type') || '').toLowerCase();
    var ph = (el.getAttribute('placeholder') || '').toLowerCase();
    var looksLikeSearch = type === 'search' || ph.indexOf('search') !== -1 || ph.indexOf('find') !== -1 || ph.indexOf('filter') !== -1;
    if (!looksLikeSearch) return;
    var list = findSearchTarget(el);
    if (!list) return;
    var q = (el.value || '').toLowerCase().trim();
    var rows = filterableRowsOf(list);
    var anyVisible = false;
    rows.forEach(function(r){
      var hay = (r.getAttribute('data-search') || r.textContent || '').toLowerCase();
      var keep = !q || hay.indexOf(q) !== -1;
      r.style.display = keep ? '' : 'none';
      if (keep) anyVisible = true;
    });
    var empty = list.querySelector('.empty-state,[data-empty-state]');
    if (empty) empty.style.display = anyVisible ? 'none' : '';
  }, true);

  // ── Topbar bell / avatar dropdowns ───────────────────────────────────
  // The AI rarely wires the notification bell or avatar pill to anything
  // — they sit there inert. Detect them heuristically and toggle a
  // sibling popover. If no sibling popover exists, conjure one.
  function findTopbarTrigger(t){
    // Up to 3 ancestors looking for an icon-only / pill button in the
    // top header strip with bell, avatar, or initials text.
    var cur = t;
    for (var i = 0; i < 4 && cur && cur !== document.body; i++) {
      var role = cur.getAttribute && cur.getAttribute('role');
      var tag = (cur.tagName || '').toLowerCase();
      var clickable = tag === 'button' || tag === 'a' || role === 'button';
      if (clickable) {
        var label = (cur.getAttribute('aria-label') || cur.textContent || '').toLowerCase();
        var hasBell = !!cur.querySelector('svg[aria-label*="bell" i],[class*="bell" i],[data-icon="bell"]')
          || /notification|alerts?/.test(label) || /\\u{1F514}/u.test(label);
        var looksAvatar = /\\b(profile|account|me|avatar)\\b/.test(label)
          || (cur.querySelector && cur.querySelector('img,[class*="avatar" i]'))
          || (label.length >= 2 && label.length <= 4 && /^[a-z\\.\\s]+$/i.test(label) && cur.getBoundingClientRect && cur.getBoundingClientRect().width <= 220);
        if (hasBell || looksAvatar) {
          // Make sure it's in the page's top region (within the first 120px).
          var r = cur.getBoundingClientRect ? cur.getBoundingClientRect() : null;
          if (r && r.top <= 160) return { trigger: cur, kind: hasBell ? 'bell' : 'avatar' };
        }
      }
      cur = cur.parentElement;
    }
    return null;
  }
  function ensurePopoverFor(trigger, kind){
    var existing = trigger.querySelector('[data-sim-popover]');
    if (existing) return existing;
    var pop = document.createElement('div');
    pop.setAttribute('data-sim-popover', kind);
    pop.setAttribute('role', 'menu');
    pop.style.cssText = [
      'position:absolute','top:calc(100% + 6px)','right:0','min-width:240px',
      'background:var(--color-surface,#1a1a1a)',
      'color:var(--color-text,#fff)',
      'border:1px solid var(--color-border,rgba(255,255,255,0.1))',
      'border-radius:8px',
      'box-shadow:0 8px 24px rgba(0,0,0,0.35)',
      'padding:6px','font-size:13px','z-index:9999','display:none',
    ].join(';');
    var items = kind === 'bell'
      ? [['New comment on Loan #4821', '2m'], ['Payment received · $12,400', '14m'], ['Underwriting flagged Atlas', '1h'], ['Daily summary · 12 new', '4h']]
      : [['Account', ''], ['Notifications', ''], ['Switch role', ''], ['Sign out', '']];
    items.forEach(function(it){
      var row = document.createElement('div');
      row.setAttribute('role', 'menuitem');
      row.style.cssText = 'display:flex;justify-content:space-between;gap:12px;padding:8px 10px;border-radius:6px;cursor:pointer';
      row.innerHTML = '<span>' + it[0] + '</span>' + (it[1] ? '<span style="opacity:0.55;font-size:11px">' + it[1] + '</span>' : '');
      row.addEventListener('mouseenter', function(){ row.style.background = 'rgba(127,127,127,0.10)'; });
      row.addEventListener('mouseleave', function(){ row.style.background = 'transparent'; });
      pop.appendChild(row);
    });
    // Make trigger a positioning context.
    var cs = getComputedStyle(trigger);
    if (cs.position === 'static') trigger.style.position = 'relative';
    trigger.appendChild(pop);
    return pop;
  }
  document.addEventListener('click', function(e){
    var hit = findTopbarTrigger(e.target);
    if (!hit) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    var pop = ensurePopoverFor(hit.trigger, hit.kind);
    var open = pop.style.display !== 'none';
    // Close any other open popovers first.
    document.querySelectorAll('[data-sim-popover]').forEach(function(p){
      if (p !== pop) p.style.display = 'none';
    });
    pop.style.display = open ? 'none' : 'block';
  }, true);
  // Click anywhere else closes open popovers.
  document.addEventListener('click', function(e){
    var inside = e.target.closest && e.target.closest('[data-sim-popover]');
    if (inside) return;
    var hit = findTopbarTrigger(e.target);
    if (hit) return; // the trigger handler will manage it
    document.querySelectorAll('[data-sim-popover]').forEach(function(p){ p.style.display = 'none'; });
  }, false);
})();
`;

// Gemini sometimes ships its own `<style>:root { --color-bg: #0a0a0c; ... }</style>`
// inside the wireframe HTML. Those re-declare the CSS custom properties with
// hardcoded dark hex AFTER our tokenVars block, so the cascade clobbers the
// active light/accent tokens. Strip every `:root { ... }` rule from any
// `<style>` block in the incoming html before we inject it into the iframe.
const ROOT_BLOCK_RE = /:root\s*\{[^}]*\}/g;
const STYLE_BLOCK_RE = /(<style[^>]*>)([\s\S]*?)(<\/style>)/gi;
function stripRootBlocks(html: string): string {
  return html.replace(STYLE_BLOCK_RE, (_match, open: string, body: string, close: string) => {
    const cleaned = body.replace(ROOT_BLOCK_RE, '').trim();
    if (!cleaned) return '';
    return `${open}${cleaned}${close}`;
  });
}

// shadcn CSS variables (HSL components — Tailwind composes via hsl(var(--x))).
// Injected into every iframe so shadcn class strings (`bg-primary`,
// `text-muted-foreground`, etc.) resolve regardless of which library mode
// the session is in. Sessions on `library=custom` simply don't emit those
// classes, so the variables sit unused. Default theme = light.
const SHADCN_VARS = `:root{--background:0 0% 100%;--foreground:240 10% 3.9%;--card:0 0% 100%;--card-foreground:240 10% 3.9%;--popover:0 0% 100%;--popover-foreground:240 10% 3.9%;--primary:240 5.9% 10%;--primary-foreground:0 0% 98%;--secondary:240 4.8% 95.9%;--secondary-foreground:240 5.9% 10%;--muted:240 4.8% 95.9%;--muted-foreground:240 3.8% 46.1%;--accent:240 4.8% 95.9%;--accent-foreground:240 5.9% 10%;--destructive:0 84.2% 60.2%;--destructive-foreground:0 0% 98%;--border:240 5.9% 90%;--input:240 5.9% 90%;--ring:240 5.9% 10%;--radius:0.5rem;}.dark{--background:240 10% 3.9%;--foreground:0 0% 98%;--card:240 10% 3.9%;--card-foreground:0 0% 98%;--popover:240 10% 3.9%;--popover-foreground:0 0% 98%;--primary:0 0% 98%;--primary-foreground:240 5.9% 10%;--secondary:240 3.7% 15.9%;--secondary-foreground:0 0% 98%;--muted:240 3.7% 15.9%;--muted-foreground:240 5% 64.9%;--accent:240 3.7% 15.9%;--accent-foreground:0 0% 98%;--destructive:0 62.8% 30.6%;--destructive-foreground:0 0% 98%;--border:240 3.7% 15.9%;--input:240 3.7% 15.9%;--ring:240 4.9% 83.9%;}`;

// Tailwind config that wires shadcn CSS variables into the standard
// utility classes: `bg-primary` → `hsl(var(--primary))`, etc. Without
// this the CDN ships only the default Tailwind palette and shadcn class
// strings (`bg-primary`, `text-foreground`, …) resolve to nothing.
const TAILWIND_SHADCN_CONFIG = `
window.tailwind={config:{darkMode:["class"],theme:{extend:{colors:{
  border:"hsl(var(--border))",input:"hsl(var(--input))",ring:"hsl(var(--ring))",
  background:"hsl(var(--background))",foreground:"hsl(var(--foreground))",
  primary:{DEFAULT:"hsl(var(--primary))",foreground:"hsl(var(--primary-foreground))"},
  secondary:{DEFAULT:"hsl(var(--secondary))",foreground:"hsl(var(--secondary-foreground))"},
  destructive:{DEFAULT:"hsl(var(--destructive))",foreground:"hsl(var(--destructive-foreground))"},
  muted:{DEFAULT:"hsl(var(--muted))",foreground:"hsl(var(--muted-foreground))"},
  accent:{DEFAULT:"hsl(var(--accent))",foreground:"hsl(var(--accent-foreground))"},
  popover:{DEFAULT:"hsl(var(--popover))",foreground:"hsl(var(--popover-foreground))"},
  card:{DEFAULT:"hsl(var(--card))",foreground:"hsl(var(--card-foreground))"}
},borderRadius:{lg:"var(--radius)",md:"calc(var(--radius) - 2px)",sm:"calc(var(--radius) - 4px)"}}}}};
`;

function buildSrcDoc(
  html: string,
  tokenVars: string,
  w: number,
  h: number,
  opts?: { isOverlay?: boolean },
): string {
  const safeHtml = stripRootBlocks(html);
  const overlayFlag = opts?.isOverlay ? 'true' : 'false';
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<script>window.__SIM_IS_OVERLAY__ = ${overlayFlag};</script>
<script>${TAILWIND_SHADCN_CONFIG}</script>
<script src="https://cdn.tailwindcss.com"></script>
<style>${SHADCN_VARS}</style>
<style>${tokenVars}</style>
<style>*{margin:0;padding:0;box-sizing:border-box;font-family:var(--font-family)!important}
html,body{width:${w}px;height:100%;min-height:${h}px;font-family:var(--font-family)!important;
background:var(--color-bg);color:var(--color-text);overflow-x:hidden;overflow-y:auto;
font-size:14px;line-height:1.5}
/* Vertical scrollbars: thin, accent-toned, never sticking out. Webkit
   browsers (Chrome/Safari) get the explicit pseudo-element styling;
   Firefox uses scrollbar-width/scrollbar-color (set on html). */
html{scrollbar-width:thin;scrollbar-color:rgba(120,120,120,.4) transparent}
*::-webkit-scrollbar{width:8px;height:0}
*::-webkit-scrollbar-track{background:transparent}
*::-webkit-scrollbar-thumb{background:rgba(120,120,120,.35);border-radius:8px}
*::-webkit-scrollbar-thumb:hover{background:rgba(120,120,120,.55)}
*::-webkit-scrollbar-corner{background:transparent}
/* Kill horizontal scroll EVERYWHERE — drawer / modal bodies often
   set overflow:auto without overflow-x:hidden, producing the ugly
   horizontal sliver the user flagged. */
html,body,[class*="drawer"],[class*="modal"],[class*="sheet"],[role=dialog],aside,nav,main,section,article{overflow-x:hidden!important}
a,button,[role=button]{cursor:pointer}
</style>
</head><body>${safeHtml}
<script>${INTERACTIVITY_LAYER}</script>
<script>${CLICK_INTERCEPT}</script>
<script>${NAV_INTERCEPT}</script>
</body></html>`;
}

// Stop-words that appear in too many UI labels to be discriminating.
const STOP = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'of',
  'to',
  'in',
  'on',
  'for',
  'screen',
  'page',
  'view',
  'modal',
  'drawer',
  'popover',
  'sheet',
]);

function tokenize(s: string): string[] {
  return ((s || '').toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => !STOP.has(w));
}

// Match clicked text to a screen / overlay using word-overlap scoring.
// Substring match alone misses "Change role" → "Role editor drawer" (no
// substring overlap, but they share the keyword "role"). Word-level
// matches with a name-hits weight + coverage bonus give us "the candidate
// with the most-aligned keywords wins".
function matchTarget(text: string, candidates: SimScreen[]): SimScreen | null {
  const tWords = tokenize(text);
  if (tWords.length === 0) return null;
  const tSet = new Set(tWords);
  let best: { score: number; cand: SimScreen } | null = null;
  for (const c of candidates) {
    const nameWords = tokenize(c.name);
    const trigWords = tokenize(c.triggerFrom || '');
    if (nameWords.length === 0) continue;
    let score = 0;
    for (const w of nameWords) if (tSet.has(w)) score += 4; // name word in click
    for (const w of trigWords) if (tSet.has(w)) score += 2; // trigger word in click
    if (score === 0) continue;
    // Coverage bonus — fully-matching name beats partial.
    const matchedNameCount = nameWords.filter((w) => tSet.has(w)).length;
    score += Math.round((matchedNameCount / nameWords.length) * 6);
    if (!best || score > best.score) best = { score, cand: c };
  }
  // Threshold: at least one name-word match (score >= 4).
  return best && best.score >= 4 ? best.cand : null;
}

export function SimulatorViewport({
  open,
  screens,
  sessionId,
  onClose,
  leftInset = 0,
  rightInset = 0,
}: Props) {
  // Nav targets: prefer kind=screen, but fall back to ALL screens if the
  // session only produced overlays (so the simulator still has something
  // to render instead of a blank viewport).
  const fullScreensStrict = useMemo(
    () => screens.filter((s) => (s.kind || 'screen') === 'screen'),
    [screens],
  );
  const fullScreens = useMemo(
    () => (fullScreensStrict.length > 0 ? fullScreensStrict : screens),
    [fullScreensStrict, screens],
  );
  const overlays = useMemo(
    () =>
      fullScreensStrict.length > 0 ? screens.filter((s) => (s.kind || 'screen') !== 'screen') : [],
    [fullScreensStrict, screens],
  );

  const [currentId, setCurrentId] = useState<string>('');
  const [overlayId, setOverlayId] = useState<string | null>(null);
  const [tokenVars, setTokenVars] = useState<string>(() => readTokenVars(sessionId));
  const [phase, setPhase] = useState<'closed' | 'entering' | 'open' | 'exiting'>('closed');
  // Navigation history — visited screen ids in chronological order, plus
  // a cursor for back/forward nav. Pushing a new screen while mid-history
  // truncates the forward stack (browser-tab semantics).
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);

  // Wrap setCurrentId so every screen change advances the nav history.
  // `mode` controls whether the call should ALSO push (default for picks)
  // or merely update the current pointer (used by back/forward, which
  // already moved historyIdx).
  const navigate = useCallback(
    (id: string, mode: 'push' | 'replace' = 'push') => {
      setOverlayId(null);
      setCurrentId(id);
      if (mode === 'replace') return;
      setHistory((prev) => {
        // Don't push if it's already the last entry (avoid duplicate
        // entries when handlers fire twice for the same selection).
        if (prev.length > 0 && historyIdx >= 0 && prev[historyIdx] === id) return prev;
        const truncated = historyIdx >= 0 ? prev.slice(0, historyIdx + 1) : [];
        const next = [...truncated, id];
        setHistoryIdx(next.length - 1);
        return next;
      });
    },
    [historyIdx],
  );

  const canGoBack = historyIdx > 0;
  const canGoForward = historyIdx >= 0 && historyIdx < history.length - 1;

  const goBack = useCallback(() => {
    if (!canGoBack) return;
    const newIdx = historyIdx - 1;
    setHistoryIdx(newIdx);
    setOverlayId(null);
    setCurrentId(history[newIdx]);
  }, [canGoBack, historyIdx, history]);

  const goForward = useCallback(() => {
    if (!canGoForward) return;
    const newIdx = historyIdx + 1;
    setHistoryIdx(newIdx);
    setOverlayId(null);
    setCurrentId(history[newIdx]);
  }, [canGoForward, historyIdx, history]);

  // Mouse side buttons (mouse4 = back, mouse5 = forward) + Alt+arrows.
  // The browser's history navigation fires on `mousedown` for the side
  // buttons — by the time `mouseup` runs the page is already navigating
  // back. Intercept on `mousedown` in the CAPTURE phase so we run
  // before any default handler, then stop propagation + preventDefault
  // on every related event (mousedown / mouseup / auxclick) so nothing
  // downstream re-triggers navigation.
  useEffect(() => {
    if (!open) return;
    const swallow = (e: MouseEvent) => {
      if (e.button !== 3 && e.button !== 4) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 3 && e.button !== 4) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (e.button === 3) goBack();
      else goForward();
    };
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goBack();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goForward();
      }
    };
    // Capture-phase on window so we run before any descendant handler
    // (and before the browser maps the button to history navigation).
    window.addEventListener('mousedown', onMouseDown, { capture: true });
    window.addEventListener('mouseup', swallow, { capture: true });
    window.addEventListener('auxclick', swallow, { capture: true });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onMouseDown, { capture: true });
      window.removeEventListener('mouseup', swallow, { capture: true });
      window.removeEventListener('auxclick', swallow, { capture: true });
      window.removeEventListener('keydown', onKey);
    };
  }, [open, goBack, goForward]);

  // Reset history when simulator closes.
  useEffect(() => {
    if (!open) {
      setHistory([]);
      setHistoryIdx(-1);
    }
  }, [open]);

  // Animate open / close. Only the `open` prop drives the lifecycle —
  // tying this to fullScreens (which is a new array every parent render)
  // would re-fire the entrance animation continuously.
  useEffect(() => {
    if (open) {
      setPhase('entering');
      // Hold off on materialising the iframe/toolbar until the wireframe
      // convergence animation in page.tsx has had time to land. Backdrop
      // fades in immediately (`isVisible` covers entering+open), so the
      // user sees the dim layer while wireframes shuffle to centre, then
      // the simulator surface materialises on top.
      const t = setTimeout(() => setPhase('open'), 480);
      return () => clearTimeout(t);
    } else if (phase !== 'closed') {
      setPhase('exiting');
      const t = setTimeout(() => {
        setPhase('closed');
        setOverlayId(null);
        setCurrentId('');
      }, 480);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Pick the home screen the first time fullScreens populates while open.
  // Logs once per actual open so we can still diagnose empty sessions.
  const loggedOpenRef = useRef(false);
  useEffect(() => {
    if (!open) {
      loggedOpenRef.current = false;
      return;
    }
    if (!currentId && fullScreens.length > 0) {
      navigate(fullScreens[0].id);
    }
    if (!loggedOpenRef.current && screens.length > 0) {
      loggedOpenRef.current = true;
      // eslint-disable-next-line no-console
      console.log('[Simulator] open', {
        totalScreens: screens.length,
        fullScreens: fullScreens.length,
        overlays: overlays.length,
        kinds: screens.map((s) => s.kind),
        names: screens.map((s) => s.name),
      });
    }
  }, [open, fullScreens, screens, overlays, currentId]);

  // Stay in sync with live token swaps (dark/light, accent dropdown).
  useEffect(() => {
    const refresh = (e?: Event) => {
      const detail = e
        ? ((e as CustomEvent).detail as { sessionId?: string } | undefined)
        : undefined;
      if (detail && detail.sessionId !== sessionId) return;
      setTokenVars(readTokenVars(sessionId));
    };
    window.addEventListener('session-design-regenerated', refresh);
    // Re-read when the global app theme changes — readTokenVars falls back
    // to the active theme's wireframe-* tokens when no session-scoped value
    // exists, so the simulator inherits the chosen app theme.
    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel('theme');
      channel.onmessage = () => refresh();
    }
    return () => {
      window.removeEventListener('session-design-regenerated', refresh);
      channel?.close();
    };
  }, [sessionId]);

  // Click routing — prefer overlay matches when an overlay is currently
  // open (lets nested clicks work), otherwise screens then overlays.
  useEffect(() => {
    if (!open) return;
    const onMsg = (e: MessageEvent) => {
      // Mouse4/5 inside the iframe → navigate via our screen history.
      if (e.data?.type === 'sim-nav') {
        if (e.data.dir === 'back') goBack();
        else if (e.data.dir === 'forward') goForward();
        return;
      }
      if (e.data?.type === 'sim-close-overlay') {
        // Iframe-side × click on a modal/drawer/popover — close the
        // active overlay if any. No-op when no overlay is open (e.g. a
        // stray × click on a non-chip element).
        if (overlayId) setOverlayId(null);
        return;
      }
      if (e.data?.type !== 'sim-click') return;
      // Explicit data-trigger wins — wired by the AI for cross-surface
      // navigation. Match by id first, then by case-insensitive name.
      const trigger = String(e.data.trigger || '');
      if (trigger) {
        const norm = trigger.toLowerCase().replace(/\s+/g, '_');
        const all = [...fullScreens, ...overlays];
        const direct = all.find(
          (c) =>
            c.id.toLowerCase() === norm ||
            c.name.toLowerCase() === trigger.toLowerCase() ||
            c.name.toLowerCase().replace(/\s+/g, '_') === norm,
        );
        if (direct) {
          const isOverlay = (direct.kind || 'screen') !== 'screen';
          if (isOverlay) setOverlayId(direct.id);
          else if (direct.id !== currentId) navigate(direct.id);
          // eslint-disable-next-line no-console
          console.log('[Simulator] trigger →', trigger, '→', direct.name);
          return;
        }
        // eslint-disable-next-line no-console
        console.warn('[Simulator] data-trigger has no matching surface:', trigger);
        return;
      }
      const text = String(e.data.text || '');
      if (!text) return;
      // Try screens first.
      const screenHit = matchTarget(text, fullScreens);
      const overlayHit = matchTarget(text, overlays);
      // eslint-disable-next-line no-console
      console.log('[Simulator] click', {
        text,
        screenHit: screenHit?.name,
        overlayHit: overlayHit?.name,
      });
      // Decide which won. Overlay name wins if longer / more specific.
      const pickOverlay =
        overlayHit && (!screenHit || overlayHit.name.length >= screenHit.name.length);
      if (pickOverlay) {
        setOverlayId(overlayHit!.id);
        return;
      }
      if (screenHit && screenHit.id !== currentId) {
        navigate(screenHit.id);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (overlayId) setOverlayId(null);
      else onClose();
    };
    window.addEventListener('message', onMsg);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('message', onMsg);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, fullScreens, overlays, currentId, overlayId, onClose, goBack, goForward, navigate]);

  // Compute a scale factor so the 1280×800 frame fits inside the
  // available canvas area when drawers are open. Recomputed on resize
  // and on inset change. We always keep the full-screen backdrop
  // covering the drawers so the dark veil reads as one unified layer
  // — only the FRAME inside is bound to the inset area.
  // IMPORTANT: these hooks live ABOVE the `phase === 'closed'` early
  // return below so React sees the same hook call order on every render.
  const [winSize, setWinSize] = useState<{ w: number; h: number }>({
    w: typeof window !== 'undefined' ? window.innerWidth : 1920,
    h: typeof window !== 'undefined' ? window.innerHeight : 1080,
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setWinSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const fitScale = useMemo(() => {
    const availW = Math.max(0, winSize.w - leftInset - rightInset);
    const availH = winSize.h;
    const sx = (availW * 0.92) / VIEWPORT_W;
    const sy = (availH * 0.88) / VIEWPORT_H;
    return Math.min(1, sx, sy);
  }, [winSize, leftInset, rightInset]);

  if (phase === 'closed') return null;

  const currentScreen = fullScreens.find((s) => s.id === currentId);
  const overlayScreen = overlayId ? overlays.find((o) => o.id === overlayId) : null;
  const isVisible = phase === 'open' || phase === 'entering';
  const isShowing = phase === 'open';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        pointerEvents: isVisible ? 'auto' : 'none',
        // Backdrop dim + blur tied to `isVisible` so it fades in
        // immediately on entrance (during 'entering') — separate from
        // the iframe materialisation which waits for the wireframe
        // convergence to land. Same on exit: iframe leaves first, dim
        // lingers until phase flips to 'closed'.
        background: `rgba(0,0,0,${isVisible ? 0.7 : 0})`,
        backdropFilter: isVisible ? 'blur(12px)' : 'blur(0px)',
        transition:
          'background 380ms cubic-bezier(0.4,0,0.2,1), ' +
          'backdrop-filter 380ms cubic-bezier(0.4,0,0.2,1)',
      }}
      onClick={(e) => {
        // Click on backdrop (not on the viewport itself or the overlay) closes.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Inner wrapper bounded by drawer insets — backdrop stays
          full-screen above so the drawers sit on the same dim/blur. */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: leftInset,
          right: rightInset,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          transition:
            'left 380ms cubic-bezier(0.4,0,0.2,1), ' + 'right 380ms cubic-bezier(0.4,0,0.2,1)',
          pointerEvents: 'none',
        }}
      >
        {currentScreen && (
          // Outer box has the SCALED dimensions so layout is true to
          // visual size — no overflow, no clipping. Inner box keeps the
          // 1280×800 iframe and scales it from top-left to fit the
          // outer box exactly.
          <div
            style={{
              position: 'relative',
              width: VIEWPORT_W * fitScale,
              height: VIEWPORT_H * fitScale,
              pointerEvents: 'auto',
              transition:
                'width 380ms cubic-bezier(0.4,0,0.2,1), height 380ms cubic-bezier(0.4,0,0.2,1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Nav pill in the top-left corner of the iframe — back /
                forward separated from the main toolbar so they live
                where the user's natural attention lands when they want
                to step through history. */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: -52,
                pointerEvents: 'auto',
                zIndex: 5,
              }}
            >
              <SimNavButtons
                onBack={goBack}
                onForward={goForward}
                canGoBack={canGoBack}
                canGoForward={canGoForward}
                visible={isShowing}
              />
            </div>
            {/* Main toolbar (SIM label + screen dropdown + close)
                anchored to the iframe top, tracks drawer-aware inset
                and fit-scaled width. */}
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: -52,
                transform: `translateX(-50%)`,
                pointerEvents: 'auto',
                zIndex: 5,
              }}
            >
              <SimToolbar
                screens={fullScreens}
                currentId={currentId}
                onPick={(id) => navigate(id)}
                visible={isShowing}
              />
            </div>
            {/* Close button at the iframe top-right, mirroring nav at
                the top-left. */}
            <div
              style={{
                position: 'absolute',
                right: 0,
                top: -52,
                pointerEvents: 'auto',
                zIndex: 5,
              }}
            >
              <SimCloseButton onClose={onClose} visible={isShowing} />
            </div>
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: VIEWPORT_W,
                height: VIEWPORT_H,
                transform: `scale(${fitScale})`,
                transformOrigin: 'top left',
                transition: 'transform 380ms cubic-bezier(0.4,0,0.2,1)',
              }}
            >
              <SimFrame
                key={currentScreen.id}
                html={currentScreen.html}
                tokenVars={tokenVars}
                w={VIEWPORT_W}
                h={VIEWPORT_H}
                phase={phase}
              />
              {overlayScreen && (
                <SimOverlayLayer
                  html={overlayScreen.html}
                  kind={overlayScreen.kind}
                  tokenVars={tokenVars}
                  onClose={() => setOverlayId(null)}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SimNavButtons({
  onBack,
  onForward,
  canGoBack,
  canGoForward,
  visible,
}: {
  onBack: () => void;
  onForward: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
  visible: boolean;
}) {
  // Mirror the ZoneActionButton styling used in the canvas zone header
  // (LIGHT / SIMULATE / palette pills) so the simulator chrome reads
  // as part of the same control system.
  const btn = (enabled: boolean): React.CSSProperties => ({
    height: 32,
    width: 32,
    padding: 0,
    borderRadius: 999,
    background: 'color-mix(in srgb, var(--foreground) 4%, transparent)',
    border: '1px solid rgba(255,255,255,0.10)',
    color: enabled ? 'rgba(255,255,255,0.7)' : 'var(--muted-foreground)',
    fontSize: 16,
    fontWeight: 500,
    lineHeight: 1,
    cursor: enabled ? 'pointer' : 'default',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 120ms ease, color 120ms ease, border-color 120ms ease',
  });
  return (
    <div
      style={{
        position: 'relative',
        height: 32,
        transform: `translateY(${visible ? 0 : -16}px)`,
        opacity: visible ? 1 : 0,
        transition: 'transform 380ms cubic-bezier(0.4,0,0.2,1), opacity 280ms ease',
        display: 'flex',
        gap: 8,
        alignItems: 'center',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={onBack}
        disabled={!canGoBack}
        title="Back (Mouse4 / Alt+←)"
        style={btn(canGoBack)}
        onMouseEnter={(e) => {
          if (!canGoBack) return;
          e.currentTarget.style.background =
            'color-mix(in srgb, var(--foreground) 8%, transparent)';
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)';
          e.currentTarget.style.color = 'rgba(255,255,255,0.95)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background =
            'color-mix(in srgb, var(--foreground) 4%, transparent)';
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)';
          e.currentTarget.style.color = canGoBack
            ? 'rgba(255,255,255,0.7)'
            : 'var(--muted-foreground)';
        }}
      >
        ‹
      </button>
      <button
        onClick={onForward}
        disabled={!canGoForward}
        title="Forward (Mouse5 / Alt+→)"
        style={btn(canGoForward)}
        onMouseEnter={(e) => {
          if (!canGoForward) return;
          e.currentTarget.style.background =
            'color-mix(in srgb, var(--foreground) 8%, transparent)';
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)';
          e.currentTarget.style.color = 'rgba(255,255,255,0.95)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background =
            'color-mix(in srgb, var(--foreground) 4%, transparent)';
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)';
          e.currentTarget.style.color = canGoForward
            ? 'rgba(255,255,255,0.7)'
            : 'var(--muted-foreground)';
        }}
      >
        ›
      </button>
    </div>
  );
}

function SimToolbar({
  screens,
  currentId,
  onPick,
  visible,
}: {
  screens: SimScreen[];
  currentId: string;
  onPick: (id: string) => void;
  visible: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const update = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      setCoords({ top: r.bottom + 6, left: r.left });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const current = screens.find((s) => s.id === currentId);

  const popover =
    open && coords && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={popoverRef}
            className="nodrag"
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              background: 'rgba(20,20,24,0.96)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 10,
              padding: 4,
              minWidth: 220,
              maxHeight: 320,
              overflowY: 'auto',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              zIndex: 1000,
            }}
          >
            {screens.map((s) => {
              const selected = s.id === currentId;
              return (
                <button
                  key={s.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPick(s.id);
                    setOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 6,
                    background: selected ? 'rgba(229,166,48,0.10)' : 'transparent',
                    border: 'none',
                    color: selected ? 'rgba(229,166,48,0.95)' : 'rgba(255,255,255,0.85)',
                    fontSize: 12,
                    fontWeight: 500,
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'background 100ms',
                  }}
                  onMouseEnter={(e) => {
                    if (!selected)
                      e.currentTarget.style.background =
                        'color-mix(in srgb, var(--foreground) 6%, transparent)';
                  }}
                  onMouseLeave={(e) => {
                    if (!selected) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <span style={{ flex: 1 }}>{s.name}</span>
                  {selected && <span style={{ fontSize: 11, opacity: 0.7 }}>✓</span>}
                </button>
              );
            })}
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      ref={wrapRef}
      style={{
        position: 'relative',
        height: 32,
        transform: `translateY(${visible ? 0 : -16}px)`,
        opacity: visible ? 1 : 0,
        transition: 'transform 380ms cubic-bezier(0.4,0,0.2,1), opacity 280ms ease',
        display: 'inline-flex',
        gap: 10,
        alignItems: 'center',
        whiteSpace: 'nowrap',
        background: 'color-mix(in srgb, var(--foreground) 4%, transparent)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 999,
        padding: '0 12px',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'rgba(229,166,48,0.95)',
        }}
      >
        SIM
      </span>
      <button
        ref={triggerRef}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: 'transparent',
          border: 'none',
          color: 'rgba(255,255,255,0.92)',
          fontSize: 13,
          fontWeight: 500,
          padding: 0,
          cursor: 'pointer',
        }}
      >
        <span>{current?.name || 'Select screen'}</span>
        <span style={{ fontSize: 9, opacity: 0.6 }}>▾</span>
      </button>
      {popover}
    </div>
  );
}

function SimCloseButton({ onClose, visible }: { onClose: () => void; visible: boolean }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      title="Exit simulation (Esc)"
      style={{
        position: 'relative',
        transform: `translateY(${visible ? 0 : -16}px)`,
        opacity: visible ? 1 : 0,
        transition:
          'transform 380ms cubic-bezier(0.4,0,0.2,1), opacity 280ms ease, background 120ms ease, color 120ms ease, border-color 120ms ease',
        height: 32,
        width: 32,
        padding: 0,
        borderRadius: 999,
        background: 'color-mix(in srgb, var(--foreground) 4%, transparent)',
        border: '1px solid rgba(255,255,255,0.10)',
        color: 'rgba(255,255,255,0.7)',
        fontSize: 16,
        fontWeight: 500,
        lineHeight: 1,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'color-mix(in srgb, var(--foreground) 8%, transparent)';
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)';
        e.currentTarget.style.color = 'rgba(255,255,255,0.95)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'color-mix(in srgb, var(--foreground) 4%, transparent)';
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)';
        e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
      }}
    >
      ×
    </button>
  );
}

function SimFrame({
  html,
  tokenVars,
  w,
  h,
  phase,
}: {
  html: string;
  tokenVars: string;
  w: number;
  h: number;
  phase: 'closed' | 'entering' | 'open' | 'exiting';
}) {
  const isShowing = phase === 'open';
  const srcDoc = useMemo(() => buildSrcDoc(html, tokenVars, w, h), [html, tokenVars, w, h]);
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: isShowing
          ? '0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)'
          : 'none',
        transform: `scale(${isShowing ? 1 : 0.92}) translateY(${isShowing ? 0 : 24}px)`,
        opacity: isShowing ? 1 : 0,
        transition:
          'transform 380ms cubic-bezier(0.4,0,0.2,1), opacity 280ms ease, box-shadow 380ms ease',
        background: 'var(--color-bg, #0a0a0a)',
        pointerEvents: isShowing ? 'auto' : 'none',
      }}
    >
      <iframe
        srcDoc={srcDoc}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        sandbox="allow-scripts allow-same-origin"
        title="simulator"
      />
    </div>
  );
}

function SimOverlayLayer({
  html,
  kind,
  tokenVars,
  onClose,
}: {
  html: string;
  kind: string;
  tokenVars: string;
  onClose: () => void;
}) {
  // Per-kind sizing — fits within the simulator viewport, not the page.
  // Modals sit centred over the screen; drawers slide in from the right
  // edge of the viewport; popovers appear top-right.
  const isDrawer = kind === 'drawer';
  const isPopover = kind === 'popover';
  const isModal = !isDrawer && !isPopover;
  const dims = (() => {
    if (isDrawer) return { w: 420 }; // height = 100% of viewport
    if (isPopover) return { w: 320, h: 280 };
    return { w: 640, h: 480 };
  })();
  const srcDoc = useMemo(
    () => buildSrcDoc(html, tokenVars, dims.w, (dims as any).h || 800, { isOverlay: true }),
    [html, tokenVars, dims],
  );
  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 5,
        borderRadius: 14,
        overflow: 'hidden',
        background: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: isDrawer ? 'stretch' : isPopover ? 'flex-start' : 'center',
        justifyContent: isPopover ? 'flex-end' : isDrawer ? 'flex-end' : 'center',
        padding: isPopover ? 16 : 0,
        animation: 'sim-overlay-in 220ms ease-out',
      }}
    >
      <style>{`
        @keyframes sim-overlay-in {
          from { background: rgba(0,0,0,0); backdrop-filter: blur(0px); }
          to   { background: rgba(0,0,0,0.45); backdrop-filter: blur(2px); }
        }
        @keyframes sim-modal-pop {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes sim-drawer-slide {
          from { opacity: 0; transform: translateX(24px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes sim-popover-pop {
          from { opacity: 0; transform: scale(0.92) translateY(-8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: Math.min(dims.w, 0.94 * 1280),
          height: isDrawer ? '100%' : (dims as any).h,
          maxWidth: '94%',
          maxHeight: isDrawer ? '100%' : '88%',
          borderRadius: isDrawer ? 0 : isModal ? 14 : 12,
          overflow: 'hidden',
          boxShadow: '0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)',
          background: 'var(--color-bg, #0a0a0a)',
          animation: `${isDrawer ? 'sim-drawer-slide' : isPopover ? 'sim-popover-pop' : 'sim-modal-pop'} 240ms cubic-bezier(0.4,0,0.2,1)`,
        }}
      >
        <iframe
          srcDoc={srcDoc}
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          sandbox="allow-scripts allow-same-origin"
          title="simulator-overlay"
        />
      </div>
    </div>
  );
}
