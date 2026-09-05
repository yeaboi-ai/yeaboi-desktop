'use client';

// One integration, collapsed to a line: its mark, its name, and either what it
// does (before you connect it) or what it is pointed at (after). Open it to
// edit; "Save & test" writes the typed values and then live-verifies through
// the connection route — verification uses the just-saved values on the
// backend, so no secret is echoed back here.
//
// Shared by the onboarding connections step and Settings > Credentials, so the
// two cannot drift.

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { SettingField, SettingsSnapshot } from '@/lib/yeaboi/settings';
import { saveSetting, verifyConnection } from '@/lib/yeaboi/settings';
import { GuideLink } from '@/components/onboarding/guide-link';
import { ProviderIcon } from '@/components/yeaboi/provider-icon';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type VerifyKind = 'github' | 'jira' | 'confluence' | 'notion' | 'elevenlabs' | 'tavus';

export interface ConnectionCardSpec {
  section: string;
  title: string;
  blurb: string;
  verify?: VerifyKind;
  /** ProviderIcon key, when the mark is not named by the section. */
  icon?: string;
  /** Per-field help and example values, keyed by env. */
  hints?: Record<string, string>;
  placeholders?: Record<string, string>;
}

export const CONNECTION_CARDS: ConnectionCardSpec[] = [
  { section: 'github', title: 'GitHub', blurb: 'PRs, commits and analysis.', verify: 'github' },
  { section: 'jira', title: 'Jira', blurb: 'Issue tracking and sprints.', verify: 'jira' },
  { section: 'azure', title: 'Azure DevOps', blurb: 'Boards and work items.' },
  { section: 'notion', title: 'Notion', blurb: 'Docs and exports.', verify: 'notion' },
  { section: 'slack', title: 'Slack', blurb: 'Reports and ceremonies in a channel.' },
];

export const GROUPS: { label: string; sections: string[] }[] = [
  { label: 'Code', sections: ['github'] },
  { label: 'Tickets', sections: ['jira', 'azure'] },
  { label: 'Docs', sections: ['notion'] },
  { label: 'Chat', sections: ['slack'] },
];

/** The backend says "Jira verified" on a card already titled Jira. Keep only
 *  what the name doesn't already say. */
function verifiedDetail(message: string): string {
  const tail = /verified\s*[—-]\s*(.+)$/i.exec(message);
  return tail?.[1] ? `Verified — ${tail[1]}` : 'Verified';
}

