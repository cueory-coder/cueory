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
  function record(method: string | undefined, node: ts.Node) {
    if (method === 'log' || method === 'debug') {
      found.push({ line: offset + source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, method });
    }
  }

  function visit(node: ts.Node) {
    let method: string | undefined;
    if (ts.isPropertyAccessExpression(node) && isConsole(node.expression)) method = node.name.text;
    if (ts.isElementAccessExpression(node) && isConsole(node.expression) && node.argumentExpression
        && ts.isStringLiteralLike(node.argumentExpression)) method = node.argumentExpression.text;
    record(method, node);

    // Destructuring: const { log, debug: report } = console;
    if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && node.initializer && isConsole(node.initializer)) {
      for (const element of node.name.elements) {
        if (ts.isBindingElement(element)) {
          const propName = element.propertyName
            ? (ts.isIdentifier(element.propertyName) ? element.propertyName.text : ts.isStringLiteralLike(element.propertyName) ? element.propertyName.text : undefined)
            : (ts.isIdentifier(element.name) ? element.name.text : undefined);
          record(propName, element);
        }
      }
    }

    // Destructuring assignment: ({ log, debug: report } = console);
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isObjectLiteralExpression(node.left) && isConsole(node.right)) {
      for (const prop of node.left.properties) {
        if (ts.isShorthandPropertyAssignment(prop)) {
          record(prop.name.text, prop);
        } else if (ts.isPropertyAssignment(prop)) {
          const propName = ts.isIdentifier(prop.name) ? prop.name.text : ts.isStringLiteralLike(prop.name) ? prop.name.text : undefined;
          record(propName, prop);
        }
      }
    }

    ts.forEachChild(node, visit);
  }
  visit(source);
  return found;
}

function isRegexStart(text: string, index: number): boolean {
  let prev = index - 1;
  while (prev >= 0 && /\s/.test(text[prev]!)) prev--;
  if (prev < 0) return true;
  const prevChar = text[prev]!;
  if ((prevChar === '+' || prevChar === '-') && prev > 0 && text[prev - 1] === prevChar) return false;
  if ('(,=:[!&|?{};~^%*+-<>'.includes(prevChar)) return true;
  let wordEnd = prev + 1;
  let wordStart = prev;
  while (wordStart >= 0 && /[a-zA-Z0-9_$]/.test(text[wordStart]!)) wordStart--;
  wordStart++;
  const word = text.slice(wordStart, wordEnd);
  const keywords = ['return', 'case', 'throw', 'yield', 'typeof', 'void', 'delete', 'instanceof', 'in', 'of'];
  return keywords.includes(word);
}

