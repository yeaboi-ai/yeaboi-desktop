'use client';

// Radio, then the three services. One underlined; a service the catalogue has
// not switched on is drawn muted, so the option is visible from here too.

import { Radio } from 'lucide-react';
import type { MusicSourceId } from '@shared/music';
import { MUSIC_SERVICES, SERVICE_LABELS } from '@shared/music-links';
import { ServiceMark } from '@/components/music/service-mark';
import { useMusicPlayer } from '@/components/providers/music-provider';
import { cn } from '@/lib/utils';

export function SourceTabs() {
  const { source, setSource, serviceFor } = useMusicPlayer();
  const tabs: { id: MusicSourceId; label: string; on: boolean; mark: React.ReactNode }[] = [
    { id: 'radio', label: 'Radio', on: true, mark: <Radio className="size-4" aria-hidden /> },
    ...MUSIC_SERVICES.map((service) => ({
      id: service,
      label: SERVICE_LABELS[service],
      on: serviceFor(service)?.connected ?? false,
      mark: <ServiceMark service={service} />,
    })),
  ];
  return (
    <div
      role="tablist"
      aria-label="Source"
      className="flex items-end gap-7 border-b border-border/60"
    >
      {tabs.map((tab) => {
        const active = tab.id === source;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => setSource(tab.id)}
            className={cn(
              '-mb-px flex items-center gap-2 border-b-2 pb-2.5 text-[13.5px] font-body transition-colors duration-200',
              'outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded-t-sm',
              active
                ? 'border-foreground text-foreground'
                : 'border-transparent hover:text-foreground',
              !active && (tab.on ? 'text-muted-foreground' : 'text-muted-foreground/50'),
            )}
          >
            {tab.mark}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
