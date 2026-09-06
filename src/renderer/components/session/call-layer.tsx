'use client';

// The call layer — the LiveKit room and everything inside it, extracted from
// the web app's chat-drawer.tsx (which wraps chat + call + notes in one
// drawer). The desktop keeps its own chat panel and mounts this beside it:
// the huddle bar, the floating video window (tiles, screenshare + ink,
// reactions, raised hands, captions, background effects), the room audio, and
// the agent steering/transcript bridges. Everything below the CallLayer
// export is the web code verbatim — HuddleBar, FloatingVideoWindow,
// VideoPanel and friends were private to chat-drawer.tsx and keep their
// shapes so future diffs against the web stay readable.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useScreensaverSuppression } from '@/hooks/use-screensaver-suppression';
import { useMusicHold } from '@/hooks/use-music-hold';
import { createPortal } from 'react-dom';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
  useTracks,
  useConnectionQualityIndicator,
  ParticipantTile,
} from '@livekit/components-react';
import '@livekit/components-styles';
import {
  ConnectionQuality,
  Track,
  RoomEvent,
  LocalAudioTrack,
  ParticipantEvent,
  VideoPresets,
  VideoQuality,
  RemoteTrackPublication,
  type Participant,
  type Room,
  type RoomOptions,
} from 'livekit-client';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  PhoneOff,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Volume2,
  VolumeX,
  Captions,
  CaptionsOff,
  Bot,
  BotOff,
  Sparkles,
  ImageIcon,
  Check,
  X,
  Hand,
  Circle,
  Loader2,
  Bell,
  BellOff,
  GripHorizontal,
  EyeOff,
  Ear,
  EarOff,
  Palette,
  UserPlus,
  Upload,
  MonitorOff,
  Phone,
  RotateCcw,
  Pencil,
  Loader2 as LoaderIcon,
} from 'lucide-react';
import { useChatNotifications } from '@/hooks/use-chat-notifications';
import { setAgentControlPublisher } from '@/lib/agent-control';
import { useProviderHealth } from '@/hooks/use-provider-health';
import { bringToFront } from './drawer-shell';
import { PersonaThumbnail } from './persona-thumbnail';
import { AgentTranscriptBridge } from './agent-transcript-bridge';
import { VideoTileStatus } from './video-tile-status';
import { ScreenDrawCanvas } from './screen-draw-canvas';
import { useScreenDraw } from '@/hooks/use-screen-draw';
import { ReactionsOverlay } from './reactions-overlay';
import { RaiseHand } from './raise-hand';
import { useRaisedHands } from '@/hooks/use-raised-hands';
import { AgentSteeringBridge, type SteeringAction } from '@/hooks/use-agent-steering';
import { logger } from '@/lib/logger';

export interface CallLayerProps {
  inCall: boolean;
  lkToken: string;
  lkUrl: string;
  agentStatus: string | null;
  agentInCall: boolean;
  onLeaveCall: () => void;
  timerStr: string;
  teamMembers?: { id: string; name: string | null; email: string }[];
  micMuted: boolean;
  onMicMuteChange?: (muted: boolean) => void;
  pushToTalk?: boolean;
  captionsOn?: boolean;
  onToggleCaptions?: () => void;
  onDispatchAgent?: () => void;
  onDetachAgent?: () => void;
  realtimeSpeaking?: boolean;
  personaName?: string;
  personaVideoPreviewUrl?: string | null;
  personaSlug?: string;
  agentCameraOff?: boolean;
  onToggleAgentCamera?: () => void;
  isRecording?: boolean;
  onSteerReady?: (steer: ((action: SteeringAction) => void) | null) => void;
  onAgentTranscript?: (
    entries: {
      id: string;
      speaker_name: string | null;
      text: string;
      is_final: boolean;
      created_at: string;
    }[],
  ) => void;
}

