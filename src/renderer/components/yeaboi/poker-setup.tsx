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
//
// Answering the last question is the instruction. There is no button to press
// afterwards: the tickets are fetched the moment the answers are complete, and
// again whenever one of them changes.

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  type PickOption,
  type PokerOptions,
  fetchPokerTickets,
  loadPokerSprints,
  loadPokerTypes,
  loadPokerOptions,
  startPokerBoard,
} from '@/lib/yeaboi/boards';
import { ChevronsUpDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

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

/** One question, as a named choice.
 *
 *  A popover rather than a `<select>`, for the reason the dock's own scope
 *  switcher gives: the native menu is drawn by the OS in the OS's own style,
 *  and lands on the surface looking like a system dialog that wandered in. */
function Choice({
  label,
  value,
  options,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; sub?: string }[];
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value);

  return (
    <div className="flex min-w-[180px] flex-1 flex-col gap-1">
      <span className="font-body text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label={label}
              className="flex h-9 items-center justify-between gap-2 rounded-lg bg-secondary/40 px-2.5 font-body text-[12.5px] text-foreground ring-1 ring-border/50 transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
            >
              <span className={`truncate ${current ? '' : 'text-muted-foreground'}`}>
                {current?.label ?? placeholder}
              </span>
              <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
            </button>
          }
        />
        <PopoverContent align="start" className="w-64 p-1">
          <div
            role="menu"
            aria-label={label}
            className="flex max-h-64 flex-col gap-0.5 overflow-y-auto overscroll-contain"
          >
            {options.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => {
                    setOpen(false);
                    onChange(option.value);
                  }}
                  className={`flex flex-col items-start gap-0.5 rounded-lg px-2.5 py-1.5 text-left transition-colors duration-150 ${
                    active
                      ? 'bg-secondary/60 text-foreground'
                      : 'text-muted-foreground hover:bg-secondary/40 hover:text-foreground'
                  }`}
                >
                  <span className="font-body text-[12.5px]">{option.label}</span>
                  {option.sub && (
                    <span className="font-body text-[11px] text-muted-foreground/70">
                      {option.sub}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
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

  const fetchScope = useCallback(async () => {
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
  }, [source, scope, asksSprint, asksTypes, sprints, sprintIndex, checked]);

  /** The answers, as one value. While it is empty the wizard is still being
   *  asked; when it changes there is something new to fetch. */
  const answers = ready
    ? JSON.stringify([
        source,
        scope,
        asksSprint ? sprintIndex : null,
        asksTypes ? [...checked].sort() : null,
      ])
    : '';
  const fetchedFor = useRef('');

  useEffect(() => {
    // Once per set of answers. A failure leaves this set, so a broken tracker
    // is reported rather than asked the same question forever; the retry
    // beside the message is how it is asked again.
    if (!answers || fetchedFor.current === answers) return;
    fetchedFor.current = answers;
    void fetchScope();
    // `fetchScope` is rebuilt whenever an answer changes, which is exactly when
    // `answers` changes — following both would fetch twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers]);

  function retry() {
    fetchedFor.current = '';
    setError('');
    void fetchScope();
  }

  async function deal() {
    if (!tickets?.length) return;
    setBusy(true);
    try {
      const board = await startPokerBoard({ source, scope_label: scopeLabel, tickets });
      // Before the tunnel is up, so the host's own table is read over loopback
      // rather than out to Cloudflare and back — see main/board-play.ts.
      await (
        window as unknown as { yeaboi?: { warmBoard?: (id: string) => Promise<unknown> } }
      ).yeaboi?.warmBoard?.(board.board_id);
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
    <div className="flex flex-col gap-3">
      {/* What the session is made of goes in the panel; what starts it does
          not. An action is not one of the questions. */}
      {/* No frame: a fill on a sparse screen has to be earned by density, and
          this is two fields. The heading carries it. */}
      <section className="flex flex-col py-5">
        <h2 className="font-display text-[19px] leading-none text-foreground">New session</h2>
        <div className="mt-4 flex flex-col gap-4">
          {/* The questions, as one line of choices rather than a wizard of pages.
          Everything a session needs is visible before it starts: where the
          tickets come from, which ones, and — once fetched — exactly which. */}
          <div className="flex flex-wrap items-end gap-3">
            <Choice
              label="Tickets from"
              value={source}
              placeholder="Pick a source…"
              options={options.sources.map((option) => ({
                value: option.key,
                label: option.label,
                sub: option.sub,
              }))}
              onChange={(key) => void pickSource(key)}
            />

            {asksScope && (
              <Choice
                label="Which ones"
                value={scope}
                placeholder="Pick a scope…"
                options={options.scopes.map((option) => ({
                  value: option.key,
                  label: option.label,
                  sub: option.sub,
                }))}
                onChange={(key) => void pickScope(key)}
              />
            )}

            {asksSprint && sprintOptions.length > 0 && (
              <Choice
                label="Sprint"
                value={String(sprintIndex)}
                placeholder="Pick a sprint…"
                options={sprintOptions.map((option, index) => ({
                  value: String(index),
                  label: option.label,
                  sub: option.sub,
                }))}
                onChange={(key) => setSprintIndex(Number(key))}
              />
            )}
          </div>

          {asksSprint && sprintOptions.length === 0 && (
            <p className="font-body text-[12px] text-muted-foreground">
              No sprints found — check the board&apos;s credentials, or estimate the backlog
              instead.
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
          it: the count, the scope it came from, and the tickets themselves.
          Not behind a disclosure — they arrived because they were asked for,
          and a list you have to open to read is a list you did not ask for. */}
          {tickets && tickets.length > 0 && (
            <div>
              <p className="font-body text-[12.5px] text-foreground">{summary}</p>
              <ul className="quiet-scroll mt-2 max-h-44 space-y-1 overflow-y-auto overscroll-contain">
                {tickets.map((ticket, index) => (
                  <li
                    key={ticket.key ?? ticket.id ?? index}
                    // Top down, and capped: a sprint of forty should not take two
                    // seconds to finish arriving.
                    style={{ animationDelay: `${Math.min(index * 35, 280)}ms` }}
                    className="row-rise flex items-baseline gap-2 font-body text-[12px] text-muted-foreground"
                  >
                    <span className="shrink-0 font-code text-[10px] text-foreground">
                      {ticket.key ?? ticket.id}
                    </span>
                    <span className="min-w-0 truncate">{ticket.title ?? ticket.summary}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      {/* The actions, on the surface rather than in the panel. */}
      <div className="flex flex-wrap items-center gap-2">
        {tickets && tickets.length > 0 && (
          <Button className="h-10 px-4 text-[13px]" disabled={busy} onClick={() => void deal()}>
            {busy ? 'Dealing…' : `Start the session · ${tickets.length} tickets`}
          </Button>
        )}
        {busy && !tickets && (
          <p className="font-body text-[12px] text-muted-foreground">Reading the tracker…</p>
        )}
        {!ready && !busy && (
          <p className="font-body text-[12px] text-muted-foreground">
            {source
              ? 'Pick what to estimate.'
              : 'Pick where the tickets come from and yeaboi does the rest.'}
          </p>
        )}
        {chosenSprint && !tickets && !busy && (
          <p className="font-body text-[12px] text-muted-foreground">{chosenSprint.sub}</p>
        )}
        {/* The tracker answered with nothing, or would not answer. Either way
            the choices above are still there to change; this is for asking the
            same question again. */}
        {error && !busy && !tickets?.length && (
          <Button variant="secondary" className="h-10 px-3 text-[12.5px]" onClick={retry}>
            Try again
          </Button>
        )}
      </div>

      {error && <p className="font-body text-[12px] text-muted-foreground">{error}</p>}
    </div>
  );
}
