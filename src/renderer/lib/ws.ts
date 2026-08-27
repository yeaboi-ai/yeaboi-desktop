export type WsEvent = {
  type: string;
  payload?: Record<string, unknown>;
  timestamp?: string;
  [key: string]: unknown;
};

export function createSessionWs(sessionId: string, token: string): WebSocket {
  let host = process.env.NEXT_PUBLIC_WS_URL;
  if (!host) {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (apiUrl) {
      host = apiUrl.replace(/^http/, "ws");
    } else if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
      // Production fallback: derive from API rewrite target
      host = `wss://${window.location.hostname.replace("planning-platform-zeta.vercel.app", "planning-platform-production.up.railway.app")}`;
      // If hostname didn't match, use the known backend
      if (host.includes("vercel.app")) {
        host = "wss://planning-platform-production.up.railway.app";
      }
    } else {
      host = "ws://localhost:8000";
    }
  }
  return new WebSocket(`${host}/ws/session/${sessionId}?token=${encodeURIComponent(token)}`);
}
