'use client';

// Connections — optional, grouped by what each tool is for (code, tickets,
// docs, chat). One collapsed card per integration; the fields render off the
// backend's own settings registry, so labels, masking, and help links stay in
// step with the engine. "Save & test" writes the typed values, then
// live-verifies through the connection route — verification uses the
// just-saved values on the backend, so no secret is echoed back here.

import { useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { SettingField, SettingsSnapshot } from '@/lib/yeaboi/settings';
import { saveSetting, verifyConnection } from '@/lib/yeaboi/settings';
import { GuideLink } from '../guide-link';
import { ProviderIcon } from '@/components/yeaboi/provider-icon';
import { Button } from '@/components/ui/button';

type VerifyKind = 'github' | 'jira' | 'confluence' | 'notion';

interface ConnectionCardSpec {
  section: string;
  title: string;
  blurb: string;
  verify?: VerifyKind;
}

const CONNECTION_CARDS: ConnectionCardSpec[] = [
  { section: 'github', title: 'GitHub', blurb: 'PRs, commits and analysis.', verify: 'github' },
  { section: 'jira', title: 'Jira', blurb: 'Issue tracking and sprints.', verify: 'jira' },
  { section: 'azure', title: 'Azure DevOps', blurb: 'Boards and work items.' },
  { section: 'notion', title: 'Notion', blurb: 'Docs and exports.', verify: 'notion' },
  { section: 'slack', title: 'Slack', blurb: 'Reports and ceremonies in a channel.' },
];

const GROUPS: { label: string; sections: string[] }[] = [
  { label: 'Code', sections: ['github'] },
  { label: 'Tickets', sections: ['jira', 'azure'] },
  { label: 'Docs', sections: ['notion'] },
  { label: 'Chat', sections: ['slack'] },
];

function ConnectionCard({
  card,
  fields,
  open,
  onToggle,
  onSaved,
  headerRef,
  onHeaderKeyDown,
}: {
  card: ConnectionCardSpec;
  fields: SettingField[];
  open: boolean;
  onToggle: () => void;
  onSaved: (title: string) => void;
  headerRef: (el: HTMLButtonElement | null) => void;
  onHeaderKeyDown: (event: React.KeyboardEvent) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const configured = fields.some((f) => f.secret && f.is_set);
  const touched = Object.values(values).some((v) => v.trim());

  const saveAndTest = async () => {
    setBusy(true);
    setResult(null);
    try {
      for (const field of fields) {
        const value = values[field.env]?.trim();
        if (value) await saveSetting(field.env, value);
      }
      if (touched) onSaved(card.title);
      if (card.verify) {
        // Empty fields: the backend falls back to the values just saved.
        try {
          setResult(await verifyConnection(card.verify));
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
    <section className="overflow-hidden rounded-2xl bg-card ring-1 ring-border/60">
      <button
        type="button"
        ref={headerRef}
        onClick={onToggle}
        onKeyDown={onHeaderKeyDown}
        className="group flex w-full items-center gap-3.5 px-4 py-3 text-left transition-colors hover:bg-secondary/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
        aria-expanded={open}
      >
        <ProviderIcon provider={card.section} size={40} />
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-body font-medium text-foreground">
            {card.title}
          </span>
          <span className="block truncate text-[12px] text-muted-foreground">{card.blurb}</span>
        </span>
        {configured && (
          <span className="shrink-0 rounded-full bg-success/10 px-2 py-0.5 text-[10px] text-success">
            configured
          </span>
        )}
        <ChevronRight
          aria-hidden
          className={`h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:text-muted-foreground ${
            open ? 'rotate-90' : ''
          }`}
        />
      </button>
      {open && (
        <div className="border-t border-border/40 px-5 py-4">
          <div className="space-y-3">
            {fields.map((field) => (
              <label key={field.env} className="block">
                <span className="text-[11px] font-body text-muted-foreground uppercase tracking-wide">
                  {field.label}
                </span>
                <input
                  type={field.secret ? 'password' : 'text'}
                  value={values[field.env] ?? ''}
                  placeholder={field.is_set ? 'saved — type to replace' : ''}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [field.env]: event.target.value }))
                  }
                  className="mt-1 w-full rounded-lg bg-secondary/40 border border-border/40 px-3 py-2 text-[13px] font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
                {field.secret && <GuideLink url={field.help_url} scope={field.help_scope} />}
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
              disabled={busy || (!touched && !(card.verify && configured))}
              onClick={() => void saveAndTest()}
            >
              {busy ? 'Testing…' : card.verify ? 'Save & test' : 'Save'}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

export function ConnectionsStep({
  snapshot,
  onSaved,
  onContinue,
  onBack,
}: {
  snapshot: SettingsSnapshot | null;
  onSaved: (title: string) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const [openSection, setOpenSection] = useState('');
  const headerRefs = useRef<(HTMLButtonElement | null)[]>([]);

  if (!snapshot) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  const available = CONNECTION_CARDS.map((card) => ({
    card,
    fields: snapshot.fields.filter((f) => f.section === card.section && !f.action),
  })).filter(({ fields }) => fields.length);

  // Group by purpose; anything a future engine adds outside the map lands in "More".
  const grouped = GROUPS.map((group) => ({
    label: group.label,
    items: available.filter(({ card }) => group.sections.includes(card.section)),
  })).filter((group) => group.items.length);
  const covered = new Set(GROUPS.flatMap((g) => g.sections));
  const leftover = available.filter(({ card }) => !covered.has(card.section));
  if (leftover.length) grouped.push({ label: 'More', items: leftover });

  // Up/down arrows walk the card headers across group boundaries.
  let flat = -1;
  const headerKeyHandler = (index: number) => (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    headerRefs.current[index + (event.key === 'ArrowDown' ? 1 : -1)]?.focus();
  };

  return (
    <div>
      <div className="space-y-4">
        {grouped.map((group) => (
          <div key={group.label}>
            <h3 className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/60">
              {group.label}
            </h3>
            <div className="space-y-2">
              {group.items.map(({ card, fields }) => {
                flat += 1;
                const index = flat;
                return (
                  <ConnectionCard
                    key={card.section}
                    card={card}
                    fields={fields}
                    open={openSection === card.section}
                    onToggle={() => setOpenSection((s) => (s === card.section ? '' : card.section))}
                    onSaved={onSaved}
                    headerRef={(el) => {
                      headerRefs.current[index] = el;
                    }}
                    onHeaderKeyDown={headerKeyHandler(index)}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onBack}>
          Back
        </Button>
        <Button size="sm" onClick={onContinue}>
          Continue
        </Button>
      </div>
    </div>
  );
}
