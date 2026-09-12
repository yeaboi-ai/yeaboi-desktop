'use client';

// One row of the transcript. The engine speaks on the left in markdown, the
// reader on the right in a tinted bubble, a notice is a dim line between.

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Bubble as BubbleRow } from '@/lib/yeaboi/chat';

export function Prose({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <p className="mb-2 text-[13.5px] leading-relaxed text-foreground/90 last:mb-0">
            {children}
          </p>
        ),
        ul: ({ children }) => (
          <ul className="mb-2 ml-4 list-disc space-y-0.5 text-[13.5px] text-foreground/90">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-2 ml-4 list-decimal space-y-0.5 text-[13.5px] text-foreground/90">
            {children}
          </ol>
        ),
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        strong: ({ children }) => (
          <strong className="font-medium text-foreground">{children}</strong>
        ),
        code: ({ children }) => (
          <code className="rounded bg-secondary/60 px-1 py-0.5 font-mono text-[12px]">
            {children}
          </code>
        ),
        h1: ({ children }) => (
          <p className="mb-1 font-display text-[18px] text-foreground">{children}</p>
        ),
        h2: ({ children }) => (
          <p className="mb-1 font-display text-[16px] text-foreground">{children}</p>
        ),
        h3: ({ children }) => (
          <p className="mb-1 font-display text-[15px] text-foreground">{children}</p>
        ),
        a: ({ children, href }) => (
          <a href={href} className="text-primary underline-offset-2 hover:underline">
            {children}
          </a>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

export function Bubble({ bubble }: { bubble: BubbleRow }) {
  if (bubble.role === 'notice') {
    return <p className="py-1 text-center text-[12px] text-muted-foreground/70">{bubble.text}</p>;
  }
  if (bubble.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[78%] rounded-2xl bg-primary/12 px-4 py-2.5">
          <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-foreground">
            {bubble.text}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="max-w-[88%]">
      <p className="mb-1 font-display text-[13px] italic text-muted-foreground">yeaboi</p>
      <Prose text={bubble.text} />
    </div>
  );
}
