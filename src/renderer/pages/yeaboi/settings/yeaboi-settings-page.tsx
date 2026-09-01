'use client';

// Settings — the config every yeaboi surface reads.
//
// Credentials answers "who does yeaboi talk to": the provider it thinks with,
// then one collapsed card per integration, each showing what it is pointed at.
// The cards and the provider grid are the same components the onboarding
// wizard and /setup use, so the three surfaces cannot drift.
//
// Sharing and System stay field lists — they configure this machine, not a
// remote service — but wear the same card, header and row vocabulary.
//
// Appearance and Duck configure this window rather than the engine, so they
// are declared here rather than in the contract's settings_tabs.

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocation } from 'react-router';
import { ArrowUpRight } from 'lucide-react';
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
import {
  CONNECTION_CARDS,
  ConnectionCard,
  GROUPS,
  groupConnections,
} from '@/components/yeaboi/connection-card';
import { IntegrationsCatalog } from '@/components/yeaboi/integrations-catalog';
import { MicTest } from '@/components/yeaboi/mic-test';
import { SignInPanel } from '@/components/yeaboi/sign-in-panel';
import { VoiceSetup } from '@/components/yeaboi/voice-setup';
import { ConnectedIntegrations } from '@/components/settings/connected-integrations';
import { ProviderPanel } from '@/components/settings/provider-panel';
import { AccessCard, ShareModeChoice } from '@/components/settings/sharing-panel';
import { SystemPanel } from '@/components/settings/system-panel';
import { SectionIcon } from '@/components/settings/section-icon';
import { DuckVoiceCard } from '@/components/settings/duck-voice-card';
import {
  ChoicePills,
  RowValue,
  SettingRow,
  SettingsCard,
  SettingsSectionHeader,
} from '@/components/settings/primitives';
import { SettingsPageShell } from '@/components/settings/settings-page-shell';
import { AppearanceSection } from '@/components/settings/tabs/general/appearance-section';
import { ScreensaverSection } from '@/components/settings/tabs/general/screensaver-section';
import { DuckTab } from '@/components/settings/tabs/duck-tab';
import { Button } from '@/components/ui/button';

const DOT = ' · ';

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

/** What an integration is pointed at, once it is connected — the host, the
 *  project, the channel. One line of fact in place of the blurb. */