export function ConnectionCard({
  card,
  fields,
  open,
  onToggle,
  summary,
  prefillNonSecret = false,
  configured: configuredProp,
  onVerify,
  validate,
  intro,
  onSaved,
  headerRef,
  onHeaderKeyDown,
  index = 0,
  animate = true,
}: {
  card: ConnectionCardSpec;
  fields: SettingField[];
  open: boolean;
  onToggle: () => void;
  /** Shown instead of the blurb once configured — what this is pointed at. */
  summary?: string;
  /** Settings lets you edit a saved value; onboarding starts every field empty. */
  prefillNonSecret?: boolean;
  /** Overrides the default "a secret is set" test — a connection whose fields
   *  are all public (Cloudflare Access) has to say for itself. */
  configured?: boolean;
  /** Replaces the built-in verifyConnection call for a connection whose probe
   *  lives on its own route. */
  onVerify?: () => Promise<{ ok: boolean; message: string }>;
  /** Client-side field check; a returned string is the reason to show. */
  validate?: (field: SettingField, value: string) => string;
  /** Rendered at the top of the opened body — a status strip, a pointer. */
  intro?: React.ReactNode;
  onSaved: (title: string) => void;
  headerRef?: (el: HTMLButtonElement | null) => void;
  onHeaderKeyDown?: (event: React.KeyboardEvent) => void;
  /** Its place in the stack it arrives with, which is what it waits by. */
  index?: number;
  /** Off where something around it already carries the entrance — a group of
   *  these rising inside a group that is itself rising is two movements. */
  animate?: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const configured = configuredProp ?? fields.some((f) => f.secret && f.is_set);
  // A prefilled field counts as touched only once it differs from what is saved.
  const typed = (field: SettingField) => values[field.env];
  // What the box actually shows. Validation judges this, not just what was
  // typed, so a saved-but-invalid value is flagged before anyone touches it.
  const shown = (field: SettingField) =>
    typed(field) ?? (prefillNonSecret && !field.secret ? field.value : '');
  const changed = (field: SettingField) => {
    const next = typed(field);
    if (next === undefined) return false;
    if (field.secret) return Boolean(next.trim());
    return next !== field.value;
  };
  const touched = fields.some(changed);

  const canProbe = Boolean(onVerify ?? card.verify);
  const invalid = fields.map((f) => validate?.(f, shown(f)) ?? '').find(Boolean) ?? '';

  const saveAndTest = async () => {
    setBusy(true);
    setResult(null);
    try {
      for (const field of fields) {
        if (changed(field)) await saveSetting(field.env, (typed(field) ?? '').trim());
      }
      if (touched) onSaved(card.title);
      const probe = onVerify ?? (card.verify ? () => verifyConnection(card.verify!) : null);
      if (probe) {
        // Empty fields: the backend falls back to the values just saved.
        try {
          const r = await probe();
          setResult({ ok: r.ok, message: r.ok ? verifiedDetail(r.message) : r.message });
        } catch (e) {
          const message = (e as Error).message;
          setResult({
            ok: false,
            message: /not found/i.test(message)
              ? 'Saved — testing needs a newer yeaboi engine.'
              : message,
          });
        }
      } else if (touched) {
        setResult({ ok: true, message: 'Saved — this connection has no live probe.' });
      }
    } catch (e) {
      setResult({ ok: false, message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className={`overflow-hidden rounded-2xl bg-card ring-1 ring-border/60 ${
        animate ? 'animate-slide-up motion-reduce:animate-none' : ''
      }`}
      style={animate ? { animationDelay: `${index * 60}ms` } : undefined}
    >
      <button
        type="button"
        ref={headerRef}
        onClick={onToggle}
        onKeyDown={onHeaderKeyDown}
        className="group flex w-full items-center gap-3.5 px-4 py-3 text-left transition-colors hover:bg-secondary/30 focus-visible:ring-1 focus-visible:ring-primary/50 focus-visible:outline-none"
        aria-expanded={open}
      >
        <ProviderIcon provider={card.icon ?? card.section} size={40} />
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-body font-medium text-foreground">
            {card.title}
          </span>
          <span
            className={cn(
              'block truncate text-[12px]',
              summary && configured ? 'text-muted-foreground' : 'text-muted-foreground/70',
            )}
          >
            {(configured && summary) || card.blurb}
          </span>
        </span>
        {configured && (
          <span className="shrink-0 rounded-full bg-success/10 px-2 py-0.5 text-[10px] text-success">
            connected
          </span>
        )}
        <ChevronRight
          aria-hidden
          className={`h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:text-muted-foreground ${
            open ? 'rotate-90' : ''
          }`}
        />
      </button>
      {/* Opens and closes on a rule rather than appearing and vanishing. The
          row is `0fr` shut and `1fr` open, which is the one way a box of
          unknown height animates in CSS alone; `inert` keeps what is folded
          away out of the tab order without taking it out of the tree, which is
          what the animation needs to run on. */}
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
        aria-hidden={!open}
        inert={!open}
      >
        <div className="overflow-hidden">
          <div className="border-t border-border/40 px-5 py-4">
            {intro}
            <div className="space-y-3">
              {fields.map((field) => (
                <label key={field.env} className="block">
                  <span className="text-[11px] font-body tracking-wide text-muted-foreground uppercase">
                    {field.label}
                  </span>
                  <input
                    type={field.secret ? 'password' : 'text'}
                    value={shown(field)}
                    placeholder={
                      field.is_set && field.secret
                        ? 'saved — type to replace'
                        : (card.placeholders?.[field.env] ?? '')
                    }
                    onChange={(event) =>
                      setValues((current) => ({ ...current, [field.env]: event.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border border-border/40 bg-secondary/40 px-3 py-2 font-mono text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary/40 focus:outline-none"
                  />
                  {card.hints?.[field.env] && (
                    <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground/80">
                      {card.hints[field.env]}
                    </p>
                  )}
                  {validate?.(field, shown(field)) && (
                    <p role="alert" className="mt-1 text-[11px] text-destructive">
                      {validate(field, shown(field))}
                    </p>
                  )}
                  <GuideLink url={field.help_url} scope={field.help_scope} />
                </label>
              ))}
            </div>
            {result && (
              <p
                role="status"
                className={`mt-3 text-[12px] ${result.ok ? 'text-success' : 'text-destructive'}`}
              >
                {result.message}
              </p>
            )}
            <div className="mt-4">
              <Button
                size="sm"
                variant="outline"
                disabled={busy || Boolean(invalid) || (!touched && !(canProbe && configured))}
                onClick={() => void saveAndTest()}
              >
                {busy ? 'Testing…' : canProbe ? 'Save & test' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Cards that have fields in this snapshot, arranged by purpose. Anything a
 *  future engine adds outside the map lands in "More". */
export function groupConnections(
  snapshot: SettingsSnapshot,
  cards: readonly ConnectionCardSpec[],
  groups: readonly { label: string; sections: string[] }[],
): { label: string; items: { card: ConnectionCardSpec; fields: SettingField[] }[] }[] {
  const available = cards
    .map((card) => ({
      card,
      fields: snapshot.fields.filter((f) => f.section === card.section && !f.action),
    }))
    .filter(({ fields }) => fields.length);

  const grouped = groups
    .map((group) => ({
      label: group.label,
      items: available.filter(({ card }) => group.sections.includes(card.section)),
    }))
    .filter((group) => group.items.length);

  const covered = new Set(groups.flatMap((g) => g.sections));
  const leftover = available.filter(({ card }) => !covered.has(card.section));
  if (leftover.length) grouped.push({ label: 'More', items: leftover });
  return grouped;
}
