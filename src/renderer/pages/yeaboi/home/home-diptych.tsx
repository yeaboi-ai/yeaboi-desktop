'use client';

// The home: two words and two ducks. Projects on the left, Sessions on the
// right, and between them the pond, where each door's duck swims. The whole
// product idea is that these are the two ways to work, so the home's one job
// is that choice, and it says nothing else: the words open the lists, the
// ducks open the same lists, and everything a list holds lives on its screen.

import { useRef } from 'react';
import Link from 'next/link';
import { useAudience } from '@/components/providers/audience-provider';
import { Pond, type PondHandle } from '@/components/yeaboi/pond';
import { doorHref, doorWord, type Door } from '@/lib/yeaboi/home';

function Word({
  door,
  href,
  heading,
  onReach,
  className,
}: {
  door: Door;
  href: string;
  heading: 'h1' | 'h2';
  onReach: (door: Door | null) => void;
  className?: string;
}) {
  const Heading = heading;
  return (
    <Link
      href={href}
      className={`group inline-block ${className ?? ''}`}
      onMouseEnter={() => onReach(door)}
      onMouseLeave={() => onReach(null)}
      onFocus={() => onReach(door)}
      onBlur={() => onReach(null)}
    >
      <Heading className="font-display italic text-[64px] leading-none text-foreground transition-colors group-hover:text-primary group-focus-visible:text-primary">
        {doorWord(door)}
      </Heading>
    </Link>
  );
}

export function HomeDiptych() {
  const { audience } = useAudience();
  const pond = useRef<PondHandle>(null);
  const hrefs: Record<Door, string> = {
    projects: doorHref('projects', audience),
    sessions: doorHref('sessions', audience),
  };
  const reach = (door: Door | null): void => pond.current?.forward(door);

  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center gap-8 md:min-h-[68vh] md:flex-row md:gap-6">
      <Word
        door="projects"
        href={hrefs.projects}
        heading="h1"
        onReach={reach}
        className="animate-slide-up stagger-1 md:shrink-0"
      />
      <Pond ref={pond} hrefs={hrefs} className="h-[240px] w-full min-w-0 md:h-[320px] md:flex-1" />
      <Word
        door="sessions"
        href={hrefs.sessions}
        heading="h2"
        onReach={reach}
        className="animate-slide-up stagger-1 md:shrink-0"
      />
    </div>
  );
}
