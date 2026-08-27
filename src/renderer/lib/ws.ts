// Session WebSocket. The host comes from the preload bridge (main process
// config) rather than NEXT_PUBLIC_* env; callers pass the wsUrl they got
// from getAuth() so every (re)connect carries a token minted moments ago.

export type WsEvent = {
  type: string;
  payload?: Record<string, unknown>;
  timestamp?: string;
  [key: string]: unknown;
};

export function createSessionWs(sessionId: string, token: string, wsUrl: string): WebSocket {
  return new WebSocket(`${wsUrl}/ws/session/${sessionId}?token=${encodeURIComponent(token)}`);
}
