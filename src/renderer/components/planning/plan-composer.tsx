'use client';

// The New plan form: one borderless serif field that asks what you are
// building, the world's hairline under it, and beneath that a line saying
// what becomes of the words, joined by Start once there are some. Typing @
// or / opens the reference menu under the field; a pick, a pasted or dropped
// image, or the file picker becomes a chip in the row under the text, and
// Start carries them with the words. The engine's intake reshapes the
// description itself, so there is no rewrite here.

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { DropVeil, filesFrom } from '@/components/feedback/attachment-tray';
import { ReferenceChips, type PendingShot } from '@/components/planning/reference-chips';
import { ReferenceMenu, type ReferenceMenuHandle } from '@/components/planning/reference-menu';
import { loadConnections } from '@/lib/yeaboi/connections';
import { COMPOSER_COPY, composerNote, createErrorMessage } from '@/lib/planning/composer';
import {
  LINK_SOURCE,
  REFERENCE_COPY,
  SCREENSHOT_ACCEPT,
  SCREENSHOT_MAX_COUNT,
  SCREENSHOT_SOURCE,
  referenceSources,
  removeTrigger,
  sameReference,
  screenshotVerdict,
  triggerAt,
  type ProjectReference,
  type ReferenceSource,
  type TriggerHit,
} from '@/lib/yeaboi/references';

/** What Start hands the page: the words, the references, the screenshots. */
export interface PlanDraft {
  description: string;
  references: ProjectReference[];
  files: File[];
}

export interface PlanComposerProps {
  value: string;
  onChange: (value: string) => void;
  onCreate: (draft: PlanDraft) => Promise<{ id: string }>;
  /** The created plan, so the caller can open it. */
  onCreated?: (created: { id: string }) => void;
  /** Take focus on mount: the menu bar's New plan… lands here, and an empty
   *  page has nothing else to offer. */
  autoFocus?: boolean;
  /** The field itself, for a caller that moves words into it. */
  fieldRef?: RefObject<HTMLTextAreaElement | null>;
  /** Drawn between the note and the Start button: the picker, the profile. */
  children?: React.ReactNode;
}

