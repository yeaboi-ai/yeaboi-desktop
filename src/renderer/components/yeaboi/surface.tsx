'use client';

// A deck surface: the page fills the port rather than sitting as a narrow
// column in the middle of it.
//
// The width is spent on a second column of context, never on stretching the
// first — a card blown up to fill a window is the same card with more padding,
// and reads as a page that has run out of things to say. The aside carries what
// the ceremony's own body does not: how it runs, what is live right now, and
// where its output ends up.

import Link from 'next/link';

import { useEffect, useState } from 'react';
import { loadBoards, type BoardSnapshot } from '@/lib/yeaboi/boards';

export function Surface({
  aside,
  children,
}: {
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-[calc(100vh-var(--titlebar-h))] px-8 py-8">
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">{children}</div>
        {aside && <div className="flex flex-col gap-3">{aside}</div>}
      </div>
    </div>
  );
}

export function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-card p-4 ring-1 ring-border/60">
      <h2 className="font-body text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** What each ceremony actually does, in the order it does it. Static because it
 *  describes the product, not the data — the one kind of filler that is not a
 *  guess at a number nobody has measured. */
const STEPS: Record<string, string[]> = {
  retro: [
    'Start a board and send the invite.',
    'Everyone adds cards from their own browser.',
    'yeaboi groups the themes as they arrive.',
    'Close it and the action items are drafted for you.',
  ],
  poker: [
    'Start a table and share the code.',
    'Each player picks a card in private.',
    'Everyone reveals at once.',
    'The spread is kept with the ticket it sized.',
  ],
  standup: [
    'Point it at where the work is recorded.',
    'yeaboi reads what moved since the last one.',
    'You get the blockers and the drift, not a status round.',
    'The summary is filed against the sprint.',
  ],
  ship: [
    'Pick the window you are shipping.',
    'yeaboi gathers what actually landed in it.',
    'It writes the note in your voice, not a commit log.',
    'Publish it or hand it on.',
  ],
  reporting: [
    'Pick a period and a deck style.',
    'yeaboi gathers what shipped and what it cost.',
    'It writes the narrative for the business, not the team.',
    'Present it, or export the deck.',
  ],
  performance: [
    'Choose whose work you are reviewing.',
    'yeaboi reads the trail they left across the ceremonies.',
    'You get evidence with dates, not impressions.',
    'Nothing here is scored or ranked automatically.',
  ],
  analysis: [
    'Point it at a ticket, a page or a roadmap.',
    'yeaboi reads it against what the team already decided.',
    'You get the gaps and the contradictions.',
    'Keep the ones worth keeping.',
  ],
};

function Steps({ kind }: { kind: string }) {
  const steps = STEPS[kind];
  if (!steps) return null;
  return (
    <Panel title="How it runs">
      <ol className="flex flex-col gap-2.5">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-2.5">
            <span className="font-code text-[11px] leading-5 text-primary">{index + 1}</span>
            <span className="font-body text-[12px] leading-5 text-muted-foreground">{step}</span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

/** Boards that are open right now. Real rows or nothing: an empty list is a
 *  fact about the workspace and says so. */
function Live({ kind }: { kind: string }) {
  const [boards, setBoards] = useState<BoardSnapshot[] | null>(null);
  useEffect(() => {
    loadBoards().then(
      (body) => setBoards(body.boards ?? []),
      () => setBoards([]),
    );
  }, []);

  if (!boards) return null;
  const mine = boards.filter((board) => board.kind === kind);

  return (
    <Panel title="Open now">
      {mine.length === 0 ? (
        <p className="font-body text-[12px] text-muted-foreground/70">
          {boards.length === 0
            ? 'No boards are running.'
            : `${boards.length} board${boards.length === 1 ? '' : 's'} running, none of them ${kind}.`}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {mine.map((board) => (
            <li key={board.board_id}>
              <Link
                href={`/team/${kind}/board?id=${encodeURIComponent(board.board_id)}`}
                className="block truncate rounded-lg px-2 py-1.5 font-body text-[12px] text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
              >
                {board.title || board.project_name || board.display_code}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Related({ links }: { links: { href: string; label: string; note: string }[] }) {
  if (links.length === 0) return null;
  return (
    <Panel title="From here">
      <ul className="flex flex-col gap-1">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="block rounded-lg px-2 py-1.5 transition-colors hover:bg-secondary/50"
            >
              <span className="block font-body text-[12px] text-foreground">{link.label}</span>
              <span className="block font-body text-[11px] text-muted-foreground/70">
                {link.note}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** How to move around the deck. Product behaviour, not data — and the one
 *  thing a new surface cannot teach you by sitting there. Exported because Home
 *  wants it too, and it should say the same thing in both places. */
export function GettingAround() {
  const keys = [
    ['Scroll', 'One turn moves one surface'],
    ['Tab', 'Forward, Shift+Tab back'],
    ['Hover the rail', 'The rest of the modes'],
    ['Cmd .', 'Ask Niko from anywhere'],
  ];
  return (
    <Panel title="Getting around">
      <ul className="flex flex-col gap-2">
        {keys.map(([key, note]) => (
          <li key={key} className="flex items-baseline justify-between gap-3">
            <span className="font-code text-[11px] text-foreground">{key}</span>
            <span className="text-right font-body text-[11px] text-muted-foreground/70">
              {note}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function CeremonyAside({
  kind,
  links = [],
}: {
  kind: string;
  links?: { href: string; label: string; note: string }[];
}) {
  return (
    <>
      <Steps kind={kind} />
      <Live kind={kind} />
      <Related links={links} />
      <GettingAround />
    </>
  );
}
