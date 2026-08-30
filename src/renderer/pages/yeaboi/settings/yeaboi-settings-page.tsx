'use client';

// yeaboi Settings — the three tabs (Credentials / Sharing / System) over the
// /api/settings snapshot. Field behaviour mirrors the TUI settings page:
// choice rows cycle a fixed set, secrets are write-only (masked preview,
// replace to change), and the special rows (subscription sign-in, data
// directory, allowed paths, voice device) get their dedicated flows.
//
// These live beside the planning app's own /settings (profile, appearance,
// AI provider for planning sessions): that page configures the planning
// backend, this one configures the yeaboi engines. One nav, two backends.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLocation } from 'react-router';
import { DuckMark } from '@/components/brand/duck';
import {
  type ProviderCatalog,
  type SettingField,
  type SettingsSnapshot,
  loadProviders,
  loadSettings,
  saveAllowedPaths,
  saveDataDir,
  saveSetting,
} from '@/lib/yeaboi/settings';
import { SETTINGS_TABS } from '@/lib/yeaboi/settings-tabs';
import { type VoiceStatus, getVoice, setVoiceOffer } from '@/lib/yeaboi/voice';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { MicTest } from '@/components/yeaboi/mic-test';
import { SignInPanel } from '@/components/yeaboi/sign-in-panel';
import { VoiceSetup } from '@/components/yeaboi/voice-setup';
import { Button } from '@/components/ui/button';

const SECTION_TITLES: Record<string, string> = {
  provider: 'LLM Provider',
  jira: 'Jira',
  azure: 'Azure DevOps',
  github: 'GitHub',
  notion: 'Notion',
  slack: 'Slack',
  sharing: 'Sharing',
  storage: 'Storage',
  standup: 'Daily Standup',
  voice: 'Voice Input',
  advanced: 'Advanced',
};

function activeChoice(fields: SettingField[], env: string): string {
  return fields.find((f) => f.env === env)?.active_choice ?? '';
}

/** The provider section shows only the rows the live provider actually uses —
    same rule as the TUI: a key belonging to a provider you are not on stays on
    disk untouched, and its row comes back when you switch back. */
function visibleProviderEnvs(fields: SettingField[], catalog: ProviderCatalog | null): Set<string> {
  const visible = new Set(['LLM_PROVIDER', 'LLM_MODEL']);
  const provider = activeChoice(fields, 'LLM_PROVIDER');
  if (provider === 'anthropic') {
    visible.add('ANTHROPIC_AUTH_MODE');
    visible.add(
      activeChoice(fields, 'ANTHROPIC_AUTH_MODE') === 'subscription'
        ? 'CLAUDE_CODE_OAUTH_TOKEN'
        : 'ANTHROPIC_API_KEY',
    );
  } else if (provider === 'bedrock') {
    visible.add('AWS_REGION');
    visible.add('AWS_PROFILE');
  } else if (provider === 'ollama') {
    visible.add('OLLAMA_BASE_URL');
    visible.add('OLLAMA_NUM_CTX');
  } else {
    const card = catalog?.providers.find((p) => p.provider_val === provider);
    if (card?.env_var) visible.add(card.env_var);
  }
  return visible;
}

const label = 'w-40 shrink-0 text-[11px] font-body text-muted-foreground uppercase tracking-wide';
const valueSet = 'text-[12px] font-mono text-foreground break-all';
const valueUnset = 'text-[12px] font-mono text-muted-foreground/50';

