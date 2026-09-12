// The route table. Pages are the planning platform's App Router pages moved
// here verbatim; some take Next's `params: Promise<{...}>` prop, which the
// small wrappers below supply from react-router params.

import { useMemo, type ReactElement } from 'react';
import { Navigate, Outlet, createHashRouter, useParams } from 'react-router';
import { Providers } from '@/components/providers';
import { TitleBar } from '@/components/title-bar';
import { WindowTitle } from '@/components/window-title';
import { APP_ROUTES, DEFAULT_ROUTE } from '@/lib/yeaboi/routes';
import { isSoloOnlyRoute } from '@shared/audience';
import { useAudience } from '@/components/providers/audience-provider';
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
import HomePage from '@/pages/home/home-page';
import ModeHubPage from '@/pages/hub/mode-hub-page';
import NewPlanPage from '@/pages/planning/new-plan-page';
import PlanningFromRoadmapPage from '@/pages/planning/from-roadmap-page';
import PlanCompletedPage from '@/pages/planning/plan-completed-page';
import PlanRoomPage from '@/pages/planning/room-page';
import NewsPage from '@/pages/news/news-page';
import MusicPage from '@/pages/yeaboi/music-page';
import PlaceholderPage from '@/pages/yeaboi/placeholder-page';
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
import ReviewPage from '@/pages/yeaboi/review/review-page';
import ReviewReportPage from '@/pages/yeaboi/review/review-report-page';
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

function TicketRoute() {
  return <TicketPage params={useParamsPromise<{ id: string }>()} />;
}

// The Humans world became Team; a pre-rename deep link (a tray notice, a
// pinned URL) lands on the same page under its new prefix. The planning
// redirects below then chain for the oldest links of all.
function LegacyHumansRedirect() {
  const { '*': rest } = useParams();
  return <Navigate to={rest ? `/team/${rest}` : '/team'} replace />;
}

// Two redesigns of the workspace ago there were projects, then sessions; now a
// plan is the room. An old deep link keeps its id, so /projects/:id,
// /sessions/:id and the nested /projects/:id/sessions/:sid all land on
// /planning/<id>, whose own not-found copy says the id predates the redesign
// rather than dumping the reader on the hub. A bare link lands on the hub.
function LegacyWorkspaceRedirect() {
  const { '*': rest } = useParams();
  const [first, ...more] = (rest ?? '').split('/').filter(Boolean);
  if (!first) return <Navigate to="/planning" replace />;
  if (first === 'new') {
    const roadmap = more[0] === 'from-roadmap';
    return <Navigate to={roadmap ? '/planning/from-roadmap' : '/planning/new'} replace />;
  }
  const nested = more[0] === 'sessions' && more[1] ? more[1] : first;
  const completed = more.includes('completed');
  return <Navigate to={`/planning/${nested}${completed ? '/completed' : ''}`} replace />;
}

// Providers (theme, identity, Niko, the shell chrome) live inside the router
// so AppShell's usePathname and every page's params resolve.
function Root() {
  return (
    <Providers>
      <WindowTitle />
      <TitleBar />
      <Outlet />
    </Providers>
  );
}

// Pages built so far for the yeaboi (TUI-parity) surface; every registry path
// not named here mounts the placeholder so nav, palette and manifest agree.
const YEABOI_PAGES: Record<string, React.ReactElement> = {
  '/home': <HomePage />,
  '/planning': <ModeHubPage />,
  '/planning/new': <NewPlanPage />,
  '/planning/from-roadmap': <PlanningFromRoadmapPage />,
  '/news': <NewsPage />,
  '/music': <MusicPage />,
  '/whats-new': <WhatsNewPage />,
  '/feedback': <FeedbackPage />,
  '/privacy': <PrivacyPage />,
  '/system-check': <SystemCheckPage />,
  '/usage': <UsagePage />,
  '/team/ship': <ShipPage />,
  '/team/ship/run': <ShipRunPage />,
  '/solo/review': <ReviewPage />,
  '/solo/review/report': <ReviewReportPage />,
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
  '/agents/security': <AgentsPage />,
  '/ceremonies': <CeremoniesPage />,
  '/ceremonies/slack': <CeremoniesSlackPage />,
  '/provenance': <ProvenancePage />,
  '/settings/credentials': <YeaboiSettingsPage />,
  '/settings/news': <YeaboiSettingsPage />,
  '/settings/connections': <YeaboiSettingsPage />,
  '/settings/sharing': <YeaboiSettingsPage />,
  '/settings/system': <YeaboiSettingsPage />,
  '/settings/appearance': <YeaboiSettingsPage />,
  '/settings/duck': <YeaboiSettingsPage />,
  '/settings/music': <YeaboiSettingsPage />,
  '/setup': <SetupPage />,
};

