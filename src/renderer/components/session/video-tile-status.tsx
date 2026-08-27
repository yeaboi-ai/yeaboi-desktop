'use client';

import { useConnectionQualityIndicator, useLocalParticipant } from '@livekit/components-react';
import { ConnectionQuality } from 'livekit-client';
import { Captions, CircleDot, Ear, EarOff, Wifi, WifiOff } from 'lucide-react';

import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useProviderHealth } from '@/hooks/use-provider-health';

interface VideoTileStatusProps {
  /** AI listening state (STT gate). Truthy = paused. */
  micMuted?: boolean;
  pushToTalk?: boolean;
  /** Captions overlay state. */
  captionsOn?: boolean;
  /** True iff a recording (LiveKit Egress) is actively running for this call.
   *  When false, the REC badge is hidden — previously this was always-on
   *  scaffolding regardless of actual recording state. */
  isRecording?: boolean;
  /** True iff the live voice agent is currently in the call. When true, the
   *  silent "AI listening" pipeline is irrelevant (the agent is the AI), so
   *  the ear icon is suppressed. */
  agentInCall?: boolean;
}

/**
 * Subtle status cluster overlaid on the top-right of the meeting tile.
 * Icons only, low contrast — these are *read-only* indicators of state.
 * The corresponding toggles live in the More menu.
 *
 * Order (left → right): AI listening · CC · REC · Connection.
 */
export function VideoTileStatus({
  micMuted,
  pushToTalk,
  captionsOn,
  isRecording,
  agentInCall,
}: VideoTileStatusProps) {
  const { localParticipant } = useLocalParticipant();
  const { quality } = useConnectionQualityIndicator({ participant: localParticipant });
  const { voice: voiceHealth } = useProviderHealth();
  const aiUnavailable = !voiceHealth.available;

  const networkLabel: Record<ConnectionQuality, string> = {
    [ConnectionQuality.Excellent]: 'Excellent connection',
    [ConnectionQuality.Good]: 'Good connection',
    [ConnectionQuality.Poor]: 'Poor connection — expect choppy audio',
    [ConnectionQuality.Lost]: 'Connection lost',
    [ConnectionQuality.Unknown]: 'Connection unknown',
  };
  const networkTone: Record<ConnectionQuality, string> = {
    [ConnectionQuality.Excellent]: 'text-success',
    [ConnectionQuality.Good]: 'text-success',
    [ConnectionQuality.Poor]: 'text-warning',
    [ConnectionQuality.Lost]: 'text-destructive',
    [ConnectionQuality.Unknown]: 'text-muted-foreground/70',
  };

  // Treat the AI as not-listening whenever an upstream provider (Anthropic /
  // Deepgram / ElevenLabs) is unhealthy, regardless of the mic state.
  const listening = !micMuted && !aiUnavailable;
  const aiTone = aiUnavailable ? 'text-destructive' : listening ? 'text-success' : 'text-warning';
  const aiLabel = aiUnavailable
    ? `AI listening unavailable: ${voiceHealth.message ?? 'an upstream provider is failing.'}`
    : pushToTalk
      ? listening
        ? 'AI listening (Space held)'
        : 'AI paused — hold Space to speak'
      : listening
        ? 'AI is transcribing your voice'
        : 'AI listening paused — others still hear you';

  return (
    <TooltipProvider>
      {/* Anchored top-LEFT of the video panel — the right corner of the
          rightmost tile holds the agent's camera/settings controls and
          should not be obstructed. */}
      <div className="absolute top-2.5 left-2.5 z-10 flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-background/75 backdrop-blur-md ring-1 ring-border/70">
        {!agentInCall && (
          <Tooltip>
            <TooltipTrigger
              render={
                <span className={`flex items-center ${aiTone}`} aria-label={aiLabel}>
                  {listening ? <Ear className="h-4 w-4" /> : <EarOff className="h-4 w-4" />}
                </span>
              }
            />
            <TooltipContent>{aiLabel}</TooltipContent>
          </Tooltip>
        )}

        {captionsOn && (
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="flex items-center text-info" aria-label="Live captions on">
                  <Captions className="h-4 w-4" />
                </span>
              }
            />
            <TooltipContent>Live captions are showing</TooltipContent>
          </Tooltip>
        )}

        {isRecording && (
          <Tooltip>
            <TooltipTrigger
              render={
                <span
                  className="flex items-center text-destructive"
                  aria-label="Recording — audio and video are being captured"
                >
                  <CircleDot className="h-4 w-4 animate-pulse" />
                </span>
              }
            />
            <TooltipContent>
              Recording in progress — audio and video are being captured.{' '}
              <a href="/docs" className="underline">
                Data retention
              </a>
            </TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger
            render={
              <span
                className={`flex items-center ${networkTone[quality]}`}
                aria-label={networkLabel[quality]}
              >
                {quality === ConnectionQuality.Lost ? (
                  <WifiOff className="h-4 w-4" />
                ) : (
                  <Wifi className="h-4 w-4" />
                )}
              </span>
            }
          />
          <TooltipContent>{networkLabel[quality]}</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
