'use client';

import { useState } from 'react';
import { Loader2, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { TicketActivityEvent, TicketComment } from '@/hooks/use-ticket';
import { stripHtml } from '@/lib/strip-html';
import { RichTextEditor } from './rich-text-editor';

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

interface Props {
  cardId: string;
  comments: TicketComment[];
  events: TicketActivityEvent[];
  onAddComment: (content: string) => Promise<void>;
}

// Merge comments + system events into a unified, time-ordered timeline.
export function TicketActivity({ cardId, comments, events, onAddComment }: Props) {
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);

  type Item =
    | { kind: 'comment'; at: string; data: TicketComment }
    | { kind: 'event'; at: string; data: TicketActivityEvent };
  const merged: Item[] = [
    ...comments.map<Item>((c) => ({ kind: 'comment', at: c.created_at, data: c })),
    ...events.map<Item>((e) => ({ kind: 'event', at: e.created_at, data: e })),
  ].sort((a, b) => +new Date(a.at) - +new Date(b.at));

  const submit = async () => {
    const trimmed = draft.trim();
    // Strip HTML to detect "empty" rich-text (e.g. "<p></p>") so we don't send blanks.
    if (!trimmed || !stripHtml(trimmed)) return;
    setPosting(true);
    try {
      await onAddComment(trimmed);
      setDraft('');
    } finally {
      setPosting(false);
    }
  };

  return (
    <section className="space-y-4">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Activity
      </h3>

      {merged.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No activity yet.</p>
      ) : (
        <ul className="space-y-4">
          {merged.map((item) => (
            <li key={`${item.kind}-${item.data.id}`} className="text-sm">
              {item.kind === 'comment' ? (
                <div className="flex gap-2">
                  <MessageSquare className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {item.data.user_name ?? item.data.user_id.slice(0, 6)}
                      </span>{' '}
                      • {timeAgo(item.data.created_at)}
                    </div>
                    <CommentBody content={item.data.content} />
                  </div>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {item.data.actor_name ?? 'system'}
                  </span>{' '}
                  {item.data.kind.replace('_', ' ')} • {timeAgo(item.data.created_at)}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2 pt-4 border-t border-border">
        <RichTextEditor
          value={draft}
          onChange={setDraft}
          cardId={cardId}
          compact
          placeholder="Add a comment… drop images or paste files inline."
        />
        <div className="flex justify-end">
          <Button onClick={submit} disabled={posting || !stripHtml(draft).trim()} size="sm">
            {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Comment'}
          </Button>
        </div>
      </div>
    </section>
  );
}

// Comments may be plain text (legacy) or HTML (new). If the content contains
// any tags, render via dangerouslySetInnerHTML — Tiptap output is already
// schema-restricted, but we still trust only what came back from our own API.
function CommentBody({ content }: { content: string }) {
  const looksHtml = /<[a-z][\s\S]*>/i.test(content);
  if (looksHtml) {
    return <div className="tiptap-content mt-0.5" dangerouslySetInnerHTML={{ __html: content }} />;
  }
  return <p className="whitespace-pre-wrap mt-0.5">{content}</p>;
}
