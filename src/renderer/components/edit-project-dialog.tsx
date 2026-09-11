'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles } from 'lucide-react';
import { useAuthFetch } from '@/hooks/use-auth-fetch';

interface EditProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: { id: string; name: string; description: string | null };
  onSaved?: (data: { name: string; description?: string }) => void;
}

export function EditProjectDialog({
  open,
  onOpenChange,
  project,
  onSaved,
}: EditProjectDialogProps) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || '');
  const [loading, setLoading] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const { authFetch } = useAuthFetch();

  // Sync when project changes or dialog opens
  useEffect(() => {
    if (open) {
      setName(project.name);
      setDescription(project.description || '');
    }
  }, [open, project]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      const resp = await authFetch(`/api/sessions/${project.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined }),
      });
      if (resp.ok) {
        onSaved?.({ name: name.trim(), description: description.trim() || undefined });
        onOpenChange(false);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleRewrite() {
    if (!description.trim() || rewriting) return;
    setRewriting(true);
    try {
      const resp = await authFetch('/api/sessions/rewrite-idea', {
        method: 'POST',
        body: JSON.stringify({ text: description.trim() }),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.rewritten) setDescription(data.rewritten);
      }
    } finally {
      setRewriting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md border-border bg-card animate-scale-in p-0 overflow-hidden">
        {/* Header stripe */}
        <div className="px-6 pt-6 pb-4 border-b border-border">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl italic font-normal text-foreground leading-tight">
              Edit project
            </DialogTitle>
            <p className="text-xs text-muted-foreground font-body mt-1">
              Update your project details.
            </p>
          </DialogHeader>
        </div>

        {/* Form body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          <div className="space-y-1.5">
            <Label
              htmlFor="edit-name"
              className="text-xs font-body font-medium text-muted-foreground uppercase tracking-[0.12em]"
            >
              Name
            </Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Session name"
              required
              autoFocus
              className="font-body text-sm bg-background border-border focus:border-primary/60 transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label
                htmlFor="edit-description"
                className="text-xs font-body font-medium text-muted-foreground uppercase tracking-[0.12em]"
              >
                Description
                <span className="ml-1.5 normal-case tracking-normal text-muted-foreground/50">
                  (optional)
                </span>
              </Label>
              <button
                type="button"
                onClick={handleRewrite}
                disabled={!description.trim() || rewriting}
                title="Improve clarity and fix spelling with AI"
                className="group flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium text-muted-foreground/70 hover:text-primary hover:bg-primary/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200"
              >
                <Sparkles
                  className={`h-3 w-3 ${rewriting ? 'animate-spin' : 'group-hover:scale-110 transition-transform'}`}
                />
                <span>{rewriting ? 'Rewriting…' : 'AI Rewrite'}</span>
              </button>
            </div>
            <Textarea
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What are you building?"
              rows={3}
              className="font-body text-sm bg-background border-border focus:border-primary/60 transition-colors resize-none"
            />
          </div>

          <div className="pt-1">
            <Button
              type="submit"
              disabled={loading || !name.trim()}
              className="w-full font-body font-medium"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                  Saving…
                </span>
              ) : (
                'Save changes'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
