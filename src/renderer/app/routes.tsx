// The route table. Pages are the planning platform's App Router pages moved
// here verbatim; some take Next's `params: Promise<{...}>` prop, which the
// small wrappers below supply from react-router params.

import { useMemo } from 'react';
import { Navigate, Outlet, createHashRouter, useParams } from 'react-router';
import { Providers } from '@/components/providers';
import { APP_ROUTES } from '@/lib/yeaboi/routes';
import GlobalBoardPage from '@/pages/board-page';
import RecordingPage from '@/pages/recordings/recording-page';
import SharedClipPage from '@/pages/recordings/shared-clip-page';
import SharedRecordingPage from '@/pages/recordings/shared-recording-page';
import AgentsPage from '@/pages/yeaboi/agents/agents-page';
import AnalysisPage from '@/pages/yeaboi/analysis/analysis-page';
import AnalysisResultsPage from '@/pages/yeaboi/analysis/analysis-results-page';
import AnalysisSetupPage from '@/pages/yeaboi/analysis/analysis-setup-page';
import CeremoniesPage from '@/pages/yeaboi/ceremonies/ceremonies-page';
import CeremoniesSlackPage from '@/pages/yeaboi/ceremonies/ceremonies-slack-page';
import FeedbackPage from '@/pages/yeaboi/feedback-page';
import HomePage from '@/pages/yeaboi/home-page';
import PlaceholderPage from '@/pages/yeaboi/placeholder-page';
import ChatPage from '@/pages/yeaboi/planning/chat-page';
import PlanPage from '@/pages/yeaboi/planning/plan-page';
import PlanningPage from '@/pages/yeaboi/planning/planning-page';
import RoadmapPage from '@/pages/yeaboi/planning/roadmap-page';
import PlanningSessionsPage from '@/pages/yeaboi/planning/sessions-page';
import EngineerPage from '@/pages/yeaboi/performance/engineer-page';
import PerformancePage from '@/pages/yeaboi/performance/performance-page';
import PokerBoardPage from '@/pages/yeaboi/poker/poker-board-page';
import PokerPage from '@/pages/yeaboi/poker/poker-page';
import PokerSetupPage from '@/pages/yeaboi/poker/poker-setup-page';
import PrivacyPage from '@/pages/yeaboi/privacy-page';
import ProvenancePage from '@/pages/yeaboi/provenance-page';
import ReportingPage from '@/pages/yeaboi/reporting/reporting-page';
import ReportingSetupPage from '@/pages/yeaboi/reporting/reporting-setup-page';
import ReportingStylePage from '@/pages/yeaboi/reporting/reporting-style-page';
import RetroBoardPage from '@/pages/yeaboi/retro/retro-board-page';
import RetroPage from '@/pages/yeaboi/retro/retro-page';
import StandupPage from '@/pages/yeaboi/standup/standup-page';
import StandupReviewPage from '@/pages/yeaboi/standup/standup-review-page';
import StandupSchedulePage from '@/pages/yeaboi/standup/standup-schedule-page';
import StandupSetupPage from '@/pages/yeaboi/standup/standup-setup-page';
import SetupPage from '@/pages/yeaboi/settings/setup-page';
import YeaboiSettingsPage from '@/pages/yeaboi/settings/yeaboi-settings-page';
import ShipPage from '@/pages/yeaboi/ship/ship-page';
import ShipRunPage from '@/pages/yeaboi/ship/ship-run-page';
import SystemCheckPage from '@/pages/yeaboi/system-check-page';
import UsagePage from '@/pages/yeaboi/usage-page';
import WhatsNewPage from '@/pages/yeaboi/whats-new-page';
import BlueprintPage from '@/pages/projects/blueprint-page';
import BoardSettingsPage from '@/pages/projects/board-settings-page';
import ProjectDetailPage from '@/pages/projects/project-page';
import ProjectPlanPage from '@/pages/projects/project-plan-page';
import ProjectsPage from '@/pages/projects/projects-page';
import SessionCompletedPage from '@/pages/session/session-completed-page';
import NewSessionPage from '@/pages/session/session-new-page';
import SessionPage from '@/pages/session/session-page';
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

