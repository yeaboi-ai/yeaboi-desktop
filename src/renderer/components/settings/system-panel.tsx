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
import { SettingsSection } from '@/components/settings/primitives';

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
  /** Sections this build does not know about yet. */
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

  // One grid, laid out in rows rather than two columns packed by hand: four
  // sections down two hand-packed stacks ended at different heights and their
  // second rows began at different places. A row of cells is as tall as its
  // tallest, and with four of them that is even rather than holed.
  return (
    <div>
      {provider}
      <div className={cn('grid items-start gap-x-10 gap-y-8 xl:grid-cols-2', provider && 'mt-8')}>
        {storage.length > 0 && (
          <SettingsSection index={0} title="Storage">
            {/* Not a collapsed card: the allowed-paths list grants the agent read
                *and* write over each entry, and the editor replaces the list
                wholesale. That is worth keeping in plain sight. */}
            <div className="py-1">{storage.map(renderRow)}</div>
          </SettingsSection>
        )}

        {sharing}

        {(dictation.length > 0 || dictationRow) && (
          <SettingsSection
            index={1}
            title="Dictation"
            subtitle="speech to text, transcribed on this machine"
          >
            <div className="py-1">
              {dictationRow}
              {dictation.map(renderRow)}
            </div>
          </SettingsSection>
        )}

        {advanced.length > 0 && (
          <SettingsSection index={3} title="Advanced">
            <div className="py-1">{advanced.map(renderRow)}</div>
          </SettingsSection>
        )}

        {extras}
      </div>
    </div>
  );
}
