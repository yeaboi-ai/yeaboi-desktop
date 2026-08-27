"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { HexColorPicker } from "react-colorful";
import { ChevronDown, Check, Copy, Pipette, Trash2, AlertTriangle } from "lucide-react";
import { applyThemeTokens } from "@/lib/theme/apply";
import { contrastRatio, normalizeHex } from "@/lib/theme/contrast";
import { BUILTIN_PRESETS } from "@/lib/theme/presets";
import type { BuiltInPresetId, ColorScheme, TokenMap } from "@/lib/theme/types";

export interface TokenGroup {
  title: string;
  description?: string;
  keys: string[];
}

export const TOKEN_GROUPS: TokenGroup[] = [
  {
    title: "Brand",
    description: "Accent color for buttons, links, and highlights.",
    keys: ["primary", "primary-foreground", "ring"],
  },
  {
    title: "Surfaces",
    description: "Page background, cards, popovers, and secondary fills.",
    keys: [
      "background",
      "foreground",
      "card",
      "card-foreground",
      "popover",
      "popover-foreground",
      "secondary",
      "secondary-foreground",
      "muted",
      "muted-foreground",
      "accent",
      "accent-foreground",
      "border",
      "input",
    ],
  },
  {
    title: "Status",
    description: "Destructive, success, warning, and info colors.",
    keys: [
      "destructive",
      "destructive-foreground",
      "success",
      "success-foreground",
      "warning",
      "warning-foreground",
      "info",
      "info-foreground",
    ],
  },
  {
    title: "Charts",
    description: "Slots used by analytics chart bars and tooltips.",
    keys: [
      "chart-1",
      "chart-2",
      "chart-3",
      "chart-4",
      "chart-5",
      "chart-6",
      "chart-7",
      "chart-8",
      "chart-tooltip-bg",
      "chart-tooltip-fg",
    ],
  },
  {
    title: "Canvas",
    description: "Diagram canvas — nodes, selected edges, handles.",
    keys: [
      "canvas-bg",
      "canvas-node-bg",
      "canvas-node-fg",
      "canvas-edge-selected",
      "canvas-handle",
    ],
  },
  {
    title: "Wireframe",
    description: "Fallback design system for the wireframe simulator.",
    keys: ["wireframe-bg", "wireframe-fg", "wireframe-accent"],
  },
  {
    title: "LiveKit",
    description: "Video tile and screenshare backgrounds.",
    keys: ["livekit-tile-bg", "livekit-screen-bg"],
  },
  {
    title: "Misc",
    description: "Scrollbars and text selection.",
    keys: ["scrollbar-thumb", "scrollbar-thumb-hover", "selection-fg"],
  },
];

const HUMAN_LABELS: Record<string, string> = {
  background: "Background",
  foreground: "Foreground (text)",
  card: "Card surface",
  "card-foreground": "Card text",
  popover: "Popover surface",
  "popover-foreground": "Popover text",
  primary: "Primary",
  "primary-foreground": "Text on primary",
  secondary: "Secondary surface",
  "secondary-foreground": "Secondary text",
  muted: "Muted surface",
  "muted-foreground": "Muted text",
  accent: "Accent surface",
  "accent-foreground": "Accent text",
  destructive: "Destructive",
  "destructive-foreground": "Text on destructive",
  success: "Success",
  "success-foreground": "Text on success",
  warning: "Warning",
  "warning-foreground": "Text on warning",
  info: "Info",
  "info-foreground": "Text on info",
  border: "Border",
  input: "Input border",
  ring: "Focus ring",
  "chart-tooltip-bg": "Tooltip background",
  "chart-tooltip-fg": "Tooltip text",
  "canvas-bg": "Canvas background",
  "canvas-node-bg": "Node fill",
  "canvas-node-fg": "Node text",
  "canvas-edge-selected": "Selected edge",
  "canvas-handle": "Connection handle",
  "wireframe-bg": "Wireframe background",
  "wireframe-fg": "Wireframe text",
  "wireframe-accent": "Wireframe accent",
  "livekit-tile-bg": "Camera tile",
  "livekit-screen-bg": "Screenshare backdrop",
  "scrollbar-thumb": "Scrollbar",
  "scrollbar-thumb-hover": "Scrollbar (hover)",
  "selection-fg": "Selected text",
};

