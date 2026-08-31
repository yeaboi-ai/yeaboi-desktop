'use client';

// Sharing is one decision and one connection.
//
// The decision — who can open a shared board — is the only real choice on the
// page, so it leads. The five Cloudflare keys under it are plumbing: they mean
// nothing on the default path, they are machine values nobody can check by
// reading, and they belong inside a connection card like any other service.
//
// Copy is lifted from the terminal's setup wizard (yeaboi/sharing/access_setup.py)
// and the config accessors' own docstrings rather than invented here.

import { useEffect, useState } from 'react';
import { ArrowUpRight, Link2, ShieldCheck } from 'lucide-react';
import {
  type AccessState,
  type SettingField,
  loadAccessState,
  verifyAccess,
} from '@/lib/yeaboi/settings';
import { ConnectionCard, type ConnectionCardSpec } from '@/components/yeaboi/connection-card';
import { cn } from '@/lib/utils';

const DOT = ' · ';

/** Where the wizard sends people; the same two pages it opens. */
const ADD_SITE_URL = 'https://dash.cloudflare.com/?to=/:account/add-site';
const ACCESS_APP_ADD_URL =
  'https://dash.cloudflare.com/?to=/:account/one/access-controls/apps/self-hosted/add';

const SHARE_MODES = [
  {
    value: 'quick',
    title: 'Quick tunnels',
    blurb: 'Anyone with the link and a join code. A random URL, and no setup.',
    icon: Link2,
  },
  {
    value: 'access',
    title: 'Verified users',
    blurb: 'Only the people your Cloudflare Access policy names, at your own hostname.',
    icon: ShieldCheck,
  },
] as const;