// Pages built so far for the yeaboi (TUI-parity) surface; every registry path
// not named here mounts the placeholder so nav, palette and manifest agree.
const YEABOI_PAGES: Record<string, React.ReactElement> = {
  '/home': <HomePage />,
  '/whats-new': <WhatsNewPage />,
  '/feedback': <FeedbackPage />,
  '/privacy': <PrivacyPage />,
  '/system-check': <SystemCheckPage />,
  '/usage': <UsagePage />,
  '/team/planning': <PlanningPage />,
  '/team/planning/chat': <ChatPage />,
  '/team/planning/plan': <PlanPage />,
  '/team/planning/sessions': <PlanningSessionsPage />,
  '/team/planning/roadmap': <RoadmapPage />,
  '/team/ship': <ShipPage />,
  '/team/ship/run': <ShipRunPage />,
  '/team/analysis': <AnalysisPage />,
  '/team/analysis/new': <AnalysisSetupPage />,
  '/team/analysis/results': <AnalysisResultsPage />,
  '/team/standup': <StandupPage />,
  '/team/standup/setup': <StandupSetupPage />,
  '/team/standup/schedule': <StandupSchedulePage />,
  '/team/standup/review': <StandupReviewPage />,
  '/team/reporting': <ReportingPage />,
  '/team/reporting/new': <ReportingSetupPage />,
  '/team/reporting/style': <ReportingStylePage />,
  '/team/performance': <PerformancePage />,
  '/team/performance/engineer': <EngineerPage />,
  '/team/retro': <RetroPage />,
  '/team/retro/board': <RetroBoardPage />,
  '/team/poker': <PokerPage />,
  '/team/poker/new': <PokerSetupPage />,
  '/team/poker/board': <PokerBoardPage />,
  '/agents/usage': <AgentsPage />,
  '/agents/advisor': <AgentsPage />,
  '/agents/standup': <AgentsPage />,
  '/agents/security': <AgentsPage />,
  '/ceremonies': <CeremoniesPage />,
  '/ceremonies/slack': <CeremoniesSlackPage />,
  '/provenance': <ProvenancePage />,
  '/settings/credentials': <YeaboiSettingsPage />,
  '/settings/sharing': <YeaboiSettingsPage />,
  '/settings/system': <YeaboiSettingsPage />,
  '/settings/appearance': <YeaboiSettingsPage />,
  '/settings/duck': <YeaboiSettingsPage />,
  '/setup': <SetupPage />,
};

// Registry paths the planning routes below already serve, and the non-route
// affordances (`action:*`, `dialog:*`) the palette owns.
const NON_PAGE = (path: string) => !path.startsWith('/');
const PLANNING_SERVED = new Set([
  '/projects',
  '/projects/:id',
  '/projects/:id/board-settings',
  '/projects/:id/blueprint',
  '/projects/:id/plan',
  '/projects/:id/sessions/new',
  '/projects/:id/sessions/:sessionId',
  '/projects/:id/sessions/:sessionId/completed',
  '/board',
  '/tickets/:id',
  '/settings',
  '/settings/themes',
  '/settings/themes/edit',
  '/recordings/:id',
  '/recording/:token',
  '/clip/:token',
]);

const yeaboiRoutes = APP_ROUTES.filter(
  (route) => !NON_PAGE(route.path) && !PLANNING_SERVED.has(route.path),
).map((route) => ({
  path: route.path,
  element: YEABOI_PAGES[route.path] ?? <PlaceholderPage />,
}));

export const router = createHashRouter([
  {
    element: <Root />,
    children: [
      { path: '/', element: <Navigate to="/home" replace /> },
      ...yeaboiRoutes,
      { path: '/projects', element: <ProjectsPage /> },
      { path: '/projects/:id', element: <ProjectRoute /> },
      { path: '/projects/:id/board', element: <ProjectBoardRedirect /> },
      { path: '/projects/:id/board-settings', element: <BoardSettingsRoute /> },
      { path: '/projects/:id/blueprint', element: <BlueprintPage /> },
      { path: '/projects/:id/plan', element: <ProjectPlanPage /> },
      { path: '/projects/:id/sessions/new', element: <NewSessionPage /> },
      { path: '/projects/:id/sessions/:sessionId', element: <SessionPage /> },
      { path: '/projects/:id/sessions/:sessionId/completed', element: <SessionCompletedRoute /> },
      { path: '/board', element: <GlobalBoardPage /> },
      { path: '/tickets/:id', element: <TicketRoute /> },
      { path: '/settings', element: <Navigate to="/settings/credentials" replace /> },
      { path: '/settings/themes', element: <ThemesSettingsPage /> },
      { path: '/settings/themes/edit', element: <ThemeEditorPage /> },
      { path: '/recordings/:id', element: <RecordingPage /> },
      { path: '/recording/:token', element: <SharedRecordingPage /> },
      { path: '/clip/:token', element: <SharedClipPage /> },
      { path: '*', element: <Navigate to="/home" replace /> },
    ],
  },
]);
