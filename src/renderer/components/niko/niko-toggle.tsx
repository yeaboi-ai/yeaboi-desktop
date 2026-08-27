'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNikoContext } from './niko-provider';
import { Duck } from '@/components/brand/duck';

export function NikoToggle() {
  const { isOpen, togglePanel } = useNikoContext();

  // Keyboard shortcut: Cmd+. to toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        e.preventDefault();
        togglePanel();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [togglePanel]);

  if (isOpen) return null;

  return (
    <motion.button
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={togglePanel}
      className="fixed bottom-4 right-4 z-50 flex size-12 items-center justify-center rounded-full bg-card ring-1 ring-border shadow-lg shadow-primary/10 transition-shadow hover:shadow-xl hover:shadow-primary/20"
      title="Ask the duck (Cmd+.)"
    >
      <Duck state="idle" size={32} />
    </motion.button>
  );
}
