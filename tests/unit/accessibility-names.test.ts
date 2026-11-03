import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dist = fileURLToPath(new URL('../../dist/', import.meta.url));

function htmlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = join(dir, name);
    return statSync(file).isDirectory() ? htmlFiles(file) : file.endsWith('.html') ? [file] : [];
  });
}

function attribute(attrs: string, name: string): string | undefined {
  return new RegExp(`\\b${name}="([^"]*)"`, 'i').exec(attrs)?.[1];
}

function tagEnd(markup: string, start: number): number {
  let quote: string | undefined;
  for (let index = start; index < markup.length; index += 1) {
    const character = markup[index];
    if (quote) {
      if (character === quote) quote = undefined;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '>') {
      return index;
    }
  }
  return markup.length - 1;
}

function tagName(tag: string): string {
  let start = tag.startsWith('</') ? 2 : 1;
  while (start < tag.length && /\s/.test(tag[start])) start += 1;
  let end = start;
  while (end < tag.length && /[A-Za-z0-9-]/.test(tag[end])) end += 1;
  return tag.slice(start, end).toLowerCase();
}

function removeExecutableElements(markup: string): string {
  let output = '';
  let index = 0;

  while (index < markup.length) {
    const start = markup.indexOf('<', index);
    if (start === -1) return output + markup.slice(index);
    output += markup.slice(index, start);
    const end = tagEnd(markup, start + 1);
    const tag = markup.slice(start, end + 1);
    const name = tagName(tag);
    if (tag.startsWith('</') || (name !== 'script' && name !== 'style')) {
      output += tag;
      index = end + 1;
      continue;
    }

    const closingStart = markup.toLowerCase().indexOf(`</${name}`, end + 1);
    if (closingStart === -1) return output;
    index = tagEnd(markup, closingStart + name.length + 2) + 1;
  }

  return output;
}

function hasHiddenAttribute(attributes: string): boolean {
  const normalized = attributes.toLowerCase();
  if (normalized.includes(' hidden') || normalized.startsWith('hidden')) return true;
  const marker = 'aria-hidden';
  const markerStart = normalized.indexOf(marker);
  if (markerStart === -1) return false;
  const equals = normalized.indexOf('=', markerStart + marker.length);
  if (equals === -1) return false;
  const value = normalized.slice(equals + 1).trimStart();
  const quote = value[0];
  return (quote === '"' || quote === "'") && value.slice(1).startsWith(`true${quote}`);
}

function visibleText(markup: string): string {
  const stack: Array<{ name: string; suppressed: boolean }> = [];
  let output = '';
  let index = 0;

  while (index < markup.length) {
    if (markup.startsWith('<!--', index)) {
      const commentEnd = markup.indexOf('-->', index + 4);
      index = commentEnd === -1 ? markup.length : commentEnd + 3;
      continue;
    }
    if (markup[index] !== '<') {
      const nextTag = markup.indexOf('<', index);
      const end = nextTag === -1 ? markup.length : nextTag;
      if (!stack.some((entry) => entry.suppressed)) output += markup.slice(index, end);
      index = end;
      continue;
    }

    const end = tagEnd(markup, index + 1);
    const tag = markup.slice(index, end + 1);
    const name = tagName(tag);
    if (tag.startsWith('</')) {
      const stackIndex = stack.map((entry) => entry.name).lastIndexOf(name);
      if (stackIndex !== -1) stack.splice(stackIndex, 1);
    } else if (!tag.endsWith('/>') && !['area', 'base', 'br', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'].includes(name)) {
      stack.push({
        name,
        suppressed: stack.some((entry) => entry.suppressed) || ['noscript', 'script', 'style'].includes(name) || hasHiddenAttribute(tag.slice(name.length + 1, -1)),
      });
    }
    index = end + 1;
  }

  return output
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

describe('accessible-name text extraction', () => {
  it('ignores hidden descendants and executable markup', () => {
    expect(visibleText('<span aria-hidden="true">→</span> <span>learn</span>')).toBe('learn');
    expect(visibleText('<script>"<style>fake</style>"</script><b>real</b>')).toBe('real');
  });
});

describe.skipIf(!existsSync(dist))('built control names', () => {
  it('gives every link and button an accessible name', () => {
    for (const file of htmlFiles(dist)) {
      const html = removeExecutableElements(readFileSync(file, 'utf8'));
      const ids = new Set([...html.matchAll(/\bid="([^"]+)"/gi)].map((match) => match[1]));
      const controls = /<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
      let match: RegExpExecArray | null;
      while ((match = controls.exec(html))) {
        const [, kind, attrs, content] = match;
        const label = attribute(attrs, 'aria-label');
        const labelledBy = attribute(attrs, 'aria-labelledby');
        const text = visibleText(content);
        const referencesExistingId = labelledBy?.split(/\s+/).every((id) => ids.has(id)) ?? false;
        expect(label?.trim() || text || (labelledBy && referencesExistingId), `${file}: unnamed ${kind}`).toBeTruthy();
      }
    }
  });
});
