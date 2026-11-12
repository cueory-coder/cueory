import { describe, expect, it, vi } from 'vitest';
import { inertOutside, lockPageScroll } from '../../src/islands/gameresults';

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


describe('result dialog locks the page behind it', () => {
  it('uses an iOS-safe fixed-body lock and restores the exact inline state once', () => {
    const root = { style: { overflow: 'clip', overscrollBehavior: 'contain' } };
    const body = {
      style: {
        position: 'relative',
        top: '2px',
        left: '3px',
        right: '4px',
        width: '90%',
        overflow: 'auto',
        overscrollBehavior: 'auto',
      },
    };
    const scrollTo = vi.fn();
    const view = { scrollX: 12, scrollY: 345, scrollTo };

    const restore = lockPageScroll(root, body, view);
    expect(root.style).toEqual({ overflow: 'hidden', overscrollBehavior: 'none' });
    expect(body.style).toEqual({
      position: 'fixed',
      top: '-345px',
      left: '-12px',
      right: '0',
      width: '100%',
      overflow: 'hidden',
      overscrollBehavior: 'none',
    });

    restore();
    expect(root.style).toEqual({ overflow: 'clip', overscrollBehavior: 'contain' });
    expect(body.style).toEqual({
      position: 'relative',
      top: '2px',
      left: '3px',
      right: '4px',
      width: '90%',
      overflow: 'auto',
      overscrollBehavior: 'auto',
    });
    expect(scrollTo).toHaveBeenCalledOnce();
    expect(scrollTo).toHaveBeenCalledWith(12, 345);

    restore();
    expect(scrollTo).toHaveBeenCalledOnce();
  });
});