const CRITICAL_PAIRS: { fg: string; bg: string; threshold: number }[] = [
  { fg: "foreground", bg: "background", threshold: 4.5 },
  { fg: "primary-foreground", bg: "primary", threshold: 4.5 },
  { fg: "destructive-foreground", bg: "destructive", threshold: 4.5 },
  { fg: "card-foreground", bg: "card", threshold: 4.5 },
  { fg: "muted-foreground", bg: "muted", threshold: 3 },
];

export interface ThemeEditorState {
  name: string;
  color_scheme: ColorScheme;
  tokens: TokenMap;
  base: BuiltInPresetId;
}

interface ThemeEditorProps {
  initialName?: string;
  initialColorScheme?: ColorScheme;
  initialTokens?: TokenMap;
  initialBase?: BuiltInPresetId;
  onChange?: (state: ThemeEditorState) => void;
}

export function ThemeEditor({
  initialName = "My theme",
  initialColorScheme = "dark",
  initialTokens,
  initialBase = "preset:dark",
  onChange,
}: ThemeEditorProps) {
  const [name, setName] = useState(initialName);
  const [colorScheme, setColorScheme] = useState<ColorScheme>(initialColorScheme);
  const [base, setBase] = useState<BuiltInPresetId>(initialBase);
  const [tokens, setTokens] = useState<TokenMap>(
    () => initialTokens ?? { ...BUILTIN_PRESETS[initialBase].tokens },
  );

  // Keep onChange in sync.
  useEffect(() => {
    onChange?.({ name, color_scheme: colorScheme, tokens, base });
  }, [name, colorScheme, tokens, base, onChange]);

  const updateToken = (key: string, value: string) => {
    const normalized = normalizeHex(value) ?? value;
    setTokens((prev) => ({ ...prev, [key]: normalized }));
  };

  const resetFromBase = (next: BuiltInPresetId) => {
    setBase(next);
    setColorScheme(BUILTIN_PRESETS[next].color_scheme);
    setTokens({ ...BUILTIN_PRESETS[next].tokens });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(360px,500px)] gap-6">
      <div className="space-y-6">
        <SectionShell title="Theme info">
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-body text-muted-foreground mb-1">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded border border-border bg-background text-foreground text-xs font-body focus:outline-none focus:border-primary"
                maxLength={100}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-body text-muted-foreground mb-1">
                  Color scheme
                </label>
                <div className="flex border border-border rounded overflow-hidden">
                  {(["light", "dark"] as ColorScheme[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setColorScheme(s)}
                      className={`flex-1 px-3 py-2 text-[11px] font-body capitalize transition-colors ${
                        colorScheme === s
                          ? "bg-primary text-primary-foreground"
                          : "bg-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-body text-muted-foreground mb-1">
                  Reset from preset
                </label>
                <select
                  value={base}
                  onChange={(e) => resetFromBase(e.target.value as BuiltInPresetId)}
                  className="w-full px-3 py-2 rounded border border-border bg-background text-foreground text-xs font-body"
                >
                  {Object.entries(BUILTIN_PRESETS).map(([id, doc]) => (
                    <option key={id} value={id}>
                      {doc.name} ({doc.color_scheme})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-[10px] font-body text-muted-foreground/70">
              Reset replaces every color with the chosen preset's palette. Edits below override
              individual tokens; rgba/shadow tokens are inherited from the base.
            </p>
          </div>
        </SectionShell>

        <ContrastWarnings tokens={tokens} />

        {TOKEN_GROUPS.map((group) => (
          <TokenGroupCard
            key={group.title}
            group={group}
            tokens={tokens}
            onChange={updateToken}
          />
        ))}
      </div>

      <ThemePreview tokens={tokens} colorScheme={colorScheme} />
    </div>
  );
}

function SectionShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-border rounded-lg bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border">
        <h3 className="text-xs font-body font-semibold text-foreground tracking-wide">
          {title}
        </h3>
      </div>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

function TokenGroupCard({
  group,
  tokens,
  onChange,
}: {
  group: TokenGroup;
  tokens: TokenMap;
  onChange: (key: string, value: string) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section className="border border-border rounded-lg bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-5 py-3 border-b border-border flex items-center justify-between text-left"
      >
        <div>
          <h3 className="text-xs font-body font-semibold text-foreground tracking-wide">
            {group.title}
          </h3>
          {group.description && (
            <p className="text-[11px] text-muted-foreground/80 font-body mt-0.5">
              {group.description}
            </p>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="px-5 py-5 space-y-2">
          {group.keys.map((key) => (
            <TokenRow
              key={key}
              tokenKey={key}
              value={tokens[key] ?? "#000000"}
              onChange={(v) => onChange(key, v)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function TokenRow({
  tokenKey,
  value,
  onChange,
}: {
  tokenKey: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Keep draft in sync when value changes externally (e.g. base reset).
  useEffect(() => setDraft(value), [value]);

  // Close popover on outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const commitDraft = () => {
    const norm = normalizeHex(draft);
    if (norm) onChange(norm);
    else setDraft(value); // revert on invalid input
  };

  return (
    <div ref={wrapRef} className="relative flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-body text-foreground truncate">
          {HUMAN_LABELS[tokenKey] ?? tokenKey}
        </p>
        <p className="text-[9px] font-body text-muted-foreground/60 font-mono truncate">
          --{tokenKey}
        </p>
      </div>
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitDraft}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
        className="w-24 px-2 py-1 rounded border border-border bg-background text-foreground text-[11px] font-mono focus:outline-none focus:border-primary"
        maxLength={9}
        spellCheck={false}
      />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Pick color for ${tokenKey}`}
        className="w-7 h-7 rounded border border-border shrink-0 hover:scale-105 transition-transform"
        style={{ background: value }}
      />
      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 p-3 rounded-lg border border-border bg-popover shadow-xl">
          <HexColorPicker
            color={normalizeHex(value) ?? "#000000"}
            onChange={(c) => {
              setDraft(c);
              onChange(c);
            }}
          />
        </div>
      )}
    </div>
  );
}

