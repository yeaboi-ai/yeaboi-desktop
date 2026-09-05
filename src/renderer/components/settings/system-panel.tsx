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
import type { SettingField } from '@/lib/yeaboi/settings';
import { ConnectionCard, type ConnectionCardSpec } from '@/components/yeaboi/connection-card';
import { SettingsCard, SettingsSectionHeader } from '@/components/settings/primitives';
import { SectionIcon } from '@/components/settings/section-icon';

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
  sharing,
  openCard,
  onToggle,
  onSaved,
  extras,
}: {
  /** Every field in the snapshot; this picks what it shows. */
  fields: SettingField[];
  /** The page owns editing, so rows come back from it. */
  renderRow: (field: SettingField) => ReactNode;
  /** The /api/voice status row, which is not a settings field. */
  dictationRow: ReactNode;
  /** The Sharing tab's cards, folded in here: it was one switch and a timeout
   *  on a surface of its own. */
  sharing?: ReactNode;
  openCard: string;
  onToggle: (key: string) => void;
  onSaved: (title: string) => void;
  /** Cards for sections this build does not know about yet. */
  extras?: ReactNode;
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
  const elevenlabs = pick(ELEVENLABS_ENVS);
  const tavus = pick(TAVUS_ENVS);
  const privacy = bySection('privacy');
  const advanced = bySection('advanced');

  const card = (key: string) => ({
    open: openCard === key,
    onToggle: () => onToggle(key),
    onSaved,
  });

  // Two columns where there is room, and each one packed by hand rather than
  // left to the grid: a row of cells is as tall as its tallest, so panels that
  // stand open beside rows that collapse leave holes down the short side.
  // Left is what this machine does; right is what it talks to.
  const panels = (
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
          </div>
        </SettingsCard>
      )}

      {advanced.length > 0 && (
        <SettingsCard index={3}>
          <SettingsSectionHeader title="Advanced" icon={<SectionIcon section="advanced" />} />
          <div className="py-1.5">{advanced.map(renderRow)}</div>
        </SettingsCard>
      )}
    </div>
  );

  const connections = (
    <div className="space-y-4">
      {sharing}

      {standup.length > 0 && (
        <ConnectionCard
          card={STANDUP_CARD}
          fields={standup}
          prefillNonSecret
          configured={Boolean(valueOf('STANDUP_GITHUB_REPO') || valueOf('STANDUP_SMTP_HOST'))}
          summary={[valueOf('STANDUP_GITHUB_REPO'), valueOf('STANDUP_SMTP_HOST')]
            .filter(Boolean)
            .join(DOT)}
          {...card('standup')}
        />
      )}

      {elevenlabs.length > 0 && (
        <ConnectionCard
          card={ELEVENLABS_CARD}
          fields={elevenlabs}
          prefillNonSecret
          summary={valueOf('ELEVENLABS_MODEL_ID') || 'eleven_turbo_v2_5'}
          {...card('elevenlabs')}
        />
      )}

      {tavus.length > 0 && (
        <ConnectionCard card={TAVUS_CARD} fields={tavus} prefillNonSecret {...card('tavus')} />
      )}

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

      {extras}
    </div>
  );

  return (
    <div className="grid items-start gap-4 xl:grid-cols-2">
      {panels}
      {connections}
    </div>
  );
}