function SettingsBody() {
  const { pathname } = useLocation();
  // The tab table is a non-empty literal; index 0 only looks optional to
  // noUncheckedIndexedAccess.
  const tab = SETTINGS_TABS.find((t) => t.route === pathname) ?? SETTINGS_TABS[0]!;

  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null>(null);
  const [catalog, setCatalog] = useState<ProviderCatalog | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [restartNeeded, setRestartNeeded] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [moveAsk, setMoveAsk] = useState<string | null>(null);

  const refresh = () => loadSettings().then(setSnapshot, (e: Error) => setError(e.message));
  useEffect(() => {
    void refresh();
    loadProviders().then(setCatalog, () => undefined);
  }, []);

  const save = async (key: string, value: string) => {
    try {
      const result = await saveSetting(key, value);
      setStatus(result.message);
      if (result.restart_required) setRestartNeeded(true);
      await refresh();
    } catch (e) {
      setStatus((e as Error).message);
    }
    setEditing(null);
  };

  const providerVisible = useMemo(
    () => (snapshot ? visibleProviderEnvs(snapshot.fields, catalog) : new Set<string>()),
    [snapshot, catalog],
  );

  if (error)
    return <p className="text-[13px] text-muted-foreground">Could not load settings: {error}</p>;
  if (!snapshot) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  const shareAccess = activeChoice(snapshot.fields, 'YEABOI_SHARE_MODE') === 'access';
  const knownSections = new Set(SETTINGS_TABS.flatMap((t) => t.sections));

  const sectionFields = (section: string): SettingField[] =>
    snapshot.fields.filter((f) => {
      if (f.section !== section) return false;
      if (section === 'provider') return providerVisible.has(f.env);
      if (section === 'sharing' && f.env.startsWith('CLOUDFLARE_')) return shareAccess;
      return true;
    });

  // Sections the backend grows later land on the System tab rather than nowhere.
  const sections =
    tab.title === 'System'
      ? [...tab.sections, ...snapshot.sections.filter((s) => !knownSections.has(s))]
      : [...tab.sections];

  const beginEdit = (field: SettingField) => {
    setEditing(field.env);
    // Secrets are write-only: the editor always starts empty rather than with
    // the masked preview, so a save can never write dots back over a key.
    setDraft(field.secret ? '' : field.value);
  };

  const renderRow = (field: SettingField) => {
    if (field.choices.length > 0) {
      return (
        <div className="flex flex-wrap items-center gap-2 py-2" key={field.env}>
          <span className={label}>{field.label}</span>
          <span className="flex flex-wrap gap-1.5">
            {field.choices.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => void save(field.env, opt)}
                className={`rounded-full px-3 py-1 text-[11px] font-body transition-colors ${
                  opt === field.active_choice
                    ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                    : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
                }`}
              >
                {field.choice_labels[opt] ?? opt}
              </button>
            ))}
          </span>
        </div>
      );
    }

    if (field.action === 'signin') {
      return (
        <div className="flex flex-wrap items-center gap-2 py-2" key={field.env}>
          <span className={label}>{field.label}</span>
          <span className={field.is_set ? valueSet : valueUnset}>
            {field.is_set ? field.value : 'not signed in'}
          </span>
          <Button variant="outline" size="sm" onClick={() => setSigningIn(true)}>
            Sign in…
          </Button>
        </div>
      );
    }

    if (field.action === 'allowed-paths') {
      return (
        <AllowedPathsRow
          key={field.env}
          field={field}
          onSaved={(m) => (setStatus(m), void refresh())}
        />
      );
    }

    if (field.action === 'voice-device') {
      // The snapshot's device list is PortAudio's — the terminal's stack, not
      // this window's. MicTest enumerates the engine's own devices and saves
      // the same VOICE_DEVICE *name* back, which is the part both surfaces
      // share.
      return (
        <MicTest
          key={field.env}
          value={field.value}
          onSave={(name) => void save(field.env, name)}
        />
      );
    }

    const isEditing = editing === field.env;
    return (
      <div className="py-2" key={field.env}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={label}>{field.label}</span>
          {isEditing ? (
            <form
              className="flex flex-1 items-center gap-2 min-w-[240px]"
              onSubmit={(event) => {
                event.preventDefault();
                if (field.action === 'data-dir') {
                  setEditing(null);
                  setMoveAsk(draft.trim());
                } else {
                  void save(field.env, draft);
                }
              }}
            >
              <input
                autoFocus
                type={field.secret ? 'password' : 'text'}
                value={draft}
                placeholder={field.secret ? 'paste the new value' : ''}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setEditing(null);
                }}
                className="flex-1 rounded-lg bg-secondary/40 border border-border/40 px-3 py-1.5 text-[12px] font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
              <Button size="sm" type="submit">
                Save
              </Button>
              <Button variant="outline" size="sm" type="button" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </form>
          ) : (
            <>
              <span className={field.is_set ? valueSet : valueUnset}>
                {field.is_set
                  ? field.value
                  : field.default
                    ? `${field.default} (default)`
                    : 'not set'}
              </span>
              <Button variant="ghost" size="sm" onClick={() => beginEdit(field)}>
                Edit
              </Button>
            </>
          )}
        </div>
        {field.help_url && (
          <div className="mt-1 pl-40 text-[11px] text-muted-foreground/70">
            create:{' '}
            <a
              href={field.help_url}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              {field.help_url}
            </a>
            <div>scope: {field.help_scope}</div>
          </div>
        )}
      </div>
    );
  };

  const extraRows = (section: string) => {
    if (section === 'slack') {
      const twoWay =
        Boolean(snapshot.fields.find((f) => f.env === 'SLACK_BOT_TOKEN')?.is_set) &&
        Boolean(snapshot.fields.find((f) => f.env === 'SLACK_CHANNEL_ID')?.is_set);
      return (
        <div className="flex flex-wrap items-center gap-2 py-2">
          <span className={label}>Reads back</span>
          <span className={twoWay ? 'text-[12px] text-success' : valueUnset}>
            {twoWay ? 'yes — reactions and thread replies' : 'no — a webhook cannot be answered'}
          </span>
        </div>
      );
    }
    if (section === 'voice') return <DictationRow />;
    if (section === 'advanced') {
      return (
        <div className="flex flex-wrap items-center gap-2 py-2">
          <span className={label}>Config File</span>
          <span className={valueSet}>{snapshot.config_path}</span>
        </div>
      );
    }
    return null;
  };

  return (
    <div>
      <h1 className="font-display text-2xl text-foreground mb-4">yeaboi Settings</h1>
      <nav className="flex items-center gap-1.5 mb-6">
        {SETTINGS_TABS.map((t) => (
          <Link
            key={t.route}
            href={t.route}
            aria-current={t.route === tab.route ? 'page' : undefined}
            className={`rounded-full px-3 py-1 text-[12px] font-body transition-colors ${
              t.route === tab.route
                ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.title}
          </Link>
        ))}
      </nav>

      {restartNeeded && (
        <div className="mb-4 rounded-xl bg-warning/10 ring-1 ring-warning/30 px-4 py-2.5 text-[12px] text-foreground">
          Restart yeaboi (quit and reopen the app) to fully apply the data directory.
        </div>
      )}
      {status && (
        <div className="mb-4 flex items-center gap-2 text-[12px] text-muted-foreground">
          <DuckMark state="idle" size={20} /> {status}
        </div>
      )}

      {signingIn && (
        <SignInPanel
          onClose={(saved, message) => {
            setSigningIn(false);
            setStatus(message);
            if (saved) void refresh();
          }}
        />
      )}

      {moveAsk !== null && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-background/60 backdrop-blur-sm">
          <div className="w-[480px] max-w-[calc(100vw-3rem)] rounded-2xl bg-card shadow-2xl ring-1 ring-border/70 p-5">
            <p className="text-[13px] text-muted-foreground">
              Move the existing data (sessions, exports, logs) to{' '}
              <code className="text-foreground">
                {moveAsk || '~/.yeaboi (the default location)'}
              </code>
              ?
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button
                size="sm"
                onClick={() => {
                  const value = moveAsk;
                  setMoveAsk(null);
                  void saveDataDir(value, true).then(
                    (r) => (setStatus(r.message), setRestartNeeded(true), void refresh()),
                    (e: Error) => setStatus(e.message),
                  );
                }}
              >
                Move data
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const value = moveAsk;
                  setMoveAsk(null);
                  void saveDataDir(value, false).then(
                    (r) => (setStatus(r.message), setRestartNeeded(true), void refresh()),
                    (e: Error) => setStatus(e.message),
                  );
                }}
              >
                Just set the path
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setMoveAsk(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {sections.map((section) => {
          const fields = sectionFields(section);
          const extras = extraRows(section);
          if (fields.length === 0 && !extras) return null;
          return (
            <section className="rounded-2xl bg-card ring-1 ring-border/60 p-5" key={section}>
              <h2 className="text-[13px] font-body font-medium text-foreground mb-2">
                {SECTION_TITLES[section] ?? section}
              </h2>
              <div className="divide-y divide-border/40">
                {fields.map(renderRow)}
                {extras}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function AllowedPathsRow({
  field,
  onSaved,
}: {
  field: SettingField;
  onSaved: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [paths, setPaths] = useState<string[]>([]);
  const [next, setNext] = useState('');

  const begin = () => {
    setPaths(field.value ? field.value.split(',').filter(Boolean) : []);
    setOpen(true);
  };

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2 py-2">
        <span className={label}>{field.label}</span>
        <span className={field.is_set ? valueSet : valueUnset}>
          {field.value || 'none — sandboxed to data dir'}
        </span>
        <Button variant="ghost" size="sm" onClick={begin}>
          Edit
        </Button>
      </div>
    );
  }

  return (
    <div className="py-2">
      <span className={label}>{field.label}</span>
      <div className="mt-2 space-y-1.5">
        {paths.map((p) => (
          <div key={p} className="flex items-center gap-2">
            <code className="text-[12px] font-mono text-foreground">{p}</code>
            <button
              type="button"
              onClick={() => setPaths(paths.filter((x) => x !== p))}
              className="text-muted-foreground/60 hover:text-destructive text-[12px]"
            >
              ✕
            </button>
          </div>
        ))}
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const value = next.trim();
            if (value && !paths.includes(value)) setPaths([...paths, value]);
            setNext('');
          }}
        >
          <input
            value={next}
            placeholder="/path/to/allow"
            onChange={(event) => setNext(event.target.value)}
            className="flex-1 rounded-lg bg-secondary/40 border border-border/40 px-3 py-1.5 text-[12px] font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
          <Button variant="outline" size="sm" type="submit">
            Add
          </Button>
        </form>
        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            onClick={() => {
              void saveAllowedPaths(paths).then(
                (r) => (setOpen(false), onSaved(r.message)),
                (e: Error) => onSaved(e.message),
              );
            }}
          >
            Save
          </Button>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Whether dictation can run here, and the way in or out.
 *
 * Read from /api/voice, not from the settings snapshot: the snapshot answers
 * the terminal's question (is the whole voice extra installed, and is
 * PortAudio alive) and this window needs neither half of that — it records
 * its own audio, so the only thing that has to be present is the speech
 * engine. */
function DictationRow() {
  const [voice, setVoice] = useState<VoiceStatus | null>(null);
  const [setup, setSetup] = useState<VoiceStatus | null>(null);
  const [note, setNote] = useState('');

  const refresh = () => getVoice().then(setVoice, () => setVoice(null));
  useEffect(() => {
    void refresh();
  }, []);

  if (!voice) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 py-2">
      <span className={label}>Dictation</span>
      <span
        className={
          voice.state === 'ready' ? 'text-[12px] text-success' : 'text-[12px] text-muted-foreground'
        }
      >
        {voice.detail}
      </span>
      {voice.state === 'installable' && (
        <Button variant="outline" size="sm" onClick={() => setSetup(voice)}>
          Set up ({voice.install.size_mb} MB)
        </Button>
      )}
      {voice.state === 'declined' && (
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            void setVoiceOffer(true).then(() => {
              setNote('');
              void refresh();
            })
          }
        >
          Offer again
        </Button>
      )}
      {note && <span className="text-[11px] text-muted-foreground/70">{note}</span>}
      {setup && (
        <VoiceSetup
          status={setup}
          onClose={(_ready, message) => {
            setSetup(null);
            setNote(message);
            void refresh();
          }}
        />
      )}
    </div>
  );
}

export default function YeaboiSettingsPage() {
  return (
    <BackendGate>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <SettingsBody />
      </div>
    </BackendGate>
  );
}
