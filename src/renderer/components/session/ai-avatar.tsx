"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

export type AIAvatarState = "listening" | "thinking" | "speaking" | "paused";

interface AIAvatarProps {
  /** @deprecated Pass `state` instead. Kept for back-compat: true → "speaking", false → "listening". */
  speaking?: boolean;
  /** Explicit four-state machine. Wins over `speaking` when provided. */
  state?: AIAvatarState;
  persona?: string;
}

const PERSONA_COLORS: Record<string, string> = {
  default: "var(--primary)",
  pm: "#60a5fa",
  architect: "#a78bfa",
  mentor: "#34d399",
  challenger: "#f87171",
};

const STATE_LABEL: Record<AIAvatarState, string> = {
  listening: "AI is listening",
  thinking: "AI is thinking",
  speaking: "AI is speaking",
  paused: "AI is paused",
};

export function AIAvatar({ speaking, state: explicitState, persona = "default" }: AIAvatarProps) {
  // Resolve effective state. Explicit `state` always wins.
  const state: AIAvatarState = explicitState ?? (speaking ? "speaking" : "listening");
  const color = PERSONA_COLORS[persona] || PERSONA_COLORS.default;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasSupported, setCanvasSupported] = useState(true);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      setCanvasSupported(false);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) {
      setCanvasSupported(false);
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setCanvasSupported(false);
      return;
    }

    setCanvasSupported(true);
    let frame = 0;
    let animId: number;

    function draw() {
      if (!ctx || !canvas) return;
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const baseRadius = w * 0.28;

      ctx.clearRect(0, 0, w, h);

      // Outer rings — speaking pulses energetically; listening expands subtly; thinking orbits.
      if (state === "speaking") {
        for (let i = 3; i >= 1; i--) {
          const pulseRadius = baseRadius + i * 8 + Math.sin(frame * 0.08 + i) * 4;
          ctx.beginPath();
          ctx.arc(cx, cy, pulseRadius, 0, Math.PI * 2);
          ctx.strokeStyle = color + (i === 1 ? "40" : i === 2 ? "25" : "15");
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      } else if (state === "listening") {
        // One soft expanding ring, fades as it grows.
        const t = (frame * 0.02) % 1; // 0..1 cycle
        const r = baseRadius + 4 + t * 14;
        const alpha = Math.round((1 - t) * 60);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = color + alpha.toString(16).padStart(2, "0");
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else if (state === "thinking") {
        // Orbiting arc — suggests internal computation.
        const start = (frame * 0.06) % (Math.PI * 2);
        ctx.beginPath();
        ctx.arc(cx, cy, baseRadius + 8, start, start + Math.PI * 0.6);
        ctx.strokeStyle = color + "aa";
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.stroke();
      }

      // Main circle. Paused state dims the alpha.
      const isPaused = state === "paused";
      const radius = baseRadius + (state === "speaking" ? Math.sin(frame * 0.1) * 3 : 0);
      const innerAlpha = isPaused ? "20" : "60";
      const outerAlpha = isPaused ? "08" : "20";
      const gradient = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.3, 0, cx, cy, radius);
      gradient.addColorStop(0, color + innerAlpha);
      gradient.addColorStop(1, color + outerAlpha);

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.strokeStyle = isPaused ? color + "30" : color + "80";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Center glyph differs per state.
      if (state === "speaking") {
        const barCount = 5;
        const barWidth = 3;
        const barGap = 5;
        const totalWidth = barCount * barWidth + (barCount - 1) * barGap;
        const startX = cx - totalWidth / 2;

        for (let i = 0; i < barCount; i++) {
          const barHeight = 8 + Math.sin(frame * 0.15 + i * 0.8) * 8;
          const x = startX + i * (barWidth + barGap);
          const y = cy - barHeight / 2;

          ctx.fillStyle = color + "cc";
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, 1.5);
          ctx.fill();
        }
      } else if (state === "thinking") {
        // Three orbiting dots
        for (let i = 0; i < 3; i++) {
          const a = (frame * 0.1 + i * 0.4) % (Math.PI * 2);
          const dotR = 2.5;
          const dx = cx + Math.cos(a) * (radius * 0.4);
          const dy = cy + Math.sin(a) * (radius * 0.4);
          ctx.beginPath();
          ctx.arc(dx, dy, dotR, 0, Math.PI * 2);
          ctx.fillStyle = color + "cc";
          ctx.fill();
        }
      } else {
        // listening / paused — static glyph
        ctx.fillStyle = color + (isPaused ? "55" : "aa");
        ctx.font = `${radius * 0.6}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(isPaused ? "⏸" : "✦", cx, cy);
      }

      frame++;
      animId = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(animId);
  }, [state, color, reducedMotion]);

  // CSS-only fallback when canvas is not available (SSR or unsupported)
  // or when the user has requested reduced motion. Static per-state visual.
  if (!canvasSupported) {
    const isSpeaking = state === "speaking";
    const isPaused = state === "paused";
    const isThinking = state === "thinking";
    const animateBox = isSpeaking && !reducedMotion;
    const glyph = isPaused ? "⏸" : isThinking ? "⋯" : "✦";
    return (
      <div className="flex flex-col items-center py-3">
        <div
          className="w-[72px] h-[72px] rounded-full flex items-center justify-center"
          style={{
            background: `radial-gradient(circle at 35% 35%, ${color}${isPaused ? "20" : "60"}, ${color}${isPaused ? "08" : "20"})`,
            border: `2px solid ${color}${isPaused ? "30" : "80"}`,
            animation: animateBox ? "ai-avatar-pulse 1.5s ease-in-out infinite" : "none",
            opacity: isPaused ? 0.6 : 1,
          }}
          aria-label={STATE_LABEL[state]}
          role="img"
        >
          {isSpeaking ? (
            <div className="flex gap-[3px] items-center">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="w-[3px] rounded-full"
                  style={{
                    backgroundColor: color + "cc",
                    animation: reducedMotion
                      ? "none"
                      : `ai-bar-bounce 0.6s ease-in-out ${i * 0.1}s infinite alternate`,
                    height: reducedMotion ? "10px" : "8px",
                  }}
                />
              ))}
            </div>
          ) : (
            <span style={{ color: color + (isPaused ? "55" : "aa"), fontSize: "24px" }}>{glyph}</span>
          )}
        </div>
        <style>{`
          @keyframes ai-avatar-pulse {
            0%, 100% { box-shadow: 0 0 0 0 ${color}30; }
            50% { box-shadow: 0 0 0 12px ${color}10; }
          }
          @keyframes ai-bar-bounce {
            from { height: 4px; }
            to { height: 16px; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center py-3" aria-label={STATE_LABEL[state]} role="img">
      <canvas
        ref={canvasRef}
        width={120}
        height={120}
        className="w-[120px] h-[120px]"
      />
    </div>
  );
}
