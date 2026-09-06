'use client';

// The menu under the describe field, opened by @ or /. Three levels: the
// sources (every connected integration, then Link and Screenshot), the items
// of one source searched live through the sidecar as the reader types (or a
// typed subject where there is no reader), and a URL field for a link. Level
// one is driven from the field's own keys through the handle; the other two
// own an input of their own, so the field never accumulates "@jira PROJ-1".

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
  type Ref,
  type RefObject,
} from 'react';
import { Input } from '@/components/ui/input';
import { ProviderMark } from '@/components/projects/provider-mark';
import { useDismissOnOutside } from '@/hooks/use-dismiss-on-outside';
import { moveSelection } from '@/lib/yeaboi/palette';
import {
  REFERENCE_COPY,
  isHttpUrl,
  linkReference,
  loadReferenceItems,
  menuSources,
  pickedReference,
  typedReference,
  type ProjectReference,
  type ReferenceItem,
  type ReferenceSearch,
  type ReferenceSource,
  type Trigger,
} from '@/lib/yeaboi/references';
import { cn } from '@/lib/utils';

/** What the field forwards while the menu is on its first level. */
export interface ReferenceMenuHandle {
  /** True when the key was the menu's to take. */
  onKeyDown: (event: KeyboardEvent) => boolean;
}

export interface ReferenceMenuProps {
  trigger: Trigger;
  /** The word typed after the trigger, filtering the first level. */
  query: string;
  sources: readonly ReferenceSource[];
  /** The element the menu belongs to; a mousedown outside it closes the menu. */
  anchorRef: RefObject<HTMLElement | null>;
  onPick: (reference: ProjectReference) => void;
  onScreenshot: () => void;
  /** The menu left level one: the field should drop the trigger word. */
  onLeaveTrigger: () => void;
  onClose: () => void;
  ref?: Ref<ReferenceMenuHandle>;
}

type Level = { kind: 'sources' } | { kind: 'search'; source: ReferenceSource } | { kind: 'link' };

const SEARCH_DEBOUNCE_MS = 200;

const ROW =
  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] font-body outline-none';

