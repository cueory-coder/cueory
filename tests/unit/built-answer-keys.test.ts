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
  function returned(expression: ts.Expression): boolean {
    let current: ts.Node = expression;
    while (current.parent && (ts.isParenthesizedExpression(current.parent) ||
      (ts.isConditionalExpression(current.parent) && current !== current.parent.condition))) current = current.parent;
    return !!current.parent && ((ts.isReturnStatement(current.parent) && current.parent.expression === current) ||
      (ts.isArrowFunction(current.parent) && current.parent.body === current));
  }
  function parameterReference(expression: ts.Expression, location: ts.Node): boolean {
    while (ts.isParenthesizedExpression(expression) || ts.isPropertyAccessExpression(expression)) expression = expression.expression;
    if (!ts.isIdentifier(expression)) return false;
    const name = expression.text;
    let owner: ts.Node | undefined = location.parent;
    while (owner && !ts.isFunctionLike(owner)) owner = owner.parent;
    return !!owner && ts.isFunctionLike(owner) && owner.parameters.some((parameter) =>
      ts.isIdentifier(parameter.name) && parameter.name.text === name);
  }
  function runtimeOverride(node: ts.ObjectLiteralExpression): boolean {
    // Only a returned update of a function parameter, never an array record, static spread,
    // or an object with content/id fields. The learning scorer also nests this under result.
    const spreads = node.properties.filter(ts.isSpreadAssignment);
    if (spreads.length !== 1 || !parameterReference(spreads[0]!.expression, node) ||
      node.properties.length < 2 || node.properties.length > 3 ||
      !node.properties.every((property) => ts.isSpreadAssignment(property) ||
        (ts.isPropertyAssignment(property) && ['correct', 'overruled'].includes(nameOf(property.name) ?? '')))) return false;
    if (returned(node)) return true;
    const parent = node.parent;
    return ts.isPropertyAssignment(parent) && nameOf(parent.name) === 'result' &&
      ts.isObjectLiteralExpression(parent.parent) && returned(parent.parent);
  }
  function runtimeValidation(node: ts.ObjectLiteralExpression): boolean {
    // A runtime checker call may pass a constant success flag alongside the same dynamic
    // key and rationales it is validating. A standalone object/array is never this envelope.
    if (node.properties.length !== 3 || !node.properties.every(ts.isPropertyAssignment) ||
      !ts.isCallExpression(node.parent) || !node.parent.arguments.includes(node)) return false;
    const fields = new Map(node.properties.filter(ts.isPropertyAssignment).map((property) =>
      [nameOf(property.name), property.initializer]));
    if (fields.size !== 3 || !['correct', 'key', 'rationales'].every((name) => fields.has(name))) return false;
    const key = fields.get('key')!, rationales = fields.get('rationales')!;
    if (!ts.isPropertyAccessExpression(key) || key.name.text !== 'key' || !ts.isIdentifier(key.expression) ||
      !ts.isPropertyAccessExpression(rationales) || rationales.name.text !== 'rationales' ||
      !ts.isIdentifier(rationales.expression) || rationales.expression.text !== key.expression.text) return false;
    const sourceIdentifier = key.expression.text;
    let owner: ts.Node | undefined = node.parent;
    while (owner && !ts.isFunctionLike(owner)) owner = owner.parent;
    return !!owner && node.parent.arguments.some((argument) => ts.isPropertyAccessExpression(argument) &&
      argument.name.text === 'key' && ts.isIdentifier(argument.expression) && argument.expression.text === sourceIdentifier);
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
        if (!runtimeValidation(node) && !runtimeOverride(node)) found.add(name!);
      }
      if (normalized === 'key' && ts.isArrayLiteralExpression(property.initializer)) found.add('key');
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
    ['C7 static metadata spread', 'const metadata={id:"sample"};const questions=[{...metadata,correct:true}];', true],
    ['C7 dynamic sibling key', 'const questions=[{id:"sample",correct:true,key:runtimeKey}];', true],
    ['normalized uppercase key', 'const item={KEY:["[sample]"]};', true],
    ['a standalone validation-shaped record', 'function data(n){return [{correct:true,key:n.key,rationales:n.rationales}]};', true],
    ['a local static spread inside a function', 'function data(){const old={id:"sample"};return {...old,correct:true}}', true],
    ['a parameter spread in a question array', 'function data(old){return [{...old,correct:true}]}', true],
    ['an override with content fields', 'function data(old){return {...old,id:"sample",correct:true}}', true],
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
    expect(shippedKeys('function validate(n){return check(n.question,n.key,{correct:!0,key:n.key,rationales:n.rationales})}')).toEqual([]);
    expect(shippedKeys('function overrule(old){return {...old,result:{...old.result,correct:!0,overruled:!0}}}')).toEqual([]);
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
