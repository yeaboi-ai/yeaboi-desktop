'use client';

// The native title bar shows the page's name, the way a document window
// shows its document: the app's name is in the menu bar already.

import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { pageTitle } from '@/lib/yeaboi/routes';

export function WindowTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = pageTitle(pathname);
  }, [pathname]);
  return null;
}
