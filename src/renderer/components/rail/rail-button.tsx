'use client';

// One square of the rail. A circle at rest that squares off under the
// pointer or when lit, with a pill on the rail's edge in the world's accent —
// the shape the reader already knows from Discord's server column. The label
// lives in a tooltip to the right; the button itself carries no text.

import type { MouseEventHandler, ReactNode } from 'react';
import Link from 'next/link';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export const RAIL_BUTTON_SIZE = 48;

const FACE =
  'group/rail relative flex items-center justify-center overflow-hidden ' +
  'rounded-3xl bg-secondary/50 text-muted-foreground transition-[border-radius,background-color,color] duration-150 ' +
  'hover:rounded-2xl hover:bg-secondary hover:text-foreground ' +
  'outline-none focus-visible:ring-2 focus-visible:ring-ring/50';

export function RailButton({
  label,
  lit = false,
  href,
  onClick,
  onContextMenu,
  dashed = false,
  ring = false,
  className,
  children,
  'aria-label': ariaLabel,
}: {
  /** The tooltip, and the accessible name when no aria-label is given. */
  label: ReactNode;
  lit?: boolean;
  /** A route to open; without one the square is a button. */
  href?: string;
  onClick?: MouseEventHandler<HTMLElement>;
  onContextMenu?: MouseEventHandler<HTMLElement>;
  /** The "+": an outline rather than a filled face. */
  dashed?: boolean;
  /** The Cmd-held cue: an inset ring on the lit square. */
  ring?: boolean;
  className?: string;
  children: ReactNode;
  'aria-label'?: string;
}) {
  const name = ariaLabel ?? (typeof label === 'string' ? label : undefined);
  const faceClass = cn(
    FACE,
    lit && 'rounded-2xl text-foreground',
    dashed && 'bg-transparent ring-1 ring-inset ring-dashed ring-border hover:ring-foreground/40',
    className,
  );
  const faceStyle = {
    width: RAIL_BUTTON_SIZE,
    height: RAIL_BUTTON_SIZE,
    background: lit ? 'var(--audience-tint)' : undefined,
    boxShadow: lit && ring ? 'inset 0 0 0 1px var(--primary)' : undefined,
  };
  const face = href ? (
    <Link
      href={href}
      aria-label={name}
      aria-current={lit ? 'page' : undefined}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={faceClass}
      style={faceStyle}
    />
  ) : (
    <button
      type="button"
      aria-label={name}
      aria-pressed={lit || undefined}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={faceClass}
      style={faceStyle}
    />
  );

  return (
    <div
      className="group/slot relative flex items-center justify-center"
      data-lit={lit || undefined}
    >
      {/* The pill: a dot on hover, a bar when lit. */}
      <span
        aria-hidden
        data-audience-accented
        className={cn(
          'pointer-events-none absolute -left-3 top-1/2 w-1 -translate-y-1/2 rounded-r-full transition-[height,opacity] duration-150',
          lit ? 'h-6 opacity-100' : 'h-2 opacity-0 group-hover/slot:opacity-100',
        )}
        style={{ background: 'var(--audience-accent)' }}
      />
      <Tooltip>
        <TooltipTrigger render={face}>{children}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={10}>
          {label}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
