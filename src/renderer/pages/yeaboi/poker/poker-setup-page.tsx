'use client';

// The poker setup wizard: source → scope → sprint → types → fetch → table.
//
// Which of those four steps this configuration actually asks comes from
// /api/poker/options and the per-step probes, never from a rule kept here — the
// terminal and the desktop must walk the same wizard, and a demo session skips
// everything after the source for a reason the backend owns.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  type PickOption,
  type PokerOptions,
  fetchPokerTickets,
  loadPokerOptions,
  loadPokerSprints,
  loadPokerTypes,
  startPokerBoard,
} from '@/lib/yeaboi/boards';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { Button } from '@/components/ui/button';

interface Ticket {
  key?: string;
  id?: string;
  title?: string;
  summary?: string;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-card ring-1 ring-border/60 p-5">
      <h2 className="text-[13px] font-body font-medium text-foreground mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Notice({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl bg-card ring-1 ring-destructive/30 p-4">
      <p className="text-[13px] font-medium text-foreground">{title}</p>
      {items.map((item) => (
        <p key={item} className="text-[12px] text-muted-foreground mt-1">
          {item}
        </p>
      ))}
    </div>
  );
}

function PokerSetupBody() {
  const router = useRouter();
  const [options, setOptions] = useState<PokerOptions | null>(null);
  const [error, setError] = useState('');
  const [source, setSource] = useState('');
  const [scope, setScope] = useState('');
  const [sprints, setSprints] = useState<Record<string, unknown>[]>([]);
  const [sprintOptions, setSprintOptions] = useState<PickOption[]>([]);
  const [sprintIndex, setSprintIndex] = useState(0);
  const [types, setTypes] = useState<PickOption[]>([]);
  const [typeHint, setTypeHint] = useState('');
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
      setTypeHint(body.hint);
      setChecked(body.types.filter((type) => type.checked).map((type) => type.key));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function pickScope(key: string) {
    setScope(key);
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
      router.push(`/humans/poker/board?id=${encodeURIComponent(board.board_id)}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  if (!options)
    return error ? (
      <Notice title="Could not load the wizard" items={[error]} />
    ) : (
      <p className="text-[13px] text-muted-foreground">Loading…</p>
    );

  const pickButton = (chosen: boolean) =>
    `flex items-start gap-2.5 rounded-xl px-3 py-2 text-left w-full transition-colors ${
      chosen ? 'bg-primary/10 ring-1 ring-primary/40' : 'bg-secondary/40 hover:bg-secondary/70'
    }`;

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl text-foreground">New poker session</h1>
      {error && <Notice title="Heads up" items={[error]} />}

      <Section title={options.titles.source ?? 'Where do the tickets come from?'}>
        {options.source_hint && (
          <p className="text-[12px] text-muted-foreground mb-2">{options.source_hint}</p>
        )}
        <div className="space-y-1.5">
          {options.sources.map((option) => (
            <button
              key={option.key}
              type="button"
              className={pickButton(source === option.key)}
              onClick={() => void pickSource(option.key)}
            >
              <span>
                <strong className="block text-[13px] font-body font-medium text-foreground">
                  {option.label}
                </strong>
                <span className="block text-[11px] text-muted-foreground">{option.sub}</span>
              </span>
            </button>
          ))}
        </div>
      </Section>

      {asksScope && (
        <Section title={options.titles.scope ?? 'Which tickets?'}>
          <div className="space-y-1.5">
            {options.scopes.map((option) => (
              <button
                key={option.key}
                type="button"
                className={pickButton(scope === option.key)}
                onClick={() => void pickScope(option.key)}
              >
                <span>
                  <strong className="block text-[13px] font-body font-medium text-foreground">
                    {option.label}
                  </strong>
                  <span className="block text-[11px] text-muted-foreground">{option.sub}</span>
                </span>
              </button>
            ))}
          </div>
        </Section>
      )}

      {asksSprint && (
        <Section title={options.titles.sprint ?? 'Which sprint?'}>
          {sprintOptions.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">
              No sprints found — check the board&apos;s credentials, or estimate the backlog
              instead.
            </p>
          ) : (
            <select
              value={String(sprintIndex)}
              onChange={(e) => setSprintIndex(Number(e.target.value))}
              className="w-full rounded-lg bg-secondary/40 border border-border/40 px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
            >
              {sprintOptions.map((option, index) => (
                <option key={option.key} value={String(index)}>
                  {option.label}
                  {option.sub ? ` · ${option.sub}` : ''}
                </option>
              ))}
            </select>
          )}
        </Section>
      )}

      {asksTypes && (
        <Section title={options.titles.types ?? 'Which ticket types?'}>
          <p className="text-[12px] text-muted-foreground mb-2">{typeHint}</p>
          <div className="space-y-1.5">
            {types.map((type) => (
              <label key={type.key} className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked.includes(type.key)}
                  onChange={() =>
                    setChecked(
                      checked.includes(type.key)
                        ? checked.filter((key) => key !== type.key)
                        : [...checked, type.key],
                    )
                  }
                  className="mt-0.5 accent-[var(--primary)]"
                />
                <span className="text-[13px] text-foreground">
                  {type.label}{' '}
                  <span className="text-[11px] text-muted-foreground">{type.sub}</span>
                </span>
              </label>
            ))}
          </div>
        </Section>
      )}

      {ready && (
        <div>
          <Button variant="secondary" disabled={busy} onClick={() => void fetchScope()}>
            {busy ? 'Fetching…' : 'Fetch tickets'}
          </Button>
        </div>
      )}

      {tickets && tickets.length > 0 && (
        <Section title={`${tickets.length} tickets — ${scopeLabel}`}>
          <ul className="space-y-1.5">
            {tickets.slice(0, 12).map((ticket, index) => (
              <li key={ticket.key ?? ticket.id ?? index} className="text-[13px] text-foreground">
                <strong className="font-mono text-[12px]">{ticket.key ?? ticket.id}</strong>{' '}
                {ticket.title ?? ticket.summary}
              </li>
            ))}
          </ul>
          {tickets.length > 12 && (
            <p className="text-[12px] text-muted-foreground mt-2">
              …and {tickets.length - 12} more.
            </p>
          )}
          <div className="mt-3">
            <Button disabled={busy} onClick={() => void deal()}>
              {busy ? 'Dealing…' : 'Open the table'}
            </Button>
          </div>
        </Section>
      )}
    </div>
  );
}

export default function PokerSetupPage() {
  return (
    <BackendGate>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <PokerSetupBody />
      </div>
    </BackendGate>
  );
}
