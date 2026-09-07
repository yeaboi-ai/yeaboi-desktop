// Local app settings, persisted as JSON in userData. This replaces both the
// old sidecar-backed preference store (pet on/off) and NextAuth's session as
// the source of identity: the desktop is single-user, so "who are you" is a
// name and an email — auto-minted at startup (the app has no sign-in), and
// editable later from the planning Settings page.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { type PetPrefs, mergePetPrefs, normalizePetPrefs } from '../shared/pet-prefs';
import { type Audience, normalizeAudience } from '../shared/audience';
import { type RailPrefs, mergeRailPrefs, normalizeRailPrefs } from '../shared/rail';
import { type MusicPrefs, mergeMusicPrefs, normalizeMusicPrefs } from '../shared/music';

export interface Identity {
  email: string;
  name: string;
}

interface SettingsFile {
  identity?: Identity;
  /** First-run onboarding: set on explicit finish/skip, or migrated true for
   *  installs that predate the wizard. Absent means "not decided yet". */
  onboardingComplete?: boolean;
  /** Which world the app lives in: 'solo', 'team' or 'agents' (legacy
   *  'humans' reads as 'team'). Absent means the chooser was never answered —
   *  including for installs that predate it. */
  audience?: string;
  /** Pre-prefs pet switch. Still written, so a downgrade still finds it. */
  petEnabled?: boolean;
  pet?: unknown;
  /** The rail's icons, one list per world. Absent means never arranged. */
  rail?: unknown;
  /** Volume, source tab and the saved playlist shelf. The radio's station
   *  and on/off flag are the backend's (/api/ambience), shared with the terminal. */
  music?: unknown;
  apiUrl?: string;
  jwtSecret?: string;
  /** The active theme's background, so a new window paints the right colour
   *  before first render instead of flashing dark on a light theme. */
  windowBackground?: string;
  /** Whether the shell asks GitHub Releases whether a newer build exists.
   *  Absent means on, which is what it has always done. */
  updateCheck?: boolean;
}

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;

const FILE = 'settings.json';

export class Settings {
  private data: SettingsFile = {};

  load(): void {
    try {
      const raw = readFileSync(join(app.getPath('userData'), FILE), 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') this.data = parsed as SettingsFile;
    } catch {
      this.data = {};
    }
  }

  private save(): void {
    const dir = app.getPath('userData');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, FILE), JSON.stringify(this.data, null, 2) + '\n');
  }

  get identity(): Identity | null {
    const id = this.data.identity;
    if (!id || typeof id.email !== 'string' || !id.email) return null;
    return { email: id.email, name: typeof id.name === 'string' ? id.name : id.email };
  }

  setIdentity(identity: Identity): void {
    this.data.identity = { email: identity.email.trim(), name: identity.name.trim() };
    this.save();
  }

  get onboardingComplete(): boolean | undefined {
    return typeof this.data.onboardingComplete === 'boolean'
      ? this.data.onboardingComplete
      : undefined;
  }

  setOnboardingComplete(complete: boolean): void {
    this.data.onboardingComplete = complete;
    this.save();
  }

  get audience(): Audience | undefined {
    return normalizeAudience(this.data.audience);
  }

  setAudience(audience: Audience): void {
    this.data.audience = audience;
    this.save();
  }

  get petEnabled(): boolean {
    return this.pet.enabled;
  }

  setPetEnabled(enabled: boolean): void {
    this.setPet({ enabled });
  }

  /** Everything the duck is, clamped. Reading is cheap enough not to cache. */
  get pet(): PetPrefs {
    return normalizePetPrefs(this.data.pet, this.data.petEnabled);
  }

  setPet(patch: Partial<PetPrefs>): PetPrefs {
    const next = mergePetPrefs(this.pet, patch);
    this.data.pet = next;
    this.data.petEnabled = next.enabled;
    this.save();
    return next;
  }

  /** Whether the shell may ask GitHub Releases for a newer build. Nothing
   *  downloads either way until a person clicks Update. */
  get updateCheck(): boolean {
    return this.data.updateCheck !== false;
  }

  setUpdateCheck(on: boolean): void {
    this.data.updateCheck = on;
    this.save();
  }

  /** The rail per world, clamped. The renderer clamps again against the
   *  routes it knows; here only the shape is checked. */
  get rail(): RailPrefs {
    return normalizeRailPrefs(this.data.rail);
  }

  setRail(patch: unknown): RailPrefs {
    const next = mergeRailPrefs(this.rail, patch);
    this.data.rail = next;
    this.save();
    return next;
  }

  /** Music preferences, clamped; every saved link re-parsed on the way out. */
  get music(): MusicPrefs {
    return normalizeMusicPrefs(this.data.music);
  }

  setMusic(patch: unknown): MusicPrefs {
    const next = mergeMusicPrefs(this.music, patch);
    this.data.music = next;
    this.save();
    return next;
  }

  /** Pre-paint window colour. Defaults to the dark preset's background — the
   *  app's default theme — until the renderer reports the active one. */
  get windowBackground(): string {
    const colour = this.data.windowBackground;
    return typeof colour === 'string' && HEX_COLOUR.test(colour) ? colour : '#0a0a0a';
  }

  setWindowBackground(colour: string): void {
    if (!HEX_COLOUR.test(colour) || this.data.windowBackground === colour) return;
    this.data.windowBackground = colour;
    this.save();
  }

  /** Backend base URL. Env wins so a dev shell can point elsewhere without
   *  touching the settings file. */
  get apiUrl(): string {
    return (process.env['YEABOI_API_URL'] ?? this.data.apiUrl ?? 'http://localhost:8000').replace(
      /\/$/,
      '',
    );
  }

  get wsUrl(): string {
    return this.apiUrl.replace(/^http/, 'ws');
  }

  /** Must equal the planning backend's NEXTAUTH_SECRET. The default matches
   *  planning-platform/.env.example so zero-config dev works. */
  get jwtSecret(): string {
    return (
      process.env['YEABOI_JWT_SECRET'] ?? this.data.jwtSecret ?? 'dev-secret-change-in-prod-please'
    );
  }
}
