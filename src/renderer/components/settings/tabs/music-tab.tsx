'use client';

// Settings · Music: the radio's station (shared with the terminal), how the
// window plays, and the shelf.

import Link from 'next/link';
import { useMusicPlayer } from '@/components/providers/music-provider';
import {
  SettingsCard,
  SettingsSectionHeader,
  SettingRow,
  ChoicePills,
} from '@/components/settings/primitives';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { MUSIC_SERVICES, SERVICE_LABELS } from '@shared/music-links';

export function MusicTab() {
  const { radio, channels, backend, prefs, updatePrefs, removeLink, serviceFor } = useMusicPlayer();
  const names = channels.map((c) => c.name);
  const active = channels[radio.state.channel]?.name ?? '';

  return (
    <div className="space-y-4">
      <SettingsCard index={0}>
        <SettingsSectionHeader
          title="Radio"
          subtitle="Four stations, the same four the terminal has"
        />
        <div className="space-y-4 px-5 py-5">
          <SettingRow label="Station">
            <ChoicePills
              options={names}
              active={active}
              disabled={backend !== 'ready' || names.length === 0}
              onPick={(name) => radio.setChannel(names.indexOf(name))}
            />
          </SettingRow>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            The choice is shared with the terminal: pick a station here and its pocket shows it.
            {backend === 'offline' && ' The backend is not up, so this cannot be saved yet.'}
          </p>
        </div>
      </SettingsCard>

      <SettingsCard index={1}>
        <SettingsSectionHeader title="Playback" subtitle="How this window plays" />
        <div className="space-y-5 px-5 py-5">
          <SettingRow label="Volume">
            <div className="flex w-56 items-center gap-3">
              <Slider
                aria-label="Volume"
                min={0}
                max={100}
                value={Math.round(radio.state.volume * 100)}
                onValueChange={(value) =>
                  radio.setVolume((Array.isArray(value) ? value[0]! : value) / 100)
                }
                className="flex-1"
              />
              <span className="w-9 text-right font-mono text-[11.5px] text-muted-foreground">
                {Math.round(radio.state.volume * 100)}%
              </span>
            </div>
          </SettingRow>
          <SettingRow label="Pause during calls">
            <Switch
              checked={prefs.pauseInCalls}
              onCheckedChange={(pauseInCalls) => updatePrefs({ pauseInCalls })}
              aria-label="Pause during calls"
            />
          </SettingRow>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            The radio waits while a call or a voice session is live and comes back after, the way it
            does in the terminal while you dictate. Nothing plays when the app starts.
          </p>
        </div>
      </SettingsCard>

      <SettingsCard index={2}>
        <SettingsSectionHeader
          title="Services"
          subtitle="Switched on in the catalog; the links you keep for each"
        />
        <div className="space-y-3 px-5 py-5">
          {MUSIC_SERVICES.map((service) => {
            const state = serviceFor(service);
            const rows = prefs.library.filter((row) => row.service === service);
            return (
              <SettingRow key={service} label={SERVICE_LABELS[service]}>
                <span className="text-[12.5px] text-muted-foreground">
                  {state?.connected ? (
                    <>
                      on · {rows.length} {rows.length === 1 ? 'link' : 'links'}
                      {rows.length > 0 && (
                        <>
                          {' · '}
                          <button
                            type="button"
                            onClick={() => rows.forEach((row) => removeLink(row.id))}
                            className="text-foreground underline-offset-4 hover:underline"
                          >
                            Clear saved links
                          </button>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      off ·{' '}
                      <Link href="/settings/connections" className="text-primary hover:underline">
                        Open the catalog
                      </Link>
                    </>
                  )}
                </span>
              </SettingRow>
            );
          })}
        </div>
      </SettingsCard>
    </div>
  );
}