function ContrastWarnings({ tokens }: { tokens: TokenMap }) {
  const warnings = useMemo(() => {
    const out: { fg: string; bg: string; ratio: number; threshold: number }[] = [];
    for (const { fg, bg, threshold } of CRITICAL_PAIRS) {
      const fgVal = tokens[fg];
      const bgVal = tokens[bg];
      if (!fgVal || !bgVal) continue;
      const ratio = contrastRatio(fgVal, bgVal);
      if (ratio === null) continue;
      if (ratio < threshold) {
        out.push({ fg, bg, ratio, threshold });
      }
    }
    return out;
  }, [tokens]);
  if (warnings.length === 0) return null;
  return (
    <section className="border border-warning/40 bg-warning/8 rounded-lg overflow-hidden">
      <div className="px-5 py-3 border-b border-warning/40 flex items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5 text-warning" />
        <h3 className="text-xs font-body font-semibold text-warning tracking-wide">
          Low contrast warnings
        </h3>
      </div>
      <div className="px-5 py-3 space-y-2">
        {warnings.map((w) => (
          <p key={`${w.fg}|${w.bg}`} className="text-[11px] font-body text-foreground">
            <span className="font-mono text-muted-foreground">{w.fg}</span> on{" "}
            <span className="font-mono text-muted-foreground">{w.bg}</span> is{" "}
            <span className="text-warning font-semibold">{w.ratio.toFixed(1)}:1</span> —
            below the {w.threshold} target. Text may be hard to read.
          </p>
        ))}
      </div>
    </section>
  );
}

