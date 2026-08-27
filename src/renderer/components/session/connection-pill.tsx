'use client';

import { useEffect, useRef, useState } from 'react';
import { useConnectionQualityIndicator, useLocalParticipant } from '@livekit/components-react';
import { ConnectionQuality, LocalAudioTrack } from 'livekit-client';
import { Wifi, WifiOff } from 'lucide-react';

import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

const QUALITY_TONE: Record<ConnectionQuality, { label: string; color: string }> = {
  [ConnectionQuality.Excellent]: { label: 'Excellent', color: 'text-success' },
  [ConnectionQuality.Good]: { label: 'Good', color: 'text-success' },
  [ConnectionQuality.Poor]: { label: 'Poor', color: 'text-warning' },
  [ConnectionQuality.Lost]: { label: 'Lost', color: 'text-destructive' },
  [ConnectionQuality.Unknown]: { label: 'Unknown', color: 'text-muted-foreground' },
};

/**
 * Network quality + microphone VU pill. Must be rendered inside a `<LiveKitRoom>`.
 * Anchors to fixed top-right (right of MicStatePill / In-Call / REC / CC).
 */
export function ConnectionPill() {
  // useConnectionQualityIndicator() defaults to a participant via context
  // (ParticipantTile). Outside a tile we must pass the participant explicitly.
  const { localParticipant, microphoneTrack } = useLocalParticipant();
  const { quality } = useConnectionQualityIndicator({ participant: localParticipant });
  const [level, setLevel] = useState(0);
  const reducedMotion = useReducedMotion();

  // Compute mic VU from the LocalAudioTrack's MediaStream.
  useEffect(() => {
    const track = microphoneTrack?.track;
    if (!(track instanceof LocalAudioTrack)) return;
    const mediaStreamTrack = track.mediaStreamTrack;
    if (!mediaStreamTrack) return;

    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(new MediaStream([mediaStreamTrack]));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.6;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);

    let raf: number;
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      // RMS-ish: peak deviation from 128 midpoint, normalized to 0..1.
      let peak = 0;
      for (let i = 0; i < data.length; i++) {
        const v = Math.abs(data[i] - 128);
        if (v > peak) peak = v;
      }
      setLevel(Math.min(1, peak / 96));
      raf = requestAnimationFrame(tick);
    };
    if (!reducedMotion) tick();

    return () => {
      cancelAnimationFrame(raf);
      source.disconnect();
      ctx.close().catch(() => {});
    };
  }, [microphoneTrack, reducedMotion]);

  const tone = QUALITY_TONE[quality] ?? QUALITY_TONE[ConnectionQuality.Unknown];
  const Icon = quality === ConnectionQuality.Lost ? WifiOff : Wifi;

  // VU bar element refs — drive height via ref to avoid 60fps re-renders.
  const barRefs = useRef<Array<HTMLSpanElement | null>>([]);
  useEffect(() => {
    if (reducedMotion) return;
    // Render 5 bars with a peak-curve so the middle bar reflects the loudest.
    barRefs.current.forEach((el, i) => {
      if (!el) return;
      const distance = Math.abs(i - 2) / 2; // 0 at center, 1 at edges
      const local = Math.max(0, level - distance * 0.4);
      const h = 3 + local * 12;
      el.style.height = `${h}px`;
    });
  }, [level, reducedMotion]);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label={`Connection quality: ${tone.label}`}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg bg-foreground/[0.05] border border-border/70 text-[11px] font-medium ${tone.color} hover:brightness-110 transition-colors`}
            >
              <Icon className="h-3 w-3" />
              <span className="tabular-nums">{tone.label}</span>
              {/* VU bars */}
              <span className="flex items-end gap-[2px] h-3" aria-hidden>
                {[0, 1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    ref={(el) => {
                      barRefs.current[i] = el;
                    }}
                    className="w-[2px] rounded-sm bg-current"
                    style={{ height: '3px' }}
                  />
                ))}
              </span>
            </button>
          }
        />
        <TooltipContent>
          {tone.label} connection
          {quality === ConnectionQuality.Poor && ' — expect choppy audio'}
          {quality === ConnectionQuality.Lost && ' — reconnecting...'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
