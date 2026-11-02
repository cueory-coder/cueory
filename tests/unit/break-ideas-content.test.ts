import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import data from '../../content/breaks/ideas.json';
import BreakIdeasList from '../../src/islands/BreakIdeasList';
import { MAX_IDEA_CHARACTERS, parseIdeas } from '../../src/islands/breakideas';

describe('held break-idea sample content', () => {
  it('labels the twenty-idea content envelope as a sample', () => {
    expect(Object.keys(data).sort()).toEqual(['ideas', 'sample']);
    expect(data.sample).toBe(true);
    expect(data.ideas).toHaveLength(20);
  });

  it('passes the unchanged parser without silently losing or altering ideas', () => {
    const parsed = parseIdeas({ ideas: data.ideas });
    expect(parsed).toEqual(data.ideas);
    expect(new Set(parsed.map(idea => idea.id)).size).toBe(parsed.length);
    expect(new Set(parsed.map(idea => idea.text)).size).toBe(parsed.length);
  });

  it.each(data.ideas)('$id is visible, plain text within the character limit', idea => {
    expect(Array.from(idea.text).length).toBeGreaterThan(0);
    expect(Array.from(idea.text).length).toBeLessThanOrEqual(MAX_IDEA_CHARACTERS);
    expect(parseIdeas({ ideas: [idea] })).toEqual([idea]);
  });

  it('renders every idea before JavaScript and disables the unhydrated controls', () => {
    const html = renderToStaticMarkup(createElement(BreakIdeasList, { ideas: parseIdeas({ ideas: data.ideas }) }));
    for (const idea of data.ideas) expect(html).toContain(idea.text);
    expect(html.match(/<li\b/g)).toHaveLength(20);
    expect(html.match(/<button[^>]*\bdisabled=""/g)).toHaveLength(2);
    expect(html).not.toContain('data-testid="picked-break-idea"');
  });

  it('renders an empty list honestly without inventing an idea', () => {
    const html = renderToStaticMarkup(createElement(BreakIdeasList, { ideas: [] }));
    expect(html).toContain('there are no break ideas here yet.');
    expect(html).not.toContain('<li');
  });
});