function connectionSummary(section: string, value: (env: string) => string): string {
  const parts: Record<string, string[]> = {
    github: [value('TEAM_ANALYSIS_GITHUB_OWNERS')],
    jira: [value('JIRA_BASE_URL').replace(/^https?:\/\//, ''), value('JIRA_PROJECT_KEY')],
    azure: [
      value('AZURE_DEVOPS_ORG_URL').replace(/^https?:\/\//, ''),
      value('AZURE_DEVOPS_PROJECT'),
    ],
    notion: [value('NOTION_ROOT_PAGE_ID')],
    slack: [
      value('SLACK_CHANNEL_ID'),
      value('SLACK_BOT_TOKEN') && value('SLACK_CHANNEL_ID') ? 'reads back' : '',
    ],
  };
  return (parts[section] ?? []).filter(Boolean).join(DOT);
}

const inputClass =
  'flex-1 rounded-lg border border-border/40 bg-secondary/40 px-3 py-1.5 font-mono text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary/40 focus:outline-none';

function EngineSettings({ tab }: { tab: (typeof SETTINGS_TABS)[number] }) {
  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null>(null);
  const [catalog, setCatalog] = useState<ProviderCatalog | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [restartNeeded, setRestartNeeded] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [moveAsk, setMoveAsk] = useState<string | null>(null);
  const [openCard, setOpenCard] = useState('');
  const headerRefs = useRef<(HTMLButtonElement | null)[]>([]);

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
  const valueOf = (env: string) => snapshot.fields.find((f) => f.env === env)?.value ?? '';

  const sectionFields = (section: string): SettingField[] =>
    snapshot.fields.filter((f) => {
      if (f.section !== section) return false;
      if (section === 'provider') return providerVisible.has(f.env);
      if (section === 'sharing' && f.env.startsWith('CLOUDFLARE_')) return shareAccess;
      return true;
    });

  const beginEdit = (field: SettingField) => {
    setEditing(field.env);
    // Secrets are write-only: the editor always starts empty rather than with
    // the masked preview, so a save can never write dots back over a key.
    setDraft(field.secret ? '' : field.value);
  };

  const renderRow = (field: SettingField) => {
    if (field.choices.length > 0) {
      return (
        <SettingRow key={field.env} label={field.label}>
          <ChoicePills
            options={field.choices}
            active={field.active_choice}
            labels={field.choice_labels}
            onPick={(opt) => void save(field.env, opt)}
          />
        </SettingRow>
      );
    }

    if (field.action === 'data-dir') {
      return (
        <SettingRow key={field.env} label={field.label}>
          <RowValue value={field.value} fallback="~/.yeaboi (default)" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              void window.yeaboi
                .pickDirectory({
                  title: 'Choose a data directory',
                  defaultPath: field.value || undefined,
                })
                .then((picked) => {
                  if (picked.path) setMoveAsk(picked.path);
                })
            }
          >
            Choose…
          </Button>
          {field.is_set && (
            <Button variant="ghost" size="sm" onClick={() => setMoveAsk('')}>
              Reset
            </Button>
          )}
        </SettingRow>
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
        <SettingRow key={field.env} label={field.label}>
          <MicTest value={field.value} onSave={(name) => void save(field.env, name)} />
        </SettingRow>
      );
    }

    const isEditing = editing === field.env;
    return (
      <SettingRow key={field.env} label={field.label}>
        {isEditing ? (
          <form
            className="flex w-full flex-1 items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void save(field.env, draft.trim());
            }}
          >
            <input
              autoFocus
              type={field.secret ? 'password' : 'text'}
              value={draft}
              aria-label={field.label}
              placeholder={field.secret ? 'paste the new value' : ''}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setEditing(null);
              }}
              className={inputClass}
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
            {field.env === 'TUNNEL_TIMEOUT_MINUTES' && field.value.trim() === '0' ? (
              <RowValue value="never expires" tone="warning" />
            ) : (
              <RowValue
                value={field.is_set ? field.value : ''}
                fallback={field.default ? `${field.default} (default)` : 'not set'}
              />
            )}
            <Button variant="ghost" size="sm" onClick={() => beginEdit(field)}>
              {field.secret && field.is_set ? 'Replace' : 'Edit'}
            </Button>
          </>
        )}
      </SettingRow>
    );
  };

  const banners = (
    <>
      {restartNeeded && (
        <div className="mb-4 rounded-xl bg-warning/10 px-4 py-2.5 text-[12px] text-foreground ring-1 ring-warning/30">
          Quit and reopen yeaboi to finish applying the data directory.
        </div>
      )}
      {status && (
        <div
          role="status"
          className="mb-4 flex items-center gap-2 text-[12px] text-muted-foreground"
        >
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
          <div className="w-[480px] max-w-[calc(100vw-3rem)] rounded-2xl bg-card p-5 shadow-2xl ring-1 ring-border/70">
            <p className="text-[13px] text-muted-foreground">
              Move the existing data (sessions, exports, logs) to{' '}
              <code className="font-mono text-foreground">
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
    </>
  );

  const footer = (
    <p className="mt-6 text-[11px] text-muted-foreground/70">
      Written to <span className="font-mono text-muted-foreground">{snapshot.config_path}</span> —
      the same file the terminal reads.
    </p>
  );

  if (tab.title === 'Credentials') {
    const providerFields = sectionFields('provider');
    const provider = activeChoice(snapshot.fields, 'LLM_PROVIDER');
    const card = catalog?.providers.find((p) => p.provider_val === provider) ?? null;
    const grouped = groupConnections(snapshot, CONNECTION_CARDS, GROUPS);

    let flat = -1;
    const headerKeyHandler = (index: number) => (event: React.KeyboardEvent) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      headerRefs.current[index + (event.key === 'ArrowDown' ? 1 : -1)]?.focus();
    };

    return (
      <div>
        {banners}
        <ProviderPanel
          card={card}
          fields={providerFields}
          catalog={catalog}
          onSave={(env, value) => void save(env, value)}
          onSignIn={() => setSigningIn(true)}
        />
        <div className="mt-6 space-y-4">
          {grouped.map((group) => (
            <div key={group.label}>
              <h3 className="mb-1.5 font-mono text-[10px] tracking-widest text-muted-foreground/60 uppercase">
                {group.label}
              </h3>
              <div className="space-y-2">
                {group.items.map(({ card: spec, fields }) => {
                  flat += 1;
                  const index = flat;
                  return (
                    <ConnectionCard
                      key={spec.section}
                      card={spec}
                      fields={fields}
                      prefillNonSecret
                      summary={connectionSummary(spec.section, valueOf)}
                      open={openCard === spec.section}
                      onToggle={() => setOpenCard((s) => (s === spec.section ? '' : spec.section))}
                      onSaved={(title) => (setStatus(`${title} saved`), void refresh())}
                      headerRef={(el) => {
                        headerRefs.current[index] = el;
                      }}
                      onHeaderKeyDown={headerKeyHandler(index)}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <ConnectedIntegrations />
        {footer}
      </div>
    );
  }

  if (tab.title === 'Sharing') {
    const shareMode = snapshot.fields.find((f) => f.env === 'YEABOI_SHARE_MODE');
    const timeout = snapshot.fields.find((f) => f.env === 'TUNNEL_TIMEOUT_MINUTES');
    const accessFields = sectionFields('sharing').filter((f) => f.env.startsWith('CLOUDFLARE_'));

    return (
      <div>
        {banners}
        <SettingsCard index={0}>
          <SettingsSectionHeader
            title="Sharing"
            subtitle="Who can open a board you share"
            icon={<SectionIcon section="sharing" />}
          />
          <div className="px-5 py-4">
            {shareMode && (
              <ShareModeChoice
                active={shareMode.active_choice}
                onPick={(value) => void save(shareMode.env, value)}
              />
            )}
          </div>
          {timeout && <div className="border-t border-border/40 py-1.5">{renderRow(timeout)}</div>}
        </SettingsCard>
        {/* The five keys mean nothing on the default path, so they appear with
            the tier — the same rule the terminal's Sharing section follows. */}
        {shareAccess && accessFields.length > 0 && (
          <div className="mt-4">
            <AccessCard
              fields={accessFields}
              open={openCard === 'cloudflare'}
              onToggle={() => setOpenCard((s) => (s === 'cloudflare' ? '' : 'cloudflare'))}
              onSaved={(title) => (setStatus(`${title} saved`), void refresh())}
            />
          </div>
        )}
        {footer}
      </div>
    );
  }

  if (tab.title === 'System') {
    return (
      <div>
        {banners}
        <SystemPanel
          fields={snapshot.fields}
          renderRow={renderRow}
          dictationRow={<DictationRow />}
          openCard={openCard}
          onToggle={(key) => setOpenCard((s) => (s === key ? '' : key))}
          onSaved={(title) => (setStatus(`${title} saved`), void refresh())}
          /* A section the backend grows later still lands somewhere. */
          extras={snapshot.sections
            .filter((section) => !knownSections.has(section))
            .map((section) => (
              <SettingsCard key={section}>
                <SettingsSectionHeader title={section} />
                <div className="py-1.5">{sectionFields(section).map(renderRow)}</div>
              </SettingsCard>
            ))}
        />
        {footer}
      </div>
    );
  }

  // Every tab in the contract is handled above.
  return null;
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

  const add = (raw: string) => {
    const value = raw.trim();
    if (value && !paths.includes(value)) setPaths((current) => [...current, value]);
  };

  if (!open) {
    return (
      <SettingRow label={field.label}>
        <RowValue value={field.value} fallback="none — sandboxed to the data directory" />
        <Button variant="ghost" size="sm" onClick={begin}>
          Edit
        </Button>
      </SettingRow>
    );
  }

  return (
    <SettingRow label={field.label}>
      <div className="w-full space-y-1.5">
        {paths.map((p) => (
          <div key={p} className="flex items-center gap-2">
            <code className="font-mono text-[12px] text-foreground">{p}</code>
            <button
              type="button"
              aria-label={`Remove ${p}`}
              onClick={() => setPaths(paths.filter((x) => x !== p))}
              className="text-[12px] text-muted-foreground/60 hover:text-destructive"
            >
              ✕
            </button>
          </div>
        ))}
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            add(next);
            setNext('');
          }}
        >
          <input
            value={next}
            aria-label="Path to allow"
            placeholder="/path/to/allow"
            onChange={(event) => setNext(event.target.value)}
            className={inputClass}
          />
          <Button variant="outline" size="sm" type="submit">
            Add
          </Button>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() =>
              void window.yeaboi
                .pickDirectory({ title: 'Allow a folder' })
                .then((picked) => add(picked.path))
            }
          >
            Choose folder…
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
    </SettingRow>
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
    <SettingRow label="Dictation">
      <RowValue value={voice.detail} tone={voice.state === 'ready' ? 'success' : 'muted'} />
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
    </SettingRow>
  );
}

/** Appearance and Duck talk to this window, not the engine, so they render
 *  outside the backend gate — the theme still switches with the sidecar down. */
function AppearanceTab() {
  return (
    <div className="space-y-4">
      <SettingsCard index={0}>
        <SettingsSectionHeader title="Appearance" subtitle="Colour scheme, for this window" />
        <div className="px-5 py-5">
          <AppearanceSection />
        </div>
      </SettingsCard>
      <SettingsCard index={1}>
        <SettingsSectionHeader
          title="Screensaver"
          subtitle="What the window shows when you have been away"
        />
        <div className="px-5 py-5">
          <ScreensaverSection />
        </div>
      </SettingsCard>
    </div>
  );
}

export default function YeaboiSettingsPage() {
  const { pathname } = useLocation();
  const engineTab = SETTINGS_TABS.find((t) => t.route === pathname);

  return (
    <SettingsPageShell active={pathname}>
      {pathname === '/settings/appearance' ? (
        <AppearanceTab />
      ) : pathname === '/settings/duck' ? (
        <>
          <DuckTab />
          <div className="mt-4">
            <DuckVoiceCard />
          </div>
        </>
      ) : (
        <BackendGate>
          {engineTab?.title === 'Credentials' && (
            <div className="mb-3 flex justify-end">
              <Link
                href="/setup"
                className="inline-flex items-center gap-1 text-[11px] font-body text-muted-foreground transition-colors hover:text-primary"
              >
                Re-run setup
                <ArrowUpRight className="size-3" aria-hidden="true" />
              </Link>
            </div>
          )}
          {engineTab?.title === 'Integrations' ? (
            <IntegrationsCatalog />
          ) : (
            /* The tab table is a non-empty literal; index 0 only looks optional
               to noUncheckedIndexedAccess. */
            <EngineSettings tab={engineTab ?? SETTINGS_TABS[0]!} />
          )}
        </BackendGate>
      )}
    </SettingsPageShell>
  );
}