// Registry paths the planning routes below already serve, and the non-route
// affordances (`action:*`, `dialog:*`) the palette owns.
const NON_PAGE = (path: string) => !path.startsWith('/');
const PLANNING_SERVED = new Set([
  '/planning/:id',
  '/planning/:id/completed',
  '/board',
  '/tickets/:id',
  '/settings',
  '/settings/themes',
  '/settings/themes/edit',
  '/recordings/:id',
  '/recording/:token',
  '/clip/:token',
]);

/** A page only the Solo world owns. The guard is on the element, not the route
 *  table, which is built at import — long before the sidecar answers. While the
 *  answer is still owed it holds rather than redirecting, so a cold deep link
 *  into `/agents/usage` survives the handshake. */
function SoloOnly({ children }: { children: ReactElement }) {
  const { soloEnabled, soloKnown } = useAudience();
  if (!soloKnown) return null;
  if (!soloEnabled) return <Navigate to={DEFAULT_ROUTE} replace />;
  return children;
}

const yeaboiRoutes = APP_ROUTES.filter(
  (route) => !NON_PAGE(route.path) && !PLANNING_SERVED.has(route.path),
).map((route) => {
  const element = YEABOI_PAGES[route.path] ?? <PlaceholderPage />;
  return {
    path: route.path,
    element: isSoloOnlyRoute(route.path) ? <SoloOnly>{element}</SoloOnly> : element,
  };
});

export const router = createHashRouter([
  {
    element: <Root />,
    children: [
      { path: '/', element: <Navigate to="/home" replace /> },
      // The run list folded into the home, which lists every mode and what has run.
      { path: '/runs', element: <Navigate to="/home" replace /> },
      ...yeaboiRoutes,
      // The standalone planning pages became the planning hub; anything that
      // still links to them (an old tray notice, muscle memory) lands there
      // rather than on a placeholder.
      {
        path: '/team/planning/roadmap',
        element: <Navigate to="/planning/from-roadmap" replace />,
      },
      { path: '/team/planning/*', element: <Navigate to="/planning" replace /> },
      { path: '/team/planning', element: <Navigate to="/planning" replace /> },
      { path: '/humans/*', element: <LegacyHumansRedirect /> },
      { path: '/humans', element: <LegacyHumansRedirect /> },
      {
        path: '/agents',
        element: (
          <SoloOnly>
            <Navigate to="/agents/usage" replace />
          </SoloOnly>
        ),
      },
      // The workspace's older names: projects, then sessions. Old deep links
      // keep their id and land on the plan, whose not-found copy says what
      // happened when the id predates the redesign.
      { path: '/agents/projects/*', element: <LegacyWorkspaceRedirect /> },
      { path: '/agents/projects', element: <Navigate to="/planning" replace /> },
      { path: '/projects/*', element: <LegacyWorkspaceRedirect /> },
      { path: '/projects', element: <Navigate to="/planning" replace /> },
      { path: '/sessions/*', element: <LegacyWorkspaceRedirect /> },
      { path: '/sessions', element: <Navigate to="/planning" replace /> },
      { path: '/planning/:id', element: <PlanRoomPage /> },
      { path: '/planning/:id/completed', element: <PlanCompletedPage /> },
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
