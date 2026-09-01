'use client';

// Planning — the intake tiles. Describe the project, optionally size it, and
// the conversation opens on the answer (the TUI's greeting exchange, as a
// form rather than three turns of chat).

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DuckMark } from '@/components/brand/duck';
import { createChat } from '@/lib/yeaboi/chat';
import { appendSpoken } from '@/lib/yeaboi/voice';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { MicButton } from '@/components/yeaboi/mic-button';
import { Button } from '@/components/ui/button';

const SIZES = [
  { key: '', label: 'Let yeaboi decide', hint: 'the description is classified for you' },
  { key: 'small_project', label: 'Small', hint: 'a ticket or two, one quick sprint' },
  { key: 'smart', label: 'Large', hint: 'epics and multiple sprints' },
];

function PlanningBody() {
  const router = useRouter();
  const [description, setDescription] = useState('');
  const [size, setSize] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function start() {
    if (!description.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const view = await createChat(description.trim(), size);
      router.push(`/team/planning/chat?id=${encodeURIComponent(view.project_id)}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex items-start gap-4 mb-6">
        <DuckMark state="idle" size={56} />
        <div>
          <h1 className="font-display text-2xl text-foreground">Plan a project</h1>
          <p className="text-[13px] text-muted-foreground mt-1 leading-snug">
            Tell me what you&apos;re building and why. I&apos;ll ask the rest, then draw up epics,
            stories, tasks and sprints.
          </p>
        </div>
      </div>

      <textarea
        rows={6}
        placeholder="We're building a mobile app for restaurant reservations…"
        value={description}
        disabled={busy}
        onChange={(e) => setDescription(e.target.value)}
        className="w-full rounded-2xl bg-card ring-1 ring-border/60 px-4 py-3 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-primary/40"
      />

      <div className="mt-2">
        <MicButton
          disabled={busy}
          onText={(text) => setDescription((prior) => appendSpoken(prior, text))}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        {SIZES.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setSize(option.key)}
            className={`rounded-2xl px-4 py-3 text-left transition-colors ${
              option.key === size
                ? 'bg-primary/10 ring-1 ring-primary/40'
                : 'bg-card ring-1 ring-border/60 hover:bg-secondary/40'
            }`}
          >
            <strong className="block text-[13px] font-body font-medium text-foreground">
              {option.label}
            </strong>
            <span className="block text-[11px] text-muted-foreground mt-0.5">{option.hint}</span>
          </button>
        ))}
      </div>

      {error && <p className="mt-3 text-[12px] text-destructive">{error}</p>}

      <div className="mt-5 flex items-center gap-4">
        <Button disabled={busy || !description.trim()} onClick={() => void start()}>
          {busy ? 'Opening…' : 'Start planning'}
        </Button>
        <Link
          href="/team/planning/roadmap"
          className="text-[12px] text-muted-foreground hover:text-foreground"
        >
          From your roadmap
        </Link>
        <Link
          href="/team/planning/sessions"
          className="text-[12px] text-muted-foreground hover:text-foreground"
        >
          Saved plans
        </Link>
      </div>
    </>
  );
}

export default function PlanningPage() {
  return (
    <BackendGate>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <PlanningBody />
      </div>
    </BackendGate>
  );
}
