'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  HelpCircle,
  Layers,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { useAuthFetch } from '@/hooks/use-auth-fetch';
import { useDismissOnOutside } from '@/hooks/use-dismiss-on-outside';
import {
  BUILTIN_PRESETS,
  createPreset,
  deletePreset,
  fetchOrgPresets,
  ICON_BY_NAME,
  ICON_NAMES,
  patchPreset,
  resetPreset,
  type PresetDTO,
} from '@/lib/api/generation-presets';
import {
  BUILTIN_GRANULARITIES,
  BUILTIN_MODIFIERS,
  createGranularity,
  createModifier,
  deleteGranularity,
  deleteModifier,
  fetchOrgGranularities,
  fetchOrgModifiers,
  MODIFIER_CATEGORIES,
  patchGranularity,
  patchModifier,
  resetGranularity,
  resetModifier,
  type GranularityDTO,
  type ModifierCategory,
  type ModifierDTO,
} from '@/lib/api/generation-options';
import {
  granularityToDraft,
  modifierToDraft,
  type GranularityDraft,
  type ModifierDraft,
} from './generation-options-panel';

// Static label lookup kept tiny for the read-only preset summary line
// ("Balanced · 3 modifiers"). The Generation page itself reads the live
// editable lists from the API.
const GRANULARITY_OPTIONS: ReadonlyArray<{ slug: string; label: string }> = [
  { slug: 'balanced', label: 'Balanced' },
  { slug: 'minimal', label: 'Minimal' },
  { slug: 'many_small', label: 'Many small' },
];

// ────────────────────────────────────────────────────────────────────────────
// Main panel: presets + granularities + modifiers in one page
// ────────────────────────────────────────────────────────────────────────────

type PresetDraft = {
  label: string;
  blurb: string;
  icon: string;
  granularity: string;
  modifiers: string[];
  sort_order: number;
};

function presetToDraft(p: PresetDTO): PresetDraft {
  return {
    label: p.label,
    blurb: p.blurb ?? '',
    icon: p.icon,
    granularity: p.granularity,
    modifiers: [...p.modifiers],
    sort_order: p.sort_order,
  };
}

type EditState = { kind: 'none' } | { kind: 'preset'; id: string | null; draft: PresetDraft };

