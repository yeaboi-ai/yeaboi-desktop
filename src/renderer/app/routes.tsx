// The route table. Pages are the planning platform's App Router pages moved
// here verbatim; some take Next's `params: Promise<{...}>` prop, which the
// small wrappers below supply from react-router params.

import { useMemo } from 'react';
import { Navigate, Outlet, createHashRouter, useParams } from 'react-router';
import { Providers } from '@/components/providers';
import GlobalBoardPage from '@/pages/board-page';
import BlueprintPage from '@/pages/projects/blueprint-page';
import BoardSettingsPage from '@/pages/projects/board-settings-page';
import ProjectDetailPage from '@/pages/projects/project-page';
import ProjectsPage from '@/pages/projects/projects-page';
import SessionCompletedPage from '@/pages/session/session-completed-page';
import NewSessionPage from '@/pages/session/session-new-page';
import SessionPage from '@/pages/session/session-page';
import SettingsPage from '@/pages/settings/settings-page';
import ThemeEditorPage from '@/pages/settings/theme-edit-page';
import ThemesSettingsPage from '@/pages/settings/themes-page';
import TicketPage from '@/pages/ticket-page';

/** Next pages written for the App Router take `params` as a promise and
 *  unwrap it with React's use(). Keep the promise stable across renders. */
function useParamsPromise<T extends Record<string, string>>(): Promise<T> {
  const params = useParams();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => Promise.resolve(params as T), [JSON.stringify(params)]);
}

function ProjectRoute() {
  return <ProjectDetailPage params={useParamsPromise<{ id: string }>()} />;
}

function BoardSettingsRoute() {
  return <BoardSettingsPage params={useParamsPromise<{ id: string }>()} />;
}

function SessionCompletedRoute() {
  return <SessionCompletedPage params={useParamsPromise<{ id: string; sessionId: string }>()} />;
}

function TicketRoute() {
  return <TicketPage params={useParamsPromise<{ id: string }>()} />;
}

function ProjectBoardRedirect() {
  const { id } = useParams();
  return <Navigate to={`/board?project=${id}`} replace />;
}

// Providers (theme, identity, Niko, the shell chrome) live inside the router
// so AppShell's usePathname and every page's params resolve.
function Root() {
  return (
    <Providers>
      <Outlet />
    </Providers>
  );
}

export const router = createHashRouter([
  {
    element: <Root />,
    children: [
      { path: '/', element: <Navigate to="/projects" replace /> },
      { path: '/projects', element: <ProjectsPage /> },
      { path: '/projects/:id', element: <ProjectRoute /> },
      { path: '/projects/:id/board', element: <ProjectBoardRedirect /> },
      { path: '/projects/:id/board-settings', element: <BoardSettingsRoute /> },
      { path: '/projects/:id/blueprint', element: <BlueprintPage /> },
      { path: '/projects/:id/sessions/new', element: <NewSessionPage /> },
      { path: '/projects/:id/sessions/:sessionId', element: <SessionPage /> },
      { path: '/projects/:id/sessions/:sessionId/completed', element: <SessionCompletedRoute /> },
      { path: '/board', element: <GlobalBoardPage /> },
      { path: '/tickets/:id', element: <TicketRoute /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '/settings/themes', element: <ThemesSettingsPage /> },
      { path: '/settings/themes/edit', element: <ThemeEditorPage /> },
      { path: '*', element: <Navigate to="/projects" replace /> },
    ],
  },
]);
