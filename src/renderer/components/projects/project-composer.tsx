'use client';

// The New project form as the ledger's first ruled line: one borderless
// serif field that asks what you are building, the world's hairline under it,
// and, once there are words, AI rewrite and Create on the line beneath. The
// page owns the text so an example row can fill it; yeaboi names the project
// from it.

import { useEffect, useRef, useState, type RefObject } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAuthFetch } from '@/hooks/use-auth-fetch';
import { createErrorMessage } from '@/lib/yeaboi/ledger';

export interface ProjectComposerProps {
  value: string;
  onChange: (value: string) => void;
  onCreate: (data: { description: string; name?: string }) => Promise<{ id: string }>;
  /** The created row, so the caller can open it. */
  onCreated?: (created: { id: string }) => void;
  /** Take focus on mount: the menu bar's New project… lands here with ?new,
   *  and an empty page has nothing else to offer. */
  autoFocus?: boolean;
  /** The field itself, for a caller that moves words into it. */
  fieldRef?: RefObject<HTMLTextAreaElement | null>;
}

export function ProjectComposer({
  value,
  onChange,
  onCreate,
  onCreated,
  autoFocus = false,
  fieldRef,
}: ProjectComposerProps) {
  const [loading, setLoading] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ownRef = useRef<HTMLTextAreaElement>(null);
  const field = fieldRef ?? ownRef;
  const { authFetch } = useAuthFetch();
  const text = value.trim();

  useEffect(() => {
    if (autoFocus) field.current?.focus();
  }, [autoFocus, field]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text || loading) return;
    setLoading(true);
    setError(null);
    try {
      const created = await onCreate({ description: text });
      onChange('');
      onCreated?.(created);
    } catch (err) {
      setError(createErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleRewrite() {
    if (!text || rewriting) return;
    setRewriting(true);
    setError(null);
    try {
      const resp = await authFetch('/api/projects/rewrite-idea', {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.rewritten) onChange(data.rewritten);
      } else {
        const data = await resp.json().catch(() => ({}));
        setError(data.detail || 'AI rewrite failed. Please try again.');
      }
    } catch {
      setError('Network error. Please check your connection.');
    } finally {
      setRewriting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-label="New project">
      <div
        data-audience-accented
        className="pb-2"
        style={{ borderBottom: '1px solid var(--audience-accent)' }}
      >
        <Textarea
          ref={field}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Describe what you're building."
          aria-label="Describe what you're building"
          rows={2}
          required
          disabled={loading}
          className="min-h-[3.5rem] resize-none rounded-none border-0 bg-transparent px-0 py-1 font-display text-[22px] leading-snug shadow-none placeholder:italic placeholder:text-muted-foreground/70 focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent md:text-[22px]"
        />
      </div>
      {(text || error) && (
        <div className="mt-2 flex items-center justify-between gap-4 animate-fade-in">
          <p className="text-[12px] font-body text-muted-foreground">
            {text && !error ? 'yeaboi names it from this.' : ''}
          </p>
          <div className="flex shrink-0 items-center gap-1">
            {text && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRewrite}
                disabled={rewriting || loading}
                className="font-body text-muted-foreground hover:text-foreground"
              >
                <Sparkles className={rewriting ? 'animate-spin' : ''} />
                {rewriting ? 'Rewriting…' : 'AI rewrite'}
              </Button>
            )}
            <Button type="submit" size="sm" disabled={loading || !text} className="font-body">
              {loading ? 'Creating…' : 'Create project'}
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="mt-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-[12px] font-body text-destructive"
        >
          {error}
        </p>
      )}
    </form>
  );
}
