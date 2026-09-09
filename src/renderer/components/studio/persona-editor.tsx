'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Sparkles, Video, X } from 'lucide-react';
import { PersonaThumbnail } from '@/components/session/persona-thumbnail';
import { listVideoAvatars, type VideoAvatar } from '@/lib/api/video-avatars';
import type { AuthFetch, BlueprintPersona, BlueprintSection, BlueprintTemplate } from './types';

interface Props {
  draft: Partial<BlueprintPersona>;
  setDraft: (d: Partial<BlueprintPersona>) => void;
  sections: BlueprintSection[];
  templates: BlueprintTemplate[];
  saving: boolean;
  saveError?: string | null;
  onSave: () => void;
  onCancel: () => void;
  toggleSection: (list: string[], key: string) => string[];
  authFetch: AuthFetch;
}

export function PersonaEditor({
  draft,
  setDraft,
  sections,
  templates,
  saving,
  saveError,
  onSave,
  onCancel,
  toggleSection,
  authFetch,
}: Props) {
  const [rewritingDesc, setRewritingDesc] = useState(false);
  const [rewritingPrompt, setRewritingPrompt] = useState(false);
  const [videoAvatars, setVideoAvatars] = useState<VideoAvatar[]>([]);
  const characterVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  // Cache of lip-synced Tavus videos per (character_id, persona_name).
  const personaVideoCache = useRef<Map<string, string>>(new Map());
  // Cards currently waiting on a Tavus render — used to show a small spinner.
  const [generatingPreview, setGeneratingPreview] = useState<Set<string>>(new Set());
  const [renderProgress, setRenderProgress] = useState<Map<string, number>>(new Map());
  // In-flight poll timers keyed by combo so we can cancel them.
  const pollTimersRef = useRef<Map<string, number>>(new Map());
  // Read current selection inside async polls without stale closures.
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    let cancelled = false;
    listVideoAvatars(authFetch).then((list) => {
      if (!cancelled) setVideoAvatars(list);
    });
    return () => {
      cancelled = true;
    };
  }, [authFetch]);

  // Pause everything + cancel polling on unmount
  useEffect(() => {
    const refs = characterVideoRefs.current;
    const timers = pollTimersRef;
    return () => {
      refs.forEach((el) => {
        el.muted = true;
        el.pause();
      });
      timers.current.forEach((id) => window.clearTimeout(id));
      timers.current.clear();
    };
  }, []);

  function comboKey(characterId: string, personaName: string) {
    return `${characterId}|${personaName.toLowerCase()}`;
  }

  function setGeneratingFlag(key: string, on: boolean) {
    setGeneratingPreview((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function pollSyncedVideo(characterId: string, personaName: string) {
    const key = comboKey(characterId, personaName);
    if (personaVideoCache.current.has(key)) return; // already resolved

    try {
      const resp = await authFetch('/api/character-previews/video', {
        method: 'POST',
        body: JSON.stringify({ character_id: characterId, persona_name: personaName }),
      });
      if (!resp.ok) {
        setGeneratingFlag(key, false);
        return;
      }
      const data = (await resp.json()) as {
        status: 'generating' | 'ready' | 'error';
        video_url?: string | null;
        progress?: number | null;
      };
      if (typeof data.progress === 'number') {
        setRenderProgress((prev) => {
          const next = new Map(prev);
          next.set(key, data.progress as number);
          return next;
        });
      }
      if (data.status === 'ready' && data.video_url) {
        personaVideoCache.current.set(key, data.video_url);
        setGeneratingFlag(key, false);
        setRenderProgress((prev) => {
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
        // Auto-swap if the user is still focused on this (character, persona)
        // pair — saves them having to click twice. Browsers block unmuted
        // play() outside a user-gesture chain, so swap and try unmuted; if
        // play is blocked, fall back to muted-loop so the synced lips show.
        const currentDraft = draftRef.current;
        const stillFocused =
          currentDraft.video_avatar_id === characterId &&
          (currentDraft.name || '').trim().toLowerCase() === personaName.toLowerCase();
        if (stillFocused) {
          const target = characterVideoRefs.current.get(characterId);
          if (target) {
            target.src = data.video_url;
            target.loop = false;
            target.currentTime = 0;
            target.muted = false;
            target.play().catch(() => {
              target.muted = true;
              target.loop = true;
              target.play().catch(() => {});
            });
          }
        }
        return;
      }
      if (data.status === 'error') {
        setGeneratingFlag(key, false);
        return;
      }
      // Still rendering — schedule the next poll
      setGeneratingFlag(key, true);
      const timer = window.setTimeout(() => {
        pollTimersRef.current.delete(key);
        pollSyncedVideo(characterId, personaName);
      }, 8000);
      pollTimersRef.current.set(key, timer);
    } catch {
      setGeneratingFlag(key, false);
    }
  }

  function stopAllPreviews() {
    characterVideoRefs.current.forEach((el) => {
      el.muted = true;
      el.pause();
    });
  }

  async function togglePreviewCharacter(id: string) {
    const target = characterVideoRefs.current.get(id);
    const personaName = (draft.name || '').trim();
    const key = personaName ? comboKey(id, personaName) : null;

    const isPlayingVideoAudibly = !!target && !target.paused && !target.muted;
    if (isPlayingVideoAudibly && draft.video_avatar_id === id) {
      stopAllPreviews();
      return;
    }

    stopAllPreviews();
    if (!target) return;

    const cachedSyncedUrl = key ? personaVideoCache.current.get(key) : undefined;
    if (cachedSyncedUrl) {
      try {
        if (target.src !== cachedSyncedUrl) target.src = cachedSyncedUrl;
        target.loop = false;
        target.currentTime = 0;
        target.muted = false;
        target.play().catch(() => {});
      } catch {
        /* ignore */
      }
      return;
    }

    // Keep the thumbnail playing muted while we resolve. Pausing breaks the
    // user-gesture chain — when polling later completes (from setTimeout),
    // browsers block the auto-resume's play() call.
    try {
      target.muted = true;
      target.loop = true;
      if (target.paused) target.play().catch(() => {});
    } catch {
      /* ignore */
    }

    if (!personaName || !key) return;

    setGeneratingFlag(key, true);
    let readyUrl: string | null = null;
    try {
      const resp = await authFetch('/api/character-previews/video', {
        method: 'POST',
        body: JSON.stringify({ character_id: id, persona_name: personaName }),
      });
      if (resp.ok) {
        const data = (await resp.json()) as {
          status: 'generating' | 'ready' | 'error';
          video_url?: string | null;
          progress?: number | null;
        };
        if (typeof data.progress === 'number') {
          setRenderProgress((prev) => {
            const next = new Map(prev);
            next.set(key, data.progress as number);
            return next;
          });
        }
        if (data.status === 'ready' && data.video_url) {
          readyUrl = data.video_url;
          personaVideoCache.current.set(key, readyUrl);
          setGeneratingFlag(key, false);
        } else if (data.status === 'error') {
          setGeneratingFlag(key, false);
        }
      } else {
        setGeneratingFlag(key, false);
      }
    } catch {
      setGeneratingFlag(key, false);
    }

    if (readyUrl) {
      try {
        target.src = readyUrl;
        target.loop = false;
        target.currentTime = 0;
        target.muted = false;
        target.play().catch(() => {});
      } catch {
        /* ignore */
      }
      return;
    }

    const timer = window.setTimeout(() => {
      pollTimersRef.current.delete(key);
      pollSyncedVideo(id, personaName);
    }, 8000);
    pollTimersRef.current.set(key, timer);
  }

  async function handleAiDescription() {
    if (!draft.name?.trim() || rewritingDesc) return;
    setRewritingDesc(true);
    try {
      const resp = await authFetch('/api/projects/rewrite-idea', {
        method: 'POST',
        body: JSON.stringify({
          text: `Write a concise one-sentence description for an AI planning persona called "${draft.name}". ${draft.description ? `Current: ${draft.description}` : ''} Keep it under 15 words, describing what this persona focuses on.`,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.rewritten) setDraft({ ...draft, description: data.rewritten });
      }
    } catch {}
    setRewritingDesc(false);
  }

  async function handleAiPrompt() {
    if (!draft.name?.trim() || rewritingPrompt) return;
    setRewritingPrompt(true);
    try {
      const focusLabels = (draft.focus_sections || []).map(
        (k) => sections.find((s) => s.key === k)?.label || k,
      );
      const resp = await authFetch('/api/projects/rewrite-idea', {
        method: 'POST',
        body: JSON.stringify({
          text: `Write a system prompt for an AI planning facilitator persona called "${draft.name}". ${draft.description ? `Description: ${draft.description}.` : ''} ${focusLabels.length ? `Focus areas: ${focusLabels.join(', ')}.` : ''} The prompt should define the persona's role, communication style, and what aspects of project planning they emphasize. Keep it to 2-3 sentences. ${draft.system_prompt ? `Current prompt to improve: ${draft.system_prompt}` : ''}`,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.rewritten) setDraft({ ...draft, system_prompt: data.rewritten });
      }
    } catch {}
    setRewritingPrompt(false);
  }

  return (
    <div className="space-y-5">
      {/* Avatar + Name — thumbnail auto-derives from the selected character below */}
      <div className="flex items-start gap-4 mb-1">
        <PersonaThumbnail
          videoPreviewUrl={videoAvatars.find((v) => v.id === draft.video_avatar_id)?.preview_url}
          slug={draft.slug}
          alt="Persona thumbnail"
          className="w-[72px] h-[72px] rounded-2xl object-cover bg-muted/20 border-2 border-border/50 shrink-0"
        />
        <div className="flex-1 pt-2">
          <input
            value={draft.name || ''}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Persona name"
            className="w-full bg-card border border-border/70 rounded-lg px-4 py-2.5 text-base font-body text-foreground focus:border-primary/50 focus:outline-none"
          />
        </div>
      </div>

      {/* Character — bundled video avatar + matching voice */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[11px] font-body font-medium tracking-[0.15em] uppercase text-muted-foreground">
            Character
          </p>
          <span className="text-[10px] text-muted-foreground/50">
            Bundled video + voice — used during calls
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {videoAvatars.map((va) => {
            const selected = draft.video_avatar_id === va.id;
            const personaName = (draft.name || '').trim();
            const cKey = personaName ? comboKey(va.id, personaName) : null;
            const isRendering = !!cKey && generatingPreview.has(cKey);
            return (
              <button
                type="button"
                key={va.id}
                onClick={() => {
                  setDraft({ ...draft, video_avatar_id: va.id });
                  togglePreviewCharacter(va.id);
                }}
                title={`${va.name}${va.description ? ' — ' + va.description : ''}`}
                className={`relative rounded-xl overflow-hidden border-2 aspect-square transition-all hover:scale-[1.02] ${
                  selected
                    ? 'border-primary ring-1 ring-primary/30'
                    : 'border-transparent hover:border-border'
                }`}
              >
                {va.preview_url ? (
                  <video
                    ref={(el) => {
                      if (el) characterVideoRefs.current.set(va.id, el);
                      else characterVideoRefs.current.delete(va.id);
                    }}
                    src={va.preview_url}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-cover bg-muted/20"
                    onEnded={(e) => {
                      e.currentTarget.muted = true;
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-muted/20">
                    <Video className="h-5 w-5 text-muted-foreground/50" />
                  </div>
                )}
                {isRendering &&
                  (() => {
                    const pct = cKey ? renderProgress.get(cKey) : undefined;
                    return (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-[2px]">
                        <div className="flex flex-col items-center gap-1.5 w-[70%]">
                          <Loader2 className="h-5 w-5 text-white/80 animate-spin" />
                          <span className="text-[10px] text-white/85 font-medium">
                            Syncing audio…
                          </span>
                          {typeof pct === 'number' ? (
                            <>
                              <div className="w-full h-1 rounded-full bg-white/15 overflow-hidden">
                                <div
                                  className="h-full bg-amber-400/85 transition-[width] duration-700"
                                  style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
                                />
                              </div>
                              <span className="text-[9px] text-white/55 leading-tight tabular-nums">
                                {pct}%
                              </span>
                            </>
                          ) : (
                            <span className="text-[8px] text-white/55 leading-tight">~1 min</span>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 py-1">
                  <span className="text-[9px] text-white/90 font-medium block truncate">
                    {va.name}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
        {videoAvatars.length === 0 && (
          <p className="mt-2 text-[10px] text-muted-foreground/50">
            No characters yet. A character needs a Tavus replica, and Tavus is a key in Settings ▸
            Credentials.
          </p>
        )}
      </div>

      {/* Description with AI autofill */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[11px] font-body font-medium tracking-[0.15em] uppercase text-muted-foreground">
            Description
          </p>
          <button
            onClick={handleAiDescription}
            disabled={!draft.name?.trim() || rewritingDesc}
            className="group flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium text-muted-foreground/70 hover:text-primary hover:bg-primary/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <Sparkles
              className={`h-3 w-3 ${rewritingDesc ? 'animate-spin' : 'group-hover:scale-110 transition-transform'}`}
            />
            {rewritingDesc ? 'Writing...' : 'AI Autofill'}
          </button>
        </div>
        <textarea
          value={draft.description || ''}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          placeholder="Short description (e.g., 'Focuses on product strategy and user needs')"
          rows={2}
          className="w-full bg-card border border-border/70 rounded-lg px-4 py-2.5 text-sm font-body text-foreground focus:border-primary/50 focus:outline-none resize-none"
        />
      </div>

      {/* System prompt with AI autofill */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[11px] font-body font-medium tracking-[0.15em] uppercase text-muted-foreground">
            System Prompt
          </p>
          <button
            onClick={handleAiPrompt}
            disabled={!draft.name?.trim() || rewritingPrompt}
            className="group flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium text-muted-foreground/70 hover:text-primary hover:bg-primary/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <Sparkles
              className={`h-3 w-3 ${rewritingPrompt ? 'animate-spin' : 'group-hover:scale-110 transition-transform'}`}
            />
            {rewritingPrompt ? 'Writing...' : 'AI Autofill'}
          </button>
        </div>
        <textarea
          value={draft.system_prompt || ''}
          onChange={(e) => setDraft({ ...draft, system_prompt: e.target.value })}
          placeholder="Instructions for the AI when using this persona. Describe the role, tone, focus areas, and how to guide the conversation..."
          rows={6}
          className="w-full bg-card border border-border/70 rounded-lg px-4 py-2.5 text-[13px] font-mono text-foreground/80 focus:border-primary/50 focus:outline-none resize-y"
        />
      </div>

      {/* Focus sections */}
      <div>
        <p className="text-[11px] font-body font-medium tracking-[0.15em] uppercase text-muted-foreground mb-2">
          Focus Sections ({(draft.focus_sections || []).length} selected)
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {sections.map((s) => {
            const checked = (draft.focus_sections || []).includes(s.key);
            return (
              <button
                key={s.key}
                onClick={() =>
                  setDraft({
                    ...draft,
                    focus_sections: toggleSection(draft.focus_sections || [], s.key),
                  })
                }
                className={`text-left text-xs font-body px-3 py-2 rounded-lg transition-colors ${
                  checked
                    ? 'bg-primary/10 text-primary border border-primary/20'
                    : 'text-muted-foreground/50 hover:text-foreground/70 border border-transparent'
                }`}
              >
                <span
                  className={`inline-block w-2.5 h-2.5 rounded-sm mr-2.5 ${checked ? 'bg-primary' : 'bg-muted-foreground/20'}`}
                />
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Used by templates */}
      {templates.filter((t) => t.default_persona_id === draft.id).length > 0 && (
        <div>
          <p className="text-[10px] font-body text-muted-foreground/40">
            Used by:{' '}
            {templates
              .filter((t) => t.default_persona_id === draft.id)
              .map((t) => t.name)
              .join(', ')}
          </p>
        </div>
      )}

      {/* Error + Actions */}
      {saveError && <p className="text-sm font-body text-destructive">{saveError}</p>}
      <div className="flex items-center gap-3 pt-3">
        <button
          onClick={onSave}
          disabled={saving || !draft.name?.trim() || !draft.system_prompt?.trim()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-body font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" />
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-body text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" />
          Cancel
        </button>
      </div>
    </div>
  );
}
