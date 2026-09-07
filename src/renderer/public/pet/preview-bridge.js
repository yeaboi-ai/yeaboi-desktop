// The pet bridge, for the copy of the duck that runs inside the app window.
//
// pet.js talks to the main process through `window.pet`; here prefs, config and
// the cursor arrive from the parent page over postMessage, and everything that
// needs a desktop is a no-op. Nothing in pet.js changes, so the duck previewed
// on the settings page behaves exactly like the one on the desktop.

(() => {
  const on = {};
  window.pet = {
    onConfig: (fn) => (on.config = fn),
    onCursor: (fn) => (on.cursor = fn),
    onPrefs: (fn) => (on.prefs = fn),
    onRecenter: () => {},
    onArrive: () => {},
    onHome: () => {},
    onNotice: () => {},
    /** The parent turns the strip's pointer-events on and off with this, the
     *  way the main process makes the pet window solid over the duck. */
    setInteractive: (over) => parent.postMessage({ pet: 'interactive', over }, '*'),
    tookOver: () => {},
    introDone: () => {},
    open: () => {},
  };
  // The cursor feed, from whichever side of the frame the pointer is on: the
  // parent posts it while the strip is transparent to clicks, and this listener
  // takes over the moment the strip goes solid over the duck — which is exactly
  // when a drag is happening, and a drag follows the feed, not the mouse event.
  addEventListener(
    'mousemove',
    (event) => on.cursor?.({ x: event.clientX, y: event.clientY }),
    true,
  );

  addEventListener('message', (event) => {
    const data = event.data || {};
    if (data.pet === 'prefs') on.prefs?.(data.prefs);
    else if (data.pet === 'cursor') on.cursor?.(data.point);
    else if (data.pet === 'config') on.config?.(data.config);
  });
})();
