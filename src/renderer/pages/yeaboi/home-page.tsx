'use client';

// Home — the desktop's welcome screen: the same card inventory the TUI's
// landing split renders (served verbatim from /api/meta/capabilities so it
// can never drift from _MODE_CARDS), plus the rotating tips ticker and a
// door into the planning workspace.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Columns3, LayoutGrid } from 'lucide-react';
import { apiGet } from '@/lib/yeaboi/api';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { Badge } from '@/components/ui/badge';

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

interface Tip {
  key: string;
  text: string;
  mode_key: string | null;
  is_new: boolean;
  is_beta: boolean;
}

const TIP_ROTATE_MS = 6_000;

/** TUI mode keys → desktop routes. A key with no page yet still gets a card;
 *  the placeholder page says so honestly. */
const MODE_ROUTES: Record<string, string> = {
  analysis: '/humans/analysis',
  planning: '/humans/planning',
  standup: '/humans/standup',
  retro: '/humans/retro',
  poker: '/humans/poker',
  performance: '/humans/performance',
  reporting: '/humans/reporting',
  ship: '/humans/ship',
  usage: '/usage',
  settings: '/settings/credentials',
  'agent-usage': '/agents/usage',
  'agent-advisor': '/agents/advisor',
  'agent-standup': '/agents/standup',
  'agent-security': '/agents/security',
};

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
  const [tipIndex, setTipIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Capabilities>('/api/meta/capabilities').then(setCaps, (e: Error) => setError(e.message));
    apiGet<{ tips: Tip[] }>('/api/meta/tips').then(
      ({ tips: loaded }) => setTips(loaded),
      () => undefined,
    );
  }, []);

  useEffect(() => {
    if (tips.length === 0) return;
    const timer = setInterval(() => setTipIndex((i) => (i + 1) % tips.length), TIP_ROTATE_MS);
    return () => clearInterval(timer);
  }, [tips]);

  if (error)
    return (
      <p className="text-[13px] text-muted-foreground">
        Could not load the mode inventory: {error}
      </p>
    );
  if (!caps) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  const humans = caps.categories.find((c) => c.key === 'humans');
  const agents = caps.categories.find((c) => c.key === 'agents');
  const tip = tips[tipIndex];
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

      <p className="text-[11px] font-body uppercase tracking-wide mb-3" style={{ color: humans?.color }}>
        Humans — {humans?.verb}
      </p>
      <CardGrid cards={caps.modes} onOpen={open} />
      <p
        className="text-[11px] font-body uppercase tracking-wide mt-8 mb-3"
        style={{ color: agents?.color }}
      >
        Agents — {agents?.verb}
      </p>
      <CardGrid cards={caps.agents} onOpen={open} />

      {tip && (
        <div
          className="mt-8 flex items-center gap-2 rounded-xl bg-secondary/50 px-4 py-2.5"
          title="rotating tips — the same rotation as the TUI welcome screen"
        >
          <span className="text-[12px] text-muted-foreground">{tip.text}</span>
          {tip.is_beta ? <Badge variant="outline">beta</Badge> : null}
          {!tip.is_beta && tip.is_new ? <Badge variant="outline">new</Badge> : null}
        </div>
      )}
    </>
  );
}

export default function HomePage() {
  return (
    <BackendGate>
      <div className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="font-display text-2xl text-foreground mb-6">Home</h1>
        <HomeBody />
      </div>
    </BackendGate>
  );
}