function ThemePreview({
  tokens,
  colorScheme,
}: {
  tokens: TokenMap;
  colorScheme: ColorScheme;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    applyThemeTokens(ref.current, tokens);
    ref.current.dataset.colorScheme = colorScheme;
  }, [tokens, colorScheme]);

  return (
    <aside className="lg:sticky lg:top-6 self-start">
      <div className="border border-border rounded-lg bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h3 className="text-xs font-body font-semibold text-foreground tracking-wide">
            Live preview
          </h3>
          <p className="text-[10px] font-body text-muted-foreground/70 mt-0.5">
            Tokens applied to this scope only.
          </p>
        </div>
        <div
          ref={ref}
          className="p-5 space-y-5"
          style={{
            background: tokens["background"],
            color: tokens["foreground"],
          }}
        >
          {/* Header card with primary CTA */}
          <div
            className="rounded-lg p-4 border"
            style={{
              background: tokens["card"],
              borderColor: tokens["border"],
              color: tokens["card-foreground"],
            }}
          >
            <p
              className="font-display italic text-2xl mb-1 leading-none"
              style={{ color: tokens["foreground"] }}
            >
              Project overview
            </p>
            <p className="text-[11px] font-body mb-3" style={{ color: tokens["muted-foreground"] }}>
              7 active sessions · 23 cards
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="px-3 py-1.5 rounded text-[11px] font-body"
                style={{
                  background: tokens["primary"],
                  color: tokens["primary-foreground"],
                }}
              >
                New session
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded text-[11px] font-body border"
                style={{
                  borderColor: tokens["border"],
                  color: tokens["foreground"],
                }}
              >
                Browse
              </button>
            </div>
          </div>

          {/* Status badges */}
          <div className="flex flex-wrap gap-2">
            <Badge bg={tokens["success"]} fg={tokens["success-foreground"]} label="Done" />
            <Badge bg={tokens["warning"]} fg={tokens["warning-foreground"]} label="In review" />
            <Badge bg={tokens["destructive"]} fg={tokens["destructive-foreground"]} label="Blocked" />
            <Badge bg={tokens["info"]} fg={tokens["info-foreground"]} label="In progress" />
          </div>

          {/* Mini chart */}
          <div
            className="rounded-lg p-4 border"
            style={{
              background: tokens["card"],
              borderColor: tokens["border"],
            }}
          >
            <p className="text-[11px] font-body mb-3" style={{ color: tokens["muted-foreground"] }}>
              Sessions per week
            </p>
            <div className="flex items-end gap-1.5 h-20">
              {[40, 65, 32, 78, 55, 90, 70].map((h, i) => {
                const c = tokens[`chart-${(i % 8) + 1}`] ?? tokens["primary"];
                return (
                  <div
                    key={i}
                    className="flex-1 rounded-t-sm"
                    style={{ background: c, height: `${h}%`, opacity: 0.85 }}
                  />
                );
              })}
            </div>
          </div>

          {/* Canvas mini */}
          <div
            className="rounded-lg p-4 border relative h-28 overflow-hidden"
            style={{
              background: tokens["canvas-bg"],
              borderColor: tokens["border"],
            }}
          >
            <p className="text-[10px] font-body absolute top-2 left-3" style={{ color: tokens["muted-foreground"] }}>
              Canvas
            </p>
            <svg viewBox="0 0 200 80" className="w-full h-full" preserveAspectRatio="none">
              <rect
                x="10"
                y="20"
                width="50"
                height="30"
                rx="4"
                fill={tokens["canvas-node-bg"]}
                stroke={tokens["border"]}
              />
              <rect
                x="140"
                y="20"
                width="50"
                height="30"
                rx="4"
                fill={tokens["canvas-node-bg"]}
                stroke={tokens["border"]}
              />
              <path
                d="M 60 35 Q 100 35 140 35"
                stroke={tokens["canvas-edge-selected"]}
                strokeWidth="2"
                fill="none"
              />
              <circle cx="60" cy="35" r="3" fill={tokens["canvas-handle"]} />
              <circle cx="140" cy="35" r="3" fill={tokens["canvas-handle"]} />
            </svg>
          </div>

          {/* Body text sample */}
          <div className="text-[11px] font-body leading-relaxed" style={{ color: tokens["muted-foreground"] }}>
            <p style={{ color: tokens["foreground"] }} className="mb-1 font-medium">
              Body sample
            </p>
            The team aligned on three goals for the quarter, with a primary focus on shipping
            <span style={{ color: tokens["primary"] }}> the new planning canvas</span> by end of
            month.
          </div>
        </div>
      </div>
    </aside>
  );
}

function Badge({ bg, fg, label }: { bg: string; fg: string; label: string }) {
  return (
    <span
      className="px-2 py-0.5 rounded-full text-[10px] font-body font-medium"
      style={{ background: bg, color: fg }}
    >
      {label}
    </span>
  );
}

// Re-export icons for the parent page.
export { Pipette, Trash2, Copy, Check };