export function PlanComposer({
  value,
  onChange,
  onCreate,
  onCreated,
  autoFocus = false,
  fieldRef,
  children,
}: PlanComposerProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [references, setReferences] = useState<ProjectReference[]>([]);
  const [shots, setShots] = useState<PendingShot[]>([]);
  const [menu, setMenu] = useState<TriggerHit | null>(null);
  const [sources, setSources] = useState<ReferenceSource[]>([LINK_SOURCE, SCREENSHOT_SOURCE]);
  const [dragging, setDragging] = useState(0);
  const ownRef = useRef<HTMLTextAreaElement>(null);
  const field = fieldRef ?? ownRef;
  const wrapper = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const menuRef = useRef<ReferenceMenuHandle>(null);
  // Once the menu has left its first level the field no longer decides
  // whether it is open: the trigger word is gone from the text by then.
  const pinned = useRef(false);
  const shotKey = useRef(0);
  const text = value.trim();
  const attached = references.length > 0 || shots.length > 0;

  useEffect(() => {
    if (autoFocus) field.current?.focus();
  }, [autoFocus, field]);

  useEffect(() => {
    let live = true;
    loadConnections(true).then(
      (payload) => {
        if (live) setSources(referenceSources(payload.connectors));
      },
      () => {
        // No sidecar answer: Link and Screenshot are still on offer.
      },
    );
    return () => {
      live = false;
    };
  }, []);

  // Previews outlive the render that made them; revoked on the unmount
  // through a ref, the way the feedback tray does it.
  const liveShots = useRef<PendingShot[]>([]);
  useEffect(() => {
    liveShots.current = shots;
  }, [shots]);
  useEffect(() => {
    return () => {
      for (const shot of liveShots.current) URL.revokeObjectURL(shot.preview);
    };
  }, []);

  const acceptFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      setError(null);
      let room = SCREENSHOT_MAX_COUNT - shots.length;
      const next: PendingShot[] = [];
      for (const file of files) {
        if (room <= 0) {
          setError(REFERENCE_COPY.TOO_MANY_SHOTS);
          break;
        }
        const verdict = screenshotVerdict(file);
        if ('refusal' in verdict) {
          setError(verdict.refusal);
          continue;
        }
        room -= 1;
        next.push({ key: `shot-${shotKey.current++}`, file, preview: URL.createObjectURL(file) });
      }
      if (next.length) setShots((current) => [...current, ...next]);
    },
    [shots.length],
  );

  const removeShot = (key: string) =>
    setShots((current) => {
      const going = current.find((shot) => shot.key === key);
      if (going) URL.revokeObjectURL(going.preview);
      return current.filter((shot) => shot.key !== key);
    });

  const syncMenu = (el: HTMLTextAreaElement) => {
    if (pinned.current) return;
    setMenu(triggerAt(el.value, el.selectionStart ?? el.value.length));
  };

  const closeMenu = useCallback(() => {
    pinned.current = false;
    setMenu(null);
    setTimeout(() => field.current?.focus(), 0);
  }, [field]);

  // The trigger word leaves the text as soon as the menu moves past its
  // first level, and the caret lands where it was.
  const leaveTrigger = useCallback(() => {
    const el = field.current;
    if (!el || !menu || pinned.current) return;
    pinned.current = true;
    const { text: next, caret } = removeTrigger(
      el.value,
      menu,
      el.selectionStart ?? el.value.length,
    );
    onChange(next);
    setTimeout(() => el.setSelectionRange(caret, caret), 0);
  }, [field, menu, onChange]);

  const pickReference = useCallback((reference: ProjectReference) => {
    setReferences((current) =>
      current.some((row) => sameReference(row, reference)) ? current : [...current, reference],
    );
  }, []);

  const openScreenshots = useCallback(() => fileInput.current?.click(), []);

  const hasFiles = (transfer: DataTransfer | null) => transfer?.types.includes('Files') ?? false;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text || loading) return;
    setLoading(true);
    setError(null);
    try {
      const created = await onCreate({
        description: text,
        references,
        files: shots.map((shot) => shot.file),
      });
      onChange('');
      setReferences([]);
      for (const shot of shots) URL.revokeObjectURL(shot.preview);
      setShots([]);
      onCreated?.(created);
    } catch (err) {
      setError(createErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const note = composerNote(Boolean(text), attached, REFERENCE_COPY.COMPOSER_HINT);

  return (
    <form onSubmit={handleSubmit} aria-label="New plan">
      <div
        ref={wrapper}
        data-audience-accented
        className="relative pb-2"
        style={{ borderBottom: '1px solid var(--audience-accent)' }}
        onDragEnter={(e) => {
          if (!hasFiles(e.dataTransfer)) return;
          e.preventDefault();
          setDragging((n) => n + 1);
        }}
        onDragOver={(e) => {
          if (hasFiles(e.dataTransfer)) e.preventDefault();
        }}
        onDragLeave={() => setDragging((n) => Math.max(0, n - 1))}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(0);
          acceptFiles(filesFrom(e.dataTransfer));
        }}
      >
        <Textarea
          ref={field}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            syncMenu(e.target);
          }}
          onSelect={(e) => syncMenu(e.currentTarget)}
          onClick={(e) => syncMenu(e.currentTarget)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.currentTarget.form?.requestSubmit();
              return;
            }
            if (menu) menuRef.current?.onKeyDown(e);
          }}
          onPaste={(e) => {
            const files = filesFrom(e.clipboardData);
            if (files.length === 0) return;
            e.preventDefault();
            acceptFiles(files);
          }}
          placeholder="Describe what you're building."
          aria-label="Describe what you're building"
          rows={2}
          required
          disabled={loading}
          className="min-h-[3.5rem] resize-none rounded-none border-0 bg-transparent px-0 py-1 font-display text-[22px] leading-snug shadow-none placeholder:italic placeholder:text-muted-foreground/70 focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent md:text-[22px]"
        />
        {dragging > 0 && <DropVeil label={REFERENCE_COPY.DROP_LABEL} />}
        {menu && (
          <ReferenceMenu
            ref={menuRef}
            trigger={menu.trigger}
            query={menu.query}
            sources={sources}
            anchorRef={wrapper}
            onPick={pickReference}
            onScreenshot={openScreenshots}
            onLeaveTrigger={leaveTrigger}
            onClose={closeMenu}
          />
        )}
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={SCREENSHOT_ACCEPT}
          className="hidden"
          onChange={(e) => {
            acceptFiles(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
      </div>
      <ReferenceChips
        className="mt-2"
        references={references}
        pending={shots}
        onRemoveReference={(index) =>
          setReferences((current) => current.filter((_, i) => i !== index))
        }
        onRemovePending={removeShot}
      />
      <p
        hidden={Boolean(error)}
        className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 leading-snug"
      >
        <span
          key={note.lead}
          className="animate-fade-in font-display text-[15px] italic text-muted-foreground"
        >
          {note.lead}
        </span>
        {note.tail && (
          <span
            key={note.tail}
            className="animate-fade-in text-[12px] font-body text-muted-foreground/70"
          >
            {note.tail}
          </span>
        )}
      </p>
      {error && (
        <p
          role="alert"
          className="mt-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-[12px] font-body text-destructive"
        >
          {error}
        </p>
      )}
      {children && <div className="mt-6 space-y-4">{children}</div>}
      {(text || attached) && (
        <div className="mt-6 flex justify-end animate-fade-in">
          <Button type="submit" size="sm" disabled={loading || !text} className="font-body">
            {loading ? COMPOSER_COPY.CREATING : COMPOSER_COPY.CREATE}
          </Button>
        </div>
      )}
    </form>
  );
}
