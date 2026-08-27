// Shim for `next/navigation`, aliased in electron.vite.config.ts. The planning
// UI's pages were written against the App Router; this maps that surface onto
// react-router so those files need no edits.

import { useCallback, useMemo } from 'react';
import {
  useLocation,
  useNavigate,
  useParams as useRouterParams,
  useSearchParams as useRouterSearchParams,
} from 'react-router';

export interface AppRouterInstance {
  push: (href: string) => void;
  replace: (href: string) => void;
  back: () => void;
  forward: () => void;
  refresh: () => void;
  prefetch: (href: string) => void;
}

export function useRouter(): AppRouterInstance {
  const navigate = useNavigate();
  return useMemo(
    () => ({
      push: (href) => void navigate(href),
      replace: (href) => void navigate(href, { replace: true }),
      back: () => void navigate(-1),
      forward: () => void navigate(1),
      // No server components — a "refresh" can only mean re-running loaders,
      // which this app does via its own fetch hooks. No-op is honest here.
      refresh: () => {},
      prefetch: () => {},
    }),
    [navigate],
  );
}

export function useParams<
  T extends Record<string, string | string[]> = Record<string, string>,
>(): T {
  return useRouterParams() as T;
}

export function usePathname(): string {
  return useLocation().pathname;
}

export function useSearchParams(): URLSearchParams {
  const [params] = useRouterSearchParams();
  return params;
}

/** Imperative redirect — Next throws internally; nearest equivalent is a hash
 *  assignment, which the router picks up. Only reachable from event handlers
 *  in this codebase. */
export function redirect(href: string): never {
  window.location.hash = href.startsWith('#') ? href : `#${href}`;
  throw new Error('redirect');
}

export function notFound(): never {
  throw new Error('not found');
}

export function useSelectedLayoutSegment(): string | null {
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function useServerInsertedHTML(_callback: () => unknown): void {}
