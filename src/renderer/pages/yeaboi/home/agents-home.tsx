'use client';

// The Agents world's landing: the agentwatch family as four full-width doors,
// each stamped with its latest saved report so opening a mode lands on real
// findings, matching the routes' open-on-last-saved rule. No tip companion
// here — tips are mode-discovery for the scrum modes.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { apiGet } from '@/lib/yeaboi/api';
import { loadAgentLatest, loadAgentModes } from '@/lib/yeaboi/ops';
import { RoboMark } from '@/components/brand/robo';
import { BetaChip } from '@/components/yeaboi/beta-chip';
import { type ModeCard } from '@/components/yeaboi/mode-card-grid';
import { MODE_ROUTES } from '@/lib/yeaboi/tips';

interface CategoryCard {
  key: string;
  title: string;
  verb: string;
  color: string;
}

interface Capabilities {
  categories: CategoryCard[];
  modes: ModeCard[];
  agents: ModeCard[];
}

/** `agent-usage` the card, `usage` the API kind. */
const kindOf = (key: string) => key.replace(/^agent-/, '');

function asOfLabel(asOf: string): string {
  const stamp = new Date(asOf);
  return Number.isNaN(stamp.getTime()) ? asOf : stamp.toLocaleDateString();
}

export function AgentsHome() {
  const router = useRouter();
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [latest, setLatest] = useState<Record<string, string>>({});
  const [betaNotice, setBetaNotice] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Capabilities>('/api/meta/capabilities').then(setCaps, (e: Error) => setError(e.message));
    loadAgentModes().then(
      ({ beta_notice }) => setBetaNotice(beta_notice),
      () => undefined,
    );
  }, []);

  useEffect(() => {
    if (!caps) return;
    for (const card of caps.agents) {
      loadAgentLatest(kindOf(card.key)).then(
        ({ report, as_of }) => {
          if (report) setLatest((prev) => ({ ...prev, [card.key]: asOfLabel(as_of) }));
        },
        () => undefined,
      );
    }
  }, [caps]);

  if (error)
    return (
      <p className="text-[13px] text-muted-foreground">
        Could not load the mode inventory: {error}
      </p>
    );
  if (!caps) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  const agents = caps.categories.find((c) => c.key === 'agents');
  const open = (key: string) => {
    const route = MODE_ROUTES[key];
    if (route) router.push(route);
  };

  return (
    <>
      {/* The robo fronts his own world the way the hero door fronts Team. */}
      <div className="rounded-2xl bg-card ring-1 ring-border/60 px-8 py-7 mb-6 flex items-center gap-6">
        <RoboMark size={72} className="shrink-0" />
        <div>
          <p
            data-audience-accented
            className="text-[11px] font-body uppercase tracking-wide inline-flex items-center gap-2"
            style={{ color: 'var(--audience-accent)' }}
          >
            Agents
            <BetaChip />
          </p>
          <h2 className="font-display text-xl text-foreground mt-0.5">
            {agents?.verb ?? 'Watch your AI agents work'}
          </h2>
          <p className="text-[12.5px] text-muted-foreground leading-relaxed mt-1.5 max-w-xl">
            The agentwatch family reads the AI coding agents working across your projects — computed
            locally from their session logs. Each mode opens on its latest saved report.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {caps.agents.map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={() => open(card.key)}
            className="rounded-2xl bg-card ring-1 ring-border/60 px-6 py-6 text-left transition-colors hover:ring-primary/40 hover:bg-secondary/40 flex flex-col"
          >
            <h3 className="flex items-center gap-2.5 text-[14px] font-body font-medium text-foreground">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                style={{ background: card.color }}
              />
              {card.title}
            </h3>
            <p className="mt-2 text-[12.5px] text-muted-foreground leading-relaxed flex-1">
              {card.description}
            </p>
            <p className="mt-4 flex items-center justify-between text-[11.5px] font-body text-muted-foreground/70">
              <span>
                {latest[card.key]
                  ? `last report · ${latest[card.key]}`
                  : 'no report yet — open to run the first one'}
              </span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0" />
            </p>
          </button>
        ))}
      </div>

      {betaNotice && (
        <p className="mt-6 text-[11.5px] font-body text-muted-foreground/70 leading-relaxed">
          {betaNotice}
        </p>
      )}
    </>
  );
}
