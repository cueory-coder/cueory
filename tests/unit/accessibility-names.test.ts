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

function visibleText(markup: string): string {
  return markup
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:nbsp|amp|lt|gt|quot|#39);/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

describe.skipIf(!existsSync(dist))('built control names', () => {
  it('gives every link and button an accessible name', () => {
    for (const file of htmlFiles(dist)) {
      const html = readFileSync(file, 'utf8').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
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
