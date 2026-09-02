'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Sparkles } from 'lucide-react';
import { useAuthFetch } from '@/hooks/use-auth-fetch';

interface CreateProjectDialogProps {
  onCreate: (data: { description: string; name?: string }) => Promise<unknown>;
  onCreated?: () => void;
}

/** A rejected fetch is a TypeError worded for a browser; anything else already
 *  carries the backend's `detail`. */
function createErrorMessage(err: unknown): string {
  if (err instanceof TypeError) return 'Network error. Please check your connection.';
  if (err instanceof Error && err.message) return err.message;
  return "Couldn't create the project. Please try again.";
}

export function CreateProjectDialog({ onCreate, onCreated }: CreateProjectDialogProps) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { authFetch } = useAuthFetch();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await onCreate({ description: description.trim() });
      setOpen(false);
      setDescription('');
      onCreated?.();
    } catch (err) {
      setError(createErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleRewrite() {
    if (!description.trim() || rewriting) return;
    setRewriting(true);
    setError(null);
    try {
      const resp = await authFetch('/api/projects/rewrite-idea', {
        method: 'POST',
        body: JSON.stringify({ text: description.trim() }),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.rewritten) setDescription(data.rewritten);
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        New Project
      </DialogTrigger>

      <DialogContent className="sm:max-w-md border-border bg-card animate-scale-in p-0 overflow-hidden">
        <div className="px-6 pt-5 pb-3">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl italic font-normal text-foreground leading-tight">
              New project
            </DialogTitle>
          </DialogHeader>
        </div>

        <form onSubmit={handleSubmit} className="px-6 pb-5 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-body text-muted-foreground/30">
                We'll generate a name automatically
              </span>
              <button
                type="button"
                onClick={handleRewrite}
                disabled={!description.trim() || rewriting}
                className="group flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium text-muted-foreground/50 hover:text-primary hover:bg-primary/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <Sparkles
                  className={`h-3 w-3 ${rewriting ? 'animate-spin' : 'group-hover:scale-110 transition-transform'}`}
                />
                {rewriting ? 'Rewriting…' : 'AI Rewrite'}
              </button>
            </div>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what you're building..."
              rows={3}
              required
              autoFocus
              className="font-body text-sm bg-background border-border focus:border-primary/60 transition-colors resize-none"
            />
          </div>

          {error && (
            <p className="text-xs font-body text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={loading || !description.trim()}
            className="w-full font-body font-medium"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                Creating…
              </span>
            ) : (
              'Create project'
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
