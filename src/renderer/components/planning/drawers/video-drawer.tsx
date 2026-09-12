'use client';

// The call beside the plan: who is in the room, join and leave, the
// microphone and captions, the facilitator's status and the recordings. The
// vendored row the call hangs off is made the first time this opens.

import { useEffect } from 'react';
import { Mic, MicOff, Captions, CaptionsOff } from 'lucide-react';
import { ParticipantList } from '@/components/session/participant-list';
import { RecordingsList } from '@/components/session/recordings-list';
import { Button } from '@/components/ui/button';
import type { UseRoomLinkResult } from '@/hooks/planning/use-room-link';
import type { RoomVoice } from '@/hooks/planning/use-room-voice';
import { personaName } from '@/lib/planning/voice';
import { cn } from '@/lib/utils';

function agentLine(status: string | null, inRoom: boolean, name: string): string {
  if (inRoom) return `${name} is in the call.`;
  if (status === 'connecting') return `${name} is joining.`;
  return `${name} joins when you do.`;
}

export function VideoDrawer({ link, voice }: { link: UseRoomLinkResult; voice: RoomVoice }) {
  const { call, vendoredId } = voice;
  const persona = personaName(
    (link.session?.ai_config as Record<string, unknown> | undefined)?.['persona'] as string,
  );

  // The row, then its participants — the list route trims them.
  useEffect(() => {
    if (!vendoredId) {
      void link.ensure();
      return;
    }
    void voice.refreshSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendoredId]);

  if (link.error) {
    return <p className="text-[13px] text-muted-foreground">{link.error}</p>;
  }
  if (!vendoredId) {
    return <p className="text-[13px] text-muted-foreground">Opening the room…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {call.inCall ? (
          <Button variant="outline" size="sm" onClick={voice.endCall}>
            Leave{' '}
            {call.timer && (
              <span className="ml-1 tabular-nums text-muted-foreground">{call.timer}</span>
            )}
          </Button>
        ) : (
          <Button size="sm" onClick={() => void voice.startCall()} disabled={voice.joining}>
            {voice.joining ? 'Joining…' : 'Join the call'}
          </Button>
        )}
        {call.inCall && (
          <>
            <button
              type="button"
              onClick={() => call.setMicMuted(!call.micMuted)}
              aria-pressed={call.micMuted}
              className={cn(
                'flex items-center gap-1.5 rounded-md border border-border/60 px-2 py-1 text-[12px]',
                call.micMuted ? 'text-warning' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {call.micMuted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              {call.micMuted ? 'Muted' : 'Mic on'}
            </button>
            <button
              type="button"
              onClick={call.toggleCaptions}
              aria-pressed={call.captionsOn}
              className="flex items-center gap-1.5 rounded-md border border-border/60 px-2 py-1 text-[12px] text-muted-foreground hover:text-foreground"
            >
              {call.captionsOn ? (
                <Captions className="h-3.5 w-3.5" />
              ) : (
                <CaptionsOff className="h-3.5 w-3.5" />
              )}
              Captions
            </button>
          </>
        )}
      </div>
      {call.error && <p className="text-[12px] text-destructive">{call.error}</p>}

      <p className="text-[13px] text-muted-foreground">
        {agentLine(call.agentStatus, call.agentInCall, persona)}
        {call.inCall && (
          <>
            {' '}
            <button
              type="button"
              onClick={() => void (call.agentInCall ? call.detachAgent() : call.dispatchAgent())}
              className="text-primary hover:underline"
            >
              {call.agentInCall ? 'Ask them to leave' : 'Call them in'}
            </button>
          </>
        )}
      </p>

      <section className="space-y-2">
        <p className="font-display text-[15px] italic text-foreground">In the room</p>
        <ParticipantList
          participants={voice.participants}
          connected={voice.socket.connected}
          transcriptEntries={voice.agentEntries}
        />
      </section>

      <section className="space-y-2">
        <p className="font-display text-[15px] italic text-foreground">Recordings</p>
        <RecordingsList sessionId={vendoredId} layout="strip" />
      </section>
    </div>
  );
}
