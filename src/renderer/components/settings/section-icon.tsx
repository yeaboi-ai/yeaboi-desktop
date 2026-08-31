import { HardDrive, Lock, Mic, Share2, SlidersHorizontal, Sunrise } from 'lucide-react';

const SECTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  sharing: Share2,
  storage: HardDrive,
  standup: Sunrise,
  voice: Mic,
  privacy: Lock,
  advanced: SlidersHorizontal,
};

/** A section of this machine wears a drawn glyph; a service wears its logomark. */
export function SectionIcon({ section }: { section: string }) {
  const Icon = SECTION_ICONS[section];
  if (!Icon) return null;
  return (
    <span
      aria-hidden
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary/60 text-foreground/70 ring-1 ring-border/40"
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}
