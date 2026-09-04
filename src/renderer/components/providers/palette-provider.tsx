'use client';

// The palette's open state, held once so the home's field, the title bar's
// magnifier and the Go menu all open the same dialog. The menu owns Cmd+K
// (src/shared/menu.ts), so there is no keydown here: main sends app:palette
// and the window opens on it.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { onPalette } from '@/lib/yeaboi/api';

interface PaletteContextValue {
  isOpen: boolean;
  /** What the field opened with; the dialog seeds its input from it. */
  query: string;
  open: (query?: string) => void;
  close: () => void;
}

const PaletteContext = createContext<PaletteContextValue | null>(null);

export function PaletteProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');

  const open = useCallback((next = '') => {
    setQuery(next);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    if (typeof window.yeaboi?.onPalette !== 'function') return;
    onPalette(() => open());
  }, [open]);

  const value = useMemo(() => ({ isOpen, query, open, close }), [isOpen, query, open, close]);
  return <PaletteContext.Provider value={value}>{children}</PaletteContext.Provider>;
}

export function usePalette(): PaletteContextValue {
  const ctx = useContext(PaletteContext);
  if (!ctx) throw new Error('usePalette must be used within PaletteProvider');
  return ctx;
}
