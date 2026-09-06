// Seed a few projects into the local planning backend, so the Projects ledger
// has rows to look at. Idempotent by name; CLEAN=1 removes the same names.
//
// It signs in the way main does (src/main/auth.ts): an HS256 token over the
// machine secret in $YEABOI_HOME/planning/secrets.json, with the identity the
// app uses (settings.json under the profile dir), so the rows land in the
// same org the window reads. Override with SEED_EMAIL / SEED_NAME,
// YEABOI_API_URL, or YEABOI_JWT_SECRET.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { SignJWT } from 'jose';

const SEED = [
  {
    name: 'Mobile onboarding rewrite',
    description:
      'Rebuild the first-run flow of the iOS and Android apps around one screen per decision, with the sign-in wall moved to the end.',
    references: [
      {
        source: 'github',
        subject: 'yeaboi-ai/mobile',
        label: 'yeaboi-ai/mobile',
        url: 'https://github.com/yeaboi-ai/mobile',
      },
      { source: 'jira', subject: 'MOB-42', label: 'MOB-42 Onboarding rewrite epic', url: null },
      {
        source: 'notion',
        subject: 'onboarding-research',
        label: 'Onboarding research notes',
        url: null,
      },
    ],
  },
  {
    name: 'Billing service on AWS',
    description:
      'Move invoicing off the monolith into a Lambda service behind API Gateway, with Stripe webhooks landing in SQS.',
    references: [
      {
        source: 'aws',
        subject: 'us-east-1 lambda billing-api',
        label: 'AWS us-east-1 lambda billing-api',
        url: null,
      },
      {
        source: 'link',
        subject: 'https://stripe.com/docs/webhooks',
        label: 'stripe.com/docs/webhooks',
        url: 'https://stripe.com/docs/webhooks',
      },
    ],
  },
  {
    name: 'Support inbox triage bot',
    description:
      'A Slack bot that reads the support channel, drafts a reply from the docs, and files a ticket when a thread stays open a day.',
    references: [
      { source: 'slack', subject: '#support', label: 'Slack #support', url: null },
      {
        source: 'github',
        subject: 'yeaboi-ai/triage-bot',
        label: 'yeaboi-ai/triage-bot',
        url: 'https://github.com/yeaboi-ai/triage-bot',
      },
    ],
  },
  {
    name: 'Q4 roadmap review',
    description:
      'Read every team roadmap page, find what overlaps, and propose one sequence for the quarter.',
    references: [{ source: 'confluence', subject: '98211', label: 'Q4 roadmap', url: null }],
    status: 'done',
  },
  {
    name: 'CLI bulk renamer',
    description:
      'A small command-line tool that renames files in bulk from a pattern, with a dry run first.',
    references: [],
  },
];

function profileDir() {
  const override = process.env.YEABOI_DESKTOP_PROFILE;
  if (override) return override;
  const home = homedir();
  const app =
    process.env.APPDATA ??
    (process.platform === 'darwin'
      ? join(home, 'Library', 'Application Support')
      : join(home, '.config'));
  return join(app, 'yeaboi-desktop');
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function identity() {
  if (process.env.SEED_EMAIL)
    return { email: process.env.SEED_EMAIL, name: process.env.SEED_NAME ?? 'You' };
  for (const dir of [profileDir(), profileDir().replace(/yeaboi-desktop$/, 'yeaboi')]) {
    const settings = readJson(join(dir, 'settings.json'));
    if (settings?.identity?.email) return { ...settings.identity, dir };
  }
  return { email: 'you@yeaboi.local', name: 'You', dir: profileDir() };
}

function secret() {
  if (process.env.YEABOI_JWT_SECRET) return process.env.YEABOI_JWT_SECRET;
  const home = process.env.YEABOI_HOME ?? join(homedir(), '.yeaboi');
  const stored = readJson(join(home, 'planning', 'secrets.json'));
  if (!stored?.nextauthSecret)
    throw new Error(
      `no nextauthSecret in ${join(home, 'planning', 'secrets.json')}; start the app once`,
    );
  return stored.nextauthSecret;
}

function ports() {
  const base = Number(process.env.YEABOI_PLANNING_PORT);
  const count = Number(process.env.YEABOI_PLANNING_PORT_COUNT) || 5;
  if (Number.isInteger(base) && base > 0) return Array.from({ length: count }, (_, i) => base + i);
  return Array.from({ length: 11 }, (_, i) => 8000 + i);
}

async function baseUrl() {
  if (process.env.YEABOI_API_URL) return process.env.YEABOI_API_URL;
  for (const port of ports()) {
    const url = `http://127.0.0.1:${port}`;
    try {
      const resp = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(800) });
      if (resp.ok) return url;
    } catch {
      // not this one
    }
  }
  throw new Error(`no planning backend answered on ${ports().join(', ')}; is the app running?`);
}

async function main() {
  const who = identity();
  const url = await baseUrl();
  const token = await new SignJWT({ email: who.email, name: who.name, picture: null })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(secret()));
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const call = async (method, path, body) => {
    const resp = await fetch(`${url}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!resp.ok && resp.status !== 204)
      throw new Error(`${method} ${path} → ${resp.status} ${await resp.text()}`);
    return resp.status === 204 ? null : resp.json();
  };

  console.log(`backend ${url}, as ${who.email}${who.dir ? ` (${who.dir})` : ''}`);
  const existing = await call('GET', '/api/projects');
  const byName = new Map(existing.map((p) => [p.name, p]));

  if (process.env.CLEAN === '1') {
    for (const seed of SEED) {
      const row = byName.get(seed.name);
      if (!row) continue;
      await call('DELETE', `/api/projects/${row.id}`);
      console.log(`removed  ${row.id}  ${seed.name}`);
    }
    return;
  }

  let missingReferences = false;
  for (const seed of SEED) {
    let row = byName.get(seed.name);
    if (!row) {
      row = await call('POST', '/api/projects', {
        name: seed.name,
        description: seed.description,
        references: seed.references,
      });
      if (seed.status === 'done')
        row = await call('PATCH', `/api/projects/${row.id}`, { status: 'done' });
      if (seed.references.length && !row.references?.length) missingReferences = true;
    }
    console.log(`${row.id}  ${row.status ?? 'active'}  ${seed.name}`);
  }
  if (missingReferences)
    console.warn(
      'the backend dropped the references: it predates them (restart the app after updating).',
    );
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
