'use client';

/**
 * Reusable editor primitives for granularity + modifier rows in the Studio.
 * The standalone "Granularities" and "Modifiers" sidebar items were removed
 * in favour of consolidating everything under the Generation page —
 * `generation-presets-panel.tsx` imports these components and renders them
 * inline below the preset cards.
 */

import { Check, Loader2, X } from 'lucide-react';
import {
  MODIFIER_CATEGORIES,
  type GranularityDTO,
  type ModifierCategory,
  type ModifierDTO,
} from '@/lib/api/generation-options';

// ── Drafts ──────────────────────────────────────────────────────────────────

export type GranularityDraft = {
  label: string;
  blurb: string;
  prompt_fragment: string;
  sort_order: number;
};

export type ModifierDraft = {
  label: string;
  blurb: string;
  category: ModifierCategory;
  prompt_fragment: string;
  sort_order: number;
};

export function granularityToDraft(g: GranularityDTO): GranularityDraft {
  return {
    label: g.label,
    blurb: g.blurb ?? '',
    prompt_fragment: g.prompt_fragment,
    sort_order: g.sort_order,
  };
}

export function modifierToDraft(m: ModifierDTO): ModifierDraft {
  return {
    label: m.label,
    blurb: m.blurb ?? '',
    category: m.category,
    prompt_fragment: m.prompt_fragment,
    sort_order: m.sort_order,
  };
}

// ── Editors ─────────────────────────────────────────────────────────────────

export function GranularityEditor({
  draft,
  onChange,
  onSave,
  onCancel,
  saving,
  isSystem,
  titleHint,
}: {
  draft: GranularityDraft;
  onChange: (d: GranularityDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  isSystem: boolean;
  titleHint: string;
}) {
  const invalid = draft.label.trim().length === 0;
  return (
    <div className="rounded-lg border border-primary/40 bg-card/60 p-5 space-y-4">
      <EditorHeader
        title={titleHint || 'Untitled'}
        isSystem={isSystem}
        saving={saving}
        invalid={invalid}
        onSave={onSave}
        onCancel={onCancel}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <LabeledInput
          label="Label"
          value={draft.label}
          onChange={(v) => onChange({ ...draft, label: v })}
          maxLength={64}
          placeholder="e.g. Epic-and-children"
        />
        <LabeledNumber
          label="Sort order"
          value={draft.sort_order}
          onChange={(v) => onChange({ ...draft, sort_order: v })}
        />
      </div>
      <LabeledInput
        label="Blurb (one line)"
        value={draft.blurb}
        onChange={(v) => onChange({ ...draft, blurb: v })}
        maxLength={300}
        placeholder="What size of backlog this produces."
      />
      <LabeledTextarea
        label="Prompt fragment"
        value={draft.prompt_fragment}
        onChange={(v) => onChange({ ...draft, prompt_fragment: v })}
        maxLength={4000}
        rows={6}
        hint="The text spliced into the wave prompt when this granularity is selected. Empty = no override (balanced behaviour)."
        placeholder={'STYLE GUIDANCE — <name>:\n- Target N tickets total.\n- ...'}
      />
    </div>
  );
}

export function ModifierEditor({
  draft,
  onChange,
  onSave,
  onCancel,
  saving,
  isSystem,
  titleHint,
}: {
  draft: ModifierDraft;
  onChange: (d: ModifierDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  isSystem: boolean;
  titleHint: string;
}) {
  const invalid = draft.label.trim().length === 0;
  return (
    <div className="rounded-lg border border-primary/40 bg-card/60 p-5 space-y-4">
      <EditorHeader
        title={titleHint || 'Untitled'}
        isSystem={isSystem}
        saving={saving}
        invalid={invalid}
        onSave={onSave}
        onCancel={onCancel}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <LabeledInput
          label="Label"
          value={draft.label}
          onChange={(v) => onChange({ ...draft, label: v })}
          maxLength={64}
          placeholder="e.g. Pair-friendly"
        />
        <LabeledNumber
          label="Sort order"
          value={draft.sort_order}
          onChange={(v) => onChange({ ...draft, sort_order: v })}
        />
      </div>
      <div className="space-y-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
          Category
        </span>
        <div className="flex flex-wrap gap-1.5">
          {MODIFIER_CATEGORIES.map((cat) => {
            const selected = draft.category === cat.key;
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => onChange({ ...draft, category: cat.key })}
                title={cat.hint}
                className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors ${
                  selected
                    ? 'bg-primary/15 text-primary border-primary/40'
                    : 'bg-background/60 text-foreground/70 border-border hover:text-foreground'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>
      <LabeledInput
        label="Blurb (one line)"
        value={draft.blurb}
        onChange={(v) => onChange({ ...draft, blurb: v })}
        maxLength={300}
        placeholder="What this modifier does, in user terms."
      />
      <LabeledTextarea
        label="Prompt fragment"
        value={draft.prompt_fragment}
        onChange={(v) => onChange({ ...draft, prompt_fragment: v })}
        maxLength={4000}
        rows={6}
        hint="The text the AI sees when this modifier is selected. Stacks with the granularity fragment + other selected modifiers."
        placeholder={'STYLE GUIDANCE — <name>:\n- Specific guidance for the model.\n- ...'}
      />
    </div>
  );
}

// ── Shared form bits ────────────────────────────────────────────────────────

function EditorHeader({
  title,
  isSystem,
  saving,
  invalid,
  onSave,
  onCancel,
}: {
  title: string;
  isSystem: boolean;
  saving: boolean;
  invalid: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-foreground/90">{title}</span>
        {isSystem && (
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
            system
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={onCancel}
          disabled={saving}
          className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
        >
          <X className="h-3 w-3" />
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={saving || invalid}
          className="flex items-center gap-1 px-2.5 py-1 rounded bg-primary text-primary-foreground text-[11px] font-medium hover:bg-primary/85 transition-colors disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          Save
        </button>
      </div>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  maxLength,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        placeholder={placeholder}
        className="w-full px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground focus:outline-none focus:border-primary/60"
      />
    </label>
  );
}

function LabeledNumber({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground focus:outline-none focus:border-primary/60"
      />
    </label>
  );
}

function LabeledTextarea({
  label,
  value,
  onChange,
  maxLength,
  rows,
  hint,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
  rows?: number;
  hint?: string;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{label}</span>
      {hint && <p className="text-[11px] text-muted-foreground/80">{hint}</p>}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        rows={rows ?? 5}
        placeholder={placeholder}
        className="w-full px-2 py-1.5 rounded border border-border bg-background text-xs font-mono text-foreground focus:outline-none focus:border-primary/60 leading-relaxed"
      />
      {maxLength && (
        <p className="text-[10px] text-muted-foreground/60 text-right tabular-nums">
          {value.length} / {maxLength}
        </p>
      )}
    </label>
  );
}
