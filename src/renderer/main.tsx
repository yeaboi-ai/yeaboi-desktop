import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { router } from './app/routes';
import './styles/globals.css';

// The tray or a click on the desktop duck asking the window to show a route.
window.yeaboi.onNavigate((route) => {
  const target = route.startsWith('/') ? route : `/${route}`;
  void router.navigate(target);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
