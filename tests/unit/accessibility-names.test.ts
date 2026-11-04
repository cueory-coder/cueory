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

const ENTITY_MAP: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

function decodeEntities(text: string): string {
  return text.replace(/&(?:nbsp|amp|lt|gt|quot|#39);/gi, (entity) => ENTITY_MAP[entity.toLowerCase()] ?? entity);
}

function visibleText(markup: string, includeHidden = false): string {
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
        suppressed:
          stack.some((entry) => entry.suppressed) ||
          ['noscript', 'script', 'style'].includes(name) ||
          (!includeHidden && hasHiddenAttribute(tag.slice(name.length + 1, -1))),
      });
    }
    index = end + 1;
  }

  return decodeEntities(output)
    .replace(/\s+/g, ' ')
    .trim();
}

function referencedText(html: string, labelledBy?: string): string {
  if (!labelledBy) return '';
  const ids = labelledBy.trim().split(/\s+/).filter(Boolean);
  if (ids.length === 0) return '';
  const parts: string[] = [];
  for (const id of ids) {
    const elem = elementById(html, id);
    if (!elem) return '';
    const label = attribute(elem.attrs, 'aria-label')?.trim();
    const text = label || visibleText(elem.content, true);
    if (!text) return '';
    parts.push(text);
  }
  return parts.join(' ').trim();
}

function elementById(html: string, id: string): { attrs: string; content: string } | null {
  const openRegex = /<([a-zA-Z0-9:-]+)\b([^>]*)>/gi;
  let match: RegExpExecArray | null;
  while ((match = openRegex.exec(html))) {
    const [fullTag, name, attrs] = match;
    const idMatch = /\bid="([^"]+)"/i.exec(attrs);
    if (idMatch && idMatch[1] === id) {
      const tagLower = name.toLowerCase();
      if (
        fullTag.endsWith('/>') ||
        ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'].includes(tagLower)
      ) {
        return { attrs, content: '' };
      }
      const startIndex = match.index + fullTag.length;
      let depth = 1;
      const tagRegex = new RegExp(`</?${name}\\b[^>]*>`, 'gi');
      tagRegex.lastIndex = startIndex;
      let next: RegExpExecArray | null;
      while ((next = tagRegex.exec(html))) {
        if (next[0].startsWith('</')) {
          depth -= 1;
          if (depth === 0) {
            return { attrs, content: html.slice(startIndex, next.index) };
          }
        } else if (!next[0].endsWith('/>')) {
          depth += 1;
        }
      }
      return { attrs, content: html.slice(startIndex) };
    }
  }
  return null;
}

export function computeAccessibleName(html: string, attrs: string, content: string): string {
  const label = attribute(attrs, 'aria-label');
  if (label?.trim()) return label.trim();
  const labelledBy = attribute(attrs, 'aria-labelledby');
  const refText = referencedText(html, labelledBy);
  if (refText) return refText;
  return visibleText(content);
}

describe('accessible-name text extraction', () => {
  it('ignores hidden descendants and executable markup', () => {
    expect(visibleText('<span aria-hidden="true">→</span> <span>learn</span>')).toBe('learn');
    expect(visibleText('<script>"<style>fake</style>"</script><b>real</b>')).toBe('real');
  });

  it('rejects controls that only contain hidden content', () => {
    expect(computeAccessibleName('', '', '<span aria-hidden="true">→</span>')).toBe('');
  });

  it('resolves referenced label text and rejects empty referenced elements', () => {
    const htmlWithEmpty = '<span id="empty"></span><button aria-labelledby="empty"></button>';
    expect(computeAccessibleName(htmlWithEmpty, 'aria-labelledby="empty"', '')).toBe('');

    const htmlWithText = '<span id="heading">Learn More</span><button aria-labelledby="heading"></button>';
    expect(computeAccessibleName(htmlWithText, 'aria-labelledby="heading"', '')).toBe('Learn More');

    const htmlWithMissing = '<button aria-labelledby="nonexistent"></button>';
    expect(computeAccessibleName(htmlWithMissing, 'aria-labelledby="nonexistent"', '')).toBe('');
  });
});

describe.skipIf(!existsSync(dist))('built control names', () => {
  it('gives every link and button an accessible name', () => {
    for (const file of htmlFiles(dist)) {
      const html = removeExecutableElements(readFileSync(file, 'utf8'));
      const controls = /<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
      let match: RegExpExecArray | null;
      while ((match = controls.exec(html))) {
        const [, kind, attrs, content] = match;
        const accessibleName = computeAccessibleName(html, attrs, content);
        expect(accessibleName, `${file}: unnamed ${kind}`).toBeTruthy();
      }
    }
  });
});
