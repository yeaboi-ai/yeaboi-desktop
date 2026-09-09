// The application menu. It replaces Electron's stock one with menus named by
// what they hold — Go, World, Duck, Updates, Privacy, Feedback — so every page
// about the app has a home in the menu bar rather than in the rail. The
// stateful items (the world radio, the duck checkbox, the update line) are
// re-rendered whenever their state changes, the way the tray menu is.

import { Menu, app, type MenuItemConstructorOptions } from 'electron';
import { audiencesShown, WORLD_COPY, type Audience } from '../shared/audience';
import {
  FEEDBACK_PAGES,
  FILE_PAGES,
  MUSIC_COMMANDS,
  MUSIC_PAGES,
  PALETTE_COMMAND,
  PRIVACY_PAGES,
  UPDATES_PAGES,
  goPages,
  type MenuPage,
  type MusicCommandId,
} from '../shared/menu';
import { updateLabel, type UpdateState } from '../shared/update';

export interface MenuActions {
  open: (route: string) => void;
  palette: () => void;
  about: () => void;
  update: () => void;
  setAudience: (audience: Audience) => void;
  togglePet: (enabled: boolean) => void;
  recenterPet: () => void;
  petSettings: () => void;
  music: (id: MusicCommandId) => void;
}

const separator: MenuItemConstructorOptions = { type: 'separator' };

export class AppMenu {
  private audience: Audience = 'team';
  // The Solo world is off until the sidecar says otherwise, so a menu built
  // before the handshake never names a world the build does not have.
  private solo = false;
  private petEnabled = false;
  private update: UpdateState = { kind: 'idle' };

  constructor(private readonly actions: MenuActions) {}

  install(state: { audience: Audience | undefined; petEnabled: boolean }): void {
    this.audience = state.audience ?? 'team';
    this.petEnabled = state.petEnabled;
    this.render();
  }

  setAudience(audience: Audience): void {
    if (audience === this.audience) return;
    this.audience = audience;
    this.render();
  }

  setSoloEnabled(enabled: boolean): void {
    if (enabled === this.solo) return;
    this.solo = enabled;
    this.render();
  }

  setPetEnabled(enabled: boolean): void {
    this.petEnabled = enabled;
    this.render();
  }

  setUpdateState(state: UpdateState): void {
    this.update = state;
    this.render();
  }

  private render(): void {
    Menu.setApplicationMenu(Menu.buildFromTemplate(this.template()));
  }

  private page(page: MenuPage): MenuItemConstructorOptions {
    return {
      label: page.label,
      accelerator: page.accelerator,
      click: () => this.actions.open(page.route),
    };
  }

  private template(): MenuItemConstructorOptions[] {
    const name = app.getName();
    const mac = process.platform === 'darwin';
    const about: MenuItemConstructorOptions = {
      label: `About ${name}`,
      click: () => this.actions.about(),
    };
    const settings: MenuItemConstructorOptions = {
      label: 'Settings…',
      accelerator: 'CmdOrCtrl+,',
      click: () => this.actions.open('/settings'),
    };

    const appMenu: MenuItemConstructorOptions[] = mac
      ? [
          {
            label: name,
            submenu: [
              about,
              separator,
              settings,
              separator,
              { role: 'services' },
              separator,
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              separator,
              { role: 'quit' },
            ],
          },
        ]
      : [];

    const file: MenuItemConstructorOptions = {
      label: 'File',
      submenu: [
        ...FILE_PAGES.map((page) => this.page(page)),
        separator,
        ...(mac ? [{ role: 'close' } as const] : [settings, separator, { role: 'quit' } as const]),
      ],
    };

    // One world is not a choice, so the menu goes rather than offering a radio
    // group of one.
    const worlds = audiencesShown(this.solo);
    const world: MenuItemConstructorOptions[] =
      worlds.length > 1
        ? [
            {
              label: 'World',
              submenu: worlds.map((audience) => ({
                label: WORLD_COPY[audience].title,
                type: 'radio',
                checked: audience === this.audience,
                click: () => this.actions.setAudience(audience),
              })),
            },
          ]
        : [];

    const duck: MenuItemConstructorOptions = {
      label: 'Duck',
      submenu: [
        {
          label: 'Duck on the desktop',
          type: 'checkbox',
          checked: this.petEnabled,
          click: (item) => this.actions.togglePet(item.checked),
        },
        { label: 'Come here', enabled: this.petEnabled, click: () => this.actions.recenterPet() },
        separator,
        { label: 'Duck settings…', click: () => this.actions.petSettings() },
      ],
    };

    const music: MenuItemConstructorOptions = {
      label: 'Music',
      submenu: [
        ...MUSIC_COMMANDS.map((command) => ({
          label: command.label,
          accelerator: command.accelerator,
          click: () => this.actions.music(command.id),
        })),
        separator,
        ...MUSIC_PAGES.map((page) => this.page(page)),
      ],
    };

    const updates: MenuItemConstructorOptions = {
      label: 'Updates',
      submenu: [
        ...UPDATES_PAGES.map((page) => this.page(page)),
        separator,
        {
          label: updateLabel(this.update, name),
          enabled: this.update.kind !== 'unsupported',
          click: () => this.actions.update(),
        },
      ],
    };

    // Reload and the devtools only in an unpackaged run: they are the
    // developer's, and a released app has no View menu to hide them in.
    const window: MenuItemConstructorOptions = {
      role: 'window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { role: 'togglefullscreen' },
        ...(mac ? [separator, { role: 'front' } as const] : []),
        ...(app.isPackaged
          ? []
          : [separator, { role: 'reload' } as const, { role: 'toggleDevTools' } as const]),
      ],
    };

    return [
      ...appMenu,
      file,
      { role: 'editMenu' },
      {
        label: 'Go',
        submenu: [
          {
            label: PALETTE_COMMAND.label,
            accelerator: PALETTE_COMMAND.accelerator,
            click: () => this.actions.palette(),
          },
          separator,
          ...goPages(this.audience).map((page) => this.page(page)),
        ],
      },
      ...world,
      duck,
      music,
      updates,
      { label: 'Privacy', submenu: PRIVACY_PAGES.map((page) => this.page(page)) },
      { label: 'Feedback', submenu: FEEDBACK_PAGES.map((page) => this.page(page)) },
      window,
      ...(mac ? [] : [{ role: 'help', submenu: [about] } as MenuItemConstructorOptions]),
    ];
  }
}
