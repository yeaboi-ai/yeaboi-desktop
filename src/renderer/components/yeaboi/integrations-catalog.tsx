'use client';

// The integrations catalog — Settings > Integrations.
//
// One view: the whole roster from GET /api/connections?all=1, searchable,
// shelved by family. Create-your-own opens from the empty-search state or the
// tile at the end — one sheet, two doors. A connected
// integration wears its badge and accent here; managing what is already set
// up (masked fields, verify, edit) lives beside the other credentials on
// Settings > Credentials.
//
// The signature is the accent bloom: every tile is monochrome at rest, takes
// its vendor's accent on hover/focus (ring + soft glow through a per-tile
// CSS variable fed by the wire's `accent`), and wears it permanently once
// connected — colour encodes state, it never decorates.
//
// Connecting happens in a right-hand sheet: auth method first (it decides
// which fields are even asked), then that method's fields, one "Save & test"
// writing through POST /api/settings/set and probing through the connection
// verify route — the same flow ConnectionCard owns, restyled. Rows managed by
// Credentials deep-link there instead of duplicating their forms.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ImagePlus, Plus, Search, Sparkles, X } from 'lucide-react';
import {
  type ConnectionRow,
  type ConnectionsPayload,
  type CustomConnectionSpec,
  type CustomExtraField,
  createCustomConnection,
  draftCustomConnection,
  loadConnections,
} from '@/lib/yeaboi/connections';
import { ConnectorSheet, ConnectorTile } from '@/components/yeaboi/connector-sheet';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

/** What the app itself runs on: the repository it reads, the tracker the work
 *  is in, the docs it writes to, the channel ceremonies deliver through, the
 *  voice it speaks in. Everything else in the roster is somebody's estate, and
 *  useful only to whoever has it. Shelved first, in this order. */
const ESSENTIALS: readonly string[] = [
  'github',
  'gitlab',
  'bitbucket',
  'jira',
  'linear',
  'trello',
  'azdevops',
  'confluence',
  'notion',
  'slack',
  'elevenlabs',
  'tavus',
];

function matches(row: ConnectionRow, needle: string): boolean {
  const q = needle.trim().toLowerCase();
  if (!q) return true;
  return (
    row.label.toLowerCase().includes(q) ||
    row.summary.toLowerCase().includes(q) ||
    row.family_label.toLowerCase().includes(q)
  );
}

