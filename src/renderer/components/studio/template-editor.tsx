'use client';

import { useState } from 'react';
import { Check, Sparkles, X, Zap } from 'lucide-react';
import {
  ICON_MAP,
  ICON_OPTIONS,
  SECTION_DESCRIPTIONS,
  type AuthFetch,
  type BlueprintPersona,
  type BlueprintSection,
  type BlueprintTemplate,
} from './types';

interface Props {
  draft: Partial<BlueprintTemplate>;
  setDraft: (d: Partial<BlueprintTemplate>) => void;
  sections: BlueprintSection[];
  personas: BlueprintPersona[];
  saving: boolean;
  saveError?: string | null;
  onSave: () => void;
  onCancel: () => void;
  toggleSection: (list: string[], key: string) => string[];
  authFetch: AuthFetch;
}

export function TemplateEditor({
  draft,
  setDraft,
  sections,
  personas,
  saving,
  saveError,
  onSave,
  onCancel,
  toggleSection,
  authFetch,
}: Props) {
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [rewriting, setRewriting] = useState(false);

  async function handleAiDescription() {
    if (!draft.name?.trim() || rewriting) return;
    setRewriting(true);
    try {
      const resp = await authFetch('/api/projects/rewrite-idea', {
        method: 'POST',
        body: JSON.stringify({
          text: `Write a concise one-sentence description for a blueprint template called "${draft.name}". ${draft.description ? `Current description: ${draft.description}` : ''} Keep it under 15 words, describing what kind of planning this template is for.`,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.rewritten) setDraft({ ...draft, description: data.rewritten });
      }
    } catch {}
    setRewriting(false);
  }

  return (
    <div className="space-y-4">
      {/* Icon + Name inline */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setIconPickerOpen(!iconPickerOpen)}
          className="flex items-center justify-center w-9 h-9 shrink-0 rounded-md bg-card border border-border/70 hover:border-primary/40 transition-colors text-primary"
        >
          {ICON_MAP[draft.icon || 'zap'] || <Zap className="h-4 w-4" />}
        </button>
        <input
          value={draft.name || ''}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="Template name"
          className="flex-1 bg-card border border-border/70 rounded-md px-3 py-2 text-sm font-body text-foreground focus:border-primary/50 focus:outline-none"
        />
      </div>
      {iconPickerOpen && (
        <div className="p-2 rounded-lg bg-card border border-border/50 grid grid-cols-7 gap-1 max-w-[280px]">
          {ICON_OPTIONS.map((icon) => (
            <button
              key={icon}
              onClick={() => {
                setDraft({ ...draft, icon });
                setIconPickerOpen(false);
              }}
              className={`p-2 rounded transition-colors ${
                draft.icon === icon
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground/40 hover:text-foreground/60 hover:bg-muted/30'
              }`}
              title={icon}
            >
              {ICON_MAP[icon]}
            </button>
          ))}
        </div>
      )}

      {/* Description with AI autofill */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-[10px] font-body font-medium tracking-[0.15em] uppercase text-muted-foreground">
            Description
          </p>
          <button
            onClick={handleAiDescription}
            disabled={!draft.name?.trim() || rewriting}
            className="group flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium text-muted-foreground/70 hover:text-primary hover:bg-primary/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <Sparkles
              className={`h-3 w-3 ${rewriting ? 'animate-spin' : 'group-hover:scale-110 transition-transform'}`}
            />
            {rewriting ? 'Writing...' : 'AI Autofill'}
          </button>
        </div>
        <textarea
          value={draft.description || ''}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          placeholder="Short description of what this template is for"
          rows={2}
          className="w-full bg-card border border-border/70 rounded-md px-3 py-2 text-sm font-body text-foreground focus:border-primary/50 focus:outline-none resize-none"
        />
      </div>

      {/* Sections checklist — compact 2-col, descriptions on hover */}
      <div>
        <p className="text-[10px] font-body font-medium tracking-[0.15em] uppercase text-muted-foreground mb-2">
          Sections ({(draft.sections || []).length} selected)
        </p>
        <div className="grid grid-cols-2 gap-1">
          {sections.map((s) => {
            const checked = (draft.sections || []).includes(s.key);
            const desc = SECTION_DESCRIPTIONS[s.key];
            return (
              <div key={s.key} className="relative group/sec">
                <button
                  onClick={() =>
                    setDraft({ ...draft, sections: toggleSection(draft.sections || [], s.key) })
                  }
                  className={`w-full text-left text-[11px] font-body px-2.5 py-1.5 rounded-md transition-colors ${
                    checked
                      ? 'bg-primary/10 text-primary border border-primary/20'
                      : 'text-muted-foreground/50 hover:text-foreground/70 border border-transparent'
                  }`}
                >
                  <span
                    className={`inline-block w-2 h-2 rounded-sm mr-2 ${checked ? 'bg-primary' : 'bg-muted-foreground/20'}`}
                  />
                  {s.label}
                </button>
                {desc && (
                  <div className="absolute left-0 top-full mt-1 z-50 px-2.5 py-1.5 rounded-md bg-[#1a1a1a] border border-border/50 text-[9px] font-body text-muted-foreground/70 w-56 shadow-lg opacity-0 pointer-events-none group-hover/sec:opacity-100 transition-opacity duration-150">
                    {desc}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Default persona — smart matching */}
      <div>
        <p className="text-[10px] font-body font-medium tracking-[0.15em] uppercase text-muted-foreground mb-2">
          Default Persona
        </p>
        {(() => {
          const templateSections = new Set(draft.sections || []);
          const scored = personas
            .map((p) => {
              const overlap = (p.focus_sections || []).filter((s) =>
                templateSections.has(s),
              ).length;
              const total = Math.max((p.focus_sections || []).length, 1);
              const pct = Math.round((overlap / total) * 100);
              return { ...p, overlap, pct };
            })
            .sort((a, b) => b.pct - a.pct);
          const bestPct = scored[0]?.pct || 0;

          return (
            <div className="grid grid-cols-2 gap-1">
              {scored.map((p) => {
                const isSelected = draft.default_persona_id === p.id;
                const isBest = p.pct === bestPct && p.pct > 0 && templateSections.size > 0;
                return (
                  <button
                    key={p.id}
                    onClick={() =>
                      setDraft({ ...draft, default_persona_id: isSelected ? null : p.id })
                    }
                    className={`text-left px-2.5 py-1.5 rounded-md border transition-all ${
                      isSelected
                        ? 'border-primary/50 bg-primary/10'
                        : 'border-border/30 bg-card/30 hover:border-primary/30 hover:bg-card/60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-[10px] font-body font-medium ${isSelected ? 'text-primary' : 'text-foreground/70'}`}
                      >
                        {p.name}
                      </span>
                      {isSelected ? (
                        <span className="text-[7px] font-body text-primary px-1 py-0.5 rounded bg-primary/15 shrink-0">
                          Selected
                        </span>
                      ) : isBest ? (
                        <span className="text-[7px] font-body text-success px-1 py-0.5 rounded bg-success/10 shrink-0">
                          Best
                        </span>
                      ) : templateSections.size > 0 ? (
                        <span
                          className={`text-[7px] font-body px-1 py-0.5 rounded shrink-0 ${
                            p.pct >= 80
                              ? 'text-success/50 bg-success/10'
                              : p.pct >= 40
                                ? 'text-amber-400/50 bg-amber-400/10'
                                : 'text-muted-foreground/25 bg-muted/20'
                          }`}
                        >
                          {p.pct}%
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* Error + Actions */}
      {saveError && <p className="text-xs font-body text-destructive">{saveError}</p>}
      <div className="flex items-center gap-2 pt-2">
        <button
          onClick={onSave}
          disabled={saving || !draft.name?.trim() || !(draft.sections || []).length}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-body font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <Check className="h-3 w-3" />
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-body text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3 w-3" />
          Cancel
        </button>
      </div>
    </div>
  );
}
