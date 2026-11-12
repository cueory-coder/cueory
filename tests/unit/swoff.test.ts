/** W07: exercise the switched-off worker's actual install and activate handlers. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cacheName } from '../../src/scripts/offlineplan';

type EventStub = { waitUntil(work: Promise<unknown>): void };

async function runOffWorker(existing: string[] = []) {
  vi.resetModules();
  const names = new Set(existing);
  const listeners = new Map<string, ((event: EventStub) => void)[]>();
  const order: string[] = [];
  let skips = 0;
  let unregisters = 0;

  vi.stubGlobal('self', {
    skipWaiting: async () => { skips += 1; },
    registration: { unregister: async () => { order.push('unregister'); unregisters += 1; return true; } },
    addEventListener: (type: string, listener: (event: EventStub) => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
  });
  vi.stubGlobal('caches', {
    keys: async () => [...names],
    delete: async (name: string) => { order.push('delete:' + name); return names.delete(name); },
  });

  await import('../../src/scripts/swoff');

  async function dispatch(type: 'install' | 'activate') {
    const lifetime: Promise<unknown>[] = [];
    for (const listener of listeners.get(type) ?? []) {
      listener({ waitUntil: (work) => lifetime.push(work) });
    }
    await Promise.all(lifetime);
  }

  return {
    dispatch, names, order, listeners,
    get skips() { return skips; },
    get unregisters() { return unregisters; },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('swoff.ts disables offline storage', () => {
  it('takes over immediately and never installs a fetch handler', async () => {
    const worker = await runOffWorker();
    expect([...worker.listeners.keys()].sort()).toEqual(['activate', 'install']);
    await worker.dispatch('install');
    expect(worker.skips).toBe(1);
  });

  it('deletes every Cueory offline cache before unregistering, leaving other caches alone', async () => {
    const own = [cacheName('old'), cacheName('current'), cacheName('new')];
    const worker = await runOffWorker([...own, 'cueory-offline', 'other-app', 'cueory-offlineX']);
    await worker.dispatch('activate');
    expect(worker.order).toEqual([...own.map((name) => 'delete:' + name), 'unregister']);
    expect([...worker.names]).toEqual(['cueory-offline', 'other-app', 'cueory-offlineX']);
    expect(worker.unregisters).toBe(1);
  });

  it('unregisters even if there were no copies to delete', async () => {
    const worker = await runOffWorker(['other-app']);
    await worker.dispatch('activate');
    expect([...worker.names]).toEqual(['other-app']);
    expect(worker.order).toEqual(['unregister']);
    expect(worker.unregisters).toBe(1);
  });

  it('does not delete anything outside the exact, case-sensitive cache prefix', async () => {
    const worker = await runOffWorker([
      cacheName('one'), 'Cueory-offline-two', 'cueory-offline', 'cueory-offlineX', 'cueory-study-three',
    ]);
    await worker.dispatch('activate');
    expect(worker.order).toEqual(['delete:' + cacheName('one'), 'unregister']);
    expect([...worker.names]).toEqual([
      'Cueory-offline-two', 'cueory-offline', 'cueory-offlineX', 'cueory-study-three',
    ]);
  });
});