/** The LiveKit room and its furniture — mount while a call is live. */
export function CallLayer({
  inCall,
  lkToken,
  lkUrl,
  agentStatus,
  agentInCall,
  onLeaveCall,
  timerStr,
  teamMembers,
  micMuted,
  onMicMuteChange,
  pushToTalk,
  captionsOn,
  onToggleCaptions,
  onDispatchAgent,
  onDetachAgent,
  realtimeSpeaking,
  personaName,
  personaVideoPreviewUrl,
  personaSlug,
  agentCameraOff,
  onToggleAgentCamera,
  isRecording,
  onSteerReady,
  onAgentTranscript,
}: CallLayerProps) {
  const [videoExpanded, setVideoExpanded] = useState(true);
  const [, setAiRinging] = useState(false);
  // A call is the clearest case of all: the person is here, looking at the
  // window, and touching nothing.
  useScreensaverSuppression(inCall);
  // And the radio waits, the way the terminal's does while a voice note records.
  useMusicHold(inCall);

  if (!inCall || !lkUrl) return null;
  return (
    <LiveKitRoom
      token={lkToken}
      serverUrl={lkUrl}
      connect={true}
      audio={true}
      video={false}
      options={LK_OPTIONS}
      style={{ display: 'contents' }}
      onError={(err) => logger.warn('[LK Room] Error:', err)}
    >
      <HuddleBar
        agentStatus={agentStatus ?? undefined}
        onLeave={onLeaveCall}
        onExpand={() => setVideoExpanded(true)}
        expanded={videoExpanded}
        timer={timerStr}
        onMicMuteChange={onMicMuteChange}
      />
      {videoExpanded && (
        <FloatingVideoWindow
          agentStatus={agentStatus ?? undefined}
          agentInCall={agentInCall}
          onLeave={onLeaveCall}
          onCollapse={() => setVideoExpanded(false)}
          timer={timerStr}
          teamMembers={teamMembers}
          onMicMuteChange={onMicMuteChange}
          micMuted={micMuted}
          pushToTalk={pushToTalk}
          captionsOn={captionsOn}
          onToggleCaptions={onToggleCaptions}
          onDispatchAgent={onDispatchAgent}
          onDetachAgent={onDetachAgent}
          realtimeSpeaking={realtimeSpeaking}
          onAiRingingChange={setAiRinging}
          personaName={personaName ?? ''}
          personaVideoPreviewUrl={personaVideoPreviewUrl}
          personaSlug={personaSlug ?? ''}
          agentCameraOff={agentCameraOff}
          onToggleAgentCamera={onToggleAgentCamera}
          isRecording={isRecording}
        />
      )}
      <RoomAudioRenderer />
      {onSteerReady && <AgentSteeringBridge onReady={onSteerReady} />}
      {onAgentTranscript && (
        <AgentTranscriptBridge fallbackSpeakerName={personaName} onEntries={onAgentTranscript} />
      )}
    </LiveKitRoom>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Everything below is chat-drawer.tsx's private call code, verbatim.
// ───────────────────────────────────────────────────────────────────────────

const PERSONA_LABELS: Record<string, string> = {
  default: 'Senior Engineer',
  pm: 'Product Manager',
  architect: 'System Architect',
  mentor: 'Patient Mentor',
  challenger: "Devil's Advocate",
};

// Identity patterns of any LiveKit participant that represents the AI agent —
// the original `agent-*` worker plus Tavus's `tavus-avatar-agent` mirror that
// joins as a separate participant publishing the lip-synced video track.
const AGENT_IDENTITY_RE = /^agent|tavus|avatar/i;
const isAgentParticipant = (p: { identity?: string | null }) =>
  AGENT_IDENTITY_RE.test(p.identity || '');

function readMicMuted(p: Participant): boolean {
  const mic = p.getTrackPublication(Track.Source.Microphone);
  return !mic || mic.isMuted;
}

// Reactive mute state for the AI agent participant. The synchronous
// `pub.isMuted` read used elsewhere is a snapshot at render time and
// doesn't update when the agent's track unmutes after publish — which is
// what causes the "muted" badge to stick on the AI tile during a live call.
function useParticipantIsMuted(p: Participant): boolean {
  const [isMuted, setIsMuted] = useState<boolean>(() => readMicMuted(p));
  useEffect(() => {
    const update = () => setIsMuted(readMicMuted(p));
    update();
    p.on(ParticipantEvent.TrackMuted, update);
    p.on(ParticipantEvent.TrackUnmuted, update);
    p.on(ParticipantEvent.TrackPublished, update);
    p.on(ParticipantEvent.TrackUnpublished, update);
    p.on(ParticipantEvent.TrackSubscribed, update);
    return () => {
      p.off(ParticipantEvent.TrackMuted, update);
      p.off(ParticipantEvent.TrackUnmuted, update);
      p.off(ParticipantEvent.TrackPublished, update);
      p.off(ParticipantEvent.TrackUnpublished, update);
      p.off(ParticipantEvent.TrackSubscribed, update);
    };
  }, [p]);
  return isMuted;
}

function AgentMuteBadge({
  participant,
  className,
}: {
  participant: Participant;
  className: string;
}) {
  const isMuted = useParticipantIsMuted(participant);
  if (!isMuted) return null;
  return (
    <div className={className}>
      <MicOff className="h-[55%] w-[55%] text-foreground pointer-events-none" />
    </div>
  );
}

function AgentMuteBadgeOnVideo({ participant }: { participant: Participant }) {
  const isMuted = useParticipantIsMuted(participant);
  if (!isMuted) return null;
  return (
    <div className="w-6 h-6 rounded-full bg-destructive/90 flex items-center justify-center backdrop-blur-sm">
      <MicOff className="h-3 w-3 text-foreground pointer-events-none" />
    </div>
  );
}

interface NotifSoundToggleProps {
  notifications: {
    enabled: boolean;
    toggleEnabled: () => void;
  };
}

/**
 * Sound on/off toggle for incoming chat notifications. The unread count is
 * shown elsewhere (Messenger-style badge on the Chat tab); this control is
 * solely about whether new messages chime.
 */
function NotifSoundToggle({ notifications }: NotifSoundToggleProps) {
  const { enabled, toggleEnabled } = notifications;
  return (
    <button
      type="button"
      onClick={toggleEnabled}
      title={enabled ? 'Sound alerts on — click to mute' : 'Sound alerts off — click to enable'}
      aria-label={enabled ? 'Mute notification sound' : 'Enable notification sound'}
      className={`inline-flex items-center justify-center w-6 h-6 rounded-md transition-colors ${
        enabled
          ? 'text-muted-foreground/70 hover:text-foreground/80 hover:bg-foreground/[0.06]'
          : 'text-muted-foreground/40 hover:text-muted-foreground/80 hover:bg-foreground/[0.05]'
      }`}
    >
      {enabled ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
    </button>
  );
}

const LK_OPTIONS: RoomOptions = {
  videoCaptureDefaults: {
    resolution: VideoPresets.h720.resolution,
    facingMode: 'user',
  },
  audioCaptureDefaults: {
    autoGainControl: true,
    echoCancellation: true,
    noiseSuppression: true,
    sampleRate: 48000,
    channelCount: 1,
  },
  publishDefaults: {
    videoSimulcastLayers: [VideoPresets.h360, VideoPresets.h180],
    videoCodec: 'vp8',
    videoEncoding: {
      maxBitrate: 2_500_000,
      maxFramerate: 30,
    },
    dtx: true,
    red: true,
  },
  adaptiveStream: true,
  dynacast: true,
  disconnectOnPageLeave: true,
};

function useCallControls(onMicChange?: (muted: boolean) => void) {
  const { localParticipant } = useLocalParticipant();
  const [screenEnabled, setScreenEnabled] = useState(false);

  // Read actual state from LiveKit publications — no separate state needed
  const micPub = localParticipant.getTrackPublication(Track.Source.Microphone);
  const camPub = localParticipant.getTrackPublication(Track.Source.Camera);
  const micEnabled = !!micPub && !micPub.isMuted;
  const camEnabled = !!camPub && !camPub.isMuted;

  const toggleMic = useCallback(async () => {
    try {
      const newEnabled = !micEnabled;
      await localParticipant.setMicrophoneEnabled(newEnabled);
      onMicChange?.(!newEnabled); // muted = !enabled
    } catch (e) {
      logger.warn('[LK] Mic toggle failed:', e);
    }
  }, [localParticipant, micEnabled, onMicChange]);

  const toggleCam = useCallback(async () => {
    const want = !camEnabled;
    try {
      await localParticipant.setCameraEnabled(want);
    } catch (e) {
      logger.warn('[LK] Camera toggle failed:', e);
    }
  }, [localParticipant, camEnabled]);

  const toggleScreen = useCallback(async () => {
    try {
      await localParticipant.setScreenShareEnabled(!screenEnabled);
      setScreenEnabled(!screenEnabled);
    } catch (e) {
      logger.debug('[LK] Screen share toggle:', e);
    }
  }, [localParticipant, screenEnabled]);

  const applyCameraEffect = useCallback(
    async (bg: string) => {
      try {
        const camTrack = localParticipant.getTrackPublication(Track.Source.Camera)?.track;
        if (!camTrack) return;

        // Only stop the existing processor if one is actually attached.
        // Calling stopProcessor on a track without one can briefly restart the
        // underlying MediaStreamTrack — visible to the user as the camera
        // "flashing on then off" right after first-click enable.
        const hasProcessor = (() => {
          const t = camTrack as { getProcessor?: () => unknown };
          return typeof t.getProcessor === 'function' && t.getProcessor();
        })();
        if (hasProcessor) {
          await camTrack.stopProcessor();
        }

        if (bg === 'default') return;

        if (bg === 'blur-light' || bg === 'blur-heavy') {
          const { BackgroundBlur } = await import('@livekit/track-processors');
          const radius = bg === 'blur-light' ? 8 : 20;
          await camTrack.setProcessor(BackgroundBlur(radius));
          return;
        }

        // Determine image URL for VirtualBackground
        const opt = BG_OPTIONS.find((o) => o.id === bg);
        let imgUrl: string | null = null;

        if (opt?.style.startsWith('http')) {
          imgUrl = opt.style;
        } else if (bg.startsWith('blob:') || bg.startsWith('http')) {
          imgUrl = bg;
        } else if (opt?.style.startsWith('linear-gradient')) {
          // Render gradient to canvas → blob URL
          const canvas = document.createElement('canvas');
          canvas.width = 1280;
          canvas.height = 720;
          const ctx2d = canvas.getContext('2d');
          if (ctx2d) {
            // Parse gradient colors from the CSS
            const colors = opt.style.match(/#[0-9a-fA-F]{6}/g) || ['var(--card)', 'var(--card)'];
            const grad = ctx2d.createLinearGradient(0, 0, canvas.width, canvas.height);
            colors.forEach((c, i) => grad.addColorStop(i / Math.max(colors.length - 1, 1), c));
            ctx2d.fillStyle = grad;
            ctx2d.fillRect(0, 0, canvas.width, canvas.height);
            imgUrl = canvas.toDataURL('image/png');
          }
        }

        if (imgUrl) {
          const { VirtualBackground } = await import('@livekit/track-processors');
          await camTrack.setProcessor(VirtualBackground(imgUrl));
        }
      } catch (e) {
        logger.warn('[LK] Background effect failed:', e);
      }
    },
    [localParticipant],
  );

  return {
    localParticipant,
    micEnabled,
    camEnabled,
    screenEnabled,
    toggleMic,
    toggleCam,
    toggleScreen,
    applyCameraEffect,
  };
}

/* ── Control button ──────────────────────────────────────────────── */

function CtrlBtn({
  onClick,
  active,
  danger,
  label,
  children,
  size = 'normal',
}: {
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  label?: string;
  children: React.ReactNode;
  size?: 'compact' | 'normal';
}) {
  const isCompact = size === 'compact';
  return (
    <button
      onClick={onClick}
      title={label}
      className={`flex flex-col items-center gap-1 transition-all duration-200 ${
        isCompact ? 'p-2 rounded-xl' : 'p-3 rounded-2xl min-w-[52px]'
      } ${
        danger
          ? 'bg-destructive/20 text-destructive hover:bg-destructive/35 hover:scale-105 active:scale-95'
          : active
            ? 'bg-white/12 text-foreground hover:bg-white/18 hover:scale-105 active:scale-95'
            : 'bg-foreground/[0.06] text-muted-foreground/70 hover:text-foreground/80 hover:bg-white/12 hover:scale-105 active:scale-95'
      }`}
    >
      {children}
      {label && !isCompact && (
        <span className="text-[8px] font-medium leading-none opacity-70">{label}</span>
      )}
    </button>
  );
}

/* ── Huddle Bar (compact, Slack-style) ───────────────────────────── */

function HuddleBar({
  agentStatus,
  onLeave,
  onExpand,
  expanded = false,
  timer,
  onMicMuteChange,
}: {
  agentStatus?: string;
  onLeave?: () => void;
  onExpand: () => void;
  expanded?: boolean;
  timer: string;
  onMicMuteChange?: (muted: boolean) => void;
}) {
  const allParticipants = useParticipants();
  const participants = allParticipants.filter((p) => !isAgentParticipant(p));
  const { localParticipant } = useLocalParticipant();

  // Read actual state from LiveKit — don't maintain separate toggle state
  const micPub = localParticipant.getTrackPublication(Track.Source.Microphone);
  const camPub = localParticipant.getTrackPublication(Track.Source.Camera);
  const micEnabled = !!micPub && !micPub.isMuted;
  const camEnabled = !!camPub && !camPub.isMuted;

  const toggleMic = useCallback(async () => {
    const newEnabled = !micEnabled;
    await localParticipant.setMicrophoneEnabled(newEnabled);
    onMicMuteChange?.(!newEnabled);
  }, [localParticipant, micEnabled, onMicMuteChange]);

  const toggleCam = useCallback(async () => {
    const want = !camEnabled;
    try {
      await localParticipant.setCameraEnabled(want);
    } catch (e) {
      logger.warn('[LK] Camera toggle failed:', e);
    }
  }, [localParticipant, camEnabled]);

  return (
    <div className="shrink-0 border-b border-border/70 bg-gradient-to-r from-white/[0.02] to-white/[0.01]">
      <div className="flex items-center gap-2 px-3 py-2.5">
        {/* Timer + REC */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
          <span className="text-[10px] font-body tabular-nums text-muted-foreground font-medium">
            {timer}
          </span>
        </div>

        {/* Divider */}
        <div className="w-px h-4 bg-foreground/[0.08]" />

        {/* Participants */}
        <div className="flex items-center gap-1 flex-1 min-w-0 overflow-hidden">
          {participants.map((p) => {
            const avatarUrl = (() => {
              try {
                return JSON.parse(p.metadata || '{}').avatar_url;
              } catch {
                return '';
              }
            })();
            return (
              <div
                key={p.sid}
                className={`w-7 h-7 rounded-full flex items-center justify-center text-[8px] font-medium shrink-0 transition-colors duration-300 overflow-hidden ${
                  p.isSpeaking
                    ? 'ring-2 ring-success/80 shadow-[0_0_8px_rgba(52,211,153,0.3)]'
                    : 'ring-1 ring-white/10'
                } ${!avatarUrl ? (p.isSpeaking ? 'bg-success/30 text-success' : 'bg-foreground/[0.10] text-muted-foreground') : ''}`}
                title={p.name || p.identity}
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  (p.name || p.identity || '?').slice(0, 2).toUpperCase()
                )}
              </div>
            );
          })}
        </div>

        {/* Divider */}
        <div className="w-px h-4 bg-foreground/[0.08]" />

        {/* Controls */}
        <div className="flex items-center gap-1 shrink-0">
          {!expanded && (
            <CtrlBtn onClick={onExpand} label="Show video" size="compact">
              <Maximize2 className="h-3.5 w-3.5 pointer-events-none" />
            </CtrlBtn>
          )}
          <CtrlBtn
            onClick={toggleMic}
            active={micEnabled}
            label={micEnabled ? 'Mute' : 'Unmute'}
            size="compact"
          >
            {micEnabled ? (
              <Mic className="h-3.5 w-3.5 pointer-events-none" />
            ) : (
              <MicOff className="h-3.5 w-3.5 pointer-events-none" />
            )}
          </CtrlBtn>
          <CtrlBtn
            onClick={toggleCam}
            active={camEnabled}
            label={camEnabled ? 'Camera off' : 'Camera on'}
            size="compact"
          >
            {camEnabled ? (
              <Video className="h-3.5 w-3.5 pointer-events-none" />
            ) : (
              <VideoOff className="h-3.5 w-3.5 pointer-events-none" />
            )}
          </CtrlBtn>
          <CtrlBtn onClick={() => onLeave?.()} danger label="Leave" size="compact">
            <PhoneOff className="h-3.5 w-3.5 pointer-events-none" />
          </CtrlBtn>
        </div>
      </div>
    </div>
  );
}

/* ── Floating Video Window (pop-out, draggable + resizable) ──────── */

function FloatingVideoWindow({
  agentStatus,
  agentInCall,
  onLeave,
  onCollapse,
  timer,
  teamMembers = [],
  onMicMuteChange,
  micMuted,
  pushToTalk,
  captionsOn,
  onToggleCaptions,
  onDispatchAgent,
  onDetachAgent,
  realtimeSpeaking,
  onAiRingingChange,
  personaName,
  personaVideoPreviewUrl,
  personaSlug,
  agentCameraOff,
  onToggleAgentCamera,
  isRecording,
}: {
  agentStatus?: string;
  agentInCall?: boolean;
  onLeave?: () => void;
  onCollapse: () => void;
  timer: string;
  teamMembers?: { id: string; name: string | null; email: string; avatar_url?: string | null }[];
  onMicMuteChange?: (muted: boolean) => void;
  micMuted?: boolean;
  pushToTalk?: boolean;
  captionsOn?: boolean;
  onToggleCaptions?: () => void;
  onDispatchAgent?: () => void;
  onDetachAgent?: () => void;
  realtimeSpeaking?: boolean;
  onAiRingingChange?: (ringing: boolean) => void;
  personaName: string;
  personaVideoPreviewUrl?: string | null;
  personaSlug?: string | null;
  agentCameraOff?: boolean;
  onToggleAgentCamera?: () => void;
  isRecording?: boolean;
}) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ w: 520, h: 400 });
  const [fullscreen, setFullscreen] = useState(false);
  const [zIndex, setZIndex] = useState(() => bringToFront());
  const dragging = useRef(false);
  const resizing = useRef(false);
  const offset = useRef({ x: 0, y: 0 });
  const initDone = useRef(false);
  // Store pre-fullscreen state to restore on exit
  const savedLayout = useRef({ pos: { x: 0, y: 0 }, size: { w: 520, h: 400 } });

  // Position bottom-right on mount
  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;
    const p = { x: window.innerWidth - 540, y: window.innerHeight - 420 };
    setPos(p);
    savedLayout.current = { pos: p, size: { w: 520, h: 400 } };
  }, []);

  // Escape key exits fullscreen. toggleFullscreen is declared below, so we
  // route through a ref to avoid the temporal-dead-zone reference and to keep
  // the effect's dependency array tight.
  const toggleFullscreenRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!fullscreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') toggleFullscreenRef.current();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fullscreen]);

  const toggleFullscreen = useCallback(() => {
    setFullscreen((prev) => {
      if (!prev) {
        // Entering fullscreen — save current layout
        savedLayout.current = { pos, size };
        setPos({ x: 0, y: 0 });
        setSize({ w: window.innerWidth, h: window.innerHeight });
      } else {
        // Exiting fullscreen — restore saved layout
        setPos(savedLayout.current.pos);
        setSize(savedLayout.current.size);
      }
      return !prev;
    });
  }, [pos, size]);
  useEffect(() => {
    toggleFullscreenRef.current = toggleFullscreen;
  }, [toggleFullscreen]);

  const onDragStart = useCallback(
    (e: React.PointerEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("button, a, input, [role='button']")) return;
      dragging.current = true;
      offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [pos],
  );

  const onDragMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    setPos({
      x: Math.max(0, Math.min(window.innerWidth - 200, e.clientX - offset.current.x)),
      y: Math.max(0, Math.min(window.innerHeight - 100, e.clientY - offset.current.y)),
    });
  }, []);

  const onDragEnd = useCallback(() => {
    dragging.current = false;
  }, []);

  const onResizeStart = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    resizing.current = true;
    offset.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onResizeMove = useCallback((e: React.PointerEvent) => {
    if (!resizing.current) return;
    const dx = e.clientX - offset.current.x;
    const dy = e.clientY - offset.current.y;
    offset.current = { x: e.clientX, y: e.clientY };
    setSize((s) => ({
      w: Math.max(360, Math.min(900, s.w + dx)),
      h: Math.max(280, Math.min(700, s.h + dy)),
    }));
  }, []);

  const onResizeEnd = useCallback(() => {
    resizing.current = false;
  }, []);

  return createPortal(
    <div
      className={`fixed flex flex-col bg-background/97 backdrop-blur-2xl overflow-hidden ${
        fullscreen
          ? 'rounded-none border-none'
          : 'rounded-2xl border border-border shadow-[0_24px_80px_-12px_rgba(0,0,0,0.8)]'
      }`}
      style={{
        left: pos.x,
        top: pos.y,
        width: size.w,
        height: size.h,
        // In fullscreen, blow past every other layer (top pills are at 200,
        // toasts at 300, etc.) so nothing overlays the meeting tile.
        zIndex: fullscreen ? 9999 : zIndex,
        // eslint-disable-next-line react-hooks/refs -- read during render to disable transition mid-drag; pre-existing pattern
        transition:
          dragging.current || resizing.current
            ? 'none'
            : 'width 0.3s, height 0.3s, border-radius 0.3s',
      }}
      onPointerDown={() => setZIndex(bringToFront())}
    >
      {/* Draggable header */}
      <div
        className={`flex items-center justify-between px-4 py-2.5 border-b border-border/60 select-none shrink-0 ${
          fullscreen ? '' : 'cursor-grab active:cursor-grabbing'
        }`}
        onPointerDown={fullscreen ? undefined : onDragStart}
        onPointerMove={fullscreen ? undefined : onDragMove}
        onPointerUp={fullscreen ? undefined : onDragEnd}
      >
        <div className="flex items-center gap-2">
          {!fullscreen && (
            <GripHorizontal className="h-3.5 w-3.5 text-muted-foreground/30 pointer-events-none" />
          )}
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pointer-events-none">
            Meeting
          </span>
        </div>
        {/* Header is intentionally minimal now — just window chrome.
            Call status icons live as a subtle overlay on the video tile
            (top-right of the video panel); CC and AI-listening toggles moved
            into the More menu. */}
        <div className="flex items-center gap-1">
          {fullscreen ? (
            <button
              onClick={toggleFullscreen}
              className="p-1.5 rounded-lg text-muted-foreground/70 hover:text-foreground/90 hover:bg-foreground/[0.08] transition-colors"
              title="Exit fullscreen"
            >
              <Minimize2 className="h-4 w-4 pointer-events-none" />
            </button>
          ) : (
            <>
              <button
                onClick={toggleFullscreen}
                className="p-1.5 rounded-lg text-muted-foreground/70 hover:text-foreground/90 hover:bg-foreground/[0.08] transition-colors"
                title="Fullscreen"
              >
                <Maximize2 className="h-4 w-4 pointer-events-none" />
              </button>
              <button
                onClick={onCollapse}
                className="p-1.5 rounded-lg text-muted-foreground/70 hover:text-foreground/90 hover:bg-foreground/[0.08] transition-colors"
                title="Hide to huddle bar"
              >
                <EyeOff className="h-4 w-4 pointer-events-none" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Video content — `relative` so the in-call overlays anchor to the
          video tile instead of the viewport. */}
      <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
        <VideoPanel
          agentStatus={agentStatus}
          onLeave={onLeave}
          onCollapse={onCollapse}
          timer={timer}
          teamMembers={teamMembers}
          onMicMuteChange={onMicMuteChange}
          micMuted={micMuted}
          pushToTalk={pushToTalk}
          captionsOn={captionsOn}
          onToggleCaptions={onToggleCaptions}
          onDispatchAgent={onDispatchAgent}
          onDetachAgent={onDetachAgent}
          realtimeSpeaking={realtimeSpeaking}
          onAiRingingChange={onAiRingingChange}
          personaName={personaName}
          personaVideoPreviewUrl={personaVideoPreviewUrl}
          personaSlug={personaSlug ?? ''}
          agentCameraOff={agentCameraOff}
          onToggleAgentCamera={onToggleAgentCamera}
        />
        {/* Subtle status cluster — top-right of the video tile.
            Icons only; toggles for these states live in the More menu. */}
        <VideoTileStatus
          micMuted={micMuted}
          pushToTalk={pushToTalk}
          captionsOn={captionsOn}
          isRecording={isRecording}
          agentInCall={agentInCall}
        />
        <ReactionsOverlay />
        <RaiseHand myName={teamMembers.find((m) => m.email)?.name ?? null} />
      </div>

      {/* Resize handle */}
      {!fullscreen && (
        <div
          className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
          onPointerDown={onResizeStart}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeEnd}
        >
          <svg
            className="w-3 h-3 text-muted-foreground/30 absolute bottom-1 right-1"
            viewBox="0 0 10 10"
            fill="currentColor"
          >
            <circle cx="8" cy="8" r="1.5" />
            <circle cx="4" cy="8" r="1.5" />
            <circle cx="8" cy="4" r="1.5" />
          </svg>
        </div>
      )}
    </div>,
    document.body,
  );
}

