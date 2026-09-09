// A rail item's face: a drawn glyph, a persona duck (steel in the Agents
// world, the same split as lib/audience/worlds.tsx), or an uploaded image.

import type { Audience } from '@shared/audience';
import type { RailIcon } from '@shared/rail';
import { PersonaDuckMark } from '@/components/brand/duck';
import { RoboMark } from '@/components/brand/robo';
import { railLucideIcon } from '@/lib/nav/rail-icons';
import { cn } from '@/lib/utils';

export function RailItemIcon({
  icon,
  audience,
  size = 20,
  className,
}: {
  icon: RailIcon;
  audience: Audience;
  /** The glyph's edge in px; a duck draws a little larger, an image fills. */
  size?: number;
  className?: string;
}) {
  switch (icon.kind) {
    case 'lucide': {
      const Icon = railLucideIcon(icon.name);
      return <Icon className={cn('shrink-0', className)} style={{ width: size, height: size }} />;
    }
    case 'persona': {
      const width = Math.round(size * 1.4);
      return <PersonaDuckMark persona={icon.id} size={width} className={className} />;
    }
    case 'image':
      return (
        <img
          src={icon.dataUrl}
          alt=""
          draggable={false}
          className={cn('h-full w-full rounded-[inherit] object-cover', className)}
        />
      );
  }
}
