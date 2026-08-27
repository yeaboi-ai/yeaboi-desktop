// Local app settings, persisted as JSON in userData. This replaces both the
// old sidecar-backed preference store (pet on/off) and NextAuth's session as
// the source of identity: the desktop is single-user, so "who are you" is a
// name and an email written once on first run.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';

export interface Identity {
  email: string;
  name: string;
}

interface SettingsFile {
  identity?: Identity;
  petEnabled?: boolean;
  apiUrl?: string;
  jwtSecret?: string;
}

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

  get petEnabled(): boolean {
    return this.data.petEnabled !== false; // the duck defaults to on
  }

  setPetEnabled(enabled: boolean): void {
    this.data.petEnabled = enabled;
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