export function IntegrationsCatalog() {
  const [payload, setPayload] = useState<ConnectionsPayload | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [family, setFamily] = useState('');
  const [openKey, setOpenKey] = useState('');
  // Everything that is not an essential stays folded: it is a list of estates,
  // and you either have one or you do not. A search or a family chip is asking
  // for it, so it opens itself.
  const [restOpen, setRestOpen] = useState(false);
  // `overflow-hidden` is what makes the fold a fold, and what clips a tile's
  // ring once it is open. It lasts as long as the movement does.
  const [folding, setFolding] = useState(true);
  const [creating, setCreating] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await loadConnections(true);
      setPayload(next);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const rows = useMemo(() => payload?.connectors ?? [], [payload]);
  const openRow = rows.find((row) => row.key === openKey) ?? null;

  const filtered = rows.filter((row) => matches(row, query) && (!family || row.family === family));
  // The essentials lead, and leave their families: a tile in two shelves is a
  // second integration as far as anyone reading is concerned. Filtering by
  // family is asking for that family, so the shelf steps aside for it.
  const essentials = family
    ? []
    : ESSENTIALS.map((key) => filtered.find((row) => row.key === key)).filter(
        (row): row is ConnectionRow => Boolean(row),
      );
  const shelved = filtered.filter((row) => !essentials.includes(row));
  const shelfFamilies = (payload?.families ?? []).filter((f) =>
    shelved.some((row) => row.family === f.key),
  );
  // Inside the shelf they keep their families: nine tiles in a row is a list,
  // and the point of the shelf is that each of these does one of four jobs.
  // A search or a family chip is a request for what is folded away.
  const showRest = restOpen || Boolean(query.trim()) || Boolean(family);
  const essentialFamilies = (payload?.families ?? [])
    .map((f) => ({ ...f, rows: essentials.filter((row) => row.family === f.key) }))
    .filter((f) => f.rows.length > 0);

  if (error) {
    // A backend that predates the route answers the router's generic 404 —
    // that is staleness, not breakage, and it must not read as red.
    return /404|not found/i.test(error) ? (
      <p role="status" className="text-[13px] text-muted-foreground">
        Your yeaboi backend predates the integrations catalog — update yeaboi to browse it.
      </p>
    ) : (
      <p role="alert" className="text-[12px] text-destructive">
        Could not load the catalog: {error}
      </p>
    );
  }
  if (!payload) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-2xl bg-secondary/50 motion-reduce:animate-none"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Searching and filtering stay put while the shelves scroll under them:
          they are how you get to a row, and scrolling them away leaves the
          catalog with no way to narrow it but back to the top.

          Sticky under the page's heading — the shell measures that and says how
          tall it is. Widened past the column so the shelves pass behind it. */}
      <div
        // Pulled up against the heading and carrying its own top padding: a
        // gap between two pinned bars is a stripe of moving content.
        className="pin-fade sticky z-[9] -mx-6 -mt-4 space-y-3 bg-background px-6 pt-3 pb-3"
        style={{ top: 'var(--page-head, 0px)' }}
      >
        {/* The shelves below deal themselves in; what sits above them was simply
            already there, which made the page look like it had arrived twice. */}
        <div className="flex animate-slide-up flex-wrap items-center justify-between gap-3 motion-reduce:animate-none">
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-56 flex-1">
              <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground/60"
              />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search the catalog"
                aria-label="Search the catalog"
                className="w-full rounded-lg border border-border/40 bg-secondary/40 py-2 pr-9 pl-9 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary/40 focus:outline-none"
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear the search"
                  onClick={() => {
                    setQuery('');
                    searchRef.current?.focus();
                  }}
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-full p-1 text-muted-foreground/60 transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <X aria-hidden className="size-3" />
                </button>
              )}
            </label>
          </div>
        </div>

        <div
          role="group"
          aria-label="Family filter"
          className="flex animate-slide-up flex-wrap gap-1.5 motion-reduce:animate-none"
          style={{ animationDelay: '60ms' }}
        >
          <FamilyChip label="All" active={!family} onPick={() => setFamily('')} />
          {(payload?.families ?? []).map((f) => (
            <FamilyChip
              key={f.key}
              label={f.label}
              active={family === f.key}
              onPick={() => setFamily(family === f.key ? '' : f.key)}
            />
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-[12px] text-muted-foreground">
            Nothing matches — clear the search to see the whole catalog.
          </p>
          <Button size="xs" variant="secondary" className="mt-3" onClick={() => setCreating(true)}>
            <Plus aria-hidden className="mr-1 size-3" />
            Create it yourself
          </Button>
        </div>
      ) : (
        <>
          {/* What the app itself runs on, on a shelf of its own: everything
              below is somebody's estate and useful only to whoever has it. */}
          {essentialFamilies.length > 0 && (
            <section
              className="animate-slide-up motion-reduce:animate-none"
              style={{ animationDelay: '120ms', animationFillMode: 'backwards' }}
            >
              <div className="mb-3 flex flex-wrap items-baseline gap-x-2 border-b border-primary/20 pb-2">
                <h3 className="font-body text-[10px] tracking-[0.14em] text-primary uppercase">
                  Essentials
                </h3>
                <span className="text-[11px] text-muted-foreground/70">
                  what yeaboi itself reads, writes and speaks through
                </span>
              </div>
              <div className="space-y-4">
                {essentialFamilies.map((f) => (
                  <div key={f.key}>
                    <h4 className="mb-2 font-body text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                      {f.label}
                    </h4>
                    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {f.rows.map((row) => (
                        <ConnectorTile key={row.key} row={row} onOpen={() => setOpenKey(row.key)} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {shelfFamilies.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => {
                  setFolding(true);
                  setRestOpen((open) => !open);
                }}
                aria-expanded={showRest}
                className="flex w-full items-center gap-2 border-t border-border/40 pt-4 font-body text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronDown
                  aria-hidden
                  className={cn(
                    'size-3.5 transition-transform duration-200',
                    showRest && 'rotate-180',
                  )}
                />
                {showRest ? 'Hide the rest' : `Everything else — ${shelved.length} more`}
              </button>

              <div
                onTransitionEnd={() => setFolding(!showRest)}
                className={cn(
                  'grid transition-[grid-template-rows,opacity] duration-[240ms] ease-out',
                  showRest ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
                )}
              >
                <div className={showRest && !folding ? 'overflow-visible' : 'overflow-hidden'}>
                  <div className="space-y-6 pt-4">
                    {shelfFamilies.map((f) => (
                      <section key={f.key}>
                        <h3 className="mb-2 font-body text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                          {f.label}
                        </h3>
                        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                          {shelved
                            .filter((row) => row.family === f.key)
                            .map((row) => (
                              <ConnectorTile
                                key={row.key}
                                row={row}
                                onOpen={() => setOpenKey(row.key)}
                              />
                            ))}
                        </div>
                      </section>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Last in, after the shelves it sits under. */}
      <button
        type="button"
        onClick={() => setCreating(true)}
        style={{
          animationDelay: `${120 + Math.min(shelfFamilies.length, 5) * 60}ms`,
          animationFillMode: 'backwards',
        }}
        className="flex w-full animate-slide-up items-center gap-3.5 rounded-2xl border border-dashed border-border/70 bg-card/40 px-4 py-3 text-left transition-colors hover:border-primary/50 hover:bg-secondary/30 focus-visible:ring-1 focus-visible:ring-primary/50 motion-reduce:animate-none focus-visible:outline-none"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary/60 ring-1 ring-border/40">
          <Plus aria-hidden className="size-5 text-muted-foreground" />
        </span>
        <span className="min-w-0">
          <span className="block text-[13.5px] font-body font-medium text-foreground">
            Create your own
          </span>
          <span className="block text-[12px] text-muted-foreground/70">
            A generic API, an inbound webhook or an MCP server — describe it, or fill the form.
          </span>
        </span>
      </button>

      <ConnectorSheet row={openRow} onClose={() => setOpenKey('')} onChanged={refresh} />
      <CreateCustomSheet
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(key) => {
          setCreating(false);
          void refresh().then(() => setOpenKey(key));
        }}
      />
    </div>
  );
}

function FamilyChip({
  label,
  active,
  onPick,
}: {
  label: string;
  active: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={active}
      className={cn(
        'rounded-full px-2.5 py-1 text-[11px] font-body transition-colors focus-visible:ring-1 focus-visible:ring-primary/50 focus-visible:outline-none',
        active
          ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
          : 'bg-secondary/60 text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Create your own — LLM draft on top, the form underneath
// ---------------------------------------------------------------------------

const FAMILY_OPTIONS = [
  'observability',
  'incidents',
  'errors',
  'cloud',
  'delivery',
  'code',
  'docs',
  'chat',
  'media',
];

const EMPTY_SPEC: CustomConnectionSpec = {
  key: '',
  label: '',
  family: 'observability',
  summary: '',
  detail: '',
  docs_url: '',
  glyph: '🔌',
  icon_data: '',
  accent: 'rgb(120,160,200)',
  kind: 'api',
  auth_scheme: 'bearer',
  header_name: '',
  probe_path: '/',
  probe_ok_status: 200,
  webhook_verify: 'token',
  events: null,
  extra_fields: [],
};

const KINDS: { key: CustomConnectionSpec['kind']; label: string; blurb: string }[] = [
  {
    key: 'api',
    label: 'API',
    blurb: 'yeaboi polls a read-only REST API — its credentials are entered after creating it.',
  },
  {
    key: 'webhook',
    label: 'Webhook',
    blurb:
      'The service pushes deliveries to the yeaboi receiver — the delivery secret is minted for you.',
  },
  {
    key: 'mcp',
    label: 'MCP',
    blurb: 'yeaboi speaks to a remote MCP server — paste its URL (and token) after creating it.',
  },
];

const RARE_EVENT_PATHS = [
  'ref_path',
  'severity_path',
  'status_path',
  'url_path',
  'started_at_path',
  'service_path',
] as const;

/** Did the draft fill anything that lives in the collapsed Advanced section?
 *  If so it auto-opens — an autofill nobody can see is an autofill that
 *  didn't happen. */
function draftFillsAdvanced(draft: Partial<CustomConnectionSpec>): boolean {
  if (draft.detail) return true;
  if (draft.probe_ok_status !== undefined && draft.probe_ok_status !== 200) return true;
  return RARE_EVENT_PATHS.some((path) => Boolean(draft.events?.[path]));
}

/** Only the chosen kind's shape crosses the wire — a leftover from a previous
 *  kind choice (a header name, an events mapping) would be a validator refusal. */
function cleanForKind(spec: CustomConnectionSpec): CustomConnectionSpec {
  if (spec.kind === 'mcp') {
    return {
      ...spec,
      auth_scheme: 'bearer',
      header_name: '',
      probe_path: '/',
      probe_ok_status: 200,
      events: null,
      extra_fields: [],
    };
  }
  if (spec.kind === 'webhook') {
    // Rebuilt, not spread: an api-kind leftover `path`/`items_key` would make
    // the receiver dig every delivery for a key that is not there.
    const events = { kind: 'alert', title_path: '', ...spec.events };
    return {
      ...spec,
      auth_scheme: 'bearer',
      header_name: '',
      probe_path: '/',
      probe_ok_status: 200,
      extra_fields: [],
      events: { ...events, path: '', items_key: '' },
    };
  }
  return {
    ...spec,
    header_name: spec.auth_scheme === 'header' ? spec.header_name : '',
    events: spec.events?.path ? spec.events : null,
  };
}

function CreateCustomSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (key: string) => void;
}) {
  const [description, setDescription] = useState('');
  const [spec, setSpec] = useState<CustomConnectionSpec>(EMPTY_SPEC);
  const [problems, setProblems] = useState<string[]>([]);
  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [secretOnce, setSecretOnce] = useState('');
  const [advanced, setAdvanced] = useState(false);

  // The component stays mounted across opens; a fresh open must not replay the
  // previous run's spec, problems — or its once-only webhook secret.
  useEffect(() => {
    if (open) {
      setDescription('');
      setSpec(EMPTY_SPEC);
      setProblems([]);
      setSecretOnce('');
      setAdvanced(false);
    }
  }, [open]);

  const set = (patch: Partial<CustomConnectionSpec>) =>
    setSpec((current) => ({ ...current, ...patch }));
  const setEvents = (patch: Partial<NonNullable<CustomConnectionSpec['events']>>) =>
    setSpec((current) => ({
      ...current,
      events: { kind: 'alert', title_path: '', ...current.events, ...patch },
    }));

  const draft = async () => {
    setDrafting(true);
    setProblems([]);
    try {
      const result = await draftCustomConnection(description);
      // A draft with problems pre-fills the form — never a dead end.
      setSpec({ ...EMPTY_SPEC, ...result.draft } as CustomConnectionSpec);
      if (draftFillsAdvanced(result.draft)) setAdvanced(true);
      setProblems(result.problems);
    } catch (e) {
      setProblems([(e as Error).message]);
    } finally {
      setDrafting(false);
    }
  };

  const create = async () => {
    setSaving(true);
    setProblems([]);
    try {
      const row = await createCustomConnection({
        ...cleanForKind(spec),
        key:
          spec.key ||
          `custom_${spec.label
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')}`,
      });
      if (row.webhook_secret) {
        // Shown once here; /api/webhooks/{key}/url can show it again.
        setSecretOnce(row.webhook_secret);
        setTimeout(() => onCreated(row.key), 1200);
      } else {
        onCreated(row.key);
      }
    } catch (e) {
      // The validator's lines arrive joined with "; " — one per line reads better.
      setProblems((e as Error).message.split('; '));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="right" width="wide">
        <SheetHeader className="pr-12">
          <SheetTitle>Create a connection</SheetTitle>
          <SheetDescription className="text-left">
            Describe the service and let the draft fill every section, or fill them yourself —
            nothing saves until you create it. Fields marked * are required.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <div className="rounded-xl bg-secondary/30 p-3">
            <label className="block">
              <span className="text-[11px] font-body tracking-wide text-muted-foreground uppercase">
                Describe the service
              </span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={2}
                placeholder="e.g. Rollbar — read new error items from api.rollbar.com"
                className="mt-1 w-full resize-none rounded-lg border border-border/40 bg-card px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary/40 focus:outline-none"
              />
            </label>
            <Button
              size="xs"
              variant="secondary"
              className="mt-2"
              disabled={drafting || !description.trim()}
              onClick={() => void draft()}
            >
              <Sparkles aria-hidden className="mr-1 size-3" />
              {drafting ? 'Drafting…' : 'Draft it for me'}
            </Button>
          </div>

          <div className="space-y-2">
            <div
              role="radiogroup"
              aria-label="Connection kind"
              className="grid grid-cols-3 gap-1 rounded-xl bg-secondary/40 p-1"
            >
              {KINDS.map((kind) => (
                <button
                  key={kind.key}
                  type="button"
                  role="radio"
                  aria-checked={spec.kind === kind.key}
                  onClick={() => set({ kind: kind.key })}
                  className={cn(
                    'rounded-lg px-2 py-1.5 text-[12px] font-body transition-colors focus-visible:ring-1 focus-visible:ring-primary/50 focus-visible:outline-none',
                    spec.kind === kind.key
                      ? 'bg-card text-foreground shadow-sm ring-1 ring-border/60'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {kind.label}
                </button>
              ))}
            </div>
            <p className="text-[11.5px] text-muted-foreground/80">
              {KINDS.find((kind) => kind.key === spec.kind)?.blurb}
            </p>
          </div>

          <section className="space-y-3">
            <SectionHead title="Identity" hint="What the catalog calls it." />
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Name"
                required
                value={spec.label}
                onChange={(label) => set({ label })}
              />
              <Field
                label="Key · auto from name"
                mono
                value={spec.key}
                placeholder="custom_…"
                onChange={(key) => set({ key })}
              />
            </div>
            <Field
              label="One-line summary"
              required
              value={spec.summary}
              placeholder="What connecting it gives you, in one line"
              onChange={(summary) => set({ summary })}
            />
            <div className="grid grid-cols-2 gap-3">
              <SelectField
                label="Family"
                value={spec.family}
                options={FAMILY_OPTIONS}
                onChange={(family) => set({ family })}
              />
              <Field
                label="Docs URL · optional"
                mono
                value={spec.docs_url ?? ''}
                placeholder="https://…"
                onChange={(docs_url) => set({ docs_url })}
              />
            </div>
          </section>

          <section className="space-y-3">
            <SectionHead
              title="Appearance"
              hint="How its tile looks — an emoji, or your own image."
            />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Icon (emoji)" value={spec.glyph} onChange={(glyph) => set({ glyph })} />
              <AccentPicker value={spec.accent} onChange={(accent) => set({ accent })} />
            </div>
            <IconUpload value={spec.icon_data ?? ''} onChange={(icon_data) => set({ icon_data })} />
          </section>

          {spec.kind === 'mcp' ? (
            <section className="space-y-3">
              <SectionHead title="MCP server" />
              {/* No HTTP shape and no events mapping — an MCP connection is a
                  server URL plus an optional token, both entered afterwards as
                  credentials like any other connector's fields. */}
              <p className="rounded-xl bg-secondary/30 px-3 py-2.5 text-[12px] text-muted-foreground">
                yeaboi connects over MCP streamable HTTP — paste the server URL (and its bearer
                token, if it wants one) after creating it. Verify runs the MCP handshake and reports
                the server's name and tool count.
              </p>
            </section>
          ) : spec.kind === 'api' ? (
            <>
              <section className="space-y-3">
                <SectionHead
                  title="API access"
                  hint="How requests authenticate, and a cheap GET that proves a credential works."
                />
                <div className="grid grid-cols-2 gap-3">
                  <SelectField
                    label="Auth scheme"
                    value={spec.auth_scheme ?? 'bearer'}
                    options={['bearer', 'basic', 'header']}
                    onChange={(auth_scheme) =>
                      set({ auth_scheme: auth_scheme as CustomConnectionSpec['auth_scheme'] })
                    }
                  />
                  {spec.auth_scheme === 'header' && (
                    <Field
                      label="Header name"
                      required
                      mono
                      value={spec.header_name ?? ''}
                      onChange={(header_name) => set({ header_name })}
                    />
                  )}
                  <Field
                    label="Probe path"
                    mono
                    value={spec.probe_path ?? '/'}
                    onChange={(probe_path) => set({ probe_path })}
                    className="col-span-2"
                  />
                </div>
              </section>
              <section className="space-y-3">
                <SectionHead
                  title="Extra credentials · optional"
                  hint="For a service that needs more than one key — an app key beside the api key, or plain config. Values are entered after creating it."
                />
                <ExtraFieldsEditor
                  value={spec.extra_fields ?? []}
                  onChange={(extra_fields) => set({ extra_fields })}
                />
              </section>
              <section className="space-y-3">
                <SectionHead
                  title="Events endpoint · optional"
                  hint="A list endpoint whose rows become incidents, alerts or deploys in yeaboi's modes."
                />
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label="Path"
                    mono
                    value={spec.events?.path ?? ''}
                    placeholder="/v1/incidents"
                    onChange={(path) => setEvents({ path })}
                  />
                  <Field
                    label="Items key"
                    mono
                    value={spec.events?.items_key ?? ''}
                    placeholder="incidents"
                    onChange={(items_key) => setEvents({ items_key })}
                  />
                  <SelectField
                    label="Event kind"
                    value={spec.events?.kind ?? 'alert'}
                    options={['incident', 'alert', 'error_spike', 'deploy', 'spend_change']}
                    onChange={(kind) => setEvents({ kind })}
                  />
                  <Field
                    label="Title path"
                    mono
                    value={spec.events?.title_path ?? ''}
                    placeholder="name"
                    onChange={(title_path) => setEvents({ title_path })}
                  />
                </div>
              </section>
            </>
          ) : (
            <section className="space-y-3">
              <SectionHead
                title="Webhook delivery"
                hint="How a delivery authenticates, and how its rows become events."
              />
              <div className="grid grid-cols-2 gap-3">
                <SelectField
                  label="Delivery auth"
                  value={spec.webhook_verify ?? 'token'}
                  options={['token', 'hmac']}
                  onChange={(webhook_verify) =>
                    set({
                      webhook_verify: webhook_verify as CustomConnectionSpec['webhook_verify'],
                    })
                  }
                />
                <SelectField
                  label="Event kind"
                  value={spec.events?.kind ?? 'alert'}
                  options={['incident', 'alert', 'error_spike', 'deploy', 'spend_change']}
                  onChange={(kind) => setEvents({ kind })}
                />
                <Field
                  label="Title path (dot path into a delivery)"
                  required
                  mono
                  value={spec.events?.title_path ?? ''}
                  placeholder="incident.name"
                  onChange={(title_path) => setEvents({ title_path })}
                  className="col-span-2"
                />
              </div>
            </section>
          )}

          <div className="rounded-xl border border-border/40">
            <button
              type="button"
              aria-expanded={advanced}
              onClick={() => setAdvanced((current) => !current)}
              className="flex w-full items-center justify-between px-3 py-2 text-[12px] font-body text-muted-foreground hover:text-foreground focus-visible:ring-1 focus-visible:ring-primary/50 focus-visible:outline-none"
            >
              Advanced · optional
              <ChevronDown
                aria-hidden
                className={cn('size-3.5 transition-transform', advanced && 'rotate-180')}
              />
            </button>
            {advanced && (
              <div className="space-y-3 px-3 pb-3">
                <label className="block">
                  <span className="text-[11px] font-body tracking-wide text-muted-foreground uppercase">
                    What is read
                  </span>
                  <textarea
                    value={spec.detail ?? ''}
                    onChange={(event) => set({ detail: event.target.value })}
                    rows={2}
                    placeholder="1-3 sentences on what is read — and what never is"
                    className="mt-1 w-full resize-none rounded-lg border border-border/40 bg-secondary/40 px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary/40 focus:outline-none"
                  />
                </label>
                {spec.kind === 'api' && (
                  <Field
                    label="Probe OK status"
                    mono
                    value={String(spec.probe_ok_status ?? 200)}
                    onChange={(status) => set({ probe_ok_status: Number(status) || 200 })}
                  />
                )}
                {(spec.kind === 'webhook' || (spec.kind === 'api' && spec.events?.path)) && (
                  <div className="grid grid-cols-2 gap-3">
                    {RARE_EVENT_PATHS.map((path) => (
                      <Field
                        key={path}
                        label={path.replace(/_/g, ' ')}
                        mono
                        value={spec.events?.[path] ?? ''}
                        onChange={(value) => setEvents({ [path]: value })}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {problems.length > 0 && (
            <ul role="alert" className="space-y-0.5 text-[12px] text-destructive">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}
          {secretOnce && (
            <p role="status" className="text-[12px] text-success">
              Created — the delivery secret is in the connection's panel (shown once here:{' '}
              <code className="font-mono">{secretOnce}</code>)
            </p>
          )}

          <Button
            size="sm"
            disabled={saving || !spec.label.trim() || !spec.summary.trim()}
            onClick={() => void create()}
          >
            {saving ? 'Creating…' : 'Create connection'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SectionHead({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <h4 className="text-[11px] font-body font-semibold tracking-[0.12em] text-foreground/80 uppercase">
        {title}
      </h4>
      {hint && <p className="mt-0.5 text-[11.5px] text-muted-foreground/80">{hint}</p>}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder = '',
  mono = false,
  required = false,
  className = '',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  mono?: boolean;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={cn('block', className)}>
      <span className="text-[11px] font-body tracking-wide text-muted-foreground uppercase">
        {label}
        {required && (
          <span aria-hidden className="ml-0.5 text-destructive">
            *
          </span>
        )}
      </span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        aria-required={required || undefined}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          'mt-1 w-full rounded-lg border border-border/40 bg-secondary/40 px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary/40 focus:outline-none',
          mono && 'font-mono',
        )}
      />
    </label>
  );
}

/** A spread of distinct hues; the validator refuses an accent another
 *  connection already wears, so these deliberately match no built-in. */
const ACCENT_PRESETS = [
  'rgb(224,82,99)',
  'rgb(233,140,54)',
  'rgb(240,200,60)',
  'rgb(88,178,105)',
  'rgb(64,169,180)',
  'rgb(86,132,226)',
  'rgb(150,105,224)',
  'rgb(219,105,180)',
  'rgb(120,160,200)',
];

function rgbToHex(accent: string): string {
  const m = /^rgb\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})\)$/.exec((accent || '').trim());
  if (!m) return '#7890c8';
  return `#${m
    .slice(1)
    .map((part) => Math.min(255, Number(part)).toString(16).padStart(2, '0'))
    .join('')}`;
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) || 0;
  const g = parseInt(hex.slice(3, 5), 16) || 0;
  const b = parseInt(hex.slice(5, 7), 16) || 0;
  return `rgb(${r},${g},${b})`;
}

/** The accent as a swatch bar plus a colour-wheel picker — the wire's
 *  rgb(r,g,b) string is derived, never typed. */
function AccentPicker({ value, onChange }: { value: string; onChange: (accent: string) => void }) {
  return (
    <div>
      <span className="text-[11px] font-body tracking-wide text-muted-foreground uppercase">
        Accent
      </span>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {ACCENT_PRESETS.map((accent) => (
          <button
            key={accent}
            type="button"
            aria-label={`Accent ${accent}`}
            aria-pressed={value === accent}
            onClick={() => onChange(accent)}
            className={cn(
              'size-5 rounded-full ring-1 ring-border/40 transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:outline-none',
              value === accent && 'scale-110 ring-2 ring-foreground/70',
            )}
            style={{ backgroundColor: accent }}
          />
        ))}
        <label
          className="relative ml-0.5 inline-flex size-5 cursor-pointer overflow-hidden rounded-full ring-1 ring-border/40"
          title="Custom colour"
        >
          <input
            type="color"
            value={rgbToHex(value)}
            aria-label="Custom accent colour"
            onChange={(event) => onChange(hexToRgb(event.target.value))}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
          <span
            aria-hidden
            className="size-full"
            style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}
          />
        </label>
      </div>
      <code className="mt-1.5 block font-mono text-[10.5px] text-muted-foreground/70">{value}</code>
    </div>
  );
}

/** The uploaded tile image: any raster the browser can read, downscaled to a
 *  128px square PNG data URI client-side. The backend re-validates mime,
 *  magic bytes and the 64KB cap — and refuses SVG outright. */
function IconUpload({ value, onChange }: { value: string; onChange: (icon: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const readFile = (file: File) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const edge = 128;
      const canvas = document.createElement('canvas');
      canvas.width = edge;
      canvas.height = edge;
      const ctx = canvas.getContext('2d');
      if (ctx && image.width > 0 && image.height > 0) {
        const scale = Math.max(edge / image.width, edge / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        ctx.drawImage(image, (edge - width) / 2, (edge - height) / 2, width, height);
        onChange(canvas.toDataURL('image/png'));
      }
      URL.revokeObjectURL(url);
    };
    image.onerror = () => URL.revokeObjectURL(url);
    image.src = url;
  };
  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) readFile(file);
          event.target.value = '';
        }}
      />
      {value ? (
        <>
          <img
            src={value}
            alt="Icon preview"
            className="size-9 rounded-lg object-cover ring-1 ring-border/40"
          />
          <Button size="xs" variant="secondary" onClick={() => onChange('')}>
            <X aria-hidden className="mr-1 size-3" />
            Remove image
          </Button>
        </>
      ) : (
        <Button size="xs" variant="secondary" onClick={() => inputRef.current?.click()}>
          <ImagePlus aria-hidden className="mr-1 size-3" />
          Upload image · optional
        </Button>
      )}
    </div>
  );
}

/** Up to four extra fields beyond the auth scheme — the app-key-beside-api-key
 *  shape. Shapes only: the env is derived server-side, values are entered
 *  after creating the connection. */
function ExtraFieldsEditor({
  value,
  onChange,
}: {
  value: CustomExtraField[];
  onChange: (next: CustomExtraField[]) => void;
}) {
  const update = (index: number, patch: Partial<CustomExtraField>) =>
    onChange(value.map((field, i) => (i === index ? { ...field, ...patch } : field)));
  return (
    <div className="space-y-2">
      {value.map((field, index) => (
        <div key={index} className="space-y-2 rounded-xl bg-secondary/30 p-2.5">
          <div className="grid grid-cols-2 gap-2">
            <Field
              label="Label"
              required
              value={field.label}
              placeholder="Application Key"
              onChange={(label) => update(index, { label })}
            />
            <Field
              label="Env suffix"
              required
              mono
              value={field.env_suffix}
              placeholder="APP_KEY"
              onChange={(env_suffix) => update(index, { env_suffix: env_suffix.toUpperCase() })}
            />
            <Field
              label="Request header · optional"
              mono
              value={field.header_name ?? ''}
              placeholder="DD-Application-Key"
              onChange={(header_name) => update(index, { header_name })}
            />
            <label className="flex items-end gap-2 pb-2 text-[12px] text-muted-foreground">
              <input
                type="checkbox"
                checked={field.secret ?? true}
                onChange={(event) => update(index, { secret: event.target.checked })}
                className="accent-primary"
              />
              secret — masked once saved
            </label>
          </div>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => onChange(value.filter((_, i) => i !== index))}
          >
            <X aria-hidden className="mr-1 size-3" />
            Remove field
          </Button>
        </div>
      ))}
      {value.length < 4 && (
        <Button
          size="xs"
          variant="secondary"
          onClick={() =>
            onChange([...value, { label: '', env_suffix: '', secret: true, header_name: '' }])
          }
        >
          <Plus aria-hidden className="mr-1 size-3" />
          Add a field
        </Button>
      )}
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-body tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-border/40 bg-secondary/40 px-3 py-2 text-[13px] text-foreground focus:ring-1 focus:ring-primary/40 focus:outline-none"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
