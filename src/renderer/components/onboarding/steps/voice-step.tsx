'use client';

// Voice & face — optional, desktop-only. Each card leads with the thing
// itself: a voice sample you can play, and the avatar preview clip actually
// moving. Keys land in the shared env through the normal settings write; the
// fields render off the backend's own registry, so an engine that predates
// them degrades to a "manage later" note instead of broken inputs.

import { useEffect, useRef, useState } from 'react';
import { Coins, Pause, Play } from 'lucide-react';
import type { SettingField, SettingsSnapshot } from '@/lib/yeaboi/settings';
import { saveSetting, verifyConnection } from '@/lib/yeaboi/settings';
import { AIAvatar } from '@/components/session/ai-avatar';
import { Button } from '@/components/ui/button';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

const DUCK_AMBER = '#e5a630';

// Rachel — the backend's default REST TTS voice; ElevenLabs' public preview.
const VOICE_SAMPLE_URL =
  'https://storage.googleapis.com/eleven-public-prod/premade/voices/21m00Tcm4TlvDq8ikWAM/df6788f9-5c96-470d-8312-aab3b3d8f50a.mp3';
// Anna — one of the Tavus stock replicas the planning backend seeds.
const FACE_PREVIEW_VIDEO = 'https://cdn.replica.tavus.io/20266/37234b1f.mp4';

const KIND_FOR: Record<string, 'elevenlabs' | 'tavus'> = {
  ELEVENLABS_API_KEY: 'elevenlabs',
  TAVUS_API_KEY: 'tavus',
};

interface ShowcaseCard {
  env: string;
  title: string;
  blurb: string;
  cost: string;
  footnote?: string;
}

const VOICE_CARDS: ShowcaseCard[] = [
  {
    env: 'ELEVENLABS_API_KEY',
    title: 'Voice — ElevenLabs',
    blurb: 'The duck speaks on live calls. Without a key it types instead — nothing breaks.',
    cost: 'Free: ~10 min of speech a month · then from $5/mo',
    footnote: 'First call downloads the ~200 MB voice engine.',
  },
  {
    env: 'TAVUS_API_KEY',
    title: 'Face — Tavus',
    blurb: "A lip-synced avatar takes the duck's video tile. Without a key it's a static portrait.",
    cost: 'Free: 25 video minutes · then from $59/mo',
  },
];

/** The call orb plus a playable sample of the default voice. */
function VoicePreview() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    return () => audioRef.current?.pause();
  }, []);

  const toggle = () => {
    if (!audioRef.current) {
      const audio = new Audio(VOICE_SAMPLE_URL);
      audio.onended = () => setPlaying(false);
      audio.onerror = () => {
        setPlaying(false);
        setFailed(true);
      };
      audioRef.current = audio;
    }
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      setFailed(false);
      void audioRef.current.play().then(
        () => setPlaying(true),
        () => setFailed(true),
      );
    }
  };

  return (
    <>
      <AIAvatar state={playing ? 'speaking' : 'listening'} color={DUCK_AMBER} />
      <Button variant="outline" size="sm" className="gap-1.5" onClick={toggle}>
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        {playing ? 'Pause' : 'Hear the voice'}
      </Button>
      <span className="text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground/60">
        {failed ? 'sample needs internet' : 'rachel · the default voice'}
      </span>
    </>
  );
}

/** The agent's call tile with a stock avatar clip actually playing. */
function FacePreview() {
  const reducedMotion = useReducedMotion();
  return (
    <>
      <div className="relative aspect-video w-full max-w-[230px] overflow-hidden rounded-lg ring-1 ring-border/60">
        <video
          src={FACE_PREVIEW_VIDEO}
          poster="/personas/anna.jpg"
          autoPlay={!reducedMotion}
          muted
          loop
          playsInline
          className="h-full w-full object-cover"
          style={{ objectPosition: 'center 18%' }}
          aria-label="A lip-synced avatar speaking in a call tile"
        />
        <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded bg-black/55 px-1.5 py-0.5 font-mono text-[9px] text-white/90">
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full bg-success motion-safe:animate-pulse"
          />
          yeaboi · avatar
        </span>
      </div>
      <span className="text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground/60">
        anna · a stock avatar, live
      </span>
    </>
  );
}

