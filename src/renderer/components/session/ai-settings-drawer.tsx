'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Settings2,
  Lightbulb,
  ChevronRight,
  ChevronDown,
  Globe,
  MessageSquare,
  FileText,
  Bug,
} from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { AIConfig } from './ai-controls';
import { INVOLVEMENT_LEVELS, INVOLVEMENT_DEFAULT } from './ai-controls';
import { useAuthFetch, getStoredOrgId } from '@/hooks/use-auth-fetch';
import { PersonaThumbnail } from './persona-thumbnail';
import { listVideoAvatars, type VideoAvatar } from '@/lib/api/video-avatars';
import { publishAgentControl } from '@/lib/agent-control';
import { useApiUrl } from '@/hooks/use-api-url';

const PERSONAS = [
  {
    id: 'default',
    label: 'Senior Engineer',
    description: 'Drives technical decisions',
    icon: '\u{1F6E0}',
  },
  {
    id: 'pm',
    label: 'Product Manager',
    description: 'User-focused, impact-driven',
    icon: '\u{1F4CB}',
  },
  {
    id: 'architect',
    label: 'System Architect',
    description: 'Scalability & patterns',
    icon: '\u{1F3D7}',
  },
  { id: 'mentor', label: 'Patient Mentor', description: 'Explains & teaches', icon: '\u{1F393}' },
  {
    id: 'challenger',
    label: "Devil's Advocate",
    description: 'Stress-tests ideas',
    icon: '\u{1F525}',
  },
] as const;

const ASSERTIVENESS_LEVELS = [
  { value: 'passive', label: 'Passive', description: 'Only speaks when asked' },
  { value: 'balanced', label: 'Balanced', description: 'Interjects at natural pauses' },
  { value: 'active', label: 'Active', description: 'Guides firmly, keeps pace high' },
] as const;

// Per-persona question budgets. Matches backend/src/app/services/pace.py
// PACE_BUDGETS — keep in sync so the description shown here reflects what
// the agent actually does.
const PACE_LEVELS = [
  { value: 'fast' as const, label: 'Fast', description: '3 questions / persona, 1 follow-up' },
  {
    value: 'balanced' as const,
    label: 'Balanced',
    description: '5 questions / persona, 2 follow-ups',
  },
  { value: 'deep' as const, label: 'Deep', description: '8 questions / persona, 3 follow-ups' },
];

// User comfort with technical terms. Matches TECHNICAL_COMFORT_PROMPTS in
// backend/src/app/services/facilitator.py — keep in sync.
const TECHNICAL_COMFORT_LEVELS = [
  {
    value: 'non_technical' as const,
    label: 'Plain',
    description: 'Explain technical terms in plain English',
  },
  {
    value: 'comfortable' as const,
    label: 'Comfortable',
    description: 'I know the basics — only explain when I ask',
  },
  {
    value: 'expert' as const,
    label: 'Expert',
    description: 'Skip definitions, go straight to trade-offs',
  },
];

interface PersonaRecommendation {
  persona: string;
  label: string;
  gaps_count: number;
  gap_sections: string[];
}

export type VoiceBackend = 'livekit' | 'realtime' | 'personaplex';

interface AISettingsDrawerProps {
  aiConfig: AIConfig;
  onConfigChange: (patch: Partial<AIConfig>) => void;
  aiSpeaking?: boolean;
  open: boolean;
  onToggle: () => void;
  personaRecommendations?: PersonaRecommendation[];
  inCall?: boolean;
  /** Toggle the Chat drawer — rendered alongside Settings in the bottom pill. */
  chatOpen?: boolean;
  onToggleChat?: () => void;
  /** Toggle the Inspector drawer (Blueprint / Design / Debug tabs) — rendered alongside Settings in the bottom pill. */
  contextOpen?: boolean;
  onToggleContext?: () => void;
  /** Hide the dock + backdrop while staying mounted. Used while the canvas is
   *  fullscreen so the unified bottom dock doesn't bleed through. */
  hidden?: boolean;
}

