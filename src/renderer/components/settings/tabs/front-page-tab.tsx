'use client';

// The front page's settings: how fast it turns (this window's clock, kept
// here), and which outlets it reads (the sidecar's roster, since the sidecar
// does every fetch). The outlet list comes from the payload rather than being
// hardcoded, so an outlet added on the backend appears without a release.

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  ChoicePills,
  SettingsCard,
  SettingsInlineError,
  SettingsListRow,
  SettingsSectionHeader,
} from '@/components/settings/primitives';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useYeaboiBackend } from '@/hooks/yeaboi/use-yeaboi-backend';
import { logger } from '@/lib/logger';
import {
  addSource,
  loadSources,
  probeSource,
  removeSource,
  setSourceEnabled,
} from '@/lib/news/load';
import { COLUMN_TITLES } from '@/lib/news/paper';
import { draftProblems, groupByDesk, healthLine } from '@/lib/news/sources';
import { TURN_SPEEDS, isTurnSpeed, type TurnSpeedId } from '@/lib/news/turn';
import { NEWS_COLUMNS, isNewsColumn, type NewsProbe, type NewsSourceRow } from '@/lib/news/types';
import { getPref, setPref } from '@/lib/preferences';

const SPEED_LABELS = Object.fromEntries(TURN_SPEEDS.map((speed) => [speed.id, speed.label]));

export function FrontPageTab() {
  return (
    <div className="space-y-4">
      <SettingsCard index={0}>
        <SettingsSectionHeader title="Turning" subtitle="How long a story stays up on the home" />
        <div className="px-5 py-4">
          <TurningSection />
        </div>
      </SettingsCard>
      <SettingsCard index={1}>
        <SettingsSectionHeader
          title="Outlets"
          subtitle="Where the front page reads its headlines"
        />
        <OutletsSection />
      </SettingsCard>
    </div>
  );
}

function TurningSection() {
  const [speed, setSpeed] = useState<TurnSpeedId>(() => getPref('news.turnSpeed'));
  const choose = (value: string) => {
    if (!isTurnSpeed(value)) return;
    setSpeed(value);
    setPref('news.turnSpeed', value);
  };
  return (
    <div className="space-y-2">
      <ChoicePills
        options={TURN_SPEEDS.map((s) => s.id)}
        labels={SPEED_LABELS}
        active={speed}
        onPick={choose}
      />
      <p className="text-[11px] text-muted-foreground font-body leading-relaxed">
        The clock stops while the pointer is on the page. The arrow keys turn it by hand whatever
        you choose here.
      </p>
    </div>
  );
}

type ListState = 'loading' | 'ready' | 'offline' | 'older';

