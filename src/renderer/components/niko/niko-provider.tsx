'use client';

import { createContext, useContext } from 'react';
import { useNiko } from '@/hooks/use-niko';

type NikoContextType = ReturnType<typeof useNiko>;

const NikoContext = createContext<NikoContextType | null>(null);

export function NikoProvider({ children }: { children: React.ReactNode }) {
  const niko = useNiko();
  return <NikoContext.Provider value={niko}>{children}</NikoContext.Provider>;
}

export function useNikoContext() {
  const ctx = useContext(NikoContext);
  if (!ctx) {
    throw new Error('useNikoContext must be used within NikoProvider');
  }
  return ctx;
}