export function AISettingsDrawer({
  aiConfig,
  onConfigChange,
  aiSpeaking: _aiSpeaking = false,
  open,
  onToggle,
  personaRecommendations,
  inCall,
  chatOpen,
  onToggleChat,
  contextOpen,
  onToggleContext,
  hidden,
}: AISettingsDrawerProps) {
  const { authFetch, ready } = useAuthFetch();
  const orgId = getStoredOrgId();
  const [personas, setPersonas] = useState<
    Array<{ id: string; slug: string; name: string; video_avatar_id?: string | null }>
  >([]);
  const [videoAvatars, setVideoAvatars] = useState<VideoAvatar[]>([]);
  const characterVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const sampleAudioRef = useRef<HTMLAudioElement | null>(null);
  // Busts the browser cache once per mount, so a regenerated /uploads/*.mp3
  // at the same path plays the new voice rather than the stale one.
  const [cacheBust] = useState<number>(() => Date.now());
  const apiUrl = useApiUrl();

  const currentAssertiveness =
    ASSERTIVENESS_LEVELS.find((l) => l.value === aiConfig.assertiveness) ?? ASSERTIVENESS_LEVELS[1];
  const currentInvolvement =
    INVOLVEMENT_LEVELS.find((l) => l.value === (aiConfig.involvement ?? INVOLVEMENT_DEFAULT)) ??
    INVOLVEMENT_LEVELS[2];
  const currentPace =
    PACE_LEVELS.find((l) => l.value === (aiConfig.pace ?? 'balanced')) ?? PACE_LEVELS[1];
  const currentTechnicalComfort =
    TECHNICAL_COMFORT_LEVELS.find(
      (l) => l.value === (aiConfig.technical_comfort ?? 'comfortable'),
    ) ?? TECHNICAL_COMFORT_LEVELS[1];

  // Fetch personas + characters when panel opens
  useEffect(() => {
    if (!open || !orgId || !ready) return;
    authFetch(`/api/blueprint-personas`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (Array.isArray(data)) setPersonas(data);
      })
      .catch(() => {});
    listVideoAvatars(authFetch)
      .then(setVideoAvatars)
      .catch(() => {});
  }, [open, orgId, ready, authFetch]);

  useEffect(
    () => () => {
      sampleAudioRef.current?.pause();
      sampleAudioRef.current = null;
    },
    [],
  );

  // The persona's character, and the per-session override that can replace it.
  // Each persona has its own slot, so switching persona reveals that persona's
  // override — or the Studio default when its slot is empty.
  const activePersonaSlug = aiConfig.persona ?? 'default';
  const activePersona = personas.find((p) => p.slug === activePersonaSlug);
  const overrides = aiConfig.video_avatar_overrides ?? {};
  const sessionOverride = overrides[activePersonaSlug] ?? null;
  const activeCharacterId = sessionOverride ?? activePersona?.video_avatar_id ?? null;

  // The backend serves previews and voice samples from its own origin; a
  // Tavus CDN url is already absolute and passes through.
  const mediaUrl = (url: string) => (url.startsWith('/') ? `${apiUrl}${url}` : url);

  // The sample is the ElevenLabs voice the call actually uses. The video's own
  // audio is Tavus's default voice, so the card plays muted under it.
  function previewCharacter(id: string) {
    sampleAudioRef.current?.pause();
    sampleAudioRef.current = null;
    characterVideoRefs.current.forEach((el, key) => {
      try {
        el.muted = true;
        if (key === id) {
          el.currentTime = 0;
          el.loop = true;
          void el.play().catch(() => {});
        } else {
          el.pause();
          el.currentTime = 0;
        }
      } catch {
        /* a card that has gone away needs nothing */
      }
    });
    const avatar = videoAvatars.find((v) => v.id === id);
    if (!avatar?.voice_sample_url) return;
    const separator = avatar.voice_sample_url.includes('?') ? '&' : '?';
    const audio = new Audio(`${mediaUrl(avatar.voice_sample_url)}${separator}t=${cacheBust}`);
    sampleAudioRef.current = audio;
    audio.addEventListener('ended', () => {
      const el = characterVideoRefs.current.get(id);
      if (el) {
        el.pause();
        el.loop = false;
      }
    });
    void audio.play().catch(() => {});
  }

  function pickCharacter(characterId: string) {
    previewCharacter(characterId);
    if (activeCharacterId === characterId) return;
    // Only the session override moves; Studio's global default is untouched.
    onConfigChange({
      video_avatar_overrides: { ...overrides, [activePersonaSlug]: characterId },
    });
    if (inCall) publishAgentControl({ action: 'swap_avatar' });
  }

  function resetCharacterOverride() {
    if (!sessionOverride) return;
    const next = { ...overrides };
    delete next[activePersonaSlug];
    onConfigChange({ video_avatar_overrides: next });
    if (inCall) publishAgentControl({ action: 'swap_avatar' });
  }

  // Esc closes the dock
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onToggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onToggle]);

  const topRec = (() => {
    if (!personaRecommendations || !personaRecommendations.length) return null;
    const current = aiConfig.persona ?? 'default';
    const others = personaRecommendations.filter((r) => r.persona !== current && r.gaps_count > 0);
    return others[0] || null;
  })();

  // Morph animation matching the chat drawer's DrawerShell: same element
  // transitions its dimensions + border-radius from a small bottom pill
  // (closed) to a full horizontal dock (open). Content cross-fades.
  // Collapsed state holds three trigger buttons (Chat / Settings / Inspector).
  // The whole pill morphs into the wide Settings dock when opened.
  const COLLAPSED_W = 320;
  const COLLAPSED_H = 44;
  const EXPANDED_W = typeof window !== 'undefined' ? Math.min(window.innerWidth - 32, 1180) : 1180;
  const EXPANDED_H = 460;

  return (
    <>
      {/* Backdrop — visible only when open. Sits above DrawerShell panels
          (70–199) and the top-bar/action layer (200) so settings own the
          screen when open. */}
      <div
        className="fixed inset-0 z-[240] bg-background/60 backdrop-blur-[2px] transition-opacity duration-300"
        onClick={onToggle}
        style={{
          display: hidden ? 'none' : 'block',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
        }}
      />

      {/* Single morphing element: pill ↔ dock — always above other drawers. */}
      <div
        className="fixed bottom-4 left-1/2 z-[250] bg-background/75 backdrop-blur-md border border-border/70 overflow-hidden"
        style={{
          display: hidden ? 'none' : 'block',
          width: open ? EXPANDED_W : COLLAPSED_W,
          height: open ? EXPANDED_H : COLLAPSED_H,
          borderRadius: open ? 18 : 999,
          transform: 'translateX(-50%)',
          transition:
            'width 0.35s cubic-bezier(0.4, 0, 0.2, 1), height 0.35s cubic-bezier(0.4, 0, 0.2, 1), border-radius 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: open
            ? '0 28px 90px rgba(0,0,0,0.78), 0 0 0 1px rgba(255,255,255,0.04)'
            : '0 6px 18px rgba(0,0,0,0.4)',
        }}
      >
        {/* Collapsed pill content — three triggers (Chat / Settings / Context).
            Visible when the dock is closed; fades out as the pill morphs.
            Even, breathable spacing across the pill. */}
        <div
          className="absolute inset-0 flex items-center justify-between gap-2 px-2"
          style={{
            opacity: open ? 0 : 1,
            pointerEvents: open ? 'none' : 'auto',
            transition: 'opacity 0.2s ease',
          }}
        >
          <button
            onClick={onToggleChat}
            className={`flex items-center gap-1.5 px-3 h-8 rounded-full text-[11px] font-medium transition-colors ${chatOpen ? 'bg-foreground/[0.08] text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05]'}`}
            title="Toggle chat (C)"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Chat
          </button>
          <button
            onClick={onToggle}
            className="flex items-center gap-1.5 px-3 h-8 rounded-full text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05] transition-colors"
            title="Toggle settings (S)"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Settings
          </button>
          <button
            onClick={onToggleContext}
            className={`flex items-center gap-1.5 px-3 h-8 rounded-full text-[11px] font-medium transition-colors ${contextOpen ? 'bg-foreground/[0.08] text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05]'}`}
            title="Toggle inspector (I)"
          >
            <FileText className="h-3.5 w-3.5" />
            Inspector
          </button>
        </div>

        {/* Expanded dock content — fades in slightly after the morph starts */}
        <div
          className="absolute inset-0 flex flex-col"
          style={{
            opacity: open ? 1 : 0,
            pointerEvents: open ? 'auto' : 'none',
            transition: 'opacity 0.25s ease 0.1s',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-border/60">
            <div className="flex items-center gap-2">
              <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-medium">
                Settings
              </span>
            </div>
            <button
              onClick={onToggle}
              className="text-muted-foreground/70 hover:text-foreground/95 transition-colors text-[11px] font-medium px-2 py-1 rounded hover:bg-foreground/[0.05]"
            >
              Close
            </button>
          </div>

          {/* Three-column layout */}
          <div className="grid grid-cols-1 md:grid-cols-3 divide-x divide-white/[0.05] max-h-[440px]">
            {/* ── Column 1: Persona ── */}
            <section className="px-5 py-4 space-y-3 overflow-y-auto">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] text-muted-foreground/70 uppercase tracking-[0.14em]">
                  Persona
                </Label>
                {topRec && (
                  <button
                    onClick={() => onConfigChange({ persona: topRec.persona })}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning/[0.08] border border-amber-500/[0.18] hover:bg-warning/[0.16] transition-colors"
                    title={`Try ${topRec.label} — covers ${topRec.gaps_count} gap${topRec.gaps_count > 1 ? 's' : ''}`}
                  >
                    <Lightbulb className="h-3 w-3 text-warning" />
                    <span className="text-[10px] font-medium text-amber-200/85">
                      +{topRec.gaps_count}
                    </span>
                  </button>
                )}
              </div>
              <div className="space-y-1">
                {PERSONAS.map((persona) => {
                  const active = (aiConfig.persona ?? 'default') === persona.id;
                  const rec = personaRecommendations?.find((r) => r.persona === persona.id);
                  const hasGaps = rec && rec.gaps_count > 0;
                  return (
                    <button
                      key={persona.id}
                      onClick={() => onConfigChange({ persona: persona.id })}
                      className={`w-full flex items-center gap-2.5 py-2 px-2.5 rounded-md transition-all text-left ${active ? 'bg-foreground/[0.08] border border-border' : 'hover:bg-foreground/[0.05] border border-transparent'}`}
                    >
                      <PersonaThumbnail
                        videoPreviewUrl={null}
                        slug={persona.id}
                        alt={persona.label}
                        className="w-5 h-5 rounded-full object-cover shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <span
                          className={`text-[12px] font-medium block leading-tight ${active ? 'text-foreground' : 'text-muted-foreground'}`}
                        >
                          {persona.label}
                        </span>
                        <span className="text-[10px] text-muted-foreground/50 block leading-tight">
                          {persona.description}
                        </span>
                      </div>
                      {hasGaps && !active && (
                        <span className="text-[9px] font-semibold text-warning bg-warning/10 rounded-full w-4 h-4 flex items-center justify-center shrink-0">
                          {rec.gaps_count}
                        </span>
                      )}
                      {active && <span className="w-1.5 h-1.5 rounded-full bg-white/65 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* ── Column 2: Style + Voice toggle ── */}
            <section className="px-5 py-4 space-y-4 overflow-y-auto">
              <div className="space-y-2">
                <Label className="text-[10px] text-muted-foreground/70 uppercase tracking-[0.14em]">
                  Involvement
                </Label>
                <div
                  className="flex gap-1 bg-foreground/[0.04] rounded-md p-1"
                  role="radiogroup"
                  aria-label="Involvement mode"
                >
                  {INVOLVEMENT_LEVELS.map((level) => {
                    const active = (aiConfig.involvement ?? INVOLVEMENT_DEFAULT) === level.value;
                    return (
                      <button
                        key={level.value}
                        role="radio"
                        aria-checked={active}
                        onClick={() => onConfigChange({ involvement: level.value })}
                        title={level.description}
                        className={`flex-1 text-[11px] py-1.5 rounded transition-all font-medium ${active ? 'bg-foreground/[0.12] text-foreground' : 'text-muted-foreground/80 hover:text-foreground/80'}`}
                      >
                        {level.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground/50 leading-snug">
                  {currentInvolvement.description}
                </p>
              </div>

              <div className="border-t border-border/50" />

              <div className="space-y-2">
                <Label className="text-[10px] text-muted-foreground/70 uppercase tracking-[0.14em]">
                  Assertiveness
                </Label>
                <div className="flex gap-1 bg-foreground/[0.04] rounded-md p-1">
                  {ASSERTIVENESS_LEVELS.map((level) => {
                    const active = aiConfig.assertiveness === level.value;
                    return (
                      <button
                        key={level.value}
                        onClick={() => onConfigChange({ assertiveness: level.value })}
                        title={level.description}
                        className={`flex-1 text-[11px] py-1.5 rounded transition-all font-medium ${active ? 'bg-foreground/[0.12] text-foreground' : 'text-muted-foreground/80 hover:text-foreground/80'}`}
                      >
                        {level.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground/50 leading-snug">
                  {currentAssertiveness.description}
                </p>
              </div>

              <div className="border-t border-border/50" />

              <div className="space-y-2">
                <Label className="text-[10px] text-muted-foreground/70 uppercase tracking-[0.14em]">
                  Pace
                </Label>
                <div
                  className="flex gap-1 bg-foreground/[0.04] rounded-md p-1"
                  role="radiogroup"
                  aria-label="Per-persona question budget"
                >
                  {PACE_LEVELS.map((level) => {
                    const active = (aiConfig.pace ?? 'balanced') === level.value;
                    return (
                      <button
                        key={level.value}
                        role="radio"
                        aria-checked={active}
                        onClick={() => onConfigChange({ pace: level.value })}
                        title={level.description}
                        className={`flex-1 text-[11px] py-1.5 rounded transition-all font-medium ${active ? 'bg-foreground/[0.12] text-foreground' : 'text-muted-foreground/80 hover:text-foreground/80'}`}
                      >
                        {level.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground/50 leading-snug">
                  {currentPace.description}
                </p>
              </div>

              <div className="border-t border-border/50" />

              <div className="space-y-2">
                <Label className="text-[10px] text-muted-foreground/70 uppercase tracking-[0.14em]">
                  Technical comfort
                </Label>
                <div
                  className="flex gap-1 bg-foreground/[0.04] rounded-md p-1"
                  role="radiogroup"
                  aria-label="Comfort with technical terms"
                >
                  {TECHNICAL_COMFORT_LEVELS.map((level) => {
                    const active = (aiConfig.technical_comfort ?? 'comfortable') === level.value;
                    return (
                      <button
                        key={level.value}
                        role="radio"
                        aria-checked={active}
                        onClick={() => onConfigChange({ technical_comfort: level.value })}
                        title={level.description}
                        className={`flex-1 text-[11px] py-1.5 rounded transition-all font-medium ${active ? 'bg-foreground/[0.12] text-foreground' : 'text-muted-foreground/80 hover:text-foreground/80'}`}
                      >
                        {level.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground/50 leading-snug">
                  {currentTechnicalComfort.description}
                </p>
              </div>

              <div className="border-t border-border/50" />

              <div className="space-y-2">
                <Label className="text-[10px] text-muted-foreground/70 uppercase tracking-[0.14em]">
                  UI Library
                </Label>
                <div className="flex gap-1 bg-foreground/[0.04] rounded-md p-1">
                  {[
                    {
                      value: 'shadcn' as const,
                      label: 'shadcn',
                      description:
                        'Linear/Stripe-grade primitives. Recommended for vibe-coded MVPs.',
                    },
                    {
                      value: 'custom' as const,
                      label: 'Custom',
                      description:
                        'Bespoke Tailwind generated from scratch. More variety, less consistency.',
                    },
                  ].map((opt) => {
                    const active = (aiConfig.library ?? 'shadcn') === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => onConfigChange({ library: opt.value })}
                        title={opt.description}
                        className={`flex-1 text-[11px] py-1.5 rounded transition-all font-medium ${active ? 'bg-foreground/[0.12] text-foreground' : 'text-muted-foreground/80 hover:text-foreground/80'}`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground/50 leading-snug">
                  {(aiConfig.library ?? 'shadcn') === 'shadcn'
                    ? 'Wireframes inherit shadcn/ui patterns — table, dialog, drawer, badges, buttons.'
                    : 'Wireframes are generated bespoke per screen — more visual variance.'}
                </p>
              </div>
            </section>

            {/* ── Column 3: Character ── */}
            <section className="px-5 py-4 space-y-3 overflow-y-auto">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] text-muted-foreground/70 uppercase tracking-[0.14em]">
                  Character
                </Label>
                {sessionOverride && (
                  <button
                    type="button"
                    onClick={resetCharacterOverride}
                    className="text-[9px] uppercase tracking-wider text-muted-foreground/70 hover:text-foreground/80 transition-colors"
                    title="Use the persona's default from Studio"
                  >
                    Reset
                  </button>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground/50 leading-snug">
                The face and voice {activePersona?.name ?? 'this persona'} wears, for this session
                only. Studio holds the default.
                {inCall && sessionOverride ? ' Rebuilding mid-call takes a few seconds.' : ''}
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {videoAvatars.map((va) => {
                  const selected = activeCharacterId === va.id;
                  return (
                    <button
                      key={va.id}
                      onClick={() => pickCharacter(va.id)}
                      title={va.name}
                      aria-pressed={selected}
                      className={`relative rounded-md overflow-hidden border aspect-square transition-all hover:scale-[1.03] ${
                        selected
                          ? 'border-foreground/70 ring-1 ring-foreground/30'
                          : 'border-border/60 hover:border-border'
                      }`}
                    >
                      {va.preview_url ? (
                        <video
                          ref={(el) => {
                            if (el) characterVideoRefs.current.set(va.id, el);
                            else characterVideoRefs.current.delete(va.id);
                          }}
                          src={mediaUrl(va.preview_url)}
                          muted
                          playsInline
                          preload="metadata"
                          className="w-full h-full object-cover bg-foreground/[0.05]"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-foreground/[0.05] text-muted-foreground/40 text-[9px]">
                          No preview
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1 py-0.5">
                        <span className="text-[9px] text-white font-medium block truncate leading-tight">
                          {va.name}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
              {videoAvatars.length === 0 && (
                <p className="text-[10px] text-muted-foreground/50">
                  No characters yet. Studio is where they are made.
                </p>
              )}
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