export function ShareModeChoice({
  active,
  onPick,
}: {
  active: string;
  onPick: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {SHARE_MODES.map((mode) => {
        const Icon = mode.icon;
        const on = mode.value === active;
        return (
          <button
            key={mode.value}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(mode.value)}
            className={cn(
              'flex items-start gap-3 rounded-xl px-3.5 py-3 text-left transition-colors outline-none',
              'focus-visible:ring-2 focus-visible:ring-ring/50',
              on ? 'bg-primary/10 ring-1 ring-primary/40' : 'bg-secondary/40 hover:bg-secondary/70',
            )}
          >
            <Icon
              aria-hidden
              className={cn(
                'mt-0.5 h-4 w-4 shrink-0',
                on ? 'text-primary' : 'text-muted-foreground',
              )}
            />
            <span className="min-w-0">
              <span
                className={cn(
                  'block text-[13px] font-body font-medium',
                  on ? 'text-primary' : 'text-foreground',
                )}
              >
                {mode.title}
              </span>
              <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">
                {mode.blurb}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

const CLOUDFLARE_CARD: ConnectionCardSpec = {
  section: 'sharing',
  icon: 'cloudflare',
  title: 'Cloudflare Access',
  blurb: 'Serve boards at your own hostname, behind a verified sign-in.',
  hints: {
    CLOUDFLARE_TUNNEL_ID:
      'The named tunnel that serves your boards — `cloudflared tunnel create yeaboi` prints its id.',
    CLOUDFLARE_TUNNEL_CREDENTIALS:
      'yeaboi only references this file: the secret is never read into the app, copied, or logged.',
    CLOUDFLARE_ACCESS_HOSTNAME:
      'Where boards are served. It has to sit under a domain on your Cloudflare account.',
    CLOUDFLARE_ACCESS_TEAM:
      'The team part of https://<team>.cloudflareaccess.com — shown under Settings in Zero Trust.',
    CLOUDFLARE_ACCESS_AUD:
      "The application's Audience tag, on its Overview tab. 64 hex characters — a truncated paste verifies fine here and then gives every teammate a bare 403.",
    CLOUDFLARE_ACCESS_ADMIN_EMAILS:
      'Verified emails granted host powers. Empty means no remote visitor gets them — a safe choice.',
  },
  placeholders: {
    CLOUDFLARE_TUNNEL_ID: '00000000-0000-0000-0000-000000000000',
    CLOUDFLARE_TUNNEL_CREDENTIALS: '~/.cloudflared/<uuid>.json',
    CLOUDFLARE_ACCESS_HOSTNAME: 'boards.example.com',
    CLOUDFLARE_ACCESS_TEAM: 'your-team',
    CLOUDFLARE_ACCESS_AUD: 'the-access-application-aud-tag',
    CLOUDFLARE_ACCESS_ADMIN_EMAILS: 'you@example.com,cohost@example.com',
  },
};

// The engine's rules, mirrored so a bad value is caught before it is saved.
const HOSTNAME_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
const AUD_RE = /^[0-9a-f]{64}$/i;
const EMAIL_RE = /^[^@\s,]+@[^@\s,]+\.[^@\s,]+$/;
const LOOPBACK = /(^|\.)localhost$|^127\./;

function fieldProblem(field: SettingField, value: string): string {
  const v = value.trim();
  if (!v) return '';
  if (field.env === 'CLOUDFLARE_ACCESS_HOSTNAME') {
    if (LOOPBACK.test(v.toLowerCase()))
      return 'A loopback hostname would switch verification off for every request.';
    return HOSTNAME_RE.test(v.toLowerCase()) ? '' : 'That does not look like a hostname.';
  }
  if (field.env === 'CLOUDFLARE_ACCESS_AUD')
    return AUD_RE.test(v) ? '' : 'An AUD tag is 64 hex characters, from the Overview tab.';
  if (field.env === 'CLOUDFLARE_ACCESS_ADMIN_EMAILS')
    return v
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
      .every((p) => EMAIL_RE.test(p))
      ? ''
      : 'Comma-separated email addresses.';
  return '';
}

function DoctorLine({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-24 shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <span className={cn('text-[11.5px]', good ? 'text-success' : 'text-muted-foreground/70')}>
        {value}
      </span>
    </div>
  );
}

/** What the engine can answer offline: signed in, verifier present, keys left. */
function AccessDoctor({ state }: { state: AccessState | null }) {
  if (!state) return null;
  return (
    <div className="mb-4 space-y-1 rounded-xl bg-secondary/40 px-3.5 py-3">
      <DoctorLine
        label="Signed in"
        value={state.logged_in ? 'yes' : 'no — run cloudflared login'}
        good={state.logged_in}
      />
      <DoctorLine
        label="Verifier"
        value={state.jwt_installed ? 'PyJWT installed' : 'missing — install yeaboi[access]'}
        good={state.jwt_installed}
      />
      <DoctorLine
        label="Still to set"
        value={state.missing_keys.length === 0 ? 'nothing' : state.missing_keys.join(', ')}
        good={state.missing_keys.length === 0}
      />
    </div>
  );
}

export function AccessCard({
  fields,
  open,
  onToggle,
  onSaved,
}: {
  fields: SettingField[];
  open: boolean;
  onToggle: () => void;
  onSaved: (title: string) => void;
}) {
  const [state, setState] = useState<AccessState | null>(null);

  // Only once the card is opened: cheap, but there is no reason to ask before.
  // Re-asked whenever a saved value moves, so filling in the last missing key
  // clears it from the doctor without collapsing the card first.
  const savedKey = fields.map((f) => `${f.env}=${f.is_set ? '1' : ''}${f.value}`).join('|');
  useEffect(() => {
    if (open) loadAccessState().then(setState, () => setState(null));
  }, [open, savedKey]);

  const valueOf = (env: string) => fields.find((f) => f.env === env)?.value ?? '';
  // The two a person can actually read. No uuid, no AUD, no path on the page.
  const summary = [valueOf('CLOUDFLARE_ACCESS_HOSTNAME'), valueOf('CLOUDFLARE_ACCESS_TEAM')]
    .filter(Boolean)
    .join(DOT);
  const configured = Boolean(
    valueOf('CLOUDFLARE_ACCESS_HOSTNAME') && valueOf('CLOUDFLARE_ACCESS_AUD'),
  );

  return (
    <ConnectionCard
      card={CLOUDFLARE_CARD}
      fields={fields}
      open={open}
      onToggle={onToggle}
      summary={summary}
      configured={configured}
      prefillNonSecret
      validate={fieldProblem}
      onVerify={verifyAccess}
      onSaved={onSaved}
      intro={
        <>
          <AccessDoctor state={state} />
          <p className="mb-4 text-[11px] leading-relaxed text-muted-foreground/80">
            Create the tunnel and the Access application in Cloudflare, then paste what they give
            you here.{' '}
            <a
              href={ADD_SITE_URL}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              Add a domain
              <ArrowUpRight className="inline size-3" aria-hidden />
            </a>
            {DOT}
            <a
              href={ACCESS_APP_ADD_URL}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              Add the application
              <ArrowUpRight className="inline size-3" aria-hidden />
            </a>
            {DOT}
            or run <code className="font-mono text-foreground/80">yeaboi --setup-access</code> in a
            terminal to be walked through it.
          </p>
        </>
      }
    />
  );
}
