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
function debugReferences(text: string, offset = 0, kind = ts.ScriptKind.TS): Logging[] {
  const source = ts.createSourceFile('source', text, ts.ScriptTarget.Latest, true, kind);
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
  if (extension !== '.astro') return debugReferences(text, 0, extension === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: Logging[] = [];
  const frontmatter = /^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (frontmatter) found.push(...debugReferences(frontmatter[1]!, 1));
  // Astro's inline scripts and processed module scripts are both source code.
  const markupStart = frontmatter?.[0].length ?? 0;
  const markup = text.slice(markupStart);
  const masked = markup.split('');
  const lower = markup.toLowerCase();

  let quote = '';
  let braces = 0;
  let i = 0;

  while (i < markup.length) {
    const char = markup[i]!;
    if (quote) {
      if (char === '\\') i++;
      else if (char === quote) quote = '';
      i++;
    } else if (braces > 0 && (char === '"' || char === "'" || char === '`')) {
      quote = char;
      i++;
    } else if (char === '{') {
      braces++;
      i++;
    } else if (char === '}') {
      braces = Math.max(0, braces - 1);
      i++;
    } else if (braces === 0 && markup.startsWith('<!--', i)) {
      const endComment = markup.indexOf('-->', i + 4);
      i = endComment === -1 ? markup.length : endComment + 3;
    } else if (braces === 0 && char === '<') {
      const match = /^<(script|style)\b/i.exec(markup.slice(i, i + 8));
      if (!match) {
        i++;
        continue;
      }
      const tagName = match[1]!.toLowerCase();
      // Attribute expressions may contain > inside a string, function or object.
      // Keep the complete opening tag for the template-expression AST below.
      let tagQuote = '';
      let tagBraces = 0;
      let at = i + match[0].length;
      for (; at < markup.length; at++) {
        const c = markup[at]!;
        if (tagQuote) {
          if (c === '\\') at++;
          else if (c === tagQuote) tagQuote = '';
        } else if (c === '"' || c === "'" || c === '`') tagQuote = c;
        else if (c === '{') tagBraces++;
        else if (c === '}') tagBraces = Math.max(0, tagBraces - 1);
        else if (c === '>' && tagBraces === 0) break;
      }
      const contentStart = Math.min(at + 1, markup.length);
      if (markup.slice(i, contentStart).trimEnd().endsWith('/>')) {
        i = contentStart;
        continue;
      }
      // Read HTML raw-text end-tag boundaries explicitly. HTML permits whitespace
      // and ignored attributes on an end tag, such as </script\t\n ignored>.
      const endName = `</${tagName}`;
      let close = lower.indexOf(endName, contentStart);
      while (close !== -1 && !/[\s/>]/.test(lower[close + endName.length] ?? '')) {
        close = lower.indexOf(endName, close + endName.length);
      }
      const closingEnd = close === -1 ? -1 : markup.indexOf('>', close + endName.length);
      const contentEnd = close === -1 ? markup.length : close;
      const end = closingEnd === -1 ? markup.length : closingEnd + 1;

      if (tagName === 'script') {
        const start = markupStart + contentStart;
        found.push(...debugReferences(markup.slice(contentStart, contentEnd), text.slice(0, start).split('\n').length - 1));
      }
      for (let index = contentStart; index < contentEnd; index++) {
        if (markup[index] !== '\n') masked[index] = ' ';
      }
      i = end;
    } else {
      i++;
    }
  }
  // JSX parsing also visits executable {...} expressions in Astro attributes and
  // templates, while ordinary element text remains JSX text rather than code.
  found.push(...debugReferences(`<>${masked.join('')}</>`, text.slice(0, markupStart).split('\n').length - 1, ts.ScriptKind.TSX));
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

  it('uses TypeScript grammar for generic arrows and angle-bracket assertions', () => {
    expect(scan('const identity = <T>(value: T) => value;\nconsole.log("leak");', '.ts'))
      .toEqual([{ line: 2, method: 'log' }]);
    expect(scan('const value = <number>1;\nconsole.debug(value);', '.ts'))
      .toEqual([{ line: 2, method: 'debug' }]);
    expect(scan('---\nconst identity = <T>(value: T) => value;\nconsole.log("server");\n---', '.astro'))
      .toEqual([{ line: 3, method: 'log' }]);
    expect(scan('const view = <p>console.log("text")</p>;\nconsole.debug("code");', '.tsx'))
      .toEqual([{ line: 2, method: 'debug' }]);
  });

  it('inspects Astro frontmatter and scripts, without treating markup as code', () => {
    expect(scan('---\nconsole.log("server");\n---\n<p>console.debug is documentation</p>\n<script>\nconsole.debug("client");\n</script>', '.astro'))
      .toEqual([{ line: 2, method: 'log' }, { line: 6, method: 'debug' }]);
    expect(scan('<p>console.log("ordinary text")</p>', '.astro')).toEqual([]);
    expect(scan('<p>{console.log("template")}</p>\n<button onClick={console.debug}>test</button>', '.astro'))
      .toEqual([{ line: 1, method: 'log' }, { line: 2, method: 'debug' }]);
  });

  it('reads raw-text end tags with whitespace and ignored attributes', () => {
    expect(scan('<script>console.log("client");</script\t\n ignored>\n<p>{console.debug("template")}</p>', '.astro'))
      .toEqual([{ line: 1, method: 'log' }, { line: 3, method: 'debug' }]);
    expect(scan('<style>.x { content: "console.log()"; }</style\t\n ignored>\n<p>{console.debug("template")}</p>', '.astro'))
      .toEqual([{ line: 3, method: 'debug' }]);
    expect(scan('<p>{"<style>"}{console.log("actual")}</p>', '.astro'))
      .toEqual([{ line: 1, method: 'log' }]);
  });

  it('inspects script opening attributes including self-closing set:html', () => {
    expect(scan('<script define:vars={{ value: console.log("server") }}>alert(value)</script>', '.astro'))
      .toEqual([{ line: 1, method: 'log' }]);
    expect(scan('<script set:html={console.debug("server")} />', '.astro'))
      .toEqual([{ line: 1, method: 'debug' }]);
    expect(scan('<script define:vars={{ value: ">", log: console.log("server") }}>alert(value)</script>', '.astro'))
      .toEqual([{ line: 1, method: 'log' }]);
    expect(scan('<script>const identity = <T>(value: T) => value;\nconsole.debug("client");</script>', '.astro'))
      .toEqual([{ line: 2, method: 'debug' }]);
  });

  it('contains no console.log or console.debug references in src', () => {
    // Deliberate build-time logging allowlist with specific reasons (Task 278).
    const allowlist: Record<string, string> = {
      'src/visuals/prunedrafts.ts:70': 'Build-time notification when draft anatomy models are pruned from dist',
    };
    const violations = files(sourceRoot).flatMap((path) => {
      const rel = `src/${relative(sourceRoot, path)}`;
      return scan(readFileSync(path, 'utf8'), extname(path))
        .filter(({ line }) => !allowlist[`${rel}:${line}`])
        .map(({ line, method }) => `${rel}:${line}: console.${method}`);
    });
    expect(violations, violations.join('\n')).toEqual([]);
  });
});
