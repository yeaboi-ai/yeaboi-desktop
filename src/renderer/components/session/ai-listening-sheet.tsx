'use client';

import { useEffect, useRef, useState } from 'react';
import { Ear, Mic, MicOff } from 'lucide-react';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

interface InterimEntry {
  id: string;
  speaker_name: string | null;
  text: string;
  is_final: boolean;
  created_at: string;
}

interface AIListeningSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** True when the call is connected — when false, the panel reports "not listening". */
  inCall: boolean;
  /** True when the local mic is muted by the user. */
  micMuted: boolean;
  /** Active language code (e.g. "en"). */
  language: string;
  /** Active persona label (rendered as-is). */
  personaLabel: string;
  /** Recent transcript entries — used to surface the latest interim chunk. */
  entries: InterimEntry[];
}

export function AIListeningSheet({
  open,
  onOpenChange,
  inCall,
  micMuted,
  language,
  personaLabel,
  entries,
}: AIListeningSheetProps) {
  const reducedMotion = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [streamError, setStreamError] = useState<string | null>(null);

  // Latest interim entry (still being spoken). Falls back to the latest final.
  const latestInterim = [...entries].reverse().find((e) => !e.is_final);
  const latestFinal = [...entries].reverse().find((e) => e.is_final);
  const display = latestInterim ?? latestFinal;

  // Drive the live waveform from the user's mic. We open a fresh stream with
  // minimal constraints so we can show audio energy even when the LiveKit
  // pipeline buffers it elsewhere.
  useEffect(() => {
    if (!open || reducedMotion || !inCall || micMuted) return;

    let cancelled = false;
    let raf: number;
    let ctx: AudioContext | null = null;
    let stream: MediaStream | null = null;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled || !stream) return;
        ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.7;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);

        const draw = () => {
          if (cancelled) return;
          const canvas = canvasRef.current;
          if (!canvas) {
            raf = requestAnimationFrame(draw);
            return;
          }
          const c2d = canvas.getContext('2d');
          if (!c2d) return;
          const w = canvas.width;
          const h = canvas.height;
          analyser.getByteTimeDomainData(data);
          c2d.clearRect(0, 0, w, h);
          c2d.strokeStyle = 'rgba(94, 234, 212, 0.85)';
          c2d.lineWidth = 1.5;
          c2d.beginPath();
          const slice = w / data.length;
          for (let i = 0; i < data.length; i++) {
            const v = data[i] / 128.0;
            const y = (v * h) / 2;
            const x = i * slice;
            if (i === 0) c2d.moveTo(x, y);
            else c2d.lineTo(x, y);
          }
          c2d.stroke();
          raf = requestAnimationFrame(draw);
        };
        draw();
      } catch (err) {
        if (!cancelled) {
          setStreamError(err instanceof Error ? err.message : 'Microphone access failed');
        }
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      ctx?.close().catch(() => {});
    };
  }, [open, reducedMotion, inCall, micMuted]);

  const status: { tone: string; icon: typeof Mic; label: string } = !inCall
    ? { tone: 'text-muted-foreground/70', icon: MicOff, label: 'Not in a call' }
    : micMuted
      ? { tone: 'text-warning', icon: MicOff, label: "Mic muted — agent isn't hearing you" }
      : { tone: 'text-success', icon: Mic, label: 'Listening' };
  const StatusIcon = status.icon;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Ear className="h-3.5 w-3.5 text-success" />
            What is the AI hearing?
          </SheetTitle>
          <SheetDescription>
            Live mic, partial transcript, and the agent context being applied right now.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Status row */}
          <div className={`flex items-center gap-2 ${status.tone}`}>
            <StatusIcon className="h-4 w-4" />
            <span className="text-sm font-medium">{status.label}</span>
          </div>

          {/* Waveform */}
          <section>
            <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground/70 font-medium mb-2">
              Live audio
            </p>
            {reducedMotion ? (
              <div className="rounded-lg bg-foreground/[0.04] border border-border/60 p-4 text-[12px] text-muted-foreground">
                Waveform hidden — reduced-motion preference is on.
              </div>
            ) : streamError ? (
              <div className="rounded-lg bg-warning/10 border border-warning/20 p-3 text-[11px] text-warning">
                {streamError}
              </div>
            ) : (
              <canvas
                ref={canvasRef}
                width={400}
                height={80}
                className="w-full h-20 rounded-lg bg-foreground/[0.04] border border-border/60"
              />
            )}
          </section>

          {/* Interim transcript */}
          <section>
            <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground/70 font-medium mb-2">
              Hearing right now
            </p>
            <div className="rounded-lg bg-foreground/[0.04] border border-border/60 px-3 py-3 min-h-[60px]">
              {display ? (
                <p
                  className={`text-[14px] leading-snug ${
                    display.is_final ? 'text-foreground/80' : 'text-foreground italic'
                  }`}
                >
                  {display.speaker_name && (
                    <span className="text-muted-foreground/70 mr-2 text-[12px] not-italic">
                      {display.speaker_name}:
                    </span>
                  )}
                  {display.text}
                </p>
              ) : (
                <p className="text-[12px] text-muted-foreground/60">No speech yet.</p>
              )}
            </div>
          </section>

          {/* Context */}
          <section>
            <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground/70 font-medium mb-2">
              Agent context
            </p>
            <dl className="space-y-1.5 text-[12px]">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground/70">Persona</dt>
                <dd className="text-foreground/95 font-medium">{personaLabel}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground/70">Recognition language</dt>
                <dd className="text-foreground/95 font-mono uppercase">{language}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground/70">Mic</dt>
                <dd className={`${status.tone} font-medium`}>
                  {micMuted ? 'Muted' : inCall ? 'Open' : 'Idle'}
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
