'use client';

// The line under a mode page's title when it runs inside a project: which
// project, and the one way out of it.

export function ProjectScopeLine({ name, onClear }: { name: string; onClear: () => void }) {
  return (
    <p className="text-[13px] font-body text-muted-foreground">
      Inside <span className="font-medium text-foreground">{name}</span>
      <button
        type="button"
        onClick={onClear}
        className="ml-3 text-primary transition-colors hover:underline"
      >
        Run as a one-off instead
      </button>
    </p>
  );
}
