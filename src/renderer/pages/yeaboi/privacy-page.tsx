'use client';

// Privacy — the statement and the egress-disclosure ledger, served verbatim
// from the backend's copy owner (yeaboi.privacy over GET /api/meta/privacy),
// so this page can never say something the terminal does not. Rows are grouped
// by the module's state buckets, most-active first — and the ledger is a
// control panel, not a report: every disclosure backed by a real settings
// field (the payload's `switches`) is flipped in place through the same
// POST /api/settings/set the Settings page uses, while the off-switch line
// keeps naming where the switch lives (env vars copy on click, Settings paths
// link). The one switch three tunnel rows share lives once, on that group's
// header. Doubles as the About page: the tray's About and the app menu land
// here (see main.tsx), with the shell + backend versions in the footer.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  BarChart3,
  Bot,
  Download,
  EyeOff,
  Globe,
  Info,
  MessageSquare,
  MonitorDown,
  Power,
  Radio,
  RefreshCw,
  Send,
  Share2,
  ToggleLeft,
} from 'lucide-react';
import {
  apiGet,
  getShellMeta,
  getVersion,
  type ShellMeta,
  type VersionMeta,
} from '@/lib/yeaboi/api';
import {
  loadSettings,
  saveSetting,
  type SettingField,
  type SettingsSnapshot,
} from '@/lib/yeaboi/settings';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { SettingsCard, SettingsSectionHeader } from '@/components/settings/primitives';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { DuckMark } from '@/components/brand/duck';
import { cn } from '@/lib/utils';

interface EgressRow {
  key: string;
  group?: string;
  what: string;
  where: string;
  when: string;
  default: string;
  off_switch: string;
}

interface EgressGroup {
  key: string;
  title: string;
}

interface EgressSwitch {
  key: string;
  env: string;
  on_value: string;
}

interface PrivacyPayload {
  headline: string;
  statement: string[];
  groups?: EgressGroup[];
  switches?: EgressSwitch[];
  egress: EgressRow[];
}

// A backend that predates the grouped payload still renders — as one ledger.
const UNGROUPED: EgressGroup[] = [{ key: 'all', title: 'Everything that can leave this machine' }];

const GROUP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  always: Globe,
  tunnel: Share2,
  'opt-in': EyeOff,
  you: Send,
};

// One glyph per egress path, in the settings tile vocabulary.
const PATH_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  llm: Bot,
  'update-check': RefreshCw,
  'desktop-update': MonitorDown,
  tunnel: Share2,
  doh: Globe,
  'cloudflared-download': Download,
  telemetry: BarChart3,
  tracing: Activity,
  feedback: MessageSquare,
};

// Passive fallback chips, used when the live settings surface is unavailable.
const GROUP_BADGES: Record<string, { label: string; className: string }> = {
  always: { label: 'On', className: 'bg-warning/10 text-warning' },
  tunnel: { label: 'On use', className: 'bg-warning/10 text-warning/80' },
  'opt-in': { label: 'Off', className: 'bg-success/10 text-success' },
  you: { label: 'You send', className: 'bg-secondary text-secondary-foreground' },
};

const ENV_TOKEN = /\b(?:YEABOI|LANGSMITH|CLOUDFLARED)_[A-Z_]+(?:=[\w.]+)?/;
const SETTINGS_PATHS: Record<string, string> = {
  'Settings ▸ System ▸ Privacy': '/settings/system',
  'Settings ▸ Credentials': '/settings/credentials',
};

interface SaveNotice {
  env: string;
  message: string;
  restart: boolean;
}