export function VoiceStep({
  snapshot,
  onSaved,
  onContinue,
  onBack,
}: {
  snapshot: SettingsSnapshot | null;
  onSaved: (envs: string[]) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [verdicts, setVerdicts] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fieldFor = (env: string): SettingField | undefined =>
    snapshot?.fields.find((f) => f.env === env);
  const cards = VOICE_CARDS.filter((card) => fieldFor(card.env));
  const hasInput = Object.values(values).some((v) => v.trim());
  const anyFailed = Object.values(verdicts).some((v) => !v.ok);

  const save = async (force = false) => {
    const entries = Object.entries(values).filter(([, value]) => value.trim());
    if (!entries.length) {
      onContinue();
      return;
    }
    setSaving(true);
    setError('');
    try {
      const checked: Record<string, { ok: boolean; message: string }> = {};
      for (const [env, value] of entries) {
        if (!force) {
          try {
            const verdict = await verifyConnection(KIND_FOR[env], { token: value.trim() });
            checked[env] = verdict;
            if (!verdict.ok) continue; // bad key stays unsaved — fix it or "Save anyway"
          } catch {
            // Older engine without the kind, or the check unreachable — save
            // untested rather than block on a feature the backend predates.
          }
        }
        await saveSetting(env, value.trim());
      }
      const savedEnvs = entries.map(([env]) => env).filter((env) => checked[env]?.ok !== false);
      if (Object.values(checked).some((v) => !v.ok)) {
        setVerdicts(checked);
        setSaving(false);
        // The keys that did verify are saved — record them even though the
        // user stays here to fix the rest.
        if (savedEnvs.length) onSaved(savedEnvs);
        return;
      }
      onSaved(savedEnvs);
      onContinue();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  if (snapshot && !cards.length) {
    return (
      <div>
        <p className="text-[13px] text-muted-foreground">
          This yeaboi engine doesn't carry the voice & video fields yet — manage them later in
          Settings.
        </p>
        <div className="mt-4 flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onBack}>
            Back
          </Button>
          <Button size="sm" onClick={onContinue}>
            Continue
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <span className="inline-block rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-primary ring-1 ring-primary/40">
        optional
      </span>
      <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
        Skip this and every call still works — the duck answers in text. With a voice and a face,
        standup calls feel like calls. Both free tiers are enough to find out.
      </p>

      <div className="mt-5 flex flex-col gap-4">
        {cards.map((card) => {
          const field = fieldFor(card.env);
          return (
            <section
              key={card.env}
              className="overflow-hidden rounded-2xl bg-card ring-1 ring-border/60"
            >
              <div className="grid sm:grid-cols-[248px_1fr]">
                <div className="flex flex-col items-center justify-center gap-2.5 border-b border-border/40 bg-secondary/20 p-5 sm:border-b-0 sm:border-r">
                  {card.env === 'ELEVENLABS_API_KEY' ? <VoicePreview /> : <FacePreview />}
                </div>
                <div className="flex flex-col justify-center p-6">
                  <h2 className="text-[15px] font-body font-medium text-foreground">
                    {card.title}
                  </h2>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
                    {card.blurb}
                  </p>
                  <p className="mt-2.5 text-[13px] text-muted-foreground">
                    {field?.help_url ? (
                      <a
                        href={field.help_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                      >
                        Create a free account & generate an API key ↗
                      </a>
                    ) : (
                      'Create a free account and generate an API key'
                    )}
                  </p>
                  <p className="mt-2 flex items-baseline gap-1.5 text-[12.5px] text-muted-foreground">
                    <Coins
                      aria-hidden
                      className="h-3.5 w-3.5 shrink-0 translate-y-0.5 text-primary/70"
                    />
                    {card.cost}
                  </p>
                  <input
                    type="password"
                    value={values[card.env] ?? ''}
                    placeholder={field?.is_set ? 'saved — paste to replace' : 'API key'}
                    onChange={(event) => {
                      setValues((current) => ({ ...current, [card.env]: event.target.value }));
                      setVerdicts((current) => {
                        if (!(card.env in current)) return current;
                        const { [card.env]: _cleared, ...rest } = current;
                        return rest;
                      });
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void save(anyFailed);
                    }}
                    className="mt-3.5 w-full rounded-lg bg-secondary/40 border border-border/40 px-3 py-2 text-[13px] font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
                  />
                  {verdicts[card.env] && (
                    <p
                      className={`mt-2 text-[12px] ${
                        verdicts[card.env].ok ? 'text-success' : 'text-destructive'
                      }`}
                    >
                      {verdicts[card.env].ok ? '✓' : '✗'} {verdicts[card.env].message}
                    </p>
                  )}
                  {card.footnote && (
                    <p className="mt-2 text-[11px] text-muted-foreground/60">{card.footnote}</p>
                  )}
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <p className="mt-2.5 text-[11px] text-muted-foreground/60">
        Vendor pricing as of Aug 2026 — check their sites for current rates.
      </p>
      {error && <p className="mt-3 text-[12px] text-destructive">{error}</p>}
      <div className="mt-5 flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onBack}>
          Back
        </Button>
        <Button size="sm" disabled={saving || !snapshot} onClick={() => void save(anyFailed)}>
          {saving
            ? 'Checking key…'
            : anyFailed
              ? 'Save anyway'
              : hasInput
                ? 'Save & continue'
                : 'Skip for now'}
        </Button>
      </div>
    </div>
  );
}
