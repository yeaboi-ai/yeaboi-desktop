// The menu-bar duck. One tray for the whole app — the pet's own tray from the
// prototype folds in here, because two duck icons in one menu bar is a bug.
//
// It is also what makes the pet possible: the window can be closed while the
// duck stays on screen, so something has to be able to bring the app back and
// to quit it. That is this menu.

import { Menu, Tray, app, nativeImage } from 'electron';
import trayIconPath from '../../resources/duck-tray.png?asset';
// The macOS menu bar paints template images itself, so the duck goes in as
// alpha only and comes out right in light mode, dark mode and under a tint.
// Its @2x sibling ships beside it in resources/ and Electron picks it up by
// name — an import would only re-emit the same file under a second one.
import trayTemplatePath from '../../resources/duck-trayTemplate.png?asset';
import { updateLabel, type UpdateState } from '../shared/update';

/** Menu-bar icons are measured in points; 20 is the conventional height. */
const TRAY_ICON_SIZE = 20;

export interface TrayActions {
  open: () => void;
  about: () => void;
  update: () => void;
  togglePet: (enabled: boolean) => void;
  /** Raise or lower where the duck's feet sit, in pixels. Persisted. */
  nudgePet: (delta: number) => void;
  recenterPet: () => void;
  /** Open the app on the duck's settings tab. */
  petSettings: () => void;
  quit: () => void;
}

export class AppTray {
  private tray: Tray | null = null;
  private petEnabled = false;
  private update: UpdateState = { kind: 'idle' };

  constructor(private readonly actions: TrayActions) {}

  create(petEnabled: boolean): void {
    this.petEnabled = petEnabled;
    const template = process.platform === 'darwin';
    const icon = nativeImage
      .createFromPath(template ? trayTemplatePath : trayIconPath)
      .resize({ width: TRAY_ICON_SIZE, height: TRAY_ICON_SIZE });
    icon.setTemplateImage(template);
    this.tray = new Tray(icon);
    this.tray.setToolTip(app.getName());
    this.tray.on('click', () => this.actions.open());
    this.render();
  }

  /** Re-read the pet state onto the menu (a checkbox that lies is worse than
   *  no checkbox — the toggle can also be flipped from the app's own settings). */
  setPetEnabled(enabled: boolean): void {
    this.petEnabled = enabled;
    this.render();
  }

  setUpdateState(state: UpdateState): void {
    this.update = state;
    this.render();
  }

  destroy(): void {
    this.tray?.destroy();
    this.tray = null;
  }

  private render(): void {
    if (!this.tray) return;
    // One name for every label: app.getName() is package.json's productName.
    const name = app.getName();
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: `Open ${name}`, click: () => this.actions.open() },
        { type: 'separator' },
        {
          label: 'Duck on the desktop',
          type: 'checkbox',
          checked: this.petEnabled,
          click: (item) => this.actions.togglePet(item.checked),
        },
        // The nudges only mean something while there is a duck to nudge.
        { label: 'Sit higher', enabled: this.petEnabled, click: () => this.actions.nudgePet(6) },
        { label: 'Sit lower', enabled: this.petEnabled, click: () => this.actions.nudgePet(-6) },
        { label: 'Come here', enabled: this.petEnabled, click: () => this.actions.recenterPet() },
        { label: 'Duck settings…', click: () => this.actions.petSettings() },
        { type: 'separator' },
        { label: `${name} ${app.getVersion()}`, enabled: false },
        {
          label: updateLabel(this.update, name),
          enabled: this.update.kind !== 'unsupported',
          click: () => this.actions.update(),
        },
        { label: `About ${name}`, click: () => this.actions.about() },
        { label: `Quit ${name}`, click: () => this.actions.quit() },
      ]),
    );
  }
}
