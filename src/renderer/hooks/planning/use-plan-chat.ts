'use client';

// The room's conversation: the session view read on mount, every turn folded
// through the reducer, the steps the engine takes on its own asked for as
// soon as it parks on one, the plan re-read when a section changes. Slash
// input never reaches the model — it is parsed here into a local action or a
// literal the intake node consumes.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  actionTaken,
  attach,
  beginTurn,
  endTurn,
  fromView,
  planRead,
  quickReplies,
  reduceLine,
  type RoomState,
  emptyRoom,
} from '@/lib/planning/chat-reducer';
import { openingWithChips, takeOpening } from '@/lib/planning/composer';
import type { PlanView } from '@/lib/planning/plan-view';
import {
  advanceTurn,
  attachImage,
  cancelTurn,
  loadChat,
  loadPlanView,
  sendTurn,
  switchSize,
  updateChat,
  type ChatLine,
  type SessionView,
} from '@/lib/yeaboi/chat';
import { parseCommand, unknownCommandNotice } from '@/lib/yeaboi/commands';
import { openShortcuts } from '@/lib/yeaboi/palette';
import { toBase64 } from '@/lib/yeaboi/voice';
import { logger } from '@/lib/logger';

/** Something the room should do that a turn asked for. */
export type RoomWant = { kind: 'export' } | { kind: 'sync'; tracker: string } | null;

export interface PlanChat {
  room: RoomState;
  view: SessionView | null;
  plan: PlanView | null;
  loadError: string;
  draft: string;
  setDraft: (next: string) => void;
  /** A composer line: a command runs locally, anything else is a turn. */
  submit: (line: string) => Promise<void>;
  send: (text: string, options?: { synthetic?: boolean }) => Promise<void>;
  cancel: () => Promise<void>;
  paste: (event: React.ClipboardEvent<HTMLTextAreaElement>) => Promise<void>;
  reloadPlan: () => Promise<void>;
  rename: (title: string) => Promise<void>;
  questionsOpen: boolean;
  setQuestionsOpen: (open: boolean) => void;
  want: RoomWant;
  clearWant: () => void;
  replies: { label: string; text: string }[];
  patchView: (patch: Partial<SessionView>) => void;
}

