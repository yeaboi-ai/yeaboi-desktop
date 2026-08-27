/** Spoken (voice-call STT or AI voice agent) vs typed (text chat).
 *  Used by the transcript pane in the recap to render inline medium icons
 *  and to power the Spoken / Typed filter chips. */
export type TranscriptMedium = "spoken" | "typed";

/** Map a backend `message_type` to a high-level medium.
 *  Returns null for system markers and unknown types — they bypass the
 *  medium filter and don't render an inline icon. */
export function mediumOf(messageType: string | undefined | null): TranscriptMedium | null {
  switch (messageType) {
    case "voice_chat":
    case "voice_ai":
      return "spoken";
    case "chat":
    case "ai":
      return "typed";
    default:
      return null;
  }
}