export function GenerationPresetsPanel() {
  const { authFetch } = useAuthFetch();

  const [presets, setPresets] = useState<PresetDTO[]>([...BUILTIN_PRESETS]);
  const [granularities, setGranularities] = useState<GranularityDTO[]>([...BUILTIN_GRANULARITIES]);
  const [modifiers, setModifiers] = useState<ModifierDTO[]>([...BUILTIN_MODIFIERS]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Single edit slot across the whole page — opening one editor closes any other.
  const [edit, setEdit] = useState<EditState>({ kind: 'none' });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [presetsData, gransData, modsData] = await Promise.all([
        fetchOrgPresets(authFetch),
        fetchOrgGranularities(authFetch),
        fetchOrgModifiers(authFetch),
      ]);
      setPresets(presetsData);
      setGranularities(gransData);
      setModifiers(modsData);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const cancel = () => setEdit({ kind: 'none' });

  const runWithSpinner = async (fn: () => Promise<unknown>) => {
    setSaving(true);
    setError(null);
    try {
      await fn();
      await fetchAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  // ── Preset handlers ──
  const startEditPreset = (p: PresetDTO) =>
    setEdit({ kind: 'preset', id: p.id, draft: presetToDraft(p) });
  const startCreatePreset = () =>
    setEdit({
      kind: 'preset',
      id: null,
      draft: {
        label: '',
        blurb: '',
        icon: 'Layers',
        granularity: 'balanced',
        modifiers: [],
        sort_order: presets.length,
      },
    });
  const savePreset = async () => {
    if (edit.kind !== 'preset') return;
    const body = {
      label: edit.draft.label,
      blurb: edit.draft.blurb || null,
      icon: edit.draft.icon,
      granularity: edit.draft.granularity,
      modifiers: edit.draft.modifiers,
      sort_order: edit.draft.sort_order,
    };
    await runWithSpinner(async () => {
      if (edit.id) {
        await patchPreset(authFetch, edit.id, body);
      } else {
        await createPreset(authFetch, body);
      }
      cancel();
    });
  };

  // Granularity + modifier CRUD is now handled inline inside the preset
  // editor's chip popovers (ManagedOptionChip). The preset editor calls
  // `fetchAll` whenever a chip-level save/reset/delete completes so the
  // chip list reflects the latest data.

  return (
    <div className="space-y-10">
      <header>
        <h2 className="text-lg font-semibold text-foreground/90">Generation</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The presets, granularities, and modifiers the wizard shows when generating tickets. Edit
          any system option, add custom ones, or reorder. Per-project defaults still override.
        </p>
      </header>

      {error && (
        <div className="rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {loading && presets.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* ── PRESETS ──────────────────────────────────────────────── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-medium text-foreground/90">Presets</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Named bundles (granularity + modifiers) shown as cards in the wizard.
                </p>
              </div>
              <button
                type="button"
                onClick={startCreatePreset}
                disabled={saving || edit.kind !== 'none'}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium text-foreground/70 border border-border hover:text-foreground hover:border-border/80 transition-colors disabled:opacity-40"
              >
                <Plus className="h-3 w-3" />
                New preset
              </button>
            </div>
            <div className="space-y-2.5">
              {edit.kind === 'preset' && edit.id === null && (
                <PresetEditorCard
                  draft={edit.draft}
                  onChange={(d) => setEdit({ ...edit, draft: d })}
                  onSave={savePreset}
                  onCancel={cancel}
                  saving={saving}
                  isSystem={false}
                  titleHint="New preset"
                  granularities={granularities}
                  modifiers={modifiers}
                  onOptionsChanged={fetchAll}
                />
              )}
              {presets.map((preset) => {
                if (edit.kind === 'preset' && edit.id === preset.id) {
                  return (
                    <PresetEditorCard
                      key={preset.id}
                      draft={edit.draft}
                      onChange={(d) => setEdit({ ...edit, draft: d })}
                      onSave={savePreset}
                      onCancel={cancel}
                      saving={saving}
                      isSystem={preset.is_system}
                      titleHint={preset.label}
                      granularities={granularities}
                      modifiers={modifiers}
                      onOptionsChanged={fetchAll}
                    />
                  );
                }
                return (
                  <PresetRow
                    key={preset.id}
                    preset={preset}
                    onEdit={() => startEditPreset(preset)}
                    onReset={() =>
                      runWithSpinner(async () => {
                        if (!confirm(`Reset "${preset.label}" to built-in defaults?`)) return;
                        await resetPreset(authFetch, preset.id);
                      })
                    }
                    onDelete={() =>
                      runWithSpinner(async () => {
                        if (!confirm(`Delete "${preset.label}" preset?`)) return;
                        await deletePreset(authFetch, preset.id);
                      })
                    }
                    disabled={saving || edit.kind !== 'none'}
                  />
                );
              })}
            </div>
          </section>

          {/* Granularities + Modifiers used to be standalone sections here.
              They were absorbed into the preset editor's chip popovers so
              admins can tweak/add options inline while building a preset
              without leaving the card. See ManagedOptionChip below. */}
        </>
      )}
    </div>
  );
}

// ── OptionChip + NewChip + InlineRowActions ────────────────────────────────

// ── ManagedOptionChip + NewManagedOptionChip ──────────────────────────────
// Compact chips used inside the preset editor's Granularity + Modifier rows.
// Click the chip body to toggle preset selection. Click the ? icon to open
// an inline popover that lets you VIEW (label + blurb + prompt fragment)
// AND EDIT (with Save / Reset / Delete) the underlying option WITHOUT
// leaving the preset editor. The "+ New" variant opens the popover in edit
// mode with empty fields and, on save, auto-selects the new option in the
// current preset draft.

type ManagedVariant = 'granularity' | 'modifier';

function isGranularityOption(opt: GranularityDTO | ModifierDTO): opt is GranularityDTO {
  return !('category' in opt);
}

function ManagedOptionChip({
  variant,
  option,
  isSelected,
  onToggle,
  onChanged,
  disabled,
}: {
  variant: ManagedVariant;
  option: GranularityDTO | ModifierDTO;
  isSelected: boolean;
  onToggle: () => void;
  onChanged: () => Promise<void> | void;
  disabled?: boolean;
}) {
  const { authFetch } = useAuthFetch();
  const [popover, setPopover] = useState<null | 'read' | 'edit'>(null);
  const [draft, setDraft] = useState<GranularityDraft | ModifierDraft>(() =>
    variant === 'granularity'
      ? granularityToDraft(option as GranularityDTO)
      : modifierToDraft(option as ModifierDTO),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openHelp = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    // Re-seed draft from current option each time we open the popover so
    // edits made elsewhere in the session don't get stomped.
    setDraft(
      variant === 'granularity'
        ? granularityToDraft(option as GranularityDTO)
        : modifierToDraft(option as ModifierDTO),
    );
    setError(null);
    setPopover((p) => (p ? null : 'read'));
  };

  const close = () => {
    setPopover(null);
    setError(null);
  };

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await onChanged();
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      if (variant === 'granularity') {
        const d = draft as GranularityDraft;
        await patchGranularity(authFetch, option.id, {
          label: d.label,
          blurb: d.blurb || null,
          prompt_fragment: d.prompt_fragment,
          sort_order: d.sort_order,
        });
      } else {
        const d = draft as ModifierDraft;
        await patchModifier(authFetch, option.id, {
          label: d.label,
          blurb: d.blurb || null,
          category: d.category,
          prompt_fragment: d.prompt_fragment,
          sort_order: d.sort_order,
        });
      }
    });

  const reset = () =>
    run(async () => {
      if (!confirm(`Reset "${option.label}" to built-in defaults?`)) throw new Error('cancelled');
      if (variant === 'granularity') {
        await resetGranularity(authFetch, option.id);
      } else {
        await resetModifier(authFetch, option.id);
      }
    });

  const remove = () =>
    run(async () => {
      if (!confirm(`Delete "${option.label}"?`)) throw new Error('cancelled');
      if (variant === 'granularity') {
        await deleteGranularity(authFetch, option.id);
      } else {
        await deleteModifier(authFetch, option.id);
      }
    });

  // Show the ? affordance on hover/focus so the default chip stays clean.
  // While the popover is open we keep it visible so the user can see what
  // they're interacting with — the `popoverOpen` flag overrides the hover
  // transition.
  const popoverOpen = popover !== null;

  // Click-outside + ESC dismissal so the popover (and the always-visible
  // `?` highlight) collapse when the user moves on.
  const wrapperRef = useRef<HTMLDivElement>(null);
  useDismissOnOutside(wrapperRef, popoverOpen, close);

  return (
    <div ref={wrapperRef} className="relative">
      <div
        className={`group inline-flex items-stretch rounded border transition-colors ${
          isSelected
            ? 'bg-primary/15 text-primary border-primary/40'
            : 'bg-background/60 text-foreground/80 border-border hover:text-foreground hover:border-border/80'
        } ${disabled ? 'opacity-40' : ''}`}
      >
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          className="pl-2.5 pr-2 py-1 text-[11px] font-medium disabled:cursor-not-allowed"
        >
          {option.label}
        </button>
        <button
          type="button"
          onClick={openHelp}
          disabled={disabled}
          aria-label={`Details for ${option.label}`}
          className={`flex items-center px-1 border-l border-border/60 text-muted-foreground/60 hover:text-foreground hover:bg-card/60 transition-opacity disabled:cursor-not-allowed ${
            popoverOpen
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100 focus:opacity-100 focus-visible:opacity-100'
          }`}
        >
          <HelpCircle className="h-3 w-3" />
        </button>
      </div>

      {popover && (
        <div
          className="absolute z-30 top-7 left-0 w-96 max-h-[28rem] overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground p-3 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          {popover === 'read' ? (
            <ReadView
              option={option}
              onEdit={() => setPopover('edit')}
              onClose={close}
              onReset={option.is_system ? reset : undefined}
              onDelete={option.is_system ? undefined : remove}
              busy={busy}
            />
          ) : (
            <EditView
              variant={variant}
              draft={draft}
              onChange={setDraft}
              onSave={save}
              onCancel={close}
              busy={busy}
              isSystem={option.is_system}
            />
          )}
          {error && <p className="mt-2 text-[10px] text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}

function NewManagedOptionChip({
  variant,
  label,
  defaultCategory,
  onChanged,
  onCreated,
  disabled,
}: {
  variant: ManagedVariant;
  label: string;
  defaultCategory?: ModifierCategory;
  onChanged: () => Promise<void> | void;
  /** Called with the new option's slug after a successful create — the
   * parent uses it to auto-select the new option in the current preset draft. */
  onCreated: (slug: string) => void;
  disabled?: boolean;
}) {
  const { authFetch } = useAuthFetch();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<GranularityDraft | ModifierDraft>(() =>
    variant === 'granularity'
      ? { label: '', blurb: '', prompt_fragment: '', sort_order: 0 }
      : {
          label: '',
          blurb: '',
          category: defaultCategory ?? 'shape',
          prompt_fragment: '',
          sort_order: 0,
        },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = () => {
    setDraft(
      variant === 'granularity'
        ? { label: '', blurb: '', prompt_fragment: '', sort_order: 0 }
        : {
            label: '',
            blurb: '',
            category: defaultCategory ?? 'shape',
            prompt_fragment: '',
            sort_order: 0,
          },
    );
    setError(null);
    setOpen(true);
  };

  // Same click-outside + ESC dismissal as ManagedOptionChip — drop the
  // popover when the user moves on without saving.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dismiss = useCallback(() => setOpen(false), []);
  useDismissOnOutside(wrapperRef, open, dismiss);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (variant === 'granularity') {
        const d = draft as GranularityDraft;
        const created = await createGranularity(authFetch, {
          label: d.label,
          blurb: d.blurb || null,
          prompt_fragment: d.prompt_fragment,
          sort_order: d.sort_order,
        });
        await onChanged();
        onCreated(created.slug);
      } else {
        const d = draft as ModifierDraft;
        const created = await createModifier(authFetch, {
          label: d.label,
          blurb: d.blurb || null,
          category: d.category,
          prompt_fragment: d.prompt_fragment,
          sort_order: d.sort_order,
        });
        await onChanged();
        onCreated(created.slug);
      }
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={start}
        disabled={disabled}
        className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-muted-foreground border border-dashed border-border hover:text-foreground hover:border-border/80 transition-colors disabled:opacity-40"
      >
        <Plus className="h-3 w-3" />
        {label}
      </button>
      {open && (
        <div
          className="absolute z-30 top-7 left-0 w-96 max-h-[28rem] overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground p-3 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <EditView
            variant={variant}
            draft={draft}
            onChange={setDraft}
            onSave={save}
            onCancel={() => setOpen(false)}
            busy={busy}
            isSystem={false}
            titleHint={
              variant === 'granularity'
                ? 'New granularity'
                : `New ${defaultCategory ?? 'shape'} modifier`
            }
            lockedCategory={defaultCategory}
          />
          {error && <p className="mt-2 text-[10px] text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}

/** Read-only view shown when the chip's popover first opens. Shows blurb +
 * prompt fragment + a footer row with Edit + Reset/Delete + Close. */
function ReadView({
  option,
  onEdit,
  onClose,
  onReset,
  onDelete,
  busy,
}: {
  option: GranularityDTO | ModifierDTO;
  onEdit: () => void;
  onClose: () => void;
  onReset?: () => void;
  onDelete?: () => void;
  busy: boolean;
}) {
  return (
    <>
      <div className="flex items-center justify-between mb-1.5 gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[11px] font-medium text-foreground/90 truncate">
            {option.label}
          </span>
          <span className="text-[9px] text-muted-foreground/70 font-mono truncate">
            {option.slug}
          </span>
          {isGranularityOption(option) ? null : (
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground/70">
              {(option as ModifierDTO).category}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground/60 hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      {option.blurb && (
        <p className="text-[11px] text-muted-foreground leading-relaxed mb-2">{option.blurb}</p>
      )}
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1">
        What the AI sees
      </div>
      <pre className="text-[10px] text-foreground/80 whitespace-pre-wrap leading-relaxed font-mono bg-background/60 rounded p-2 border border-border/60 mb-3">
        {option.prompt_fragment || '(no prompt guidance — has no effect on its own)'}
      </pre>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onEdit}
          disabled={busy}
          className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/85 transition-colors disabled:opacity-40"
        >
          <Pencil className="h-3 w-3" />
          Edit
        </button>
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            disabled={busy}
            title="Restore to built-in defaults"
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-foreground/60 hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-40"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-destructive/80 hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
          >
            <Trash2 className="h-3 w-3" />
            Delete
          </button>
        )}
      </div>
    </>
  );
}

/** Editable form view rendered inside the chip popover. Compact version of
 * the GranularityEditor / ModifierEditor — uses raw inputs instead of the
 * full-card layout so it fits in a 384px popover. */
function EditView({
  variant,
  draft,
  onChange,
  onSave,
  onCancel,
  busy,
  isSystem,
  titleHint,
  lockedCategory,
}: {
  variant: ManagedVariant;
  draft: GranularityDraft | ModifierDraft;
  onChange: (d: GranularityDraft | ModifierDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
  isSystem: boolean;
  titleHint?: string;
  /** When set (the user clicked "+ Add" inside a specific modifier category
   * row), the category is already determined and the picker is hidden — no
   * point asking the user a question whose answer is implied by where they
   * clicked. */
  lockedCategory?: ModifierCategory;
}) {
  const invalid = draft.label.trim().length === 0;
  return (
    <>
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[11px] font-medium text-foreground/90 truncate">
            {titleHint ??
              (isSystem
                ? `Editing: ${draft.label || 'system option'}`
                : `Editing: ${draft.label || 'option'}`)}
          </span>
          {isSystem && (
            <span className="text-[9px] uppercase tracking-wider px-1 py-0.5 rounded bg-muted text-muted-foreground border border-border">
              sys
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="text-muted-foreground/60 hover:text-foreground"
            aria-label="Cancel"
          >
            <X className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={busy || invalid}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-primary text-primary-foreground text-[11px] font-medium hover:bg-primary/85 transition-colors disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Save
          </button>
        </div>
      </div>
      <label className="block space-y-1 mb-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Label</span>
        <input
          type="text"
          value={draft.label}
          onChange={(e) => onChange({ ...draft, label: e.target.value })}
          maxLength={64}
          className="w-full px-2 py-1 rounded border border-border bg-background text-xs text-foreground focus:outline-none focus:border-primary/60"
        />
      </label>
      <label className="block space-y-1 mb-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Blurb</span>
        <input
          type="text"
          value={draft.blurb}
          onChange={(e) => onChange({ ...draft, blurb: e.target.value })}
          maxLength={300}
          placeholder="One-line description shown in the wizard."
          className="w-full px-2 py-1 rounded border border-border bg-background text-xs text-foreground focus:outline-none focus:border-primary/60"
        />
      </label>
      {variant === 'modifier' && !lockedCategory && (
        <div className="space-y-1 mb-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
            Category
          </span>
          <div className="flex flex-wrap gap-1">
            {MODIFIER_CATEGORIES.map((cat) => {
              const d = draft as ModifierDraft;
              const selected = d.category === cat.key;
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => onChange({ ...d, category: cat.key })}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
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
      )}
      <label className="block space-y-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
          Prompt fragment{' '}
          <span className="text-muted-foreground/60 normal-case">(what the AI sees)</span>
        </span>
        <textarea
          value={draft.prompt_fragment}
          onChange={(e) => onChange({ ...draft, prompt_fragment: e.target.value })}
          maxLength={4000}
          rows={8}
          placeholder={'STYLE GUIDANCE — <name>:\n- ...'}
          className="w-full px-2 py-1.5 rounded border border-border bg-background text-[10px] font-mono text-foreground focus:outline-none focus:border-primary/60 leading-relaxed"
        />
      </label>
    </>
  );
}

// ── Existing preset editor + row (kept inline; thoroughly used by the
// presets section above) ───────────────────────────────────────────────────

function PresetRow({
  preset,
  onEdit,
  onReset,
  onDelete,
  disabled,
}: {
  preset: PresetDTO;
  onEdit: () => void;
  onReset: () => void;
  onDelete: () => void;
  disabled: boolean;
}) {
  const Icon = ICON_BY_NAME[preset.icon] ?? Layers;
  // Card body is clickable for edit; Reset/Delete are nested action buttons
  // that stopPropagation so they don't also trigger the card's onClick.
  const cardKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onEdit();
    }
  };
  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && onEdit()}
      onKeyDown={cardKeyDown}
      aria-label={`Edit ${preset.label}`}
      className={`rounded-lg border border-border bg-card/40 p-4 flex items-start gap-3 transition-colors ${
        disabled
          ? 'opacity-60 cursor-not-allowed'
          : 'cursor-pointer hover:border-border/80 hover:bg-card/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:border-primary/40'
      }`}
    >
      <Icon className="h-4 w-4 shrink-0 mt-0.5 text-foreground/70" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground/90">{preset.label}</span>
          {preset.is_system && (
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
              system
            </span>
          )}
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
            {GRANULARITY_OPTIONS.find((g) => g.slug === preset.granularity)?.label ??
              preset.granularity}
            {preset.modifiers.length > 0
              ? ` · ${preset.modifiers.length} modifier${preset.modifiers.length === 1 ? '' : 's'}`
              : ' · no modifiers'}
          </span>
        </div>
        {preset.blurb && (
          <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">{preset.blurb}</p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
        {preset.is_system ? (
          <button
            onClick={onReset}
            disabled={disabled}
            title="Restore to built-in defaults"
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-foreground/60 hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-40"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
        ) : (
          <button
            onClick={onDelete}
            disabled={disabled}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-destructive/80 hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
          >
            <Trash2 className="h-3 w-3" />
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

function PresetEditorCard({
  draft,
  onChange,
  onSave,
  onCancel,
  saving,
  isSystem,
  titleHint,
  granularities,
  modifiers,
  onOptionsChanged,
}: {
  draft: PresetDraft;
  onChange: (d: PresetDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  isSystem: boolean;
  titleHint: string;
  // Live org-fetched lists used for the inline chip rows below. ManagedOptionChip
  // calls onOptionsChanged after any save / reset / delete so the parent re-fetches.
  granularities: ReadonlyArray<GranularityDTO>;
  modifiers: ReadonlyArray<ModifierDTO>;
  onOptionsChanged: () => Promise<void> | void;
}) {
  const toggleMod = (slug: string) => {
    const next = draft.modifiers.includes(slug)
      ? draft.modifiers.filter((m) => m !== slug)
      : [...draft.modifiers, slug];
    onChange({ ...draft, modifiers: next });
  };
  const invalid = draft.label.trim().length === 0;
  const DraftIcon = ICON_BY_NAME[draft.icon] ?? Layers;
  return (
    <div className="rounded-lg border border-primary/40 bg-card/60 overflow-hidden">
      {/* ── Sticky header: identity-at-a-glance + save controls ──────── */}
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border/60 bg-card/30">
        <div className="flex items-center gap-2 min-w-0">
          <DraftIcon className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-medium text-foreground/90 truncate">
            {titleHint || 'Untitled'}
          </span>
          {isSystem && (
            <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70 font-medium shrink-0">
              · system
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
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

      {/* ── ZONE 1: Identity ─────────────────────────────────────────── */}
      <ZoneSection name="Identity" hint="What this preset is called and looks like.">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_5rem] gap-3 items-end">
          <FieldLabel label="Label">
            <input
              type="text"
              value={draft.label}
              onChange={(e) => onChange({ ...draft, label: e.target.value })}
              maxLength={64}
              className="w-full px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground focus:outline-none focus:border-primary/60"
              placeholder="e.g. Compliance sweep"
            />
          </FieldLabel>
          <FieldLabel label="Icon">
            <IconPickerButton
              current={draft.icon}
              onChange={(name) => onChange({ ...draft, icon: name })}
            />
          </FieldLabel>
          <FieldLabel label="Order">
            <input
              type="number"
              value={draft.sort_order}
              onChange={(e) => onChange({ ...draft, sort_order: Number(e.target.value) })}
              className="w-full px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground focus:outline-none focus:border-primary/60 tabular-nums"
            />
          </FieldLabel>
        </div>
        <FieldLabel label="Blurb">
          <input
            type="text"
            value={draft.blurb}
            onChange={(e) => onChange({ ...draft, blurb: e.target.value })}
            maxLength={300}
            className="w-full px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground focus:outline-none focus:border-primary/60"
            placeholder="When this preset fits — one line."
          />
        </FieldLabel>
      </ZoneSection>

      {/* ── ZONE 2: Composition ─────────────────────────────────────── */}
      <ZoneSection
        name="Composition"
        hint="The bundle. Click a chip to toggle it in this preset; the ? to inspect or edit the underlying option."
      >
        <SubSection label="Granularity">
          <div className="flex flex-wrap gap-1.5">
            {granularities.map((g) => (
              <ManagedOptionChip
                key={g.id}
                variant="granularity"
                option={g}
                isSelected={draft.granularity === g.slug}
                onToggle={() => onChange({ ...draft, granularity: g.slug })}
                onChanged={onOptionsChanged}
                disabled={saving}
              />
            ))}
            <NewManagedOptionChip
              variant="granularity"
              label="New"
              onChanged={onOptionsChanged}
              onCreated={(newSlug) => onChange({ ...draft, granularity: newSlug })}
              disabled={saving}
            />
          </div>
        </SubSection>

        <SubSection label="Modifiers">
          <div className="space-y-3">
            {MODIFIER_CATEGORIES.map((cat) => {
              const catMods = modifiers.filter((m) => m.category === cat.key);
              return (
                <div key={cat.key} className="flex items-start gap-3">
                  <div className="w-32 shrink-0 pt-1 text-[10px] uppercase tracking-wider text-muted-foreground/60">
                    {cat.label}
                  </div>
                  <div className="flex flex-wrap gap-1.5 flex-1">
                    {catMods.map((m) => (
                      <ManagedOptionChip
                        key={m.id}
                        variant="modifier"
                        option={m}
                        isSelected={draft.modifiers.includes(m.slug)}
                        onToggle={() => toggleMod(m.slug)}
                        onChanged={onOptionsChanged}
                        disabled={saving}
                      />
                    ))}
                    <NewManagedOptionChip
                      variant="modifier"
                      label="Add"
                      defaultCategory={cat.key}
                      onChanged={onOptionsChanged}
                      onCreated={(newSlug) =>
                        onChange({ ...draft, modifiers: [...draft.modifiers, newSlug] })
                      }
                      disabled={saving}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </SubSection>
      </ZoneSection>
    </div>
  );
}

/** Editorial zone heading — sets the rhythm of the editor card. Italic serif
 * to echo the platform's "Studio" wordmark; small hint below in the muted
 * voice so the heading itself doesn't carry the explanation. */
function ZoneSection({
  name,
  hint,
  children,
}: {
  name: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="px-5 py-5 border-b border-border/40 last:border-b-0 space-y-4">
      <header className="flex items-baseline gap-3">
        <h4 className="font-serif italic text-base text-foreground/85">{name}</h4>
        {hint && <p className="text-[11px] text-muted-foreground/80 leading-relaxed">{hint}</p>}
      </header>
      {children}
    </section>
  );
}

/** Sub-section within a zone (Granularity, Modifiers). Smaller, still
 * foreground-coloured so it's visibly distinct from the all-caps field
 * labels above the inputs. */
function SubSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-foreground/80">{label}</div>
      {children}
    </div>
  );
}

/** Tiny uppercase label used directly above an input. Smallest of the three
 * type tiers (zone > sub-section > field). */
function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{label}</span>
      {children}
    </label>
  );
}

/** Single icon-button trigger + popover grid. Collapses the previous 20-icon
 * wrap-grid (which dominated the editor card vertically) into a square
 * button showing the current icon. Click opens the picker; selecting an
 * icon closes it. Click-outside + ESC dismiss. */
function IconPickerButton({
  current,
  onChange,
}: {
  current: string;
  onChange: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const Icon = ICON_BY_NAME[current] ?? Layers;
  const dismiss = useCallback(() => setOpen(false), []);
  useDismissOnOutside(wrapperRef, open, dismiss);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Choose icon"
        aria-expanded={open}
        className={`h-9 w-9 rounded border flex items-center justify-center transition-colors ${
          open
            ? 'border-primary/60 bg-primary/10 text-primary'
            : 'border-border bg-background text-foreground/80 hover:border-border/80 hover:text-foreground'
        }`}
      >
        <Icon className="h-4 w-4" />
      </button>
      {open && (
        <div
          className="absolute z-30 top-10 left-0 w-72 rounded-md border border-border bg-popover text-popover-foreground p-2 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="grid grid-cols-8 gap-1">
            {ICON_NAMES.map((name) => {
              const ItemIcon = ICON_BY_NAME[name];
              const selected = current === name;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    onChange(name);
                    setOpen(false);
                  }}
                  title={name}
                  className={`p-1.5 rounded transition-colors ${
                    selected
                      ? 'bg-primary/15 text-primary'
                      : 'text-foreground/60 hover:text-foreground hover:bg-card/80'
                  }`}
                >
                  <ItemIcon className="h-4 w-4" />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