export function ReferenceMenu({
  trigger,
  query,
  sources,
  anchorRef,
  onPick,
  onScreenshot,
  onLeaveTrigger,
  onClose,
  ref,
}: ReferenceMenuProps) {
  const [level, setLevel] = useState<Level>({ kind: 'sources' });
  const [selected, setSelected] = useState(0);
  const [typed, setTyped] = useState('');
  const [link, setLink] = useState('');
  const [badLink, setBadLink] = useState(false);
  const [result, setResult] = useState<ReferenceSearch | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);

  useDismissOnOutside(anchorRef, true, onClose);

  const rows = level.kind === 'sources' ? menuSources(sources, trigger, query) : [];
  useEffect(() => setSelected(0), [query, level.kind, typed]);

  const choose = useCallback(
    (source: ReferenceSource) => {
      onLeaveTrigger();
      if (source.kind === 'screenshot') {
        onScreenshot();
        onClose();
        return;
      }
      setTyped('');
      setResult(null);
      setFailed(false);
      setLevel(source.kind === 'link' ? { kind: 'link' } : { kind: 'search', source });
    },
    [onLeaveTrigger, onScreenshot, onClose],
  );

  useImperativeHandle(
    ref,
    () => ({
      onKeyDown: (event) => {
        if (level.kind !== 'sources') return false;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          setSelected((current) =>
            moveSelection(current, event.key === 'ArrowDown' ? 1 : -1, rows.length),
          );
          return true;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          const row = rows[selected];
          if (!row) return false;
          event.preventDefault();
          choose(row);
          return true;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
          return true;
        }
        return false;
      },
    }),
    [level.kind, rows, selected, choose, onClose],
  );

  // Level two: the sidecar is asked a beat after the last keystroke, and an
  // answer to an older question is dropped.
  const searchable = level.kind === 'search' && level.source.searchable;
  const sourceKey = level.kind === 'search' ? level.source.key : '';
  useEffect(() => {
    if (!searchable) return;
    const mine = ++sequence.current;
    setBusy(true);
    const timer = setTimeout(() => {
      loadReferenceItems(sourceKey, typed).then(
        (sheet) => {
          if (mine !== sequence.current) return;
          setResult(sheet);
          setFailed(sheet === null);
          setBusy(false);
        },
        () => {
          if (mine !== sequence.current) return;
          setResult(null);
          setFailed(true);
          setBusy(false);
        },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchable, sourceKey, typed]);

  const items: ReferenceItem[] = searchable ? (result?.items ?? []) : [];
  const typedSubject = typed.trim();
  const searchRows = typedSubject ? items.length + 1 : items.length;

  const pickSearch = (index: number) => {
    if (level.kind !== 'search') return;
    const item = items[index];
    onPick(item ? pickedReference(level.source, item) : typedReference(level.source, typedSubject));
    onClose();
  };

  const submitLink = () => {
    if (!isHttpUrl(link)) {
      setBadLink(true);
      return;
    }
    onPick(linkReference(link));
    onClose();
  };

  const back = (event: KeyboardEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setLevel({ kind: 'sources' });
  };

  return (
    <div
      role="dialog"
      aria-label={REFERENCE_COPY.ADD_HEADING}
      className="absolute top-full left-0 right-0 z-30 mt-2 rounded-xl bg-popover p-1.5 ring-1 ring-border/70 shadow-2xl animate-fade-in"
    >
      {level.kind === 'sources' && (
        <ul
          role="listbox"
          aria-label={REFERENCE_COPY.ADD_HEADING}
          className="max-h-64 overflow-y-auto"
        >
          <li className="px-2.5 pt-1 pb-1.5 font-body text-[11px] text-muted-foreground/70">
            {REFERENCE_COPY.ADD_HEADING}
          </li>
          {rows.length === 0 && (
            <li className="px-2.5 py-1.5 font-body text-[12px] text-muted-foreground">
              {REFERENCE_COPY.NOTHING}
            </li>
          )}
          {rows.map((source, index) => (
            <li
              key={source.key}
              role="option"
              aria-selected={index === selected}
              onMouseEnter={() => setSelected(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(source)}
              className={cn(
                ROW,
                'cursor-default',
                index === selected ? 'bg-foreground/[0.06] text-foreground' : 'text-foreground/80',
              )}
            >
              <ProviderMark icon={source.icon} className="text-foreground/70" />
              <span className="truncate">{source.label}</span>
              {source.kind !== 'integration' && (
                <span className="ml-auto truncate text-[11px] text-muted-foreground/70">
                  {source.kind === 'link'
                    ? REFERENCE_COPY.LINK_HINT
                    : REFERENCE_COPY.SCREENSHOT_HINT}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {level.kind === 'search' && (
        <div>
          <div className="flex items-center gap-2 px-1.5 pt-1 pb-1.5">
            <ProviderMark icon={level.source.icon} className="text-foreground/70" />
            <Input
              autoFocus
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={
                level.source.searchable
                  ? REFERENCE_COPY.searchPlaceholder(level.source.label)
                  : REFERENCE_COPY.noReader(level.source.label)
              }
              aria-label={REFERENCE_COPY.searchPlaceholder(level.source.label)}
              className="h-7 border-0 bg-transparent px-1 text-[13px] shadow-none focus-visible:ring-0"
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault();
                  setSelected((current) =>
                    moveSelection(current, event.key === 'ArrowDown' ? 1 : -1, searchRows),
                  );
                } else if (event.key === 'Enter' || event.key === 'Tab') {
                  if (searchRows === 0) return;
                  event.preventDefault();
                  pickSearch(selected);
                } else if (event.key === 'Escape') {
                  back(event);
                }
              }}
            />
          </div>
          <ul role="listbox" aria-label={level.source.label} className="max-h-64 overflow-y-auto">
            {items.map((item, index) => (
              <li
                key={item.id}
                role="option"
                aria-selected={index === selected}
                onMouseEnter={() => setSelected(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pickSearch(index)}
                className={cn(
                  ROW,
                  'cursor-default',
                  index === selected
                    ? 'bg-foreground/[0.06] text-foreground'
                    : 'text-foreground/80',
                )}
              >
                <span className="truncate">{item.label}</span>
                {item.detail && (
                  <span className="ml-auto shrink-0 truncate text-[11px] text-muted-foreground/70">
                    {item.detail}
                  </span>
                )}
              </li>
            ))}
            {typedSubject && (
              <li
                role="option"
                aria-selected={selected === items.length}
                onMouseEnter={() => setSelected(items.length)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pickSearch(items.length)}
                className={cn(
                  ROW,
                  'cursor-default',
                  selected === items.length
                    ? 'bg-foreground/[0.06] text-foreground'
                    : 'text-foreground/80',
                )}
              >
                <span className="truncate">{REFERENCE_COPY.useTyped(typedSubject)}</span>
              </li>
            )}
            {searchable && (busy || failed || result?.warning || items.length === 0) && (
              <li className="px-2.5 py-1.5 font-body text-[12px] text-muted-foreground">
                {busy
                  ? REFERENCE_COPY.LOOKING
                  : failed
                    ? REFERENCE_COPY.FAILED
                    : result?.warning || REFERENCE_COPY.NOTHING}
              </li>
            )}
          </ul>
        </div>
      )}

      {level.kind === 'link' && (
        <div className="px-1.5 pt-1 pb-1">
          <div className="flex items-center gap-2">
            <ProviderMark icon="link" className="text-foreground/70" />
            <Input
              autoFocus
              type="url"
              value={link}
              onChange={(event) => {
                setLink(event.target.value);
                setBadLink(false);
              }}
              placeholder={REFERENCE_COPY.LINK_PLACEHOLDER}
              aria-label={REFERENCE_COPY.LINK_HINT}
              aria-invalid={badLink || undefined}
              className="h-7 border-0 bg-transparent px-1 text-[13px] shadow-none focus-visible:ring-0"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  submitLink();
                } else if (event.key === 'Escape') {
                  back(event);
                }
              }}
            />
          </div>
          <p
            className={cn(
              'px-1 pt-1 font-body text-[11px]',
              badLink ? 'text-destructive' : 'text-muted-foreground/70',
            )}
          >
            {badLink ? REFERENCE_COPY.BAD_URL : REFERENCE_COPY.LINK_HINT}
          </p>
        </div>
      )}
    </div>
  );
}
