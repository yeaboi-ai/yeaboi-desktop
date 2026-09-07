'use client';

// A dock button that changes job in front of you.
//
// Both faces are here and one of them is always leaving: the icon winds a
// quarter turn out as the arrow swings in, rather than the two swapping
// between frames.

import { cloneElement } from 'react';
import { ArrowLeft } from 'lucide-react';

export function SwapIcon({ away, back }: { away: React.ReactElement; back: boolean }) {
  const face = 'absolute h-[14px] w-[14px] transition-all duration-200 ease-out';
  return (
    <span className="relative flex h-[14px] w-[14px] items-center justify-center">
      {cloneElement(away as React.ReactElement<{ className?: string; 'aria-hidden'?: boolean }>, {
        'aria-hidden': true,
        className: `${face} ${back ? 'rotate-90 scale-75 opacity-0' : 'rotate-0 scale-100 opacity-100'}`,
      })}
      <ArrowLeft
        aria-hidden
        className={`${face} ${
          back ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-75 opacity-0'
        }`}
      />
    </span>
  );
}