function OutletsSection() {
  const backend = useYeaboiBackend();
  const confirm = useConfirm();
  const [rows, setRows] = useState<NewsSourceRow[]>([]);
  const [state, setState] = useState<ListState>('loading');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const now = new Date();

  const reload = async () => {
    try {
      const loaded = await loadSources();
      if (loaded === null) {
        setState('older');
        return;
      }
      setRows(loaded);
      setState('ready');
    } catch (err: unknown) {
      logger.error('could not load the outlet list', err);
      setState('offline');
    }
  };

  useEffect(() => {
    if (backend.kind !== 'ready') return;
    let cancelled = false;
    loadSources().then(
      (loaded) => {
        if (cancelled) return;
        if (loaded === null) {
          setState('older');
          return;
        }
        setRows(loaded);
        setState('ready');
      },
      (err: unknown) => {
        if (cancelled) return;
        logger.error('could not load the outlet list', err);
        setState('offline');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [backend.kind]);

  const toggle = (row: NewsSourceRow, enabled: boolean) => {
    setError('');
    setRows((current) => current.map((r) => (r.id === row.id ? { ...r, enabled } : r)));
    setBusy(row.id);
    setSourceEnabled(row.id, enabled).then(
      ({ source }) => {
        setRows((current) => current.map((r) => (r.id === row.id ? { ...r, ...source } : r)));
        setBusy(null);
      },
      (err: unknown) => {
        // The sidecar refused; showing it switched when it was not stored is the one outcome worth undoing.
        logger.error('could not switch the outlet', err);
        setRows((current) =>
          current.map((r) => (r.id === row.id ? { ...r, enabled: !enabled } : r)),
        );
        setError(err instanceof Error ? err.message : 'Could not save that.');
        setBusy(null);
      },
    );
  };

  const remove = async (row: NewsSourceRow) => {
    const ok = await confirm({
      title: `Remove ${row.name}?`,
      message:
        'Its headlines leave the front page on the next refresh. You can add it again later.',
      confirmLabel: 'Remove',
      variant: 'danger',
    });
    if (!ok) return;
    setError('');
    setBusy(row.id);
    try {
      await removeSource(row.id);
      setRows((current) => current.filter((r) => r.id !== row.id));
    } catch (err: unknown) {
      logger.error('could not remove the outlet', err);
      setError(err instanceof Error ? err.message : 'Could not remove that.');
    } finally {
      setBusy(null);
    }
  };

  if (state === 'loading') {
    return (
      <div className="flex items-center gap-2 px-5 py-4 text-[12px] text-muted-foreground font-body">
        <Loader2 className="size-3 animate-spin" aria-hidden="true" />
        Reading the outlet list.
      </div>
    );
  }
  if (state === 'offline') {
    return (
      <p className="px-5 py-4 text-[12px] text-muted-foreground font-body">
        The backend is not up, so the outlets cannot be changed yet.
      </p>
    );
  }
  if (state === 'older') {
    return (
      <p className="px-5 py-4 text-[12px] text-muted-foreground font-body">
        This yeaboi does not keep an outlet list yet. Update it to choose outlets here.
      </p>
    );
  }

  return (
    <div>
      {groupByDesk(rows).map((desk) => (
        <div key={desk.column}>
          <p className="px-4 pt-3 pb-1 text-[11px] font-body text-muted-foreground/70">
            {desk.title}
          </p>
          {desk.rows.map((row) => (
            <SettingsListRow
              key={row.id}
              trailing={
                <>
                  {!row.builtin && (
                    <Button
                      variant="ghost"
                      size="xs"
                      disabled={busy === row.id}
                      onClick={() => void remove(row)}
                    >
                      Remove
                    </Button>
                  )}
                  {busy === row.id && (
                    <Loader2
                      className="size-3 animate-spin text-muted-foreground"
                      aria-hidden="true"
                    />
                  )}
                  <Switch
                    size="sm"
                    checked={row.enabled}
                    disabled={busy === row.id}
                    onCheckedChange={(enabled) => toggle(row, enabled)}
                    aria-label={`${row.name} on the front page`}
                  />
                </>
              }
            >
              <div className="text-sm font-medium">
                {row.home_url ? (
                  <a
                    href={row.home_url}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline underline-offset-2"
                  >
                    {row.name}
                  </a>
                ) : (
                  row.name
                )}
              </div>
              <div className="text-xs text-muted-foreground">{healthLine(row, now)}</div>
            </SettingsListRow>
          ))}
        </div>
      ))}
      {error && (
        <div className="px-4 py-2">
          <SettingsInlineError message={error} />
        </div>
      )}
      <AddOutlet
        onAdded={(source) => {
          setRows((current) => [...current.filter((r) => r.id !== source.id), source]);
        }}
        onReload={() => void reload()}
      />
    </div>
  );
}

const DESK_LABELS: Record<string, string> = COLUMN_TITLES;

function AddOutlet({
  onAdded,
  onReload,
}: {
  onAdded: (source: NewsSourceRow) => void;
  onReload: () => void;
}) {
  const [url, setUrl] = useState('');
  const [probe, setProbe] = useState<NewsProbe | null>(null);
  const [name, setName] = useState('');
  const [column, setColumn] = useState<string>('ai');
  const [checking, setChecking] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const check = async () => {
    setError('');
    setProbe(null);
    setChecking(true);
    try {
      const looked = await probeSource(url);
      setProbe(looked);
      if (looked.ok) setName(looked.name);
      else setError(looked.error);
    } catch (err: unknown) {
      logger.error('could not check the feed', err);
      setError(err instanceof Error ? err.message : 'Could not check that address.');
    } finally {
      setChecking(false);
    }
  };

  const problems = probe?.ok ? draftProblems({ url, name, column }) : [];

  const add = async () => {
    if (!probe?.ok || problems.length > 0 || !isNewsColumn(column)) return;
    setError('');
    setAdding(true);
    try {
      const { source } = await addSource({ url: probe.url, name: name.trim(), column });
      onAdded(source);
      setUrl('');
      setProbe(null);
      setName('');
      onReload();
    } catch (err: unknown) {
      logger.error('could not add the outlet', err);
      setError(err instanceof Error ? err.message : 'Could not add that outlet.');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="border-t border-border/50 px-4 py-4 space-y-3">
      <p className="text-[11px] font-body text-muted-foreground/70">Add an outlet</p>
      <div className="flex gap-2">
        <Input
          type="url"
          placeholder="https://example.com/feed.xml"
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
            setProbe(null);
            setError('');
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && url.trim()) void check();
          }}
          aria-label="Feed address"
        />
        <Button variant="outline" size="default" disabled={!url.trim() || checking} onClick={check}>
          {checking ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
          Check
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground font-body leading-relaxed">
        An RSS, Atom or JSON Feed address. yeaboi reads it the way it reads every other outlet:
        headlines and links only, from this machine.
      </p>
      {error && (
        <div className="space-y-2">
          <SettingsInlineError message={error} />
          {probe?.feed_url && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setUrl(probe.feed_url);
                setProbe(null);
                setError('');
              }}
            >
              Use {probe.feed_url}
            </Button>
          )}
        </div>
      )}
      {probe?.ok && (
        <div className="rounded-lg border border-border/60 p-3 space-y-3">
          <p className="text-[12px] text-muted-foreground font-body">
            {probe.item_count === 1 ? '1 story' : `${probe.item_count} stories`}
            {probe.sample_titles[0] ? `, the newest "${probe.sample_titles[0]}"` : ''}.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-label="Outlet name"
              className="max-w-xs"
            />
            <ChoicePills
              options={NEWS_COLUMNS}
              labels={DESK_LABELS}
              active={column}
              onPick={setColumn}
            />
          </div>
          {problems[0] && (
            <p className="text-[11px] text-muted-foreground font-body">{problems[0]}</p>
          )}
          <Button size="sm" disabled={adding || problems.length > 0} onClick={add}>
            {adding ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
            Add to the front page
          </Button>
        </div>
      )}
    </div>
  );
}
