/**
 * Cross-component bridge for sending agent_control packets to the LiveKit
 * worker. The actual `localParticipant.publishData(...)` call only works from
 * inside <LiveKitRoom>, but several places outside that subtree (e.g. the
 * Settings drawer) need to nudge the worker. ChatDrawer registers a publisher
 * once the room connects; everything else calls publishAgentControl().
 *
 * Used for:
 *   - { action: "set_camera", enabled }     — toggle Tavus avatar publishing
 *   - { action: "swap_avatar" }             — rebuild Tavus session after the
 *                                             user picks a new character
 *   - { action: "detach", say_goodbye? }    — graceful agent leave
 */

type AgentControlMessage =
  | { action: 'set_camera'; enabled: boolean }
  | { action: 'swap_avatar' }
  | { action: 'detach'; say_goodbye?: boolean };

type Publisher = (msg: AgentControlMessage) => void;

let publisher: Publisher | null = null;

export function setAgentControlPublisher(fn: Publisher | null): void {
  publisher = fn;
}

export function publishAgentControl(msg: AgentControlMessage): boolean {
  if (!publisher) return false;
  try {
    publisher(msg);
    return true;
  } catch {
    return false;
  }
}
