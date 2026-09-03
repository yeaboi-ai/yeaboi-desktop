import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { router } from './app/routes';
import './styles/globals.css';

// macOS runs the window with `titleBarStyle: 'hiddenInset'`, so the traffic
// lights sit over the top-left of the page and the chrome the app draws has to
// leave room for them. The attribute is what globals.css keys `--titlebar-h`
// off; everywhere else the stock frame stays and the reserve is 0.
if (window.yeaboi.platform === 'darwin') {
  document.documentElement.dataset['chrome'] = 'hidden';
}

// The tray or a click on the desktop duck asking the window to show a route.
window.yeaboi.onNavigate((route) => {
  const target = route.startsWith('/') ? route : `/${route}`;
  void router.navigate(target);
});

// The tray's About: the Privacy page doubles as About (statement + shell and
// backend versions), so that gesture finally lands somewhere.
window.yeaboi.onAbout(() => {
  void router.navigate('/privacy');
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
