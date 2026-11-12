import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
const guide = readFileSync(new URL('../../docs/CONTENT-FORMAT.md', import.meta.url), 'utf8');
const readme = readFileSync(new URL('../../content/README.md', import.meta.url), 'utf8');
function variables(): Map<string, ts.Expression> {
  const vars = new Map<string, ts.Expression>();
  for (const path of ['../../src/content.config.ts', '../../src/videos/schema.ts']) {
    const file = new URL(path, import.meta.url);
    const ast = ts.createSourceFile(file.pathname, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    for (const stmt of ast.statements) if (ts.isVariableStatement(stmt))
      for (const decl of stmt.declarationList.declarations)
        if (ts.isIdentifier(decl.name) && decl.initializer) vars.set(decl.name.text, decl.initializer);
  }
  return vars;
}
function name(p: ts.PropertyName): string {
  if (ts.isIdentifier(p) || ts.isStringLiteral(p)) return p.text;
  throw new Error('Unsupported schema property name');
}
function field(obj: ts.ObjectLiteralExpression, key: string): ts.Expression {
  const p = obj.properties.find((x) => ts.isPropertyAssignment(x) && name(x.name) === key);
  if (!p || !ts.isPropertyAssignment(p)) throw new Error('Missing schema field: ' + key);
  return p.initializer;
}
function paths(expr: ts.Expression, vars: Map<string, ts.Expression>): string[] {
  const out = new Set<string>();
  function walk(e: ts.Expression, path = '', optional = false, include = true, stack = new Set<string>()): void {
    if (ts.isParenthesizedExpression(e)) return walk(e.expression, path, optional, include, stack);
    if (ts.isIdentifier(e) && vars.has(e.text)) {
      if (stack.has(e.text)) throw new Error('Schema alias cycle: ' + e.text);
      return walk(vars.get(e.text)!, path, optional, include, new Set([...stack, e.text]));
    }
    const add = () => { if (include && path && !path.endsWith('[]')) out.add(path + (optional ? '?' : '')); };
    if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression)) {
      const op = e.expression.name.text, receiver = e.expression.expression;
      if (op === 'optional') return walk(receiver, path, true, include, stack);
      if (op === 'object') {
        add();
        const shape = e.arguments[0];
        if (!shape || !ts.isObjectLiteralExpression(shape)) throw new Error('Invalid z.object: ' + path);
        for (const p of shape.properties) {
          if (ts.isShorthandPropertyAssignment(p)) {
            walk(p.name, path ? path + '.' + p.name.text : p.name.text, false, true, stack);
            continue;
          }
          if (!ts.isPropertyAssignment(p)) throw new Error('Unsupported Zod object field');
          walk(p.initializer, path ? path + '.' + name(p.name) : name(p.name), false, true, stack);
        }
        return;
      }
      if (op === 'array') {
        add();
        if (!e.arguments[0]) throw new Error('Missing array item');
        return walk(e.arguments[0], path + '[]', false, false, stack);
      }
      if (op === 'tuple' || op === 'partialRecord' || op === 'record') { add(); return; }
      return walk(receiver, path, optional, include, stack);
    }
    add();
  }
  walk(expr);
  return [...out].sort();
}
function schemas(): Map<string, string[]> {
  const vars = variables(), exported = vars.get('collections');
  if (!exported || !ts.isObjectLiteralExpression(exported)) throw new Error('Missing collections');
  const result = new Map<string, string[]>();
  for (const item of exported.properties) {
    let key: string, ref: string;
    if (ts.isShorthandPropertyAssignment(item)) key = ref = item.name.text;
    else if (ts.isPropertyAssignment(item) && ts.isIdentifier(item.initializer)) {
      key = name(item.name); ref = item.initializer.text;
    } else throw new Error('Unexpected collection entry');
    const c = vars.get(ref);
    if (!c || !ts.isCallExpression(c)) throw new Error('Missing collection ' + ref);
    const options = c.arguments[0];
    if (!options || !ts.isObjectLiteralExpression(options)) throw new Error('Missing collection options');
    result.set(key, paths(field(options, 'schema'), vars));
  }
  return result;
}
function index(): Map<string, string[]> {
  const block = guide.split('<!-- FIELD-INDEX: START -->')[1]?.split('<!-- FIELD-INDEX: END -->')[0];
  if (!block) throw new Error('Missing field index');
  const out = new Map<string, string[]>();
  for (const line of block.split('\n')) {
    const match = line.match(/^\| `([^`]+)` \| (.+) \|$/);
    if (!match) continue;
    if (out.has(match[1])) throw new Error('Duplicate collection row');
    out.set(match[1], [...match[2].matchAll(/`([^`]+)`/g)].map((m) => m[1]).sort());
  }
  return out;
}
function keys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap((x) => keys(x, prefix + '[]'));
  return Object.entries(value).flatMap(([k, v]) => {
    const path = prefix ? prefix + '.' + k : k;
    return k === 'rationales' ? [path] : [path, ...keys(v, path)];
  });
}
const headingToCollection: Record<string, string> = {
  Lessons: 'lessons', 'Card decks': 'cards', Organizer: 'organizer', 'Fill-in': 'fill-in',
  'Label it': 'label-it', Questions: 'questions', 'Sample games': 'pulse', Videos: 'videos',
};
describe('content format guide', () => {
  it('names every actual schema field, and no extra field', () => {
    const actual = schemas(), documented = index();
    expect([...documented.keys()].sort()).toEqual([...actual.keys()].sort());
    for (const [collection, fields] of actual) expect(documented.get(collection), collection).toEqual(fields);
  });
  it('uses schema field names in every example', () => {
    const actual = schemas();
    let section = '', snippet = '', reading = false, examples = 0;
    for (const line of guide.split('\n')) {
      const heading = line.match(/^#{2,3} (.+)$/);
      if (heading) section = headingToCollection[heading[1]] ?? '';
      if (line === '```json') {
        if (!section) throw new Error('Unknown example section');
        reading = true; snippet = '';
      } else if (reading && line === '```') {
        const listed = actual.get(section);
        if (!listed) throw new Error('Missing schema for example');
        for (const key of keys(JSON.parse(snippet))) {
          expect(listed.includes(key) || listed.includes(key + '?'), section + '.' + key).toBe(true);
        }
        examples++; reading = false;
      } else if (reading) snippet += line + '\n';
    }
    expect(reading).toBe(false);
    expect(examples).toBe(8);
  });
  it('links the short guide to the full reference and checker', () => {
    expect(readme).toContain('../docs/CONTENT-FORMAT.md');
    expect(readme).toContain('node scripts/check-content.mjs');
  });
});
