'use client';

// Home — the desktop's welcome screen: the same card inventory the TUI's
// landing split renders (served verbatim from /api/meta/capabilities so it
// can never drift from _MODE_CARDS), plus the duck's tip companion and a
// door into the planning workspace.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Columns3, LayoutGrid } from 'lucide-react';
import { apiGet } from '@/lib/yeaboi/api';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { TipCompanion } from '@/components/yeaboi/tip-companion';
import { MODE_ROUTES, type Tip } from '@/lib/yeaboi/tips';

interface ModeCard {
  key: string;
  title: string;
  description: string;
  available: boolean;
  color: string;
}

interface CategoryCard {
  key: string;
  title: string;
  verb: string;
  capabilities: string[];
  color: string;
}

interface Capabilities {
  categories: CategoryCard[];
  modes: ModeCard[];
  agents: ModeCard[];
}

function CardGrid({ cards, onOpen }: { cards: ModeCard[]; onOpen: (key: string) => void }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {cards.map((card) => (
        <button
          key={card.key}
          type="button"
          onClick={() => onOpen(card.key)}
          className="rounded-2xl bg-card ring-1 ring-border/60 px-5 py-4 text-left transition-colors hover:ring-primary/40 hover:bg-secondary/40"
        >
          <h3 className="flex items-center gap-2 text-[13px] font-body font-medium text-foreground">
            <span
              className="inline-block h-2 w-2 rounded-full shrink-0"
              style={{ background: card.color }}
            />
            {card.title}
          </h3>
          <p className="mt-1.5 text-[12px] text-muted-foreground leading-snug">
            {card.description}
          </p>
        </button>
      ))}
    </div>
  );
}

function HomeBody() {
  const router = useRouter();
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [tips, setTips] = useState<Tip[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Capabilities>('/api/meta/capabilities').then(setCaps, (e: Error) => setError(e.message));
    apiGet<{ tips: Tip[] }>('/api/meta/tips').then(
      ({ tips: loaded }) => setTips(loaded),
      () => undefined,
    );
  }, []);

  if (error)
    return (
      <p className="text-[13px] text-muted-foreground">
        Could not load the mode inventory: {error}
      </p>
    );
  if (!caps) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  const team = caps.categories.find((c) => c.key === 'team');
  const agents = caps.categories.find((c) => c.key === 'agents');
  const open = (key: string) => {
    const route = MODE_ROUTES[key];
    if (route) router.push(route);
  };

  return (
    <>
      {/* The planning workspace is the desktop's own front door. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
        <button
          type="button"
          onClick={() => router.push('/projects')}
          className="rounded-2xl bg-card ring-1 ring-border/60 px-5 py-4 text-left transition-colors hover:ring-primary/40 hover:bg-secondary/40"
        >
          <h3 className="flex items-center gap-2 text-[13px] font-body font-medium text-foreground">
            <LayoutGrid className="h-3.5 w-3.5 text-primary" />
            Projects
          </h3>
          <p className="mt-1.5 text-[12px] text-muted-foreground leading-snug">
            Blueprint sessions, diagrams and deliverables — plan something new.
          </p>
        </button>
        <button
          type="button"
          onClick={() => router.push('/board')}
          className="rounded-2xl bg-card ring-1 ring-border/60 px-5 py-4 text-left transition-colors hover:ring-primary/40 hover:bg-secondary/40"
        >
          <h3 className="flex items-center gap-2 text-[13px] font-body font-medium text-foreground">
            <Columns3 className="h-3.5 w-3.5 text-primary" />
            Board
          </h3>
          <p className="mt-1.5 text-[12px] text-muted-foreground leading-snug">
            Every ticket across projects, waves and sprints in one place.
          </p>
        </button>
      </div>

      <p
        className="text-[11px] font-body uppercase tracking-wide mb-3"
        style={{ color: team?.color }}
      >
        Team — {team?.verb}
      </p>
      <CardGrid cards={caps.modes} onOpen={open} />
      <p
        className="text-[11px] font-body uppercase tracking-wide mt-8 mb-3"
        style={{ color: agents?.color }}
      >
        Agents — {agents?.verb}
      </p>
      <CardGrid cards={caps.agents} onOpen={open} />

      <TipCompanion
        tips={tips}
        cards={[...caps.modes, ...caps.agents]}
        onNavigate={(route) => router.push(route)}
      />
    </>
  );
}

export default function HomePage() {
  return (
    <BackendGate>
      {/* The tip dock and Niko's pill both float over the bottom of the window;
          the padding is what keeps the last card row reachable under them. The
          dock is 24 + 72 duck + 10, and a three-line bubble another ~112 — the
          common case at the 960px minimum width, not the edge. */}
      <div className="mx-auto max-w-5xl px-6 py-10 pb-64">
        <h1 className="font-display text-2xl text-foreground mb-6">Home</h1>
        <HomeBody />
      </div>
    </BackendGate>
  );
}
