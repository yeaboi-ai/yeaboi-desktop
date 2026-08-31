'use client';

// The audience question, asked once: the TUI's landing split ("Who are we
// working with today?") translated to the desktop. Three worlds — the solo
// duck, the team trio and the robo — and the selected one is the bright one,
// exactly the TUI's cue (the resting mascot renders shaded, the chosen one
// steps forward).
//
// Copy is hardcoded, not fetched: this screen shows before the sidecar is up,
// and a first paint must never be a spinner. Source of truth for the words is
// the TUI's _CATEGORY_CARDS (src/yeaboi/ui/mode_select/screens/
// _screens_category.py in yeaboi.ai).

import { useEffect, useRef, useState } from 'react';
import { DuckMark } from '@/components/brand/duck';
import { RoboMark } from '@/components/brand/robo';
import { TeamMark } from '@/components/brand/team';
import type { Audience } from '@shared/audience';

interface WorldCard {
  key: Audience;
  title: string;
  verb: string;
  capabilities: string[];
  accent: string;
  accentBright: string;
  mascot: (props: { size: number }) => React.ReactElement;
}

const WORLDS: WorldCard[] = [
  {
    key: 'solo',
    title: 'Solo',
    verb: 'Run your own show',
    capabilities: ['planning', 'standups', 'analysis', 'reports'],
    accent: 'rgb(210, 168, 80)',
    accentBright: 'rgb(245, 200, 110)',
    mascot: ({ size }) => <DuckMark state="idle" size={size} />,
  },
  {
    key: 'team',
    title: 'Team',
    verb: "Run your team's scrum",
    capabilities: ['planning', 'standups', 'retros', 'poker', 'reviews'],
    accent: 'rgb(100, 180, 100)',
    accentBright: 'rgb(80, 220, 120)',
    mascot: ({ size }) => <TeamMark size={size} />,
  },
  {
    key: 'agents',
    title: 'Agents',
    verb: 'Watch your AI agents work',
    capabilities: ['cost', 'recoverable spend', 'daily digests', 'security posture'],
    accent: 'rgb(90, 160, 210)',
    accentBright: 'rgb(130, 200, 255)',
    mascot: ({ size }) => <RoboMark size={size} />,
  },
];

export function AudienceChooser({ onChoose }: { onChoose: (audience: Audience) => void }) {
  const [selected, setSelected] = useState<Audience>('team');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  const move = (delta: number) => {
    const index = WORLDS.findIndex((world) => world.key === selected);
    const next = WORLDS[(index + delta + WORLDS.length) % WORLDS.length]!;
    setSelected(next.key);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'Tab') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onChoose(selected);
    }
  };

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-[300] bg-background flex flex-col items-center justify-center px-8 outline-none"
    >
      <h1 className="font-display italic text-3xl md:text-4xl text-foreground text-center">
        Who are we working with today?
      </h1>

      <div
        role="radiogroup"
        aria-label="Audience"
        className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-5 w-full max-w-5xl"
      >
        {WORLDS.map((world) => {
          const active = world.key === selected;
          const Mascot = world.mascot;
          return (
            <button
              key={world.key}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={-1}
              onClick={() => {
                setSelected(world.key);
                onChoose(world.key);
              }}
              onMouseEnter={() => setSelected(world.key)}
              className="rounded-2xl bg-card px-8 py-10 text-center transition-all duration-200 flex flex-col items-center"
              style={{
                boxShadow: active
                  ? `inset 0 0 0 2px ${world.accentBright}`
                  : 'inset 0 0 0 1px var(--border)',
                background: active
                  ? `color-mix(in srgb, ${world.accent} 8%, var(--card))`
                  : 'var(--card)',
                opacity: active ? 1 : 0.55,
              }}
            >
              <Mascot size={96} />
              <h2
                className="mt-6 font-display text-2xl"
                style={{ color: active ? world.accentBright : 'var(--foreground)' }}
              >
                {world.title}
              </h2>
              <p className="mt-1.5 text-[13px] font-body text-foreground">{world.verb}</p>
              <p className="mt-4 text-[12px] font-body text-muted-foreground leading-relaxed">
                {world.capabilities.join(' · ')}
              </p>
            </button>
          );
        })}
      </div>

      <p className="mt-10 text-[12px] font-body text-muted-foreground">
        You can switch any time from the sidebar.
      </p>
      <p className="mt-1 text-[11px] font-body text-muted-foreground/60">
        ←/→ switch · Enter choose
      </p>
    </div>
  );
}
