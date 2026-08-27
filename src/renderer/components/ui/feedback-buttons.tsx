"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ThumbsUp, ThumbsDown, X } from "lucide-react";
import { useFeedback } from "@/hooks/use-feedback";

type Rating = "thumbs_up" | "thumbs_down";
type TargetType = "chat_message" | "voice_response" | "session" | "transcript";
type AgentType = "chat" | "voice" | "platform_chat";

const NEGATIVE_REASONS = [
  "Inaccurate or wrong",
  "Not relevant to my question",
  "Too vague or generic",
  "Too verbose",
  "Missed important context",
];

interface FeedbackButtonsProps {
  targetType: TargetType;
  targetId: string;
  sessionId?: string;
  agentType: AgentType;
  /** Compact mode for inline use in message bubbles */
  compact?: boolean;
}

export function FeedbackButtons({
  targetType,
  targetId,
  sessionId,
  agentType,
  compact = true,
}: FeedbackButtonsProps) {
  const { submitFeedback, retractFeedback, getRating } = useFeedback(sessionId);
  const currentRating = getRating(targetId);
  const [showDialog, setShowDialog] = useState(false);
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus textarea when dialog opens
  useEffect(() => {
    if (showDialog) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [showDialog]);

  const handleClick = (rating: Rating) => {
    if (currentRating === rating) {
      retractFeedback(targetId);
      return;
    }

    if (rating === "thumbs_down") {
      // Submit the rating immediately, then open dialog for optional details
      submitFeedback({ targetType, targetId, sessionId, agentType, rating });
      setShowDialog(true);
      setSelectedReasons([]);
      setComment("");
    } else {
      submitFeedback({ targetType, targetId, sessionId, agentType, rating });
    }
  };

  const toggleReason = (reason: string) => {
    setSelectedReasons((prev) =>
      prev.includes(reason) ? prev.filter((r) => r !== reason) : [...prev, reason]
    );
  };

  const handleSubmitDetails = () => {
    const parts: string[] = [];
    if (selectedReasons.length > 0) parts.push(selectedReasons.join("; "));
    if (comment.trim()) parts.push(comment.trim());
    const fullComment = parts.join(" — ");

    if (fullComment) {
      submitFeedback({
        targetType,
        targetId,
        sessionId,
        agentType,
        rating: "thumbs_down",
        comment: fullComment,
      });
    }
    setShowDialog(false);
  };

  const handleSkip = () => {
    setShowDialog(false);
  };

  const iconSize = compact ? 12 : 14;
  const btnBase = compact
    ? "p-1 rounded transition-colors"
    : "p-1.5 rounded-md transition-colors";

  return (
    <>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => handleClick("thumbs_up")}
          className={`${btnBase} ${
            currentRating === "thumbs_up"
              ? "text-success bg-success/10"
              : "text-muted-foreground/30 hover:text-muted-foreground hover:bg-foreground/[0.05]"
          }`}
          title="Helpful"
        >
          <ThumbsUp size={iconSize} />
        </button>
        <button
          type="button"
          onClick={() => handleClick("thumbs_down")}
          className={`${btnBase} ${
            currentRating === "thumbs_down"
              ? "text-destructive bg-destructive/10"
              : "text-muted-foreground/30 hover:text-muted-foreground hover:bg-foreground/[0.05]"
          }`}
          title="Not helpful"
        >
          <ThumbsDown size={iconSize} />
        </button>
      </div>

      {/* Negative feedback dialog */}
      {showDialog &&
        typeof window !== "undefined" &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[300] bg-background/80 backdrop-blur-sm animate-in fade-in duration-200"
              onClick={handleSkip}
            />
            <div className="fixed inset-0 z-[301] flex items-center justify-center p-4">
              <div
                className="w-full max-w-md bg-secondary border border-border rounded-2xl shadow-2xl animate-in zoom-in-95 fade-in duration-200"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="flex items-center justify-between p-5 pb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      Help us improve
                    </h3>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">
                      What went wrong? This is optional.
                    </p>
                  </div>
                  <button
                    onClick={handleSkip}
                    className="p-1 rounded-lg text-muted-foreground/50 hover:text-muted-foreground hover:bg-foreground/[0.05] transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Quick reasons */}
                <div className="px-5 pb-3">
                  <div className="flex flex-wrap gap-1.5">
                    {NEGATIVE_REASONS.map((reason) => (
                      <button
                        key={reason}
                        type="button"
                        onClick={() => toggleReason(reason)}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${
                          selectedReasons.includes(reason)
                            ? "bg-destructive/15 border-destructive/30 text-destructive"
                            : "bg-foreground/[0.04] border-border/70 text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground/80"
                        }`}
                      >
                        {reason}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Free-text comment */}
                <div className="px-5 pb-3">
                  <textarea
                    ref={textareaRef}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Anything else you'd like to share..."
                    rows={3}
                    className="w-full bg-foreground/[0.04] border border-border/70 rounded-xl px-3 py-2.5 text-[13px] text-foreground/90 placeholder:text-muted-foreground/30 focus:outline-none focus:border-border resize-none"
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-2 p-5 pt-2">
                  <button
                    type="button"
                    onClick={handleSkip}
                    className="flex-1 px-4 py-2 text-xs font-medium rounded-xl bg-foreground/[0.05] text-muted-foreground hover:bg-foreground/[0.10] hover:text-foreground/90 transition-colors"
                  >
                    Skip
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmitDetails}
                    className="flex-1 px-4 py-2 text-xs font-medium rounded-xl bg-destructive/20 text-destructive hover:bg-destructive/30 transition-colors"
                  >
                    Submit feedback
                  </button>
                </div>
              </div>
            </div>
          </>,
          document.body
        )}
    </>
  );
}