/* ── More menu (overflow for Share, Styles, Invite) ──────────────── */

function MoreMenu({
  showBgPicker,
  setShowBgPicker,
  tileBg,
  selectBg,
  camEnabled,
  showInvite,
  setShowInvite,
  inviteAI,
  agentStatus,
  aiCallPhase,
  fileInputRef,
  customBgs,
  saveCustomBg,
  deleteCustomBg,
  teamMembers,
  personaName,
  personaVideoPreviewUrl,
  personaSlug,
  micMuted,
  onToggleMic,
  pushToTalk,
  captionsOn,
  onToggleCaptions,
}: {
  showBgPicker: boolean;
  setShowBgPicker: (v: boolean) => void;
  tileBg: string;
  selectBg: (v: string) => void;
  camEnabled: boolean;
  showInvite: boolean;
  setShowInvite: (v: boolean) => void;
  inviteAI: () => void;
  agentStatus?: string;
  aiCallPhase: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  customBgs: string[];
  saveCustomBg: (url: string) => void;
  deleteCustomBg: (url: string) => void;
  teamMembers: { id: string; name: string | null; email: string; avatar_url?: string | null }[];
  personaName: string;
  personaVideoPreviewUrl?: string | null;
  personaSlug?: string | null;
  /** AI listening state + toggle (the STT gate). */
  micMuted?: boolean;
  onToggleMic?: () => void;
  /** PTT mode disables the AI-listening menu item (it's driven by the spacebar). */
  pushToTalk?: boolean;
  /** Captions toggle. */
  captionsOn?: boolean;
  onToggleCaptions?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const invitePopupRef = useRef<HTMLDivElement>(null);
  // Track the More button's bounding rect so the invite popup (which is
  // portaled to <body> to escape the meeting tile's overflow:hidden) can
  // anchor itself above it. Only populated while showInvite is true.
  const [inviteAnchorRect, setInviteAnchorRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const inAnchor = ref.current?.contains(e.target as Node);
      const inPopup = invitePopupRef.current?.contains(e.target as Node);
      if (!inAnchor && !inPopup) {
        setOpen(false);
        setShowBgPicker(false);
        setShowInvite(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, setShowBgPicker, setShowInvite]);

  // Recompute the anchor rect whenever the invite popup is opened or the
  // window/meeting tile moves. The popup is portaled to <body>, so we need
  // explicit coordinates instead of CSS-anchor positioning.
  useEffect(() => {
    if (!showInvite || !ref.current) {
      setInviteAnchorRect(null);
      return;
    }
    const update = () => {
      if (ref.current) setInviteAnchorRect(ref.current.getBoundingClientRect());
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [showInvite]);

  return (
    <div className="relative" ref={ref}>
      <CtrlBtn
        onClick={() => {
          if (open) {
            setShowBgPicker(false);
            setShowInvite(false);
          }
          setOpen((v) => !v);
        }}
        active={open}
        label="More"
      >
        <MoreHorizontal className="h-5 w-5 pointer-events-none" />
      </CtrlBtn>

      {open && !showBgPicker && !showInvite && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 rounded-2xl border border-border/70 bg-popover shadow-2xl w-[220px] z-50 overflow-hidden py-1">
          {/* AI listening toggle (W5.7.3) */}
          {onToggleMic && (
            <button
              onClick={() => {
                onToggleMic();
                setOpen(false);
              }}
              disabled={!!pushToTalk}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-foreground/[0.06] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {micMuted ? (
                <EarOff className="h-4 w-4 text-warning pointer-events-none" />
              ) : (
                <Ear className="h-4 w-4 text-success pointer-events-none" />
              )}
              <span className="flex-1 text-left">
                <span className="block text-[12px] text-foreground/90 font-medium">
                  {pushToTalk
                    ? 'Push-to-talk'
                    : micMuted
                      ? 'Resume AI listening'
                      : 'Pause AI listening'}
                </span>
                <span className="block text-[10px] text-muted-foreground/70">
                  {pushToTalk
                    ? 'Hold Space to transmit'
                    : micMuted
                      ? 'Others still hear you'
                      : 'Agent is transcribing'}
                </span>
              </span>
            </button>
          )}
          {/* Captions toggle (W2.4.1) */}
          {onToggleCaptions && (
            <button
              onClick={() => {
                onToggleCaptions();
                setOpen(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-foreground/[0.06] transition-colors"
            >
              <Captions
                className={`h-4 w-4 pointer-events-none ${captionsOn ? 'text-info' : 'text-muted-foreground'}`}
              />
              <span className="flex-1 text-left">
                <span className="block text-[12px] text-foreground/90 font-medium">
                  {captionsOn ? 'Hide captions' : 'Show captions'}
                </span>
                <span className="block text-[10px] text-muted-foreground/70">
                  Live subtitles over the call
                </span>
              </span>
            </button>
          )}
          <div className="my-1 border-t border-border/50" />
          <button
            onClick={() => {
              setShowBgPicker(true);
            }}
            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-foreground/[0.06] transition-colors"
          >
            <Palette className="h-4 w-4 text-muted-foreground pointer-events-none" />
            <span className="text-[12px] text-foreground/80 font-medium">Backgrounds</span>
            {tileBg !== 'default' && (
              <span className="w-1.5 h-1.5 rounded-full bg-primary ml-auto" />
            )}
          </button>
          <button
            onClick={() => {
              setShowInvite(true);
            }}
            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-foreground/[0.06] transition-colors"
          >
            <UserPlus className="h-4 w-4 text-muted-foreground pointer-events-none" />
            <span className="text-[12px] text-foreground/80 font-medium">Invite</span>
          </button>
        </div>
      )}

      {open && showBgPicker && (
        <>
          <BgPicker
            current={tileBg}
            onSelect={(bg) => {
              selectBg(bg);
              setShowBgPicker(false);
              setOpen(false);
            }}
            onUpload={() => fileInputRef.current?.click()}
            onClose={() => {
              setShowBgPicker(false);
            }}
            customBgs={customBgs}
            onDeleteCustom={deleteCustomBg}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                const reader = new FileReader();
                reader.onload = () => {
                  const dataUrl = reader.result as string;
                  saveCustomBg(dataUrl);
                  selectBg(dataUrl);
                  setShowBgPicker(false);
                  setOpen(false);
                };
                reader.readAsDataURL(file);
              }
              e.target.value = '';
            }}
          />
        </>
      )}

      {open &&
        showInvite &&
        inviteAnchorRect &&
        createPortal(
          <div
            ref={invitePopupRef}
            className="fixed rounded-2xl border border-border/70 bg-popover shadow-2xl w-[260px] z-[250] flex flex-col max-h-[min(70vh,calc(100vh-120px))] overflow-hidden"
            style={{
              // Center horizontally over the More button, clamped to viewport.
              left: Math.max(
                8,
                Math.min(
                  window.innerWidth - 268,
                  inviteAnchorRect.left + inviteAnchorRect.width / 2 - 130,
                ),
              ),
              // Anchor 12px above the More button via `bottom`.
              bottom: Math.max(8, window.innerHeight - inviteAnchorRect.top + 12),
            }}
          >
            <div className="px-4 pt-3 pb-2 flex items-center justify-between shrink-0">
              <span className="text-[11px] font-semibold text-muted-foreground">Invite team</span>
              <button
                onClick={() => setShowInvite(false)}
                className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground"
              >
                Back
              </button>
            </div>
            <div className="px-2 pb-2 overflow-y-auto">
              {teamMembers.length > 0 ? (
                teamMembers.map((m) => (
                  <div
                    key={m.id}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl opacity-60"
                  >
                    <div className="w-10 h-10 rounded-full bg-foreground/[0.10] flex items-center justify-center shrink-0 overflow-hidden ring-1 ring-white/10">
                      {m.avatar_url ? (
                        <img src={m.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xs text-muted-foreground font-medium">
                          {(m.name || m.email).slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <span className="text-[13px] text-foreground/80 font-medium block leading-tight truncate">
                        {m.name || m.email}
                      </span>
                      <span className="text-[11px] text-muted-foreground/40 leading-tight truncate block">
                        {m.email}
                      </span>
                    </div>
                    <span className="text-[9px] text-muted-foreground/30 shrink-0">
                      Coming soon
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-[11px] text-muted-foreground/50 px-3 py-3 text-center">
                  No teammates yet
                </p>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

/* ── Background options ───────────────────────────────────────────── */

const BG_OPTIONS = [
  { id: 'default', label: 'Default', style: 'var(--card)' },
  { id: 'gradient-dark', label: 'Dark', style: 'linear-gradient(135deg, #0f0f0f, #1a1a2e)' },
  { id: 'gradient-ocean', label: 'Ocean', style: 'linear-gradient(135deg, #0c1220, #1a3a4a)' },
  {
    id: 'gradient-sunset',
    label: 'Sunset',
    style: 'linear-gradient(135deg, #1a1a1a, #2d1b30, #1a1a1a)',
  },
  { id: 'gradient-forest', label: 'Forest', style: 'linear-gradient(135deg, #0a1a0a, #1a2a1a)' },
  {
    id: 'gradient-aurora',
    label: 'Aurora',
    style: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)',
  },
  { id: 'blur-light', label: 'Blur (light)', style: 'blur-light' },
  { id: 'blur-heavy', label: 'Blur (heavy)', style: 'blur-heavy' },
  {
    id: 'img-office',
    label: 'Office',
    style: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=600&q=60',
  },
  {
    id: 'img-nature',
    label: 'Nature',
    style: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600&q=60',
  },
  {
    id: 'img-space',
    label: 'Space',
    style: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&q=60',
  },
  {
    id: 'img-city',
    label: 'City',
    style: 'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=600&q=60',
  },
];

function getTileBgStyle(bg: string): string {
  if (bg === 'default') return 'var(--card)';
  const opt = BG_OPTIONS.find((o) => o.id === bg);
  if (opt) {
    if (opt.style.startsWith('linear-gradient') || opt.style === 'var(--card)') return opt.style;
    if (opt.style.startsWith('http')) return `url(${opt.style}) center/cover`;
  }
  // Custom uploaded image URL
  if (bg.startsWith('blob:') || bg.startsWith('http')) return `url(${bg}) center/cover`;
  return 'var(--card)';
}

function BgPicker({
  current,
  onSelect,
  onUpload,
  onClose,
  customBgs = [],
  onDeleteCustom,
}: {
  current: string;
  onSelect: (id: string) => void;
  onUpload: () => void;
  onClose: () => void;
  customBgs?: string[];
  onDeleteCustom?: (url: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 rounded-2xl border border-border/70 bg-popover shadow-2xl w-[300px] z-50 overflow-hidden"
    >
      <div className="px-4 pt-3 pb-2">
        <span className="text-[11px] font-semibold text-muted-foreground">Background</span>
      </div>
      <div className="px-3 pb-3 grid grid-cols-4 gap-1.5">
        {BG_OPTIONS.map((opt) => {
          const isActive = current === opt.id;
          const isImg = opt.style.startsWith('http');
          const isGrad = opt.style.startsWith('linear-gradient');
          return (
            <button
              key={opt.id}
              onClick={() => onSelect(opt.id)}
              className={`flex flex-col items-center gap-1 p-1 rounded-lg transition-colors ${
                isActive ? 'ring-2 ring-primary' : 'hover:bg-foreground/[0.05]'
              }`}
            >
              <div
                className="w-full aspect-video rounded-md overflow-hidden bg-cover bg-center"
                style={{
                  background: isImg
                    ? `url(${opt.style.replace('w=600', 'w=80')}) center/cover`
                    : isGrad
                      ? opt.style
                      : opt.style === 'var(--card)'
                        ? 'var(--card)'
                        : 'var(--card)',
                }}
              />
              <span className="text-[8px] text-muted-foreground/70 leading-none">{opt.label}</span>
            </button>
          );
        })}
        {/* Custom backgrounds */}
        {customBgs.map((url, i) => {
          const isActive = current === url;
          return (
            <div key={`custom-${i}`} className="relative group">
              <button
                onClick={() => onSelect(url)}
                className={`flex flex-col items-center gap-1 p-1 rounded-lg transition-colors w-full ${
                  isActive ? 'ring-2 ring-primary' : 'hover:bg-foreground/[0.05]'
                }`}
              >
                <div
                  className="w-full aspect-video rounded-md overflow-hidden bg-cover bg-center"
                  style={{ background: `url(${url}) center/cover` }}
                />
                <span className="text-[8px] text-muted-foreground/70 leading-none">Custom</span>
              </button>
              {onDeleteCustom && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteCustom(url);
                  }}
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive/80 text-foreground text-[8px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
        {/* Upload custom */}
        {customBgs.length < 5 && (
          <button
            onClick={onUpload}
            className="flex flex-col items-center gap-1 p-1 rounded-lg hover:bg-foreground/[0.05] transition-colors"
          >
            <div className="w-full aspect-video rounded-md border border-dashed border-border flex items-center justify-center">
              <Upload className="h-3.5 w-3.5 text-muted-foreground/50 pointer-events-none" />
            </div>
            <span className="text-[8px] text-muted-foreground/70 leading-none">Upload</span>
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Video Panel (Teams-style grid, used inside floating window) ── */

function VideoPanel({
  agentStatus,
  onLeave,
  onCollapse,
  timer,
  teamMembers = [],
  onMicMuteChange,
  micMuted,
  pushToTalk,
  captionsOn,
  onToggleCaptions,
  onDispatchAgent,
  onDetachAgent,
  realtimeSpeaking,
  onAiRingingChange,
  personaName,
  personaVideoPreviewUrl,
  personaSlug,
  agentCameraOff = false,
  onToggleAgentCamera,
}: {
  agentStatus?: string;
  onLeave?: () => void;
  onCollapse: () => void;
  timer: string;
  teamMembers?: { id: string; name: string | null; email: string; avatar_url?: string | null }[];
  onMicMuteChange?: (muted: boolean) => void;
  micMuted?: boolean;
  pushToTalk?: boolean;
  captionsOn?: boolean;
  onToggleCaptions?: () => void;
  onDispatchAgent?: () => void;
  onDetachAgent?: () => void;
  realtimeSpeaking?: boolean;
  onAiRingingChange?: (ringing: boolean) => void;
  personaName: string;
  personaVideoPreviewUrl?: string | null;
  personaSlug?: string | null;
  agentCameraOff?: boolean;
  onToggleAgentCamera?: () => void;
}) {
  const allParticipantsRaw = useParticipants();
  const participants = allParticipantsRaw.filter((p) => !isAgentParticipant(p));
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare], {
    onlySubscribed: false,
  });
  const { localParticipant } = useLocalParticipant();
  const {
    micEnabled,
    camEnabled,
    screenEnabled,
    toggleMic,
    toggleCam,
    toggleScreen,
    applyCameraEffect,
  } = useCallControls(onMicMuteChange);

  // Pen tool for the shared screen: draw ephemeral strokes that everyone sees
  // and the AI composites onto the screenshot it reasons over (Slack-style).
  const { strokes, addStroke, pruneExpired } = useScreenDraw();
  const [drawMode, setDrawMode] = useState(false);

  // Expose a publisher so components outside the LiveKit context (e.g. the
  // global Settings drawer) can fire agent_control packets without needing
  // their own useLocalParticipant() (impossible — they live above the room).
  useEffect(() => {
    setAgentControlPublisher((msg) => {
      try {
        const payload = new TextEncoder().encode(JSON.stringify(msg));
        localParticipant.publishData(payload, { topic: 'agent_control', reliable: true });
      } catch (e) {
        logger.warn('publishAgentControl failed', e);
      }
    });
    return () => setAgentControlPublisher(null);
  }, [localParticipant]);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showBgPicker, setShowBgPicker] = useState(false);
  const [tileBg, setTileBg] = useState(() => {
    try {
      return localStorage.getItem('planr-call-bg') || 'default';
    } catch {
      return 'default';
    }
  });
  const [customBgs, setCustomBgs] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('planr-custom-bgs') || '[]');
    } catch {
      return [];
    }
  });
  const [aiCallPhase, setAiCallPhase] = useState<'idle' | 'ringing' | 'unavailable' | 'joined'>(
    'idle',
  );
  const { video: videoHealth } = useProviderHealth();
  const callBlocked = !videoHealth.available;
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Re-apply saved background when camera turns on (delay to let track initialize).
  // Only fires when there's a non-default background to restore — calling
  // applyCameraEffect with default would otherwise needlessly stopProcessor()
  // on a clean track.
  useEffect(() => {
    if (camEnabled && tileBg !== 'default') {
      const timer = setTimeout(() => applyCameraEffect(tileBg), 500);
      return () => clearTimeout(timer);
    }
  }, [camEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stub: actual `localActive` derived after activeCameraSids is computed
  // further down (declaration-order constraint). The state below is just the
  // sticky-flag plumbing.
  const [localCamEverLive, setLocalCamEverLive] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset sticky flag when camera disabled
    if (!camEnabled) setLocalCamEverLive(false);
  }, [camEnabled]);

  // Persist background selection
  const selectBg = useCallback(
    (bg: string) => {
      setTileBg(bg);
      try {
        localStorage.setItem('planr-call-bg', bg);
      } catch {
        /* quota */
      }
      if (camEnabled) applyCameraEffect(bg);
    },
    [camEnabled, applyCameraEffect],
  );

  // Save custom background (base64, max 5)
  const saveCustomBg = useCallback((dataUrl: string) => {
    setCustomBgs((prev) => {
      const next = [dataUrl, ...prev.filter((u) => u !== dataUrl)].slice(0, 5);
      try {
        localStorage.setItem('planr-custom-bgs', JSON.stringify(next));
      } catch {
        /* quota */
      }
      return next;
    });
  }, []);

  const deleteCustomBg = useCallback(
    (dataUrl: string) => {
      setCustomBgs((prev) => {
        const next = prev.filter((u) => u !== dataUrl);
        try {
          localStorage.setItem('planr-custom-bgs', JSON.stringify(next));
        } catch {
          /* quota */
        }
        return next;
      });
      if (tileBg === dataUrl) selectBg('default');
    },
    [tileBg, selectBg],
  );
  const ringOscRef = useRef<{ stop: () => void } | null>(null);

  // Keep callback ref stable so the effect doesn't reset the timeout on every render
  const onAiRingingChangeRef = useRef(onAiRingingChange);
  useEffect(() => {
    onAiRingingChangeRef.current = onAiRingingChange;
  }, [onAiRingingChange]);

  // Watch agent status to transition from ringing to joined. We wait for
  // "ready" (emitted by the agent worker after the greeting finishes) so the
  // ringtone plays through the whole greeting and the user can't accidentally
  // interrupt it. "connected" alone is not enough — it now means "joined the
  // room but greeting still in progress".
  useEffect(() => {
    if (agentStatus === 'ready' && aiCallPhase === 'ringing') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- state-machine transition driven by external agentStatus
      setAiCallPhase('joined');
      onAiRingingChangeRef.current?.(false);
    }
  }, [agentStatus, aiCallPhase]);

  // Reset to idle once a *joined* agent disconnects (graceful detach, force-detach,
  // or crash). Must not match the "ringing" phase — agentStatus is still
  // "disconnected" while we're waiting for the freshly-dispatched agent to
  // appear, and resetting then would cancel the ringing UI before it ever
  // shows.
  useEffect(() => {
    if (agentStatus === 'disconnected' && aiCallPhase === 'joined') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- state-machine transition driven by external agentStatus
      setAiCallPhase('idle');
      onAiRingingChangeRef.current?.(false);
    }
  }, [agentStatus, aiCallPhase]);

  // Stop ringtone when phase changes away from ringing
  useEffect(() => {
    if (aiCallPhase !== 'ringing' && ringOscRef.current) {
      ringOscRef.current.stop();
      ringOscRef.current = null;
    }
  }, [aiCallPhase]);

  // Stop ringtone on unmount (e.g. leaving call while AI is still ringing)
  useEffect(() => {
    return () => {
      if (ringOscRef.current) {
        ringOscRef.current.stop();
        ringOscRef.current = null;
      }
    };
  }, []);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- React Compiler bails on the WebAudio chime block; manual memoization is intentional
  const inviteAI = useCallback(() => {
    setShowInvite(false);
    setAiCallPhase('ringing');
    onAiRingingChangeRef.current?.(true);

    // Delay dispatch by 3s so the ringing animation plays first,
    // then the agent connects and speaks from the beginning
    const sid = window.location.pathname.match(/sessions\/([^/]+)/)?.[1];
    if (sid) {
      setTimeout(() => {
        fetch('/api/dispatch-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sid }),
        })
          .then((r) => console.log('[Agent] Dispatch:', r.status))
          .catch((e) => console.warn('[Agent] Dispatch failed:', e));
      }, 3000);
    }

    // Synthesise a gentle chime ringtone (FaceTime-style)
    try {
      const ctx = new AudioContext();
      const masterGain = ctx.createGain();
      masterGain.gain.value = 0.1;
      masterGain.connect(ctx.destination);

      let playing = true;
      const playChime = () => {
        if (!playing) return;
        // Three soft ascending notes
        const notes = [523, 659, 784]; // C5, E5, G5 — major chord
        notes.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = freq;
          const noteGain = ctx.createGain();
          noteGain.gain.setValueAtTime(0, ctx.currentTime + i * 0.15);
          noteGain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + i * 0.15 + 0.05);
          noteGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.4);
          osc.connect(noteGain);
          noteGain.connect(masterGain);
          osc.start(ctx.currentTime + i * 0.15);
          osc.stop(ctx.currentTime + i * 0.15 + 0.5);
        });
        setTimeout(() => {
          if (playing) playChime();
        }, 3000);
      };
      playChime();
      ringOscRef.current = {
        stop: () => {
          playing = false;
          ctx.close();
        },
      };
    } catch {
      // Audio not available
    }

    // Timeout after 20s — give the agent enough time to join + finish its
    // greeting (which can run several seconds for long blueprint contexts)
    // before we surface "unavailable".
    setTimeout(() => {
      setAiCallPhase((prev) => {
        if (prev === 'ringing') return 'unavailable';
        return prev;
      });
    }, 20000);
  }, [onDispatchAgent]);

  const screenTracks = tracks.filter((t) => t.source === Track.Source.ScreenShare);
  const cameraTracks = tracks.filter((t) => t.source === Track.Source.Camera);

  // Build a set of participant SIDs that have an active (unmuted, with track) camera
  const activeCameraSids = new Set(
    cameraTracks
      .filter((t) => t.publication?.track && !t.publication?.isMuted)
      .map((t) => t.participant.sid),
  );

  // Drive the localCamEverLive sticky flag from the active set. Once true,
  // it stays true until camEnabled flips back to false (handled above).
  const localActive = activeCameraSids.has(localParticipant?.sid ?? '');
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sticky flag from derived value; setter is stable
    if (localActive) setLocalCamEverLive(true);
  }, [localActive]);

  // Find agent participant to track speaking state (suppress during ringing)
  // Note: search allParticipantsRaw since agents are filtered out of `participants`
  const agentParticipant = allParticipantsRaw.find(isAgentParticipant);
  const agentSpeaking =
    aiCallPhase === 'joined' && ((agentParticipant?.isSpeaking ?? false) || !!realtimeSpeaking);

  // Tavus / avatar plugins publish the lip-synced video as a separate
  // participant in the room. Pick the first camera track whose participant
  // looks like an avatar/agent and isn't muted; fall back to static image.
  const agentCameraTrack = cameraTracks.find(
    (t) => isAgentParticipant(t.participant) && t.publication?.track && !t.publication?.isMuted,
  );
  const showAgentVideo = !agentCameraOff && !!agentCameraTrack;

  // Force the agent's video subscription to HIGH quality. Adaptive stream
  // would otherwise pick a low simulcast layer to fit the small tile, which
  // makes Tavus's avatar look pixelated.
  useEffect(() => {
    const pub = agentCameraTrack?.publication;
    if (pub instanceof RemoteTrackPublication) {
      pub.setVideoQuality(VideoQuality.HIGH);
    }
  }, [agentCameraTrack]);

  // W4.1.5 — read shared raise-hand state so we can render a hand badge on
  // each participant tile. Subscribes to the same data channel as the
  // RaiseHand button (multiple subscribers are fine).
  const { raised: raisedHands } = useRaisedHands();

  // Sort participants: speaking first, exclude agent (shown separately as AI tile)
  const sortedParticipants = [...participants]
    .filter((p) => !isAgentParticipant(p))
    .sort((a, b) => {
      if (a.isSpeaking && !b.isSpeaking) return -1;
      if (!a.isSpeaking && b.isSpeaking) return 1;
      return 0;
    });

  const isSharing = screenTracks.length > 0;
  // Pen is only live while a screen is actually shared (derived, so it can't
  // get stuck "on" mid-render after the share ends — no surface to draw on).
  const drawActive = drawMode && isSharing;
  // Also reset the toggle state so re-sharing doesn't silently resume drawing.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot reset off a derived condition; setter is stable
    if (!isSharing && drawMode) setDrawMode(false);
  }, [isSharing, drawMode]);
  const presenterSids = new Set(screenTracks.map((t) => t.participant.sid));
  const cameraGridClass = `grid gap-2 flex-1 min-h-0 auto-rows-[1fr] ${
    sortedParticipants.length +
      (aiCallPhase === 'ringing' || aiCallPhase === 'unavailable' || aiCallPhase === 'joined'
        ? 1
        : 0) <=
    1
      ? 'grid-cols-1'
      : 'grid-cols-2'
  }`;

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-gradient-to-b from-black/20 to-black/40">
      {/* Video grid — when sharing, screen takes ~75% and cameras compress to a filmstrip */}
      <div
        className={`p-3 flex-1 min-h-0 flex flex-col gap-2 ${isSharing ? '' : 'justify-center'}`}
      >
        {isSharing && (
          <div className="flex-1 min-h-0 flex flex-col gap-2">
            {screenTracks.map((track) => {
              const isLocalShare = track.participant.sid === localParticipant?.sid;
              const presenterName =
                track.participant.name || track.participant.identity || 'Someone';
              return (
                <div
                  key={`screen-${track.participant.sid}`}
                  className="screen-share-tile relative rounded-xl overflow-hidden bg-black ring-2 ring-info/60 flex-1 min-h-0 shadow-xl"
                >
                  <ParticipantTile trackRef={track} />
                  {/* Pen overlay — captures input only in draw mode, otherwise
                      click-through. Renders local + remote strokes; the agent
                      composites them onto what it sends to Claude. */}
                  <ScreenDrawCanvas
                    active={drawActive}
                    strokes={strokes}
                    onStroke={addStroke}
                    pruneExpired={pruneExpired}
                  />
                  {/* Presenter banner — top-center to dodge the VideoTileStatus pill at top-left */}
                  <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-info/95 backdrop-blur rounded-full pl-2.5 pr-3 py-1.5 shadow-lg pointer-events-none">
                    <MonitorUp className="h-3.5 w-3.5 text-foreground" />
                    <span className="text-[12px] text-foreground font-semibold whitespace-nowrap">
                      {isLocalShare ? 'You are sharing' : `${presenterName} is sharing`}
                    </span>
                  </div>
                  {/* Inline Stop button — only the local sharer can stop their share */}
                  {isLocalShare && (
                    <button
                      onClick={toggleScreen}
                      className="absolute top-3 right-3 z-20 flex items-center gap-1.5 bg-destructive/95 hover:bg-red-500 text-foreground text-[12px] font-semibold rounded-full px-3 py-1.5 shadow-lg transition-colors"
                    >
                      <MonitorOff className="h-3.5 w-3.5 pointer-events-none" />
                      Stop sharing
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Participant grid — hidden while screen sharing so the shared screen
            takes the whole panel. Audio still flows via RoomAudioRenderer. */}
        {!isSharing && (
          <div className={cameraGridClass}>
            {sortedParticipants.slice(0, 4).map((p) => {
              const hasActiveCamera = activeCameraSids.has(p.sid);
              const cameraTrack = cameraTracks.find((t) => t.participant.sid === p.sid);
              const avatarUrl = (() => {
                try {
                  return JSON.parse(p.metadata || '{}').avatar_url;
                } catch {
                  return '';
                }
              })();
              const isLocal = p.sid === localParticipant?.sid;
              // Avoid the "?" fallback when name/identity haven't loaded yet —
              // for the local user fall through to "You", otherwise empty so we
              // can render a generic "User" silhouette instead of question marks.
              const name = p.name || p.identity || (isLocal ? 'You' : '');
              const initials = name ? name.slice(0, 2).toUpperCase() : '';
              const isAgent = isAgentParticipant(p);
              // Humans: synchronous read (unchanged behaviour). AI agent: a
              // reactive sub-component (AgentMuteBadge) replaces the static
              // badge below so its mute state stays in sync with the actual
              // track. `isMuted` here is only used for the human path now.
              const isMuted = !isAgent && readMicMuted(p);
              const handIsRaised = raisedHands.has(p.identity);
              const isPresenting = presenterSids.has(p.sid);
              // Camera publication exists but track isn't live yet — show a
              // "starting camera" state ONLY before the first successful live
              // detection. Once the camera was live, transient drops just fall
              // through to the participant tile / avatar (no flicker).
              const camPubForP = p.getTrackPublication(Track.Source.Camera);
              const cameraStarting =
                isLocal &&
                camEnabled &&
                !hasActiveCamera &&
                !localCamEverLive &&
                (!camPubForP?.track || camPubForP?.isMuted);
              return (
                <div
                  key={p.sid}
                  className={`relative rounded-xl overflow-hidden bg-card transition-all duration-500 shadow-lg min-h-0 ${
                    handIsRaised
                      ? 'ring-2 ring-warning/70 shadow-amber-300/15'
                      : isPresenting
                        ? 'ring-2 ring-info/70 shadow-blue-500/15'
                        : p.isSpeaking
                          ? 'ring-2 ring-success/70 shadow-emerald-500/10'
                          : 'ring-1 ring-border/70'
                  }`}
                >
                  {/* "Presenting" badge — second visual anchor for who's sharing.
                    Suppressed when a hand-raise badge already occupies top-left. */}
                  {isPresenting && !handIsRaised && hasActiveCamera && (
                    <div className="absolute top-2 left-2 z-10 flex items-center gap-1 px-2 py-0.5 rounded-full bg-info/95 text-foreground text-[10px] font-semibold shadow-lg">
                      <MonitorUp className="h-2.5 w-2.5 pointer-events-none" />
                      <span>Presenting</span>
                    </div>
                  )}
                  {/* W4.1.5 — for camera-on tiles, the hand badge sits top-left
                    of the tile (no avatar to pair with). For avatar/initials
                    tiles below, a hand bubble is attached to the avatar circle
                    itself, mirroring the mute icon. */}
                  {handIsRaised && hasActiveCamera && (
                    <div
                      aria-label={`${name} has raised their hand`}
                      className="absolute top-2 left-2 z-10 flex items-center gap-1 px-2 py-1 rounded-full bg-warning/95 text-black text-[11px] font-semibold shadow-lg ring-2 ring-warning/30 raise-hand-tile-pulse"
                    >
                      <Hand className="h-3 w-3" />
                      <span>Hand up</span>
                    </div>
                  )}
                  {hasActiveCamera && cameraTrack ? (
                    <>
                      <ParticipantTile trackRef={cameraTrack} />
                      {/* Name overlay on video */}
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent pt-8 pb-2.5 px-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] text-foreground font-medium drop-shadow-lg">
                              {name}
                            </span>
                            {p.isSpeaking && (
                              <div className="flex items-center gap-1">
                                <span className="w-1 h-1 rounded-full bg-success animate-pulse" />
                                <span
                                  className="w-1.5 h-1.5 rounded-full bg-success animate-pulse"
                                  style={{ animationDelay: '0.15s' }}
                                />
                                <span
                                  className="w-1 h-1 rounded-full bg-success animate-pulse"
                                  style={{ animationDelay: '0.3s' }}
                                />
                              </div>
                            )}
                          </div>
                          {isAgent ? (
                            <AgentMuteBadgeOnVideo participant={p} />
                          ) : (
                            isMuted && (
                              <div className="w-6 h-6 rounded-full bg-destructive/90 flex items-center justify-center backdrop-blur-sm">
                                <MicOff className="h-3 w-3 text-foreground pointer-events-none" />
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    </>
                  ) : cameraStarting ? (
                    /* Local user just hit "Video" — show a starting-camera state
                     instead of the avatar fallback so the "?" never flashes
                     while the publish completes. */
                    <div
                      className="w-full h-full flex flex-col items-center justify-center gap-4 relative bg-cover bg-center"
                      style={{ background: getTileBgStyle(tileBg) }}
                    >
                      <div
                        className="relative"
                        style={{ width: 'min(30%, 120px)', aspectRatio: '1' }}
                      >
                        <div className="w-full h-full rounded-full flex items-center justify-center bg-foreground/[0.06] ring-2 ring-success/30 shadow-lg">
                          <LoaderIcon className="h-8 w-8 text-success/80 animate-spin" />
                        </div>
                      </div>
                      <span className="text-[12px] text-muted-foreground">Starting camera…</span>
                    </div>
                  ) : (
                    <div
                      className="w-full h-full flex flex-col items-center justify-center gap-4 relative bg-cover bg-center"
                      style={{ background: getTileBgStyle(tileBg) }}
                    >
                      {avatarUrl ? (
                        <div
                          className="relative"
                          style={{ width: 'min(30%, 120px)', aspectRatio: '1' }}
                        >
                          <img
                            src={avatarUrl}
                            alt={name || 'Participant'}
                            className={`w-full h-full rounded-full object-cover transition-all duration-500 ${
                              handIsRaised
                                ? 'ring-[3px] ring-warning/80 scale-105'
                                : p.isSpeaking
                                  ? 'ring-[3px] ring-success/70 scale-105'
                                  : 'ring-2 ring-white/15'
                            }`}
                          />
                          {/* W4.1.5 — hand-raise indicator paired with mute icon.
                            Top-right so the two badges flank the avatar diagonally. */}
                          {handIsRaised && (
                            <div
                              aria-label={`${name || 'Participant'} has raised their hand`}
                              className="absolute -top-0.5 -right-0.5 w-[34%] min-w-[26px] aspect-square rounded-full bg-amber-300 flex items-center justify-center ring-2 ring-card shadow-lg raise-hand-tile-pulse"
                            >
                              <Hand className="h-[55%] w-[55%] text-black pointer-events-none" />
                            </div>
                          )}
                          {isAgent ? (
                            <AgentMuteBadge
                              participant={p}
                              className="absolute -bottom-0.5 -right-0.5 w-[28%] min-w-[22px] aspect-square rounded-full bg-destructive/90 flex items-center justify-center ring-2 ring-card shadow-lg"
                            />
                          ) : (
                            isMuted && (
                              <div className="absolute -bottom-0.5 -right-0.5 w-[28%] min-w-[22px] aspect-square rounded-full bg-destructive/90 flex items-center justify-center ring-2 ring-card shadow-lg">
                                <MicOff className="h-[55%] w-[55%] text-foreground pointer-events-none" />
                              </div>
                            )
                          )}
                        </div>
                      ) : (
                        <div
                          className="relative"
                          style={{ width: 'min(30%, 120px)', aspectRatio: '1' }}
                        >
                          <div
                            className={`w-full h-full rounded-full flex items-center justify-center text-[clamp(1.2rem,3vw,2.5rem)] font-semibold transition-all duration-500 ${
                              handIsRaised
                                ? 'bg-gradient-to-br from-amber-300/30 to-amber-400/10 text-amber-200 ring-[3px] ring-warning/60 scale-105'
                                : p.isSpeaking
                                  ? 'bg-gradient-to-br from-success/30 to-success/10 text-success ring-[3px] ring-success/60 scale-105'
                                  : 'bg-foreground/[0.08] text-muted-foreground ring-2 ring-white/10'
                            }`}
                          >
                            {/* If we don't have initials yet (name is loading)
                              show a generic user silhouette instead of "?". */}
                            {initials ? (
                              initials
                            ) : (
                              <UserPlus className="h-[40%] w-[40%] text-muted-foreground/80" />
                            )}
                          </div>
                          {handIsRaised && (
                            <div
                              aria-label={`${name || 'Participant'} has raised their hand`}
                              className="absolute -top-0.5 -right-0.5 w-[34%] min-w-[26px] aspect-square rounded-full bg-amber-300 flex items-center justify-center ring-2 ring-card shadow-lg raise-hand-tile-pulse"
                            >
                              <Hand className="h-[55%] w-[55%] text-black pointer-events-none" />
                            </div>
                          )}
                          {isAgent ? (
                            <AgentMuteBadge
                              participant={p}
                              className="absolute -bottom-0.5 -right-0.5 w-[28%] min-w-[22px] aspect-square rounded-full bg-destructive/90 flex items-center justify-center ring-2 ring-card shadow-lg"
                            />
                          ) : (
                            isMuted && (
                              <div className="absolute -bottom-0.5 -right-0.5 w-[28%] min-w-[22px] aspect-square rounded-full bg-destructive/90 flex items-center justify-center ring-2 ring-card shadow-lg">
                                <MicOff className="h-[55%] w-[55%] text-foreground pointer-events-none" />
                              </div>
                            )
                          )}
                        </div>
                      )}
                      <div className="flex flex-col items-center gap-1.5">
                        {name && (
                          <span className="text-sm text-foreground font-medium">{name}</span>
                        )}
                        {p.isSpeaking && (
                          <div className="flex items-center gap-1">
                            <span className="w-1 h-1 rounded-full bg-success animate-pulse" />
                            <span
                              className="w-1.5 h-1.5 rounded-full bg-success animate-pulse"
                              style={{ animationDelay: '0.15s' }}
                            />
                            <span
                              className="w-1 h-1 rounded-full bg-success animate-pulse"
                              style={{ animationDelay: '0.3s' }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* AI / Ringing / Unavailable tile — inside the grid */}
            {aiCallPhase === 'ringing' && (
              <div className="rounded-xl overflow-hidden bg-card ring-1 ring-warning/20 flex flex-col items-center justify-center gap-4 shadow-lg min-h-0">
                <div className="relative" style={{ width: 'min(30%, 120px)', aspectRatio: '1' }}>
                  <div
                    className="absolute inset-0 rounded-full bg-warning/20 animate-ping"
                    style={{ animationDuration: '1.5s' }}
                  />
                  <div className="relative w-full h-full rounded-full bg-warning/20 flex items-center justify-center">
                    <Phone className="h-[40%] w-[40%] text-warning animate-pulse pointer-events-none" />
                  </div>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <span className="text-sm text-muted-foreground font-medium">
                    Calling {personaName}...
                  </span>
                  <button
                    onClick={() => setAiCallPhase('idle')}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-destructive/15 text-destructive hover:bg-destructive/25 text-xs font-medium transition-colors"
                  >
                    <PhoneOff className="h-3.5 w-3.5 pointer-events-none" />
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {aiCallPhase === 'unavailable' && (
              <div className="rounded-xl overflow-hidden bg-card ring-1 ring-destructive/20 flex flex-col items-center justify-center gap-4 shadow-lg min-h-0">
                <div
                  className="rounded-full bg-destructive/10 flex items-center justify-center"
                  style={{ width: 'min(30%, 120px)', aspectRatio: '1' }}
                >
                  <PhoneOff className="h-[40%] w-[40%] text-destructive/50 pointer-events-none" />
                </div>
                <div className="flex flex-col items-center gap-2">
                  <span className="text-sm text-muted-foreground/70 font-medium">
                    {personaName} unavailable
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={inviteAI}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-foreground/[0.08] text-muted-foreground hover:text-foreground text-xs font-medium transition-colors"
                    >
                      <RotateCcw className="h-3 w-3 pointer-events-none" />
                      Retry
                    </button>
                    <button
                      onClick={() => setAiCallPhase('idle')}
                      className="px-4 py-2 rounded-xl text-muted-foreground/40 hover:text-muted-foreground/70 text-xs font-medium transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            )}
            {aiCallPhase === 'joined' &&
              (agentStatus === 'connected' ||
                agentStatus === 'extracting' ||
                agentStatus === 'detaching') && (
                <div
                  className={`group/aitile relative rounded-xl overflow-hidden bg-card shadow-lg min-h-0 transition-all duration-500 ${
                    agentSpeaking
                      ? 'ring-2 ring-success/70 shadow-emerald-500/10'
                      : agentStatus === 'detaching'
                        ? 'ring-1 ring-warning/30 opacity-70'
                        : 'ring-1 ring-border/60'
                  }`}
                >
                  {onToggleAgentCamera && agentStatus !== 'detaching' && (
                    <button
                      onClick={() => {
                        // Publish an immediate LiveKit data packet so the agent
                        // worker stops/starts the Tavus avatar without waiting
                        // for the persistence round-trip.
                        try {
                          const enabled = !!agentCameraOff; // we're turning ON if currently OFF
                          const payload = new TextEncoder().encode(
                            JSON.stringify({ action: 'set_camera', enabled }),
                          );
                          localParticipant.publishData(payload, {
                            topic: 'agent_control',
                            reliable: true,
                          });
                        } catch (e) {
                          logger.warn('publish set_camera failed', e);
                        }
                        onToggleAgentCamera();
                      }}
                      title={agentCameraOff ? 'Turn agent camera on' : 'Turn agent camera off'}
                      aria-label={agentCameraOff ? 'Turn agent camera on' : 'Turn agent camera off'}
                      className="absolute top-2 right-10 z-10 opacity-0 group-hover/aitile:opacity-100 focus:opacity-100 transition-opacity flex items-center justify-center w-7 h-7 rounded-full bg-background/80 backdrop-blur-sm ring-1 ring-border/70 text-muted-foreground hover:text-foreground hover:bg-foreground/[0.12]"
                    >
                      {agentCameraOff ? (
                        <VideoOff className="h-3.5 w-3.5 pointer-events-none" />
                      ) : (
                        <Video className="h-3.5 w-3.5 pointer-events-none" />
                      )}
                    </button>
                  )}
                  {onDetachAgent && agentStatus !== 'detaching' && (
                    <button
                      onClick={onDetachAgent}
                      title="Detach AI from call"
                      aria-label="Detach AI from call"
                      className="absolute top-2 right-2 z-10 opacity-0 group-hover/aitile:opacity-100 focus:opacity-100 transition-opacity flex items-center justify-center w-7 h-7 rounded-full bg-background/80 backdrop-blur-sm ring-1 ring-border/70 text-muted-foreground hover:text-foreground hover:bg-destructive/30 hover:ring-destructive/40"
                    >
                      <X className="h-3.5 w-3.5 pointer-events-none" />
                    </button>
                  )}
                  {agentStatus === 'detaching' && (
                    <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 px-2 py-1 rounded-full bg-background/80 backdrop-blur-sm ring-1 ring-warning/30">
                      <LoaderIcon className="h-3 w-3 text-warning animate-spin" />
                      <span className="text-[10px] text-warning font-medium">Leaving</span>
                    </div>
                  )}
                  {showAgentVideo && agentCameraTrack ? (
                    <>
                      {/* Fill the entire tile — same layout as a human participant's
                    camera tile so the agent's video gets the full available area
                    and matches Omar's tile in size & quality. */}
                      <ParticipantTile trackRef={agentCameraTrack} />
                      {/* Name overlay matching the human-participant tiles */}
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent pt-8 pb-2.5 px-3 pointer-events-none">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] text-foreground font-medium drop-shadow-lg">
                            {personaName}
                          </span>
                          {agentSpeaking && (
                            <div className="flex items-center gap-1">
                              <span className="w-1 h-1 rounded-full bg-success animate-pulse" />
                              <span
                                className="w-1.5 h-1.5 rounded-full bg-success animate-pulse"
                                style={{ animationDelay: '0.15s' }}
                              />
                              <span
                                className="w-1 h-1 rounded-full bg-success animate-pulse"
                                style={{ animationDelay: '0.3s' }}
                              />
                            </div>
                          )}
                          {agentStatus === 'detaching' && (
                            <span className="text-[11px] text-warning">Leaving…</span>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-4">
                      <div
                        className={`rounded-full overflow-hidden flex items-center justify-center transition-all duration-500 ${
                          agentStatus === 'extracting'
                            ? 'ring-2 ring-info/30 animate-pulse'
                            : agentStatus === 'detaching'
                              ? 'ring-2 ring-warning/30 animate-pulse'
                              : agentSpeaking
                                ? 'ring-[3px] ring-success/60 scale-105 shadow-[0_0_20px_rgba(52,211,153,0.2)]'
                                : 'ring-2 ring-white/10'
                        }`}
                        style={{ width: 'min(30%, 120px)', aspectRatio: '1' }}
                      >
                        <PersonaThumbnail
                          videoPreviewUrl={personaVideoPreviewUrl}
                          slug={personaSlug}
                          alt={personaName}
                          expandable
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex flex-col items-center gap-1.5">
                        <span className="text-sm text-muted-foreground/70">{personaName}</span>
                        {agentStatus === 'detaching' && (
                          <span className="text-[11px] text-warning">Leaving…</span>
                        )}
                        {agentSpeaking && (
                          <div className="flex items-center gap-1">
                            <span className="w-1 h-1 rounded-full bg-success animate-pulse" />
                            <span
                              className="w-1.5 h-1.5 rounded-full bg-success animate-pulse"
                              style={{ animationDelay: '0.15s' }}
                            />
                            <span
                              className="w-1 h-1 rounded-full bg-success animate-pulse"
                              style={{ animationDelay: '0.3s' }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
          </div>
        )}
      </div>

      {/* Participant list (expandable) */}
      {showParticipants && (
        <div className="border-t border-border/60 px-3 py-2 shrink-0 max-h-[200px] overflow-auto">
          <div className="space-y-1">
            {participants.map((p) => {
              const avatarUrl = (() => {
                try {
                  return JSON.parse(p.metadata || '{}').avatar_url;
                } catch {
                  return '';
                }
              })();
              const name = p.name || p.identity || 'Unknown';
              const micTrack = p.getTrackPublication(Track.Source.Microphone);
              const isMuted = !micTrack || micTrack.isMuted;
              return (
                <div
                  key={p.sid}
                  className="flex items-center gap-2.5 py-1.5 px-1 rounded-lg hover:bg-foreground/[0.05]"
                >
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-medium overflow-hidden shrink-0 ${
                      p.isSpeaking ? 'ring-2 ring-success/60' : 'ring-1 ring-white/10'
                    }`}
                  >
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div
                        className={`w-full h-full flex items-center justify-center ${
                          p.isSpeaking
                            ? 'bg-success/25 text-success'
                            : 'bg-foreground/[0.10] text-muted-foreground'
                        }`}
                      >
                        {name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] text-foreground/80 font-medium truncate block">
                      {name}
                    </span>
                    {p.isSpeaking && <span className="text-[9px] text-success">Speaking</span>}
                  </div>
                  {isMuted && <MicOff className="h-3 w-3 text-muted-foreground/30 shrink-0" />}
                </div>
              );
            })}
            {/* AI Facilitator — only when invited */}
            {aiCallPhase === 'joined' &&
              (agentStatus === 'connected' ||
                agentStatus === 'extracting' ||
                agentStatus === 'detaching') && (
                <div className="group flex items-center gap-2.5 py-1.5 px-1 rounded-lg hover:bg-foreground/[0.04]">
                  <PersonaThumbnail
                    videoPreviewUrl={personaVideoPreviewUrl}
                    slug={personaSlug}
                    alt={personaName}
                    expandable
                    className={`w-7 h-7 rounded-full object-cover shrink-0 ${
                      agentStatus === 'extracting'
                        ? 'ring-1 ring-info/30 animate-pulse'
                        : agentStatus === 'detaching'
                          ? 'ring-1 ring-warning/30 animate-pulse opacity-60'
                          : 'ring-1 ring-white/10'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] text-foreground/80 font-medium">
                      {personaName}
                    </span>
                    {agentStatus === 'extracting' && (
                      <span className="text-[9px] text-info block">Updating blueprint...</span>
                    )}
                    {agentStatus === 'detaching' && (
                      <span className="text-[9px] text-warning block">Leaving…</span>
                    )}
                  </div>
                  {onDetachAgent && agentStatus !== 'detaching' && (
                    <button
                      onClick={onDetachAgent}
                      title="Detach AI from call"
                      aria-label="Detach AI from call"
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-1 rounded-full hover:bg-foreground/[0.08] text-muted-foreground/70 hover:text-foreground/90 shrink-0"
                    >
                      <X className="h-3 w-3 pointer-events-none" />
                    </button>
                  )}
                  {agentStatus === 'detaching' && (
                    <LoaderIcon className="h-3 w-3 text-warning animate-spin shrink-0" />
                  )}
                </div>
              )}
          </div>
        </div>
      )}

      {/* Controls bar */}
      <div className="flex flex-col gap-3 px-4 py-4 border-t border-border/70 bg-background/40 shrink-0">
        {/* Timer + participants row */}
        <div className="flex items-center justify-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-foreground/[0.05]">
            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
            <span className="text-xs font-body tabular-nums text-muted-foreground font-medium">
              {timer}
            </span>
          </div>
          <button
            onClick={() => setShowParticipants((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium transition-all duration-200 ${
              showParticipants
                ? 'bg-white/12 text-foreground/90'
                : 'bg-foreground/[0.05] text-muted-foreground/70 hover:bg-foreground/[0.08] hover:text-muted-foreground'
            }`}
          >
            <UserPlus className="h-3 w-3 pointer-events-none" />
            {participants.length +
              (aiCallPhase === 'joined' &&
              (agentStatus === 'connected' ||
                agentStatus === 'extracting' ||
                agentStatus === 'detaching')
                ? 1
                : 0)}
          </button>
          {aiCallPhase !== 'joined' &&
            agentStatus !== 'connected' &&
            agentStatus !== 'ready' &&
            agentStatus !== 'extracting' &&
            agentStatus !== 'detaching' && (
              <button
                onClick={() => {
                  if ((aiCallPhase === 'idle' || aiCallPhase === 'unavailable') && !callBlocked)
                    inviteAI();
                }}
                disabled={aiCallPhase === 'ringing' || callBlocked}
                title={
                  callBlocked
                    ? `AI agent paused: ${videoHealth.message ?? 'an upstream provider is unavailable.'}`
                    : undefined
                }
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
                  aiCallPhase === 'ringing'
                    ? 'bg-warning/15 text-warning ring-1 ring-warning/40 cursor-default'
                    : aiCallPhase === 'unavailable'
                      ? 'bg-foreground/[0.05] text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground/80'
                      : 'bg-success/15 text-success ring-1 ring-success/30 hover:bg-success/25 hover:text-success'
                }`}
              >
                <Phone
                  className={`h-3 w-3 pointer-events-none ${aiCallPhase === 'ringing' ? 'animate-pulse' : ''}`}
                />
                {callBlocked
                  ? 'AI paused'
                  : aiCallPhase === 'ringing'
                    ? 'Ringing…'
                    : aiCallPhase === 'unavailable'
                      ? 'Retry AI'
                      : 'Call AI'}
              </button>
            )}
        </div>

        {/* Controls row */}
        <div className="flex items-center justify-center gap-2.5">
          <CtrlBtn onClick={toggleMic} active={micEnabled} label={micEnabled ? 'Mute' : 'Unmute'}>
            {micEnabled ? (
              <Mic className="h-5 w-5 pointer-events-none" />
            ) : (
              <MicOff className="h-5 w-5 pointer-events-none" />
            )}
          </CtrlBtn>
          <CtrlBtn
            onClick={toggleCam}
            active={camEnabled}
            label={camEnabled ? 'Stop Video' : 'Video'}
          >
            {camEnabled ? (
              <Video className="h-5 w-5 pointer-events-none" />
            ) : (
              <VideoOff className="h-5 w-5 pointer-events-none" />
            )}
          </CtrlBtn>
          <CtrlBtn
            onClick={toggleScreen}
            active={screenEnabled}
            danger={screenEnabled}
            label={screenEnabled ? 'Stop Share' : 'Share'}
          >
            {screenEnabled ? (
              <MonitorOff className="h-5 w-5 pointer-events-none" />
            ) : (
              <MonitorUp className="h-5 w-5 pointer-events-none" />
            )}
          </CtrlBtn>
          {isSharing && (
            <CtrlBtn
              onClick={() => setDrawMode((v) => !v)}
              active={drawMode}
              label={drawMode ? 'Stop drawing' : 'Draw on screen'}
            >
              <Pencil className="h-5 w-5 pointer-events-none" />
            </CtrlBtn>
          )}
          <MoreMenu
            showBgPicker={showBgPicker}
            setShowBgPicker={setShowBgPicker}
            tileBg={tileBg}
            selectBg={selectBg}
            camEnabled={camEnabled}
            showInvite={showInvite}
            setShowInvite={setShowInvite}
            inviteAI={inviteAI}
            agentStatus={agentStatus}
            aiCallPhase={aiCallPhase}
            fileInputRef={fileInputRef}
            customBgs={customBgs}
            saveCustomBg={saveCustomBg}
            deleteCustomBg={deleteCustomBg}
            teamMembers={teamMembers}
            personaName={personaName}
            personaVideoPreviewUrl={personaVideoPreviewUrl}
            personaSlug={personaSlug ?? ''}
            micMuted={micMuted}
            onToggleMic={onMicMuteChange ? () => onMicMuteChange(!micMuted) : undefined}
            pushToTalk={pushToTalk}
            captionsOn={captionsOn}
            onToggleCaptions={onToggleCaptions}
          />
          <CtrlBtn onClick={() => onLeave?.()} danger label="Leave">
            <PhoneOff className="h-5 w-5 pointer-events-none" />
          </CtrlBtn>
        </div>
      </div>
    </div>
  );
}

/* ── Live transcript wrapper with auto-scroll ──────────────────────── */
