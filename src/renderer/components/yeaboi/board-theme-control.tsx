'use client';

// The window's own theme menu, in the row the board keeps for one.
//
// The board ships a palette switcher of five themes, and it is the right one
// when the board is a page in somebody's browser. Staged in this window the
// board draws in the app's colours — `StagedBoard`'s `INHERIT` hands them down
// under the board's own names — so the board's palette has nothing left to
// change here, and the menu that does is the app's.

import { ThemeSwitcher } from '@/components/theme-switcher';

export function BoardThemeControl() {
  return (
    // `data-app-chrome` stops the board's scoped reset, which would otherwise
    // strip this control's padding. The icon is sized up to the dock's 16px.
    <div data-app-chrome className="flex items-center [&_svg]:size-4">
      <ThemeSwitcher />
    </div>
  );
}
