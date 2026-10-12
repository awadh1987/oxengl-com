import React from 'react';

const HIGHLIGHT_PATTERN = /\[highlight\](.*?)\[\/highlight\]/gis;

/** Splits `[highlight]...[/highlight]` tokens into accent-styled spans; everything else stays plain text. */
export function renderHighlighted(text: string, className = 'highlight-text'): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(HIGHLIGHT_PATTERN)) {
    const start = match.index ?? 0;
    if (start > last) nodes.push(text.slice(last, start));
    if (match[1]) nodes.push(<span key={start} className={className}>{match[1]}</span>);
    last = start + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}
