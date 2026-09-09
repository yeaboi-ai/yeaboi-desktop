'use client';

// System — this machine, and the services only this window talks to.
//
// Three rows the engine declares are deliberately not rendered here:
//   SAVER_STYLE       Appearance ▸ Screensaver writes the same key, with a
//                     live preview of each scene — strictly more.
//   TIPS_ENABLED      the home page's tip bubble carries its own ✕, and the
//                     banner it really gates is a terminal screen.
//   VOICE_INSTALL_OFFER  gates the terminal's double-tap-Space install prompt;
//                     this window has a mic button and never sees a key release.
//   DUCK_ENABLED      moved to Settings ▸ Duck, beside the rest of the duck.
// Hiding a field is a desktop-side choice: parity is asserted per *section*,
// never per field, and all five sections still render.

import type { ReactNode } from 'react';
import Link from 'next/link';
import type { SettingField } from '@/lib/yeaboi/settings';
import type { ConnectionStatus } from '@/lib/yeaboi/connection-status';
import { ConnectionCard, type ConnectionCardSpec } from '@/components/yeaboi/connection-card';
import { SettingsCard, SettingsSectionHeader } from '@/components/settings/primitives';
import { SectionIcon } from '@/components/settings/section-icon';
import { StandupRecipientsRow } from '@/components/settings/standup-recipients-row';
import { ExportDestinationsCard } from '@/components/settings/export-destinations-card';

const DOT = ' · ';

export const HIDDEN_ON_SYSTEM = new Set([
  'SAVER_STYLE',
  'TIPS_ENABLED',
  'DUCK_ENABLED',
  'VOICE_INSTALL_OFFER',
]);

/** Local dictation lives on this machine; the two cloud keys below do not. */
const DICTATION_ENVS = ['VOICE_DEVICE', 'VOICE_MODEL'];
const ELEVENLABS_ENVS = ['ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID', 'ELEVENLABS_MODEL_ID'];
const TAVUS_ENVS = ['TAVUS_API_KEY'];

const STANDUP_CARD: ConnectionCardSpec = {
  section: 'standup',
  icon: 'standup',
  title: 'Daily Standup',
  blurb: 'Where standups read code from, and the mailbox every ceremony sends through.',
  hints: {
    STANDUP_GITHUB_REPO: 'owner/repo — the estate standups scan for code activity.',
    STANDUP_SMTP_PASSWORD: 'Only needed if your SMTP server asks for a login.',
    STANDUP_EMAIL_RECIPIENTS: 'Comma-separated. Email delivery is skipped entirely when empty.',
  },
  placeholders: {
    STANDUP_GITHUB_REPO: 'acme/platform',
    STANDUP_SMTP_HOST: 'smtp.example.com',
    STANDUP_EMAIL_RECIPIENTS: 'team@example.com',
  },
};

const ELEVENLABS_CARD: ConnectionCardSpec = {
  section: 'voice',
  icon: 'elevenlabs',
  title: 'ElevenLabs',
  blurb: "The duck's spoken voice.",
  hints: {
    ELEVENLABS_VOICE_ID: 'A voice from your ElevenLabs library. Empty uses the default.',
    ELEVENLABS_MODEL_ID: 'Leave empty for eleven_turbo_v2_5.',
  },
  placeholders: { ELEVENLABS_MODEL_ID: 'eleven_turbo_v2_5' },
  verify: 'elevenlabs',
};

const TAVUS_CARD: ConnectionCardSpec = {
  section: 'voice',
  icon: 'tavus',
  title: 'Tavus',
  blurb: 'Avatar video in desktop calls.',
  verify: 'tavus',
};