export function usePlanChat(sessionId: string): PlanChat {
  const [room, setRoom] = useState<RoomState>(emptyRoom);
  const [view, setView] = useState<SessionView | null>(null);
  const [plan, setPlan] = useState<PlanView | null>(null);
  const [loadError, setLoadError] = useState('');
  const [draft, setDraft] = useState('');
  const [questionsOpen, setQuestionsOpen] = useState(false);
  const [want, setWant] = useState<RoomWant>(null);
  // The reducer's latest state, for decisions taken after a stream ends.
  const latest = useRef(room);
  latest.current = room;

  const reloadPlan = useCallback(async () => {
    try {
      setPlan(await loadPlanView(sessionId));
    } catch (e) {
      logger.warn('plan view not read', { sessionId, error: (e as Error).message });
    }
    setRoom((state) => planRead(state));
  }, [sessionId]);

  const stream = useCallback(
    async (text: string, start: (onLine: (line: ChatLine) => void) => Promise<void>) => {
      setRoom((state) => beginTurn(state, text));
      try {
        await start((line) => setRoom((state) => reduceLine(state, line)));
      } catch (e) {
        const message = (e as Error).message;
        setRoom((state) => ({ ...state, error: message }));
      }
      setRoom((state) => endTurn(state));
      // The question view (choices, the phase) follows the state the turn
      // just produced, so it is re-read rather than guessed.
      loadChat(sessionId).then(
        (next) => {
          setView(next);
          setRoom((state) => ({ ...state, question: next.question ?? null }));
        },
        () => undefined,
      );
    },
    [sessionId],
  );

  const send = useCallback(
    async (text: string, { synthetic = false }: { synthetic?: boolean } = {}) => {
      if (latest.current.busy) return;
      const images = latest.current.attachments;
      if (!text.trim() && !images.length && !synthetic) return;
      setDraft('');
      await stream(text, (onLine) => sendTurn(sessionId, text, onLine, images));
    },
    [sessionId, stream],
  );

  const advance = useCallback(async () => {
    if (latest.current.busy) return;
    await stream('', (onLine) => advanceTurn(sessionId, onLine));
  }, [sessionId, stream]);

  useEffect(() => {
    let live = true;
    loadChat(sessionId).then(
      (loaded) => {
        if (!live) return;
        setView(loaded);
        setRoom(fromView(loaded));
        void reloadPlan();
        // A plan opened from the composer still owes its first turn: the
        // description has to reach the graph or the intake has nothing to
        // plan. The screenshots kept aside for it travel with it.
        if (loaded.opening) {
          const images = takeOpening(sessionId);
          if (images) setRoom((state) => images.paths.reduce(attach, state));
          void send(openingWithChips(loaded.opening, images));
        }
      },
      (e: Error) => live && setLoadError(e.message),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // The stages the conversation cannot leave on its own are asked for as
  // soon as it parks on one, the way the terminal's loop does.
  useEffect(() => {
    if (!room.busy && room.needsAdvance && !room.error) void advance();
  }, [room.busy, room.needsAdvance, room.error, advance]);

  useEffect(() => {
    if (!room.busy && room.planDirty) void reloadPlan();
  }, [room.busy, room.planDirty, reloadPlan]);

  useEffect(() => {
    if (!room.action) return;
    if (room.action.name === 'sync') setWant({ kind: 'sync', tracker: room.action.tracker });
    setRoom((state) => actionTaken(state));
  }, [room.action]);

  const cancel = useCallback(async () => {
    if (latest.current.opId) await cancelTurn(latest.current.opId).catch(() => undefined);
  }, []);

  const notice = (text: string) => setRoom((state) => ({ ...state, notice: text }));

  async function size(mode: 'small_project' | 'smart') {
    const label = mode === 'small_project' ? 'Small' : 'Large';
    try {
      const result = await switchSize(sessionId, mode);
      if (!result.changed) {
        notice(`Already planning ${label}.`);
        return;
      }
      notice(`Switched to ${label}, your answers kept.`);
      // The switch reopens the intake for the new mode, so one empty turn
      // gets the first question for it.
      if (result.reopened) await send('', { synthetic: true });
    } catch (e) {
      notice((e as Error).message);
    }
  }

  const submit = useCallback(
    async (line: string) => {
      const intent = parseCommand(line);
      if (!intent) return send(line);
      setDraft('');
      notice('');
      switch (intent.kind) {
        case 'shortcuts':
          return openShortcuts();
        case 'export':
          setWant({ kind: 'export' });
          return;
        case 'questions':
          setQuestionsOpen(true);
          return;
        case 'summary':
          setRoom((state) => ({
            ...state,
            bubbles: [...state.bubbles, { role: 'card', text: '', kind: 'intake_summary' }],
          }));
          return;
        case 'size':
          return size(intent.mode);
        case 'send':
          return send(intent.text);
        default:
          notice(unknownCommandNotice(intent.name));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [send, sessionId],
  );

  const paste = useCallback(
    async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const file = Array.from(event.clipboardData?.items ?? [])
        .find((item) => item.kind === 'file' && item.type.startsWith('image/'))
        ?.getAsFile();
      if (!file) return; // ordinary text — let the browser paste it
      event.preventDefault();
      notice('Pasting image…');
      try {
        const encoded = await toBase64(file);
        const index = latest.current.attachments.length + 1;
        const { path, chip } = await attachImage(sessionId, encoded, file.type, index);
        setRoom((state) => attach(state, path));
        setDraft((prior) => (prior ? `${prior} ${chip}` : chip));
        notice('');
      } catch (e) {
        notice((e as Error).message);
      }
    },
    [sessionId],
  );

  const rename = useCallback(
    async (title: string) => {
      const saved = await updateChat(sessionId, { title });
      setView((prior) => (prior ? { ...prior, title: saved.title } : prior));
    },
    [sessionId],
  );

  const patchView = useCallback((patch: Partial<SessionView>) => {
    setView((prior) => (prior ? { ...prior, ...patch } : prior));
  }, []);

  const replies = [
    ...quickReplies(room.awaiting),
    ...(!room.awaiting && room.question?.choices
      ? room.question.choices.map(([label]) => ({ label, text: label }))
      : []),
  ];

  return {
    room,
    view,
    plan,
    loadError,
    draft,
    setDraft,
    submit,
    send,
    cancel,
    paste,
    reloadPlan,
    rename,
    questionsOpen,
    setQuestionsOpen,
    want,
    clearWant: () => setWant(null),
    replies,
    patchView,
  };
}
