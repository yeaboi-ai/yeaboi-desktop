'use client';

// Ceremonies · Slack — the inbound half of the clock.
//
// A team reacting or replying in Slack, read back on a schedule and applied to
// the run the post was about. Linking is offered here because this is a machine
// its owner is sitting at: the binding decides whose name goes on somebody
// else's report, which is the one thing Slack's servers did not attest.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DuckMark } from '@/components/brand/duck';
import { type SlackPage, linkSlackMember, loadSlack, pollSlack } from '@/lib/yeaboi/ops';
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
    <div className="rounded-2xl bg-card ring-1 ring-border/60 p-4">
      <p className="text-[13px] font-medium text-foreground">{title}</p>
      {items.map((item) => (
        <p key={item} className="text-[12px] text-muted-foreground mt-1">
          {item}
        </p>
      ))}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-secondary/40 px-3 py-2">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-[13px] font-medium text-foreground">{value}</p>
    </div>
  );
}

function Table({
  head,
  rows,
  empty,
}: {
  head: string[];
  rows: { key: string; cells: React.ReactNode[] }[];
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="text-[12px] text-muted-foreground">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr>
            {head.map((header, index) => (
              <th
                // eslint-disable-next-line react/no-array-index-key -- headers are positional
                key={index}
                className="py-1 pr-3 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              {row.cells.map((cell, index) => (
                <td
                  // eslint-disable-next-line react/no-array-index-key -- cells are positional
                  key={index}
                  className="py-1.5 pr-3 border-t border-border/40 align-top text-muted-foreground"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const inputClass =
  'mt-1 w-full rounded-lg bg-secondary/40 border border-border/40 px-3 py-2 text-[13px] font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40';

function CeremoniesSlackBody() {
  const [page, setPage] = useState<SlackPage | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [slackUser, setSlackUser] = useState('');
  const [member, setMember] = useState('');
  const [busy, setBusy] = useState(false);

  function refresh() {
    return loadSlack().then(setPage, (e: Error) => setError(e.message));
  }

  useEffect(() => {
    void refresh();
  }, []);

  if (error && !page) return <Notice title="Could not read the Slack lane" items={[error]} />;
  if (!page) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  async function act(work: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await work();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-foreground">Ceremonies · Slack</h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            Reactions and replies, read back and applied to the run they answered.
          </p>
        </div>
        <Link
          href="/ceremonies"
          className="shrink-0 text-[12px] text-muted-foreground hover:text-foreground"
        >
          Back to the schedule
        </Link>
      </header>

      {error && <Notice title="That did not work" items={[error]} />}
      {notice && <Notice title="Poll" items={[notice]} />}

      {!page.two_way ? (
        <Section title="Write-only">
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <DuckMark state="idle" size={28} /> {page.empty_message}
          </div>
          <p className="text-[12px] text-muted-foreground mt-2">{page.why}</p>
        </Section>
      ) : (
        <>
          <Section title="The lane">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <Tile label="Linked people" value={String(page.linked)} />
              <Tile
                label="Polls every"
                value={page.interval_min ? `${page.interval_min} min` : 'not installed'}
              />
            </div>
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  const result = await pollSlack();
                  // A poll that declines is not a failure: it read a fixed
                  // window, found nothing it was allowed to act on, and said so.
                  setNotice(
                    result.declined
                      ? `Declined: ${result.outcome}`
                      : `${result.events_applied} applied of ${result.events_seen} seen.`,
                  );
                })
              }
            >
              Poll now
            </Button>
          </Section>

          <Section title="Who is who">
            <p className="text-[12px] text-muted-foreground mb-3">{page.link_hint}</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <label className="block">
                <span className="text-[11px] font-body text-muted-foreground uppercase tracking-wide">
                  Slack id
                </span>
                <input
                  type="text"
                  value={slackUser}
                  placeholder="U0123456789"
                  onChange={(e) => setSlackUser(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-body text-muted-foreground uppercase tracking-wide">
                  Roster name
                </span>
                <input
                  type="text"
                  value={member}
                  onChange={(e) => setMember(e.target.value)}
                  className={inputClass}
                />
              </label>
            </div>
            <div className="mb-3">
              <Button
                variant="outline"
                size="sm"
                disabled={busy || !slackUser || !member}
                onClick={() =>
                  void act(async () => {
                    await linkSlackMember(slackUser, member);
                    setSlackUser('');
                    setMember('');
                  })
                }
              >
                Link
              </Button>
            </div>
            <Table
              head={['Slack id', 'Roster name', '']}
              empty="Nobody linked yet."
              rows={page.identities.map((row) => ({
                key: row.slack_user,
                cells: [
                  row.slack_user,
                  row.member,
                  <Button
                    key="unlink"
                    variant="ghost"
                    size="xs"
                    disabled={busy}
                    onClick={() => void act(() => linkSlackMember(row.slack_user, '', true))}
                  >
                    Unlink
                  </Button>,
                ],
              }))}
            />
          </Section>

          <Section title="What Slack asked for">
            <p className="text-[12px] text-muted-foreground mb-3">
              Every event the lane considered, including the refused ones — &quot;you are not on the
              list&quot;, &quot;I could not tell what you meant&quot; and &quot;the write said
              no&quot; are different problems.
            </p>
            <Table
              head={['When', 'Who', 'Asked for', 'Outcome', 'Detail']}
              empty="Nothing inbound yet."
              rows={page.events.map((row, index) => ({
                key: `${String(row['created_at'] ?? '')}-${index}`,
                cells: [
                  String(row['created_at'] ?? ''),
                  String(row['slack_user'] ?? ''),
                  String(row['verb'] ?? ''),
                  String(row['outcome'] ?? ''),
                  String(row['detail'] ?? ''),
                ],
              }))}
            />
          </Section>
        </>
      )}
    </div>
  );
}

export default function CeremoniesSlackPage() {
  return (
    <PageShell width="narrow">
      <BackendGate>
        <CeremoniesSlackBody />
      </BackendGate>
    </PageShell>
  );
}
