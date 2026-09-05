'use client';

// The window's title bar, drawn by the app so it can hold more than a name:
// back and forward on the left beside the native traffic lights, the world's
// mascot and the page's name in the centre, and Find anything beside the pages
// about the app on the right. The whole strip drags the window; only its
// buttons do not.

import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import {
  ArrowLeft,
  ArrowRight,
  Lock,
  Megaphone,
  MessageSquareText,
  Search,
  Stethoscope,
} from 'lucide-react';
import { DOOR_MASCOT, WORLD_MASCOT } from '@/lib/audience/worlds';
import { doorForPath } from '@/lib/yeaboi/home';
import { useAudience } from '@/components/providers/audience-provider';
import { usePalette } from '@/components/providers/palette-provider';
import { platform } from '@/lib/yeaboi/api';
import { PALETTE_PLACEHOLDER, modGlyph } from '@/lib/yeaboi/palette';
import { pageTitle } from '@/lib/yeaboi/routes';
import { ABOUT_PAGES } from '@shared/menu';
import { updateIndicatorVisible } from '@shared/update';
import { useUpdateState } from '@/hooks/use-update-state';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/** Matches --titlebar-h in globals.css and trafficLightPosition in main. */
export const TITLE_BAR_HEIGHT = 38;

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  '/whats-new': Megaphone,
  '/system-check': Stethoscope,
  '/privacy': Lock,
  '/feedback': MessageSquareText,
};

const DRAG = { WebkitAppRegion: 'drag' } as CSSProperties;
const NO_DRAG = { WebkitAppRegion: 'no-drag' } as CSSProperties;

/** Chromium's Navigation API: the one honest source for whether the window
 *  can go back or forward, hash routes included. */
interface NavigationLike {
  canGoBack: boolean;
  canGoForward: boolean;
  addEventListener: (type: 'currententrychange', listener: () => void) => void;
  removeEventListener: (type: 'currententrychange', listener: () => void) => void;
}

function useHistoryEdges(): { back: boolean; forward: boolean } {
  const [edges, setEdges] = useState({ back: false, forward: false });
  useEffect(() => {
    const navigation = (window as unknown as { navigation?: NavigationLike }).navigation;
    if (!navigation) return;
    const read = () => setEdges({ back: navigation.canGoBack, forward: navigation.canGoForward });
    read();
    navigation.addEventListener('currententrychange', read);
    return () => navigation.removeEventListener('currententrychange', read);
  }, []);
  return edges;
}

const isMac = typeof navigator !== 'undefined' && navigator.platform.startsWith('Mac');

const BUTTON =
  'flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors ' +
  'hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:text-muted-foreground/30 ' +
  'outline-none focus-visible:ring-2 focus-visible:ring-ring/50';

export function TitleBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { audience } = useAudience();
  const { open } = usePalette();
  const edges = useHistoryEdges();
  const updateDot = updateIndicatorVisible(useUpdateState(), null);
  // On a door's screens the door's own duck leads; elsewhere the world's mark.
  const door = doorForPath(pathname);
  const Mascot = door ? DOOR_MASCOT[audience][door] : WORLD_MASCOT[audience];

  return (
    <header
      className="fixed inset-x-0 top-0 z-[60] flex select-none items-center border-b border-border/60 bg-background"
      style={{ height: TITLE_BAR_HEIGHT, ...DRAG }}
    >
      {/* The traffic lights sit in the strip on macOS; leave them their room. */}
      <div
        className={cn('flex items-center gap-0.5', isMac ? 'pl-[84px]' : 'pl-3')}
        style={NO_DRAG}
      >
        <button
          type="button"
          className={BUTTON}
          disabled={!edges.back}
          onClick={() => navigate(-1)}
          aria-label="Back"
          title="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={!edges.forward}
          onClick={() => navigate(1)}
          aria-label="Forward"
          title="Forward"
        >
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      <div className="pointer-events-none absolute inset-x-0 flex items-center justify-center gap-2 text-[13px] font-body font-medium text-foreground">
        <Mascot size={18} />
        <span>{pageTitle(pathname)}</span>
      </div>

      {/* On Windows and Linux the native window controls overlay the right end. */}
      <TooltipProvider>
        <div
          className={cn('ml-auto flex items-center gap-0.5', isMac ? 'pr-3' : 'pr-[150px]')}
          style={NO_DRAG}
        >
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  className={BUTTON}
                  onClick={() => open()}
                  aria-label={PALETTE_PLACEHOLDER}
                />
              }
            >
              <Search className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent>
              {PALETTE_PLACEHOLDER}, {modGlyph(platform())}K
            </TooltipContent>
          </Tooltip>
          {ABOUT_PAGES.map((page) => {
            const Icon = ICONS[page.route];
            const lit = pathname === page.route || pathname.startsWith(`${page.route}/`);
            const dot = page.route === '/whats-new' && updateDot;
            return (
              <Tooltip key={page.route}>
                <TooltipTrigger
                  render={
                    <Link
                      to={page.route}
                      aria-label={page.label}
                      aria-current={lit ? 'page' : undefined}
                      className={cn(BUTTON, 'relative', lit && 'bg-secondary text-foreground')}
                    />
                  }
                >
                  {Icon && <Icon className="h-4 w-4" />}
                  {dot && (
                    <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-amber-400" />
                  )}
                </TooltipTrigger>
                <TooltipContent>
                  {page.label}
                  {dot && ', an update is ready'}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>
    </header>
  );
}
