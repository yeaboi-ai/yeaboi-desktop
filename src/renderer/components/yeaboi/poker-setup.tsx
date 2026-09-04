'use client';

// Setting a table up, as one panel on the poker surface rather than a page you
// leave for.
//
// Which questions this configuration actually asks comes from
// /api/poker/options and the per-step probes, never from a rule kept here — the
// terminal and the desktop must walk the same wizard, and a demo session skips
// everything after the source for a reason the backend owns.
//
// The questions are one line of named choices, and a choice is only there once
// the answer before it makes it relevant. What is about to be estimated is
// shown before anyone is invited to estimate it — the count, the scope, and the
// tickets themselves behind one disclosure.

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

/** One question, as a named choice. A select rather than a row of pills: the
 *  answer is readable at a glance once it is made, which a lit pill among five
 *  others is not. */
function Choice({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-w-[160px] flex-1 flex-col gap-1">
      <span className="font-body text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-lg bg-secondary/40 px-2.5 font-body text-[12.5px] text-foreground ring-1 ring-border/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
      >
        {children}
      </select>
    </label>
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

  const chosenSprint = sprintOptions[sprintIndex];
  const summary = tickets
    ? `${tickets.length} ticket${tickets.length === 1 ? '' : 's'}${scopeLabel ? ` · ${scopeLabel}` : ''}`
    : '';

  return (
    <div className="flex flex-col gap-4">
      {/* The questions, as one line of choices rather than a wizard of pages.
          Everything a session needs is visible before it starts: where the
          tickets come from, which ones, and — once fetched — exactly which. */}
      <div className="flex flex-wrap items-end gap-3">
        <Choice label="Tickets from" value={source} onChange={(key) => void pickSource(key)}>
          <option value="">Pick a source…</option>
          {options.sources.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </Choice>

        {asksScope && (
          <Choice label="Which ones" value={scope} onChange={(key) => void pickScope(key)}>
            <option value="">Pick a scope…</option>
            {options.scopes.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </Choice>
        )}

        {asksSprint && sprintOptions.length > 0 && (
          <Choice
            label="Sprint"
            value={String(sprintIndex)}
            onChange={(key) => setSprintIndex(Number(key))}
          >
            {sprintOptions.map((option, index) => (
              <option key={option.key} value={String(index)}>
                {option.label}
                {option.sub ? ` · ${option.sub}` : ''}
              </option>
            ))}
          </Choice>
        )}
      </div>

      {asksSprint && sprintOptions.length === 0 && (
        <p className="font-body text-[12px] text-muted-foreground">
          No sprints found — check the board&apos;s credentials, or estimate the backlog instead.
        </p>
      )}

      {asksTypes && (
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="mr-1 font-body text-[10px] uppercase tracking-wide text-muted-foreground">
            Types
          </p>
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
        </div>
      )}

      {/* What is about to be estimated, before anybody is invited to estimate
          it: the count, the scope it came from, and the tickets themselves
          behind one disclosure. */}
      {tickets && tickets.length > 0 && (
        <details className="rounded-xl bg-secondary/30 px-3 py-2">
          <summary className="cursor-pointer select-none font-body text-[12.5px] text-foreground">
            {summary}
          </summary>
          <ul className="mt-2 max-h-44 space-y-1 overflow-y-auto overscroll-contain pr-1">
            {tickets.map((ticket, index) => (
              <li
                key={ticket.key ?? ticket.id ?? index}
                className="flex items-baseline gap-2 font-body text-[12px] text-muted-foreground"
              >
                <span className="shrink-0 font-code text-[10px] text-foreground">
                  {ticket.key ?? ticket.id}
                </span>
                <span className="min-w-0 truncate">{ticket.title ?? ticket.summary}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!tickets && (
          <Button
            className="h-10 px-4 text-[13px]"
            disabled={!ready || busy}
            onClick={() => void fetchScope()}
          >
            {busy ? 'Reading the tracker…' : 'Find the tickets'}
          </Button>
        )}
        {tickets && tickets.length > 0 && (
          <>
            <Button className="h-10 px-4 text-[13px]" disabled={busy} onClick={() => void deal()}>
              {busy ? 'Dealing…' : `Start the session · ${tickets.length} tickets`}
            </Button>
            <Button
              variant="secondary"
              className="h-10 px-3 text-[12.5px]"
              onClick={() => setTickets(null)}
            >
              Change the scope
            </Button>
          </>
        )}
        {tickets && tickets.length === 0 && (
          <Button variant="secondary" className="h-10 px-4" onClick={() => setTickets(null)}>
            Nothing came back — pick again
          </Button>
        )}
        {!ready && !tickets && (
          <p className="font-body text-[12px] text-muted-foreground">
            {source
              ? 'Pick what to estimate.'
              : 'Pick where the tickets come from and yeaboi does the rest.'}
          </p>
        )}
        {chosenSprint && !tickets && (
          <p className="font-body text-[12px] text-muted-foreground">{chosenSprint.sub}</p>
        )}
      </div>

      {error && <p className="font-body text-[12px] text-muted-foreground">{error}</p>}
    </div>
  );
}
