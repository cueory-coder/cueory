import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/** Inspect serialized data, not words in copy or runtime reads of an RPC response. */
function shippedKeys(text: string, javascript = true): string[] {
  const found = new Set<string>();
  const seenJson = new Set<string>();
  const nameOf = (name: ts.PropertyName): string | undefined => {
    if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) return name.text;
    if (ts.isComputedPropertyName(name) && ts.isStringLiteralLike(name.expression)) return name.expression.text;
    return undefined;
  };
  function literal(node: ts.Expression): boolean {
    if (ts.isParenthesizedExpression(node)) return literal(node.expression);
    if (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node) ||
        [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(node.kind)) return true;
    // Minifiers encode booleans as !0 / !1 and may negate numeric constants.
    if (ts.isPrefixUnaryExpression(node)) return literal(node.operand);
    if (ts.isArrayLiteralExpression(node)) return node.elements.every((item) => ts.isExpression(item) && literal(item));
    if (ts.isObjectLiteralExpression(node)) return node.properties.every((property) =>
      ts.isPropertyAssignment(property) && nameOf(property.name) !== undefined && literal(property.initializer));
    return false;
  }
  function inspectObject(node: ts.ObjectLiteralExpression) {
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      const name = nameOf(property.name);
      const normalized = name?.replace(/[-_]/g, '').toLowerCase();
      if (!normalized || !['answerkey', 'correct', 'rationale', 'rationales', 'key'].includes(normalized)) continue;
      // Test only candidate fields: walking every unrelated literal subtree repeatedly is quadratic.
      if (!literal(property.initializer)) continue;
      if (['answerkey', 'rationale', 'rationales'].includes(normalized)) found.add(name!);
      if (normalized === 'correct') {
        // Runtime sample checking uses dynamic RPC-shaped fields; learning-mode overruling spreads a result.
        const runtimeResult = node.properties.some((other) => ts.isPropertyAssignment(other) &&
          ['key', 'rationales'].includes(nameOf(other.name) ?? '') && !literal(other.initializer));
        if (!runtimeResult && !node.properties.some(ts.isSpreadAssignment)) found.add(name!);
      }
      if (name === 'key' && ts.isArrayLiteralExpression(property.initializer)) found.add('key');
    }
  }

  function inspectJson(value: string, depth: number) {
    if (depth > 8 || seenJson.has(value) || !/^[\s]*[\[{]/.test(value)) return;
    seenJson.add(value);
    try {
      // JSON validity avoids treating ordinary prose or shader strings as object data.
      JSON.parse(value);
      inspectJs(`(${value})`, depth + 1);
    } catch { /* Not serialized JSON. */ }
  }
  function inspectJs(sourceText: string, depth = 0) {
    const source = ts.createSourceFile('built.js', sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    function visit(node: ts.Node) {
      if (ts.isObjectLiteralExpression(node)) inspectObject(node);
      if (ts.isStringLiteralLike(node)) inspectJson(node.text, depth);
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  if (javascript) inspectJs(text);
  else {
    // Hidden answer pages are still public HTML. Match hooks and headings, not privacy-page prose.
    if (/\bdata-(?:worksheet-answers|answer-key)\b/i.test(text) ||
        /<h[1-6]\b[^>]*>\s*answer\s+key\s*<\/h[1-6]>/i.test(text)) found.add('answer-key markup');
    for (const match of text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
      inspectJs(match[1]!);
      inspectJson(match[1]!, 0);
    }
    const decode = (value: string) => value.replace(/&(?:quot|apos|amp|lt|gt|#\d+|#x[\da-f]+);/gi, (entity) => {
      const names: Record<string, string> = { '&quot;': '"', '&apos;': "'", '&amp;': '&', '&lt;': '<', '&gt;': '>' };
      if (Object.hasOwn(names, entity.toLowerCase())) return names[entity.toLowerCase()]!;
      const hex = entity.toLowerCase().startsWith('&#x');
      const code = Number.parseInt(entity.slice(hex ? 3 : 2, -1), hex ? 16 : 10);
      return code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    });
    // Astro's props are HTML-escaped JSON, often with [type, value] tuple wrappers.
    for (const match of text.matchAll(/\s[\w:-]+\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      inspectJson(decode(match[1] ?? match[2] ?? ''), 0);
    }
  }
  return [...found].sort();
}

function assets(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? assets(path) : ['.html', '.js'].includes(extname(path)) ? [path] : [];
  });
}

describe('built answer-key guard (T16)', () => {
  it.each([
    ['a literal correctness field', 'const items = [{id:"sample", correct:true}];', true],
    ['a mixed dynamic identifier', 'const item={id:currentId,correct:true};', true],
    ['a key beside a dynamic identifier', 'const item={id:currentId,key:["a"]};', true],
    ['a rationale added to another record', 'const item={...other,rationale:"[sample]"};', true],
    ['minified booleans', 'const items=[{correct:!0}];', true],
    ['quoted and computed field names', 'const items=[{"rationale":"[sample]",["correct"]:false}];', true],
    ['an answer-key property', 'const data={answer_key:["a"]};', true],
    ['a question key array', 'const data={key:["a"]};', true],
    ['nested serialized JSON', 'const text=JSON.stringify({rationales:{a:"[sample]"}});', true],
    ['JSON.parse payload', 'JSON.parse(\'{"correct":true}\');', true],
    ['JSON script payload', '<script type="application/json">{"correct":true}</script>', false],
    ['hydrated props', '<astro-island props="{&quot;items&quot;:[1,[[0,{&quot;correct&quot;:[0,true]}]]]}"></astro-island>', false],
    ['numeric HTML entities', '<div data-items="{&#34;rationale&#34;:&#34;[sample]&#34;}"></div>', false],
    ['hidden answer markup', '<section hidden data-worksheet-answers>sample</section>', false],
    ['an answer-key heading', '<h2 class="text-lg">answer key</h2>', false],
  ])('rejects %s', (_name, text, javascript) => {
    expect(shippedKeys(text as string, javascript as boolean).length).toBeGreaterThan(0);
  });

  it('allows runtime RPC mapping, calculated scores and privacy copy without a filename allowlist', () => {
    expect(shippedKeys('function result(reply){return {correct:reply.correct,key:reply.key,rationales:reply.rationales}}')).toEqual([]);
    expect(shippedKeys('function validate(n){return {correct:!0,key:n.key,rationales:n.rationales}}')).toEqual([]);
    expect(shippedKeys('function score(a,b){return {correct:a===b}}')).toEqual([]);
    expect(shippedKeys('function overrule(old){return {...old,correct:!0}}')).toEqual([]);
    expect(shippedKeys('<p>The saved state never holds the answer key or a rationale.</p>', false)).toEqual([]);
  });

  const dist = join(process.cwd(), 'dist');
  const files = assets(dist); // Missing dist is a failure: run npm run build first.
  it('finds built HTML and JavaScript to inspect', () => {
    expect(files.some((file) => file.endsWith('.html'))).toBe(true);
    expect(files.some((file) => file.endsWith('.js'))).toBe(true);
  });

  // One case per asset keeps failures attributable without raising or disabling time limits.
  it.each(files.map((file) => [relative(dist, file), file]))('ships no static answer-key payload in %s', (_name, file) => {
    const leaks = shippedKeys(readFileSync(file!, 'utf8'), extname(file!) === '.js');
    // Only paths and field names are reported; leaked answer values never enter test logs.
    expect(leaks).toEqual([]);
  });
});
