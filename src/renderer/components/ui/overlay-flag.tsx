'use client';

// Rendered *inside* a popup, never beside it: a sheet's content component is
// mounted for as long as its page is, and only the popup itself comes and goes
// with the open state. Flagging from anywhere else leaves the page unable to
// scroll after the first sheet it ever drew.

import { useEffect } from 'react';

import { markOverlay } from '@/lib/overlay';

export function OverlayFlag({ name }: { name: string }) {
  useEffect(() => markOverlay(name), [name]);
  return null;
}
