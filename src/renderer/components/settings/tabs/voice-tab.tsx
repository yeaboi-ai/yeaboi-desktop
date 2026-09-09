'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BookText, Mic, Plus, Search, X, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthFetch, getStoredOrgId } from '@/hooks/use-auth-fetch';
import { logger } from '@/lib/logger';
import {
  SettingsCard,
  SettingsSectionHeader,
  SettingsListRow,
  SettingsEmptyState,
  SettingsFormField,
} from '@/components/settings/primitives';
import { cn } from '@/lib/utils';
import { VoiceDefaultsCard } from './voice-defaults-card';

// ─── Voice training section ──────────────────────────────────────────────────

const TONGUE_TWISTERS = [
  'She sells serverless services by the seashore while six sticky Kubernetes clusters crash and cache.',
  "Peter's PostgreSQL procedures process parallel payloads, but Peter's pipelines periodically panic.",
  'How much code could a code review review if a code review could review code?',
  'Red lorry, yellow lorry, Redis cluster, React render, Redux reducer.',
];

interface TrainingStep {
  id: string;
  title: string;
  icon: string;
  instruction: string;
  phrase: string;
  purpose: string;
}

function buildTrainingSteps(userName: string): TrainingStep[] {
  const twister = TONGUE_TWISTERS[Math.floor(Math.random() * TONGUE_TWISTERS.length)];
  return [
    {
      id: 'name',
      title: 'The Basics',
      icon: '👋',
      instruction: 'Introduce yourself:',
      phrase: `Hi, my name is ${userName || 'your name here'}, nice to meet you!`,
      purpose: 'name_calibration',
    },
    {
      id: 'project',
      title: 'The Pitch',
      icon: '🚀',
      instruction: 'Read this project pitch:',
      phrase:
        "We're building a real-time planning platform with AI-powered voice collaboration and live blueprint editing.",
      purpose: 'domain_terms',
    },
    {
      id: 'tech',
      title: 'Tech Stack',
      icon: '⚡',
      instruction: 'Rattle off this tech stack:',
      phrase:
        'React, Next.js, PostgreSQL, Redis, LiveKit, WebSocket, GraphQL, Kubernetes, Docker, and CI/CD pipelines.',
      purpose: 'technical_terms',
    },
    {
      id: 'meeting',
      title: 'Meeting Mode',
      icon: '💬',
      instruction: "Say this like you're in a standup:",
      phrase:
        "Yesterday I finished the OAuth integration, today I'm working on the API endpoints, and I'm blocked on the deployment config.",
      purpose: 'natural_speech',
    },
    {
      id: 'speed',
      title: 'Speed Round',
      icon: '💨',
      instruction: 'Say these as fast as you can:',
      phrase:
        'API, CI/CD, MVP, OAuth, WebSocket, GraphQL, Kubernetes, PostgreSQL, TypeScript, Docker.',
      purpose: 'acronyms',
    },
    {
      id: 'tongue_twister',
      title: 'Tongue Twister',
      icon: '🤪',
      instruction: 'Final challenge! Try to say:',
      phrase: twister,
      purpose: 'stress_test',
    },
  ];
}

