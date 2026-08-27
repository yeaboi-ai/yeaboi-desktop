'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Mail, X } from 'lucide-react';
import { useFeedback } from '@/hooks/use-feedback';
import { useAuthFetch } from '@/hooks/use-auth-fetch';
import { toast } from '@/components/ui/toast';

interface CallRatingDialogProps {
  open: boolean;
  sessionId: string;
  callId: string;
  onClose: () => void;
  durationSeconds?: number;
}

type Score = 1 | 2 | 3 | 4 | 5;

const SCORES: ReadonlyArray<{ score: Score; emoji: string; label: string }> = [
  { score: 1, emoji: '😞', label: 'Bad' },
  { score: 2, emoji: '😕', label: 'Meh' },
  { score: 3, emoji: '😐', label: 'OK' },
  { score: 4, emoji: '🙂', label: 'Good' },
  { score: 5, emoji: '🤩', label: 'Great' },
] as const;

function formatDuration(seconds?: number) {
  if (seconds === undefined || seconds < 0) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function CallRatingDialog({
  open,
  sessionId,
  callId,
  onClose,
  durationSeconds,
}: CallRatingDialogProps) {
  const { submitFeedback } = useFeedback(sessionId);
  const { authFetch } = useAuthFetch();
  const [selectedLow, setSelectedLow] = useState<Score | null>(null);
  const [comment, setComment] = useState('');
  const [emailRecap, setEmailRecap] = useState(true); // default on
  const [emailSending, setEmailSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (selectedLow !== null) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [selectedLow]);

  if (!open || typeof window === 'undefined') return null;

  const submit = async (score: Score, commentText?: string) => {
    const rating = score >= 4 ? 'thumbs_up' : 'thumbs_down';
    submitFeedback({
      targetType: 'session',
      targetId: callId,
      sessionId,
      agentType: 'voice',
      rating,
      comment: rating === 'thumbs_down' ? commentText?.trim() || undefined : undefined,
      context: {
        score,
        duration_seconds: durationSeconds,
        ended_at: new Date().toISOString(),
      },
    });
    // W6.6.5 — fire-and-forget recap email when toggle is on. Backend handles
    // the slow path (Resend); we close the dialog immediately.
    if (emailRecap) {
      setEmailSending(true);
      authFetch(`/api/sessions/${sessionId}/recap-email`, { method: 'POST' })
        .then(async (resp) => {
          if (!resp.ok) {
            toast.warning({ title: 'Recap email failed', description: `${resp.status}` });
            return;
          }
          const data = (await resp.json().catch(() => ({}))) as {
            sent?: number;
            recipients?: number;
          };
          toast.success({
            title: 'Recap email sent',
            description: `Delivered to ${data.sent ?? 0}${typeof data.recipients === 'number' ? `/${data.recipients}` : ''} participants`,
          });
        })
        .catch(() => toast.warning({ title: 'Recap email failed', description: 'Network error' }))
        .finally(() => setEmailSending(false));
    }
    onClose();
  };

  const handleScoreClick = (score: Score) => {
    if (score >= 4) {
      submit(score);
    } else {
      setSelectedLow(score);
    }
  };

  const handleSubmitLow = () => {
    if (selectedLow !== null) submit(selectedLow, comment);
  };

  const handleSkipLow = () => {
    if (selectedLow !== null) submit(selectedLow);
  };

  const durationLabel = formatDuration(durationSeconds);

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[300] bg-background/80 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-[301] flex items-center justify-center p-4">
        <div
          className="w-full max-w-sm bg-secondary border border-border rounded-2xl shadow-2xl animate-in zoom-in-95 fade-in duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between p-5 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">How was the call?</h3>
              {durationLabel && (
                <p className="text-xs text-muted-foreground/70 mt-0.5">
                  Call ended · {durationLabel}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-muted-foreground/50 hover:text-muted-foreground hover:bg-foreground/[0.05] transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="px-3 pb-2">
            <div className="flex items-stretch">
              {SCORES.map(({ score, emoji, label }) => {
                const isSelected = selectedLow === score;
                return (
                  <button
                    key={score}
                    type="button"
                    onClick={() => handleScoreClick(score)}
                    aria-label={`${label} (${score} of 5)`}
                    className={`flex-1 flex flex-col items-center gap-1 py-3 rounded-xl transition-colors group ${
                      isSelected
                        ? 'bg-foreground/[0.10] ring-1 ring-white/15'
                        : 'hover:bg-foreground/[0.05]'
                    }`}
                  >
                    <span className="text-3xl leading-none transition-transform motion-safe:group-hover:scale-110">
                      {emoji}
                    </span>
                    <span
                      className={`text-[10px] transition-colors ${
                        isSelected
                          ? 'text-foreground/90'
                          : 'text-muted-foreground/70 group-hover:text-foreground/80'
                      }`}
                    >
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* W6.6.5 — Email recap opt-in. Visible whether the user picks
              high or low score; survives the score branching below. */}
          <div className="px-5 pb-2">
            <label className="flex items-center justify-between gap-2 cursor-pointer group">
              <span className="flex items-center gap-2 text-[12px] text-muted-foreground group-hover:text-foreground/95 transition-colors">
                <Mail className="h-3.5 w-3.5" />
                Email transcript recap to participants
              </span>
              <input
                type="checkbox"
                checked={emailRecap}
                onChange={(e) => setEmailRecap(e.target.checked)}
                disabled={emailSending}
                className="accent-primary"
                aria-label="Email transcript recap to participants"
              />
            </label>
          </div>

          {selectedLow !== null && (
            <div className="animate-in slide-in-from-top-2 fade-in duration-200">
              <div className="px-5 pb-3">
                <textarea
                  ref={textareaRef}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Tell us what went wrong... (optional)"
                  rows={3}
                  className="w-full bg-foreground/[0.04] border border-border/70 rounded-xl px-3 py-2.5 text-[13px] text-foreground/90 placeholder:text-muted-foreground/30 focus:outline-none focus:border-border resize-none"
                />
              </div>
              <div className="flex gap-2 p-5 pt-2">
                <button
                  type="button"
                  onClick={handleSkipLow}
                  className="flex-1 px-4 py-2 text-xs font-medium rounded-xl bg-foreground/[0.05] text-muted-foreground hover:bg-foreground/[0.10] hover:text-foreground/90 transition-colors"
                >
                  Skip
                </button>
                <button
                  type="button"
                  onClick={handleSubmitLow}
                  className="flex-1 px-4 py-2 text-xs font-medium rounded-xl bg-foreground/[0.10] text-foreground/90 hover:bg-foreground/[0.15] hover:text-foreground transition-colors"
                >
                  Submit feedback
                </button>
              </div>
            </div>
          )}

          {selectedLow === null && <div className="h-3" />}
        </div>
      </div>
    </>,
    document.body,
  );
}
