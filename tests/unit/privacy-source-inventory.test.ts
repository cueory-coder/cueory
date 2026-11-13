/** Source-first guard: a new key/table must have a visible privacy disclosure. */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../src/', import.meta.url));
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? sources(path) : /\.(?:ts|tsx|astro)$/.test(path) ? [path] : [];
  });
}

export function inventory(text: string): { keys: string[]; tables: string[] } {
  const ast = ts.createSourceFile('source.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const keys = new Set<string>();
  const tables = new Set<string>();
  function literal(node: ts.Node | undefined): string | undefined {
    return node && ts.isStringLiteralLike(node) ? node.text : undefined;
  }
  function visit(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && /key|prefix/i.test(node.name.getText(ast))) {
      const value = literal(node.initializer);
      if (value?.startsWith('cueory-')) keys.add(value);
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const value = literal(node.arguments[0]);
      if (value && ['getItem', 'setItem', 'removeItem'].includes(node.expression.name.text)) keys.add(value);
      if (value && node.expression.name.text === 'from') tables.add(value);
    }
    if (ts.isTypeAliasDeclaration(node) && /Table$/.test(node.name.text)) {
      function members(type: ts.TypeNode): void {
        if (ts.isUnionTypeNode(type)) type.types.forEach(members);
        else if (ts.isLiteralTypeNode(type) && ts.isStringLiteral(type.literal)) tables.add(type.literal.text);
      }
      members(node.type);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return { keys: [...keys].sort(), tables: [...tables].sort() };
}

const privacy = readFileSync(join(root, 'pages/privacy.astro'), 'utf8');
const found = sources(root).map((file) => ({ file, ...inventory(readFileSync(file, 'utf8')) }));

describe('source data kinds have privacy disclosures', () => {
  for (const key of new Set(found.flatMap((entry) => entry.keys))) {
    it(`discloses storage key ${key}`, () => {
      expect(privacy, `missing visible disclosure for ${key}`).toContain(key);
    });
  }
  for (const table of new Set(found.flatMap((entry) => entry.tables))) {
    it(`classifies database table ${table}`, () => {
      expect(privacy).toContain(`data-privacy-table="${table}"`);
    });
  }
  it('discovers new adapter keys and database tables without editing the inventory', () => {
    expect(inventory("const NEW_STORAGE_KEY = 'cueory-new'; store.setItem('custom-key', 'x'); client.from('new_table'); type ReadTable = 'other_table' | 'third_table';")).toEqual({
      keys: ['cueory-new', 'custom-key'], tables: ['new_table', 'other_table', 'third_table'],
    });
  });
  it('does not treat comment examples and download names as stored data', () => {
    expect(inventory("// store.setItem('fake', 'x')\nconst filename = 'cueory-data.json';")).toEqual({ keys: [], tables: [] });
  });
});
