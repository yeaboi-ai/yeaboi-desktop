'use client';

// The planning interview, running in Niko's bar.
//
// The script is in `lib/yeaboi/planning-interview`; this is the part that has
// to touch the world — opening the bar, calling the backend for a name and a
// project, and putting each turn in front of you. The split is the point: what
// Niko asks is a table of cases, and only the answers cost a request.

import { useCallback, useEffect, useRef, useState } from 'react';

import { useNikoContext } from '@/components/niko/niko-provider';
import { useAuthFetch } from '@/hooks/use-auth-fetch';
import {
  type Effect,
  type Interview,
  advance,
  resolve,
  running,
  start,
  takesTyping,
  turnFor,
} from '@/lib/yeaboi/planning-interview';

/** How long after the page settles Niko speaks up. Long enough to read the
 *  screen first, short enough that it is an arrival rather than an interruption. */
const SETTLE_MS = 1200;

/** Remembered for the session, not on disk: dismissing it means "not this
 *  time", and a page that never offers again is a feature nobody can find. */
let dismissed = false;

interface Options {
  /** A project already in progress, offered as a way out of starting another. */
  carryOn?: { id: string; title: string } | undefined;
  /** Nothing to carry on from until the page has read its own rows. */
  ready: boolean;
  /** Where an answer sends you. */
  onOpen: (id: string) => void;
  /** A project the interview created, so the page can show it without a reload. */
  onCreated: () => void;
}

export function usePlanningInterview({ carryOn, ready, onOpen, onCreated }: Options) {
  // Pulled apart rather than held whole: the context is a fresh object every
  // render, and an effect that depends on it never settles — the opening timer
  // was cleared and set again forever, so Niko never spoke.
  const { setIsOpen, pushLocal, replaceLocal, clearLocal, setBubbleAnswer, setTypedAnswer } =
    useNikoContext();
  const { authFetch } = useAuthFetch();
  const [state, setState] = useState<Interview | null>(null);
  /** The last turn pushed, so leaving the page can clear what it left. */
  const turnId = useRef<string | null>(null);
  /** A "working on it" turn, which the turn it was working towards replaces. */
  const workingId = useRef<string | null>(null);
  /** Everything the effects need, without re-registering the answer handler on
   *  every render of the page that owns it. */
  const latest = useRef({ state, onOpen, onCreated });
  latest.current = { state, onOpen, onCreated };
  const carry = useRef(carryOn);
  carry.current = carryOn;

  const show = useCallback(
    (next: Interview) => {
      const turn = turnFor(next);
      const message = {
        role: 'assistant' as const,
        content: turn.say,
        ...(turn.bubble ? { bubble: turn.bubble } : {}),
      };
      // A note saying what is happening is not a turn in the conversation —
      // what it was waiting for takes its place rather than following it.
      const working = turn.bubble?.kind === 'working';
      if (!working && workingId.current) {
        replaceLocal(workingId.current, message);
        turnId.current = workingId.current;
        workingId.current = null;
        return;
      }
      const id = pushLocal(message);
      turnId.current = id;
      if (working) workingId.current = id;
    },
    [pushLocal, replaceLocal],
  );

  /** Carry out what a step asked for, then show where that left the interview. */
  const perform = useCallback(
    async (next: Interview, effect: Effect) => {
      setState(next);
      show(next);
      switch (effect.do) {
        case 'none':
          return;
        case 'close':
          dismissed = true;
          setIsOpen(false);
          return;
        case 'open':
          dismissed = true;
          latest.current.onOpen(effect.id);
          return;
        case 'attach': {
          const files = await pickFiles();
          if (!files.length) return;
          const failed = await attach(authFetch, effect.id, files);
          pushLocal({
            role: 'assistant',
            content: failed.length
              ? `Couldn't attach ${failed.join(', ')}.`
              : `Attached ${files.length === 1 ? 'it' : `all ${files.length}`}.`,
          });
          return;
        }
        case 'name': {
          const named = await suggestName(authFetch, effect.description, next.name);
          const after = resolve(next, named);
          setState(after);
          show(after);
          return;
        }
        case 'create': {
          const created = await createProject(authFetch, effect.description, effect.name);
          const after = resolve(next, created);
          setState(after);
          show(after);
          if ('created' in created) latest.current.onCreated();
          return;
        }
      }
    },
    [show, authFetch, setIsOpen, pushLocal],
  );

  // The opening. Cancelled by anything the person does first — a page that
  // speaks over you is worse than one that says nothing.
  useEffect(() => {
    if (!ready || dismissed || state) return;
    const timer = window.setTimeout(() => {
      if (dismissed) return;
      const opened = start(carry.current);
      setState(opened);
      setIsOpen(true);
      show(opened);
    }, SETTLE_MS);
    const stop = () => window.clearTimeout(timer);
    window.addEventListener('pointerdown', stop, { once: true });
    window.addEventListener('keydown', stop, { once: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', stop);
      window.removeEventListener('keydown', stop);
    };
    // `carryOn` is read through a ref: a new object every render would reset
    // the timer on every render, which is how it never fired.
  }, [ready, state, setIsOpen, show]);

  // While this page is up, its bubbles are the ones being answered — and while
  // it is asking for words, the composer's words are the answer rather than a
  // question for the model.
  useEffect(() => {
    const answerWith = (said: string) => {
      const current = latest.current.state;
      if (!current) return false;
      const [next, effect] = advance(current, said);
      void perform(next, effect);
      return true;
    };
    setBubbleAnswer((answer: string) => void answerWith(answer));
    setTypedAnswer((text: string) => {
      const current = latest.current.state;
      if (!current || !takesTyping(current)) return false;
      pushLocal({ role: 'user', content: text });
      return answerWith(text);
    });
    return () => {
      setBubbleAnswer(null);
      setTypedAnswer(null);
    };
  }, [perform, pushLocal, setBubbleAnswer, setTypedAnswer]);

  // Left the page mid-interview: the turns go with it, and it is not offered
  // again until the next launch.
  useEffect(
    () => () => {
      // Only once it actually asked something: in dev the page is mounted,
      // unmounted and mounted again, and an unconditional mark here meant the
      // interview was retired before it had spoken.
      if (turnId.current) {
        clearLocal();
        turnId.current = null;
        workingId.current = null;
        dismissed = true;
      }
    },
    [clearLocal],
  );

  /** True while what is typed in the bar is an answer rather than a question. */
  const answering = Boolean(state && running(state) && takesTyping(state));

  /** The composer's text, routed into the interview instead of the model. */
  const answer = useCallback(
    (text: string) => {
      const current = latest.current.state;
      if (!current) return;
      const [next, effect] = advance(current, text);
      void perform(next, effect);
    },
    [perform],
  );

  return { answering, answer, live: Boolean(state && running(state)) };
}

type Fetcher = (path: string, init?: RequestInit) => Promise<Response>;

/** The screenshots, asked for from the click that offered to take them. */
function pickFiles(): Promise<File[]> {
  return new Promise((settle) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = () => settle([...(input.files ?? [])]);
    // A cancelled picker fires no change event, so nothing else resolves this.
    input.oncancel = () => settle([]);
    input.click();
  });
}

