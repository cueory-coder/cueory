import { describe, expect, it } from 'vitest';
import { createAnatomyOpenGate } from '../../src/islands/anatomyopen';

describe('Anatomy Lab lazy startup gate', () => {
  it('coalesces rapid open taps and permits a retry after the current attempt settles', () => {
    const gate = createAnatomyOpenGate();
    const first = gate.begin();
    expect(first).not.toBeNull();
    expect(gate.current(first!)).toBe(true);
    expect(gate.begin()).toBeNull();
    gate.finish(first!);
    expect(gate.current(first!)).toBe(false);
    const retry = gate.begin();
    expect(retry).not.toBeNull();
    expect(retry).not.toBe(first);
    expect(gate.current(retry!)).toBe(true);
  });

  it('invalidates an import that resolves after the viewer unmounts', async () => {
    const gate = createAnatomyOpenGate();
    const attempt = gate.begin()!;
    let resolveImport!: () => void;
    const importReady = new Promise<void>((resolve) => { resolveImport = resolve; });
    const setup = (async () => {
      await importReady;
      return gate.current(attempt) ? 'create scene' : 'cancelled';
    })();
    gate.unmount();
    resolveImport();
    expect(await setup).toBe('cancelled');
    expect(gate.current(attempt)).toBe(false);
    expect(gate.begin()).toBeNull();
  });

  it('does not let an old completion unlock a newer opening after remount', () => {
    const gate = createAnatomyOpenGate();
    const stale = gate.begin()!;
    gate.unmount();
    gate.mount();
    const current = gate.begin()!;
    gate.finish(stale);
    expect(gate.current(current)).toBe(true);
    expect(gate.begin()).toBeNull();
    gate.finish(current);
    expect(gate.begin()).not.toBeNull();
  });

  it('invalidates a pending frame and supports the development effect replay', async () => {
    const gate = createAnatomyOpenGate();
    const stale = gate.begin()!;
    const work = Promise.resolve().then(() => gate.current(stale));
    gate.unmount();
    gate.mount();
    expect(await work).toBe(false);
    expect(gate.current(stale)).toBe(false);
    const next = gate.begin()!;
    expect(gate.current(next)).toBe(true);
  });
});