export function SystemPanel({
  fields,
  renderRow,
  dictationRow,
  openCard,
  onToggle,
  onSaved,
  extras,
  connections,
  reveal,
}: {
  /** Every field in the snapshot; this picks what it shows. */
  fields: SettingField[];
  /** The page owns editing, so rows come back from it. */
  renderRow: (field: SettingField) => ReactNode;
  /** The /api/voice status row, which is not a settings field. */
  dictationRow: ReactNode;
  openCard: string;
  onToggle: (key: string) => void;
  onSaved: (title: string) => void;
  /** Cards for sections this build does not know about yet. */
  extras?: ReactNode;
  /** What the last live probe of each connection found. */
  connections?: Record<string, ConnectionStatus>;
  /** A connection the Catalog asked for by key, shown even when unconfigured. */
  reveal?: string;
}) {
  const pick = (envs: string[]) =>
    envs
      .map((env) => fields.find((f) => f.env === env))
      .filter((f): f is SettingField => Boolean(f));
  const bySection = (section: string) =>
    fields.filter((f) => f.section === section && !HIDDEN_ON_SYSTEM.has(f.env));
  const valueOf = (env: string) => fields.find((f) => f.env === env)?.value ?? '';

  const storage = bySection('storage');
  const standup = bySection('standup');
  const dictation = pick(DICTATION_ENVS);
  const isSet = (env: string) => Boolean(fields.find((f) => f.env === env)?.is_set);
  // Credentials-shaped cards follow the Credentials rule: what is set up is
  // here, what is not is found in the Catalog. The Standup card below is
  // exempt — it is a machine section, not a credential, and nothing in the
  // catalog would lead anyone to it.
  const elevenlabs =
    isSet('ELEVENLABS_API_KEY') || reveal === 'elevenlabs' ? pick(ELEVENLABS_ENVS) : [];
  const tavus = isSet('TAVUS_API_KEY') || reveal === 'tavus' ? pick(TAVUS_ENVS) : [];
  const cloudVoiceHidden = elevenlabs.length === 0 && tavus.length === 0;
  const privacy = bySection('privacy');
  const advanced = bySection('advanced');

  const card = (key: string) => ({
    open: openCard === key,
    onToggle: () => onToggle(key),
    onSaved,
  });

  return (
    <div className="space-y-4">
      {storage.length > 0 && (
        <SettingsCard index={0}>
          <SettingsSectionHeader title="Storage" icon={<SectionIcon section="storage" />} />
          {/* Not a collapsed card: the allowed-paths list grants the agent read
              *and* write over each entry, and the editor replaces the list
              wholesale. That is worth keeping in plain sight. */}
          <div className="py-1.5">{storage.map(renderRow)}</div>
        </SettingsCard>
      )}

      {standup.length > 0 && (
        <ConnectionCard
          card={STANDUP_CARD}
          fields={standup}
          prefillNonSecret
          configured={Boolean(valueOf('STANDUP_GITHUB_REPO') || valueOf('STANDUP_SMTP_HOST'))}
          summary={[valueOf('STANDUP_GITHUB_REPO'), valueOf('STANDUP_SMTP_HOST')]
            .filter(Boolean)
            .join(DOT)}
          renderField={(field) =>
            field.env === 'STANDUP_EMAIL_RECIPIENTS' ? (
              <StandupRecipientsRow field={field} onSaved={onSaved} />
            ) : null
          }
          {...card('standup')}
        />
      )}

      {(dictation.length > 0 || dictationRow) && (
        <SettingsCard index={1}>
          <SettingsSectionHeader
            title="Dictation"
            subtitle="Speech to text, transcribed on this machine"
            icon={<SectionIcon section="voice" />}
          />
          <div className="py-1.5">
            {dictationRow}
            {dictation.map(renderRow)}
            {cloudVoiceHidden && (
              <p className="px-4 py-2 text-[11px] text-muted-foreground/80">
                Cloud voices (ElevenLabs, Tavus) live in the{' '}
                <Link href="/settings/connections" className="text-primary hover:underline">
                  catalog
                </Link>
                .
              </p>
            )}
          </div>
        </SettingsCard>
      )}

      {elevenlabs.length > 0 && (
        <ConnectionCard
          card={ELEVENLABS_CARD}
          fields={elevenlabs}
          prefillNonSecret
          summary={valueOf('ELEVENLABS_MODEL_ID') || 'eleven_turbo_v2_5'}
          status={connections?.elevenlabs}
          {...card('elevenlabs')}
        />
      )}

      {tavus.length > 0 && (
        <ConnectionCard
          card={TAVUS_CARD}
          fields={tavus}
          prefillNonSecret
          status={connections?.tavus}
          {...card('tavus')}
        />
      )}

      <ExportDestinationsCard />

      {privacy.length > 0 && (
        <SettingsCard index={2}>
          <SettingsSectionHeader
            title="Privacy"
            subtitle="The switches the Privacy page's disclosure table names"
            icon={<SectionIcon section="privacy" />}
          />
          <div className="py-1.5">{privacy.map(renderRow)}</div>
        </SettingsCard>
      )}

      {advanced.length > 0 && (
        <SettingsCard index={3}>
          <SettingsSectionHeader title="Advanced" icon={<SectionIcon section="advanced" />} />
          <div className="py-1.5">{advanced.map(renderRow)}</div>
        </SettingsCard>
      )}

      {extras}
    </div>
  );
}
