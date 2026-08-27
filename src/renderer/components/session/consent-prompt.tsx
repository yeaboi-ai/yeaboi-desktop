'use client';

import { Mic, Shield } from 'lucide-react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';

interface ConsentPromptProps {
  open: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

/**
 * W5.7.4 — One-time prompt asking each participant whether the AI may
 * transcribe their voice. Renders as a small modal that mounts when:
 *   - the user has just joined a call, AND
 *   - their participant.recording_consent is null (not yet decided).
 *
 * Choosing "Decline" doesn't disconnect the call — it just signals the
 * agent + other participants via the consent chip on their tile, so the
 * group knows their voice isn't being captured for transcription.
 */
export function ConsentPrompt({ open, onAccept, onDecline }: ConsentPromptProps) {
  return (
    <DialogPrimitive.Root open={open}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-[290] bg-background/80 backdrop-blur-sm data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 transition-opacity duration-150" />
        <DialogPrimitive.Popup className="fixed top-1/2 left-1/2 z-[291] -translate-x-1/2 -translate-y-1/2 w-[min(440px,calc(100vw-2rem))] rounded-2xl bg-card ring-1 ring-border shadow-2xl outline-none data-[starting-style]:opacity-0 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[ending-style]:scale-95 transition-[opacity,transform] duration-150">
          <div className="px-6 py-5">
            <div className="flex items-start gap-3 mb-3">
              <div className="rounded-full bg-warning/10 p-2 shrink-0">
                <Shield className="h-4 w-4 text-warning" />
              </div>
              <div className="flex-1">
                <DialogPrimitive.Title className="text-sm font-semibold text-foreground">
                  AI transcription consent
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-[13px] text-muted-foreground leading-relaxed mt-2">
                  This session uses an AI agent that listens, transcribes your voice, and may
                  reference what&apos;s said when generating outputs (notes, tasks, summaries).
                </DialogPrimitive.Description>
                <p className="text-[12px] text-muted-foreground leading-relaxed mt-2 flex items-start gap-1.5">
                  <Mic className="h-3 w-3 mt-0.5 shrink-0" />
                  Choosing decline doesn&apos;t end the call — others still hear you, but the agent
                  won&apos;t transcribe you. You can change this later from the participant menu.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={onDecline}
                className="px-3.5 py-1.5 rounded-lg text-[12px] font-medium bg-foreground/[0.05] text-muted-foreground hover:bg-foreground/[0.10] hover:text-foreground/95 transition-colors"
              >
                Decline transcription
              </button>
              <button
                type="button"
                onClick={onAccept}
                className="px-3.5 py-1.5 rounded-lg text-[12px] font-medium bg-success/15 text-success ring-1 ring-success/30 hover:bg-success/25 transition-colors"
              >
                I agree
              </button>
            </div>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
