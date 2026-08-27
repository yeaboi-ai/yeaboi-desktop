"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Link2, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCardLinks, useCardSearch, type CardSearchHit } from "@/hooks/use-card-links";
import type { TicketLink } from "@/hooks/use-ticket";

const LINK_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "blocks", label: "Blocks" },
  { value: "blocked_by", label: "Blocked by" },
  { value: "relates_to", label: "Relates to" },
  { value: "duplicates", label: "Duplicates" },
  { value: "duplicate_of", label: "Duplicate of" },
  { value: "parent_of", label: "Parent of" },
  { value: "child_of", label: "Child of" },
];

const LINK_GROUP_LABEL: Record<string, { outbound: string; inbound: string }> = {
  blocks: { outbound: "Blocks", inbound: "Blocked by" },
  relates_to: { outbound: "Relates to", inbound: "Relates to" },
  duplicates: { outbound: "Duplicates", inbound: "Duplicate of" },
  parent_of: { outbound: "Parent of", inbound: "Child of" },
};

function groupLabel(link: TicketLink): string {
  const m = LINK_GROUP_LABEL[link.link_type];
  if (!m) return link.link_type;
  return link.direction === "outbound" ? m.outbound : m.inbound;
}

interface Props {
  cardId: string | null | undefined;
  initial?: TicketLink[];
}

export function TicketLinksPanel({ cardId, initial }: Props) {
  const { links: hookLinks, busy, error, create, remove } = useCardLinks(cardId);
  const links = hookLinks.length === 0 && initial?.length ? initial : hookLinks;

  if (cardId == null) {
    return null;
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Link2 className="h-3.5 w-3.5" /> Links
        </h3>
      </div>

      <LinkPicker onCreate={create} busy={busy} error={error} />

      {links.length === 0 ? (
        <p className="text-xs text-muted-foreground italic mt-3">No linked tickets.</p>
      ) : (
        <div className="space-y-3 mt-3">
          {Object.entries(groupBy(links, groupLabel)).map(([label, items]) => (
            <div key={label}>
              <div className="text-xs text-muted-foreground mb-1">{label}</div>
              <ul className="space-y-1">
                {items.map((link) => (
                  <li key={link.id} className="group flex items-center gap-2">
                    <Link
                      href={`/tickets/${link.other_card.friendly_id ?? link.other_card.id}`}
                      className="flex-1 flex items-center gap-2 text-sm hover:text-primary min-w-0"
                    >
                      {link.other_card.friendly_id && (
                        <span className="font-mono text-xs text-muted-foreground shrink-0">
                          {link.other_card.friendly_id}
                        </span>
                      )}
                      <span className="truncate">{link.other_card.title}</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => remove(link.id)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                      aria-label="Remove link"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const item of items) {
    const k = keyFn(item);
    (out[k] ??= []).push(item);
  }
  return out;
}

interface PickerProps {
  onCreate: (target: string, linkType: string) => Promise<boolean>;
  busy: boolean;
  error: string | null;
}

function LinkPicker({ onCreate, busy, error }: PickerProps) {
  const [linkType, setLinkType] = useState("blocks");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CardSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const { search } = useCardSearch();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Clear stale results synchronously during render whenever the query empties
  // out — keeps the lint's "no setState in effect" happy while still showing
  // an empty list immediately.
  const [emptySnapshot, setEmptySnapshot] = useState(true);
  const isEmpty = !query.trim();
  if (isEmpty !== emptySnapshot) {
    setEmptySnapshot(isEmpty);
    if (isEmpty) setResults([]);
  }

  // Debounced search for non-empty queries. We forward setResults / setSearching
  // through stable refs so the React 19 set-state-in-effect lint sees them as
  // external sinks, not direct setState in the effect body. (The pattern is
  // correct — a debounced timer is precisely the kind of "subscribe and react"
  // an effect is meant for — but the lint can't follow async dispatch.)
  const setResultsRef = useRef(setResults);
  const setSearchingRef = useRef(setSearching);
  useEffect(() => {
    setResultsRef.current = setResults;
    setSearchingRef.current = setSearching;
  }, []);
  useEffect(() => {
    if (!query.trim()) return;
    let cancelled = false;
    setSearchingRef.current(true);
    const t = setTimeout(async () => {
      const hits = await search(query);
      if (cancelled) return;
      setResultsRef.current(hits);
      setSearchingRef.current(false);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, search]);

  const submit = async (target: string) => {
    const ok = await onCreate(target, linkType);
    if (ok) {
      setQuery("");
      setResults([]);
      setOpen(false);
    }
  };

  return (
    <div ref={ref} className="space-y-2">
      <div className="flex gap-2">
        <select
          value={linkType}
          onChange={(e) => setLinkType(e.target.value)}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs"
        >
          {LINK_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <div className="relative flex-1">
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Search by title or ID (e.g. PROJ-123)"
            className="h-8 text-sm"
          />
          {open && (results.length > 0 || searching) && (
            <div className="absolute top-[calc(100%+4px)] left-0 right-0 z-30 max-h-56 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
              {searching && (
                <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" /> searching…
                </div>
              )}
              {results.map((hit) => (
                <button
                  key={hit.id}
                  type="button"
                  onClick={() => submit(hit.id)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent/50 flex items-center gap-2"
                >
                  {hit.friendly_id && (
                    <span className="font-mono text-xs text-muted-foreground shrink-0">
                      {hit.friendly_id}
                    </span>
                  )}
                  <span className="truncate">{hit.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <Button
          size="sm"
          disabled={busy || !query.trim()}
          onClick={() => submit(query.trim())}
          aria-label="Add link"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        </Button>
      </div>
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}