function IconTile({ icon: Icon }: { icon?: React.ComponentType<{ className?: string }> }) {
  if (!Icon) return null;
  return (
    <span
      aria-hidden
      className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary/60 text-foreground/70 ring-1 ring-border/40"
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

function GroupIcon({ group }: { group: string }) {
  const Icon = GROUP_ICONS[group];
  if (!Icon) return null;
  return (
    <span
      aria-hidden
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary/60 text-foreground/70 ring-1 ring-border/40"
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

function CopyChip({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title="Click to copy"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(token);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        } catch {
          /* clipboard denied — the chip still shows the token to copy by hand */
        }
      }}
      className={cn(
        'font-code rounded-md px-1.5 py-0.5 text-[11px] ring-1 transition-colors',
        copied
          ? 'bg-success/10 text-success ring-success/30'
          : 'bg-secondary/60 text-foreground/90 ring-border/40 hover:bg-secondary',
      )}
    >
      {copied ? 'Copied' : token}
    </button>
  );
}

/** The off-switch line with its controls live: env vars copy, Settings paths link. */
function OffSwitch({ text }: { text: string }) {
  const pattern = new RegExp(`(${ENV_TOKEN.source}|${Object.keys(SETTINGS_PATHS).join('|')})`, 'g');
  return (
    <>
      {text.split(pattern).map((part, i) => {
        if (!part) return null;
        const href = SETTINGS_PATHS[part];
        if (href)
          return (
            <Link key={i} href={href} className="text-primary underline-offset-2 hover:underline">
              {part}
            </Link>
          );
        if (new RegExp(`^(?:${ENV_TOKEN.source})$`).test(part))
          return <CopyChip key={i} token={part} />;
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

/** A live switch bound to one settings field: checked = the path fires. */
function PathSwitch({
  field,
  onValue,
  busy,
  onFlip,
}: {
  field: SettingField;
  onValue: string;
  busy: boolean;
  onFlip: (value: string) => void;
}) {
  const on = field.active_choice === onValue;
  return (
    <span className="flex flex-col items-end gap-1">
      <Switch
        size="sm"
        checked={on}
        disabled={busy}
        onCheckedChange={(next) =>
          onFlip(next ? onValue : (field.choices.find((choice) => choice !== onValue) ?? ''))
        }
        aria-label={field.label}
      />
      <span className="text-[10.5px] text-muted-foreground/80">
        {field.choice_labels[field.active_choice] ?? field.active_choice}
      </span>
    </span>
  );
}

function NoticeLine({ notice }: { notice: SaveNotice }) {
  return (
    <p
      className={cn(
        'mt-1.5 flex items-center gap-1.5 text-[11.5px]',
        notice.restart ? 'text-warning' : 'text-muted-foreground',
      )}
    >
      <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {notice.message}
    </p>
  );
}

function DisclosureRow({
  row,
  control,
  notice,
}: {
  row: EgressRow;
  control: React.ReactNode;
  notice?: SaveNotice;
}) {
  const switchless = row.off_switch.toLowerCase().startsWith('none');
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <IconTile icon={PATH_ICONS[row.key]} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-foreground">{row.what}</p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          {row.where} · {row.when}
        </p>
        <p
          className={cn(
            'mt-1.5 text-[12px] leading-relaxed',
            switchless ? 'text-muted-foreground/80' : 'text-foreground/90',
          )}
        >
          <span className="text-muted-foreground/70">Off-switch · </span>
          <OffSwitch text={row.off_switch} />
        </p>
        {notice && <NoticeLine notice={notice} />}
      </div>
      {control}
    </div>
  );
}

function PrivacyBody() {
  const [payload, setPayload] = useState<PrivacyPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The live half. Optional by design: without it the ledger degrades to the
  // passive chips (older backend, or the settings capability off).
  const [settings, setSettings] = useState<SettingsSnapshot | null>(null);
  const [busyEnv, setBusyEnv] = useState<string | null>(null);
  const [notice, setNotice] = useState<SaveNotice | null>(null);

  useEffect(() => {
    apiGet<PrivacyPayload>('/api/meta/privacy').then(setPayload, (e: Error) => setError(e.message));
    loadSettings().then(setSettings, () => setSettings(null));
  }, []);

  if (error)
    return (
      <p className="text-[13px] text-muted-foreground">
        {/404|not found/i.test(error)
          ? 'Your yeaboi backend predates the Privacy page — update yeaboi to read the full disclosure.'
          : `Could not load the privacy statement: ${error}`}
      </p>
    );
  if (!payload)
    return (
      <div className="space-y-3" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 rounded-2xl bg-secondary/50 animate-pulse" />
        ))}
      </div>
    );

  const groups = payload.groups?.length ? payload.groups : UNGROUPED;
  const rowsFor = (group: EgressGroup) =>
    payload.egress.filter((row) => (group.key === 'all' ? true : row.group === group.key));
  const onByDefault = payload.egress.filter((row) => row.group === 'always').length;

  const switchByKey = new Map((payload.switches ?? []).map((entry) => [entry.key, entry]));
  const fieldByEnv = new Map((settings?.fields ?? []).map((field) => [field.env, field]));

  const flip = async (env: string, value: string) => {
    setBusyEnv(env);
    try {
      const result = await saveSetting(env, value);
      setNotice({ env, message: result.message, restart: result.restart_required });
      // The write landed; a failed refresh must not overwrite its notice.
      try {
        setSettings(await loadSettings());
      } catch {
        /* stale switch until the next load — the notice already says what happened */
      }
    } catch (e) {
      setNotice({ env, message: (e as Error).message, restart: false });
    } finally {
      setBusyEnv(null);
    }
  };

  // The control a row carries: its live switch, or a passive state chip.
  const controlFor = (row: EgressRow): React.ReactNode => {
    const entry = switchByKey.get(row.key);
    const field = entry ? fieldByEnv.get(entry.env) : undefined;
    if (entry && field)
      return (
        <PathSwitch
          field={field}
          onValue={entry.on_value}
          busy={busyEnv === entry.env}
          onFlip={(value) => void flip(entry.env, value)}
        />
      );
    if (row.key === 'llm')
      return (
        <Badge variant="secondary" className="mt-0.5 bg-warning/10 text-warning">
          Always on
        </Badge>
      );
    if (row.key === 'desktop-update')
      return <span className="mt-1 text-[11px] text-muted-foreground/70">No switch yet</span>;
    if (row.key === 'feedback')
      return (
        <Badge variant="secondary" className="mt-0.5">
          You send it
        </Badge>
      );
    const badge = GROUP_BADGES[row.group ?? ''];
    return badge ? (
      <Badge variant="secondary" className={cn('mt-0.5', badge.className)}>
        {badge.label}
      </Badge>
    ) : null;
  };

  const pills = [
    { icon: Radio, label: `${payload.egress.length} paths` },
    ...(onByDefault > 0 ? [{ icon: Power, label: `${onByDefault} on out of the box` }] : []),
    {
      icon: ToggleLeft,
      label: settings ? 'every switch lives on this page' : 'every switch named below',
    },
  ];

  return (
    <>
      <div className="flex items-end gap-3">
        <DuckMark size={72} />
        <div className="mb-1 rounded-2xl rounded-bl-sm bg-secondary/70 px-4 py-2.5 shadow-sm ring-1 ring-border/40">
          <p className="font-display text-lg text-foreground">{payload.headline}</p>
        </div>
      </div>
      <div className="mt-4 max-w-2xl space-y-2">
        {payload.statement.map((paragraph) => (
          <p key={paragraph} className="text-[13px] leading-relaxed text-muted-foreground">
            {paragraph}
          </p>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {pills.map(({ icon: Icon, label }) => (
          <span
            key={label}
            className="flex items-center gap-1.5 rounded-full bg-secondary/60 px-3 py-1 text-[11.5px] text-muted-foreground ring-1 ring-border/40"
          >
            <Icon className="h-3.5 w-3.5 text-primary" aria-hidden />
            {label}
          </span>
        ))}
      </div>

      <div className="mt-5 space-y-4">
        {groups.map((group, index) => {
          const rows = rowsFor(group);
          if (rows.length === 0) return null;
          // A group whose toggleable rows all share one switch carries it on
          // the header — state lives once (the tunnel family).
          const entries = rows
            .map((row) => switchByKey.get(row.key))
            .filter((entry): entry is EgressSwitch => entry !== undefined);
          const sharedEntry =
            rows.length > 1 &&
            entries.length === rows.length &&
            new Set(entries.map((entry) => entry.env)).size === 1
              ? entries[0]
              : undefined;
          const sharedField = sharedEntry ? fieldByEnv.get(sharedEntry.env) : undefined;
          // The header switch is live only with its field; without settings the
          // group degrades to per-row passive chips like everything else.
          const sharedLive = sharedEntry && sharedField ? sharedEntry : undefined;

          return (
            <SettingsCard key={group.key} index={index}>
              <SettingsSectionHeader
                title={group.title}
                subtitle={`${rows.length} ${rows.length === 1 ? 'path' : 'paths'}`}
                icon={<GroupIcon group={group.key} />}
                action={
                  sharedEntry && sharedField ? (
                    <PathSwitch
                      field={sharedField}
                      onValue={sharedEntry.on_value}
                      busy={busyEnv === sharedEntry.env}
                      onFlip={(value) => void flip(sharedEntry.env, value)}
                    />
                  ) : undefined
                }
              />
              {sharedLive && notice?.env === sharedLive.env && (
                <div className="border-b border-border/50 px-4 pb-2.5">
                  <NoticeLine notice={notice} />
                </div>
              )}
              <div className="divide-y divide-border/40">
                {rows.map((row) => {
                  const entry = switchByKey.get(row.key);
                  return (
                    <DisclosureRow
                      key={row.key}
                      row={row}
                      control={sharedLive ? null : controlFor(row)}
                      notice={
                        !sharedLive && entry && notice?.env === entry.env ? notice : undefined
                      }
                    />
                  );
                })}
              </div>
            </SettingsCard>
          );
        })}
      </div>
    </>
  );
}

function AboutFooter() {
  const [shell, setShell] = useState<ShellMeta | null>(null);
  const [backend, setBackend] = useState<VersionMeta | null>(null);

  useEffect(() => {
    getShellMeta().then(setShell, () => undefined);
    getVersion().then(setBackend, () => undefined);
  }, []);

  if (!shell && !backend) return null;
  return (
    <p className="mt-10 text-[11px] text-muted-foreground/70">
      {shell &&
        `yeaboi.ai desktop ${shell.version} · Electron ${shell.electron} · ${shell.platform}/${shell.arch}`}
      {shell && backend && ' · '}
      {backend && `backend ${backend.version} · Python ${backend.python}`}
    </p>
  );
}

export default function PrivacyPage() {
  return (
    <BackendGate>
      <div className="relative mx-auto max-w-3xl px-6 pt-10 pb-28">
        {/* The onboarding hero's pool of light, scaled to a page header —
            color-mix over --primary so it follows both themes. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-72"
          style={{
            background:
              'radial-gradient(480px 320px at 18% 0%, color-mix(in oklab, var(--primary) 8%, transparent), transparent 70%)',
          }}
        />
        <header className="relative mb-6">
          <p className="text-[10px] font-body font-medium tracking-[0.14em] text-muted-foreground uppercase">
            What leaves this machine
          </p>
          <h1 className="font-display mt-0.5 text-4xl text-foreground">Privacy</h1>
        </header>
        <div className="relative">
          <PrivacyBody />
          <AboutFooter />
        </div>
      </div>
    </BackendGate>
  );
}
