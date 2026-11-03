import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const sourceRoot = fileURLToPath(new URL('../../src/', import.meta.url));
type Logging = { line: number; method: string };

function isConsole(node: ts.Expression): boolean {
  if (ts.isIdentifier(node)) return node.text === 'console';
  return ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)
    && node.expression.text === 'globalThis' && node.name.text === 'console';
}

/** Inspect property references too, so saving console.log in a callback cannot bypass the guard. */
function debugReferences(text: string, offset = 0): Logging[] {
  const source = ts.createSourceFile('source.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: Logging[] = [];
  function visit(node: ts.Node) {
    let method: string | undefined;
    if (ts.isPropertyAccessExpression(node) && isConsole(node.expression)) method = node.name.text;
    if (ts.isElementAccessExpression(node) && isConsole(node.expression) && node.argumentExpression
        && ts.isStringLiteralLike(node.argumentExpression)) method = node.argumentExpression.text;
    if (method === 'log' || method === 'debug') {
      found.push({ line: offset + source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, method });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return found;
}

function scan(text: string, extension: string): Logging[] {
  if (extension !== '.astro') return debugReferences(text);
  const found: Logging[] = [];
  const frontmatter = /^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (frontmatter) found.push(...debugReferences(frontmatter[1]!, 1));
  // Astro's inline scripts and processed module scripts are both source code.
  const markupStart = frontmatter?.[0].length ?? 0;
  const markup = text.slice(markupStart);
  // JSX parsing also visits executable {...} expressions in Astro attributes and
  // templates, while ordinary element text remains JSX text rather than code.
  const expressions = markup.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
    (block) => block.replace(/[^\n]/g, ' '));
  found.push(...debugReferences(`<>${expressions}</>`, text.slice(0, markupStart).split('\n').length - 1));
  for (const match of markup.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    const start = markupStart + match.index! + match[0].indexOf('>') + 1;
    found.push(...debugReferences(match[1]!, text.slice(0, start).split('\n').length - 1));
  }
  return found;
}

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : /\.(?:[cm]?js|tsx?|astro)$/.test(entry.name) ? [path] : [];
  });
}

describe('debug-console source guard', () => {
  it('finds direct, optional, bracket and callback references with accurate lines', () => {
    expect(scan('console.log("debug");\nconsole?.debug("debug");\nconsole["log"]("debug");\nconst callback = globalThis.console.debug;', '.ts'))
      .toEqual([{ line: 1, method: 'log' }, { line: 2, method: 'debug' }, { line: 3, method: 'log' }, { line: 4, method: 'debug' }]);
  });

  it('ignores comments, strings and unrelated properties and preserves deliberate warnings', () => {
    expect(scan('// console.log("comment")\nconst help = "console.debug";\nconsole.warn("unavailable");\nconsole.error("failed");\nlogger.log("other API");', '.ts'))
      .toEqual([]);
  });

  it('inspects Astro frontmatter and scripts, without treating markup as code', () => {
    expect(scan('---\nconsole.log("server");\n---\n<p>console.debug is documentation</p>\n<script>\nconsole.debug("client");\n</script>', '.astro'))
      .toEqual([{ line: 2, method: 'log' }, { line: 6, method: 'debug' }]);
    expect(scan('<p>console.log("ordinary text")</p>', '.astro')).toEqual([]);
    expect(scan('<p>{console.log("template")}</p>\n<button onClick={console.debug}>test</button>', '.astro'))
      .toEqual([{ line: 1, method: 'log' }, { line: 2, method: 'debug' }]);
  });

  it('contains no console.log or console.debug references in src', () => {
    // No log/debug exceptions are needed. Operational warn/error calls are outside
    // this rule and remain available for deliberate failure reporting.
    const violations = files(sourceRoot).flatMap((path) => scan(readFileSync(path, 'utf8'), extname(path))
      .map(({ line, method }) => `src/${relative(sourceRoot, path)}:${line}: console.${method}`));
    expect(violations, violations.join('\n')).toEqual([]);
  });
});
