'use client';

// Feedback — a bug, a request, or a complaint, filed as a GitHub issue.
//
// Two buttons, because there are two things a person might want. AI Polish
// rewrites the draft into something a maintainer can act on and hands it back
// for review; it never submits, and when no model is configured the answer is
// the draft that was already written. Submit files it: through the API when a
// GitHub token is configured, and otherwise by opening a pre-filled issue form
// in the browser, since the repository is public.

import { useEffect, useState } from 'react';
import {
  type FeedbackOptions,
  type FeedbackResult,
  getFeedbackOptions,
  polishFeedback,
  submitFeedback,
} from '@/lib/yeaboi/ambience';
import { duckVoice } from '@/lib/duck-voice';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { Button } from '@/components/ui/button';

function FeedbackBody() {
  const [options, setOptions] = useState<FeedbackOptions | null>(null);
  const [kind, setKind] = useState('Bug');
  const [area, setArea] = useState('general');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState<FeedbackResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getFeedbackOptions().then(setOptions, (e: Error) => setError(e.message));
  }, []);

  if (error)
    return (
      <p className="text-[13px] text-muted-foreground">Could not open the feedback form: {error}</p>
    );
  if (!options) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  const draft = { kind, area, title, description };
  const ready = title.trim().length > 0 && description.trim().length > 0;

  function polish(): void {
    setBusy('polish');
    setStatus('');
    polishFeedback(draft)
      .then(
        (answer) => {
          if (answer.polished) {
            setTitle(answer.polished.title);
            setDescription(answer.polished.description);
          }
          setStatus(answer.status);
        },
        (e: Error) => setStatus(e.message),
      )
      .finally(() => setBusy(''));
  }

  function send(): void {
    setBusy('submit');
    setStatus('');
    submitFeedback(draft)
      .then(
        (answer) => {
          setResult(answer);
          if (answer.ok) duckVoice().say('Sent it!');
        },
        (e: Error) => setStatus(e.message),
      )
      .finally(() => setBusy(''));
  }

  if (result) {
    return (
      <div className="rounded-2xl bg-card ring-1 ring-border/60 p-5">
        <h2 className="text-[13px] font-body font-medium text-foreground mb-2">
          {result.ok ? 'Thank you' : 'Not filed yet'}
        </h2>
        <p className="text-[12px] text-muted-foreground">{result.message}</p>
        {result.url && (
          <p className="mt-2">
            <a
              href={result.url}
              target="_blank"
              rel="noreferrer"
              className="text-[12px] text-primary hover:underline break-all"
            >
              {result.url}
            </a>
          </p>
        )}
        <div className="mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setResult(null);
              setTitle('');
              setDescription('');
            }}
          >
            Write another
          </Button>
        </div>
      </div>
    );
  }

  const chip = (active: boolean) =>
    `rounded-full px-3 py-1 text-[11px] font-body transition-colors ${
      active
        ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
        : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
    }`;

  return (
    <div className="rounded-2xl bg-card ring-1 ring-border/60 p-5 space-y-4">
      <p className="text-[12px] text-muted-foreground">
        Files an issue on <code className="font-mono text-foreground">{options.repo}</code>. Nothing
        is sent until you press Submit.
      </p>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-body text-muted-foreground uppercase tracking-wide w-16 shrink-0">
          Type
        </span>
        <div className="flex flex-wrap gap-1.5">
          {options.types.map((option) => (
            <button
              key={option}
              type="button"
              className={chip(option === kind)}
              onClick={() => setKind(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-body text-muted-foreground uppercase tracking-wide w-16 shrink-0">
          Area
        </span>
        <select
          value={area}
          onChange={(event) => setArea(event.target.value)}
          className="text-[12px] font-body bg-transparent border border-border/40 rounded px-2 py-1 text-foreground"
        >
          {options.areas.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      <label className="block">
        <span className="text-[11px] font-body text-muted-foreground uppercase tracking-wide">
          Title
        </span>
        <input
          type="text"
          value={title}
          placeholder="One line — what went wrong, or what is missing"
          onChange={(event) => setTitle(event.target.value)}
          className="mt-1 w-full rounded-lg bg-secondary/40 border border-border/40 px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
      </label>
      <label className="block">
        <span className="text-[11px] font-body text-muted-foreground uppercase tracking-wide">
          Description
        </span>
        <textarea
          rows={10}
          value={description}
          placeholder="What you did, what you expected, what happened instead."
          onChange={(event) => setDescription(event.target.value)}
          className="mt-1 w-full rounded-lg bg-secondary/40 border border-border/40 px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
      </label>
      {status && <p className="text-[12px] text-muted-foreground">{status}</p>}
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={!ready || busy !== ''} onClick={send}>
          {busy === 'submit' ? 'Submitting…' : 'Submit'}
        </Button>
        <Button variant="outline" size="sm" disabled={!ready || busy !== ''} onClick={polish}>
          {busy === 'polish' ? 'Polishing…' : 'AI Polish'}
        </Button>
      </div>
    </div>
  );
}

export default function FeedbackPage() {
  return (
    <BackendGate>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="font-display text-2xl text-foreground mb-6">Feedback</h1>
        <FeedbackBody />
      </div>
    </BackendGate>
  );
}
