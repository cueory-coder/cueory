import { describe, expect, it } from 'vitest';
import { createOpenAttemptGate } from '../../src/islands/anatomyopen';

describe('anatomy viewer opening gate', () => {
  it('accepts only one startup while the first is pending', () => {
    const gate = createOpenAttemptGate();
    const first = gate.begin();
    expect(first).toBe(1);
    expect(gate.begin()).toBeNull();
    expect(gate.isCurrent(first!)).toBe(true);
    gate.finish(first!);
    expect(gate.isCurrent(first!)).toBe(false);
    expect(gate.begin()).toBe(2);
  });

  it('permits a retry after the first attempt fails', () => {
    const gate = createOpenAttemptGate();
    const failed = gate.begin()!;
    gate.finish(failed);
    const retry = gate.begin()!;
    expect(retry).not.toBe(failed);
    expect(gate.isCurrent(retry)).toBe(true);
  });

  it('discards an asynchronous completion after unmount cancellation', async () => {
    const gate = createOpenAttemptGate();
    const opening = gate.begin()!;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const completion = pending.then(() => gate.isCurrent(opening));
    gate.cancel();
    release();
    await expect(completion).resolves.toBe(false);
    expect(gate.begin()).toBe(opening + 1);
  });

  it('does not let a late completion release a newer startup', () => {
    const gate = createOpenAttemptGate();
    const stale = gate.begin()!;
    gate.cancel();
    const current = gate.begin()!;
    gate.finish(stale);
    expect(gate.isCurrent(current)).toBe(true);
    expect(gate.begin()).toBeNull();
    gate.finish(current);
    expect(gate.begin()).toBe(current + 1);
  });
});
