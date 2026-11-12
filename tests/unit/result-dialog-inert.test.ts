import { describe, expect, it } from 'vitest';
import { inertOutside } from '../../src/islands/gameresults';

interface FakeNode { name: string; inert: boolean; parentElement: FakeNode | null; children: FakeNode[] }
function node(name: string, children: FakeNode[] = [], inert = false): FakeNode {
  const created: FakeNode = { name, inert, parentElement: null, children };
  for (const child of children) child.parentElement = created;
  return created;
}

describe('result dialog keeps the page behind it unreachable', () => {
  it('makes every branch outside the dialog inert and restores them on close', () => {
    const overlay = node('overlay');
    const header = node('header');
    const main = node('main');
    const promo = node('promo', [], true);
    const island = node('island', [overlay, node('island-sibling')]);
    const body = node('body', [node('skip-link'), header, main, island, promo]);
    const html = node('html', [node('head'), body]);

    const restore = inertOutside(overlay, body);
    const outside = [...body.children.filter((child) => child !== island), island.children[1]!];
    for (const branch of outside) expect(branch.inert, branch.name).toBe(true);
    expect(overlay.inert).toBe(false);
    expect(island.inert).toBe(false);
    expect(html.children[0]!.inert).toBe(false);

    restore();
    for (const branch of outside) expect(branch.inert, branch.name).toBe(branch === promo);
  });
});
