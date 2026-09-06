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
import { cn } from '@/lib/utils';
import { SettingsCard, SettingsSectionHeader } from '@/components/settings/primitives';
import { SectionIcon } from '@/components/settings/section-icon';

export const HIDDEN_ON_SYSTEM = new Set([
  'SAVER_STYLE',
  'TIPS_ENABLED',
  'DUCK_ENABLED',
  'VOICE_INSTALL_OFFER',
]);

/** Local dictation lives on this machine; the two cloud keys below do not. */
const DICTATION_ENVS = ['VOICE_DEVICE', 'VOICE_MODEL'];

export function SystemPanel({
  fields,
  renderRow,
  dictationRow,
  sharing,
  provider,
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
  /** Which model this machine thinks with, and what it may spend doing it.
   *  Full width above the columns: it is the one thing on this page that is
   *  not a card among cards. */
  provider?: ReactNode;
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

  const storage = bySection('storage');
  const dictation = pick(DICTATION_ENVS);
  const advanced = bySection('advanced');

  const card = (key: string) => ({
    open: openCard === key,
    onToggle: () => onToggle(key),
    onSaved,
  });

  // One grid, laid out in rows rather than two columns packed by hand: four
  // sections down two hand-packed stacks ended at different heights and their
  // second rows began at different places. A row of cells is as tall as its
  // tallest, and with four of them that is even rather than holed.
  return (
    <div>
      {provider}
      <div className={cn('grid items-stretch gap-4 xl:grid-cols-2', provider && 'mt-6')}>
        {storage.length > 0 && (
          <SettingsCard index={0} variant="flat">
            <SettingsSectionHeader title="Storage" icon={<SectionIcon section="storage" />} />
            {/* Not a collapsed card: the allowed-paths list grants the agent read
                *and* write over each entry, and the editor replaces the list
                wholesale. That is worth keeping in plain sight. */}
            <div className="py-1.5">{storage.map(renderRow)}</div>
          </SettingsCard>
        )}

        {sharing}

        {(dictation.length > 0 || dictationRow) && (
          <SettingsCard index={1} variant="flat">
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
          <SettingsCard index={3} variant="flat">
            <SettingsSectionHeader title="Advanced" icon={<SectionIcon section="advanced" />} />
            <div className="py-1.5">{advanced.map(renderRow)}</div>
          </SettingsCard>
        )}

        {extras}
      </div>
    </div>
  );
}
