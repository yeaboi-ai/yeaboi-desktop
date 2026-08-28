'use client';

import { createContext, useContext } from 'react';
import { useScreensaverSuppression } from '@/hooks/use-screensaver-suppression';
import { useNiko } from '@/hooks/use-niko';

type NikoContextType = ReturnType<typeof useNiko>;

const NikoContext = createContext<NikoContextType | null>(null);

export function NikoProvider({ children }: { children: React.ReactNode }) {
  const niko = useNiko();
  // Watching an answer arrive is not being away. Held here rather than in the
  // bar so it covers every consumer, and because a streamed reply can outlive
  // the bar being open.
  useScreensaverSuppression(niko.isStreaming);
  return <NikoContext.Provider value={niko}>{children}</NikoContext.Provider>;
}

export function useNikoContext() {
  const ctx = useContext(NikoContext);
  if (!ctx) {
    throw new Error('useNikoContext must be used within NikoProvider');
  }
  return ctx;
}
