// Machine secrets and the shared key source, all under ~/.yeaboi.
//
// secrets.json holds values generated once on first run and never shown to a
// person: the planning backend's NEXTAUTH_SECRET (main mints matching JWTs),
// the INTERNAL_API_SECRET the voice agent presents, the AI_KEY_ENCRYPTION_
// SECRET that encrypts BYOK rows (NEVER regenerated once written — rotating
// it silently would orphan every encrypted key), and the LiveKit keypair.
// It is 0600 and separate from the user-editable config files on purpose.
//
// ~/.yeaboi/.env is the user's own key file — the TUI already reads it, users
// already know it. The supervisor parses it here and passes the relevant keys
// to each sidecar as env, so one ANTHROPIC_API_KEY (or one subscription
// sign-in) feeds both backends.

import { randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface MachineSecrets {
  nextauthSecret: string;
  internalApiSecret: string;
  aiKeyEncryptionSecret: string;
  livekitApiKey: string;
  livekitApiSecret: string;
}

/** The single data root. $YEABOI_HOME wins so tests and side-by-side installs
 *  can point elsewhere; both Python backends honor the same variable. */
export function yeaboiHome(): string {
  return process.env['YEABOI_HOME'] ?? join(homedir(), '.yeaboi');
}

const SECRETS_FILE = () => join(yeaboiHome(), 'planning', 'secrets.json');

function generate(): MachineSecrets {
  const random = () => randomBytes(32).toString('base64url');
  return {
    nextauthSecret: random(),
    internalApiSecret: random(),
    aiKeyEncryptionSecret: random(),
    // LiveKit wants a short API key and a longer secret.
    livekitApiKey: `yeaboi-${randomBytes(6).toString('hex')}`,
    livekitApiSecret: random(),
  };
}

/** Read the machine secrets, creating them on first run. Existing values are
 *  never regenerated; missing fields (an older file) are filled in. */
export function loadMachineSecrets(): MachineSecrets {
  const file = SECRETS_FILE();
  let stored: Partial<MachineSecrets> = {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (parsed && typeof parsed === 'object') stored = parsed as Partial<MachineSecrets>;
  } catch {
    stored = {};
  }
  const fresh = generate();
  const merged: MachineSecrets = {
    nextauthSecret: stored.nextauthSecret ?? fresh.nextauthSecret,
    internalApiSecret: stored.internalApiSecret ?? fresh.internalApiSecret,
    aiKeyEncryptionSecret: stored.aiKeyEncryptionSecret ?? fresh.aiKeyEncryptionSecret,
    livekitApiKey: stored.livekitApiKey ?? fresh.livekitApiKey,
    livekitApiSecret: stored.livekitApiSecret ?? fresh.livekitApiSecret,
  };
  const changed = (Object.keys(merged) as (keyof MachineSecrets)[]).some(
    (key) => merged[key] !== stored[key],
  );
  if (changed) {
    mkdirSync(join(yeaboiHome(), 'planning'), { recursive: true });
    writeFileSync(file, JSON.stringify(merged, null, 2) + '\n');
    chmodSync(file, 0o600);
  }
  return merged;
}

/**
 * Parse ~/.yeaboi/.env — the minimal dotenv subset the TUI writes: KEY=value
 * lines, optional single/double quotes, # comments. No interpolation.
 */
export function loadSharedEnv(): Record<string, string> {
  let raw = '';
  try {
    raw = readFileSync(join(yeaboiHome(), '.env'), 'utf8');
  } catch {
    return {};
  }
  const env: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (/^[A-Z_][A-Z0-9_]*$/i.test(key)) env[key] = value;
  }
  return env;
}
