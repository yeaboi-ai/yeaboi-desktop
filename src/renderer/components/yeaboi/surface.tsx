'use client';

// A deck surface: the page fills the port rather than sitting as a narrow
// column in the middle of it.
//
// It carries no content of its own. What fills the width has to come from the
// page — a panel of the same four hints on every surface is the same page
// wearing seven titles.

export function Surface({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[calc(100vh-var(--titlebar-h))] px-8 py-8">{children}</div>;
}

export function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-card p-4 ring-1 ring-border/60">
      <h2 className="font-body text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** One past run of a ceremony. The figures carry their own labels rather than
 *  sitting in boxes: three bordered chips inside a bordered card is three
 *  frames deep for two numbers and a date. */
export function RunCard({
  title,
  meta,
  figures,
  children,
}: {
  title: string;
  meta?: string;
  figures: { label: string; value: string }[];
  children?: React.ReactNode;
}) {
  return (
    <article className="flex flex-col rounded-2xl bg-card p-4 ring-1 ring-border/60">
      <p className="truncate font-body text-[13px] font-medium text-foreground">{title}</p>
      {meta && <p className="mt-0.5 font-code text-[11px] text-muted-foreground/70">{meta}</p>}
      <dl className="mt-4 flex gap-6">
        {figures.map((figure) => (
          <div key={figure.label}>
            <dd className="font-body text-[20px] leading-none text-foreground">{figure.value}</dd>
            <dt className="mt-1.5 font-body text-[10px] uppercase tracking-wide text-muted-foreground/70">
              {figure.label}
            </dt>
          </div>
        ))}
      </dl>
      {children && <div className="mt-4">{children}</div>}
    </article>
  );
}
