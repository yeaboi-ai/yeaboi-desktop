// The link between a plan (the engine's chat session) and the vendored
// backend's session row that the call, the recordings and the board hang off.
// The row is made lazily, the first time one of them is needed, and found
// again by the engine id it carries.

import { sessionIdOf, type SessionView } from '@/lib/yeaboi/chat';

export interface LinkedSession {
  id: string;
  yeaboi_session_id?: string | null;
}

/** The row to create, named after the plan. */
export function linkBody(
  chatId: string,
  title: string,
  description: string,
): { name: string; description: string; yeaboi_session_id: string } {
  return {
    name: title.trim() || 'Plan',
    description: description.trim(),
    yeaboi_session_id: chatId,
  };
}

/** What the plan is about, for the row's description: the description still
 *  waiting to be sent, else the first thing the reader said. */
export function describedBy(view: Pick<SessionView, 'opening' | 'transcript'> | null): string {
  if (!view) return '';
  if (view.opening.trim()) return view.opening.trim();
  const first = view.transcript.find((line) => line.type === 'user');
  return first && first.type === 'user' ? first.text.trim() : '';
}

/** The name and description a room row is made with. */
export function linkNaming(view: SessionView | null): { title: string; description: string } {
  return { title: view?.title ?? '', description: describedBy(view) };
}

export { sessionIdOf };

/** The list query that finds the row for a plan. */
export function linkQuery(chatId: string): string {
  return `/api/sessions?yeaboi_session_id=${encodeURIComponent(chatId)}`;
}

/** The row linked to a plan, when the list holds one — an older backend
 *  ignores the filter, so the id is checked rather than trusted. */
export function pickLinked(rows: readonly LinkedSession[], chatId: string): LinkedSession | null {
  return rows.find((row) => row.yeaboi_session_id === chatId) ?? null;
}
