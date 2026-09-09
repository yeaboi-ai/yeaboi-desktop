'use client';

import { useState } from 'react';
import { Check, Sparkles, X } from 'lucide-react';
import type { AuthFetch } from './types';

interface Props {
  draft: { label: string; description: string };
  setDraft: (d: { label: string; description: string }) => void;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  authFetch: AuthFetch;
}

export function SectionEditor({ draft, setDraft, saving, onSave, onCancel, authFetch }: Props) {
  const [rewriting, setRewriting] = useState(false);

  async function handleAiDescription() {
    if (!draft.label.trim() || rewriting) return;
    setRewriting(true);
    try {
      const resp = await authFetch('/api/projects/rewrite-idea', {
        method: 'POST',
        body: JSON.stringify({
          text: `Write a concise one-sentence description for a blueprint section called "${draft.label}". ${draft.description ? `Current: ${draft.description}` : ''} Describe what topics and details should be covered in this section. Keep it under 20 words.`,
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
    <div className="space-y-3">
      <input
        value={draft.label}
        onChange={(e) => setDraft({ ...draft, label: e.target.value })}
        placeholder="Section name (e.g., Deployment Plan)"
        className="w-full bg-card border border-border/70 rounded-md px-3 py-2 text-sm font-body text-foreground focus:border-primary/50 focus:outline-none"
      />
      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-[10px] font-body font-medium tracking-[0.15em] uppercase text-muted-foreground">
            Description
          </p>
          <button
            onClick={handleAiDescription}
            disabled={!draft.label.trim() || rewriting}
            className="group flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium text-muted-foreground/70 hover:text-primary hover:bg-primary/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <Sparkles
              className={`h-3 w-3 ${rewriting ? 'animate-spin' : 'group-hover:scale-110 transition-transform'}`}
            />
            {rewriting ? 'Writing...' : 'AI Autofill'}
          </button>
        </div>
        <textarea
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          placeholder="What should be covered in this section?"
          rows={2}
          className="w-full bg-card border border-border/70 rounded-md px-3 py-2 text-sm font-body text-foreground focus:border-primary/50 focus:outline-none resize-none"
        />
      </div>
      {draft.label.trim() && (
        <p className="text-[9px] font-body text-muted-foreground/30">
          Key:{' '}
          {draft.label
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/[^a-z0-9_]/g, '')}
        </p>
      )}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={onSave}
          disabled={saving || !draft.label.trim()}
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
