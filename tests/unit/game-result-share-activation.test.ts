import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

const hooks = vi.hoisted(() => ({
  states: [] as unknown[], refs: [] as { current: unknown }[],
  stateAt: 0, refAt: 0, mounting: true,
  effects: [] as (() => void | (() => void))[],
  image: vi.fn<() => Promise<File | null>>(),
}));

// Run actual click handlers and sharing helpers. DOM focus is covered by the browser suite.
vi.mock('react', () => ({
  useState: (initial: unknown) => {
    const at = hooks.stateAt++;
    if (!(at in hooks.states)) hooks.states[at] = typeof initial === 'function' ? initial() : initial;
    return [hooks.states[at], (next: unknown) => {
      hooks.states[at] = typeof next === 'function' ? next(hooks.states[at]) : next;
    }];
  },
  useRef: (initial: unknown) => {
    const at = hooks.refAt++;
    return hooks.refs[at] ?? (hooks.refs[at] = { current: initial });
  },
  useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
    if (hooks.mounting && deps.length === 0) hooks.effects.push(effect);
  },
}));
vi.mock('../../src/islands/share', async (original) => ({
  ...await original<typeof import('../../src/islands/share')>(),
  createStoryFile: hooks.image,
}));

import GameResultsHost from '../../src/islands/GameResultsHost';
import { showResultCard, takePendingResultCards, type GameResultCard } from '../../src/islands/gameresults';

const cleanups: (() => void)[] = [];
const card: GameResultCard = {
  game: 'pulse', name: 'pillo', date: 'nov 11', result: '4 / 6',
  summary: '[sample result]', stats: [], path: '/play/pillo',
};
function render() {
  hooks.stateAt = 0; hooks.refAt = 0;
  return GameResultsHost();
}
function button(node: unknown, name: string): ReactElement<{ children?: unknown; onClick: () => void; 'aria-label'?: string }> | undefined {
  if (Array.isArray(node)) {
    for (const child of node) { const found = button(child, name); if (found) return found; }
    return;
  }
  if (!node || typeof node !== 'object' || !('props' in node)) return;
  const element = node as ReactElement<{ children?: unknown; onClick: () => void; 'aria-label'?: string }>;
  if (element.type === 'button' && (element.props['aria-label'] ?? element.props.children) === name) return element;
  return button(element.props.children, name);
}
function click(name: string) {
  const control = button(render(), name);
  expect(control, name).toBeDefined();
  control!.props.onClick();
}
function mount(nativeShare: ((data: ShareData) => Promise<void>) | undefined) {
  const target = Object.assign(new EventTarget(), { location: { origin: 'https://cueory.app' } });
  const copy = vi.fn(async (_text: string) => undefined);
  vi.stubGlobal('window', target);
  vi.stubGlobal('document', { activeElement: null });
  vi.stubGlobal('HTMLElement', class {});
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => { callback(); return 0; });
  vi.stubGlobal('navigator', { share: nativeShare, canShare: () => true, clipboard: { writeText: copy } });
  render(); hooks.mounting = false;
  for (const effect of hooks.effects) { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); }
  showResultCard(card);
  return copy;
}
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  takePendingResultCards();
  hooks.states.length = 0; hooks.refs.length = 0; hooks.effects.length = 0;
  hooks.stateAt = 0; hooks.refAt = 0; hooks.mounting = true;
  hooks.image.mockReset(); vi.unstubAllGlobals();
});

describe('result-host native share activation', () => {
  it('restores the original page control after an open result is replaced', () => {
    mount(undefined);
    click('close results');
    const opener = Object.assign(new HTMLElement(), { focus: vi.fn() });
    const dialogControl = Object.assign(new HTMLElement(), { focus: vi.fn() });
    Reflect.set(document, 'activeElement', opener);
    showResultCard(card);
    Reflect.set(document, 'activeElement', dialogControl);
    showResultCard({ ...card, result: '1 / 6' });
    click('close results');
    expect(opener.focus).toHaveBeenCalledTimes(1);
    expect(dialogControl.focus).not.toHaveBeenCalled();
  });

  it('captures a new page control when the dialog opens again after closing', () => {
    mount(undefined);
    click('close results');
    const first = Object.assign(new HTMLElement(), { focus: vi.fn() });
    const second = Object.assign(new HTMLElement(), { focus: vi.fn() });
    Reflect.set(document, 'activeElement', first);
    showResultCard(card);
    click('close results');
    Reflect.set(document, 'activeElement', second);
    showResultCard(card);
    click('close results');
    expect(first.focus).toHaveBeenCalledTimes(1);
    expect(second.focus).toHaveBeenCalledTimes(1);
  });

  it('prepares once, then calls native share only from a fresh second click', async () => {
    let active = true;
    const native = vi.fn(async (_data: ShareData) => { if (!active) throw new DOMException('expired activation', 'NotAllowedError'); });
    const copy = mount(native);
    let finish!: (file: File) => void;
    hooks.image.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    click('share');
    expect(native).not.toHaveBeenCalled();
    active = false;
    finish(new File(['[sample image]'], 'result.png', { type: 'image/png' }));
    await Promise.resolve(); await Promise.resolve();
    expect(native).not.toHaveBeenCalled();
    expect(copy).not.toHaveBeenCalled();
    active = true;
    click('share image');
    expect(native).toHaveBeenCalledTimes(1);
    expect(native.mock.calls[0]![0].files).toHaveLength(1);
    expect(hooks.image).toHaveBeenCalledTimes(1);
  });

  it('does not launch a hidden result after closing during image preparation', async () => {
    const native = vi.fn(async (_data: ShareData) => undefined);
    const copy = mount(native);
    let finish!: (file: File) => void;
    hooks.image.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    click('share'); click('close results');
    finish(new File(['[sample image]'], 'result.png', { type: 'image/png' }));
    await Promise.resolve(); await Promise.resolve();
    expect(render()).toBeNull();
    expect(native).not.toHaveBeenCalled();
    expect(copy).not.toHaveBeenCalled();
  });

  it('copies immediately without image preparation when native sharing is absent', async () => {
    const copy = mount(undefined);
    click('share');
    expect(copy).toHaveBeenCalledWith('pillo · nov 11 · 4 / 6 · cueory.app');
    expect(hooks.image).not.toHaveBeenCalled();
  });

  it('discards prepared work when another result replaces the visible card', async () => {
    const native = vi.fn(async (_data: ShareData) => undefined);
    const copy = mount(native);
    let finish!: (file: File) => void;
    hooks.image.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    click('share');
    showResultCard({ ...card, result: '1 / 6' });
    finish(new File(['[sample image]'], 'result.png', { type: 'image/png' }));
    await Promise.resolve(); await Promise.resolve();
    expect(button(render(), 'share image')).toBeUndefined();
    expect(button(render(), 'share')).toBeDefined();
    expect(native).not.toHaveBeenCalled();
    expect(copy).not.toHaveBeenCalled();
  });
});
