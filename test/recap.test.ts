// The recap's transcript: the plan's typed turns and the call's spoken ones as
// one list, cards and notices left out, the typed conversation ahead of the
// call.

import { describe, expect, it } from 'vitest';
import {
  NO_CALL_LINE,
  YOU,
  engineEntries,
  mergeTranscripts,
  voiceEntries,
} from '../src/renderer/lib/planning/recap';

const AT = '2026-09-12T09:00:00Z';

describe('engineEntries', () => {
  it('keeps the turns and drops cards and notices', () => {
    const rows = engineEntries(
      [
        { role: 'assistant', text: 'What are we building?' },
        { role: 'user', text: 'A barber booking app' },
        { role: 'card', text: '', kind: 'analysis' },
        { role: 'notice', text: 'Switched to Large' },
        { role: 'user', text: '   ' },
      ],
      'Barber booking',
      AT,
    );
    expect(rows.map((r) => [r.speaker_name, r.message_type])).toEqual([
      ['Barber booking', 'ai'],
      [YOU, 'chat'],
    ]);
    expect(rows.every((r) => r.created_at === AT && r.is_final)).toBe(true);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });

  it('names the engine when the plan has no name yet', () => {
    const [row] = engineEntries([{ role: 'assistant', text: 'Hi' }], '  ', AT);
    expect(row?.speaker_name).toBe('yeaboi');
  });
});

describe('voiceEntries', () => {
  it('keeps spoken turns and persona switches, drops other system rows', () => {
    const rows = voiceEntries([
      {
        id: 'a',
        content: 'Hello',
        message_type: 'voice_ai',
        speaker_name: 'Senior Engineer',
        created_at: '2',
      },
      {
        id: 'b',
        content: 'Switched to **Product Manager**',
        message_type: 'system',
        created_at: '3',
      },
      { id: 'c', content: 'Call ended', message_type: 'system', created_at: '4' },
    ]);
    expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
    expect(rows[1]?.speaker_name).toBeNull();
  });
});

describe('mergeTranscripts', () => {
  it('orders by time, keeping the typed conversation ahead of a later call', () => {
    const engine = engineEntries(
      [
        { role: 'assistant', text: 'one' },
        { role: 'user', text: 'two' },
      ],
      'Plan',
      AT,
    );
    const voice = voiceEntries([
      {
        id: 'v',
        content: 'three',
        message_type: 'voice_chat',
        speaker_name: 'Omar',
        created_at: '2026-09-12T10:00:00Z',
      },
    ]);
    expect(mergeTranscripts(engine, voice).map((r) => r.text)).toEqual(['one', 'two', 'three']);
  });

  it('is stable for entries stamped alike', () => {
    const engine = engineEntries(
      [
        { role: 'assistant', text: 'a' },
        { role: 'user', text: 'b' },
        { role: 'assistant', text: 'c' },
      ],
      'Plan',
      '',
    );
    expect(mergeTranscripts(engine, []).map((r) => r.text)).toEqual(['a', 'b', 'c']);
  });

  it('has a plain line for a plan that never took a call', () => {
    expect(NO_CALL_LINE).not.toMatch(/[·→]/);
    expect(NO_CALL_LINE).toMatch(/\.$/);
  });
});
