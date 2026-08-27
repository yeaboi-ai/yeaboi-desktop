'use client';

import { useMemo } from 'react';
import { Search, X, Mic, Type } from 'lucide-react';

import { mediumOf, type TranscriptMedium } from './transcript-medium';

interface Entry {
  speaker_name: string | null;
  message_type?: string;
}

interface TranscriptSearchProps {
  query: string;
  onQueryChange: (q: string) => void;
  /** Speakers selected for filtering. Empty set = "all speakers". */
  selectedSpeakers: Set<string>;
  onToggleSpeaker: (name: string) => void;
  /** Mediums selected for filtering. Empty set = "all mediums" (spoken + typed). */
  selectedMediums?: Set<TranscriptMedium>;
  onToggleMedium?: (m: TranscriptMedium) => void;
  /** All entries — used to derive the speaker chip list and decide which
   *  medium chips to render (we hide them when only one medium is present). */
  entries: Entry[];
}

/**
 * Search bar + per-speaker filter chips. Pure UI; the parent wires the
 * resulting query/selection back into the transcript filter.
 */
export function TranscriptSearch({
  query,
  onQueryChange,
  selectedSpeakers,
  onToggleSpeaker,
  selectedMediums,
  onToggleMedium,
  entries,
}: TranscriptSearchProps) {
  const speakers = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) {
      if (e.speaker_name) set.add(e.speaker_name);
    }
    return Array.from(set).sort();
  }, [entries]);

  // Only show the medium toggle when the transcript actually contains both
  // mediums — a pure-voice or pure-chat session doesn't benefit from the chip.
  const mediumsPresent = useMemo(() => {
    const set = new Set<TranscriptMedium>();
    for (const e of entries) {
      const m = mediumOf(e.message_type);
      if (m) set.add(m);
    }
    return set;
  }, [entries]);
  const showMediumChips = mediumsPresent.size > 1 && onToggleMedium;

  return (
    <div className="px-3 py-2 border-b border-border/60 bg-foreground/[0.02]">
      <div className="flex items-center gap-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search transcript..."
          aria-label="Search transcript"
          className="flex-1 bg-transparent outline-none text-[12px] text-foreground placeholder:text-muted-foreground/50"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange('')}
            aria-label="Clear search"
            className="p-0.5 rounded text-muted-foreground/50 hover:text-foreground/80 hover:bg-foreground/[0.05] transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      {showMediumChips &&
        (() => {
          // Compute which "slot" is active. selectedMediums of size 0 OR size 2
          // both mean "show everything" — collapse to the All slot.
          const activeSlot: 'all' | TranscriptMedium =
            !selectedMediums || selectedMediums.size === 0 || selectedMediums.size === 2
              ? 'all'
              : (Array.from(selectedMediums)[0] as TranscriptMedium);
          const selectSlot = (slot: 'all' | TranscriptMedium) => {
            if (!onToggleMedium) return;
            // Toggle the medium filter to land on the requested slot.
            if (slot === 'all') {
              // Clear: deselect any currently selected medium.
              if (selectedMediums?.has('spoken')) onToggleMedium('spoken');
              if (selectedMediums?.has('typed')) onToggleMedium('typed');
              return;
            }
            // Solo-select the requested medium: turn off the other if on,
            // turn on this one if not.
            const other: TranscriptMedium = slot === 'spoken' ? 'typed' : 'spoken';
            if (selectedMediums?.has(other)) onToggleMedium(other);
            if (!selectedMediums?.has(slot)) onToggleMedium(slot);
          };
          const slots: Array<{
            key: 'all' | TranscriptMedium;
            label: string;
            Icon: typeof Mic | null;
          }> = [
            { key: 'all', label: 'All', Icon: null },
            { key: 'spoken', label: 'Spoken', Icon: Mic },
            { key: 'typed', label: 'Typed', Icon: Type },
          ];
          return (
            <div className="flex items-center justify-between gap-3 mt-3">
              <span className="text-[11px] uppercase tracking-[0.10em] text-muted-foreground/70 font-semibold">
                Medium
              </span>
              <div
                role="tablist"
                aria-label="Filter by medium"
                className="flex items-center rounded-md bg-foreground/[0.04] p-0.5 ring-1 ring-border/40"
              >
                {slots.map((s) => {
                  const active = activeSlot === s.key;
                  return (
                    <button
                      key={s.key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => selectSlot(s.key)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded text-[12px] font-medium transition-colors ${
                        active
                          ? 'bg-foreground/[0.10] text-foreground/95'
                          : 'text-muted-foreground/75 hover:text-foreground/90'
                      }`}
                    >
                      {s.Icon && <s.Icon className="h-3 w-3" />}
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}
      {speakers.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 mt-3">
          <span className="text-[9px] uppercase tracking-[0.06em] text-muted-foreground/50 mr-1">
            Speakers
          </span>
          {speakers.map((s) => {
            const active = selectedSpeakers.has(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => onToggleSpeaker(s)}
                aria-pressed={active}
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                  active
                    ? 'bg-success/20 text-success ring-1 ring-success/30'
                    : 'bg-foreground/[0.05] text-muted-foreground hover:text-foreground/95 ring-1 ring-border/60'
                }`}
              >
                {s}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
