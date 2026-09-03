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
