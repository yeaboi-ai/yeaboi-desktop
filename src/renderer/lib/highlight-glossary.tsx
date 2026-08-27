'use client';

import { Children, isValidElement, type ReactNode } from 'react';
import { GLOSSARY_REGEX, lookupGlossary } from '@/lib/glossary';
import { GlossaryTerm } from '@/components/glossary-term';
import { shouldHighlight } from '@/lib/term-learning-state';

/**
 * Wrap any glossary-matched terms in a raw string with <GlossaryTerm>.
 * Each slug is highlighted at most once per call — pass a shared `seen` Set
 * across a single message render to avoid noisy repeats.
 */
function highlightStringWithGlossary(text: string, seen: Set<string>): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  // The shared regex is /g, so clone via new RegExp to avoid carrying
  // lastIndex state across calls.
  const re = new RegExp(GLOSSARY_REGEX.source, GLOSSARY_REGEX.flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const entry = lookupGlossary(match[0]);
    if (!entry || seen.has(entry.slug)) continue;
    // Soft suppression: once the user has dismissed this term enough times,
    // leave it as plain text. Still tracked in `seen` so we wouldn't pick a
    // later occurrence either — keeps behavior consistent across the message.
    seen.add(entry.slug);
    if (!shouldHighlight(entry.slug)) continue;
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    nodes.push(
      <GlossaryTerm key={`${entry.slug}-${match.index}`} matchedText={match[0]} entry={entry} />,
    );
    cursor = match.index + match[0].length;
  }
  if (cursor === 0) return [text];
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

/**
 * Walk ReactMarkdown children, wrapping matched glossary terms in string
 * leaves. Returns React elements unchanged so we don't descend into
 * <code>, <a>, or earlier highlighted nodes.
 */
export function highlightChildren(children: ReactNode, seen: Set<string>): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child === 'string') return highlightStringWithGlossary(child, seen);
    if (isValidElement(child)) return child;
    return child;
  });
}
