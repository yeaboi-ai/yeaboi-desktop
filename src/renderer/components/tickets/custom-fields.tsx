'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { useAuthFetch } from '@/hooks/use-auth-fetch';

interface FieldSchemaEntry {
  key: string;
  label: string;
  type: string;
  required: boolean;
  options?: string[] | null;
}

interface TicketTemplate {
  id: string;
  slug: string;
  name: string;
  field_schema: FieldSchemaEntry[];
  version: number;
}

interface Props {
  templateId: string | null | undefined;
  customFields: Record<string, unknown> | undefined;
  onChange: (next: Record<string, unknown>) => void;
}

// Phase 3 — renders editable inputs for every field defined by the template's
// field_schema. Falls back to a "(key: value)" listing for keys that exist on
// the card but no longer in the template (template was edited since generation;
// we don't drop the data — Card.template_version snapshots which schema applied).
export function CustomFields({ templateId, customFields, onChange }: Props) {
  const { authFetch } = useAuthFetch();
  const [template, setTemplate] = useState<TicketTemplate | null>(null);
  const values = customFields ?? {};

  // Reset the cached template synchronously when templateId changes to avoid
  // a stale schema flash. Using "compare previous prop, set during render" so
  // we don't trip the set-state-in-effect lint.
  const [snapshot, setSnapshot] = useState(templateId ?? null);
  if (snapshot !== (templateId ?? null)) {
    setSnapshot(templateId ?? null);
    setTemplate(null);
  }

  useEffect(() => {
    if (!templateId) return;
    let cancelled = false;
    (async () => {
      const resp = await authFetch('/api/ticket-templates');
      if (!resp.ok || cancelled) return;
      const all = (await resp.json()) as TicketTemplate[];
      if (cancelled) return;
      setTemplate(all.find((t) => t.id === templateId) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [authFetch, templateId]);

  const schema = template?.field_schema ?? [];
  const schemaKeys = new Set(schema.map((f) => f.key));
  const orphanKeys = Object.keys(values).filter((k) => !schemaKeys.has(k));

  if (schema.length === 0 && orphanKeys.length === 0) return null;

  const set = (key: string, value: unknown) => onChange({ ...values, [key]: value });

  return (
    <section className="space-y-3">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {template ? `${template.name} fields` : 'Custom fields'}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {schema.map((f) => (
          <div key={f.key}>
            <label className="text-xs text-muted-foreground mb-1 block">
              {f.label}
              {f.required && <span className="ml-1 text-destructive">*</span>}
            </label>
            {renderField(f, values[f.key], (v) => set(f.key, v))}
          </div>
        ))}
        {orphanKeys.length > 0 && (
          <div className="md:col-span-2 text-xs text-muted-foreground space-y-0.5">
            <div className="italic">Legacy fields (template no longer defines these):</div>
            {orphanKeys.map((k) => (
              <div key={k}>
                <span className="font-mono">{k}:</span> <span>{String(values[k] ?? '')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function renderField(
  f: FieldSchemaEntry,
  value: unknown,
  onChange: (v: unknown) => void,
): React.ReactNode {
  const v = value == null ? '' : String(value);
  switch (f.type) {
    case 'number':
      return (
        <Input
          type="number"
          value={v}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
      );
    case 'date':
      return <Input type="date" value={v} onChange={(e) => onChange(e.target.value || null)} />;
    case 'url':
      return (
        <Input
          type="url"
          value={v}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://"
        />
      );
    case 'select':
      return (
        <select
          value={v}
          onChange={(e) => onChange(e.target.value || null)}
          className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
        >
          <option value="">—</option>
          {(f.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    case 'multi_select': {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      const toggle = (opt: string) => {
        const next = arr.includes(opt) ? arr.filter((x) => x !== opt) : [...arr, opt];
        onChange(next);
      };
      return (
        <div className="flex flex-wrap gap-1">
          {(f.options ?? []).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                arr.includes(opt)
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      );
    }
    default:
      return <Input value={v} onChange={(e) => onChange(e.target.value)} />;
  }
}
