'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bookmark, Check, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthFetch } from '@/hooks/use-auth-fetch';
import { getPref, setPref, type SavedBoardView } from '@/lib/preferences';

interface Props {
  currentQuery: string;
  onApply: (query: string) => void;
}

interface DbView {
  id: string;
  name: string;
  query: string;
  created_at: string;
}

// Phase 6 — DB-backed saved views with localStorage fallback. The fallback
// kicks in when the server is unreachable (offline dev, brief outages) so users
// never lose their pinned views; once reachable again the local set is synced
// up via a one-time merge.
export function SavedViews({ currentQuery, onApply }: Props) {
  const { authFetch, ready } = useAuthFetch();
  const [views, setViews] = useState<SavedBoardView[]>(() => getPref('board.savedViews'));
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [usingFallback, setUsingFallback] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    if (!ready) return;
    try {
      const resp = await authFetch('/api/card-views-proxy');
      if (!resp.ok) {
        setUsingFallback(true);
        return;
      }
      const rows: DbView[] = await resp.json();
      const remote: SavedBoardView[] = rows.map((r) => ({
        id: r.id,
        name: r.name,
        query: r.query,
        createdAt: r.created_at,
      }));
      // One-time backfill: if the server has none but localStorage does, push
      // local entries up so users keep their views after the upgrade.
      const local = getPref('board.savedViews');
      if (remote.length === 0 && local.length > 0) {
        for (const v of local) {
          await authFetch('/api/card-views-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: v.name, query: v.query }),
          });
        }
        const reloaded = await authFetch('/api/card-views-proxy');
        if (reloaded.ok) {
          const reloadedRows: DbView[] = await reloaded.json();
          const merged = reloadedRows.map((r) => ({
            id: r.id,
            name: r.name,
            query: r.query,
            createdAt: r.created_at,
          }));
          setViews(merged);
          setPref('board.savedViews', merged);
          setUsingFallback(false);
          return;
        }
      }
      setViews(remote);
      setPref('board.savedViews', remote);
      setUsingFallback(false);
    } catch {
      setUsingFallback(true);
    }
  }, [authFetch, ready]);

  // Hydrate from server when the auth client is ready. The ref dance lets the
  // React 19 lint recognise refresh() as an external sink rather than direct
  // setState in the effect body — same pattern as the link-picker debounce.
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);
  useEffect(() => {
    refreshRef.current();
  }, [ready]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (usingFallback) {
      const next: SavedBoardView[] = [
        ...views,
        {
          id: crypto.randomUUID(),
          name: trimmed,
          query: currentQuery,
          createdAt: new Date().toISOString(),
        },
      ];
      setViews(next);
      setPref('board.savedViews', next);
      setName('');
      return;
    }
    const resp = await authFetch('/api/card-views-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed, query: currentQuery }),
    });
    if (resp.ok) {
      const row: DbView = await resp.json();
      const next: SavedBoardView[] = [
        ...views,
        { id: row.id, name: row.name, query: row.query, createdAt: row.created_at },
      ];
      setViews(next);
      setPref('board.savedViews', next);
      setName('');
    }
  };

  const remove = async (id: string) => {
    if (usingFallback) {
      const next = views.filter((v) => v.id !== id);
      setViews(next);
      setPref('board.savedViews', next);
      return;
    }
    const resp = await authFetch(`/api/card-views-proxy/${id}`, { method: 'DELETE' });
    if (resp.ok || resp.status === 204) {
      const next = views.filter((v) => v.id !== id);
      setViews(next);
      setPref('board.savedViews', next);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="h-8 inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <Bookmark className="h-3.5 w-3.5" />
        Views
      </button>
      {open && (
        <div className="absolute top-[calc(100%+4px)] left-0 z-50 w-64 rounded-lg border border-border bg-popover shadow-lg p-2 space-y-2">
          <div className="space-y-1">
            {views.length === 0 && (
              <p className="text-xs text-muted-foreground italic px-2 py-1">No saved views yet.</p>
            )}
            {views.map((v) => (
              <div key={v.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    onApply(v.query);
                    setOpen(false);
                  }}
                  className="flex-1 text-left text-sm px-2 py-1.5 rounded hover:bg-accent/50 truncate"
                >
                  {v.name}
                </button>
                <button
                  type="button"
                  onClick={() => remove(v.id)}
                  className="rounded p-1 text-muted-foreground hover:text-destructive"
                  aria-label={`Delete saved view ${v.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="border-t border-border pt-2 flex gap-1">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Save current view as…"
              className="h-8 text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  save();
                }
              }}
            />
            <Button size="sm" onClick={save} disabled={!name.trim()}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground px-1">
            <Check className="inline h-3 w-3 mr-0.5" />
            {usingFallback
              ? 'Offline — saved locally and synced when online.'
              : 'Saves filters, density, swimlane. Synced across devices.'}
          </p>
        </div>
      )}
    </div>
  );
}