/** Each one after the row, one by one; a failure is named, not fatal. */
async function attach(authFetch: Fetcher, id: string, files: File[]): Promise<string[]> {
  const failed: string[] = [];
  for (const file of files) {
    const form = new FormData();
    form.append('file', file);
    try {
      const resp = await authFetch(`/api/projects/${id}/attachments`, {
        method: 'POST',
        body: form,
      });
      if (!resp.ok) failed.push(file.name);
    } catch {
      failed.push(file.name);
    }
  }
  return failed;
}

async function suggestName(
  authFetch: Fetcher,
  description: string,
  avoid: string,
): Promise<{ name: string } | { failed: string }> {
  try {
    const resp = await authFetch('/api/projects/suggest-name', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, ...(avoid ? { avoid } : {}) }),
    });
    if (!resp.ok) return { failed: `Could not name it (${resp.status}).` };
    const body = (await resp.json()) as { name?: string };
    return { name: body.name || 'Untitled Project' };
  } catch {
    return { failed: 'Could not reach the backend.' };
  }
}

async function createProject(
  authFetch: Fetcher,
  description: string,
  name: string,
): Promise<{ created: { id: string } } | { failed: string }> {
  try {
    const resp = await authFetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, name }),
    });
    if (!resp.ok) {
      const body = (await resp.json().catch(() => ({}))) as { detail?: string };
      return { failed: body.detail || `Could not create it (${resp.status}).` };
    }
    return { created: (await resp.json()) as { id: string } };
  } catch {
    return { failed: 'Could not reach the backend.' };
  }
}
