// Credentials lists what you actually use; the Catalog is where the rest is
// found.
//
// The regression this guards is onboarding: its whole job is to show
// connections nobody has set up yet, so the filter has to be opt-in. A default
// that hides unconfigured cards would empty the onboarding step silently.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CONNECTION_CARDS,
  GROUPS,
  groupConnections,
  isConfigured,
} from '../src/renderer/components/yeaboi/connection-card';
import type { SettingField, SettingsSnapshot } from '../src/renderer/lib/yeaboi/settings';

const read = (...parts: string[]) => readFileSync(join(__dirname, '..', ...parts), 'utf8');

function field(env: string, section: string, over: Partial<SettingField> = {}): SettingField {
  return {
    env,
    label: env,
    section,
    secret: false,
    value: '',
    is_set: false,
    choices: [],
    choice_labels: {},
    active_choice: '',
    default: '',
    action: '',
    help_url: '',
    help_scope: '',
    ...over,
  };
}

/** GitHub set up, Jira and Notion known but empty. */
const SNAPSHOT: SettingsSnapshot = {
  fields: [
    field('GITHUB_TOKEN', 'github', { secret: true, is_set: true }),
    field('JIRA_API_TOKEN', 'jira', { secret: true }),
    field('NOTION_TOKEN', 'notion', { secret: true }),
  ],
  sections: ['github', 'jira', 'notion'],
  config_path: '/tmp/.env',
  voice: { state: 'off', detail: '', devices: [] },
};

const sections = (groups: ReturnType<typeof groupConnections>) =>
  groups.flatMap((g) => g.items.map((i) => i.card.section));

describe('isConfigured', () => {
  it('means a saved secret belonging to this connection, not any field at all', () => {
    expect(isConfigured([field('GITHUB_TOKEN', 'github', { secret: true, is_set: true })])).toBe(
      true,
    );
    expect(isConfigured([field('GITHUB_TOKEN', 'github', { secret: true })])).toBe(false);
    // A non-secret value is configuration, not a credential.
    expect(isConfigured([field('JIRA_BASE_URL', 'jira', { is_set: true })])).toBe(false);
  });
});

describe('groupConnections', () => {
  it('keeps every card the engine has fields for by default', () => {
    // Onboarding depends on this: it must show what is not set up yet.
    expect(sections(groupConnections(SNAPSHOT, CONNECTION_CARDS, GROUPS)).sort()).toEqual([
      'github',
      'jira',
      'notion',
    ]);
  });

  it('with a keep, lists only what is set up', () => {
    const groups = groupConnections(SNAPSHOT, CONNECTION_CARDS, GROUPS, {
      keep: (_card, fields) => isConfigured(fields),
    });
    expect(sections(groups)).toEqual(['github']);
  });

  it('a revealed section survives the filter even when unconfigured', () => {
    // What makes the Catalog deep link land somewhere.
    const groups = groupConnections(SNAPSHOT, CONNECTION_CARDS, GROUPS, {
      keep: (card, fields) => isConfigured(fields) || card.section === 'notion',
    });
    expect(sections(groups).sort()).toEqual(['github', 'notion']);
  });

  it('everything can be hidden — the page owns the empty state', () => {
    const groups = groupConnections(SNAPSHOT, CONNECTION_CARDS, GROUPS, { keep: () => false });
    expect(groups).toEqual([]);
  });
});

describe('a field the card draws itself', () => {
  it('survives the action filter, so the Slack picker can render', () => {
    // An action normally means the flow lives elsewhere and the field is not
    // the card's to draw. slack-channel is the exception: the card IS the
    // picker, and filtering it out took Channel ID off the Slack card.
    const snapshot: SettingsSnapshot = {
      ...SNAPSHOT,
      fields: [
        field('SLACK_BOT_TOKEN', 'slack', { secret: true, is_set: true }),
        field('SLACK_CHANNEL_ID', 'slack', { action: 'slack-channel' }),
        field('YEABOI_HOME', 'slack', { action: 'data-dir' }),
      ],
    };
    const slack = groupConnections(snapshot, CONNECTION_CARDS, GROUPS).flatMap((g) =>
      g.items.filter((i) => i.card.section === 'slack'),
    )[0];
    const envs = slack?.fields.map((f) => f.env) ?? [];
    expect(envs).toContain('SLACK_CHANNEL_ID');
    // Everything else with a flow of its own still stays out.
    expect(envs).not.toContain('YEABOI_HOME');
  });
});

describe('the surfaces that call it', () => {
  it('onboarding passes no keep, so it keeps showing everything', () => {
    const step = read(
      'src',
      'renderer',
      'components',
      'onboarding',
      'steps',
      'connections-step.tsx',
    );
    expect(step).toContain('groupConnections(');
    expect(step).not.toContain('keep:');
  });

  it('credentials filters, and offers the catalog when nothing is left', () => {
    const page = read('src', 'renderer', 'pages', 'yeaboi', 'settings', 'yeaboi-settings-page.tsx');
    expect(page).toContain(
      'keep: (spec, fields) => isConfigured(fields) || spec.section === revealed',
    );
    expect(page).toContain('grouped.length === 0');
    expect(page).toContain('/settings/connections');
  });

  it('the cloud voice cards follow the same rule on System', () => {
    const panel = read('src', 'renderer', 'components', 'settings', 'system-panel.tsx');
    expect(panel).toContain("isSet('ELEVENLABS_API_KEY')");
    expect(panel).toContain("isSet('TAVUS_API_KEY')");
    // Standup is a machine section, not a credential, and stays visible.
    expect(panel).toMatch(/const standup = bySection\('standup'\);/);
  });
});