function VoiceTrainingSection() {
  const { authFetch, ready: authReady } = useAuthFetch();
  const [, setUserName] = useState('');
  const [steps, setSteps] = useState<TrainingStep[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<
    { step_id: string; transcription: string; expected_text: string }[]
  >([]);
  const [completed, setCompleted] = useState(false);
  const [termsLearned, setTermsLearned] = useState(0);
  const [profileStatus, setProfileStatus] = useState<{ completed: boolean } | null>(null);
  const [wordStatuses, setWordStatuses] = useState<string[]>([]);
  const wordStatusRef = useRef<string[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopRecordingRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    if (!authReady) return;
    authFetch('/api/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const name = data?.display_name || data?.name || '';
        setUserName(name);
        setSteps(buildTrainingSteps(name));
      })
      .catch(() => setSteps(buildTrainingSteps('')));
    authFetch('/api/voice-profile/status')
      .then((r) => (r.ok ? r.json() : null))
      .then(setProfileStatus)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      const step = steps[currentStep];
      const phraseWords = step
        ? step.phrase
            .replace(/[.,!?;:'"]/g, '')
            .toLowerCase()
            .split(/\s+/)
        : [];
      const statuses = phraseWords.map(() => 'pending');
      wordStatusRef.current = statuses;
      setWordStatuses([...statuses]);

      let dgKey = '';
      try {
        // The web app minted this through a Next proxy; here the real route
        // is the one use-deepgram-transcript already calls.
        const tokenResp = await authFetch('/api/sessions/deepgram-token');
        const tokenData = await tokenResp.json();
        dgKey = tokenData.key || '';
      } catch {
        /* no Deepgram — highlights won't work but recording still does */
      }

      if (dgKey) {
        const params = new URLSearchParams({
          model: 'nova-3',
          punctuate: 'false',
          smart_format: 'false',
          interim_results: 'true',
          utterance_end_ms: '3000',
        });
        const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params}`, ['token', dgKey]);

        ws.onopen = () => {
          recorder.start(250);
          mediaRecorderRef.current = recorder;
          setRecording(true);
        };
        ws.onerror = (e) => logger.error('Deepgram WS error', e);
        const wordMatch = (expected: string, heard: string): boolean => {
          if (expected === heard) return true;
          const expParts = expected.split('-');
          if (expParts.length > 1 && expParts.some((p) => p === heard)) return true;
          const expNoApostrophe = expected.replace("'", '');
          if (expNoApostrophe === heard) return true;
          return false;
        };

        let phrasePos = 0;
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type !== 'Results') return;
            const alt = data.channel?.alternatives?.[0];
            if (!alt?.transcript) return;
            const heard = alt.transcript
              .toLowerCase()
              .replace(/[.,!?;:'"-]/g, '')
              .split(/\s+/)
              .filter(Boolean);
            if (heard.length === 0) return;

            const s = wordStatusRef.current;

            if (data.is_final) {
              for (const heardWord of heard) {
                if (phrasePos >= phraseWords.length) break;
                if (wordMatch(phraseWords[phrasePos], heardWord)) {
                  s[phrasePos] = 'correct';
                  phrasePos++;
                  continue;
                }
                for (
                  let look = phrasePos + 1;
                  look < Math.min(phrasePos + 4, phraseWords.length);
                  look++
                ) {
                  if (wordMatch(phraseWords[look], heardWord)) {
                    s[look] = 'correct';
                    phrasePos = look + 1;
                    break;
                  }
                }
              }
            } else {
              for (let j = phrasePos; j < s.length; j++) {
                if (s[j] === 'active') s[j] = 'pending';
              }
              if (phrasePos < s.length && s[phrasePos] !== 'wrong') {
                s[phrasePos] = 'active';
              }
            }

            wordStatusRef.current = [...s];
            setWordStatuses([...s]);

            if (data.is_final && phrasePos >= phraseWords.length) {
              setTimeout(() => {
                stopRecordingRef.current?.();
              }, 500);
            }
          } catch {
            /* ignore */
          }
        };
        wsRef.current = ws;
      } else {
        recorder.start(250);
        mediaRecorderRef.current = recorder;
        setRecording(true);
      }

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
          if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(e.data);
        }
      };
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch (e) {
      logger.error('Mic access failed', e);
    }
  }, [steps, currentStep]);

  const stopRecording = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    return new Promise<void>((resolve) => {
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        recorder.stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        setProcessing(true);

        const formData = new FormData();
        formData.append('file', blob, 'training.webm');
        try {
          const resp = await authFetch('/api/voice-profile/train-step', {
            method: 'POST',
            body: formData,
          });
          if (resp.ok) {
            const data = await resp.json();
            const step = steps[currentStep];
            setResults((prev) => [
              ...prev,
              { step_id: step.id, transcription: data.transcription, expected_text: step.phrase },
            ]);
            setCurrentStep((prev) => prev + 1);
          }
        } catch (e) {
          logger.error('Training step failed', e);
        } finally {
          setProcessing(false);
        }
        resolve();
      };
      recorder.stop();
    });
  }, [steps, currentStep, authFetch]);
  stopRecordingRef.current = stopRecording;

  const completeTraining = useCallback(async () => {
    setProcessing(true);
    try {
      const resp = await authFetch('/api/voice-profile/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          results.map((r) => ({
            step_id: r.step_id,
            transcription: r.transcription,
            expected_text: r.expected_text,
          })),
        ),
      });
      if (resp.ok) {
        const data = await resp.json();
        setTermsLearned(data.terms_learned);
        setCompleted(true);
      }
    } finally {
      setProcessing(false);
    }
  }, [results, authFetch]);

  useEffect(() => {
    setWordStatuses([]);
    wordStatusRef.current = [];
  }, [currentStep]);

  useEffect(() => {
    if (steps.length > 0 && results.length === steps.length && !completed) {
      completeTraining();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results.length, steps.length]);

  // ─── Active voice profile (already trained) ───
  if (profileStatus?.completed && !completed) {
    return (
      <div className="px-5 py-8 flex flex-col items-center text-center gap-4">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-success/10 border border-success/20">
          <Mic className="size-6 text-success" aria-hidden="true" />
        </div>
        <div>
          <h3 className="text-base font-display italic text-foreground">Voice profile active</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            Your transcriptions are optimized for how you talk.
          </p>
        </div>
        <Button
          onClick={() => setProfileStatus(null)}
          variant="outline"
          size="sm"
          className="text-xs font-body"
        >
          Retrain voice
        </Button>
      </div>
    );
  }

  // ─── Completed training (results screen) ───
  if (completed) {
    return (
      <div className="px-5 py-6 space-y-6">
        <div className="text-center">
          <div className="text-4xl mb-2">🎉</div>
          <h3 className="text-xl font-display italic text-foreground">All done!</h3>
          <p className="text-xs text-muted-foreground mt-1.5 max-w-md mx-auto">
            I now know how you talk. Learned{' '}
            <span className="text-success font-semibold">{termsLearned} terms</span> from your
            voice. Your transcriptions should be noticeably better.
          </p>
        </div>

        <div className="space-y-2">
          <h4 className="text-[10px] font-body font-semibold text-muted-foreground uppercase tracking-wider">
            Training results
          </h4>
          {results.map((r, i) => {
            const stepDef = steps[i];
            if (!stepDef) return null;
            const expectedWords = r.expected_text
              .replace(/[.,!?;:'"-]/g, '')
              .toLowerCase()
              .split(/\s+/);
            const heardWords = r.transcription
              .replace(/[.,!?;:'"-]/g, '')
              .toLowerCase()
              .split(/\s+/);
            const mismatches: { expected: string; heard: string }[] = [];
            const minLen = Math.min(expectedWords.length, heardWords.length);
            for (let j = 0; j < minLen; j++) {
              const exp = expectedWords[j];
              const hrd = heardWords[j];
              if (
                exp !== hrd &&
                !(exp.length >= 3 && hrd.length >= 3 && exp.slice(0, 3) === hrd.slice(0, 3))
              ) {
                const origExpected = r.expected_text.split(/\s+/)[j] || exp;
                const origHeard = r.transcription.split(/\s+/)[j] || hrd;
                mismatches.push({
                  expected: origExpected.replace(/[.,!?;:'"]/g, ''),
                  heard: origHeard.replace(/[.,!?;:'"]/g, ''),
                });
              }
            }
            const accuracy =
              expectedWords.length > 0
                ? Math.round(
                    ((expectedWords.length - mismatches.length) / expectedWords.length) * 100,
                  )
                : 100;

            return (
              <div key={r.step_id} className="border border-border rounded-lg p-3 bg-secondary/40">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{stepDef.icon}</span>
                    <span className="text-xs font-body font-medium text-foreground">
                      {stepDef.title}
                    </span>
                  </div>
                  <span
                    className={cn(
                      'text-xs font-body font-semibold',
                      accuracy >= 90
                        ? 'text-success'
                        : accuracy >= 70
                          ? 'text-warning'
                          : 'text-destructive',
                    )}
                  >
                    {accuracy}% match
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground font-body mb-0.5">You said:</p>
                <p className="text-xs text-foreground font-body leading-relaxed">
                  {r.transcription}
                </p>
                {mismatches.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border/60">
                    <p className="text-[10px] text-warning font-body mb-1.5">
                      Words the AI might struggle with:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {mismatches.map((m, mi) => (
                        <span
                          key={mi}
                          className="inline-flex items-center gap-1 text-[11px] font-body px-2 py-0.5 rounded-md bg-warning/10 border border-warning/20"
                        >
                          <span className="text-muted-foreground">{m.heard}</span>
                          <span className="text-muted-foreground/50">→</span>
                          <span className="text-warning">{m.expected}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── Training flow ───
  const step = steps[currentStep];
  const progress = steps.length > 0 ? (currentStep / steps.length) * 100 : 0;
  const phraseWords = step ? step.phrase.split(/(\s+)/) : [];
  let wordIdx = 0;

  return (
    <div className="px-5 py-6 space-y-6">
      <div className="text-center">
        <h3 className="text-xl font-display italic text-foreground">Teach me your voice</h3>
        <p className="text-xs text-muted-foreground mt-1.5 max-w-md mx-auto">
          Read each phrase out loud. {steps.length} short prompts — takes about 2 minutes.
        </p>
      </div>

      <div className="flex items-center justify-center gap-1.5">
        {steps.map((s, i) => (
          <button
            key={s.id}
            onClick={() => {
              if (i <= currentStep && !recording && !processing) {
                setResults((prev) =>
                  prev.filter((r) => {
                    const idx = steps.findIndex((st) => st.id === r.step_id);
                    return idx < i;
                  }),
                );
                setCurrentStep(i);
                setWordStatuses([]);
                wordStatusRef.current = [];
              }
            }}
            disabled={recording || processing || i > currentStep}
            className={cn(
              'flex items-center justify-center w-8 h-8 rounded-full text-sm transition-all duration-300',
              i < currentStep
                ? 'bg-success/15 text-success border border-success/30 hover:bg-success/25 cursor-pointer'
                : i === currentStep
                  ? 'bg-secondary border-2 border-success/60 text-foreground scale-110 shadow-sm'
                  : 'bg-secondary/40 border border-border text-muted-foreground/40 cursor-default',
            )}
            title={i < currentStep ? `${s.title} — click to redo` : s.title}
          >
            {i < currentStep ? '✓' : s.icon}
          </button>
        ))}
      </div>

      <div className="max-w-xs mx-auto">
        <div className="h-1 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-success rounded-full transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {step && (
        <div className="relative border border-border rounded-2xl bg-card overflow-hidden">
          <div className="px-6 pt-6">
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-lg">{step.icon}</span>
              <span className="text-[10px] font-body font-semibold text-success uppercase tracking-[0.15em]">
                {step.title}
              </span>
            </div>
            <p className="text-xs text-muted-foreground font-body mb-3.5">{step.instruction}</p>

            <div className="rounded-xl bg-secondary/40 border border-border/60 px-5 py-4">
              <p className="text-base leading-[2.2] font-body">
                {phraseWords.map((token, i) => {
                  if (/^\s+$/.test(token)) return <span key={i}> </span>;
                  const thisWordIdx = wordIdx++;
                  const status = wordStatuses[thisWordIdx] || 'pending';
                  return (
                    <span
                      key={i}
                      className={cn(
                        'inline-block rounded-md px-1 py-0.5 mx-[1px] transition-all duration-300 ease-out',
                        status === 'active'
                          ? 'text-foreground bg-success/25 font-semibold -translate-y-0.5 shadow-sm'
                          : status === 'correct' || status === 'wrong'
                            ? 'text-success'
                            : recording
                              ? 'text-muted-foreground/50'
                              : 'text-foreground',
                      )}
                    >
                      {token}
                    </span>
                  );
                })}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-center py-6">
            {processing ? (
              <div className="flex flex-col items-center gap-2.5">
                <div className="w-14 h-14 rounded-full bg-secondary border border-border flex items-center justify-center">
                  <span className="h-5 w-5 rounded-full border-2 border-success/30 border-t-success animate-spin" />
                </div>
                <span className="text-[11px] text-muted-foreground font-body">
                  Analyzing your speech…
                </span>
              </div>
            ) : recording ? (
              <div className="flex flex-col items-center gap-2.5">
                <button
                  onClick={stopRecording}
                  aria-label="Stop recording"
                  className="w-14 h-14 rounded-full bg-destructive/15 border-2 border-destructive/60 flex items-center justify-center hover:bg-destructive/25 transition-all group"
                >
                  <Square className="size-5 text-destructive fill-destructive group-hover:scale-110 transition-transform" />
                </button>
                <div className="flex items-center gap-[3px] h-5">
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className="w-[3px] bg-destructive/60 rounded-full animate-pulse"
                      style={{
                        height: `${8 + Math.random() * 12}px`,
                        animationDelay: `${i * 0.12}s`,
                        animationDuration: `${0.4 + Math.random() * 0.3}s`,
                      }}
                    />
                  ))}
                </div>
                <span className="text-[11px] text-destructive font-body">Tap to stop</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2.5">
                <button
                  onClick={startRecording}
                  aria-label="Start recording"
                  className="w-14 h-14 rounded-full bg-success/10 border-2 border-success/30 flex items-center justify-center hover:bg-success/20 hover:border-success/50 hover:scale-105 transition-all group"
                >
                  <Mic className="size-5 text-success group-hover:scale-110 transition-transform" />
                </button>
                <span className="text-[11px] text-muted-foreground font-body">Tap to start</span>
              </div>
            )}
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-1.5">
          {results.map((r, i) => (
            <div
              key={r.step_id}
              className="flex items-center gap-3 px-3 py-2 rounded-lg bg-secondary/40 border border-border/40"
            >
              <span className="text-success text-sm">✓</span>
              <span className="text-xs font-body font-medium text-foreground">
                {steps[i]?.title}
              </span>
              <span className="text-xs text-muted-foreground font-body truncate flex-1">
                {r.transcription.slice(0, 60)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Vocabulary section ──────────────────────────────────────────────────────

const CATEGORY_OPTIONS = [
  { value: 'general', label: 'General' },
  { value: 'person_name', label: 'Person Name' },
  { value: 'product', label: 'Product' },
  { value: 'acronym', label: 'Acronym' },
  { value: 'technical_term', label: 'Technical Term' },
];

interface VocabEntry {
  id: string;
  canonical_form: string;
  category: string;
  user_id: string | null;
  usage_count: number;
  variants: { id: string; variant_text: string; occurrence_count: number }[];
  created_at: string;
}

function VocabularySection() {
  const { authFetch } = useAuthFetch();
  const orgId = getStoredOrgId();
  const [entries, setEntries] = useState<VocabEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newTerm, setNewTerm] = useState('');
  const [newCategory, setNewCategory] = useState('general');
  const [newVariants, setNewVariants] = useState('');
  const [saving, setSaving] = useState(false);

  const loadEntries = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const resp = await authFetch(`/api/orgs/${orgId}/vocabulary?${params}`);
      if (resp.ok) setEntries(await resp.json());
    } catch (e) {
      logger.error('Failed to load vocabulary', e);
    } finally {
      setLoading(false);
    }
  }, [orgId, authFetch, search]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const handleAdd = async () => {
    if (!orgId || !newTerm.trim()) return;
    setSaving(true);
    try {
      const resp = await authFetch(`/api/orgs/${orgId}/vocabulary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canonical_form: newTerm.trim(),
          category: newCategory,
          variants: newVariants
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean),
        }),
      });
      if (resp.ok) {
        setNewTerm('');
        setNewVariants('');
        setShowAdd(false);
        loadEntries();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (entryId: string) => {
    if (!orgId) return;
    await authFetch(`/api/orgs/${orgId}/vocabulary/${entryId}`, { method: 'DELETE' });
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
  };

  const filtered = entries.filter(
    (e) => !search || e.canonical_form.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <>
      <SettingsSectionHeader
        title="Custom vocabulary"
        subtitle="Terms learned automatically when you correct transcriptions, or add them manually"
        action={
          <Button
            onClick={() => setShowAdd((s) => !s)}
            variant={showAdd ? 'ghost' : 'outline'}
            size="sm"
            className="text-xs font-body"
          >
            {showAdd ? (
              <>
                <X className="size-3 mr-1" aria-hidden="true" /> Cancel
              </>
            ) : (
              <>
                <Plus className="size-3 mr-1" aria-hidden="true" /> Add term
              </>
            )}
          </Button>
        }
      />

      {showAdd && (
        <div className="px-5 py-4 border-b border-border bg-card/40 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <SettingsFormField id="vocab-term" label="Term" required>
              <Input
                value={newTerm}
                onChange={(e) => setNewTerm(e.target.value)}
                placeholder="e.g. Omar Noureldin"
              />
            </SettingsFormField>
            <div className="space-y-1.5">
              <Label
                htmlFor="vocab-category"
                className="text-xs font-body font-medium text-foreground"
              >
                Category
              </Label>
              <select
                id="vocab-category"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="w-full h-8 rounded-lg border border-input bg-transparent px-2.5 text-xs text-foreground focus:outline-none focus:ring-3 focus:ring-ring/50"
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <SettingsFormField
            id="vocab-variants"
            label="Known misspellings"
            help="Comma-separated, optional"
          >
            <Input
              value={newVariants}
              onChange={(e) => setNewVariants(e.target.value)}
              placeholder="e.g. Nouraldeen, Nooreldeen"
            />
          </SettingsFormField>
          <div className="flex justify-end">
            <Button
              onClick={handleAdd}
              disabled={saving || !newTerm.trim()}
              size="sm"
              className="text-xs font-body"
            >
              {saving ? 'Saving…' : 'Add term'}
            </Button>
          </div>
        </div>
      )}

      <div className="px-5 py-3 border-b border-border bg-background/40">
        <div className="relative">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/60"
            aria-hidden="true"
          />
          <Input
            placeholder="Search terms…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
            aria-label="Search vocabulary terms"
          />
        </div>
      </div>

      {loading ? (
        <div className="px-5 py-10 text-center text-xs text-muted-foreground font-body">
          Loading…
        </div>
      ) : filtered.length === 0 ? (
        <SettingsEmptyState
          icon={<BookText />}
          title={search ? 'No matches' : 'No custom vocabulary yet'}
          description={
            search
              ? 'Try a different search term.'
              : 'Terms are added automatically when you correct transcriptions, or you can add them manually above.'
          }
        />
      ) : (
        <div className="divide-y divide-border/50">
          {filtered.map((entry) => (
            <SettingsListRow
              key={entry.id}
              trailing={
                <button
                  onClick={() => handleDelete(entry.id)}
                  aria-label={`Remove ${entry.canonical_form}`}
                  className="text-[10px] font-body text-muted-foreground/40 hover:text-destructive px-1.5 py-0.5 rounded hover:bg-destructive/15 transition-colors"
                >
                  remove
                </button>
              }
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-body font-medium text-foreground truncate">
                  {entry.canonical_form}
                </span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-body shrink-0">
                  {entry.category.replace('_', ' ')}
                </span>
                <span
                  className={cn(
                    'text-[9px] px-1.5 py-0.5 rounded font-body shrink-0',
                    entry.user_id ? 'bg-primary/10 text-primary' : 'bg-success/10 text-success',
                  )}
                >
                  {entry.user_id ? 'Personal' : 'Org'}
                </span>
              </div>
              {entry.variants.length > 0 && (
                <p className="text-[11px] text-muted-foreground font-body mt-0.5 truncate">
                  {entry.variants.map((v) => v.variant_text).join(', ')}
                </p>
              )}
            </SettingsListRow>
          ))}
        </div>
      )}
    </>
  );
}

// ─── Combined tab ────────────────────────────────────────────────────────────

export function VoiceTab() {
  return (
    <div className="space-y-3">
      <SettingsCard index={0}>
        <SettingsSectionHeader
          title="Voice training"
          subtitle="Teach the transcriber how you talk so it picks up names, jargon, and accents"
        />
        <VoiceTrainingSection />
      </SettingsCard>

      <SettingsCard index={1}>
        <VocabularySection />
      </SettingsCard>

      <VoiceDefaultsCard />
    </div>
  );
}
