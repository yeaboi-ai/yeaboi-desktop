'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { memo, useEffect, useRef, useState } from 'react';

// Read the design-system tokens for the current session from localStorage and
// emit a :root { --color-... } block. The iframe's HTML uses these CSS variables
// (per the facilitator's WIREFRAME prompt rule) so wireframes restyle live as
// soon as the tokens change. Falls back to a sensible dark theme so legacy
// wireframes that still use raw hex values keep rendering.
// Compute relative luminance of a hex colour (0..1).
function luminance(hex: string): number {
  const m = hex.match(/^#?([0-9a-f]{3,8})$/i);
  if (!m) return 0.5;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length === 8) h = h.slice(0, 6);
  if (h.length !== 6) return 0.5;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

// Force text colours to a readable value when the design's choice
// fails WCAG-ish contrast against the bg. Returns the original colour
// if it's fine, otherwise a high-contrast override.
function ensureContrast(textHex: string, bgHex: string, minRatio = 4.0): string {
  if (contrast(textHex, bgHex) >= minRatio) return textHex;
  // Pick white or black depending on bg luminance
  return luminance(bgHex) < 0.5 ? 'var(--foreground)' : 'var(--background)';
}

// Cheap DJB2 hash so the iframe key changes whenever ANY part of the
// token/component/font state changes — not just --color-bg. Returns a
// 32-bit integer rendered as a base-36 string for compactness.
function hashStr(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

function buildTokenVars(sessionId: string | undefined): string {
  // Neutral fallback used only when no design system has loaded for this
  // session yet. Deliberately monochrome so an empty wireframe doesn't
  // ship a fake brand colour — once the design panel resolves a recipe,
  // CSS vars override these instantly.
  const fallback = `
    :root {
      --color-bg: #0a0a0a;
      --color-surface: #1a1a1a;
      --color-text: #e8e8e8;
      --color-text-muted: rgba(255,255,255,0.55);
      --color-primary: #e8e8e8;
      --color-accent: #e8e8e8;
      --color-on-accent: #0a0a0a;
      --color-border: rgba(255,255,255,0.1);
      --color-success: #4ade80;
      --color-warning: #fbbf24;
      --color-error: #f87171;
      --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      --radius-sm: 4px;
      --radius-md: 8px;
    }`;
  if (!sessionId || typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(`design-system-${sessionId}`);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as { design_system?: Record<string, unknown> };
    const ds = parsed?.design_system as Record<string, unknown> | undefined;
    if (!ds) return fallback;
    const rawColors = (ds.colors || {}) as Record<string, unknown>;
    // Backend stores each colour as { hex, name, usage } — pull .hex out, but
    // also tolerate plain strings (older payloads, design overrides).
    const pick = (key: string, fallback: string): string => {
      const v = rawColors[key];
      if (!v) return fallback;
      if (typeof v === "string") return v;
      if (typeof v === "object" && v !== null && typeof (v as any).hex === "string") return (v as any).hex;
      return fallback;
    };
    const typography = (ds.typography || {}) as Record<string, unknown>;
    const radii = (ds.radii || ds.borderRadius || {}) as Record<string, string>;
    const SYSTEM_SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    // Hard-banned font families — these read as "AI-generated wireframe"
    // serif placeholders rather than considered design choices. If the
    // design system picks any of these, swap for a clean system sans.
    const BANNED_FONTS = [
      "times", "times new roman",
      "georgia", "garamond", "eb garamond",
      "bodoni", "didot",
      "playfair", "playfair display",
      "lora", "merriweather",
      "pt serif", "source serif",
      "crimson", "crimson text",
      "iowan", "iowan old style",
      "cormorant", "libre baskerville",
      "noto serif", "roboto serif",
      "spectral",
      "palatino", "palatino linotype",
      "book antiqua", "baskerville",
    ];
    const sanitizeFontFamily = (raw: string): string => {
      const cleaned = raw.trim();
      if (!cleaned) return SYSTEM_SANS;
      const head = cleaned.split(",")[0].replace(/['"]/g, "").trim().toLowerCase();
      if (!head) return SYSTEM_SANS;
      // Treat any value containing "serif" but not "sans-serif" as banned.
      const looksSerif = /\bserif\b/.test(head) && !/sans-?serif/.test(head);
      if (looksSerif || BANNED_FONTS.some((b) => head === b || head.includes(b))) {
        return SYSTEM_SANS;
      }
      // Always append the system sans fallback so the browser drops to a
      // sans family if the chosen font doesn't load (instead of falling
      // back to its built-in serif default).
      return /sans-?serif/i.test(cleaned) ? cleaned : `${cleaned}, ${SYSTEM_SANS}`;
    };
    const fontFamily = sanitizeFontFamily(
      ((typography.bodyFont as string) ||
        (typography.body as string) ||
        (typography.family as string) ||
        ""),
    );

    const bg = pick("background", "var(--background)");
    const surface = pick("surface", "var(--card)");
    // Guard text contrast — design lib sometimes emits palettes where text
    // is barely distinguishable from bg, which renders wireframes as nearly
    // invisible content on dark backgrounds.
    const text = ensureContrast(pick("text", "var(--foreground)"), bg, 4.5);
    // Muted is meant to be lower-contrast but not invisible — enforce ≥3:1.
    const mutedRaw = pick("muted", "var(--muted-foreground)");
    const muted = mutedRaw.startsWith("#") ? ensureContrast(mutedRaw, bg, 3) : mutedRaw;
    const accent = pick("accent", pick("primary", "var(--primary)"));
    const primary = pick("primary", accent);
    const border = pick("border", "rgba(255,255,255,0.12)");
    const success = pick("success", "#22c55e");
    const warning = pick("warning", "#f59e0b");
    const error = pick("error", "#ef4444");
    const onAccent = ensureContrast(bg, accent, 3);
    return `
      :root {
        --color-bg: ${bg};
        --color-surface: ${surface};
        --color-text: ${text};
        --color-text-muted: ${muted};
        --color-primary: ${primary};
        --color-accent: ${accent};
        --color-on-accent: ${onAccent};
        --color-border: ${border};
        --color-success: ${success};
        --color-warning: ${warning};
        --color-error: ${error};
        --font-family: ${fontFamily};
        --radius-sm: ${radii.sm || '4px'};
        --radius-md: ${radii.md || '8px'};
      }`;
  } catch {
    return fallback;
  }
}

// Walk a design_system tree to resolve `{path.to.value}` token references.
// Supports `{colors.accent.hex}`, `{borderRadius.md}`, etc. Returns the
// literal value or — when a reference cannot be resolved — the original
// reference string so it stays visible in dev rather than silently failing.
function resolveTokenRef(ref: string, ds: Record<string, unknown>): string {
  const m = /^\{([^}]+)\}$/.exec(ref);
  if (!m) return ref;
  const path = m[1].split(".");
  let cur: unknown = ds;
  for (const part of path) {
    if (cur && typeof cur === "object" && part in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return ref;
    }
  }
  if (typeof cur === "string" || typeof cur === "number") return String(cur);
  // Tolerate {colors.accent} shorthand → resolves to .hex
  if (cur && typeof cur === "object" && typeof (cur as any).hex === "string") return (cur as any).hex;
  return ref;
}

// Standard CSS property names for component-bundle keys. Anything not in
// the map is treated as already-CSS (e.g. `padding`, `color`).
const COMPONENT_KEY_TO_CSS: Record<string, string> = {
  background: "background",
  color: "color",
  text: "color",
  textColor: "color",
  rounded: "border-radius",
  border: "border",
  borderColor: "border-color",
  borderWidth: "border-width",
  padding: "padding",
  margin: "margin",
  fontWeight: "font-weight",
  fontSize: "font-size",
  fontFamily: "font-family",
  letterSpacing: "letter-spacing",
  lineHeight: "line-height",
  textTransform: "text-transform",
  opacity: "opacity",
  boxShadow: "box-shadow",
};

// Pseudo-class suffixes that map to CSS pseudo-classes on the BASE component
// rather than emitting a standalone rule.
const PSEUDO_SUFFIXES: Record<string, string> = {
  "-hover": ":hover",
  "-pressed": ":active",
  "-disabled": ":disabled",
};

// Walk design_system.components and emit a CSS block targeting
// [data-component="..."] selectors. Variant suffixes (-hover, -pressed,
// -disabled) attach as pseudo-classes on the base component when the
// base exists; otherwise they ship as their own selector (e.g.
// `tab-bar-item-active` is a separate component, not a state).
function buildComponentCss(sessionId: string | undefined): string {
  if (!sessionId || typeof window === "undefined") return "";
  try {
    const raw = localStorage.getItem(`design-system-${sessionId}`);
    if (!raw) return "";
    const parsed = JSON.parse(raw) as { design_system?: Record<string, unknown> };
    const ds = parsed?.design_system as Record<string, unknown> | undefined;
    if (!ds) return "";
    const components = (ds.components || {}) as Record<string, unknown>;
    if (typeof components !== "object" || !components) return "";

    const componentNames = Object.keys(components);
    const rules: string[] = [];

    for (const name of componentNames) {
      const props = components[name];
      if (!props || typeof props !== "object") continue;

      // Determine selector: pseudo-class on parent if suffix matches AND
      // the parent component exists; otherwise a standalone selector.
      let selector = `[data-component="${name}"]`;
      for (const [suffix, pseudo] of Object.entries(PSEUDO_SUFFIXES)) {
        if (name.endsWith(suffix)) {
          const base = name.slice(0, -suffix.length);
          if (componentNames.includes(base)) {
            selector = `[data-component="${base}"]${pseudo}`;
          }
          break;
        }
      }

      const decls: string[] = [];
      for (const [key, value] of Object.entries(props as Record<string, unknown>)) {
        if (typeof value !== "string" && typeof value !== "number") continue;
        const cssProp = COMPONENT_KEY_TO_CSS[key] || key;
        const resolved = typeof value === "string" ? resolveTokenRef(value, ds) : String(value);
        decls.push(`${cssProp}: ${resolved};`);
      }
      if (decls.length === 0) continue;
      rules.push(`${selector} { ${decls.join(" ")} }`);
    }
    return rules.join("\n");
  } catch {
    return "";
  }
}

// System fonts already on every device — no need to fetch.
const SYSTEM_FONTS = new Set([
  "system-ui", "-apple-system", "blinkmacsystemfont", "segoe ui", "roboto",
  "helvetica", "arial", "sans-serif", "serif", "monospace", "georgia",
  "times new roman", "courier new", "menlo", "monaco", "consolas",
]);

// Build a Google Fonts <link> URL covering the heading + body fonts the
// design system asked for. Skips system fonts (already available) and
// keeps the URL bounded to two families with sensible weight ranges so
// the iframe load stays under ~50KB.
function buildFontsLink(designSystem: Record<string, unknown> | undefined): string {
  if (!designSystem) return "";
  const typography = (designSystem.typography || {}) as Record<string, unknown>;
  // Banned families — never preload these from Google Fonts. Mirrors
  // the sanitizer in buildTokenVars so we don't fetch a serif we'd
  // immediately swap out anyway.
  const BANNED_FONTS = new Set([
    "times", "times new roman",
    "georgia", "garamond", "eb garamond",
    "bodoni", "didot",
    "playfair", "playfair display",
    "lora", "merriweather",
    "pt serif", "source serif",
    "crimson", "crimson text",
    "iowan", "iowan old style",
    "cormorant", "libre baskerville",
    "noto serif", "roboto serif",
    "spectral",
    "palatino", "palatino linotype",
    "book antiqua", "baskerville",
    "instrument serif",
  ]);
  const candidates: string[] = [];
  for (const key of ["headingFont", "bodyFont", "displayFont", "monoFont", "heading", "body", "family"]) {
    const v = typography[key];
    if (typeof v !== "string") continue;
    // Strip surrounding quotes + fallback chain — we only fetch the first
    // font in a stack (e.g. "Instrument Serif, Georgia, serif" → "Instrument Serif").
    const first = v.split(",")[0].trim().replace(/['"]/g, "");
    if (!first) continue;
    const firstLc = first.toLowerCase();
    if (SYSTEM_FONTS.has(firstLc)) continue;
    if (BANNED_FONTS.has(firstLc)) continue;
    // Reject any name containing "serif" (but not "sans-serif").
    if (/\bserif\b/.test(firstLc) && !/sans-?serif/.test(firstLc)) continue;
    if (!candidates.includes(first)) candidates.push(first);
  }
  if (candidates.length === 0) return "";
  // Build family params: family=Name+With+Spaces:wght@300;400;500;600;700
  const families = candidates.slice(0, 2).map((name) => {
    const param = name.replace(/\s+/g, "+");
    return `family=${param}:wght@300;400;500;600;700`;
  });
  const href = `https://fonts.googleapis.com/css2?${families.join("&")}&display=swap`;
  return `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="${href}" rel="stylesheet">`;
}

interface WireElement {
  id: string;
  type: string;
  label?: string;
  placeholder?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  variant?: string;
}

// Iframe wrapper that pushes design-token + component CSS updates IN PLACE
// instead of remounting / reloading the iframe. The trick is to set the
// initial document via ref ONCE (using imperative srcdoc) and never pass
// a `srcDoc` React prop afterwards — passing it again would trigger a
// browser reload of the iframe even when the value is identical.
function LiveTokenIframe({
  w,
  h,
  isMobile,
  fontsLink,
  tokenVars,
  componentCss,
  htmlContent,
  label,
  loaded,
  onLoaded,
}: {
  w: number;
  h: number;
  isMobile: boolean;
  isOverlay: boolean;
  fontsLink: string;
  tokenVars: string;
  componentCss: string;
  htmlContent: string;
  label: string;
  loaded: boolean;
  onLoaded: () => void;
}) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  // Latest props captured for the imperative-only updater.
  const liveRef = useRef({ tokenVars, componentCss, fontsLink });
  liveRef.current = { tokenVars, componentCss, fontsLink };

  const buildDoc = (html: string, width: number, height: number, mob: boolean): string =>
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=${width},initial-scale=1"><style id="ds-tokens"></style><style id="ds-base">*{margin:0;padding:0;box-sizing:border-box;font-family:var(--font-family)!important}html,body{width:${width}px;height:100%;min-height:${height}px;font-family:var(--font-family)!important;background:var(--color-bg);color:var(--color-text);overflow-x:hidden;overflow-y:auto;font-size:14px;line-height:1.5;padding-top:${mob ? 44 : 0}px;padding-bottom:${mob ? 24 : 0}px;scrollbar-width:none;-ms-overflow-style:none}html::-webkit-scrollbar,body::-webkit-scrollbar,*::-webkit-scrollbar{display:none;width:0;height:0}</style><style id="ds-components"></style></head><body>${html}</body></html>`;

  // srcDoc lives in component state and ONLY updates when html/layout
  // dimensions change. Token / component / font changes flow through
  // the imperative updater below, which never touches React's idea of
  // the srcDoc prop. Result: no iframe reload on color drag.
  const [srcDoc, setSrcDoc] = useState<string>(() => buildDoc(htmlContent, w, h, isMobile));
  useEffect(() => {
    setSrcDoc(buildDoc(htmlContent, w, h, isMobile));
  }, [htmlContent, w, h, isMobile]);

  // Inject the current tokens / components / fonts after each (re)load
  // and on prop changes thereafter.
  const applyAll = () => {
    const frame = ref.current;
    if (!frame) return;
    const doc = frame.contentDocument;
    if (!doc) return;
    const t = doc.getElementById('ds-tokens');
    if (t) t.textContent = liveRef.current.tokenVars;
    const c = doc.getElementById('ds-components');
    if (c) c.textContent = liveRef.current.componentCss;
    // Gemini sometimes ships its own `<style>` blocks with `:root { --color-bg: #0a0a0c; ... }`
    // baked in. Those re-declare our tokens with hardcoded dark hex; CSS cascade
    // (last-wins for same specificity) means they override `ds-tokens`, so the
    // theme toggle silently does nothing. Strip every `:root { ... }` rule from
    // any non-canonical style tag so only `ds-tokens` defines the palette.
    const CANONICAL = new Set(['ds-tokens', 'ds-base', 'ds-components']);
    const ROOT_RE = /:root\s*\{[^}]*\}/g;
    doc.querySelectorAll('style').forEach((s) => {
      if (CANONICAL.has(s.id)) return;
      const original = s.textContent || '';
      const stripped = original.replace(ROOT_RE, '');
      if (stripped !== original) s.textContent = stripped;
    });
    if (doc.head) {
      const old = Array.from(doc.head.querySelectorAll('link[data-ds="font"]')) as HTMLLinkElement[];
      old.forEach((l) => l.remove());
      if (liveRef.current.fontsLink) {
        const wrap = doc.createElement('div');
        wrap.innerHTML = liveRef.current.fontsLink;
        Array.from(wrap.children).forEach((node) => {
          if (node instanceof HTMLLinkElement) {
            node.setAttribute('data-ds', 'font');
            doc.head.appendChild(node);
          }
        });
      }
    }
  };

  useEffect(() => {
    if (!loaded) return;
    applyAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenVars, componentCss, fontsLink, loaded]);

  return (
    <iframe
      ref={ref}
      srcDoc={srcDoc}
      onLoad={() => {
        applyAll();
        onLoaded();
      }}
      style={{
        width: '100%',
        height: '100%',
        border: 'none',
        background: 'var(--color-bg, #0a0a0a)',
        pointerEvents: 'none',
        opacity: loaded ? 1 : 0,
        transition: 'opacity 0.3s ease-in-out',
      }}
      sandbox="allow-same-origin"
      title={label}
    />
  );
}

interface WireScreenNodeData {
  label: string;
  width?: number;
  height?: number;
  elements?: WireElement[];
  fidelity?: 'low' | 'high';
  onEnhance?: () => void | Promise<void>;
  /** Single-screen redesign — regenerate just this screen using the existing component manifest so it stays consistent with siblings. */
  onRedesignScreen?: (screenId: string, screenName: string) => void | Promise<void>;
  /** Live design rationale streamed from the backend while a skeleton is awaiting generation. */
  _thinking?: string;
  /** Whether this node has been filled with real content (set by the merge logic). */
  _filled?: boolean;
  [key: string]: unknown;
}

function deriveBoxesFromHtml(html: string, w: number, h: number): WireElement[] {
  // Very conservative fallback: extract visible text from the outermost tags
  // and lay them out vertically as labelled boxes. Not a full parser — just
  // something the low-fi renderer can show when the backend omitted elements.
  const textBits = html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 40)
    .slice(0, 6);
  const padding = 16;
  const boxH = 48;
  const gap = 12;
  return textBits.map((label, i) => ({
    id: `__lofi_${i}__`,
    type: 'card',
    label,
    x: padding,
    y: padding + i * (boxH + gap),
    width: w - padding * 2,
    height: boxH,
  }));
}

function getElementStyle(type: string, variant?: string): React.CSSProperties {
  const base: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    overflow: 'hidden',
  };
  switch (type) {
    case 'button':
      return {
        ...base,
        background: variant === 'primary' ? 'var(--primary)' : variant === 'secondary' ? 'color-mix(in srgb, var(--foreground) 8%, transparent)' : 'color-mix(in srgb, var(--foreground) 5%, transparent)',
        color: variant === 'primary' ? 'var(--background)' : 'var(--muted-foreground)',
        borderRadius: 8,
        fontWeight: 500,
      };
    case 'input': case 'textarea':
      return { ...base, border: '1px solid rgba(255,255,255,0.1)', background: 'color-mix(in srgb, var(--foreground) 2%, transparent)', padding: '0 10px' };
    case 'card':
      return { ...base, background: 'color-mix(in srgb, var(--foreground) 4%, transparent)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, flexDirection: 'column', padding: 12 };
    case 'header': case 'footer': case 'nav':
      return { ...base, background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' };
    case 'image':
      return { ...base, background: 'color-mix(in srgb, var(--foreground) 4%, transparent)', border: '1px dashed rgba(255,255,255,0.08)' };
    case 'list': case 'table':
      return { ...base, background: 'color-mix(in srgb, var(--foreground) 2%, transparent)', border: '1px solid rgba(255,255,255,0.06)', flexDirection: 'column', alignItems: 'flex-start', padding: 8 };
    case 'tabs':
      return { ...base, borderBottom: '2px solid rgba(255,255,255,0.1)' };
    default:
      return { ...base, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' };
  }
}

function WireScreenNodeComponent({ data, selected, dragging, id }: NodeProps) {
  const nodeData = data as WireScreenNodeData;
  const label = nodeData.label || 'Screen';
  const w = nodeData.width || 390;
  const h = nodeData.height || 844;
  // Diagnostic: prove the node re-renders and the thinking text reaches it.
  // Logs only when thinking is non-empty so it doesn't spam.
  if (nodeData._thinking) {
    // eslint-disable-next-line no-console
    console.log('[WireScreenNode]', id, 'render — _filled:', nodeData._filled,
      '_thinking len:', (nodeData._thinking as string).length);
  }
  const elements = Array.isArray(nodeData.elements) ? nodeData.elements : [];
  const fidelity = (nodeData.fidelity ?? 'high') as 'low' | 'high';
  const htmlContent = (nodeData as any).html as string | undefined;
  const [iframeLoaded, setIframeLoaded] = useState(false);

  // Live token vars + component CSS + Google Fonts <link> — all three
  // re-derive whenever the design panel emits a regen event so existing
  // wireframes restyle in place (and pick up new fonts).
  const sessionId = (nodeData as any)._sessionId as string | undefined;
  const [tokenVars, setTokenVars] = useState<string>(() => buildTokenVars(sessionId));
  const [componentCss, setComponentCss] = useState<string>(() => buildComponentCss(sessionId));
  const [fontsLink, setFontsLink] = useState<string>(() => {
    if (!sessionId || typeof window === 'undefined') return '';
    try {
      const raw = localStorage.getItem(`design-system-${sessionId}`);
      if (!raw) return '';
      const parsed = JSON.parse(raw) as { design_system?: Record<string, unknown> };
      return buildFontsLink(parsed?.design_system);
    } catch { return ''; }
  });
  const [restyling, setRestyling] = useState(false);
  // True when a flow node linked to this screen is being hovered.
  // The flow node dispatches a `flow-hover` CustomEvent with the screenId;
  // each wirescreen listens and brightens itself if its id matches.
  const [isFlowHovered, setIsFlowHovered] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onFlowHover = (e: Event) => {
      const detail = (e as CustomEvent).detail as { screenId?: string | null };
      setIsFlowHovered(!!detail?.screenId && detail.screenId === id);
    };
    window.addEventListener('flow-hover', onFlowHover);
    return () => window.removeEventListener('flow-hover', onFlowHover);
  }, [id]);
  useEffect(() => {
    setTokenVars(buildTokenVars(sessionId));
    setComponentCss(buildComponentCss(sessionId));
    if (typeof window === 'undefined') return;
    const refreshFonts = () => {
      try {
        const raw = localStorage.getItem(`design-system-${sessionId}`);
        if (!raw) { setFontsLink(''); return; }
        const parsed = JSON.parse(raw) as { design_system?: Record<string, unknown> };
        setFontsLink(buildFontsLink(parsed?.design_system));
      } catch { setFontsLink(''); }
    };
    refreshFonts();
    const refresh = (e: Event) => {
      const detail = (e as CustomEvent).detail as { sessionId?: string } | undefined;
      if (!detail || detail.sessionId !== sessionId) return;
      setTokenVars(buildTokenVars(sessionId));
      setComponentCss(buildComponentCss(sessionId));
      refreshFonts();
      // Don't hide the iframe — onLoad doesn't fire reliably on srcDoc updates,
      // and CSS vars apply live anyway. Hiding here left the iframe at opacity 0
      // forever after Regenerate.
    };
    const onRestyling = (e: Event) => {
      const detail = (e as CustomEvent).detail as { sessionId?: string; active?: boolean } | undefined;
      if (!detail || detail.sessionId !== sessionId) return;
      setRestyling(!!detail.active);
    };
    window.addEventListener('session-design-regenerated', refresh);
    window.addEventListener('session-wireframe-restyling', onRestyling);
    return () => {
      window.removeEventListener('session-design-regenerated', refresh);
      window.removeEventListener('session-wireframe-restyling', onRestyling);
    };
  }, [sessionId]);

  const renderElements =
    fidelity === 'low' && elements.length === 0 && htmlContent
      ? deriveBoxesFromHtml(htmlContent, w, h - 24)
      : elements;

  const handleStyle = {
    width: 6,
    height: 6,
    background: 'rgba(255,255,255,0.12)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '50%',
  };

  const device = (nodeData as any).device as string | undefined;
  const kind = ((nodeData as any).kind as string | undefined) || 'screen';
  const isOverlay = kind === 'modal' || kind === 'drawer' || kind === 'popover';
  // Mobile chrome (iOS bezel + status bar + home indicator) is appropriate
  // ONLY when the screen actually targets a phone AND we're rendering a
  // full screen (not an overlay). Overlays render in a clean card frame
  // regardless of the parent screen's device.
  const isMobile = !isOverlay && (device === 'mobile' || device === 'tablet');

  return (
    <div
      style={{
        width: w,
        minHeight: h,
        position: 'relative',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        willChange: dragging ? 'transform' : 'auto',
      }}
    >
      {/* Screen label strip above the frame — editorial small-caps.
          More clearance (top: -36) so the row + the redesign button don't
          crowd the device chrome below. */}
      <div
        style={{
          position: 'absolute',
          top: -38,
          left: 4,
          right: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--muted-foreground)',
          height: 22,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
          {isOverlay && (
            <span style={{
              padding: '1px 6px',
              fontSize: 8,
              letterSpacing: '0.12em',
              background: 'rgba(229,166,48,0.12)',
              border: '1px solid rgba(229,166,48,0.28)',
              color: 'rgba(229,166,48,0.85)',
              borderRadius: 4,
              fontWeight: 600,
              flexShrink: 0,
            }}>{kind.toUpperCase()}</span>
          )}
          {isOverlay && (nodeData as any).triggerFrom && (
            <span style={{
              padding: '1px 6px',
              fontSize: 8,
              letterSpacing: '0.06em',
              background: 'color-mix(in srgb, var(--foreground) 4%, transparent)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.55)',
              borderRadius: 4,
              fontWeight: 500,
              textTransform: 'none',
              flexShrink: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={(nodeData as any).triggerFrom as string}>
              ← {(nodeData as any).triggerFrom as string}
            </span>
          )}
        </span>
        {/* Redesign button — back in the label strip per UX preference.
            Renders on every filled screen unconditionally (no longer gated
            on `onRedesignScreen` being defined) so a stale render between
            data updates can't make it flicker out. The click handler uses
            optional chaining so a missing callback is a safe no-op. */}
        {nodeData._filled && (
          <button
            type="button"
            className="nodrag nopan"
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              nodeData.onRedesignScreen?.(id, label);
            }}
            title="Redesign this surface using the same component manifest"
            style={{
              flexShrink: 0,
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 8px',
              background: 'rgba(229,166,48,0.1)',
              border: '1px solid rgba(229,166,48,0.3)',
              borderRadius: 999,
              color: 'rgba(229,166,48,0.9)',
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              transition: 'background 0.15s, border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(229,166,48,0.22)';
              e.currentTarget.style.borderColor = 'rgba(229,166,48,0.6)';
              e.currentTarget.style.color = 'rgba(229,166,48,1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(229,166,48,0.1)';
              e.currentTarget.style.borderColor = 'rgba(229,166,48,0.3)';
              e.currentTarget.style.color = 'rgba(229,166,48,0.9)';
            }}
          >
            <svg width={9} height={9} viewBox="0 0 16 16" fill="none">
              <path d="M14 8a6 6 0 1 1-1.76-4.24M14 3v3h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Redesign
          </button>
        )}
      </div>

      {/* Device / overlay shell. Overlays use a tight card frame instead of
          the device bezel — they're not standalone surfaces.
          Hover-highlight: when a linked flow node is hovered, glow amber
          and lift slightly so the user can see the connection. */}
      <div
        style={{
          width: '100%',
          height: h,
          background: isOverlay ? 'transparent' : 'var(--background)',
          border: `1px solid ${
            selected || isFlowHovered
              ? 'var(--primary)'
              : isOverlay
                ? 'rgba(229,166,48,0.25)'
                : 'rgba(255,255,255,0.14)'
          }`,
          borderRadius: isOverlay ? (kind === 'popover' ? 8 : 12) : isMobile ? 42 : 14,
          boxShadow: isFlowHovered
            ? '0 0 0 4px rgba(229,166,48,0.32), 0 24px 56px -10px rgba(229,166,48,0.18)'
            : selected
              ? '0 0 0 3px rgba(229,166,48,0.12), 0 20px 40px -10px rgba(0,0,0,0.5)'
              : isOverlay
                ? '0 28px 56px -16px rgba(0,0,0,0.6), 0 0 0 1px rgba(229,166,48,0.04)'
                : '0 20px 40px -10px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          transition: 'border-color 0.2s ease, box-shadow 0.25s ease, transform 0.2s ease',
          transform: isFlowHovered ? 'translateY(-3px)' : 'translateY(0)',
          padding: isMobile ? 3 : 0,
        }}
      >
        {/* Inner clipping layer — keeps the screen inset from the device bezel */}
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: isMobile ? 40 : 12,
            overflow: 'hidden',
            position: 'relative',
            background: 'var(--color-bg, #0a0a0a)',
          }}
        >
          {/* iOS status bar — time left, dynamic island center, battery/signal right */}
          {isMobile && (
            <div
              style={{
                position: 'absolute',
                top: 0, left: 0, right: 0,
                height: 44,
                zIndex: 3,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 24px',
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--color-text, #e8e8e8)',
                pointerEvents: 'none',
              }}
            >
              <span>9:41</span>
              {/* Dynamic island */}
              <div style={{ width: 110, height: 30, background: 'var(--primary-foreground)', borderRadius: 20 }} />
              <span style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11 }}>
                <span>●●●●</span>
                <svg width="16" height="11" viewBox="0 0 16 11" fill="none"><path d="M1 4.5l2-1 2 1.5 2-2 2 2 2-1.5 2 1 2 .5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                <svg width="24" height="11" viewBox="0 0 24 11" fill="none"><rect x="0.5" y="0.5" width="20" height="10" rx="2" stroke="currentColor" opacity="0.4"/><rect x="2" y="2" width="17" height="7" rx="1" fill="currentColor"/><rect x="21" y="3.5" width="1.5" height="4" rx="0.5" fill="currentColor" opacity="0.4"/></svg>
              </span>
            </div>
          )}

          {/* Home indicator */}
          {isMobile && (
            <div
              style={{
                position: 'absolute',
                bottom: 8, left: '50%',
                transform: 'translateX(-50%)',
                width: 134, height: 5, borderRadius: 3,
                background: 'var(--color-text, #e8e8e8)',
                opacity: 0.6,
                zIndex: 3,
                pointerEvents: 'none',
              }}
            />
          )}


          {/* Screen content — iframe or box layout */}
          {htmlContent && fidelity !== 'low' ? (
            <>
              {/* Transparent overlay captures drags when unselected; gets out of the way
                  when the node is selected so the iframe content becomes scrollable. */}
              {!selected && (
                <div
                  style={{ position: 'absolute', inset: 0, zIndex: 1, cursor: 'grab', pointerEvents: 'auto' }}
                />
              )}
              {/* Drag overlay used to swap to a label placeholder, which
                  felt like the content was being wiped. Keep the iframe
                  visible during drag — the label-only fallback is more
                  jarring than the slight jitter from moving an iframe. */}
              {!iframeLoaded && (
                <div style={{
                  position: 'absolute', inset: 0, padding: 16, paddingTop: isMobile ? 56 : 16,
                  display: 'flex', flexDirection: 'column', gap: 12, zIndex: 0,
                }}>
                  <div style={{ width: '60%', height: 20, background: 'color-mix(in srgb, var(--foreground) 4%, transparent)', borderRadius: 4, animation: 'pulse 1.5s ease-in-out infinite' }} />
                  <div style={{ width: '100%', height: 40, background: 'rgba(255,255,255,0.03)', borderRadius: 6, animation: 'pulse 1.5s ease-in-out infinite', animationDelay: '0.1s' }} />
                  <div style={{ width: '100%', height: 40, background: 'rgba(255,255,255,0.03)', borderRadius: 6, animation: 'pulse 1.5s ease-in-out infinite', animationDelay: '0.2s' }} />
                  <div style={{ width: '80%', height: 120, background: 'color-mix(in srgb, var(--foreground) 2%, transparent)', borderRadius: 8, animation: 'pulse 1.5s ease-in-out infinite', animationDelay: '0.3s' }} />
                  <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }`}</style>
                </div>
              )}
              {/* Live design rationale — visible on unfilled skeletons OR
                  when this filled screen is being redesigned in place.
                  Streamed token-by-token from the backend so the user sees
                  what's being designed rather than a frozen shimmer. */}
              {((!nodeData._filled && nodeData._thinking) || (nodeData as any)._regenerating) && (
                <div style={{
                  position: 'absolute',
                  left: 16, right: 16,
                  bottom: 16,
                  zIndex: 5,
                  padding: '14px 18px',
                  background: 'rgba(10,10,10,0.82)',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(229,166,48,0.18)',
                  borderRadius: 10,
                  pointerEvents: 'none',
                  maxHeight: '40%',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    fontSize: 10,
                    fontWeight: 500,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: 'rgba(229,166,48,0.8)',
                    marginBottom: 10,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}>
                    <span style={{
                      display: 'inline-block', width: 6, height: 6, borderRadius: 999,
                      background: 'rgba(229,166,48,0.9)',
                      animation: 'pulse 1.2s ease-in-out infinite',
                    }} />
                    {(nodeData as any)._regenerating ? 'Redesigning' : 'Designing'} · {label}
                  </div>
                  <div style={{
                    fontFamily: '"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif',
                    fontSize: 13,
                    lineHeight: 1.5,
                    color: 'rgba(255,255,255,0.78)',
                    fontStyle: 'italic',
                  }}>
                    {nodeData._thinking || ((nodeData as any)._regenerating ? 'Picking a fresh layout that stays consistent with the rest of the app…' : '')}
                    <span style={{
                      display: 'inline-block',
                      width: 6, height: 17,
                      marginLeft: 3,
                      verticalAlign: 'text-bottom',
                      background: 'rgba(229,166,48,0.7)',
                      animation: 'caret 0.9s steps(1) infinite',
                    }} />
                  </div>
                  <style>{`@keyframes caret { 50% { opacity: 0 } } @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.35 } }`}</style>
                </div>
              )}
              <LiveTokenIframe
                w={w}
                h={h}
                isMobile={isMobile}
                isOverlay={isOverlay}
                fontsLink={fontsLink}
                tokenVars={tokenVars}
                componentCss={componentCss}
                htmlContent={htmlContent || ''}
                label={label}
                loaded={iframeLoaded}
                onLoaded={() => setIframeLoaded(true)}
              />
              {restyling && (
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(0,0,0,0.55)',
                  backdropFilter: 'blur(2px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 10,
                  pointerEvents: 'none',
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 14px',
                    background: 'rgba(0,0,0,0.85)',
                    border: '1px solid rgba(229,166,48,0.4)',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 500,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: 'rgba(229,166,48,0.95)',
                  }}>
                    <span style={{
                      display: 'inline-block', width: 6, height: 6, borderRadius: 999,
                      background: 'rgba(229,166,48,0.9)',
                      animation: 'pulse 1.2s ease-in-out infinite',
                    }} />
                    Restyling · {label}
                  </div>
                  <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.35 } }`}</style>
                </div>
              )}
            </>
          ) : (
            <div style={{ position: 'absolute', inset: 0, paddingTop: isMobile ? 44 : 0, paddingBottom: isMobile ? 24 : 0 }}>
              {renderElements.map((el) => (
                <div
                  key={el.id}
                  style={{
                    position: 'absolute',
                    left: el.x,
                    top: el.y + (isMobile ? 44 : 0),
                    width: el.width,
                    height: el.height,
                    ...getElementStyle(el.type, el.variant),
                  }}
                >
                  <span style={{ fontSize: 11, color: 'var(--muted-foreground)', userSelect: 'none' }}>
                    {el.label || el.placeholder || el.type}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Handle type="target" position={Position.Top} id="top" style={handleStyle} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={handleStyle} />
      <Handle type="target" position={Position.Left} id="left" style={handleStyle} />
      <Handle type="source" position={Position.Right} id="right" style={handleStyle} />
    </div>
  );
}

export const WireScreenNode = memo(WireScreenNodeComponent);
