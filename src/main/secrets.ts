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
import { parseDotenv } from '../shared/dotenv';

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

/** Read and parse the shared key file; {} when absent.
 *
 *  Always literally ~/.yeaboi/.env, even when $YEABOI_HOME relocates the data
 *  tree — the Python engine treats it as the bootstrap file (it can itself set
 *  YEABOI_HOME, so deriving its location from the override would be circular),
 *  and reading anywhere else splits this process from what the engine writes. */
export function loadSharedEnv(): Record<string, string> {
  try {
    return parseDotenv(readFileSync(join(homedir(), '.yeaboi', '.env'), 'utf8'));
  } catch {
    return {};
  }
}
