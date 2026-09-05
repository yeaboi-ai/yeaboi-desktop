'use client';

// The deck style — what the slides look like, saved once and used by every
// report. The field list and its choices come from the backend, so the two
// surfaces edit the same vocabulary rather than two copies of it.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  type DeckStyle,
  type ReportingOptions,
  type StyleField,
  loadReportingOptions,
  resetDeckStyle,
  saveDeckStyle,
} from '@/lib/yeaboi/modes';
import { PageShell } from '@/components/page-shell';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { Button } from '@/components/ui/button';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-card ring-1 ring-border/60 p-5">
      <h2 className="text-[13px] font-body font-medium text-foreground mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Notice({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl bg-card ring-1 ring-destructive/30 p-4">
      <p className="text-[13px] font-medium text-foreground">{title}</p>
      {items.map((item) => (
        <p key={item} className="text-[12px] text-muted-foreground mt-1">
          {item}
        </p>
      ))}
    </div>
  );
}

const fieldClass =
  'rounded-lg bg-secondary/40 border border-border/40 px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40';

function ReportingStyleBody() {
  const [options, setOptions] = useState<ReportingOptions | null>(null);
  const [style, setStyle] = useState<DeckStyle | null>(null);
  const [summary, setSummary] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadReportingOptions().then(
      (opts) => {
        setOptions(opts);
        setStyle({ ...opts.style });
        setSummary(opts.style_summary);
      },
      (e: Error) => setError(e.message),
    );
  }, []);

  if (error && !options) return <Notice title="Could not open the deck style" items={[error]} />;
  if (!options || !style) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  const set = (key: string, value: string | number | boolean) => {
    setStyle({ ...style, [key]: value });
    setMessage('');
  };

  const choicesFor = (key: string): (string | number)[] => {
    const c = options.style_choices;
    if (key === 'font_family') return c.fonts;
    if (key === 'font_scale') return c.font_scales;
    if (key === 'layout') return c.layouts;
    if (key === 'content_fit') return c.content_fits;
    if (key === 'max_bullets') return c.max_bullets;
    return [];
  };

  const label = (key: string, value: string | number): string =>
    key === 'content_fit'
      ? (options.style_choices.content_fit_labels[String(value)] ?? String(value))
      : String(value);

  async function save() {
    try {
      const saved = await saveDeckStyle(style!);
      setStyle(saved.style);
      setSummary(saved.style_summary);
      setMessage('Saved.');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function reset() {
    try {
      const saved = await resetDeckStyle();
      setStyle(saved.style);
      setSummary(saved.style_summary);
      setMessage('Restored the defaults.');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-foreground">Deck style</h1>
          <p className="text-[13px] text-muted-foreground mt-1">{summary}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => void save()}>
            Save
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void reset()}>
            Reset
          </Button>
          <Link
            href="/team/reporting"
            className="text-[12px] text-muted-foreground hover:text-foreground"
          >
            Back
          </Link>
        </div>
      </header>

      {message && <p className="text-[12px] text-muted-foreground">{message}</p>}
      {error && <Notice title="Could not save" items={[error]} />}

      <Section title="Slides">
        <div className="space-y-3">
          {options.style_fields.map((field: StyleField) => (
            <div key={field.key} className="flex items-start justify-between gap-4">
              <label
                htmlFor={`style-${field.key}`}
                className="text-[13px] text-foreground pt-1.5 shrink-0"
              >
                {field.label}
              </label>
              <StyleInput
                field={field}
                value={style[field.key]}
                choices={choicesFor(field.key)}
                colorRoles={options.style_choices.color_roles}
                label={label}
                onChange={(value) => set(field.key, value)}
              />
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function StyleInput({
  field,
  value,
  choices,
  colorRoles,
  label,
  onChange,
}: {
  field: StyleField;
  value: string | number | boolean | undefined;
  choices: (string | number)[];
  colorRoles: string[];
  label: (key: string, value: string | number) => string;
  onChange: (value: string | number | boolean) => void;
}) {
  const id = `style-${field.key}`;
  if (field.kind === 'bool') {
    return (
      <input
        id={id}
        type="checkbox"
        checked={Boolean(value)}
        onChange={() => onChange(!value)}
        className="mt-2 accent-[var(--primary)]"
      />
    );
  }
  if (field.kind === 'color') {
    // A palette role or a literal hex — the backend resolves either, so the
    // input accepts both rather than forcing a colour picker on "accent".
    return (
      <span className="flex flex-wrap items-center justify-end gap-1.5">
        <input
          id={id}
          type="text"
          value={String(value ?? '')}
          placeholder="accent or #2aaa69"
          onChange={(e) => onChange(e.target.value)}
          className={`${fieldClass} w-40 font-mono placeholder:text-muted-foreground/50`}
        />
        {colorRoles.map((role) => (
          <button
            key={role}
            type="button"
            onClick={() => onChange(role)}
            className="rounded-full bg-secondary/40 px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-secondary/70 hover:text-foreground transition-colors"
          >
            {role}
          </button>
        ))}
      </span>
    );
  }
  if (field.kind === 'choice' || field.kind === 'int') {
    return (
      <select
        id={id}
        value={String(value ?? '')}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(field.kind === 'int' ? Number(raw) : raw);
        }}
        className={`${fieldClass} min-w-40`}
      >
        {choices.map((choice) => (
          <option key={String(choice)} value={String(choice)}>
            {label(field.key, choice)}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      id={id}
      type="text"
      value={String(value ?? '')}
      onChange={(e) => onChange(e.target.value)}
      className={`${fieldClass} w-56`}
    />
  );
}

export default function ReportingStylePage() {
  return (
    <PageShell width="narrow">
      <BackendGate>
        <ReportingStyleBody />
      </BackendGate>
    </PageShell>
  );
}
