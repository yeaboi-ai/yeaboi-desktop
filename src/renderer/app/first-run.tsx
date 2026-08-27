// First-run identity screen — the desktop's whole "sign in". The backend
// creates the user from the email claim of the minted JWT (its Dev Login
// works the same way), so all we need is a name and an email to put in it.

'use client';

import { useEffect, useState } from 'react';
import { Duck } from '@design/primitives/Duck';
import { Wordmark } from '@design/primitives/Wordmark';

export function FirstRunScreen({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void window.yeaboi.appMeta().then(() => {
      // Prefill a local identity so one keypress gets you in.
      setEmail((current) => current || 'you@yeaboi.local');
    });
  }, []);

  const submit = async () => {
    if (!email.includes('@')) {
      setError('That email does not look like an email.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await window.yeaboi.setIdentity({ email: email.trim(), name: name.trim() || email.trim() });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your identity.');
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background text-foreground">
      <Duck state="idle" size={72} />
      <div className="w-64">
        <Wordmark text="YEABOI" />
      </div>
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-sm">
        <h1 className="font-display text-2xl italic">Who's planning?</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          The duck keeps your work under this identity on your local backend.
        </p>
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input
            className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <input
            className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            placeholder="you@yeaboi.local"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Waddling in…' : "Let's plan"}
          </button>
        </form>
      </div>
    </div>
  );
}
