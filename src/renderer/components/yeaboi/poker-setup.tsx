'use client';

// Setting a table up, as one panel on the poker surface rather than a page you
// leave for.
//
// Which questions this configuration actually asks comes from
// /api/poker/options and the per-step probes, never from a rule kept here — the
// terminal and the desktop must walk the same wizard, and a demo session skips
// everything after the source for a reason the backend owns.
//
// The questions are one row each, and a row is only there once the answer above
// it makes it relevant: the panel grows as it is answered rather than standing
// there as a form.

import { useEffect, useState } from 'react';

import {
  type PickOption,
  type PokerOptions,
  fetchPokerTickets,
  loadPokerSprints,
  loadPokerTypes,
  loadPokerOptions,
  startPokerBoard,
} from '@/lib/yeaboi/boards';
import { Button } from '@/components/ui/button';

interface Ticket {
  key?: string;
  id?: string;
  title?: string;
  summary?: string;
}

/** How many of the fetched tickets are named before the rest are counted. */
const NAMED = 8;

const PILL =
  'rounded-full px-3 py-1.5 text-left font-body text-[12px] transition-colors ring-1 disabled:opacity-50';

function Pill({
  chosen,
  label,
  sub,
  onClick,
}: {
  chosen: boolean;
  label: string;
  sub?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={sub}
      className={`${PILL} ${
        chosen
          ? 'bg-primary/10 text-foreground ring-primary/40'
          : 'bg-secondary/40 text-muted-foreground ring-transparent hover:bg-secondary/70 hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );
}

/** One question: its name on the left, its answers on the right. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2 py-2.5">
      <p className="w-24 shrink-0 font-body text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

export function PokerSetup({ onOpened }: { onOpened: (boardId: string) => void }) {
  const [options, setOptions] = useState<PokerOptions | null>(null);
  const [error, setError] = useState('');
  const [source, setSource] = useState('');
  const [scope, setScope] = useState('');
  const [sprints, setSprints] = useState<Record<string, unknown>[]>([]);
  const [sprintOptions, setSprintOptions] = useState<PickOption[]>([]);
  const [sprintIndex, setSprintIndex] = useState(0);
  const [types, setTypes] = useState<PickOption[]>([]);
  const [checked, setChecked] = useState<string[]>([]);
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [scopeLabel, setScopeLabel] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadPokerOptions().then(setOptions, (e: Error) => setError(e.message));
  }, []);

  // The demo source answers only the first question; a real tracker earns the
  // rest. `steps` is the backend's list, so this reads it rather than deciding.
  const steps = options?.steps ?? [];
  const asksScope = Boolean(source) && source !== 'demo' && steps.includes('scope');
  const asksSprint = asksScope && scope === 'sprint';
  const asksTypes = Boolean(source) && source !== 'demo' && steps.includes('types');
  const ready =
    Boolean(source) &&
    (source === 'demo' || (Boolean(scope) && (!asksSprint || sprints.length > 0)));

  async function pickSource(key: string) {
    setSource(key);
    setScope('');
    setSprints([]);
    setTickets(null);
    if (key === 'demo') return;
    try {
      const body = await loadPokerTypes(key);
      setTypes(body.types);
      setChecked(body.types.filter((type) => type.checked).map((type) => type.key));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function pickScope(key: string) {
    setScope(key);
    setTickets(null);
    if (key !== 'sprint') return;
    try {
      const body = await loadPokerSprints(source);
      setSprints(body.sprints);
      setSprintOptions(body.options);
      setSprintIndex(body.default_index);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function fetchScope() {
    setBusy(true);
    setError('');
    try {
      const body = await fetchPokerTickets({
        source,
        scope,
        sprint: asksSprint ? (sprints[sprintIndex] ?? null) : null,
        include_types: asksTypes ? checked : null,
      });
      setScopeLabel(body.scope_label);
      setTickets(body.tickets as Ticket[]);
      // An empty answer is a configuration story, not an error — and the
      // backend wrote the sentence that says which one.
      if (body.message) setError(body.message);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  async function deal() {
    if (!tickets?.length) return;
    setBusy(true);
    try {
      const board = await startPokerBoard({ source, scope_label: scopeLabel, tickets });
      onOpened(board.board_id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  if (!options) {
    return (
      <p className="font-body text-[12px] text-muted-foreground">
        {error || 'Reading the wizard…'}
      </p>
    );
  }

  return (
    <div className="divide-y divide-border/40">
      <Row label="Tickets from">
        {options.sources.map((option) => (
          <Pill
            key={option.key}
            chosen={source === option.key}
            label={option.label}
            sub={option.sub}
            onClick={() => void pickSource(option.key)}
          />
        ))}
      </Row>

      {asksScope && (
        <Row label="Which ones">
          {options.scopes.map((option) => (
            <Pill
              key={option.key}
              chosen={scope === option.key}
              label={option.label}
              sub={option.sub}
              onClick={() => void pickScope(option.key)}
            />
          ))}
        </Row>
      )}

      {asksSprint && (
        <Row label="Sprint">
          {sprintOptions.length === 0 ? (
            <p className="font-body text-[12px] text-muted-foreground">
              No sprints found — check the board&apos;s credentials, or estimate the backlog
              instead.
            </p>
          ) : (
            <select
              value={String(sprintIndex)}
              onChange={(e) => setSprintIndex(Number(e.target.value))}
              className="max-w-full rounded-full bg-secondary/40 px-3 py-1.5 font-body text-[12px] text-foreground ring-1 ring-transparent focus:outline-none focus:ring-primary/40"
            >
              {sprintOptions.map((option, index) => (
                <option key={option.key} value={String(index)}>
                  {option.label}
                  {option.sub ? ` · ${option.sub}` : ''}
                </option>
              ))}
            </select>
          )}
        </Row>
      )}

      {asksTypes && (
        <Row label="Types">
          {types.map((type) => (
            <Pill
              key={type.key}
              chosen={checked.includes(type.key)}
              label={type.label}
              sub={type.sub}
              onClick={() =>
                setChecked(
                  checked.includes(type.key)
                    ? checked.filter((key) => key !== type.key)
                    : [...checked, type.key],
                )
              }
            />
          ))}
        </Row>
      )}

      {ready && (
        <Row label={tickets ? scopeLabel || 'Scope' : 'Then'}>
          {!tickets && (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void fetchScope()}>
              {busy ? 'Fetching…' : 'Fetch tickets'}
            </Button>
          )}
          {tickets && tickets.length > 0 && (
            <>
              <Button size="sm" disabled={busy} onClick={() => void deal()}>
                {busy ? 'Dealing…' : `Deal ${tickets.length} tickets`}
              </Button>
              <button
                type="button"
                onClick={() => setTickets(null)}
                className="font-body text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                change
              </button>
            </>
          )}
          {tickets && tickets.length === 0 && (
            <Button size="sm" variant="secondary" onClick={() => setTickets(null)}>
              Nothing came back — pick again
            </Button>
          )}
        </Row>
      )}

      {tickets && tickets.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-3">
          {tickets.slice(0, NAMED).map((ticket, index) => (
            <span
              key={ticket.key ?? ticket.id ?? index}
              title={ticket.title ?? ticket.summary}
              className="max-w-[220px] truncate rounded-md bg-secondary/40 px-2 py-1 font-code text-[10px] text-muted-foreground"
            >
              {ticket.key ?? ticket.id} {ticket.title ?? ticket.summary}
            </span>
          ))}
          {tickets.length > NAMED && (
            <span className="px-1 py-1 font-body text-[11px] text-muted-foreground/70">
              +{tickets.length - NAMED} more
            </span>
          )}
        </div>
      )}

      {error && <p className="pt-3 font-body text-[12px] text-muted-foreground">{error}</p>}
    </div>
  );
}
