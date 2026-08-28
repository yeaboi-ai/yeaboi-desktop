'use client';

// Niko's answers, rendered.
//
// Ported from the planning platform's chat widget, where it was file-local. The
// override map is the point: react-markdown's defaults are document-sized, and
// these bubbles are 13px in a 560px bar. remark-gfm is here for the tables and
// strikethrough Niko's answers actually use.
//
// Every override re-runs highlightChildren with ONE Set per message, so a
// glossary term is decorated the first time it appears and left alone after —
// otherwise a term repeated six times in an answer lights up six times.

import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { highlightChildren } from '@/lib/highlight-glossary';

export function NikoMarkdown({ content }: { content: string }) {
  const seen = new Set<string>();
  const mark = (children: ReactNode) => highlightChildren(children, seen);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <p className="text-[13px] font-body text-foreground/90 leading-relaxed mb-2 last:mb-0">
            {mark(children)}
          </p>
        ),
        ul: ({ children }) => (
          <ul className="text-[13px] font-body text-foreground/90 mb-2 ml-4 list-disc space-y-0.5">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="text-[13px] font-body text-foreground/90 mb-2 ml-4 list-decimal space-y-0.5">
            {children}
          </ol>
        ),
        li: ({ children }) => (
          <li className="text-[13px] font-body text-foreground/90">{mark(children)}</li>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-foreground">{mark(children)}</strong>
        ),
        // react-markdown dropped the `inline` prop; a fenced block is the one
        // that arrives with a `language-*` class, and it is already inside <pre>.
        code: ({ children, className }) =>
          className?.includes('language-') ? (
            <code className="text-[11px] font-mono text-foreground/70">{children}</code>
          ) : (
            <code className="text-[11px] font-mono bg-foreground/5 border border-border/50 rounded px-1 py-0.5 text-foreground/80">
              {children}
            </code>
          ),
        pre: ({ children }) => (
          <pre className="text-[11px] font-mono bg-background border border-border/50 rounded-lg p-3 mb-2 overflow-x-auto">
            {children}
          </pre>
        ),
        a: ({ children, href }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            {children}
          </a>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
