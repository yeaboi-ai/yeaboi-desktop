'use client';

// Catalog prose with its URLs rendered as real links (shown without the
// protocol; opened in the OS browser by main's window-open handler).

const URL_RE = /(https?:\/\/[^\s]+?)([.,;)]?)(\s|$)/g;

export function Linkified({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    const [, url, punct, space] = match;
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(
      <a
        key={match.index}
        href={url}
        target="_blank"
        rel="noreferrer"
        className="text-primary hover:underline"
      >
        {url?.replace(/^https?:\/\//, '')}
      </a>,
    );
    parts.push(`${punct}${space}`);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
