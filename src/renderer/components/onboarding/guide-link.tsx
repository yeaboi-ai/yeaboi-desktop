'use client';

// "Where do I get this key?" — an external link plus the minimum-scope hint,
// fed from the backend's token_help/help_url data. Links open in the OS
// browser via main's window-open handler.

export function GuideLink({ url, scope }: { url: string; scope?: string }) {
  if (!url) return null;
  return (
    <p className="mt-1.5 text-[11px] text-muted-foreground/80 leading-snug">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="text-primary hover:underline break-all"
      >
        Create a key ↗
      </a>
      {scope ? <span className="text-muted-foreground/70"> — {scope}</span> : null}
    </p>
  );
}
