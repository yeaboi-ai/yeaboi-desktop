'use client';

// The planning backend's origin, for the one thing the renderer fetches from
// it outside apiFetch: an <img src> for an uploaded screenshot.

import { useEffect, useState } from 'react';
import { getAuth } from '@/lib/api-base';

export function useApiUrl(): string {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let live = true;
    void getAuth().then((auth) => {
      if (live && auth) setUrl(auth.apiUrl);
    });
    return () => {
      live = false;
    };
  }, []);
  return url;
}