function isComparisonOperator(text: string, index: number): boolean {
  let prev = index - 1;
  while (prev >= 0 && /\s/.test(text[prev]!)) prev--;
  if (prev < 0) return false;
  const prevChar = text[prev]!;
  if (!/[a-zA-Z0-9_$)\]'"`]/.test(prevChar)) return false;
  if (/[a-zA-Z0-9_$]/.test(prevChar)) {
    let wordEnd = prev + 1;
    let wordStart = prev;
    while (wordStart >= 0 && /[a-zA-Z0-9_$]/.test(text[wordStart]!)) wordStart--;
    wordStart++;
    const word = text.slice(wordStart, wordEnd);
    const exprKeywords = ['return', 'case', 'throw', 'yield', 'typeof', 'void', 'delete', 'await'];
    if (exprKeywords.includes(word)) return false;
  }
  return true;
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

  let inTag = false;
  let attrQuote = '';
  let exprQuote = '';
  let inRegex = false;
  let braces = 0;
  let exprTags = 0;
  let inExprTag = false;
  let exprTagQuote = '';
  let i = 0;

  function inspectRawElement() {
    const match = /^<(script|style)\b/i.exec(markup.slice(i, i + 8));
    if (!match) {
      i++;
      return;
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
        if (tagBraces > 0 && c === '\\') at++;
        else if (c === tagQuote) tagQuote = '';
      } else if (tagBraces > 0 && markup.startsWith('/*', at)) {
        const end = markup.indexOf('*/', at + 2);
        at = end === -1 ? markup.length : end + 1;
      } else if (tagBraces > 0 && markup.startsWith('//', at)) {
        const end = markup.indexOf('\n', at + 2);
        at = end === -1 ? markup.length : end;
      } else if (tagBraces > 0 && (c === '"' || c === "'" || c === '`')) tagQuote = c;
      else if (tagBraces === 0 && (c === '"' || c === "'")) tagQuote = c;
      else if (c === '{') tagBraces++;
      else if (c === '}') tagBraces = Math.max(0, tagBraces - 1);
      else if (c === '>' && tagBraces === 0) break;
    }
    const contentStart = Math.min(at + 1, markup.length);
    if (markup.slice(i, contentStart).trimEnd().endsWith('/>')) {
      i = contentStart;
      return;
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
  }

  function handleExpressionChar(c: string) {
    if (inExprTag) {
      if (exprTagQuote) {
        if (c === exprTagQuote) exprTagQuote = '';
        i++;
      } else if (c === '"' || c === "'") {
        exprTagQuote = c;
        i++;
      } else if (markup.startsWith('/>', i)) {
        inExprTag = false;
        exprTags = Math.max(0, exprTags - 1);
        i += 2;
      } else if (c === '>') {
        inExprTag = false;
        i++;
      } else {
        i++;
      }
      return;
    }

    if (exprTags > 0) {
      if (c === '<') {
        if (/^<(?:script|style)\b/i.test(markup.slice(i, i + 8))) {
          inspectRawElement();
        } else if (markup.startsWith('</', i)) {
          exprTags = Math.max(0, exprTags - 1);
          inExprTag = true;
          i += 2;
        } else if (/^<[a-zA-Z]/i.test(markup.slice(i, i + 2))) {
          exprTags++;
          inExprTag = true;
          i++;
        } else if (markup.startsWith('<>', i)) {
          exprTags++;
          i += 2;
        } else if (markup.startsWith('</>', i)) {
          exprTags = Math.max(0, exprTags - 1);
          i += 3;
        } else {
          i++;
        }
      } else if (c === '{') {
        braces++;
        i++;
      } else {
        i++;
      }
      return;
    }

    if (exprQuote) {
      if (c === '\\') i++;
      else if (c === exprQuote) exprQuote = '';
      i++;
    } else if (inRegex) {
      if (c === '\\') {
        i += 2;
      } else if (c === '[') {
        i++;
        while (i < markup.length) {
          const rc = markup[i]!;
          if (rc === '\\') i += 2;
          else if (rc === ']') { i++; break; }
          else if (rc === '\n') break;
          else i++;
        }
      } else if (c === '/') {
        inRegex = false;
        i++;
      } else {
        i++;
      }
    } else if (markup.startsWith('/*', i)) {
      const end = markup.indexOf('*/', i + 2);
      i = end === -1 ? markup.length : end + 2;
    } else if (markup.startsWith('//', i)) {
      const end = markup.indexOf('\n', i + 2);
      i = end === -1 ? markup.length : end + 1;
    } else if (c === '"' || c === "'" || c === '`') {
      exprQuote = c;
      i++;
    } else if (c === '/' && isRegexStart(markup, i)) {
      inRegex = true;
      i++;
    } else if (c === '<') {
      if (isComparisonOperator(markup, i)) {
        i++;
      } else if (/^<(?:script|style)\b/i.test(markup.slice(i, i + 8))) {
        inspectRawElement();
      } else if (markup.startsWith('</', i)) {
        inExprTag = true;
        i += 2;
      } else if (/^<[a-zA-Z]/i.test(markup.slice(i, i + 2))) {
        exprTags++;
        inExprTag = true;
        i++;
      } else if (markup.startsWith('<>', i)) {
        exprTags++;
        i += 2;
      } else {
        i++;
      }
    } else if (c === '{') {
      braces++;
      i++;
    } else if (c === '}') {
      braces = Math.max(0, braces - 1);
      i++;
    } else {
      i++;
    }
  }

  while (i < markup.length) {
    const char = markup[i]!;

    if (inTag) {
      if (attrQuote) {
        if (char === attrQuote) attrQuote = '';
        i++;
      } else if (braces > 0) {
        handleExpressionChar(char);
      } else if (char === '"' || char === "'") {
        attrQuote = char;
        i++;
      } else if (char === '{') {
        braces++;
        i++;
      } else if (char === '>') {
        inTag = false;
        i++;
      } else {
        i++;
      }
    } else {
      // Outside a tag
      if (braces > 0) {
        handleExpressionChar(char);
      } else if (char === '{') {
        braces++;
        i++;
      } else if (markup.startsWith('<!--', i)) {
        const endComment = markup.indexOf('-->', i + 4);
        const commentEnd = endComment === -1 ? markup.length : endComment + 3;
        for (let index = i; index < commentEnd; index++) {
          if (markup[index] !== '\n') masked[index] = ' ';
        }
        i = commentEnd;
      } else if (char === '<') {
        const match = /^<(script|style)\b/i.exec(markup.slice(i, i + 8));
        if (match) {
          inspectRawElement();
        } else {
          inTag = true;
          i++;
        }
      } else {
        i++;
      }
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
    expect(scan('const { log } = console;\nconst { debug: report } = globalThis.console;\n({ log } = console);\n({ debug: renamed } = console);', '.ts'))
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

  it('tracks quoted markup attributes without misinterpreting literal braces as expressions', () => {
    expect(scan('<p title="{">Text</p><script>console.log("actual")</script>', '.astro'))
      .toEqual([{ line: 1, method: 'log' }]);
    expect(scan('<p title="}">Text</p><script>console.debug("actual")</script>', '.astro'))
      .toEqual([{ line: 1, method: 'debug' }]);
    expect(scan('<!-- {console.log("comment")} -->\n<p>{console.debug("actual")}</p>', '.astro'))
      .toEqual([{ line: 2, method: 'debug' }]);
    expect(scan("{/* don't render this */}\n<script>console.log('actual')</script>", '.astro'))
      .toEqual([{ line: 2, method: 'log' }]);
    expect(scan("<script define:vars={{ /* don't fail */ val: console.debug('server') }}>alert(val)</script>", '.astro'))
      .toEqual([{ line: 1, method: 'debug' }]);
    expect(scan("{// don't fail\nconsole.log('actual')}", '.astro'))
      .toEqual([{ line: 2, method: 'log' }]);
    expect(scan('{true && <script is:inline>console.log("actual")</script>}', '.astro'))
      .toEqual([{ line: 1, method: 'log' }]);
    expect(scan("{ /'/.test('hello') }\n<script>console.log('actual')</script>", '.astro'))
      .toEqual([{ line: 2, method: 'log' }]);
    expect(scan('{count++ / 2}<script>console.log("actual")</script>', '.astro'))
      .toEqual([{ line: 1, method: 'log' }]);
    expect(scan('{count-- / 2}<script>console.log("actual")</script>', '.astro'))
      .toEqual([{ line: 1, method: 'log' }]);
    expect(scan('<p title="C:\\">Text</p><script>console.log("actual")</script>', '.astro'))
      .toEqual([{ line: 1, method: 'log' }]);
    expect(scan('<script title="C:\\">console.log("actual")</script>', '.astro'))
      .toEqual([{ line: 1, method: 'log' }]);
    expect(scan('{true && <p>don\'t</p>}<script>console.log("actual")</script>', '.astro'))
      .toEqual([{ line: 1, method: 'log' }]);
    expect(scan('{count<limit}<script>console.log("actual")</script>', '.astro'))
      .toEqual([{ line: 1, method: 'log' }]);
    expect(scan('{count < limit}<script>console.log("actual")</script>', '.astro'))
      .toEqual([{ line: 1, method: 'log' }]);
    expect(scan('{(() => { return <script is:inline>console.log("actual")</script> })()}', '.astro'))
      .toEqual([{ line: 1, method: 'log' }]);
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
