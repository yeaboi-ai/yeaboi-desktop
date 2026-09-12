'use client';

// The facilitator's voice settings for this plan. They live on the vendored
// row the call hangs off, so until a call has made one the dials are shown
// but say so.

import { AISettingsBody } from '@/components/session/ai-settings-body';
import type { UseRoomLinkResult } from '@/hooks/planning/use-room-link';
import type { RoomVoice } from '@/hooks/planning/use-room-voice';
import { VOICE_WAITING_LINE, voiceConfigOf } from '@/lib/planning/voice';

export function SettingsDrawer({ link, voice }: { link: UseRoomLinkResult; voice: RoomVoice }) {
  const ready = Boolean(voice.vendoredId && link.session);
  const config = voiceConfigOf(link.session?.ai_config as Record<string, unknown> | undefined);
  return (
    <div className="space-y-4">
      {!ready && <p className="text-[13px] text-muted-foreground">{VOICE_WAITING_LINE}</p>}
      <AISettingsBody
        config={config}
        onChange={(patch) => void voice.patchAiConfig(patch)}
        disabled={!ready}
      />
    </div>
  );
}
