import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { dailyGames, gameName } from '../../src/config/games';

/**
 * The games' names are plain for now and will change again (D-66), so every name a visitor sees must come from
 * src/config/games.ts. This guard (D-67) fails when a page, component or island shows an internal id (`cueword`,
 * `triage`, `suture`, `pulse`) as words, or writes a share line with a game's name typed in.
 */

const root = fileURLToPath(new URL('../../', import.meta.url));
const ids: string[] = dailyGames.map((game) => game.id);
const names: string[] = dailyGames.map((game) => game.name);

/** Every .ts, .tsx and .astro file under src/, as a path from the project root. */
function sourceFiles(folder = join(root, 'src')): string[] {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|astro)$/.test(name) ? [relative(root, path)] : [];
  });
}

function literals(code: string): string[] {
  return [...code.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map(
    (match) => match[1] ?? match[2] ?? match[3] ?? '',
  );
}

/** A piece of text from a source file, and whether it sits in markup (text between tags, or a visible attribute). */
interface Piece {
  text: string;
  markup: boolean;
}

/** Attributes whose words a visitor sees or a screen reader reads out. */
const VISIBLE_ATTRIBUTES = /\b(aria-label|aria-description|aria-roledescription|aria-valuetext|title|alt|placeholder)=(["'])((?:(?!\2)[^\n])*)\2/g;

/**
 * The text in a source file that a visitor could see: string literals, and in .tsx and .astro files the text between
 * tags and the values of visible attributes (aria-label, title, alt, placeholder…). Comments, code, and anything inside
 * `{…}` in markup are left out.
 */
function visibleText(path: string, source: string): Piece[] {
  let code = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/(^|[\s;{}(),])\/\/.*$/gm, '$1');
  const pieces: Piece[] = [];
  const fromCode = (texts: string[]) => texts.map((text) => ({ text, markup: false }));
  if (path.endsWith('.astro') && code.startsWith('---')) {
    // The frontmatter is code: only its string literals count.
    const end = code.indexOf('---', 3);
    if (end > 0) {
      pieces.push(...fromCode(literals(code.slice(0, end))));
      code = code.slice(end + 3);
    }
  }
  pieces.push(...fromCode(literals(code)));
  if (/\.(tsx|astro)$/.test(path)) {
    for (const match of code.matchAll(VISIBLE_ATTRIBUTES)) pieces.push({ text: match[3]!, markup: true });
    for (const [, text] of code.matchAll(/>([^<>]*)</g)) {
      // Only markup text: code between a `>` and a `<` (comparisons, generics) has `=` or `;` in it.
      const words = text!.replace(/\{[^{}]*\}/g, ' ');
      if (!/[=;]/.test(words)) pieces.push({ text: words, markup: true });
    }
  }
  return pieces;
}

/**
 * What a piece of visible text gets wrong: an internal id used as a word ("triage needs JavaScript.", or `triage`
 * alone between tags), not as an id in code ('triage', triage-term, ./triage), or a share line with a game's name
 * typed in ("cueory sort, …").
 */
function problems(pieces: Piece[]): string[] {
  const found = new Set<string>();
  const shareLine = new RegExp(`\\bcueory (${[...ids, ...names].join('|')})\\b`);
  for (const { text, markup } of pieces) {
    const typed = shareLine.exec(text);
    if (typed) found.add(`a share line typed with "${typed[1]}"`);
    // A bare id in code is an id, like getCollection('triage'); in markup it is a word on the page.
    if (!markup && ids.includes(text)) continue;
    for (const id of ids) {
      if (new RegExp(`(^|[\\s(])${id}(?=$|[\\s,.:;!?)])`).test(text)) found.add(`the id "${id}" as words`);
    }
  }
  return [...found];
}

const check = (path: string, source: string) => problems(visibleText(path, source));

describe('game names come only from src/config/games.ts (D-66, D-67)', () => {
  it('gives every game a lowercase name of its own', () => {
    expect(new Set(names).size).toBe(dailyGames.length);
    for (const game of dailyGames) {
      expect(game.name).toMatch(/^[a-z][a-z0-9 ]*$/);
      expect(gameName(game.id)).toBe(game.name);
    }
  });

  it('ignores ids, class names, imports, comments and names read from the settings', () => {
    const island = [
      "import { startTriage } from './triage';",
      "const triage = dailyGames.find((game) => game.id === 'triage');",
      '// triage needs a comment, which nobody sees',
      '<p className="triage-term" data-testid="triage-live">{triage.name} needs JavaScript.</p>',
      '<li className={`pulse-${mark}`}>{mark}</li>',
      "return `cueory ${gameName('triage')}, ${day}: sorted.`;",
    ].join('\n');
    expect(check('Island.tsx', island)).toEqual([]);
    const page = "---\nconst suture = dailyGames.find((game) => game.id === 'suture');\n---\n<h2>{suture.name}</h2>";
    expect(check('page.astro', page)).toEqual([]);
  });

  it('spots an internal id shown as words, and a share line with a name typed in', () => {
    expect(check('Island.tsx', '<p>triage needs JavaScript.</p>')).toEqual(['the id "triage" as words']);
    // A bare id is a word on the page when it stands alone in markup or in a visible attribute (Codex on #54).
    expect(check('Island.tsx', '<h2>triage</h2>')).toEqual(['the id "triage" as words']);
    expect(check('Island.tsx', '<button type="button">\n  suture\n</button>')).toEqual(['the id "suture" as words']);
    expect(check('page.astro', '---\n---\n<section aria-label="cueword">')).toEqual(['the id "cueword" as words']);
    expect(check('Island.tsx', '<div data-testid="triage" className="triage">')).toEqual([]);
    expect(check('page.astro', '---\n---\n<noscript>suture needs it</noscript>')).toEqual(['the id "suture" as words']);
    expect(check('game.ts', "setSaid('cueword (a sample) is ready');")).toEqual(['the id "cueword" as words']);
    expect(check('game.ts', 'return `cueory sort, ${day}: sorted.`;')).toEqual(['a share line typed with "sort"']);
    expect(check('game.ts', 'return `cueory triage, ${day}: sorted.`;')).toEqual([
      'a share line typed with "triage"',
      'the id "triage" as words',
    ]);
  });

  it('finds no page, component or island that shows an id as words or types a name into a share line', () => {
    const found = sourceFiles()
      .filter((path) => !['src/config/games.ts', 'src/content.config.ts'].includes(path))
      .flatMap((path) =>
        check(path, readFileSync(join(root, path), 'utf8')).map(
          (problem) => `${path}: ${problem}. Read the name with gameName() from src/config/games.ts instead.`,
        ),
      );
    expect(found).toEqual([]);
  });
});
