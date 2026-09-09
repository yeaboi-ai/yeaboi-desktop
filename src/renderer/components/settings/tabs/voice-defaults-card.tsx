'use client';

// The voice a character falls back to.
//
// A persona's Character carries its own voice; these are the values used when
// it does not. The backend has held them since the platform did
// (org_ai_defaults, resolved by services/voice_config_service.py) and no
// surface has ever offered a way to set them.

import { useCallback, useEffect, useState } from 'react';
import { AudioLines, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useAuthFetch, getStoredOrgId } from '@/hooks/use-auth-fetch';
import {
  SettingsCard,
  SettingsSectionHeader,
  SettingsInlineError,
} from '@/components/settings/primitives';

// The server validates all four; these lists are its vocabulary, so a value
// this UI can produce is a value it will accept.
const EMOTIONS = ['neutral', 'happy', 'serious', 'excited', 'calm'] as const;
const REALTIME_VOICES = [
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'sage',
  'shimmer',
  'verse',
] as const;
const LANGUAGES: { id: string; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Spanish' },
  { id: 'fr', label: 'French' },
  { id: 'de', label: 'German' },
  { id: 'it', label: 'Italian' },
  { id: 'pt', label: 'Portuguese' },
  { id: 'nl', label: 'Dutch' },
  { id: 'ja', label: 'Japanese' },
  { id: 'zh', label: 'Chinese' },
];

const PREVIEW_LINE = 'Right — what are we building, and who is it for?';

interface Voice {
  id: string;
  name: string;
  description: string;
}

interface Defaults {
  voice_id: string;
  speed: number;
  emotion: string;
  language: string;
  realtime_voice: string;
}

const FALLBACK: Defaults = {
  voice_id: '',
  speed: 1,
  emotion: 'neutral',
  language: 'en',
  realtime_voice: 'alloy',
};

export function VoiceDefaultsCard() {
  const { authFetch, ready } = useAuthFetch();
  const orgId = getStoredOrgId();
  const [voices, setVoices] = useState<Voice[]>([]);
  const [values, setValues] = useState<Defaults>(FALLBACK);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ready || !orgId) return;
    try {
      const [defaultsResp, voicesResp] = await Promise.all([
        authFetch(`/api/orgs/${orgId}/ai-defaults`),
        authFetch('/api/voices'),
      ]);
      if (defaultsResp.ok) {
        const d = (await defaultsResp.json()) as Partial<Defaults>;
        setValues({
          voice_id: d.voice_id ?? '',
          speed: d.speed ?? FALLBACK.speed,
          emotion: d.emotion ?? FALLBACK.emotion,
          language: d.language ?? FALLBACK.language,
          realtime_voice: d.realtime_voice ?? FALLBACK.realtime_voice,
        });
      }
      if (voicesResp.ok) setVoices((await voicesResp.json()) as Voice[]);
    } catch {
      setError('Could not read the voice defaults.');
    } finally {
      setLoading(false);
    }
  }, [authFetch, ready, orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!orgId) return;
    setSaving(true);
    setError(null);
    try {
      const resp = await authFetch(`/api/orgs/${orgId}/ai-defaults`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // An empty voice means "no default"; the server reads null that way.
        body: JSON.stringify({ ...values, voice_id: values.voice_id || null }),
      });
      if (!resp.ok) throw new Error(`save ${resp.status}`);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError('Could not save. The change is still on screen.');
    } finally {
      setSaving(false);
    }
  }

  // TTS needs a key; without one the route answers 503 and the button says so
  // rather than failing silently.
  async function preview() {
    setPreviewing(true);
    setError(null);
    try {
      const resp = await authFetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: PREVIEW_LINE, voice_id: values.voice_id || undefined }),
      });
      if (!resp.ok) throw new Error(`tts ${resp.status}`);
      const url = URL.createObjectURL(await resp.blob());
      const audio = new Audio(url);
      audio.addEventListener('ended', () => URL.revokeObjectURL(url));
      await audio.play();
    } catch {
      setError('No preview — text-to-speech needs an ElevenLabs key in Credentials.');
    } finally {
      setPreviewing(false);
    }
  }

  const selectClass =
    'h-8 w-full rounded-lg border border-input bg-background px-2 font-body text-xs text-foreground disabled:opacity-50';

  return (
    <SettingsCard>
      <SettingsSectionHeader
        title="Default voice"
        subtitle="What a persona speaks with when its Character carries no voice of its own."
        icon={<AudioLines className="size-4 text-muted-foreground" aria-hidden="true" />}
      />
      <div className="space-y-4 px-4 py-4">
        <div className="space-y-1">
          <Label htmlFor="voice-default" className="text-[10px] uppercase tracking-[0.1em]">
            Voice
          </Label>
          <select
            id="voice-default"
            value={values.voice_id}
            disabled={loading}
            onChange={(e) => setValues((v) => ({ ...v, voice_id: e.target.value }))}
            className={selectClass}
          >
            <option value="">Platform default</option>
            {voices.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.name}
                {voice.description ? ` — ${voice.description}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="voice-emotion" className="text-[10px] uppercase tracking-[0.1em]">
              Emotion
            </Label>
            <select
              id="voice-emotion"
              value={values.emotion}
              disabled={loading}
              onChange={(e) => setValues((v) => ({ ...v, emotion: e.target.value }))}
              className={selectClass}
            >
              {EMOTIONS.map((emotion) => (
                <option key={emotion} value={emotion}>
                  {emotion}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="voice-language" className="text-[10px] uppercase tracking-[0.1em]">
              Language
            </Label>
            <select
              id="voice-language"
              value={values.language}
              disabled={loading}
              onChange={(e) => setValues((v) => ({ ...v, language: e.target.value }))}
              className={selectClass}
            >
              {LANGUAGES.map((language) => (
                <option key={language.id} value={language.id}>
                  {language.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="voice-speed" className="text-[10px] uppercase tracking-[0.1em]">
            Speed — {values.speed.toFixed(2)}×
          </Label>
          <input
            id="voice-speed"
            type="range"
            min={0.5}
            max={2}
            step={0.05}
            value={values.speed}
            disabled={loading}
            onChange={(e) => setValues((v) => ({ ...v, speed: Number(e.target.value) }))}
            className="w-full accent-primary"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="voice-realtime" className="text-[10px] uppercase tracking-[0.1em]">
            Realtime voice
          </Label>
          <select
            id="voice-realtime"
            value={values.realtime_voice}
            disabled={loading}
            onChange={(e) => setValues((v) => ({ ...v, realtime_voice: e.target.value }))}
            className={selectClass}
          >
            {REALTIME_VOICES.map((voice) => (
              <option key={voice} value={voice}>
                {voice}
              </option>
            ))}
          </select>
          <p className="font-body text-[10px] text-muted-foreground/60">
            Used only when a session runs on the realtime backend, which speaks with its own set.
          </p>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Button onClick={() => void save()} disabled={saving || loading} size="sm">
            {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
          </Button>
          <Button
            onClick={() => void preview()}
            disabled={previewing || loading}
            size="sm"
            variant="outline"
          >
            <Play className="size-3" aria-hidden="true" />
            {previewing ? 'Playing…' : 'Hear it'}
          </Button>
        </div>

        {error && <SettingsInlineError message={error} />}
      </div>
    </SettingsCard>
  );
}
