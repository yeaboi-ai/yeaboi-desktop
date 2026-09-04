'use client';

// A deck surface: the page fills the port rather than sitting as a narrow
// column in the middle of it.
//
// It carries no content of its own. What fills the width has to come from the
// page — a panel of the same four hints on every surface is the same page
// wearing seven titles.
//
// The surface is exactly as tall as the port and never grows past it. A page
// with more than fits scrolls *inside* here, which is what keeps the window
// still: the title stays where it is and nothing slides under the dock.

export function Surface({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col px-8 pt-8">
      {/* Capped on a wide screen. Past about this width a row of tiles stops
          being a row and becomes a stripe, and the eye has to travel the whole
          window to read three words. Centred in the space the rail leaves. */}
      {/* The padding is the ring's: a focus or selection ring paints outside
          its element, and a scroll box clips at its edge — without this the
          highlight on the top row comes out with a flat side. */}
      <div className="mx-auto min-h-0 w-full max-w-[1360px] flex-1 overflow-y-auto overscroll-contain px-1 pb-8 pt-1">
        <div className="h-full">{children}</div>
      </div>
    </div>
  );
}

export function Panel({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-card p-5 ring-1 ring-border/60">
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-body text-[13px] font-medium text-foreground">{title}</h2>
        {aside}
      </header>
      {children}
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
